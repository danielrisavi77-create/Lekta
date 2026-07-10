# -*- coding: utf-8 -*-
"""Harvest prvih stranica javnih teza za evidence predlozaka naslovnice (korak B).

Ulaz: data/profiles/verified-profiles.json -> fieldValidation.publicSources[]
(PID + repository + level, vec potvrdjeni pri ranijem harvestu). Za svaku
(unitId, level) celiju dohvaca do --per-cell PDF-ova, PyMuPDF-om izvlaci linije
prve stranice (tekst, font, velicina, bold, poravnanje, yRel), heuristicki
klasificira uloge i REDIGIRA osobne podatke PRIJE zapisa:
redactedText ostaje samo za university/faculty/study/worktype/placeyear;
author/mentor/comentor/title/unknown su uvijek null (GDPR pravilo sloja,
provodi ga tests/title-page-loader.test.ts).

Izlaz:
  data/title-pages/evidence/<unitId>.json   (commita se, redigirano)
  artifacts/title-harvest/state.json        (resume; ne commita se)
  artifacts/title-harvest/png/<pid>.png     (uz --png; SADRZI IMENA, ne dijeliti)

PDF-ovi se NE spremaju na disk (ni privremeno) i NE commitaju (CLAUDE.md).
Dohvat ide s punim browser headerima (ModSecurity vraca 418 bez njih) i
per-host throttleom (default 10 s, ftrr 240 s); hostovi se obraduju
round-robin pa se delay preklapa. Prekinuti run se nastavlja iz state.json.

Pokretanje:
  python scripts/title-pages/harvest_first_pages.py --units fpzg,pravo,ffzg --png   # pilot
  python scripts/title-pages/harvest_first_pages.py                                 # puni sweep
"""
import argparse
import json
import re
import sys
import time
import unicodedata
from collections import defaultdict, deque
from datetime import date
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit("PyMuPDF nije instaliran: pip install --user pymupdf")
try:
    import requests
except ImportError:
    sys.exit("requests nije instaliran: pip install --user requests")

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_DIR = ROOT / "data" / "title-pages" / "evidence"
STATE_PATH = ROOT / "artifacts" / "title-harvest" / "state.json"
PNG_DIR = ROOT / "artifacts" / "title-harvest" / "png"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
    "Accept-Language": "hr-HR,hr;q=0.9,en-US;q=0.7,en;q=0.5",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}
HOST_DELAY_DEFAULT = 10.0
HOST_DELAY = {"repozitorij.ftrr.hr": 240.0}
TIMEOUT = 60

WHITELIST_ROLES = {"university", "faculty", "study", "worktype", "placeyear"}

WORKTYPE_PHRASES = (
    "zavrsni rad", "diplomski rad", "doktorski rad", "doktorska disertacija",
    "disertacija", "specijalisticki rad", "zavrsni specijalisticki rad",
    "seminarski rad", "strucni rad", "master thesis", "master's thesis",
    "bachelor thesis", "graduate thesis", "final thesis", "doctoral thesis",
    "diplomski specijalisticki strucni rad",
)
LEVEL_MARKERS = {
    "zavrsni": ("zavrsni rad", "bachelor", "final thesis", "prvostupni"),
    "diplomski": ("diplomski rad", "master", "graduate thesis"),
    "doktorski": ("doktorski rad", "disertacij", "doctoral"),
    "specijalisticki": ("specijalisticki",),
}


def plain(text):
    norm = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in norm if not unicodedata.combining(ch)).lower().strip()


def normalize_font(name):
    """'ABCDEF+TimesNewRomanPS-BoldMT' -> 'Times New Roman' (bold ide u zastavicu)."""
    n = re.sub(r"^[A-Z]{6}\+", "", name or "")
    low = n.lower()
    for key, canon in (
        ("timesnewroman", "Times New Roman"), ("times new roman", "Times New Roman"),
        ("times", "Times New Roman"), ("arialmt", "Arial"), ("arial", "Arial"),
        ("calibri", "Calibri"), ("cambria", "Cambria"), ("georgia", "Georgia"),
        ("garamond", "Garamond"), ("bookantiqua", "Book Antiqua"),
        ("palatino", "Palatino"), ("verdana", "Verdana"), ("tahoma", "Tahoma"),
        ("liberationserif", "Liberation Serif"), ("liberation serif", "Liberation Serif"),
        ("dejavuserif", "DejaVu Serif"), ("carlito", "Carlito"), ("helvetica", "Helvetica"),
    ):
        if key in low.replace(" ", "") or key in low:
            return canon
    return n or "?"


