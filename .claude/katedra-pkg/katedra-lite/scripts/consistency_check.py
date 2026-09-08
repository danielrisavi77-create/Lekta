#!/usr/bin/env python3
"""Deterministički cross-chapter consistency check nad B12 claim ledgerom.

Ovo nije semantički LLM sudac. Gradi graph između poglavlja preko normaliziranih
claim anchora i prijavljuje samo dokazive kontradikcijske signale koje može
reproducirati: različite brojke za isti anchor i obrnutu eksplicitnu negaciju.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

# v1.1 fix Q5b: brojčani token mora obuhvatiti i hrvatsku tisućicu („1.234.567”),
# inače se '1.000' razbije na dva broja ili se pročita kao decimalni broj.
NUM_RE = re.compile(r"(?<!\w)\d+(?:[.,]\d+)*\s*%?(?!\w)")

# v1.1 fix Q5a: hrvatske stegnute negacije (nije/nisu/neće/nema) razvijaju se u
# „ne + pomoćni glagol” PRIJE anchoranja. Bez toga se iz negirane rečenice briše
# cijeli 'nije', a iz potvrdne ostaje 'je', pa dvije suprotne tvrdnje nikad ne
# završe u istoj anchor grupi i polaritet se nikad ne usporedi.
_NEG_EXPANSIONS = {
    "nije": "ne je",
    "nisu": "ne su",
    "nisam": "ne sam",
    "nismo": "ne smo",
    "niste": "ne ste",
    "necu": "ne cu",
    "neces": "ne ces",
    "nece": "ne ce",
    "necemo": "ne cemo",
    "necete": "ne cete",
    "nemam": "ne imam",
    "nemas": "ne imas",
    "nemamo": "ne imamo",
    "nemate": "ne imate",
    "nemaju": "ne imaju",
    "nema": "ne ima",
}
_NEG_EXPAND_RE = re.compile(
    r"\b(" + "|".join(sorted(_NEG_EXPANSIONS, key=len, reverse=True)) + r")\b"
)
NEG_RE = re.compile(r"\bne\b")
# Kopula i pomoćni glagoli ispadaju iz anchora zajedno s negacijskom česticom, pa
# „Ishod je bio pozitivan” i „Ishod nije bio pozitivan” daju isti anchor.
AUX_RE = re.compile(r"\b(?:je|su|sam|smo|ste|ce|cu|ces|cemo|cete)\b")


def _ascii(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def _normalized(text: str) -> str:
    """ASCII-fold + razvijene stegnute negacije; zajednička podloga anchora i polariteta."""
    s = _ascii((text or "").lower())
    return _NEG_EXPAND_RE.sub(lambda m: _NEG_EXPANSIONS[m.group(1)], s)


def _canonical_number(raw: str) -> str:
    """Kanonizira jedan brojčani token po hrvatskim pravilima pisanja brojeva.

    Pravilo (v1.1 fix Q5b): zarez je uvijek decimalni znak; točka je grupni
    razdjelnik samo kad token u cijelosti izgleda kao grupirani cijeli broj —
    1-3 znamenke pa jedna ili više skupina od točno tri znamenke („1.000”,
    „1.234.567”). U svakom drugom slučaju točka je decimalna („7.2”, „0.5”).
    Time se rješava i inače dvoznačan „1.000”: u akademskom hrvatskom tekstu to
    je tisuću, a ne jedan cijeli nula nula nula.
    """
    token = re.sub(r"\s+", "", raw or "")
    postotak = token.endswith("%")
    if postotak:
        token = token[:-1]
    if "," in token:
        token = token.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+", token):
        token = token.replace(".", "")
    try:
        value = Decimal(token)
    except InvalidOperation:
        return re.sub(r"\s+", "", raw or "")
    out = format(value, "f")
    if "." in out:
        out = out.rstrip("0").rstrip(".")
    return out + ("%" if postotak else "")


def _numbers(text: str) -> tuple[str, ...]:
    vals = []
    for raw in NUM_RE.findall(text or ""):
        vals.append(_canonical_number(raw))
    return tuple(vals)


def _polarity(text: str) -> int:
    return -1 if NEG_RE.search(_normalized(text)) else 1


def claim_anchor(text: str) -> str:
    s = _normalized(text)
    s = NUM_RE.sub(" ", s)
    s = NEG_RE.sub(" ", s)
    s = AUX_RE.sub(" ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _read_claims(path: str | Path) -> list[dict[str, Any]]:
    p = Path(path)
    if not p.is_file():
        raise ValueError(f"claim ledger ne postoji: {p}")
    rows = []
    for lineno, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"neispravan JSONL redak {lineno}: {exc}") from exc
        if not isinstance(row, dict) or not row.get("claim_id") or not row.get("text"):
            raise ValueError(f"claim redak {lineno} nema claim_id/text")
        chapter = str((row.get("location") or {}).get("chapter") or "").strip()
        if not chapter:
            raise ValueError(f"claim {row.get('claim_id')} nema location.chapter")
        rows.append(row)
    return rows


def evaluate_claims(claims: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    chapter_counts: dict[str, int] = defaultdict(int)
    for row in claims:
        chapter = str((row.get("location") or {}).get("chapter") or "").strip()
        chapter_counts[chapter] += 1
        anchor = claim_anchor(str(row.get("text") or ""))
        if anchor:
            grouped[anchor].append(row)

    nodes = [
        {"chapter": chapter, "claims": chapter_counts[chapter]}
        for chapter in sorted(chapter_counts)
    ]
    edges: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []

    for anchor in sorted(grouped):
        rows = grouped[anchor]
        chapters = sorted({str((r.get("location") or {}).get("chapter") or "") for r in rows})
        if len(chapters) < 2:
            continue
        claim_ids = sorted(str(r.get("claim_id")) for r in rows)
        edges.append({
            "kind": "shared_claim_anchor",
            "anchor": anchor,
            "chapters": chapters,
            "claim_ids": claim_ids,
        })

        numeric_sets = {_numbers(str(r.get("text") or "")) for r in rows}
        nonempty_numeric = {x for x in numeric_sets if x}
        if len(nonempty_numeric) > 1:
            findings.append({
                "type": "numeric_conflict",
                "severity": "blocking",
                "anchor": anchor,
                "chapters": chapters,
                "claim_ids": claim_ids,
                "details": "isti claim-anchor kroz poglavlja koristi različite brojčane vrijednosti",
            })

        polarities = {_polarity(str(r.get("text") or "")) for r in rows}
        if len(polarities) > 1:
            findings.append({
                "type": "polarity_conflict",
                "severity": "blocking",
                "anchor": anchor,
                "chapters": chapters,
                "claim_ids": claim_ids,
                "details": "isti claim-anchor pojavljuje se s eksplicitno obrnutom negacijom",
            })

    findings.sort(key=lambda f: (f["type"], f["anchor"]))
    blocking = sum(1 for f in findings if f["severity"] == "blocking")
    coverage_status = "sufficient" if len(nodes) >= 2 else "insufficient"
    return {
        "schema_version": 1,
        "check_kind": "deterministic_claim_consistency",
        "read_only": True,
        "coverage_status": coverage_status,
        "graph": {"nodes": nodes, "edges": edges},
        "findings": findings,
        "summary": {
            "chapters": len(nodes),
            "edges": len(edges),
            "findings": len(findings),
            "blocking": blocking,
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Cross-chapter consistency graph/check nad claim ledgerom")
    ap.add_argument("--claims", default=".katedra/claims.jsonl")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--out")
    args = ap.parse_args()
    try:
        payload = evaluate_claims(_read_claims(args.claims))
    except (OSError, ValueError) as exc:
        print(f"❌ consistency check: {exc}", file=sys.stderr)
        return 2
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print("CROSS-CHAPTER CONSISTENCY")
        print("=" * 72)
        for f in payload["findings"]:
            print(f"✗ {f['type']}: {', '.join(f['chapters'])} · {f['details']}")
        s = payload["summary"]
        # v1.1 fix Q12: coverage_status mora biti vidljiv i u TEXT ispisu, ne samo u JSON-u.
        print(f"SUMMARY chapters={s['chapters']} edges={s['edges']} findings={s['findings']} blocking={s['blocking']} coverage={payload['coverage_status']}")
        if payload["coverage_status"] == "insufficient":
            print("⚠️ coverage_status=insufficient — claim ledger pokriva manje od dva poglavlja.")
            print("   Što napraviti: dopuni claim ledger tvrdnjama iz barem još jednog poglavlja pa ponovi provjeru.")
    if payload["coverage_status"] == "insufficient":
        return 2
    return 1 if payload["summary"]["blocking"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
