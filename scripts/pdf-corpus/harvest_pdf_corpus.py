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
  <staging>/pdf-<sha16>.docx              pretvorba s ociscenim docProps (bez autora, naslova, datuma);
                                          ime nosi SAMO neutralan id iz sha256 PDF-a
  <private>/records/<unitId>/<razina>/<pid>.json
                                          PID, repozitorij, URL, sha256 PDF-a i DOCX-a, verzija alata
  <private>/pdf/pdf-<sha16>.pdf           izvorni PDF, SAMO uz --keep-pdf (zadano se brise)
  <private>/reports/harvest-<vrijeme>.json  izvjestaj svih zapisa (ili --report)
Identifikatori za dohvat (PID, URL, sha256 PDF-a) zive samo u private mapi, nikad u staging ni u
sidecaru mjerenja.

IZLAZNI KOD: 0 svi odabrani zapisi obradjeni ili vec obradjeni; 1 barem jedan zapis je pao;
2 neispravan ulaz, prazan izbor, korijen unutar repozitorija ili nepinane ovisnosti (nista se ne preuzima).

RIZIK PARSERA PDF-a. PDF je nepovjerljiv ulaz, a PyMuPDF (MuPDF, C) i pdf2docx ga parsiraju u cijelosti.
Pretvorba zato ide u zasebnom podprocesu s vremenskim ogranicenjem i, na POSIX-u, s ogranicenjem
memorije, CPU vremena i velicine datoteke (resource.setrlimit). Na Windowsu setrlimit ne postoji, pa
ostaje samo vremensko ogranicenje; pokreci na radnoj stanici bez tajni u okolini. Ovisnosti su pinane
s hashovima: pip install --require-hashes -r scripts/pdf-corpus/requirements.txt

Pretvorba iz PDF-a nagadja strukturu (stilovi, sekcije, polja), zato je A-pdf odvojen od A.
Prije sirenja provjeri 2 do 3 pretvorena rada rucno: analizira li ih Lekta smisleno.

