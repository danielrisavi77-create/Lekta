#!/usr/bin/env python3
"""Preuzima iskljucivo rucno odobrene Dabar PDF objekte u privremeni direktorij."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

from build_academic_repository_registry import build_registry, validate_registry
from inventory_academic_repositories import DC_NS, OAI_NS
from inventory_academic_rights import access_status, license_class, rights_urls


MAX_DOCUMENTS = 10
OAI_IDENTIFIER = re.compile(r"^oai:([^:]+):([a-z0-9-]+)_(\d+)$", re.I)
REVIEW_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "application/pdf,application/xml,text/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "hr-HR,hr;q=0.9,en;q=0.6",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}


def object_key(identifier: str) -> str:
    return hashlib.sha256(identifier.encode("utf-8")).hexdigest()[:16]


def registry_units(registry: dict) -> dict[str, dict]:
    return {
        unit["id"]: unit
        for institution in registry["institutions"]
        for unit in institution["units"]
    }


def parse_identifier(identifier: str) -> tuple[str, str, str]:
    match = OAI_IDENTIFIER.fullmatch(identifier)
    if not match:
        raise ValueError("oaiIdentifier nema podrzani Dabar oblik")
    host, namespace, number = match.groups()
    return host.lower(), namespace.lower(), f"{namespace.lower()}:{number}"


def validate_evidence_url(url: str, host: str, pid: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or (parsed.hostname or "").lower() != host:
        raise ValueError("evidenceUrl mora biti HTTPS stranica istog Dabar repozitorija")
    path = urllib.parse.unquote(parsed.path).rstrip("/")
    if path not in (f"/islandora/object/{pid}", f"/object/{pid}"):
        raise ValueError("evidenceUrl mora pokazivati tocno odobreni Dabar objekt")


def validate_manifest(data: dict, registry: dict) -> list[dict]:
    if data.get("version") != 1 or not isinstance(data.get("objects"), list):
        raise ValueError("Manifest mora imati version 1 i polje objects")
    units = registry_units(registry)
    seen: set[str] = set()
    approved: list[dict] = []
    for index, item in enumerate(data["objects"]):
        if not isinstance(item, dict):
            raise ValueError(f"objects[{index}] mora biti objekt")
        identifier = str(item.get("oaiIdentifier", ""))
        key = object_key(identifier)
        if identifier in seen:
            raise ValueError(f"Duplikat odobrenog objekta {key}")
        seen.add(identifier)
        host, namespace, pid = parse_identifier(identifier)
        unit_id = str(item.get("unitId", ""))
        unit = units.get(unit_id)
        if not unit or host not in unit["hosts"] or namespace not in unit["pidNamespaces"]:
            raise ValueError(f"Objekt {key} nije u sluzbenom registru za navedenu sastavnicu")
        if str(item.get("host", "")).lower() != host:
            raise ValueError(f"Objekt {key} ima host koji se ne podudara s OAI identifikatorom")
        license_url = str(item.get("licenseUrl", ""))
        if license_class("open", [license_url]) != "permissive-license-candidate":
            raise ValueError(f"Objekt {key} nema podrzanu permisivnu licencu")
        if item.get("reviewStatus") != "approved":
            raise ValueError(f"Objekt {key} nije rucno odobren")
        reviewed_by = str(item.get("reviewedBy", "")).strip()
        reviewed_at = str(item.get("reviewedAt", ""))
        if not reviewed_by:
            raise ValueError(f"Objekt {key} nema reviewedBy")
        if not REVIEW_DATE.fullmatch(reviewed_at):
            raise ValueError(f"Objekt {key} nema valjani reviewedAt")
        try:
            review_date = date.fromisoformat(reviewed_at)
        except ValueError as exc:
            raise ValueError(f"Objekt {key} nema valjani reviewedAt") from exc
        if review_date > date.today():
            raise ValueError(f"Objekt {key} ima reviewedAt u buducnosti")
        validate_evidence_url(str(item.get("evidenceUrl", "")), host, pid)
        approved.append({**item, "_host": host, "_pid": pid, "_key": key})
    return approved


def fetch_bytes(url: str, host: str, max_bytes: int, accept_pdf: bool) -> bytes:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=45) as response:
        final_host = (urllib.parse.urlparse(response.geturl()).hostname or "").lower()
        if final_host != host:
            raise ValueError("Preusmjeravanje izvan odobrenog hosta nije dopusteno")
        length = response.headers.get("Content-Length")
        if length and int(length) > max_bytes:
            raise ValueError("Datoteka prelazi dopustenu velicinu")
        data = response.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError("Datoteka prelazi dopustenu velicinu")
    if accept_pdf and not data.startswith(b"%PDF"):
        raise ValueError("Dohvaceni sadrzaj nije PDF")
    return data


def verify_live_rights(item: dict) -> None:
    query = urllib.parse.urlencode({
        "verb": "GetRecord",
        "metadataPrefix": "oai_dc",
        "identifier": item["oaiIdentifier"],
    })
    xml_data = fetch_bytes(f"https://{item['_host']}/oai/?{query}", item["_host"], 2 * 1024 * 1024, False)
    root = ET.fromstring(xml_data)
    record = root.find(f".//{{{OAI_NS}}}record")
    if record is None:
        raise ValueError("OAI zapis vise nije dostupan")
    rights = [node.text or "" for node in record.findall(f".//{{{DC_NS}}}rights")]
    urls = rights_urls(rights)
    if access_status(rights) != "open" or item["licenseUrl"] not in urls:
        raise ValueError("Aktualni OAI zapis vise ne potvrduje odobreni pristup i licencu")
    if license_class("open", urls) != "permissive-license-candidate":
        raise ValueError("Aktualni OAI zapis sadrzi dodatno ogranicenje licence")


def candidate_urls(host: str, pid: str) -> list[str]:
    encoded = urllib.parse.quote(pid, safe=":")
    return [
        f"https://{host}/islandora/object/{encoded}/datastream/PDF",
        f"https://{host}/islandora/object/{encoded}/datastream/PDF/download",
        f"https://{host}/object/{encoded}/FILE0",
    ]


def download_one(item: dict, output: Path, max_file_bytes: int) -> Path:
    verify_live_rights(item)
    last_error: Exception | None = None
    for url in candidate_urls(item["_host"], item["_pid"]):
        try:
            data = fetch_bytes(url, item["_host"], max_file_bytes, True)
            path = output / f"{item['_key']}.pdf"
            path.write_bytes(data)
            return path
        except Exception as exc:  # noqa: BLE001
            last_error = exc
    raise ValueError(f"PDF nije dostupan kroz podrzane Dabar putanje: {type(last_error).__name__}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--max-documents", type=int, default=10)
    parser.add_argument("--max-file-size-mb", type=int, default=50)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.max_documents <= MAX_DOCUMENTS:
        parser.error(f"--max-documents mora biti izmedu 1 i {MAX_DOCUMENTS}")
    if not 1 <= args.max_file_size_mb <= 50:
        parser.error("--max-file-size-mb mora biti izmedu 1 i 50")
    registry = build_registry(args.root)
    validate_registry(registry, args.root)
    data = json.loads(args.manifest.read_text(encoding="utf-8"))
    approved = validate_manifest(data, registry)
    if args.validate_only:
        print(f"Manifest valjan: {len(approved)} rucno odobrenih objekata")
        return
    selected = approved[: args.max_documents]
    if not selected:
        raise SystemExit("Nema rucno odobrenih objekata. Build nije pokrenut.")
    args.out.mkdir(parents=True, exist_ok=True)
    for item in selected:
        path = download_one(item, args.out, args.max_file_size_mb * 1024 * 1024)
        print(f"Preuzet odobreni objekt {item['_key']} ({path.stat().st_size} bajtova)")
    print(f"Preuzeto {len(selected)} od najvise {args.max_documents} odobrenih objekata")


if __name__ == "__main__":
    main()
