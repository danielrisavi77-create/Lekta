# -*- coding: utf-8 -*-
"""Lokalni korpus za razinu A-pdf: javni radovi iz DABAR/Islandora repozitorija, PDF -> DOCX.

ZASTO. Odluka vlasnika 2026-09-28: javni studentski radovi iz PDF repozitorija (Dabar, ZIR),
pretvoreni u DOCX i popravljeni Lektom, daju ZASEBNU razinu A-pdf, nikad pravi A. Tok ide PREKO
POSTOJECEG INGESTA (pseudonimizacija, zapis o dopustenju, prepoznavanje profila, izlaz izvan repoa):

  1. python scripts/title-pages/oai_discover.py repozitorij.unizd.hr unizd --n 12 --out unizd.json
  2. python scripts/pdf-corpus/harvest_pdf_corpus.py --pids-file unizd.json \\
         --staging-dir ~/Lekta-korpus/05-pdf-staging --private-dir ~/Lekta-korpus/05-pdf-private
  3. npx vite-node scripts/corpus-ingest.mts -- --in ~/Lekta-korpus/05-pdf-staging \\
         --out ~/Lekta-korpus/05-pdf-ingest --consent <zapis> --source-kind public-pdf-converted
  4. npx vite-node scripts/repair-real-corpus.mts -- --only-root ~/Lekta-korpus/05-pdf-ingest
  5. node scripts/attest-real-corpus.mjs --source-kind public-pdf-converted --sign "Ime"

Korak 3 je OBAVEZAN: mjerni korpus smije biti samo izlaz ingesta (pseudonimiziran DOCX s profilom i
`sourceKind` u sidecaru, docs/superpowers/specs/2026-09-05-kanal-a-privola-korpusa.md). Staging mapa se
nikad ne mjeri izravno.

GRANICE (CLAUDE.md i odluka vlasnika): radovi smiju SAMO lokalno, na radnoj stanici. Svaki korijen
(staging, private, izvjestaj) odbija se unutar repozitorija; staging i private se ne smiju preklapati.
Skripta nista ne commita i ne salje nikamo osim sto preuzima s repozitorija teza.

IZLAZ:
  <staging>/.lekta-corpus-kind            "public-pdf-converted"; ingest ga provjerava uz --source-kind
  <staging>/.lekta-harvest-manifest.json  sha256 svih DOCX-ova koje je harvest dao (bez PID-a i URL-a);
                                          corpus-ingest --source-kind source-docx odbija mapu s njim, a uz
                                          --harvest-manifest i svaki DOCX s tim sha256
  <staging>/pdf-<sha16>.docx              DOCX sastavljen SAMO iz dopustenih dijelova paketa (ALLOWED_PARTS),
                                          s praznim docProps; ime nosi SAMO neutralan id iz sha256 PDF-a
  <private>/records/<unitId>/<razina>/<pid>.json
                                          PID, repozitorij, URL, sha256 PDF-a i DOCX-a, verzija alata
  <private>/records/.../<pid>.zastario-<id>.json  prethodni zapis kad --refresh nadje izmijenjen PDF
  <private>/zastarjelo/<id>.docx          prethodni DOCX tog zapisa, izvan staginga (ne mjeri se)
  <private>/pdf/pdf-<sha16>.pdf           izvorni PDF, SAMO uz --keep-pdf (zadano se brise)
  <private>/reports/harvest-<vrijeme>.json  izvjestaj svih zapisa (ili --report)
Identifikatori za dohvat (PID, URL, sha256 PDF-a) zive samo u private mapi, nikad u staging ni u
sidecaru mjerenja.

PRESKAKANJE (Codex #229 nalaz 06). Zapis se preskace kad su lokalni zapis i staging DOCX cjeloviti (sha256
DOCX-a, ista verzija alata). To NE znaci da je izvor isti: izvjestaj takav zapis nosi s `sourceVerified: false`.
`--refresh` ponovno dohvaca PDF i usporedjuje PUNI sha256: isti izvor daje `sourceVerified: true` bez upisa,
izmijenjen izvor novi zapis, a stari ostaje u private mapi oznacen kao zastario.

PRIVATNOST PAKETA (nalaz 04). Pretvoreni DOCX se slaze iz ALLOWLISTE dijelova (ALLOWED_PARTS); sve ostalo
(docProps/thumbnail, custom.xml, comments, people, customXml, header, footer) se izbacuje, a odnosi i
[Content_Types].xml se ciste. Revizijski identifikatori (w:rsid*, w:rsids u settings.xml) se brisu, a dokument
s autorom revizije (w:author/w:initials u w:ins, w:del i slicnim) se odbija. Dokument koji upucuje na izbaceni dio (zaglavlje, komentar, fusnota) se odbija:
privatnost se ne moze potvrditi. Ingest PDF vrste to ponovno provjerava i odbija dokument s praznim rjecnikom.

MREZA (nalaz 08). Svaki skok, i prvi zahtjev: samo https, port 443, bez korisnickih podataka u URL-u, host nije
IP adresa, a DNS razrjesenje ne smije dati privatnu, loopback, link-local, rezerviranu, multicast ni drugu
nejavnu adresu. Preostali rizik: requests razrjesava ime ponovno pri spajanju (DNS rebinding izmedju provjere i
spajanja nije zatvoren).

PUTANJE (nalaz 03). Na POSIX-u se pise preko direktorijskih handleova bez pracenja poveznica (O_NOFOLLOW,
O_DIRECTORY, upis i rename relativno na handle), pa zamjena roditeljske mape poveznicom nakon provjere ne
preusmjerava upis. Na Windowsu se svaka komponenta odbija ako je poveznica, junction ili drugi reparse point
(FILE_ATTRIBUTE_REPARSE_POINT); provjera i upis ondje nisu jedna operacija. Pretvarac (pdf2docx u podprocesu)
pise po PUTANJI u private/tmp, pa zamjena te mape u prozoru pretvorbe ostaje preostali rizik.

IZLAZNI KOD: 0 svi odabrani zapisi obradjeni ili vec obradjeni; 1 barem jedan zapis je pao;
2 neispravan ulaz, prazan izbor, korijen unutar repozitorija ili nepinane ovisnosti (nista se ne preuzima).

RIZIK PARSERA PDF-a. PDF je nepovjerljiv ulaz, a PyMuPDF (MuPDF, C) i pdf2docx ga parsiraju u cijelosti.
Pretvorba zato ide u zasebnom podprocesu s vremenskim ogranicenjem i, na POSIX-u, s ogranicenjem
memorije, CPU vremena i velicine datoteke (resource.setrlimit). Na Windowsu setrlimit ne postoji, pa
ostaje SAMO vremensko ogranicenje: skripta to ispisuje kao upozorenje i upisuje u izvjestaj (`sandbox`);
pokreci na radnoj stanici bez tajni u okolini.

OVISNOSTI (nalaz 09). Integritet paketa jamci SAMO instalacija: pip install --require-hashes -r
scripts/pdf-corpus/requirements.txt, u zasebnom venv-u. Skripta pri pokretanju provjerava SAMO VERZIJE
pdf2docx, pymupdf i requests (importlib.metadata) prema pinovima; ne provjerava hash instaliranih datoteka
ni ostale ovisnosti, pa paket zamijenjen uz istu oznaku verzije prolazi tu provjeru.

Pretvorba iz PDF-a nagadja strukturu (stilovi, sekcije, polja), zato je A-pdf odvojen od A.
Prije sirenja provjeri 2 do 3 pretvorena rada rucno: analizira li ih Lekta smisleno.

Samoprovjera bez mreze i bez ovisnosti: python scripts/pdf-corpus/harvest_pdf_corpus.py --selftest
"""
import argparse
import contextlib
import errno
import hashlib
import io
import ipaddress
import json
import os
import posixpath
import re
import secrets
import socket
import stat
import subprocess
import sys
import tempfile
import time
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[2]
REQUIREMENTS = Path(__file__).resolve().parent / "requirements.txt"
SOURCE_KIND = "public-pdf-converted"
KIND_MARKER = ".lekta-corpus-kind"
HARVEST_MANIFEST = ".lekta-harvest-manifest.json"
MANIFEST_KIND = "lekta-pdf-harvest-manifest"
TOOL_VERSION = "lekta-pdf-korpus/2"
USER_AGENT = "Lekta corpus tool (lekta.kontakt@gmail.com)"
HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/pdf"}
PDF_CONTENT_TYPES = {"application/pdf", "application/x-pdf"}
MAX_PDF_BYTES = 60 * 1024 * 1024
MAX_REDIRECTS = 5
HOST_DELAY_S = 3.0
RETRY_AFTER_CAP_S = 120.0
MAX_RETRIES = 3
RECORD_DEADLINE_S = 300.0
CONNECT_TIMEOUT_S = 15.0
READ_TIMEOUT_S = 60.0
CONVERT_TIMEOUT_S = 600
CONVERT_MEMORY_BYTES = 3 * 1024 ** 3
CONVERT_FILE_BYTES = 512 * 1024 ** 2
PER_CELL_MIN, PER_CELL_MAX = 1, 10
DEFAULT_PER_CELL = 2
DEFAULT_MAX_TOTAL = 50
MAX_TOTAL_LIMIT = 500

