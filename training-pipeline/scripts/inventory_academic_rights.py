#!/usr/bin/env python3
"""Razvrstava prava OAI-PMH zapisa bez preuzimanja datoteka ili javnog spremanja PID-a."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from build_academic_repository_registry import build_registry, validate_registry
from inventory_academic_repositories import DC_NS, OAI_NS, fetch_page, oai_url, plain, thesis_level


ACCESS_MARKERS = (
    ("semantics/openaccess", "open"),
    ("semantics/embargoedaccess", "embargoed"),
    ("semantics/restrictedaccess", "restricted"),
    ("semantics/closedaccess", "closed"),
)
CC_RE = re.compile(r"^https?://creativecommons\.org/(?:licenses|publicdomain)/", re.I)
PERMISSIVE_RE = re.compile(
    r"^https?://creativecommons\.org/(?:licenses/by/[^/]+|publicdomain/(?:zero|mark)/[^/]+)/?$",
    re.I,
)
INC_RE = re.compile(r"^https?://rightsstatements\.org/vocab/InC(?:/|$)", re.I)


def access_status(rights: list[str]) -> str:
    joined = " ".join(rights).lower()
    for marker, status in ACCESS_MARKERS:
        if marker in joined:
            return status
    return "unknown"


def rights_urls(rights: list[str]) -> list[str]:
    return sorted({value.strip() for value in rights if value.strip().lower().startswith(("http://", "https://"))})


def license_class(access: str, urls: list[str]) -> str:
    if access != "open":
        return "not-open-access"
    cc_urls = [url for url in urls if CC_RE.match(url)]
    if any(not PERMISSIVE_RE.fullmatch(url) for url in cc_urls):
        return "conditional-license-review"
    if any(PERMISSIVE_RE.fullmatch(url) for url in urls):
        return "permissive-license-candidate"
    if any(INC_RE.match(url) for url in urls):
        return "in-copyright-review"
    return "no-explicit-license"


def parse_rights_page(
    xml_text: str,
    allowed_namespaces: set[str],
    publisher_filter: str | None = None,
) -> tuple[Counter, list[dict], str | None]:
    root = ET.fromstring(xml_text)
    counts = Counter()
    candidates = []
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
        rights = [node.text or "" for node in metadata.findall(f".//{{{DC_NS}}}rights")]
        access = access_status(rights)
        urls = rights_urls(rights)
        classification = license_class(access, urls)
        counts[classification] += 1
        counts[f"access:{access}"] += 1
        if classification == "permissive-license-candidate":
            candidates.append({
                "oaiIdentifier": identifier,
                "identifierHash": hashlib.sha256(identifier.encode("utf-8")).hexdigest()[:16],
                "level": level,
                "access": access,
                "licenseUrls": [url for url in urls if PERMISSIVE_RE.fullmatch(url)],
                "reviewStatus": "pending",
            })
    token_node = root.find(f".//{{{OAI_NS}}}resumptionToken")
    token = (token_node.text or "").strip() if token_node is not None else ""
    return counts, candidates, token or None


def inventory_unit_rights(unit: dict, max_pages: int, from_date: str | None) -> tuple[dict, list[dict]]:
    result = {"unitId": unit["id"], "mappingStatus": unit["mappingStatus"], "repositories": []}
    private_candidates = []
    for host in unit["hosts"]:
        repository = {"host": host, "status": "ok", "pages": 0, "counts": Counter()}
        token = None
        try:
            while repository["pages"] < max_pages:
                xml_text = fetch_page(oai_url(host, token, from_date if token is None else None))
                counts, candidates, token = parse_rights_page(
                    xml_text,
                    set(unit["pidNamespaces"]),
                    unit.get("publisherFilters", {}).get(host),
                )
                repository["counts"].update(counts)
                for candidate in candidates:
                    candidate.update({"unitId": unit["id"], "host": host})
                    private_candidates.append(candidate)
                repository["pages"] += 1
                if not token:
                    break
        except Exception as exc:  # noqa: BLE001
            repository["status"] = "unavailable"
            repository["errorType"] = type(exc).__name__
        repository["counts"] = dict(sorted(repository["counts"].items()))
        result["repositories"].append(repository)
    return result, private_candidates


def run_rights_inventory(
    registry: dict,
    max_pages: int,
    from_date: str | None,
    unit_filter: set[str] | None = None,
    workers: int = 6,
) -> tuple[dict, list[dict]]:
    units = [unit for institution in registry["institutions"] for unit in institution["units"]]
    if unit_filter:
        unknown = unit_filter - {unit["id"] for unit in units}
        if unknown:
            raise ValueError(f"Nepoznati unitId: {sorted(unknown)}")
        units = [unit for unit in units if unit["id"] in unit_filter]
    with ThreadPoolExecutor(max_workers=workers) as executor:
        inventory_results = list(
            executor.map(lambda unit: inventory_unit_rights(unit, max_pages, from_date), units)
        )
    results = [item[0] for item in inventory_results]
    candidates = [candidate for item in inventory_results for candidate in item[1]]
    totals = Counter()
    for unit in results:
        for repository in unit["repositories"]:
            totals.update(repository["counts"])
    summary = {
        "units": len(results),
        "mapped": sum(item["mappingStatus"] == "mapped" for item in results),
        "repositoriesUnavailable": sum(
            repository["status"] != "ok"
            for item in results
            for repository in item["repositories"]
        ),
        "recordsObserved": sum(value for key, value in totals.items() if not key.startswith("access:")),
        "permissiveLicenseCandidates": totals["permissive-license-candidate"],
        "conditionalLicenseReview": totals["conditional-license-review"],
        "inCopyrightReview": totals["in-copyright-review"],
        "noExplicitLicense": totals["no-explicit-license"],
        "notOpenAccess": totals["not-open-access"],
    }
    report = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "scope": "metadata-rights-only",
        "policy": {
            "downloadsFiles": False,
            "publishesRecordIdentifiers": False,
            "publishesTitlesAuthorsOrEmails": False,
            "autoApprovesFullTextUse": False,
            "candidateReviewStatus": "pending",
        },
        "summary": summary,
        "units": results,
    }
    return report, candidates


def write_jsonl(path: Path, records: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records), encoding="utf-8")
    path.chmod(0o600)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--private-candidates-out", type=Path, required=True)
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
    report, candidates = run_rights_inventory(
        registry,
        args.max_pages,
        args.from_date or None,
        set(args.unit) or None,
        args.workers,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_jsonl(args.private_candidates_out, candidates)
    print(json.dumps(report["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