def is_bold(span):
    return bool(span.get("flags", 0) & 16) or "bold" in (span.get("font", "").lower())


def page_lines(page):
    """Linije stranice: tekst + dominantna tipografija + geometrija."""
    out = []
    pw = page.rect.width or 1
    ph = page.rect.height or 1
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            spans = [s for s in line.get("spans", []) if s.get("text", "").strip()]
            if not spans:
                continue
            text = " ".join(s["text"].strip() for s in spans).strip()
            main = max(spans, key=lambda s: len(s.get("text", "")))
            x0, y0, x1, _ = line.get("bbox", (0, 0, 0, 0))
            center = (x0 + x1) / 2
            if abs(center - pw / 2) <= 0.05 * pw:
                align = "center"
            elif center < pw / 2:
                align = "left"
            else:
                align = "right"
            letters = [c for c in text if c.isalpha()]
            out.append({
                "text": text,
                "font": normalize_font(main.get("font", "")),
                "sizePt": round(main.get("size", 0) * 2) / 2,
                "bold": is_bold(main),
                "uppercase": bool(letters) and text == text.upper(),
                "align": align,
                "yRel": round(y0 / ph, 3),
            })
    out.sort(key=lambda l: l["yRel"])
    return out, {"w": round(pw, 1), "h": round(ph, 1)}


NAME_RE = re.compile(r"^[A-ZČĆŽŠĐ][a-zčćžšđ]+(?: [A-ZČĆŽŠĐ][a-zčćžšđ]+){1,3}$")
# Ime pisano verzalom (MARIO DOMINIK BURIĆ): 2-4 kratke rijeci, sve velikim slovima.
CAPS_NAME_RE = re.compile(r"^[A-ZČĆŽŠĐ]{2,14}(?: [A-ZČĆŽŠĐ.]{1,14}){1,3}$")


def classify(lines):
    """Dodijeli uloge linijama (in-place 'role' kljuc). Nesigurno -> unknown."""
    for l in lines:
        tp = plain(l["text"])
        role = None
        if re.search(r"\d{10}", l["text"]) or "@" in l["text"]:
            role = "unknown"  # JMBAG/e-mail: nikad ne zadrzavamo
        elif any(tp == p or tp.rstrip(".") == p for p in WORKTYPE_PHRASES):
            role = "worktype"
        elif tp.startswith(("komentor", "sumentor")):
            role = "comentor"
        elif tp.startswith("mentor") or tp.startswith("pod vodstvom") or "mentor:" in tp or tp.startswith("voditelj"):
            role = "mentor"
        elif tp.startswith(("student", "autor", "kandidat", "pristupni", "izradila", "izradio",
                            "ime i prezime")):
            role = "author"
        elif "sveucilist" in tp or tp.startswith("university"):
            role = "university"
        elif any(k in tp for k in ("fakultet", "akademij", "veleucilist", "visoka skola", "skola ekonomije")):
            role = "faculty"
        elif any(k in tp for k in ("studij", "odsjek", "smjer", "katedra", "zavod za", "odjel za", "department")):
            role = "study"
        elif re.search(r"(19|20)\d{2}", tp) and len(tp.split()) <= 6 and l["yRel"] >= 0.6:
            role = "placeyear"
        l["role"] = role or "unknown"

    # Naslov: najveci font medju unknown linijama u sredini stranice, IZNAD
    # mentorsko-autorskog bloka; susjedne linije iste velicine su nastavak naslova.
    person_ys = [l["yRel"] for l in lines if l["role"] in ("mentor", "comentor", "author")]
    cap = min(person_ys) if person_ys else 0.8
    middle = [l for l in lines if l["role"] == "unknown" and 0.15 <= l["yRel"] <= min(cap, 0.8)
              and len(l["text"]) >= 4]
    if middle:
        top_size = max(l["sizePt"] for l in middle)
        for l in middle:
            if l["sizePt"] >= top_size - 0.5:
                l["role"] = "title"

    # Autor pisan verzalom zna zavrsiti kao "title": ako prva naslovna linija izgleda
    # kao caps-ime i od ostatka naslova je odvojena vertikalnim razmakom, to je autor.
    titles = [l for l in lines if l["role"] == "title"]
    if len(titles) >= 2:
        first = titles[0]
        rest_min_y = min(t["yRel"] for t in titles[1:])
        if CAPS_NAME_RE.match(first["text"].strip()) and (rest_min_y - first["yRel"]) > 0.05:
            first["role"] = "author"

    # Autor: unknown linija koja izgleda kao ime (2-4 kapitalizirane rijeci).
    for l in lines:
        if l["role"] == "unknown" and NAME_RE.match(l["text"].strip()):
            l["role"] = "author"
            break
    return lines


