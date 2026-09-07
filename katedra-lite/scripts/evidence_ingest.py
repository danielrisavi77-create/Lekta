#!/usr/bin/env python3
"""Extract page-level evidence records from PDF/text sources into JSONL.

B12 is ingestion/identity only. It does not decide whether a claim has enough evidence;
that enforcement belongs to the later evidence-gate batch.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Any

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from claim_ledger import zapisi_jsonl  # noqa: E402
from evidence_model import (  # noqa: E402
    file_sha256,
    razrijesi_putanju_izvora,
    read_jsonl,
    stable_evidence_id,
    text_sha256,
    zapisi_putanju_izvora,
)


def _pdf_greske(samo_zakljucan: bool = False) -> tuple[type[BaseException], ...]:
    """v1.1-fix (Q11): pypdf klase greške za except tuple.

    Zaključan (`FileNotDecryptedError`) i oštećen/nepotpun PDF (`PyPdfError`) nisu
    OSError/ValueError/RuntimeError, pa su dosad izlazili kao stack trace i exit 1.
    Import je lijen da .txt/.md ingest ne mora uopće učitati pypdf.
    """
    try:
        from pypdf.errors import FileNotDecryptedError, PyPdfError
    except ImportError:  # pragma: no cover - okruženje bez pypdf-a
        return ()
    return (FileNotDecryptedError,) if samo_zakljucan else (PyPdfError,)


def _clean_text(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    return text.strip()


def _passages(page_text: str) -> list[tuple[str, int, int]]:
    """Return stable passages with character offsets inside normalized page text."""
    text = _clean_text(page_text)
    if not text:
        return []
    blocks = [b.strip() for b in re.split(r"\n\s*\n+", text) if b.strip()]
    # PDF extractors often emit one physical line per visual line and no blank lines.
    # In that case the whole page is the most robust passage: page locator remains exact
    # and we avoid inventing paragraph boundaries from line wrapping.
    if len(blocks) == 1:
        return [(blocks[0], 0, len(blocks[0]))]
    out: list[tuple[str, int, int]] = []
    cursor = 0
    for block in blocks:
        start = text.find(block, cursor)
        if start < 0:
            start = cursor
        end = start + len(block)
        out.append((block, start, end))
        cursor = end
    return out


def _pdf_pages(path: Path) -> tuple[list[tuple[int, str | None, str]], str]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError(
            "PDF evidence ingestion requires pypdf; install project dependencies from pyproject.toml"
        ) from exc
    reader = PdfReader(str(path))
    labels: list[str] = []
    try:
        labels = list(reader.page_labels or [])
    except Exception:
        labels = []
    pages: list[tuple[int, str | None, str]] = []
    for i, page in enumerate(reader.pages, 1):
        label = labels[i - 1] if i - 1 < len(labels) else None
        text = page.extract_text() or ""
        pages.append((i, str(label) if label is not None else None, text))
    return pages, "pypdf"


def _text_pages(path: Path) -> tuple[list[tuple[int, str | None, str]], str]:
    text = path.read_text(encoding="utf-8")
    pages = text.split("\f")
    # v1.1-fix (Q19): page_label je TISKANA oznaka stranice. .txt/.md bez form feeda
    # nema paginaciju, pa je oznaka null (schema to izričito dopušta) umjesto
    # izmišljenog rednog broja koji bi student prepisao u citat.
    if len(pages) == 1:
        return [(1, None, pages[0])], "form-feed"
    return [(i, str(i), page) for i, page in enumerate(pages, 1)], "form-feed"


def extract_records(
    path: Path,
    source_id: str,
    ledger_path: str | Path = ".katedra/evidence.jsonl",
) -> list[dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        pages, engine = _pdf_pages(path)
        fmt = "pdf"
    elif suffix in {".txt", ".md"}:
        pages, engine = _text_pages(path)
        fmt = "markdown" if suffix == ".md" else "text"
    else:
        raise ValueError("podržani evidence izvori su .pdf, .txt i .md")

    source_hash = file_sha256(path)
    # v1.1-fix (Q19, 3. krug): putanja izvora se zapisuje RELATIVNO PREMA
    # PROJEKTU koji ledger implicira (v. evidence_model.zapisi_putanju_izvora).
    # Prvi krug je zapisivao doslovan argument s naredbenog retka pa je validacija
    # iz druge mape bila slijepa; drugi krug je zapisivao apsolutnu putanju pa je
    # slijepo postalo svako preimenovanje/premještanje/kloniranje projekta. U oba
    # slučaja ishod je isti i najgori mogući: podmetnuta datoteka prolazi tiho.
    source_put = zapisi_putanju_izvora(path, ledger_path)
    records: list[dict[str, Any]] = []
    for page_no, page_label, page_text in pages:
        for passage_no, (text, char_start, char_end) in enumerate(_passages(page_text), 1):
            locator = {
                "kind": "page",
                "page": page_no,
                "page_label": page_label,
                "passage": passage_no,
                "char_start": char_start,
                "char_end": char_end,
            }
            record = {
                "schema_version": 1,
                "evidence_id": stable_evidence_id(source_id, locator, text),
                "source_id": source_id,
                "source_path": source_put,
                "source_sha256": source_hash,
                "locator": locator,
                "text": text,
                "text_sha256": text_sha256(text),
                "extraction": {"format": fmt, "engine": engine},
            }
            records.append(record)
    return records


def _validate_source_id(source_id: str, verification_path: str | None) -> None:
    if not verification_path:
        return
    import json

    payload = json.loads(Path(verification_path).read_text(encoding="utf-8"))
    ids = {str(x.get("source_id") or "") for x in payload.get("izvori", [])}
    if source_id not in ids:
        raise ValueError(f"source_id nije pronađen u source verification JSON-u: {source_id}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Ingest page-level evidence into .katedra/evidence.jsonl")
    ap.add_argument("source", help="PDF/TXT/MD source file")
    ap.add_argument("--source-id", required=True, help="stable source_id from verify_sources JSON")
    ap.add_argument("--source-verification", help="optional verify_sources JSON that must contain source_id")
    ap.add_argument("--out", default=".katedra/evidence.jsonl", help="evidence JSONL output")
    args = ap.parse_args()

    path = Path(args.source)
    if not path.is_file():
        print(f"❌ nema source datoteke: {path}", file=sys.stderr)
        return 2
    try:
        _validate_source_id(args.source_id, args.source_verification)
        new_records = extract_records(path, args.source_id, ledger_path=args.out)
        if not new_records:
            raise ValueError("iz source datoteke nije izvučen tekst; image-only/blank PDF treba OCR ili drugi tekstualni izvor")
        existing = read_jsonl(args.out)
        # Idempotent refresh: replace only evidence originating from this source_id,
        # preserve all other ingested sources in the project ledger.
        prijasnji = [r for r in existing if r.get("source_id") == args.source_id]
        merged = [r for r in existing if r.get("source_id") != args.source_id] + new_records
        # 2. krug (Q14): isti atomaran zapis kao u claim_ledgeru — evidence.jsonl
        # je jezgra dokaznog sloja i ne smije se pisati kroz predvidivi „<put>.tmp",
        # koji je podmetnuta poveznica odvodila izvan projekta. NesigurnaPutanja je
        # OSError, pa je hvata postojeći `except` niže i vraća izlaz 2.
        zapisi_jsonl(args.out, merged)
        # v1.1-fix (Q19): reingest pod istim --source-id briše prijašnje zapise;
        # koliko ih je nestalo i iz koje su datoteke bili mora se vidjeti.
        # v1.1-fix (Q19, 3. krug): uspoređuju se RAZRIJEŠENE putanje, ne zapisane
        # niske — inače bi isti izvor ingestiran jednom relativno, jednom apsolutno
        # izgledao kao zamjena datoteke, a stvarna zamjena iz druge mape ne bi.
        # Ispisuje se RAZRIJEŠENA putanja jer je zapisana relativna prema projektu,
        # a poruka mora studentu reći koju datoteku da otvori.
        sada = os.path.abspath(os.path.expanduser(str(path)))
        prethodne_putanje = sorted({
            razrijesi_putanju_izvora(str(r["source_path"]), args.out)
            or os.path.normpath(str(r["source_path"]))
            for r in prijasnji
            if r.get("source_path")
            and (razrijesi_putanju_izvora(str(r["source_path"]), args.out)
                 or os.path.normpath(str(r["source_path"]))) != sada
        })
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2
    except _pdf_greske(samo_zakljucan=True):
        print(f"❌ PDF je zaštićen lozinkom i ne može se pročitati: {path}", file=sys.stderr)
        print(
            "Što napraviti: otvori PDF u čitaču, spremi ga bez lozinke "
            "(Ispis → Spremi kao PDF) pa ponovi ingest.",
            file=sys.stderr,
        )
        return 2
    except _pdf_greske() as exc:
        print(f"❌ PDF se ne može pročitati (oštećen ili nepotpun): {path} — {exc}", file=sys.stderr)
        print(
            "Što napraviti: preuzmi datoteku ponovno do kraja i provjeri da se "
            "otvara u čitaču PDF-a, pa ponovi ingest.",
            file=sys.stderr,
        )
        return 2
    print(
        f"[evidence → {args.out}] dodano {len(new_records)} passage(s), "
        f"zamijenjeno {len(prijasnji)}, source={args.source_id}"
    )
    if prethodne_putanje:
        print(
            "⚠️  isti --source-id je prije pokazivao na drugu datoteku: "
            + ", ".join(prethodne_putanje)
            + f" (sada: {path})"
        )
        print("Što napraviti: provjeri je li source_id doista isti izvor ili ti treba novi.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
