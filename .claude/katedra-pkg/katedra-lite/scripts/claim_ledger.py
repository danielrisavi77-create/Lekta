#!/usr/bin/env python3
"""Persistent claim → evidence ledger for B12.

This tool validates structure and reports support state. It deliberately does NOT block
an unsupported claim merely for being unsupported; B13 owns evidence enforcement gates.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from context import NesigurnaPutanja, atomic_write_text, resolve_state_file  # noqa: E402
from evidence_model import (  # noqa: E402
    claim_index,
    evidence_index,
    file_sha256,
    razrijesi_putanju_izvora,
    read_jsonl,
    stable_claim_id,
    stable_evidence_id,
    text_sha256,
)

RELATIONS = {"supports", "contradicts", "contextualizes"}


def zapisi_jsonl(path, records) -> str:
    """Atomaran zapis JSONL ledgera, bez slijeđenja simboličke poveznice.

    2. krug (nedovršen popravak Q14): `evidence_model.write_jsonl` piše preko
    fiksnog imena „<put>.tmp". To ime je predvidivo, pa je unaprijed podmetnuta
    poveznica na njemu odvodila SADRŽAJ ledgera izvan projekta, a `os.replace`
    je zatim od samog `claims.jsonl` napravio poveznicu — sve uz izlaz 0. Q14 je
    bio zatvoren na perifernim artefaktima (verzije.json, zamjerke.json,
    izvještaji), a claims.jsonl i evidence.jsonl — jezgra dokaznog sloja — ostali
    su otvoreni. Serijalizacija je namjerno bajt-u-bajt ista kao dosad
    (`sort_keys=True`, `ensure_ascii=False`), mijenja se samo NAČIN zapisa.
    """
    tekst = "".join(
        json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records)
    return atomic_write_text(path, tekst)


def _zapisi_ili_javi(path, records) -> int:
    """0 kad je zapis uspio, inače izlazni kod uz hrvatsku poruku na stderr."""
    try:
        zapisi_jsonl(path, records)
    except NesigurnaPutanja as exc:
        print(f"❌ ledger nije zapisan: {exc}", file=sys.stderr)
        return 2
    except OSError as exc:
        print(f"❌ ledger nije zapisan ({exc}).\n"
              f"   Što napraviti: provjeri prava pisanja nad .katedra/ pa ponovi naredbu.",
              file=sys.stderr)
        return 2
    return 0


def _location(chapter: str | None, paragraph: str | None) -> dict[str, str]:
    out: dict[str, str] = {}
    if chapter:
        out["chapter"] = chapter
    if paragraph:
        out["paragraph"] = paragraph
    return out


def _source_file_changed(
    ev: dict[str, Any],
    cache: dict[str, str | None],
    evidence_path: str | None = None,
    project_root: str | None = None,
) -> bool:
    """v1.1-fix (Q19): source_sha256 se dosad pisao pri ingestu i nikad čitao.

    Zamjena source datoteke na istoj putanji ostavljala je i ledger i strict gate
    zelene. Provjeravamo samo ako se izvor i dalje može pronaći; premješten izvor
    nije isto što i podmetnut izvor.

    3. krug: putanja se razrješava prema projektnom korijenu koji implicira sam
    ledger (v. evidence_model.razrijesi_putanju_izvora), pa provjera preživi i
    drugi cwd i preimenovan/premješten/kloniran projekt. Ranije je ovdje stajao
    goli `os.path.isfile(source_path)`, koji je u tim situacijama vraćao False i
    tiho gasio jedinu provjeru koja hvata podmetnutu datoteku.
    """
    zapisano = str(ev.get("source_path") or "")
    expected = str(ev.get("source_sha256") or "")
    if not zapisano or not expected:
        return False
    source_path = razrijesi_putanju_izvora(zapisano, evidence_path, project_root)
    if not source_path:
        return False
    if source_path not in cache:
        try:
            cache[source_path] = file_sha256(source_path)
        except OSError:
            cache[source_path] = None
    actual = cache[source_path]
    return bool(actual) and actual != expected


def validate_records(
    claims: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
    *,
    evidence_path: str | None = None,
    project_root: str | None = None,
) -> list[str]:
    errors: list[str] = []
    source_hash_cache: dict[str, str | None] = {}
    try:
        eidx = evidence_index(evidence)
    except ValueError as exc:
        errors.append(str(exc))
        eidx = {}
    try:
        claim_index(claims)
    except ValueError as exc:
        errors.append(str(exc))

    for i, ev in enumerate(evidence, 1):
        loc = ev.get("locator") or {}
        if ev.get("schema_version") != 1:
            errors.append(f"evidence #{i}: schema_version mora biti 1")
        # Kvar 47: prije je bio dopušten samo `kind: "page"`, pa točka standarda
        # (MRevS, t. A55), članak propisa (čl. 7. st. 3.) i izvor bez tiskane
        # paginacije nisu mogli ući u lanac — tvrdnja koja se na njih oslanja
        # izgledala je kao tvrdnja bez potpore.
        oznaka_ev = ev.get("evidence_id", f"evidence #{i}")
        vrsta = loc.get("kind")
        if vrsta == "page":
            if not isinstance(loc.get("page"), int) or loc.get("page", 0) < 1:
                errors.append(f"{oznaka_ev}: nedostaje valjani page locator")
        elif vrsta == "clause":
            if not str(loc.get("clause_label") or "").strip():
                errors.append(f"{oznaka_ev}: `clause` lokator traži nepraznu oznaku "
                              "`clause_label` (npr. „t. A55”, „čl. 7. st. 3.”)")
        elif vrsta == "passage":
            if not str(loc.get("passage") or "").strip():
                errors.append(f"{oznaka_ev}: `passage` lokator traži neprazan `passage` "
                              "(izvor bez tiskane paginacije citira se po odlomku)")
        else:
            errors.append(f"{oznaka_ev}: nepoznata vrsta lokatora {vrsta!r} — "
                          "dopušteni su 'page', 'clause' i 'passage'")
        text = str(ev.get("text") or "")
        if not text.strip():
            errors.append(f"{ev.get('evidence_id', f'evidence #{i}')}: prazan evidence text")
        else:
            expected_text_hash = text_sha256(text)
            if ev.get("text_sha256") != expected_text_hash:
                errors.append(f"{ev.get('evidence_id', f'evidence #{i}')}: evidence integrity hash mismatch")
            try:
                expected_id = stable_evidence_id(str(ev.get("source_id") or ""), loc, text)
            except Exception:
                expected_id = None
            if expected_id and ev.get("evidence_id") != expected_id:
                errors.append(f"{ev.get('evidence_id', f'evidence #{i}')}: evidence_id integrity mismatch")
        if _source_file_changed(ev, source_hash_cache, evidence_path, project_root):
            errors.append(
                f"{ev.get('evidence_id', f'evidence #{i}')}: source datoteka je promijenjena "
                f"nakon ingesta (source_sha256 mismatch): {ev.get('source_path')}. "
                "Što napraviti: ponovi evidence_ingest.py za taj --source-id"
            )

    for i, claim in enumerate(claims, 1):
        cid = claim.get("claim_id") or f"claim #{i}"
        if claim.get("schema_version") != 1:
            errors.append(f"{cid}: schema_version mora biti 1")
        if not str(claim.get("text") or "").strip():
            errors.append(f"{cid}: claim text je prazan")
        links = claim.get("evidence")
        if not isinstance(links, list):
            errors.append(f"{cid}: evidence mora biti lista")
            continue
        seen = set()
        for link in links:
            if not isinstance(link, dict):
                errors.append(f"{cid}: evidence link mora biti objekt")
                continue
            eid = str(link.get("evidence_id") or "")
            relation = str(link.get("relation") or "")
            if relation not in RELATIONS:
                errors.append(f"{cid}: nepoznata relation {relation!r}")
            if not eid or eid not in eidx:
                errors.append(f"{cid}: evidence_id ne postoji: {eid or '<prazno>'}")
            key = (eid, relation)
            if key in seen:
                errors.append(f"{cid}: duplikat evidence veze: {eid}/{relation}")
            seen.add(key)
    return errors


def support_status(claim: dict[str, Any]) -> str:
    rels = {str(x.get("relation")) for x in claim.get("evidence", []) if isinstance(x, dict)}
    if "supports" in rels and "contradicts" in rels:
        return "conflicted"
    if "contradicts" in rels and "supports" not in rels:
        return "contradicted"
    if "supports" in rels:
        return "supported"
    return "unsupported"


def _razrijesi_stanje(args) -> None:
    """v1.1-fix (Q19): project-local state kao u ostatku paketa.

    Redoslijed je --claims/--evidence > --project-root > KATEDRA_PROJECT_ROOT > cwd;
    dosad je bio hardkodiran relativni ".katedra/…" i KATEDRA_PROJECT_ROOT se ignorirao.
    """
    project_root = getattr(args, "project_root", None)
    if getattr(args, "claims", None) is None:
        args.claims = resolve_state_file("claims.jsonl", project_root=project_root)
    if getattr(args, "evidence", "?") is None:
        args.evidence = resolve_state_file("evidence.jsonl", project_root=project_root)


def _prazan_ledger(args) -> int | None:
    """v1.1-fix (Q19): prazan/nepostojeći ledger nije zeleno „0 claim(s)"."""
    if not os.path.isfile(args.claims):
        print(f"❌ claim ledger ne postoji: {args.claims}", file=sys.stderr)
        print(
            "Što napraviti: pokreni `claim_ledger.py add --text \"…\"` ili pokaži na "
            "postojeći ledger s --claims / --project-root.",
            file=sys.stderr,
        )
        return 2
    if not read_jsonl(args.claims):
        print(f"❌ claim ledger je prazan: {args.claims}", file=sys.stderr)
        print(
            "Što napraviti: dodaj barem jedan claim s `claim_ledger.py add --text \"…\"` "
            "pa ponovi provjeru.",
            file=sys.stderr,
        )
        return 2
    return None