def redact(lines):
    """GDPR: tekst ostaje samo za whitelistane uloge; scrub JMBAG/e-mail za svaki slucaj."""
    out = []
    for l in lines:
        keep = l["role"] in WHITELIST_ROLES
        text = l["text"] if keep else None
        if text:
            text = re.sub(r"\d{10}", "", text)
            text = re.sub(r"\S+@\S+", "", text).strip() or None
        out.append({
            "role": l["role"], "redactedText": text, "font": l["font"],
            "sizePt": l["sizePt"], "bold": l["bold"], "uppercase": l["uppercase"],
            "align": l["align"], "yRel": l["yRel"],
        })
    return out


def looks_like_repo_cover(lines):
    joined = plain(" ".join(l["text"] for l in lines))
    return (not lines) or "urn:nbn" in joined or "urn.nsk.hr" in joined


def candidate_urls(pid, repository):
    base = f"https://{repository}"
    return [
        f"{base}/islandora/object/{pid}/datastream/PDF",
        f"{base}/islandora/object/{pid}/datastream/PDF/download",
        f"{base}/object/{pid}/FILE0",
    ]


class HostThrottle:
    def __init__(self):
        self.last = {}

    def wait(self, host):
        delay = HOST_DELAY.get(host, HOST_DELAY_DEFAULT)
        prev = self.last.get(host)
        if prev is not None:
            remaining = delay - (time.monotonic() - prev)
            if remaining > 0:
                time.sleep(remaining)
        self.last[host] = time.monotonic()


def fetch_pdf(session, throttle, pid, repository):
    """Vrati (bytes, None) ili (None, razlog). Redom proba poznate oblike URL-a."""
    last_reason = "no-url"
    for url in candidate_urls(pid, repository):
        throttle.wait(repository)
        try:
            resp = session.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        except requests.RequestException as exc:
            last_reason = f"network: {type(exc).__name__}"
            continue
        if resp.status_code != 200:
            last_reason = f"http-{resp.status_code}"
            continue
        data = resp.content
        if not data.startswith(b"%PDF"):
            last_reason = "not-pdf (login/embargo/html)"
            continue
        return data, None
    return None, last_reason


def detected_level_matches(lines, level):
    markers = LEVEL_MARKERS.get(level)
    if not markers:
        return None
    joined = plain(" ".join(l["text"] for l in lines))
    return any(m in joined for m in markers)