PID_RE = re.compile(r"^[a-z0-9_-]+:[0-9]+$")
UNIT_RE = re.compile(r"^[a-z0-9-]+$")
LABEL = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
HOST_RE = re.compile(rf"^(?=.{{1,253}}$){LABEL}(?:\.{LABEL})+$")
DOC_ID_RE = re.compile(r"^pdf-[0-9a-f]{16}$")
SEGMENT_RE = re.compile(r"^\.?[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
WINDOWS_RESERVED = {"con", "prn", "aux", "nul"} | {f"com{i}" for i in range(1, 10)} | {f"lpt{i}" for i in range(1, 10)}
# Razine iz oai_discover.py -> vrsta rada u Lektinim profilima.
LEVEL_TO_WORK_TYPE = {
    "diplomski": "graduate",
    "zavrsni": "final",
    "doktorski": "doctoral",
    "specijalisticki": "specialist",
}
EMPTY_CORE_XML = (
    b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    b'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
    b'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
    b'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>'
)
EMPTY_APP_XML = (
    b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    b'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
    b'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>'
)
SCRUBBED_PARTS = {"docProps/core.xml": EMPTY_CORE_XML, "docProps/app.xml": EMPTY_APP_XML}
# Jedini dijelovi paketa koji smiju u staging (nalaz 04); isti popis drzi PDF_DOPUSTENI_DIJELOVI u
# scripts/lib/corpus-attestation-core.mjs, koji ingest PDF vrste ponovno provjerava.
ALLOWED_PARTS = tuple(re.compile(p) for p in (
    r"\[Content_Types\]\.xml",
    r"_rels/\.rels",
    r"docProps/(?:core|app)\.xml",
    r"word/document\.xml",
    r"word/_rels/document\.xml\.rels",
    r"word/(?:styles|stylesWithEffects|numbering|settings|fontTable|webSettings)\.xml",
    r"word/theme/theme[0-9]+\.xml",
    r"(?i:word/media/[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|bmp|tiff?))",
))
# Upucivanja na dijelove kojih u allowlisti nema (komentar, fusnota, biljeska): takav dokument se odbija.
FOREIGN_REFERENCES = re.compile(rb"<w:(?:commentReference|commentRangeStart|footnoteReference|endnoteReference)\b")
# Autorstvo u zadrzanim XML dijelovima (nalaz 04): revizije (w:ins, w:del, w:rPrChange...) nose w:author i
# w:initials, a takav dokument se odbija. Revizijski identifikatori (w:rsid*, blok w:rsids u settings.xml)
# povezuju sesije uredjivanja i brisu se; vidljivi tekst se time ne mijenja.
AUTHOR_ATTR = re.compile(rb'\bw:(?:author|initials)="[^"]*\S[^"]*"')
RSID_ATTR = re.compile(rb'\s+w:rsid[A-Za-z]*="[^"]*"')
RSIDS_BLOCK = re.compile(rb"<w:rsids\b[^>]*/>|<w:rsids\b.*?</w:rsids>", re.S)
CT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
FILE_ATTRIBUTE_REPARSE_POINT = 0x400


class InputError(Exception):
    """Neispravan ulaz ili konfiguracija: izlaz 2, nista se ne preuzima."""


class PathError(Exception):
    """Odrediste izvan korijena, nevaljan segment ili simbolicka poveznica na putu."""


class FetchError(Exception):
    def __init__(self, reason, fatal=False):
        super().__init__(reason)
        self.fatal = fatal


class ConvertError(Exception):
    pass


# --------------------------------------------------------------------------------------------------
# Putanje

def out_dir_problem(out_dir, root=ROOT):
    """Radovi ne smiju u repozitorij: izlaz unutar korijena repoa je problem."""
    out = Path(out_dir).expanduser().resolve()
    repo = Path(root).resolve()
    if out == repo or repo in out.parents:
        return f"izlazna mapa {out} je unutar repozitorija; radovi smiju samo izvan njega"
    return None


def _inside(child, parent):
    return child == parent or parent in child.parents


# Pisanje preko direktorijskih handleova (POSIX, nalaz 03): svaka komponenta se otvara relativno na vec otvoren
# roditelj, s O_NOFOLLOW i O_DIRECTORY, a upis i rename idu relativno na handle zadnje mape. Zamjena roditelja
# poveznicom NAKON otvaranja ne preusmjerava upis: handle drzi izvornu mapu. Bez dir_fd (Windows) ostaje
# provjera putanje, uz odbijanje poveznice, junctiona i svakog drugog reparse pointa na svakoj komponenti.
DIR_FLAGS = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0)
USE_DIR_FD = (os.name == "posix" and hasattr(os, "O_NOFOLLOW") and hasattr(os, "O_DIRECTORY")
              and {os.open, os.mkdir, os.stat, os.unlink, os.rename} <= os.supports_dir_fd)
LINK_ERRNOS = {errno.ELOOP, errno.ENOTDIR, getattr(errno, "EMLINK", errno.ELOOP)}
# lstat kao ulaz: samoprovjera i test simuliraju Windows junction (st_file_attributes) i na Linuxu.
LSTAT = os.lstat


def is_link_or_reparse(st):
    """Simbolicka poveznica, ili na Windowsu junction i svaki drugi reparse point."""
    return stat.S_ISLNK(st.st_mode) or bool(getattr(st, "st_file_attributes", 0) & FILE_ATTRIBUTE_REPARSE_POINT)


def refuse_reparse(path):
    """PathError kad je `path` poveznica, junction ili reparse point; False kad ne postoji, inace True."""
    try:
        st = LSTAT(path)
    except FileNotFoundError:
        return False
    if is_link_or_reparse(st) or getattr(os.path, "isjunction", lambda _p: False)(path):
        raise PathError(f"{path} je simbolicka poveznica, junction ili reparse point")
    return True


def prepare_root(path, label, repo=ROOT):
    """Apsolutan, razrijesen korijen izvan repozitorija; sam korijen ne smije biti poveznica ni junction."""
    raw = Path(os.path.abspath(Path(path).expanduser()))
    try:
        refuse_reparse(raw)
    except PathError:
        raise InputError(f"{label}: {raw} je simbolicka poveznica ili junction; zadaj stvarnu mapu")
    problem = out_dir_problem(raw, repo)
    if problem:
        raise InputError(f"{label}: {problem}")
    return raw.resolve()


def check_segment(part):
    if not isinstance(part, str) or not SEGMENT_RE.match(part) or part.split(".")[0].lower() in WINDOWS_RESERVED:
        raise PathError(f"nevaljan segment putanje: {part!r}")
    return part


