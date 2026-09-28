# -*- coding: utf-8 -*-
"""Lokalni korpus za razinu A-pdf: javni radovi iz DABAR/Islandora repozitorija, PDF -> DOCX.

ZASTO. Odluka vlasnika 2026-09-28: javni studentski radovi iz PDF repozitorija (Dabar, ZIR),
pretvoreni u DOCX i popravljeni Lektom, daju ZASEBNU razinu A-pdf, nikad pravi A. Ova skripta
priprema taj korpus; mjerenje i ovjera idu postojecim putem:

  python scripts/title-pages/oai_discover.py repozitorij.unizd.hr unizd --n 12 --out unizd.json
  python scripts/pdf-corpus/harvest_pdf_corpus.py --pids-file unizd.json --out-dir ~/Desktop/Lekta-korpus/05-pdf
  LEKTA_LOCAL_CORPUS=1 LEKTA_CORPUS_SOURCE=~/Desktop/Lekta-korpus/05-pdf/docx npx vite-node scripts/repair-real-corpus.mts
  node scripts/attest-real-corpus.mjs --source-kind public-pdf-converted --sign "Ime"

GRANICE (CLAUDE.md i odluka vlasnika): radovi smiju SAMO lokalno. Skripta odbija izlaznu mapu
unutar repozitorija, nista ne commita i ne salje nikamo osim sto preuzima s repozitorija teze.
Pokrece se na radnoj stanici, nikad u cloud sesiji.

IZLAZ (po radu, u --out-dir):
  pdf/<unitId>/<razina>/<pid>.pdf    izvorni javni PDF (bajt po bajt)
  docx/<unitId>/<razina>/<pid>.docx  pretvorba (pdf2docx)
  docx/<unitId>/<razina>/<pid>.json  sidecar: pid, repozitorij, url, sha256 obiju datoteka, alat
  .lekta-corpus-kind                 "public-pdf-converted", da se korijen korpusa sam izjasni

Pretvorba iz PDF-a nagadja strukturu (stilovi, sekcije, polja), zato je A-pdf odvojen od A.
Prije sirenja provjeri 2 do 3 pretvorena rada rucno: analizira li ih Lekta smisleno.

Samoprovjera bez mreze i bez ovisnosti: python scripts/pdf-corpus/harvest_pdf_corpus.py --selftest
"""
import argparse
import hashlib
import json
import re
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE_KIND = "public-pdf-converted"
KIND_MARKER = ".lekta-corpus-kind"
TIMEOUT = 60
HOST_DELAY_S = 3.0
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "application/pdf,*/*;q=0.8",
    "Accept-Language": "hr-HR,hr;q=0.9,en-US;q=0.7,en;q=0.5",
}
# Razine iz oai_discover.py -> vrsta rada u Lektinim profilima.
LEVEL_TO_WORK_TYPE = {
    "diplomski": "graduate",
    "zavrsni": "final",
    "doktorski": "doctoral",
    "specijalisticki": "specialist",
}


def out_dir_problem(out_dir, root=ROOT):
    """Radovi ne smiju u repozitorij: izlaz unutar korijena repoa je problem."""
    out = Path(out_dir).expanduser().resolve()
    repo = Path(root).resolve()
    if out == repo or repo in out.parents:
        return f"izlazna mapa {out} je unutar repozitorija; radovi smiju samo izvan njega"
    return None


def safe_name(pid):
    """PID (npr. 'unizd:1234') u ime datoteke bez ':' i znakova koje Windows ne dopusta."""
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", str(pid)).strip("._")
    if not name:
        raise ValueError(f"PID {pid!r} ne daje ime datoteke")
    return name


def candidate_urls(pid, repository):
    """Isti oblici URL-a kao scripts/title-pages/harvest_first_pages.py."""
    base = f"https://{repository}"
    return [
        f"{base}/islandora/object/{pid}/datastream/PDF",
        f"{base}/islandora/object/{pid}/datastream/PDF/download",
        f"{base}/object/{pid}/FILE0",
    ]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def select_records(records, per_cell):
    """Najvise per_cell radova po (unitId, razina), redoslijedom ulaza; nepoznata razina se preskace."""
    seen, picked, skipped = {}, [], []
    for rec in records:
        level = rec.get("level")
        if level not in LEVEL_TO_WORK_TYPE or not rec.get("pid") or not rec.get("repository") or not rec.get("unitId"):
            skipped.append(rec)
            continue
        key = (rec["unitId"], level)
        if seen.get(key, 0) >= per_cell:
            continue
        seen[key] = seen.get(key, 0) + 1
        picked.append(rec)
    return picked, skipped


