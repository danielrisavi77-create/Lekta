#!/usr/bin/env python3
"""Shared identities and JSONL contracts for B12 evidence/claim state.

The model intentionally separates:
- bibliographic source identity (`source_id`),
- extracted page evidence (`evidence_id`),
- claims (`claim_id`).

IDs are deterministic so re-running ingestion does not create duplicate state.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlsplit, urlunsplit


# --- putanja izvora: zapis i razrješavanje (Q19, 3. krug) --------------------
# Zapisivanje APSOLUTNE putanje riješilo je „ingest iz jedne mape, validacija iz
# druge", ali je uvelo goru rupu: preimenovanje, premještanje ili kloniranje
# projektne mape čini zapisanu putanju nepostojećom, pa `_source_file_changed`
# tiho preskoči provjeru i podmetnuta datoteka prolazi (exit 0).
#
# Sidro nije cwd (mijenja se od poziva do poziva) nego SAM LEDGER: evidence.jsonl
# živi u projektu, pa je putanja izvora zapisana relativno prema projektnom
# korijenu koji ledger implicira, i čita se natrag prema istom korijenu. Ista
# vrijednost preživi i drugi cwd i preimenovan projekt. Izvor izvan projekta
# (npr. ~/Downloads) i dalje se zapisuje apsolutno — relativna putanja preko
# `..` ne bi preživjela ni jedno ni drugo.

def korijen_ledgera(ledger_path: str | Path) -> str:
    """Projektni korijen koji implicira lokacija ledger datoteke."""
    put = os.path.abspath(os.path.expanduser(str(ledger_path)))
    direktorij = os.path.dirname(put) or os.getcwd()
    if os.path.basename(direktorij) == ".katedra":
        return os.path.dirname(direktorij) or direktorij
    return direktorij


def zapisi_putanju_izvora(source: str | Path, ledger_path: str | Path) -> str:
    """Putanja za zapis: relativna prema projektu ako je izvor u njemu."""
    izvor = os.path.abspath(os.path.expanduser(str(source)))
    korijen = korijen_ledgera(ledger_path)
    try:
        rel = os.path.relpath(izvor, korijen)
    except ValueError:  # pragma: no cover - drugi disk na Windowsu
        return izvor
    if os.path.isabs(rel) or rel == os.pardir or rel.startswith(os.pardir + os.sep):
        return izvor
    return rel.replace(os.sep, "/")


def razrijesi_putanju_izvora(
    source_path: str,
    ledger_path: str | Path | None = None,
    project_root: str | Path | None = None,
) -> str | None:
    """Prvi kandidat koji doista postoji; None ako se izvor ne može pronaći."""
    zapisano = str(source_path or "").strip()
    if not zapisano:
        return None
    if os.path.isabs(zapisano):
        return zapisano if os.path.isfile(zapisano) else None
    korijeni: list[str] = []
    if ledger_path:
        korijeni.append(korijen_ledgera(ledger_path))
    if project_root:
        korijeni.append(os.path.abspath(os.path.expanduser(str(project_root))))
    korijeni.append(os.getcwd())
    vidjeni: set[str] = set()
    for korijen in korijeni:
        if korijen in vidjeni:
            continue
        vidjeni.add(korijen)
        kandidat = os.path.normpath(os.path.join(korijen, zapisano))
        if os.path.isfile(kandidat):
            return kandidat
    return None


def _norm_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def _norm_url(value: str) -> str:
    try:
        p = urlsplit(value.strip())
        scheme = p.scheme.lower()
        netloc = p.netloc.lower()
        path = re.sub(r"/+$", "", p.path)
        return urlunsplit((scheme, netloc, path, p.query, ""))
    except Exception:
        return value.strip().lower()


def stable_source_id(source: dict[str, Any]) -> str:
    """Return a deterministic bibliographic source identifier.

    Prefer DOI, then URL, then normalized author/year/title. Formatting-only changes
    in the bibliography therefore do not normally create a new identity.
    """
    doi = _norm_text(source.get("doi"))
    url = str(source.get("url") or "").strip()
    if doi:
        key = f"doi:{doi}"
    elif url:
        key = f"url:{_norm_url(url)}"
    else:
        parts = [
            _norm_text(source.get("autor")),
            _norm_text(source.get("godina")),
            _norm_text(source.get("naslov")),
        ]
        if not any(parts):
            parts = [_norm_text(source.get("unos"))]
        key = "bib:" + "|".join(parts)
    return "src_" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]


def file_sha256(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def text_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def stable_evidence_id(source_id: str, locator: dict[str, Any], text: str) -> str:
    identity = {
        "source_id": source_id,
        "page": locator.get("page"),
        "page_label": locator.get("page_label"),
        "passage": locator.get("passage"),
        "char_start": locator.get("char_start"),
        "char_end": locator.get("char_end"),
        "text_sha256": text_sha256(text),
    }
    # Kvar 47: točka standarda i članak propisa nemaju stranicu. Ključ ih uzima
    # samo kad postoje, pa se identiteti postojećih `page` zapisa ne mijenjaju.
    if locator.get("clause_label"):
        identity["clause_label"] = locator.get("clause_label")
    raw = json.dumps(identity, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return "ev_" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


def stable_claim_id(text: str, location: dict[str, Any] | None = None) -> str:
    identity = {
        "text": _norm_text(text),
        "location": location or {},
    }
    raw = json.dumps(identity, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return "clm_" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def read_jsonl(path: str | Path) -> list[dict[str, Any]]:
    p = Path(path)
    if not p.exists():
        return []
    records: list[dict[str, Any]] = []
    with p.open(encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{p}:{lineno}: neispravan JSON: {exc.msg}") from exc
            if not isinstance(value, dict):
                raise ValueError(f"{p}:{lineno}: JSONL zapis mora biti objekt")
            records.append(value)
    return records


def write_jsonl(path: str | Path, records: Iterable[dict[str, Any]]) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        for record in records:
            fh.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
    tmp.replace(p)


def evidence_index(records: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for record in records:
        evidence_id = str(record.get("evidence_id") or "")
        if not evidence_id:
            raise ValueError("evidence zapis nema evidence_id")
        if evidence_id in out:
            raise ValueError(f"duplikat evidence_id: {evidence_id}")
        out[evidence_id] = record
    return out


def claim_index(records: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for record in records:
        claim_id = str(record.get("claim_id") or "")
        if not claim_id:
            raise ValueError("claim zapis nema claim_id")
        if claim_id in out:
            raise ValueError(f"duplikat claim_id: {claim_id}")
        out[claim_id] = record
    return out