def safe_target(root, *parts):
    """Odrediste unutar `root` provjereno PO PUTANJI (put bez dir_fd, Windows): nijedna komponenta nije
    poveznica, junction ni reparse point, a razrijesena putanja je unutar korijena; inace PathError.

    Poziva se NEPOSREDNO prije svakog upisa i brisanja. Poveznica koja pokazuje UNUTAR korijena prosla bi
    provjeru razrijesene putanje, pa se svaka komponenta provjerava zasebno.
    """
    root = Path(root)
    for part in parts:
        check_segment(part)
    refuse_reparse(root)
    cur = root
    for part in parts:
        cur = cur / part
        refuse_reparse(cur)
    resolved = cur.resolve()
    if not _inside(resolved, root.resolve()) or resolved == root.resolve():
        raise PathError(f"{resolved} nije unutar {root}")
    return cur


def _open_dir_at(dfd, name, label):
    try:
        return os.open(name, DIR_FLAGS, dir_fd=dfd)
    except OSError as exc:
        if exc.errno in LINK_ERRNOS:
            raise PathError(f"{label} je simbolicka poveznica ili nije mapa")
        raise


@contextlib.contextmanager
def dir_handle(root, dir_parts, create):
    """Handle mape root/dir_parts otvoren komponentu po komponentu bez pracenja poveznica (samo POSIX)."""
    for part in dir_parts:
        check_segment(part)
    root = Path(root)
    if create:
        root.mkdir(parents=True, exist_ok=True)
    fd = _open_dir_at(None, str(root), root)
    try:
        cur = root
        for part in dir_parts:
            cur = cur / part
            if create:
                try:
                    os.mkdir(part, 0o700, dir_fd=fd)
                except FileExistsError:
                    pass
            nfd = _open_dir_at(fd, part, cur)
            os.close(fd)
            fd = nfd
        yield fd
    finally:
        os.close(fd)


def _no_link_at(dfd, name, label):
    try:
        st = os.stat(name, dir_fd=dfd, follow_symlinks=False)
    except FileNotFoundError:
        return None
    if is_link_or_reparse(st):
        raise PathError(f"{label} je simbolicka poveznica")
    return st


def ensure_dirs(root, *parts):
    cur = Path(root)
    refuse_reparse(cur)
    cur.mkdir(parents=True, exist_ok=True)
    for part in parts:
        cur = safe_target(root, *(Path(cur).relative_to(root).parts + (part,)))
        cur.mkdir(exist_ok=True)
        if refuse_reparse(cur) and not cur.is_dir():
            raise PathError(f"{cur} nije obicna mapa")
    return cur


def safe_write(root, parts, data):
    """Atomski upis bajtova u root/parts, unutar korijena i bez poveznice ili junctiona na putu."""
    parts = tuple(parts)
    for part in parts:
        check_segment(part)
    target = Path(root, *parts)
    if not USE_DIR_FD:
        return _safe_write_path(root, parts, data)
    with dir_handle(root, parts[:-1], create=True) as dfd:
        _no_link_at(dfd, parts[-1], target)
        tmp = f".tmp-{secrets.token_hex(8)}.part"
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0), 0o600, dir_fd=dfd)
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(data)
            _no_link_at(dfd, parts[-1], target)
            os.rename(tmp, parts[-1], src_dir_fd=dfd, dst_dir_fd=dfd)
        except BaseException:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(tmp, dir_fd=dfd)
            raise
    return target


def _safe_write_path(root, parts, data):
    ensure_dirs(root, *parts[:-1])
    target = safe_target(root, *parts)
    fd, tmp = tempfile.mkstemp(dir=str(target.parent), prefix=".tmp-", suffix=".part")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        target = safe_target(root, *parts)
        os.replace(tmp, target)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    return target


def safe_read(root, parts):
    """Bajtovi obicne datoteke root/parts bez pracenja poveznica; None kad je nema."""
    parts = tuple(parts)
    for part in parts:
        check_segment(part)
    if not USE_DIR_FD:
        target = safe_target(root, *parts)
        return target.read_bytes() if target.is_file() else None
    try:
        with dir_handle(root, parts[:-1], create=False) as dfd:
            st = _no_link_at(dfd, parts[-1], Path(root, *parts))
            if st is None or not stat.S_ISREG(st.st_mode):
                return None
            fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0), dir_fd=dfd)
            with os.fdopen(fd, "rb") as fh:
                return fh.read()
    except FileNotFoundError:
        return None


def safe_unlink(root, parts):
    parts = tuple(parts)
    for part in parts:
        check_segment(part)
    if not USE_DIR_FD:
        safe_target(root, *parts).unlink(missing_ok=True)
        return
    with contextlib.suppress(FileNotFoundError):
        with dir_handle(root, parts[:-1], create=False) as dfd:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(parts[-1], dir_fd=dfd)


def pid_file_name(pid):
    return pid.replace(":", "_") + ".json"


def doc_id(pdf_sha):
    return f"pdf-{pdf_sha[:16]}"


# --------------------------------------------------------------------------------------------------
# Ulaz

def validate_record(rec):
    """Popis problema zapisa iz oai_discover.py (prazan znaci valjan)."""
    if not isinstance(rec, dict):
        return ["zapis nije objekt"]
    problems = []
    pid, repo, unit, level = rec.get("pid"), rec.get("repository"), rec.get("unitId"), rec.get("level")
    if not isinstance(pid, str) or not PID_RE.match(pid):
        problems.append(f"pid {pid!r} nije oblika ns:broj ({PID_RE.pattern})")
    if not isinstance(repo, str) or not HOST_RE.match(repo):
        problems.append(f"repository {repo!r} nije ime hosta (bez sheme, porta i putanje)")
    if not isinstance(unit, str) or not UNIT_RE.match(unit):
        problems.append(f"unitId {unit!r} nije oblika {UNIT_RE.pattern}")
    if level not in LEVEL_TO_WORK_TYPE:
        problems.append(f"level {level!r} nije u {sorted(LEVEL_TO_WORK_TYPE)}")
    return problems