def sidecar(rec, url, pdf_bytes, docx_bytes, converter, fetched_at):
    return {
        "sourceKind": SOURCE_KIND,
        "pid": rec["pid"],
        "repository": rec["repository"],
        "unitId": rec["unitId"],
        "level": rec["level"],
        "workType": LEVEL_TO_WORK_TYPE[rec["level"]],
        "url": url,
        "fetchedAt": fetched_at,
        "pdfSha256": sha256(pdf_bytes),
        "docxSha256": sha256(docx_bytes),
        "converter": converter,
    }


def fetch_pdf(session, pid, repository, last_request):
    """Vrati (bytes, url, None) ili (None, None, razlog). Po hostu ceka HOST_DELAY_S izmedju zahtjeva."""
    import requests

    reason = "no-url"
    for url in candidate_urls(pid, repository):
        wait = HOST_DELAY_S - (time.monotonic() - last_request.get(repository, -1e9))
        if wait > 0:
            time.sleep(wait)
        last_request[repository] = time.monotonic()
        try:
            resp = session.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        except requests.RequestException as exc:
            reason = f"network: {type(exc).__name__}"
            continue
        if resp.status_code != 200:
            reason = f"http-{resp.status_code}"
            continue
        if not resp.content.startswith(b"%PDF"):
            reason = "not-pdf (login/embargo/html)"
            continue
        return resp.content, url, None
    return None, None, reason


def convert_pdf2docx(pdf_path, docx_path):
    from pdf2docx import Converter
    import pdf2docx

    conv = Converter(str(pdf_path))
    try:
        conv.convert(str(docx_path))
    finally:
        conv.close()
    return f"pdf2docx {getattr(pdf2docx, '__version__', '?')}"


def harvest(records, out_dir, fetch, convert, now=lambda: datetime.now(timezone.utc).isoformat()):
    """Preuzmi i pretvori; vec obradjen rad (postoji sidecar) se preskace. Vraca izvjestaj po ishodu."""
    out = Path(out_dir).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)
    (out / KIND_MARKER).write_text(SOURCE_KIND + "\n", encoding="utf-8")
    report = {"ok": [], "skipped": [], "failed": []}
    for rec in records:
        name = safe_name(rec["pid"])
        pdf_path = out / "pdf" / rec["unitId"] / rec["level"] / f"{name}.pdf"
        docx_path = out / "docx" / rec["unitId"] / rec["level"] / f"{name}.docx"
        meta_path = docx_path.with_suffix(".json")
        if meta_path.exists():
            report["skipped"].append(rec["pid"])
            continue
        data, url, reason = fetch(rec)
        if data is None:
            report["failed"].append({"pid": rec["pid"], "reason": reason})
            continue
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        docx_path.parent.mkdir(parents=True, exist_ok=True)
        pdf_path.write_bytes(data)
        try:
            converter = convert(pdf_path, docx_path)
        except Exception as exc:  # pretvorba moze pasti na skeniranom ili zasticenom PDF-u
            docx_path.unlink(missing_ok=True)
            report["failed"].append({"pid": rec["pid"], "reason": f"convert: {type(exc).__name__}: {exc}"})
            continue
        meta = sidecar(rec, url, data, docx_path.read_bytes(), converter, now())
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        report["ok"].append(rec["pid"])
    return report