def _load_pair(args) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    return read_jsonl(args.claims), read_jsonl(args.evidence)


def cmd_add(args) -> int:
    _razrijesi_stanje(args)
    claims = read_jsonl(args.claims)
    location = _location(args.chapter, args.paragraph)
    cid = args.claim_id or stable_claim_id(args.text, location)
    if any(c.get("claim_id") == cid for c in claims):
        print(f"❌ claim_id već postoji: {cid}", file=sys.stderr)
        return 2
    claims.append({
        "schema_version": 1,
        "claim_id": cid,
        "text": args.text.strip(),
        "location": location,
        "evidence": [],
    })
    greska = _zapisi_ili_javi(args.claims, claims)
    if greska:
        return greska
    print(f"[claim added] {cid}")
    return 0


def cmd_link(args) -> int:
    _razrijesi_stanje(args)
    claims, evidence = _load_pair(args)
    try:
        cidx = claim_index(claims)
        eidx = evidence_index(evidence)
    except ValueError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2
    if args.claim_id not in cidx:
        print(f"❌ nema claim_id: {args.claim_id}", file=sys.stderr)
        return 2
    if args.evidence_id not in eidx:
        print(f"❌ nema evidence_id: {args.evidence_id}", file=sys.stderr)
        return 2
    link = {"evidence_id": args.evidence_id, "relation": args.relation}
    record = cidx[args.claim_id]
    links = record.setdefault("evidence", [])
    if link not in links:
        links.append(link)
    greska = _zapisi_ili_javi(args.claims, claims)
    if greska:
        return greska
    print(f"[claim linked] {args.claim_id} ← {args.evidence_id} ({args.relation})")
    return 0