def load_discovery(path):
    """Zapisi iz izlaza oai_discover.py --out: OBJEKT s poljem `picked`. Drugi oblik je InputError."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise InputError(f"{path}: nije citljiv JSON ({type(exc).__name__}: {exc})")
    if not isinstance(data, dict) or not isinstance(data.get("picked"), list):
        shape = type(data).__name__ if not isinstance(data, dict) else f"objekt bez liste 'picked' (kljucevi {sorted(data)})"
        raise InputError(
            f"{path}: ocekivan izlaz scripts/title-pages/oai_discover.py --out, objekt s listom 'picked'; dobiven {shape}"
        )
    host, unit = data.get("host"), data.get("unitId")
    records, invalid = [], []
    for i, rec in enumerate(data["picked"]):
        problems = validate_record(rec)
        if not problems and host is not None and rec["repository"] != host:
            problems.append(f"repository {rec['repository']!r} se razlikuje od host {host!r} iste datoteke")
        if not problems and unit is not None and rec["unitId"] != unit:
            problems.append(f"unitId {rec['unitId']!r} se razlikuje od unitId {unit!r} iste datoteke")
        if problems:
            invalid.append({"file": str(path), "index": i, "status": "invalid", "reason": "; ".join(problems),
                            **({"pid": rec.get("pid")} if isinstance(rec, dict) and isinstance(rec.get("pid"), str) else {})})
        else:
            records.append({k: rec[k] for k in ("pid", "repository", "unitId", "level")})
    return records, invalid


def select_records(records, per_cell, max_total):
    """Najvise per_cell radova po (unitId, razina) i max_total ukupno, redoslijedom ulaza; ponovljen PID jednom."""
    seen_cell, seen_pid, picked, rest = {}, set(), [], []
    for rec in records:
        if rec["pid"] in seen_pid:
            rest.append({**rec, "status": "duplicate", "reason": "PID se ponavlja u ulazu"})
            continue
        seen_pid.add(rec["pid"])
        key = (rec["unitId"], rec["level"])
        if seen_cell.get(key, 0) >= per_cell:
            rest.append({**rec, "status": "not-selected", "reason": f"--per-cell {per_cell}"})
            continue
        if len(picked) >= max_total:
            rest.append({**rec, "status": "not-selected", "reason": f"--max-total {max_total}"})
            continue
        seen_cell[key] = seen_cell.get(key, 0) + 1
        picked.append(rec)
    return picked, rest


# --------------------------------------------------------------------------------------------------
# Dohvat

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


def header(resp, name):
    for key, value in (resp.headers or {}).items():
        if key.lower() == name.lower():
            return value
    return None


def parse_retry_after(value, wall_now):
    """Sekunde iz Retry-After (broj ili HTTP datum); None kad nema ili se ne da procitati."""
    if value is None:
        return None
    value = str(value).strip()
    if re.fullmatch(r"\d+", value):
        return float(value)
    try:
        when = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if when is None:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return max(0.0, when.timestamp() - wall_now)


def checked_redirect(current, location):
    nxt = urljoin(current, location)
    parts = urlsplit(nxt)
    host = (parts.hostname or "").lower()
    if parts.scheme != "https":
        raise FetchError(f"preusmjeravanje na ne-https adresu ({parts.scheme or 'bez sheme'})")
    if parts.username or parts.password or parts.port not in (None, 443) or not HOST_RE.match(host):
        raise FetchError(f"preusmjeravanje na nevaljan host {parts.netloc!r}")
    return nxt


def default_resolver(host):
    """Sve adrese na koje se ime razrjesava (getaddrinfo, port 443)."""
    return sorted({info[4][0] for info in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)})


def not_public(ip):
    """Adresa na koju dohvat ne smije: privatna, loopback, link-local, rezervirana, multicast ili druga nejavna."""
    if ip.version == 6 and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast
            or ip.is_unspecified or not ip.is_global)


def url_problem(url, resolver):
    """Razlog zbog kojeg se `url` ne smije dohvatiti, ili None (nalaz 08). Vrijedi za SVAKI skok, i prvi."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if parts.scheme != "https":
        return f"adresa nije https ({parts.scheme or 'bez sheme'})"
    if parts.username or parts.password or parts.port not in (None, 443) or not HOST_RE.match(host):
        return f"nevaljan host {parts.netloc!r}"
    try:
        ipaddress.ip_address(host)
        return f"host {host!r} je IP adresa; dopusteno je samo ime hosta"
    except ValueError:
        pass
    if host.rsplit(".", 1)[-1].isdigit():
        return f"host {host!r} zavrsava brojcanom oznakom (oblik IP adrese)"
    try:
        addrs = list(resolver(host))
    except (OSError, UnicodeError) as exc:
        return f"DNS razrjesenje {host!r} nije uspjelo ({type(exc).__name__})"
    if not addrs:
        return f"DNS razrjesenje {host!r} nije dalo nijednu adresu"
    for addr in addrs:
        try:
            ip = ipaddress.ip_address(str(addr).split("%")[0])
        except ValueError:
            return f"DNS razrjesenje {host!r} dalo je nevaljanu adresu {addr!r}"
        if not_public(ip):
            return f"host {host!r} razrjesava na nejavnu adresu {ip} (privatna, loopback, link-local, rezervirana ili multicast)"
    return None


class Fetcher:
    """HTTP dohvat PDF-a s ogranicenjima; `transport(url, headers, timeout)` vraca odgovor kao requests.

    Odgovor mora imati `status_code`, `headers`, `iter_content(n)` i `close()`. Preusmjeravanja prati
    ovaj kod (transport ih ne smije pratiti), pa se cekanje po hostu racuna po STVARNOM hostu svakog skoka.
    """

    def __init__(self, transport, clock=time.monotonic, sleep=time.sleep, wall=time.time,
                 host_delay=HOST_DELAY_S, deadline_s=RECORD_DEADLINE_S, max_bytes=MAX_PDF_BYTES, resolver=default_resolver):
        self.transport, self.clock, self.sleep, self.wall = transport, clock, sleep, wall
        self.resolver = resolver
        self.host_delay, self.deadline_s, self.max_bytes = host_delay, deadline_s, max_bytes
        self.last_request = {}

    def _wait_for_host(self, host, deadline):
        last = self.last_request.get(host)
        if last is not None:
            wait = self.host_delay - (self.clock() - last)
            if wait > 0:
                if self.clock() + wait >= deadline:
                    raise FetchError("ukupni timeout zapisa", fatal=True)
                self.sleep(wait)
        self.last_request[host] = self.clock()

    def fetch_record(self, rec):
        """(bytes, trazeni_url, konacni_url) ili FetchError sa svim razlozima."""
        deadline = self.clock() + self.deadline_s
        reasons = []
        for url in candidate_urls(rec["pid"], rec["repository"]):
            try:
                data, final = self._fetch_url(url, deadline)
                return data, url, final
            except FetchError as exc:
                reasons.append(f"{urlsplit(url).path}: {exc}")
                if exc.fatal:
                    break
        raise FetchError("; ".join(reasons))

    def _fetch_url(self, url, deadline):
        current, redirects, retries = url, 0, 0
        while True:
            remaining = deadline - self.clock()
            if remaining <= 0:
                raise FetchError("ukupni timeout zapisa", fatal=True)
            problem = url_problem(current, self.resolver)
            if problem:
                raise FetchError(problem)
            host = urlsplit(current).hostname.lower()
            self._wait_for_host(host, deadline)
            remaining = deadline - self.clock()
            resp = self.transport(current, headers=dict(HEADERS),
                                  timeout=(min(CONNECT_TIMEOUT_S, remaining), min(READ_TIMEOUT_S, remaining)))
            try:
                status = resp.status_code
                if status in (301, 302, 303, 307, 308):
                    location = header(resp, "Location")
                    if not location:
                        raise FetchError(f"http-{status} bez Location")
                    redirects += 1
                    if redirects > MAX_REDIRECTS:
                        raise FetchError(f"previse preusmjeravanja (> {MAX_REDIRECTS})")
                    current = checked_redirect(current, location)
                    continue
                if status in (429, 503):
                    retries += 1
                    if retries > MAX_RETRIES:
                        raise FetchError(f"http-{status} i nakon {MAX_RETRIES} ponavljanja")
                    delay = parse_retry_after(header(resp, "Retry-After"), self.wall())
                    delay = 5.0 * retries if delay is None else delay
                    if delay > RETRY_AFTER_CAP_S:
                        raise FetchError(f"http-{status}: Retry-After {delay:.0f} s je iznad granice {RETRY_AFTER_CAP_S:.0f} s", fatal=True)
                    if self.clock() + delay >= deadline:
                        raise FetchError("ukupni timeout zapisa (Retry-After)", fatal=True)
                    self.sleep(delay)
                    self.last_request[host] = self.clock()
                    continue
                if status != 200:
                    raise FetchError(f"http-{status}")
                ctype = (header(resp, "Content-Type") or "").split(";")[0].strip().lower()
                if ctype not in PDF_CONTENT_TYPES:
                    raise FetchError(f"Content-Type {ctype or '(nema)'} nije PDF")
                length = header(resp, "Content-Length")
                if length is not None and str(length).strip().isdigit() and int(length) > self.max_bytes:
                    raise FetchError(f"prevelik odgovor (Content-Length {int(length)} > {self.max_bytes})")
                buf = bytearray()
                for chunk in resp.iter_content(64 * 1024):
                    if not chunk:
                        continue
                    buf += chunk
                    if len(buf) > self.max_bytes:
                        raise FetchError(f"prevelik odgovor (> {self.max_bytes} bajtova)")
                    if self.clock() > deadline:
                        raise FetchError("ukupni timeout zapisa (citanje)", fatal=True)
                if not bytes(buf[:5]) == b"%PDF-":
                    raise FetchError("sadrzaj ne pocinje s %PDF- (prijava, embargo ili HTML)")
                return bytes(buf), current
            finally:
                close = getattr(resp, "close", None)
                if close:
                    close()


