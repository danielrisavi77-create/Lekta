#!/usr/bin/env python3
"""Izgradi metadata-only registar akademskih repozitorija iz postojećih dokaza."""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path


HOST_RE = re.compile(r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def add_source(target, unit_id: str, source: dict, origin: str) -> None:
    host = str(source.get("repository", "")).strip().lower()
    pid = str(source.get("pid", "")).strip()
    if not host or not HOST_RE.fullmatch(host):
        return
    target[unit_id]["hosts"].add(host)
    if ":" in pid:
        namespace = pid.split(":", 1)[0].strip().lower()
        if namespace:
            target[unit_id]["namespaces"].add(namespace)
    target[unit_id]["origins"].add(origin)


def collect_existing(root: Path):
    found = defaultdict(lambda: {"hosts": set(), "namespaces": set(), "origins": set()})
    profiles = load_json(root / "data/profiles/verified-profiles.json")
    for profile in profiles:
        unit_id = profile.get("unitId")
        public_sources = (profile.get("fieldValidation") or {}).get("publicSources", [])
        if unit_id:
            for source in public_sources:
                add_source(found, unit_id, source, "verified-profiles")

    for path in sorted((root / "data/title-pages/evidence").glob("*.json")):
        evidence = load_json(path)
        unit_id = evidence.get("unitId")
        if unit_id:
            for sample in evidence.get("samples", []):
                add_source(found, unit_id, sample, "title-page-evidence")
    return found


def build_registry(root: Path) -> dict:
    catalog = load_json(root / "data/catalog/zagreb-catalog.json")
    overrides = load_json(root / "training-pipeline/academic-repository-overrides.json")
    existing = collect_existing(root)
    catalog_units = {unit["id"] for institution in catalog for unit in institution["units"]}
    unknown = set(overrides["units"]) - catalog_units
    if unknown:
        raise ValueError(f"Override sadrži nepoznate unitId vrijednosti: {sorted(unknown)}")

    institutions = []
    for institution in catalog:
        units = []
        for unit in institution["units"]:
            unit_id = unit["id"]
            derived = existing[unit_id]
            override = overrides["units"].get(unit_id)
            hosts = set(derived["hosts"])
            if override:
                hosts.update(override.get("hosts", []))
            namespaces = set(derived["namespaces"])
            if override:
                namespaces.update(override.get("pidNamespaces", []))
            hosts = sorted(hosts)
            if override and override["status"] == "no-official-match":
                status = "no-official-match"
            elif hosts:
                status = "mapped"
            else:
                status = "unmapped"
            evidence = sorted(derived["origins"])
            if override:
                evidence.append("official-dabar-directory")
            units.append({
                "id": unit_id,
                "name": unit["name"],
                "mappingStatus": status,
                "hosts": hosts,
                "pidNamespaces": sorted(namespaces),
                "publisherFilters": dict(override.get("publisherFilters", {})) if override else {},
                "evidence": evidence,
                **({"note": override["note"]} if override and override.get("note") else {}),
            })
        institutions.append({"id": institution["id"], "name": institution["name"], "units": units})

    claims = defaultdict(list)
    for institution in institutions:
        for unit in institution["units"]:
            for host in unit["hosts"]:
                for namespace in unit["pidNamespaces"]:
                    claims[(host, namespace)].append(unit)
    for (host, _namespace), units in claims.items():
        if len(units) > 1:
            for unit in units:
                unit["publisherFilters"].setdefault(host, unit["name"])

    return {
        "version": 1,
        "verifiedAt": overrides["verifiedAt"],
        "officialRegistryUrl": overrides["officialRegistryUrl"],
        "scope": "metadata-only",
        "institutions": institutions,
    }


def validate_registry(registry: dict, root: Path) -> None:
    catalog = load_json(root / "data/catalog/zagreb-catalog.json")
    expected_institutions = {item["id"] for item in catalog}
    actual_institutions = {item["id"] for item in registry["institutions"]}
    if actual_institutions != expected_institutions:
        raise ValueError("Registar ne pokriva isti skup ustanova kao katalog.")
    expected_units = {unit["id"] for item in catalog for unit in item["units"]}
    units = [unit for item in registry["institutions"] for unit in item["units"]]
    if len(units) != len(expected_units) or {unit["id"] for unit in units} != expected_units:
        raise ValueError("Registar ne pokriva svaki unitId iz kataloga točno jednom.")
    for unit in units:
        if unit["mappingStatus"] == "mapped" and not unit["hosts"]:
            raise ValueError(f"Mapirana sastavnica {unit['id']} nema host.")
        if unit["mappingStatus"] == "mapped" and not unit["pidNamespaces"]:
            raise ValueError(f"Mapirana sastavnica {unit['id']} nema OAI namespace.")
        for host in unit["hosts"]:
            if not HOST_RE.fullmatch(host):
                raise ValueError(f"Neispravan host za {unit['id']}: {host}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--out", type=Path)
    parser.add_argument("--validate", action="store_true")
    args = parser.parse_args()
    registry = build_registry(args.root)
    if args.validate:
        validate_registry(registry, args.root)
    text = json.dumps(registry, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text, encoding="utf-8")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
