#!/usr/bin/env python3
"""Inventarizira Dabar OAI-PMH metapodatke bez preuzimanja datoteka ili PII polja."""

from __future__ import annotations

import argparse
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from threading import Lock

from build_academic_repository_registry import build_registry, validate_registry


OAI_NS = "http://www.openarchives.org/OAI/2.0/"
DC_NS = "http://purl.org/dc/elements/1.1/"
LEVEL_MARKERS = (
    ("specijalist", "specijalisticki"),
    ("doktor", "doktorski"),
    ("disertac", "doktorski"),
    ("doctoral", "doktorski"),
    ("diplomski", "diplomski"),
    ("master", "diplomski"),
    ("graduate thesis", "diplomski"),
    ("zavrsni", "zavrsni"),
    ("bachelor", "zavrsni"),
    ("undergraduate", "zavrsni"),
    ("prvostupni", "zavrsni"),
    ("final thesis", "zavrsni"),
)
HEADERS = {"User-Agent": "Lekta metadata inventory/1.0", "Accept": "application/xml,text/xml;q=0.9"}


def plain(value: str) -> str:
    import unicodedata
    normalized = unicodedata.normalize("NFD", value or "")
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)).lower()


def thesis_level(types: list[str]) -> str | None:
    value = plain(" ".join(types))
    for marker, level in LEVEL_MARKERS:
        if marker in value:
            return level
    return None


def parse_page(
    xml_text: str,
    allowed_namespaces: set[str] | None = None,
    publisher_filter: str | None = None,
) -> tuple[dict, str | None]:
    root = ET.fromstring(xml_text)
    counts = Counter()
    levels = Counter()
    for record in root.findall(f".//{{{OAI_NS}}}record"):
        header = record.find(f"{{{OAI_NS}}}header")
        if header is None or header.get("status") == "deleted":
            continue
        identifier = header.findtext(f"{{{OAI_NS}}}identifier", default="")
        tail = identifier.rsplit(":", 1)[-1]
        namespace = re.sub(r"_\d+$", "", tail).lower()
        if allowed_namespaces and namespace not in allowed_namespaces:
            continue
        metadata = record.find(f"{{{OAI_NS}}}metadata")
        if metadata is None:
            continue
        if publisher_filter:
            publishers = " ".join(
                node.text or "" for node in metadata.findall(f".//{{{DC_NS}}}publisher")
            )
            if plain(publisher_filter) not in plain(publishers):
                continue
        types = [node.text or "" for node in metadata.findall(f".//{{{DC_NS}}}type")]
        level = thesis_level(types)
        if not level:
            continue
        rights = " ".join(node.text or "" for node in metadata.findall(f".//{{{DC_NS}}}rights"))
        counts["thesisRecords"] += 1
        counts["openAccess"] += int("semantics/openaccess" in rights.lower())
        levels[level] += 1
    token_node = root.find(f".//{{{OAI_NS}}}resumptionToken")
    token = (token_node.text or "").strip() if token_node is not None else ""
    return {**counts, "byLevel": dict(sorted(levels.items()))}, token or None


def oai_url(host: str, token: str | None, from_date: str | None) -> str:
    if token:
        query = urllib.parse.urlencode({"verb": "ListRecords", "resumptionToken": token})
    else:
        params = {"verb": "ListRecords", "metadataPrefix": "oai_dc"}
        if from_date:
            params["from"] = from_date
        query = urllib.parse.urlencode(params)
    return f"https://{host}/oai?{query}"


@lru_cache(maxsize=256)
def _fetch_page(url: str, timeout: int = 45) -> str:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content = response.read(10 * 1024 * 1024 + 1)
        if len(content) > 10 * 1024 * 1024:
            raise ValueError("OAI odgovor prelazi sigurnosni limit od 10 MiB")
        return content.decode("utf-8", "replace")


FETCH_LOCKS = defaultdict(Lock)


def fetch_page(url: str, timeout: int = 45) -> str:
    with FETCH_LOCKS[url]:
        return _fetch_page(url, timeout)


def add_counts(total: dict, page: dict) -> None:
    total["thesisRecords"] += page.get("thesisRecords", 0)
    total["openAccess"] += page.get("openAccess", 0)
    for level, count in page.get("byLevel", {}).items():
        total["byLevel"][level] += count


def inventory_unit(unit: dict, max_pages: int, from_date: str | None) -> dict:
    result = {
        "unitId": unit["id"],
        "mappingStatus": unit["mappingStatus"],
        "repositories": [],
        "totals": {"thesisRecords": 0, "openAccess": 0, "byLevel": defaultdict(int)},
    }
    for host in unit["hosts"]:
        repository = {
            "host": host,
            "status": "ok",
            "pages": 0,
            "thesisRecords": 0,
            "openAccess": 0,
            "byLevel": defaultdict(int),
        }
        token = None
        try:
            while repository["pages"] < max_pages:
                xml_text = fetch_page(oai_url(host, token, from_date if token is None else None))
                page, token = parse_page(
                    xml_text,
                    set(unit["pidNamespaces"]),
                    unit.get("publisherFilters", {}).get(host),
                )
                add_counts(repository, page)
                repository["pages"] += 1
                if not token:
                    break
        except Exception as exc:  # noqa: BLE001
            repository["status"] = "unavailable"
            repository["errorType"] = type(exc).__name__
        repository["byLevel"] = dict(sorted(repository["byLevel"].items()))
        add_counts(result["totals"], repository)
        result["repositories"].append(repository)
    result["totals"]["byLevel"] = dict(sorted(result["totals"]["byLevel"].items()))
    return result


def run_inventory(
    registry: dict,
    max_pages: int,
    from_date: str | None,
    unit_filter: set[str] | None = None,
    workers: int = 6,
) -> dict:
    units = [unit for institution in registry["institutions"] for unit in institution["units"]]
    if unit_filter:
        unknown = unit_filter - {unit["id"] for unit in units}
        if unknown:
            raise ValueError(f"Nepoznati unitId: {sorted(unknown)}")
        units = [unit for unit in units if unit["id"] in unit_filter]
    with ThreadPoolExecutor(max_workers=workers) as executor:
        results = list(executor.map(lambda unit: inventory_unit(unit, max_pages, from_date), units))
    return {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "scope": "metadata-only",
        "policy": {
            "downloadsFiles": False,
            "storesRecordIdentifiers": False,
            "storesTitlesAuthorsOrEmails": False,
            "fullTextRightsApproved": False,
        },
        "summary": {
            "units": len(results),
            "mapped": sum(item["mappingStatus"] == "mapped" for item in results),
            "unmapped": sum(item["mappingStatus"] != "mapped" for item in results),
            "repositoriesUnavailable": sum(
                repo["status"] != "ok" for item in results for repo in item["repositories"]
            ),
            "thesisRecordsObserved": sum(item["totals"]["thesisRecords"] for item in results),
            "openAccess": sum(item["totals"]["openAccess"] for item in results),
        },
        "units": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--max-pages", type=int, default=1)
    parser.add_argument("--from-date", default="2024-01-01")
    parser.add_argument("--unit", action="append", default=[])
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    if not 1 <= args.max_pages <= 25:
        parser.error("--max-pages mora biti između 1 i 25")
    if not 1 <= args.workers <= 8:
        parser.error("--workers mora biti između 1 i 8")
    registry = build_registry(args.root)
    validate_registry(registry, args.root)
    report = run_inventory(
        registry,
        args.max_pages,
        args.from_date or None,
        set(args.unit) or None,
        args.workers,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