def requests_transport():
    import requests

    session = requests.Session()

    def get(url, headers, timeout):
        return session.get(url, headers=headers, timeout=timeout, allow_redirects=False, stream=True)

    return get


# --------------------------------------------------------------------------------------------------
# Pretvorba

def _limit_resources(timeout):
    import resource

    resource.setrlimit(resource.RLIMIT_AS, (CONVERT_MEMORY_BYTES, CONVERT_MEMORY_BYTES))
    resource.setrlimit(resource.RLIMIT_CPU, (timeout + 5, timeout + 10))
    resource.setrlimit(resource.RLIMIT_FSIZE, (CONVERT_FILE_BYTES, CONVERT_FILE_BYTES))


HAS_RLIMIT = os.name == "posix"
SANDBOX_WARNING = (f"[pdf-korpus] UPOZORENJE: na ovom sustavu (Windows) podproces pretvorbe NEMA memorijski, CPU ni "
                   f"datotecni limit, samo vremensko ogranicenje od {CONVERT_TIMEOUT_S} s; pokreci na radnoj stanici bez tajni u okolini")


def run_limited(cmd, timeout=CONVERT_TIMEOUT_S):
    """Podproces s vremenskim ogranicenjem i (POSIX) ogranicenjem memorije, CPU-a i velicine datoteke."""
    kwargs = {}
    if HAS_RLIMIT:
        kwargs["preexec_fn"] = lambda: _limit_resources(timeout)
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, **kwargs)
    except subprocess.TimeoutExpired:
        raise ConvertError(f"pretvorba prekinuta nakon {timeout} s")
    if proc.returncode != 0:
        tail = (proc.stderr or "").strip().splitlines()[-1:] or ["bez poruke"]
        raise ConvertError(f"pretvorba pala (izlaz {proc.returncode}): {tail[0][:300]}")
    return proc


def convert_subprocess(pdf_path, docx_path):
    run_limited([sys.executable, str(Path(__file__).resolve()), "--convert-worker", str(pdf_path), str(docx_path)])


def convert_worker(pdf_path, docx_path):
    from pdf2docx import Converter

    conv = Converter(str(pdf_path))
    try:
        conv.convert(str(docx_path))
    finally:
        conv.close()


def pinned_versions(path=REQUIREMENTS):
    pins = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        m = re.match(r"^([A-Za-z0-9_.-]+)==([^\s\\;]+)", line.strip())
        if m:
            pins[m.group(1).lower().replace("_", "-")] = m.group(2)
    return pins