Samoprovjera bez mreze i bez ovisnosti: python scripts/pdf-corpus/harvest_pdf_corpus.py --selftest
"""
import argparse
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import zipfile
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[2]
REQUIREMENTS = Path(__file__).resolve().parent / "requirements.txt"
SOURCE_KIND = "public-pdf-converted"
KIND_MARKER = ".lekta-corpus-kind"
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
EMPTY_CUSTOM_XML = (
    b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    b'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" '
    b'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>'
)
SCRUBBED_PARTS = {"docProps/core.xml": EMPTY_CORE_XML, "docProps/app.xml": EMPTY_APP_XML, "docProps/custom.xml": EMPTY_CUSTOM_XML}


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


def prepare_root(path, label, repo=ROOT):
    """Apsolutan, razrijesen korijen izvan repozitorija; sam korijen ne smije biti simbolicka poveznica."""
    raw = Path(os.path.abspath(Path(path).expanduser()))
    if raw.is_symlink():
        raise InputError(f"{label}: {raw} je simbolicka poveznica; zadaj stvarnu mapu")
    problem = out_dir_problem(raw, repo)
    if problem:
        raise InputError(f"{label}: {problem}")
    return raw.resolve()


def check_segment(part):
    if not isinstance(part, str) or not SEGMENT_RE.match(part) or part.split(".")[0].lower() in WINDOWS_RESERVED:
        raise PathError(f"nevaljan segment putanje: {part!r}")
    return part


def safe_target(root, *parts, is_link=os.path.islink):
    """Konacno odrediste unutar `root`, bez ijedne simbolicke poveznice na putu; inace PathError.

    Poziva se NEPOSREDNO prije svakog upisa i brisanja, ne jednom na pocetku: izmedju dva zapisa netko
    moze podmetnuti poveznicu u izlaznu mapu. Poveznica koja pokazuje UNUTAR korijena prosla bi provjeru
    razrijesene putanje, pa se svaka komponenta provjerava zasebno (`is_link` je ulaz samo za samoprovjeru).
    """
    root = Path(root)
    for part in parts:
        check_segment(part)
    if is_link(root):
        raise PathError(f"{root} je simbolicka poveznica")
    cur = root
    for part in parts:
        cur = cur / part
        if is_link(cur):
            raise PathError(f"{cur} je simbolicka poveznica")
    resolved = cur.resolve()
    if not _inside(resolved, root.resolve()) or resolved == root.resolve():
        raise PathError(f"{resolved} nije unutar {root}")
    return cur


def ensure_dirs(root, *parts):
    cur = Path(root)
    if cur.is_symlink():
        raise PathError(f"{cur} je simbolicka poveznica")
    cur.mkdir(parents=True, exist_ok=True)
    for part in parts:
        cur = safe_target(root, *(Path(cur).relative_to(root).parts + (part,)))
        cur.mkdir(exist_ok=True)
        if cur.is_symlink() or not cur.is_dir():
            raise PathError(f"{cur} nije obicna mapa")
    return cur


def safe_write(root, parts, data):
    """Atomski upis bajtova u root/parts nakon provjere odredista (unutar korijena, bez poveznica)."""
    parts = tuple(parts)
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


def safe_unlink(root, parts):
    target = safe_target(root, *parts)
    target.unlink(missing_ok=True)


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


class Fetcher:
    """HTTP dohvat PDF-a s ogranicenjima; `transport(url, headers, timeout)` vraca odgovor kao requests.

    Odgovor mora imati `status_code`, `headers`, `iter_content(n)` i `close()`. Preusmjeravanja prati
    ovaj kod (transport ih ne smije pratiti), pa se cekanje po hostu racuna po STVARNOM hostu svakog skoka.
    """

    def __init__(self, transport, clock=time.monotonic, sleep=time.sleep, wall=time.time,
                 host_delay=HOST_DELAY_S, deadline_s=RECORD_DEADLINE_S, max_bytes=MAX_PDF_BYTES):
        self.transport, self.clock, self.sleep, self.wall = transport, clock, sleep, wall
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


def run_limited(cmd, timeout=CONVERT_TIMEOUT_S):
    """Podproces s vremenskim ogranicenjem i (POSIX) ogranicenjem memorije, CPU-a i velicine datoteke."""
    kwargs = {}
    if os.name == "posix":
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
    """Verzija alata iz instaliranih paketa; InputError kad se ne slaze s requirements.txt."""
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


def scrub_docx(raw):
    """DOCX bez metapodataka paketa (autor, naslov, tvrtka, datumi) i s fiksnim vremenima zip zapisa."""
    try:
        zin = zipfile.ZipFile(io.BytesIO(raw))
        names = zin.namelist()
    except zipfile.BadZipFile as exc:
        raise ConvertError(f"pretvorba nije dala zip paket ({exc})")
    if "word/document.xml" not in names or "[Content_Types].xml" not in names:
        raise ConvertError("pretvorba nije dala DOCX (nema word/document.xml ili [Content_Types].xml)")
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            data = SCRUBBED_PARTS.get(info.filename) or zin.read(info.filename)
            entry = zipfile.ZipInfo(info.filename, date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            zout.writestr(entry, data)
    return out.getvalue()


# --------------------------------------------------------------------------------------------------
# Tok

def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def already_done(rec, staging, private, converter):
    """Prethodni zapis kad se rad smije preskociti, inace None. Preskace se SAMO kad zapis u private mapi i staging DOCX postoje,
    sha256 DOCX-a odgovara zapisu i zapis je nastao istom (pinanom) verzijom alata."""
    rec_path = safe_target(private, "records", rec["unitId"], rec["level"], pid_file_name(rec["pid"]))
    prev = read_json(rec_path) if rec_path.is_file() else None
    if not isinstance(prev, dict) or prev.get("pid") != rec["pid"]:
        return None
    if not isinstance(prev.get("id"), str) or not DOC_ID_RE.match(prev["id"]):
        return None
    if prev.get("converter") != converter:
        return None
    docx_path = safe_target(staging, prev["id"] + ".docx")
    if not docx_path.is_file() or sha256(docx_path.read_bytes()) != prev.get("docxSha256"):
        return None
    return prev


def process_record(rec, staging, private, fetcher, convert, converter, keep_pdf, now, produced):
    """Jedan zapis: dohvat, pretvorba u private/tmp, ciscenje, upis u staging, zapis u private."""
    prev = already_done(rec, staging, private, converter)
    if prev:
        return {"status": "skipped", "id": prev["id"], "reason": "vec obradjeno: sha256 DOCX-a odgovara zapisu"}
    data, requested_url, final_url = fetcher.fetch_record(rec)
    pdf_sha = sha256(data)
    ident = doc_id(pdf_sha)
    extra = {}
    if ident in produced:
        docx_sha = produced[ident]["docxSha256"]
        extra["duplicateOf"] = produced[ident]["pid"]
    else:
        tmp_pdf = safe_write(private, ("tmp", ident + ".pdf"), data)
        tmp_docx = safe_target(private, "tmp", ident + ".docx")
        try:
            convert(tmp_pdf, tmp_docx)
            raw = safe_target(private, "tmp", ident + ".docx").read_bytes()
            docx = scrub_docx(raw)
            safe_write(staging, (ident + ".docx",), docx)
            docx_sha = sha256(docx)
            if keep_pdf:
                safe_write(private, ("pdf", ident + ".pdf"), data)
        finally:
            safe_unlink(private, ("tmp", ident + ".docx"))
            safe_unlink(private, ("tmp", ident + ".pdf"))
        produced[ident] = {"docxSha256": docx_sha, "pid": rec["pid"]}
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
    safe_write(private, ("records", rec["unitId"], rec["level"], pid_file_name(rec["pid"])),
               (json.dumps(record, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    return {"status": "ok", "id": ident, "docxSha256": docx_sha, **extra}


def harvest(records, staging, private, fetcher, convert, converter, keep_pdf=False,
            now=lambda: datetime.now(timezone.utc).isoformat()):
    safe_write(staging, (KIND_MARKER,), (SOURCE_KIND + "\n").encode("utf-8"))
    produced, out = {}, []
    for rec in records:
        base = {k: rec[k] for k in ("pid", "unitId", "level")}
        try:
            out.append({**base, **process_record(rec, staging, private, fetcher, convert, converter, keep_pdf, now, produced)})
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
    ap.add_argument("--selftest", action="store_true")
    return ap.parse_args(argv)


def fail(msg, code=2):
    print(f"[pdf-korpus] FAIL: {msg}", file=sys.stderr)
    return code


def main(argv=None, *, transport=None, convert=None, converter=None, clock=time.monotonic, sleep=time.sleep,
         wall=time.time, now=lambda: datetime.now(timezone.utc).isoformat()):
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
        "options": {"perCell": args.per_cell, "maxTotal": args.max_total, "keepPdf": args.keep_pdf},
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

    fetcher = Fetcher(transport, clock=clock, sleep=sleep, wall=wall)
    try:
        entries = harvest(picked, staging, private, fetcher, convert, converter, args.keep_pdf, now)
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
    print(f"[pdf-korpus] gotovo: {s.get('ok', 0)}, vec obradjeno: {s.get('skipped', 0)}, palo: {s.get('failed', 0)}, "
          f"izvan izbora: {s.get('not-selected', 0) + s.get('duplicate', 0)}; izvjestaj: {report_path}")
    for e in entries:
        if e["status"] == "failed":
            print(f"  PAO {e['pid']} ({e['stage']}): {e['reason']}", file=sys.stderr)
    return 1 if s.get("failed") else 0


def selftest():
    """Bez mreze i bez pdf2docx: granica repoa, segmenti putanja, odabir i ciscenje metapodataka."""
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
        # Poveznica unutar korijena (a -> b) prolazi provjeru razrijesene putanje; hvata je samo provjera
        # svake komponente. Lazni `is_link` radi i na Windowsu bez prava na stvaranje poveznica.
        try:
            safe_target(tmp, "a", "x.json", is_link=lambda p: Path(p).name == "a")
            raise AssertionError("komponenta koja je poveznica mora pasti")
        except PathError:
            pass
    assert validate_record({"pid": "unizd:12", "repository": "repozitorij.unizd.hr", "unitId": "unizd", "level": "zavrsni"}) == []
    assert validate_record({"pid": "unizd:12", "repository": "https://x.hr:8443/a", "unitId": "../x", "level": "seminar"})
    recs = [{"pid": f"u:{i}", "repository": "r.hr", "unitId": "u", "level": lvl}
            for i, lvl in enumerate(["diplomski", "diplomski", "diplomski", "zavrsni"], 1)]
    picked, rest = select_records(recs, 2, 50)
    assert [r["pid"] for r in picked] == ["u:1", "u:2", "u:4"], picked
    assert [r["pid"] for r in rest] == ["u:3"], rest
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", "<w:document/>")
        z.writestr("docProps/core.xml", "<cp:coreProperties><dc:creator>Ana Anic</dc:creator><dc:title>Naslov</dc:title></cp:coreProperties>")
    clean = scrub_docx(buf.getvalue())
    zclean = zipfile.ZipFile(io.BytesIO(clean))
    assert zclean.read("docProps/core.xml") == EMPTY_CORE_XML
    assert not any(b"Ana Anic" in zclean.read(n) for n in zclean.namelist())
    assert scrub_docx(buf.getvalue()) == clean, "ciscenje mora biti deterministicko"
    print("selftest: ok")


if __name__ == "__main__":
    sys.exit(main())