def selftest():
    """Bez mreze i bez pdf2docx: granica repoa, imena, odabir, sidecar, preskakanje i pad pretvorbe."""
    assert out_dir_problem(ROOT / "tmp-korpus") is not None
    assert out_dir_problem(ROOT) is not None
    with tempfile.TemporaryDirectory() as tmp:
        assert out_dir_problem(tmp) is None
    assert safe_name("unizd:1234") == "unizd_1234"
    assert safe_name("a/b\\c") == "a_b_c"
    try:
        safe_name("::")
        raise AssertionError("prazno ime mora pasti")
    except ValueError:
        pass
    recs = [
        {"pid": "u:1", "repository": "r", "unitId": "u", "level": "diplomski"},
        {"pid": "u:2", "repository": "r", "unitId": "u", "level": "diplomski"},
        {"pid": "u:3", "repository": "r", "unitId": "u", "level": "diplomski"},
        {"pid": "u:4", "repository": "r", "unitId": "u", "level": "seminar"},
        {"pid": "u:5", "repository": "r", "unitId": "u", "level": "zavrsni"},
    ]
    picked, skipped = select_records(recs, 2)
    assert [r["pid"] for r in picked] == ["u:1", "u:2", "u:5"], picked
    assert [r["pid"] for r in skipped] == ["u:4"], skipped

    pdf = b"%PDF-1.7 test"
    calls = []

    def fake_fetch(rec):
        calls.append(rec["pid"])
        return (None, None, "http-404") if rec["pid"] == "u:2" else (pdf, "https://r/x", None)

    def fake_convert(pdf_path, docx_path):
        if "u_5" in docx_path.name:
            raise RuntimeError("skenirani PDF")
        docx_path.write_bytes(b"PK docx")
        return "fake 1.0"

    with tempfile.TemporaryDirectory() as tmp:
        rep = harvest(picked, tmp, fake_fetch, fake_convert, now=lambda: "2026-09-28T00:00:00+00:00")
        assert rep["ok"] == ["u:1"] and rep["skipped"] == [], rep
        assert [f["pid"] for f in rep["failed"]] == ["u:2", "u:5"], rep
        assert (Path(tmp) / KIND_MARKER).read_text(encoding="utf-8").strip() == SOURCE_KIND
        meta = json.loads((Path(tmp) / "docx" / "u" / "diplomski" / "u_1.json").read_text(encoding="utf-8"))
        assert meta["sourceKind"] == SOURCE_KIND and meta["workType"] == "graduate"
        assert meta["pdfSha256"] == sha256(pdf) and meta["docxSha256"] == sha256(b"PK docx")
        assert not (Path(tmp) / "docx" / "u" / "zavrsni" / "u_5.docx").exists(), "pala pretvorba ne ostavlja docx"
        # Drugi prolaz: obradjeni rad se preskace i ne preuzima ponovo (idempotencija).
        calls.clear()
        rep2 = harvest(picked, tmp, fake_fetch, fake_convert)
        assert rep2["skipped"] == ["u:1"] and "u:1" not in calls, (rep2, calls)
    print("selftest: ok")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--pids-file", action="append", help="JSON iz oai_discover.py; moze vise puta")
    ap.add_argument("--out-dir", help="mapa IZVAN repozitorija, npr. ~/Desktop/Lekta-korpus/05-pdf")
    ap.add_argument("--per-cell", type=int, default=2, help="najvise radova po (unitId, razina), zadano 2")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        selftest()
        return 0
    if not args.pids_file or not args.out_dir:
        ap.error("obavezno --pids-file i --out-dir")
    problem = out_dir_problem(args.out_dir)
    if problem:
        sys.exit(f"[pdf-korpus] FAIL: {problem}")
    try:
        import requests
        import pdf2docx  # noqa: F401
    except ImportError as exc:
        sys.exit(f"[pdf-korpus] FAIL: nedostaje {exc.name}; pip install --user requests pdf2docx")

    records = []
    for path in args.pids_file:
        records.extend(json.loads(Path(path).read_text(encoding="utf-8")))
    picked, skipped = select_records(records, args.per_cell)
    if skipped:
        print(f"[pdf-korpus] preskoceno {len(skipped)} zapisa bez poznate razine ili PID-a")

    session = requests.Session()
    last_request = {}
    report = harvest(
        picked,
        args.out_dir,
        lambda rec: fetch_pdf(session, rec["pid"], rec["repository"], last_request),
        convert_pdf2docx,
    )
    print(f"[pdf-korpus] gotovo: {len(report['ok'])}, vec obradjeno: {len(report['skipped'])}, palo: {len(report['failed'])}")
    for f in report["failed"]:
        print(f"  {f['pid']}: {f['reason']}")
    return 1 if picked and not report["ok"] and not report["skipped"] else 0


if __name__ == "__main__":
    sys.exit(main())
