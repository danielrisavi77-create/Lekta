# -*- coding: utf-8 -*-
"""Otkrij PID-ove javnih (odobrenih) teza u DABAR/Islandora repozitoriju preko OAI-PMH.

Za dani host (npr. repozitorij.fesb.unist.hr) i unitId prolazi OAI ListRecords
(oai_dc), filtrira zapise po dc:type na diplomske/zavrsne/doktorske/specijalisticke
radove, i vraca do --n PID-ova rasporedjenih po razini i sto novijih (dc:date).

OAI identifikator "oai:<host>:<ns>_<broj>" -> PID "<ns>:<broj>" (PDF je onda na
/islandora/object/<PID>/datastream/PDF). Endpoint je /oai (ne /oai2) na DABAR-u.

Izlaz: JSON lista [{pid, repository, unitId, level}] na stdout ili u --out datoteku;
oblik je identican onome sto harvest_first_pages.py --pids-file ocekuje.

Pokretanje:
  python scripts/title-pages/oai_discover.py repozitorij.fesb.unist.hr fesb --n 12
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import unicodedata
from collections import defaultdict

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "hr-HR,hr;q=0.9,en;q=0.6",
}

# dc:type marker -> nasa razina (hrvatski + engleski oblici u DABAR-u).
LEVEL_BY_TYPE = [
    ("specijalist", "specijalisticki"),
    ("doktor", "doktorski"), ("disertac", "doktorski"), ("doctoral", "doktorski"),
    ("diplomski", "diplomski"), ("master", "diplomski"), ("graduate thesis", "diplomski"),
    ("zavrsni", "zavrsni"), ("bachelor", "zavrsni"), ("undergraduate", "zavrsni"),
    ("prvostupni", "zavrsni"), ("final thesis", "zavrsni"),
]
WANT_LEVELS = ("diplomski", "zavrsni", "specijalisticki", "doktorski")


def plain(text):
    norm = unicodedata.normalize("NFD", text or "")
    return "".join(ch for ch in norm if not unicodedata.combining(ch)).lower()


def level_of(types):
    joined = plain(" ".join(types))
    for marker, level in LEVEL_BY_TYPE:
        if marker in joined:
            return level
    return None


def oai_url(host, token=None, from_date=None):
    base = f"https://{host}/oai"
    if token:
        return f"{base}?verb=ListRecords&resumptionToken={urllib.parse.quote(token)}"
    url = f"{base}?verb=ListRecords&metadataPrefix=oai_dc"
    if from_date:
        url += f"&from={from_date}"
    return url


def fetch(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode("utf-8", "ignore")
        except urllib.error.HTTPError as e:
            if e.code in (503, 429) and attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
            raise
        except Exception:
            if attempt < retries - 1:
                time.sleep(3)
                continue
            raise
    return ""


RECORD_RE = re.compile(r"<record>(.*?)</record>", re.S)
ID_RE = re.compile(r"<identifier>\s*(.*?)\s*</identifier>", re.S)
TYPE_RE = re.compile(r"<dc:type[^>]*>\s*(.*?)\s*</dc:type>", re.S)
DATE_RE = re.compile(r"<dc:date[^>]*>\s*(.*?)\s*</dc:date>", re.S)
TOKEN_RE = re.compile(r"<resumptionToken[^>]*>\s*(.*?)\s*</resumptionToken>", re.S)
DELETED_RE = re.compile(r'<header status="deleted">', re.S)


def pid_from_oai(oai_id):
    # oai:repozitorij.fesb.unist.hr:fesb_1377 -> fesb:1377
    tail = oai_id.rsplit(":", 1)[-1]
    return re.sub(r"_(\d+)$", r":\1", tail)


def is_open_access(rec):
    """DABAR/OpenAIRE dc:rights: samo openAccess je izravno dohvatljiv PDF (ostalo je
    restricted/embargoed/closed -> datastream vraca HTML, harvest padne 'not-pdf')."""
    return "semantics/openaccess" in rec.lower()


PUBLISHER_RE = re.compile(r"<dc:publisher[^>]*>(.*?)</dc:publisher>", re.S)


def discover(host, unit_id, want_n, max_pages, from_date=None, publisher=None):
    by_level = defaultdict(list)
    seen = set()
    scanned = 0
    open_count = 0
    token = None
    pages = 0
    pub_plain = plain(publisher) if publisher else None
    while pages < max_pages:
        url = oai_url(host, token, from_date if pages == 0 else None)
        xml = fetch(url)
        pages += 1
        for rec in RECORD_RE.findall(xml):
            if DELETED_RE.search(rec):
                continue
            ids = ID_RE.findall(rec)
            if not ids:
                continue
            pid = pid_from_oai(ids[0])
            if pid in seen or not re.search(r":\d+$", pid):
                continue
            level = level_of(TYPE_RE.findall(rec))
            if level not in WANT_LEVELS:
                continue
            # Djeljeni repozitorij (unipu, unisb): zadrzi samo zapise ovog fakulteta.
            if pub_plain and not any(pub_plain in plain(p) for p in PUBLISHER_RE.findall(rec)):
                continue
            scanned += 1
            if not is_open_access(rec):
                continue  # zatvoreni/embargirani se ne mogu dohvatiti
            dates = DATE_RE.findall(rec)
            year = 0
            for d in dates:
                m = re.search(r"(19|20)\d{2}", d)
                if m:
                    year = max(year, int(m.group(0)))
            seen.add(pid)
            open_count += 1
            by_level[level].append((year, pid))
        token = None
        m = TOKEN_RE.search(xml)
        if m and m.group(1).strip():
            token = m.group(1).strip()
        if not token:
            break
        # dovoljno velik bazen otvorenih radova za izbor najnovijih po razini
        if open_count >= max(want_n * 2, 24):
            break
        time.sleep(1.0)

    # rasporedi: najnoviji prvo, uravnotezeno po razini do want_n
    picked = []
    pools = {lvl: sorted(v, reverse=True) for lvl, v in by_level.items()}
    order = [lvl for lvl in ("diplomski", "zavrsni", "specijalisticki", "doktorski") if lvl in pools]
    i = 0
    while len(picked) < want_n and any(pools[lvl] for lvl in order):
        lvl = order[i % len(order)]
        if pools[lvl]:
            year, pid = pools[lvl].pop(0)
            picked.append({"pid": pid, "repository": host, "unitId": unit_id, "level": lvl})
        i += 1
    stats = {"scanned": scanned, "open": open_count, "byLevel": {lvl: len(v) for lvl, v in by_level.items()}}
    return picked, stats, pages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("host")
    ap.add_argument("unitId")
    ap.add_argument("--n", type=int, default=12)
    ap.add_argument("--max-pages", type=int, default=25)
    ap.add_argument("--from", dest="from_date", default="2019-01-01",
                    help="OAI 'from' datum (recentniji radovi = aktualni format); prazno za sve")
    ap.add_argument("--publisher", help="djeljeni repo: zadrzi samo dc:publisher koji sadrzi ovaj tekst")
    ap.add_argument("--out")
    args = ap.parse_args()

    try:
        picked, stats, pages = discover(args.host, args.unitId, args.n, args.max_pages,
                                        args.from_date or None, args.publisher)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": f"{type(exc).__name__}: {exc}", "host": args.host}), file=sys.stderr)
        sys.exit(2)

    result = {"unitId": args.unitId, "host": args.host, "pages": pages,
              "stats": stats, "picked": picked}
    text = json.dumps(result, ensure_ascii=False, indent=1)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(text)
        print(f"discovered {len(picked)} PID-ova (open {stats['open']}/{stats['scanned']} skenirano) "
              f"-> {args.out}", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