def cmd_validate(args) -> int:
    _razrijesi_stanje(args)
    prazan = _prazan_ledger(args)
    if prazan is not None:
        return prazan
    claims, evidence = _load_pair(args)
    errors = validate_records(
        claims, evidence,
        evidence_path=args.evidence,
        project_root=getattr(args, "project_root", None),
    )
    if errors:
        for err in errors:
            print(f"❌ {err}", file=sys.stderr)
        return 2
    print(f"✅ claim ledger structurally valid: {len(claims)} claim(s), {len(evidence)} evidence record(s)")
    return 0


def cmd_report(args) -> int:
    _razrijesi_stanje(args)
    prazan = _prazan_ledger(args)
    if prazan is not None:
        return prazan
    claims, evidence = _load_pair(args)
    errors = validate_records(
        claims, evidence,
        evidence_path=args.evidence,
        project_root=getattr(args, "project_root", None),
    )
    if errors:
        for err in errors:
            print(f"❌ {err}", file=sys.stderr)
        return 2
    rows = []
    summary = {"supported": 0, "unsupported": 0, "conflicted": 0, "contradicted": 0}
    for claim in claims:
        status = support_status(claim)
        summary[status] += 1
        rows.append({
            "claim_id": claim["claim_id"],
            "text": claim["text"],
            "location": claim.get("location", {}),
            "support_status": status,
            "evidence_count": len(claim.get("evidence", [])),
            "evidence": claim.get("evidence", []),
        })
    payload = {"schema_version": 1, "claims": rows, "summary": summary}
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        for row in rows:
            print(f"{row['claim_id']}  {row['support_status']:<12} {row['text']}")
        print("SUMMARY " + " · ".join(f"{k}={v}" for k, v in summary.items()))
    return 0


def parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Persistent claim → evidence ledger")
    sub = ap.add_subparsers(dest="command", required=True)

    add = sub.add_parser("add", help="add a claim")
    add.add_argument("--claims", default=None)
    add.add_argument("--project-root", help="korijen projekta za .katedra state")
    add.add_argument("--claim-id")
    add.add_argument("--text", required=True)
    add.add_argument("--chapter")
    add.add_argument("--paragraph")
    add.set_defaults(func=cmd_add)

    link = sub.add_parser("link", help="link claim to an existing evidence record")
    link.add_argument("--claims", default=None)
    link.add_argument("--evidence", default=None)
    link.add_argument("--project-root", help="korijen projekta za .katedra state")
    link.add_argument("--claim-id", required=True)
    link.add_argument("--evidence-id", required=True)
    link.add_argument("--relation", choices=sorted(RELATIONS), default="supports")
    link.set_defaults(func=cmd_link)

    validate = sub.add_parser("validate", help="validate identities, locators and references")
    validate.add_argument("--claims", default=None)
    validate.add_argument("--evidence", default=None)
    validate.add_argument("--project-root", help="korijen projekta za .katedra state")
    validate.set_defaults(func=cmd_validate)

    report = sub.add_parser("report", help="report support status without enforcing gates")
    report.add_argument("--claims", default=None)
    report.add_argument("--evidence", default=None)
    report.add_argument("--project-root", help="korijen projekta za .katedra state")
    report.add_argument("--json", action="store_true")
    report.set_defaults(func=cmd_report)
    return ap


def main() -> int:
    args = parser().parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