def load_json(path, fallback):
    if path.exists():
        return json.loads(path.read_text("utf-8"))
    return fallback


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--units", help="zarezom odvojeni unitId filter (pilot)")
    ap.add_argument("--per-cell", type=int, default=2, help="PDF-ova po (unit, razina), default 2")
    ap.add_argument("--max", type=int, default=0, help="globalni limit dohvata (0 = bez limita)")
    ap.add_argument("--png", action="store_true", help="render prve stranice u artifacts (imena!)")
    args = ap.parse_args()

    verified = json.loads((ROOT / "data" / "profiles" / "verified-profiles.json").read_text("utf-8"))
    unit_filter = set(args.units.split(",")) if args.units else None

    # (unitId, level) -> [(pid, repository)], dedupe PID-ova preko profila.
    cells = defaultdict(list)
    seen_pids = set()
    for p in verified:
        unit_id = p.get("unitId")
        if not unit_id or (unit_filter and unit_id not in unit_filter):
            continue
        for s in (p.get("fieldValidation") or {}).get("publicSources") or []:
            pid = s.get("pid")
            repo = s.get("repository")
            level = s.get("level") or "?"
            if not pid or not repo or pid in seen_pids:
                continue
            seen_pids.add(pid)
            cells[(unit_id, level)].append((pid, repo))

    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    state = load_json(STATE_PATH, {})
    if args.png:
        PNG_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

    # Radna lista: po celiji uzmi do per-cell PID-ova koji jos nisu uspjeli;
    # round-robin po hostu da se throttle preklapa.
    tasks = []
    for (unit_id, level), pids in sorted(cells.items()):
        done = sum(1 for pid, _ in pids if state.get(pid, {}).get("status") == "ok")
        want = max(0, args.per_cell - done)
        for pid, repo in pids:
            if want <= 0:
                break
            st = state.get(pid, {}).get("status")
            if st == "ok" or st == "skip":
                continue
            tasks.append({"pid": pid, "repo": repo, "unitId": unit_id, "level": level})
            want -= 1

    by_host = defaultdict(deque)
    for t in tasks:
        by_host[t["repo"]].append(t)
    ordered = []
    while any(by_host.values()):
        for host in list(by_host):
            if by_host[host]:
                ordered.append(by_host[host].popleft())

    print(f"celija: {len(cells)}, zadataka: {len(ordered)} "
          f"(per-cell {args.per_cell}, hostova {len(set(t['repo'] for t in ordered))})")

    session = requests.Session()
    throttle = HostThrottle()
    evidence_cache = {}
    fetched = ok = 0

    def save_state():
        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=1), "utf-8")

    for t in ordered:
        if args.max and fetched >= args.max:
            break
        pid, repo, unit_id, level = t["pid"], t["repo"], t["unitId"], t["level"]
        fetched += 1
        data, reason = fetch_pdf(session, throttle, pid, repo)
        if data is None:
            state[pid] = {"status": "fail", "reason": reason, "unitId": unit_id}
            save_state()
            print(f"  FAIL {pid} ({repo}): {reason}")
            continue
        try:
            doc = fitz.open(stream=data, filetype="pdf")
        except Exception as exc:  # noqa: BLE001
            state[pid] = {"status": "fail", "reason": f"fitz-open: {exc}", "unitId": unit_id}
            save_state()
            continue
        try:
            page_index = 0
            lines, page_size = page_lines(doc[0])
            if looks_like_repo_cover(lines) and doc.page_count > 1:
                page_index = 1
                lines, page_size = page_lines(doc[1])
            ocr_fallback = False
            if not lines:
                # bez text layera: preskacemo OCR u v1 (tipografija ionako nepouzdana)
                state[pid] = {"status": "skip", "reason": "no-text-layer", "unitId": unit_id}
                save_state()
                print(f"  SKIP {pid}: bez text layera")
                continue
            classify(lines)
            level_ok = detected_level_matches(lines, level)
            if args.png:
                try:
                    pix = doc[page_index].get_pixmap(dpi=120)
                    pix.save(str(PNG_DIR / f"{pid.replace(':', '_')}.png"))
                except Exception:  # noqa: BLE001
                    pass
            sample = {
                "pid": pid, "repository": repo, "level": level,
                "pageIndex": page_index, "ocrFallback": ocr_fallback,
                "levelMarkerMatch": level_ok, "pageSizePt": page_size,
                "lines": redact(lines),
            }
        finally:
            doc.close()

        ev_path = EVIDENCE_DIR / f"{unit_id}.json"
        if unit_id not in evidence_cache:
            evidence_cache[unit_id] = load_json(ev_path, {
                "unitId": unit_id, "generatedAt": date.today().isoformat(), "samples": [],
            })
        ev = evidence_cache[unit_id]
        ev["samples"] = [s for s in ev["samples"] if s["pid"] != pid] + [sample]
        ev["generatedAt"] = date.today().isoformat()
        ev_path.write_text(json.dumps(ev, ensure_ascii=False, indent=1), "utf-8")

        state[pid] = {"status": "ok", "unitId": unit_id, "pageIndex": page_index,
                      "levelMarkerMatch": level_ok}
        save_state()
        ok += 1
        roles = [l["role"] for l in sample["lines"]]
        print(f"  OK {pid} ({unit_id}/{level}) str.{page_index} uloge: {','.join(roles[:10])}"
              f"{' LEVEL?' if level_ok is False else ''}")

    print(f"gotovo: {ok}/{fetched} uspjesno; evidence u {EVIDENCE_DIR}")


if __name__ == "__main__":
    main()