def installed_converter_id():
    """Verzija alata iz instaliranih paketa; InputError kad se ne slaze s requirements.txt.

    Provjerava SAMO VERZIJE tri izravne ovisnosti (importlib.metadata), ne hash instaliranih datoteka ni
    tranzitivne ovisnosti: integritet jamci jedino pip install --require-hashes (nalaz 09)."""
    from importlib import metadata

    pins = pinned_versions()
    found = {}
    for name in ("pdf2docx", "pymupdf", "requests"):
        try:
            found[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            found[name] = None
    wrong = [f"{n} {found[n]} (pinano {pins.get(n)})" for n in found if found[n] != pins.get(n)]
    if wrong:
        raise InputError(
            "instalirane ovisnosti nisu pinane: " + ", ".join(wrong)
            + "; pip install --require-hashes -r scripts/pdf-corpus/requirements.txt"
        )
    return f"{TOOL_VERSION}; pdf2docx=={found['pdf2docx']}; pymupdf=={found['pymupdf']}"


def _allowed_part(name):
    return any(p.fullmatch(name) for p in ALLOWED_PARTS)


def _xml(data, part):
    try:
        return ET.fromstring(data)
    except ET.ParseError as exc:
        raise ConvertError(f"{part} nije ispravan XML ({exc})")


def _serialize(root):
    """XML s izvornim imenskim prostorom korijena kao zadanim (bez prefiksa ns0:, koje Word ne ocekuje)."""
    if root.tag.startswith("{"):
        ET.register_namespace("", root.tag[1:].split("}", 1)[0])
    return ET.tostring(root, encoding="UTF-8", xml_declaration=True)


def _rels_base(rels_name):
    """Mapa izvornog dijela za datoteku odnosa: "_rels/.rels" -> "", "word/_rels/document.xml.rels" -> "word/"."""
    return rels_name.rsplit("_rels/", 1)[0]


def _rels_owner(rels_name):
    base = _rels_base(rels_name)
    return base + rels_name.rsplit("/", 1)[1][: -len(".rels")]


def _filter_rels(data, rels_name, kept):
    """Odnosi prema izbacenim dijelovima se uklanjaju; vraca (bajtovi, preostali Id-ovi)."""
    root = _xml(data, rels_name)
    base = _rels_base(rels_name)
    for rel in list(root):
        target = rel.get("Target", "")
        if rel.get("TargetMode") == "External":
            # Vanjske poveznice tijela (hiperveze) ostaju; vanjski odnos samog paketa nema svrhu u pretvorbi.
            if base == "":
                root.remove(rel)
            continue
        part = target[1:] if target.startswith("/") else posixpath.normpath(posixpath.join(base, target))
        if part not in kept:
            root.remove(rel)
    return _serialize(root), {rel.get("Id") for rel in root}


def _filter_content_types(data, kept):
    root = _xml(data, "[Content_Types].xml")
    for el in list(root):
        if el.tag.endswith("Override") and el.get("PartName", "").lstrip("/") not in kept:
            root.remove(el)
    return _serialize(root)


def _referenced_rel_ids(data):
    text = data.decode("utf-8", "replace")
    prefixes = set(re.findall(r'xmlns:([A-Za-z_][\w.-]*)="' + re.escape(OFFICE_REL_NS) + '"', text))
    ids = set()
    for prefix in prefixes:
        ids |= set(re.findall(rf'(?<![\w.-]){re.escape(prefix)}:[A-Za-z]+="([^"]*)"', text))
    return ids


def scrub_docx_parts(raw):
    """DOCX sastavljen SAMO iz dopustenih dijelova (ALLOWED_PARTS), s praznim docProps i fiksnim vremenima zip
    zapisa; vraca (bajtovi, izbaceni dijelovi). ConvertError kad dokument upucuje na izbaceni dio: tada se
    privatnost ne moze potvrditi, pa se ne isporucuje (nalaz 04)."""
    try:
        zin = zipfile.ZipFile(io.BytesIO(raw))
        names = zin.namelist()
    except zipfile.BadZipFile as exc:
        raise ConvertError(f"pretvorba nije dala zip paket ({exc})")
    if "word/document.xml" not in names or "[Content_Types].xml" not in names:
        raise ConvertError("pretvorba nije dala DOCX (nema word/document.xml ili [Content_Types].xml)")
    kept = [n for n in names if _allowed_part(n)]
    dropped = sorted(n for n in names if n not in kept)
    kept_set = set(kept)
    data = {n: SCRUBBED_PARTS.get(n) or zin.read(n) for n in kept}
    rel_ids = {}
    for name in kept:
        if name.endswith(".rels"):
            data[name], rel_ids[_rels_owner(name)] = _filter_rels(data[name], name, kept_set)
    data["[Content_Types].xml"] = _filter_content_types(data["[Content_Types].xml"], kept_set)
    for name in kept:
        if name.endswith(".xml") and name not in SCRUBBED_PARTS:
            if AUTHOR_ATTR.search(data[name]):
                raise ConvertError(f"{name} nosi autora revizije ili komentara (w:author/w:initials); privatnost se ne moze potvrditi")
            data[name] = RSID_ATTR.sub(b"", RSIDS_BLOCK.sub(b"", data[name]))
    if FOREIGN_REFERENCES.search(data["word/document.xml"]):
        raise ConvertError("word/document.xml upucuje na komentar, fusnotu ili biljesku, a ti dijelovi ne smiju u staging")
    for name in kept:
        if name.endswith(".xml") and name not in SCRUBBED_PARTS:
            missing = _referenced_rel_ids(data[name]) - rel_ids.get(name, set())
            if missing:
                raise ConvertError(f"{name} upucuje na izbaceni dio (odnos {', '.join(sorted(missing))}); privatnost se ne moze potvrditi")
    order = ["[Content_Types].xml"] + [n for n in kept if n != "[Content_Types].xml"]
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for name in order:
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            zout.writestr(entry, data[name])
    return out.getvalue(), dropped


def scrub_docx(raw):
    return scrub_docx_parts(raw)[0]


# --------------------------------------------------------------------------------------------------
# Tok

def read_json_bytes(data):
    try:
        return json.loads(data.decode("utf-8")) if data is not None else None
    except (UnicodeDecodeError, ValueError):
        return None


def record_parts(rec, name=None):
    return ("records", rec["unitId"], rec["level"], name or pid_file_name(rec["pid"]))


def already_done(rec, staging, private, converter):
    """Prethodni zapis kad je LOKALNI ARTEFAKT cjelovit, inace None: zapis u private mapi i staging DOCX postoje,
    sha256 DOCX-a odgovara zapisu i zapis je nastao istom (pinanom) verzijom alata. Je li IZVOR jos isti, ovo ne
    zna (nalaz 06): to provjerava tek --refresh punim sha256 PDF-a."""
    prev = read_json_bytes(safe_read(private, record_parts(rec)))
    if not isinstance(prev, dict) or prev.get("pid") != rec["pid"]:
        return None
    if not isinstance(prev.get("id"), str) or not DOC_ID_RE.match(prev["id"]):
        return None
    if prev.get("converter") != converter:
        return None
    docx = safe_read(staging, (prev["id"] + ".docx",))
    if docx is None or sha256(docx) != prev.get("docxSha256"):
        return None
    return prev


def retire(prev, rec, staging, private, new_id, now):
    """Izvor se promijenio: stari zapis ostaje u private mapi oznacen kao zastario, a stari DOCX izlazi iz
    staginga u private/zastarjelo (ne mjeri se vise)."""
    stale = {**prev, "stale": True, "staleSince": now(), "supersededBy": new_id}
    safe_write(private, record_parts(rec, f"{rec['pid'].replace(':', '_')}.zastario-{prev['id']}.json"),
               (json.dumps(stale, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    if prev["id"] != new_id:
        old = safe_read(staging, (prev["id"] + ".docx",))
        if old is not None:
            safe_write(private, ("zastarjelo", prev["id"] + ".docx"), old)
            safe_unlink(staging, (prev["id"] + ".docx",))


def process_record(rec, staging, private, fetcher, convert, converter, keep_pdf, now, produced, refresh=False):
    """Jedan zapis: dohvat, pretvorba u private/tmp, ciscenje, upis u staging, zapis u private."""
    prev = already_done(rec, staging, private, converter)
    if prev and not refresh:
        return {"status": "skipped", "id": prev["id"], "docxSha256": prev["docxSha256"], "sourceVerified": False,
                "reason": "lokalni artefakt cjelovit (sha256 DOCX-a odgovara zapisu); izvor nije ponovno provjeren (--refresh)"}
    data, requested_url, final_url = fetcher.fetch_record(rec)
    pdf_sha = sha256(data)
    if prev and prev.get("pdfSha256") == pdf_sha:
        return {"status": "skipped", "id": prev["id"], "docxSha256": prev["docxSha256"], "sourceVerified": True,
                "reason": "izvor isti: puni sha256 PDF-a odgovara zapisu"}
    ident = doc_id(pdf_sha)
    extra = {}
    if ident in produced:
        docx_sha = produced[ident]["docxSha256"]
        extra["duplicateOf"] = produced[ident]["pid"]
    else:
        tmp_pdf = safe_write(private, ("tmp", ident + ".pdf"), data)
        tmp_docx = Path(private, "tmp", ident + ".docx")
        try:
            convert(tmp_pdf, tmp_docx)
            raw = safe_read(private, ("tmp", ident + ".docx"))
            if raw is None:
                raise ConvertError("pretvorba nije zapisala DOCX u private/tmp")
            docx, dropped = scrub_docx_parts(raw)
            safe_write(staging, (ident + ".docx",), docx)
            docx_sha = sha256(docx)
            if dropped:
                extra["droppedParts"] = dropped
            if keep_pdf:
                safe_write(private, ("pdf", ident + ".pdf"), data)
        finally:
            safe_unlink(private, ("tmp", ident + ".docx"))
            safe_unlink(private, ("tmp", ident + ".pdf"))
        produced[ident] = {"docxSha256": docx_sha, "pid": rec["pid"]}
    if prev:
        extra["replaces"] = prev["id"]
    record = {
        "schemaVersion": 1,
        "sourceKind": SOURCE_KIND,
        "id": ident,
        "pid": rec["pid"],
        "repository": rec["repository"],
        "unitId": rec["unitId"],
        "level": rec["level"],
        "workType": LEVEL_TO_WORK_TYPE[rec["level"]],
        "requestedUrl": requested_url,
        "finalUrl": final_url,
        "fetchedAt": now(),
        "pdfSha256": pdf_sha,
        "pdfBytes": len(data),
        "pdfKept": bool(keep_pdf),
        "docxSha256": docx_sha,
        "converter": converter,
        **extra,
    }
    safe_write(private, record_parts(rec), (json.dumps(record, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    if prev:
        retire(prev, rec, staging, private, ident, now)
    return {"status": "ok", "id": ident, "docxSha256": docx_sha, "sourceVerified": True, **extra}


def update_manifest(staging, entries):
    """Manifest harvesta u stagingu: unija sha256 svih DOCX-ova koje je harvest ikad dao (bez PID-a i URL-a).
    corpus-ingest --source-kind source-docx odbija mapu s njim, a uz --harvest-manifest i svaki DOCX s tim
    sha256 (nalaz 02). Pise se samo kad se sadrzaj mijenja, pa je ponovljen prolaz no-op."""
    old = read_json_bytes(safe_read(staging, (HARVEST_MANIFEST,)))
    shas = set(old.get("docxSha256", [])) if isinstance(old, dict) and old.get("kind") == MANIFEST_KIND else set()
    shas |= {e["docxSha256"] for e in entries if e.get("status") in ("ok", "skipped") and e.get("docxSha256")}
    if not shas:
        return
    body = {"schemaVersion": 1, "kind": MANIFEST_KIND, "sourceKind": SOURCE_KIND, "tool": TOOL_VERSION,
            "docxSha256": sorted(shas)}
    data = (json.dumps(body, indent=2) + "\n").encode("utf-8")
    if safe_read(staging, (HARVEST_MANIFEST,)) != data:
        safe_write(staging, (HARVEST_MANIFEST,), data)


def harvest(records, staging, private, fetcher, convert, converter, keep_pdf=False,
            now=lambda: datetime.now(timezone.utc).isoformat(), refresh=False):
    marker = (SOURCE_KIND + "\n").encode("utf-8")
    if safe_read(staging, (KIND_MARKER,)) != marker:
        safe_write(staging, (KIND_MARKER,), marker)
    produced, out = {}, []
    for rec in records:
        base = {k: rec[k] for k in ("pid", "unitId", "level")}
        try:
            out.append({**base, **process_record(rec, staging, private, fetcher, convert, converter, keep_pdf, now, produced, refresh)})
        except FetchError as exc:
            out.append({**base, "status": "failed", "stage": "fetch", "reason": str(exc)})
        except ConvertError as exc:
            out.append({**base, "status": "failed", "stage": "convert", "reason": str(exc)})
        except PathError as exc:
            out.append({**base, "status": "failed", "stage": "path", "reason": str(exc)})
        except OSError as exc:
            out.append({**base, "status": "failed", "stage": "io", "reason": f"{type(exc).__name__}: {exc}"})
        except Exception as exc:  # noqa: BLE001 - svaki pad zapisa ide u izvjestaj i u izlazni kod, ne u traceback
            out.append({**base, "status": "failed", "stage": "unexpected", "reason": f"{type(exc).__name__}: {exc}"})
    update_manifest(staging, out)
    return out


def summarize(entries):
    summary = {}
    for e in entries:
        summary[e["status"]] = summary.get(e["status"], 0) + 1
    return summary


def write_report(target, report):
    root, parts = target
    Path(root).mkdir(parents=True, exist_ok=True)
    safe_write(root, parts, (json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


def parse_args(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    ap.add_argument("--pids-file", action="append", help="izlaz oai_discover.py --out (objekt s 'picked'); moze vise puta")
    ap.add_argument("--staging-dir", help="mapa IZVAN repozitorija za pretvorene DOCX-ove (ulaz za corpus-ingest)")
    ap.add_argument("--private-dir", help="mapa IZVAN repozitorija i izvan staginga: PID, URL, sha256, izvjestaji")
    ap.add_argument("--report", help="JSON izvjestaj svih zapisa (zadano <private>/reports/harvest-<vrijeme>.json)")
    ap.add_argument("--per-cell", type=int, default=DEFAULT_PER_CELL,
                    help=f"najvise radova po (unitId, razina), {PER_CELL_MIN}..{PER_CELL_MAX}, zadano {DEFAULT_PER_CELL}")
    ap.add_argument("--max-total", type=int, default=DEFAULT_MAX_TOTAL,
                    help=f"najvise radova ukupno, 1..{MAX_TOTAL_LIMIT}, zadano {DEFAULT_MAX_TOTAL}")
    ap.add_argument("--keep-pdf", action="store_true", help="zadrzi izvorni PDF u <private>/pdf (zadano se brise)")
    ap.add_argument("--refresh", action="store_true",
                    help="ponovno dohvati i usporedi puni sha256 PDF-a i za vec obradjene zapise (izvor isti ili zastario)")
    ap.add_argument("--selftest", action="store_true")
    return ap.parse_args(argv)


def fail(msg, code=2):
    print(f"[pdf-korpus] FAIL: {msg}", file=sys.stderr)
    return code


def main(argv=None, *, transport=None, convert=None, converter=None, clock=time.monotonic, sleep=time.sleep,
         wall=time.time, now=lambda: datetime.now(timezone.utc).isoformat(), resolver=default_resolver):
    argv = sys.argv[1:] if argv is None else list(argv)
    if argv[:1] == ["--convert-worker"] and len(argv) == 3:
        convert_worker(argv[1], argv[2])
        return 0
    args = parse_args(argv)
    if args.selftest:
        selftest()
        return 0
    if not args.pids_file or not args.staging_dir or not args.private_dir:
        return fail("obavezno --pids-file, --staging-dir i --private-dir")
    if not PER_CELL_MIN <= args.per_cell <= PER_CELL_MAX:
        return fail(f"--per-cell mora biti {PER_CELL_MIN}..{PER_CELL_MAX} (dobiveno {args.per_cell})")
    if not 1 <= args.max_total <= MAX_TOTAL_LIMIT:
        return fail(f"--max-total mora biti 1..{MAX_TOTAL_LIMIT} (dobiveno {args.max_total})")
    try:
        staging = prepare_root(args.staging_dir, "--staging-dir")
        private = prepare_root(args.private_dir, "--private-dir")
        if _inside(staging, private) or _inside(private, staging):
            raise InputError(f"--staging-dir i --private-dir se preklapaju ({staging}, {private})")
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        report_path = (prepare_root(args.report, "--report") if args.report
                       else private / "reports" / f"harvest-{stamp}.json")
        if _inside(report_path, staging):
            raise InputError("--report ne smije u staging mapu: izvjestaj nosi PID-ove")
        report_target = ((report_path.parent, (check_segment(report_path.name),)) if args.report
                         else (private, ("reports", report_path.name)))
    except (InputError, PathError) as exc:
        return fail(str(exc))

    report = {
        "schemaVersion": 1, "tool": TOOL_VERSION, "sourceKind": SOURCE_KIND,
        "stagingDir": str(staging), "privateDir": str(private),
        "options": {"perCell": args.per_cell, "maxTotal": args.max_total, "keepPdf": args.keep_pdf, "refresh": args.refresh},
        "sandbox": {"timeoutS": CONVERT_TIMEOUT_S, "resourceLimits": HAS_RLIMIT},
        "nextStep": (f"npx vite-node scripts/corpus-ingest.mts -- --in {staging} --out <mjerni korpus izvan repoa> "
                     f"--consent <zapis> --source-kind {SOURCE_KIND}"),
    }
    records, invalid = [], []
    try:
        for path in args.pids_file:
            ok, bad = load_discovery(path)
            records.extend(ok)
            invalid.extend(bad)
    except InputError as exc:
        return fail(str(exc))
    picked, rest = select_records(records, args.per_cell, args.max_total)
    problem = None
    if invalid:
        problem = f"{len(invalid)} nevaljanih zapisa u ulazu; nista nije preuzeto"
    elif not picked:
        problem = "prazan izbor: nijedan valjan zapis za preuzimanje"
    if problem is None and (transport is None or convert is None or converter is None):
        try:
            converter = converter or installed_converter_id()
            transport = transport or requests_transport()
            convert = convert or convert_subprocess
        except (InputError, ImportError) as exc:
            problem = str(exc)
    if problem:
        report["records"] = invalid + [{**r, "status": "not-fetched", "reason": problem} for r in picked] + rest
        report["summary"] = summarize(report["records"])
        try:
            write_report(report_target, report)
        except (OSError, PathError) as exc:
            print(f"[pdf-korpus] izvjestaj nije zapisan: {exc}", file=sys.stderr)
        return fail(problem)

    if not HAS_RLIMIT:
        print(SANDBOX_WARNING, file=sys.stderr)
    fetcher = Fetcher(transport, clock=clock, sleep=sleep, wall=wall, resolver=resolver)
    try:
        entries = harvest(picked, staging, private, fetcher, convert, converter, args.keep_pdf, now, args.refresh)
    except (PathError, OSError) as exc:
        return fail(f"staging mapa nije upisiva: {exc}")
    report["converter"] = converter
    report["records"] = entries + rest
    report["summary"] = summarize(report["records"])
    try:
        write_report(report_target, report)
    except (OSError, PathError) as exc:
        return fail(f"izvjestaj nije zapisan: {exc}", 1)
    s = report["summary"]
    unverified = sum(1 for e in entries if e["status"] == "skipped" and not e.get("sourceVerified"))
    print(f"[pdf-korpus] gotovo: {s.get('ok', 0)}, vec obradjeno: {s.get('skipped', 0)} (izvor neprovjeren: {unverified}), "
          f"palo: {s.get('failed', 0)}, "
          f"izvan izbora: {s.get('not-selected', 0) + s.get('duplicate', 0)}; izvjestaj: {report_path}")
    for e in entries:
        if e["status"] == "failed":
            print(f"  PAO {e['pid']} ({e['stage']}): {e['reason']}", file=sys.stderr)
    return 1 if s.get("failed") else 0


def selftest():
    """Bez mreze i bez pdf2docx: granica repoa, putanje (poveznica, junction), mreza, odabir i allowlista paketa."""
    global LSTAT
    assert out_dir_problem(ROOT / "tmp-korpus") is not None
    assert out_dir_problem(ROOT) is not None
    with tempfile.TemporaryDirectory() as tmp:
        assert out_dir_problem(tmp) is None
        for bad in ("..", "/etc", "a/b", "", "CON", "nul.json"):
            try:
                safe_target(tmp, bad)
                raise AssertionError(f"segment {bad!r} mora pasti")
            except PathError:
                pass
        # Windows junction (reparse point) kroz lazni lstat: radi i na Linuxu i bez prava na poveznice.
        real_lstat = LSTAT

        class Junction:
            st_mode = stat.S_IFDIR | 0o755
            st_file_attributes = FILE_ATTRIBUTE_REPARSE_POINT

        LSTAT = lambda p: Junction() if Path(p).name == "a" else real_lstat(p)  # noqa: E731
        try:
            safe_target(tmp, "a", "x.json")
            raise AssertionError("komponenta koja je junction mora pasti")
        except PathError:
            pass
        finally:
            LSTAT = real_lstat
        # POSIX: poveznica UNUTAR korijena prolazi provjeru razrijesene putanje; dir_fd upis je ne prati.
        if USE_DIR_FD:
            os.makedirs(os.path.join(tmp, "druga"))
            os.symlink(os.path.join(tmp, "druga"), os.path.join(tmp, "records"))
            try:
                safe_write(tmp, ("records", "x.json"), b"x")
                raise AssertionError("upis kroz poveznicu u korijenu mora pasti")
            except PathError:
                pass
            assert os.listdir(os.path.join(tmp, "druga")) == []
    public = lambda host: ["93.184.216.34"]  # noqa: E731
    assert url_problem("https://repozitorij.unizd.hr/x", public) is None
    for bad_url in ("http://repozitorij.unizd.hr/x", "https://127.0.0.1/", "https://8.8.8.8/", "https://[::1]/", "https://0x7f.0.0.1/"):
        assert url_problem(bad_url, public) is not None, bad_url
    for addr in ("10.0.0.1", "127.0.0.1", "169.254.169.254", "224.0.0.1", "::ffff:192.168.1.1", "fe80::1", "0.0.0.0", "100.64.0.1"):
        assert url_problem("https://interni.unizd.hr/x", lambda host, a=addr: [a]) is not None, addr
    assert validate_record({"pid": "unizd:12", "repository": "repozitorij.unizd.hr", "unitId": "unizd", "level": "zavrsni"}) == []
    assert validate_record({"pid": "unizd:12", "repository": "https://x.hr:8443/a", "unitId": "../x", "level": "seminar"})
    recs = [{"pid": f"u:{i}", "repository": "r.hr", "unitId": "u", "level": lvl}
            for i, lvl in enumerate(["diplomski", "diplomski", "diplomski", "zavrsni"], 1)]
    picked, rest = select_records(recs, 2, 50)
    assert [r["pid"] for r in picked] == ["u:1", "u:2", "u:4"], picked
    assert [r["pid"] for r in rest] == ["u:3"], rest
    ime = "Ana Anic"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", f'<Types xmlns="{CT_NS}"><Override PartName="/word/document.xml" ContentType="d"/>'
                                          f'<Override PartName="/word/header1.xml" ContentType="h"/></Types>')
        z.writestr("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                                  '<Relationship Id="rId1" Type="d" Target="word/document.xml"/>'
                                  '<Relationship Id="rId2" Type="t" Target="docProps/thumbnail.jpeg"/></Relationships>')
        z.writestr("word/document.xml", "<w:document/>")
        z.writestr("word/header1.xml", f"<w:hdr>{ime}</w:hdr>")
        z.writestr("word/comments.xml", f"<w:comments>{ime}</w:comments>")
        z.writestr("docProps/thumbnail.jpeg", b"\xff\xd8" + ime.encode())
        z.writestr("docProps/custom.xml", f"<Properties>{ime}</Properties>")
        z.writestr("docProps/core.xml", f"<cp:coreProperties><dc:creator>{ime}</dc:creator><dc:title>Naslov</dc:title></cp:coreProperties>")
    clean, dropped = scrub_docx_parts(buf.getvalue())
    zclean = zipfile.ZipFile(io.BytesIO(clean))
    assert zclean.read("docProps/core.xml") == EMPTY_CORE_XML
    assert dropped == ["docProps/custom.xml", "docProps/thumbnail.jpeg", "word/comments.xml", "word/header1.xml"], dropped
    assert not any(ime.encode() in zclean.read(n) for n in zclean.namelist())
    assert b"thumbnail" not in zclean.read("_rels/.rels") and b"header1" not in zclean.read("[Content_Types].xml")
    assert scrub_docx(buf.getvalue()) == clean, "ciscenje mora biti deterministicko"
    assert scrub_docx(clean) == clean, "drugi prolaz ciscenja mora biti no-op"
    # Revizijski identifikatori se brisu (drugi prolaz no-op), autor revizije u document.xml ili settings.xml odbija.
    rs = io.BytesIO()
    with zipfile.ZipFile(rs, "w") as z:
        z.writestr("[Content_Types].xml", f'<Types xmlns="{CT_NS}"/>')
        z.writestr("word/document.xml", '<w:document><w:p w:rsidR="00A1B2C3" w:rsidRDefault="00D4E5F6"><w:r><w:t>Tekst</w:t></w:r></w:p></w:document>')
        z.writestr("word/settings.xml", '<w:settings><w:rsids><w:rsidRoot w:val="00A1B2C3"/><w:rsid w:val="00D4E5F6"/></w:rsids></w:settings>')
    rclean, _ = scrub_docx_parts(rs.getvalue())
    zr = zipfile.ZipFile(io.BytesIO(rclean))
    assert not any(b"rsid" in zr.read(n) for n in zr.namelist()), "rsid mora nestati iz svih dijelova"
    assert b"<w:t>Tekst</w:t>" in zr.read("word/document.xml"), "brisanje rsid ne smije dirati tekst"
    assert scrub_docx(rclean) == rclean, "drugi prolaz brisanja rsid mora biti no-op"
    for part, xml in (("word/document.xml", f'<w:document><w:ins w:id="1" w:author="{ime}"><w:r><w:t>x</w:t></w:r></w:ins></w:document>'),
                      ("word/document.xml", f'<w:document><w:del w:id="2" w:author="{ime}" w:initials="AA"/></w:document>'),
                      ("word/settings.xml", f'<w:settings><w:trackRevisions/><w:pPrChange w:author="{ime}"/></w:settings>')):
        rv = io.BytesIO()
        with zipfile.ZipFile(rv, "w") as z:
            z.writestr("[Content_Types].xml", f'<Types xmlns="{CT_NS}"/>')
            if part != "word/document.xml":
                z.writestr("word/document.xml", "<w:document/>")
            z.writestr(part, xml)
        try:
            scrub_docx_parts(rv.getvalue())
            raise AssertionError(f"autor revizije u {part} mora odbiti dokument")
        except ConvertError:
            pass
    # Dokument koji upucuje na izbaceno zaglavlje se odbija: ime u zaglavlju ne smije ni izbaciti ni proci.
    ref = io.BytesIO()
    with zipfile.ZipFile(ref, "w") as z:
        z.writestr("[Content_Types].xml", f'<Types xmlns="{CT_NS}"/>')
        z.writestr("word/document.xml", f'<w:document xmlns:r="{OFFICE_REL_NS}"><w:headerReference r:id="rId9"/></w:document>')
        z.writestr("word/_rels/document.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                                                   '<Relationship Id="rId9" Type="h" Target="header1.xml"/></Relationships>')
        z.writestr("word/header1.xml", f"<w:hdr>{ime}</w:hdr>")
    try:
        scrub_docx(ref.getvalue())
        raise AssertionError("upucivanje na izbaceno zaglavlje mora pasti")
    except ConvertError:
        pass
    kom = io.BytesIO()
    with zipfile.ZipFile(kom, "w") as z:
        z.writestr("[Content_Types].xml", f'<Types xmlns="{CT_NS}"/>')
        z.writestr("word/document.xml", '<w:document><w:p><w:commentReference w:id="0"/></w:p></w:document>')
    try:
        scrub_docx(kom.getvalue())
        raise AssertionError("upucivanje na izbaceni komentar mora pasti")
    except ConvertError:
        pass
    print("selftest: ok")


if __name__ == "__main__":
    sys.exit(main())
