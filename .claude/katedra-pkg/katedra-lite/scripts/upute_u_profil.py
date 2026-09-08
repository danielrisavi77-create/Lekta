#!/usr/bin/env python3
"""Upute fakulteta (PDF/DOCX/TXT) → kandidati profila → skica profila po _schema.json (v1.9).

Do sada se profil fakulteta pisao ručno iz PDF-a Uputa. Ova skripta radi PRVI korak
strojno i NIŠTA ne izmišlja: svaki kandidat nosi doslovni citat iz Uputa i lokator
(stranica, odlomak); bez citata nema kandidata. Potvrđuje ČOVJEK — skica uvijek nosi
`status: nepotvrdeno`, a profil ulazi u registry tek kroz faculty_scale_gate.py
(vidi references/upute_u_profil.md).

Tijek:
  1. tekst    PDF → `pdftotext -layout` (ako postoji), inače pypdf, inače pdfplumber;
              .docx → python-docx (prijelomi stranica = granice stranica); .txt → \\f = nova stranica.
  2. kandidati  detektori (regex + heuristike, hrvatski) → --out kandidati.json:
              {putanja_u_profilu, vrijednost, citat (≤300 zn.), lokator {stranica, odlomak_idx},
               confidence (0–1), pravilo_detekcije}
  3. skica    --profil-skica skica.json --fakultet <slug> --naziv "<naziv>": kandidati s
              confidence ≥ 0.7 ulaze kao vrijednosti (samo ako prolaze shemu), ostali i sukobi
              idu u `napomene` i u sidecar <skica>.kandidati_za_potvrdu.json (shema ima
              additionalProperties:false, pa `_kandidati_za_potvrdu` ne smije u profil).
              Provenance: locator "str. N, odl. M", type explicit, confidence kandidata.
  4. test     --usporedi references/fakulteti/<slug>.json: slaže se / razlikuje / nedostaje
              prema ručnom profilu + postotak pogotka (mjera kvalitete detektora).

Uporaba:
  python3 scripts/upute_u_profil.py Upute.pdf --out kandidati.json
  python3 scripts/upute_u_profil.py Upute.pdf --profil-skica skica.json --fakultet hks-fzs \\
          --naziv "Hrvatsko katoličko sveučilište, Fakultet zdravstvenih studija" [--tip diplomski] [--stil vancouver]
  python3 scripts/upute_u_profil.py tests/fixtures/upute_hks_fzs.txt --profil-skica /tmp/s.json \\
          --fakultet hks-fzs --naziv "…" --usporedi references/fakulteti/hks-fzs.json
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import shutil
import subprocess
import sys

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
KORIJEN = os.path.dirname(SKRIPTE)
if SKRIPTE not in sys.path:
    sys.path.insert(0, SKRIPTE)
from provjeri_dijelove import SINONIMI_DIJELOVA, bez_dijakritika, prepoznaj_dio, slugify  # noqa: E402

SHEMA = os.path.join(KORIJEN, "references", "fakulteti", "_schema.json")
PRAG = 0.7
MAX_CITAT = 300

# ------------------------------------------------------------------ učitavanje

_RE_NASLOVNI_REDAK = re.compile(r"^\s*\d+(?:\.\d+)*\.?\s+\S")
_RE_STAVKA_REDAK = re.compile(r"^\s*\d{1,2}[.)]\s+\S")


def _blokovi(stranica: str) -> list[str]:
    """Odlomci = blokovi između praznih redaka. pypdf/pdfplumber ne daju prazne retke, pa se
    blok bez njih dodatno reže na retku koji izgleda kao naslov ili stavka popisa (uzastopne
    stavke ostaju zajedno)."""
    out = []
    for blok in re.split(r"\n\s*\n", stranica):
        retci = blok.splitlines()
        if len(retci) <= 8:
            out.append(blok)
            continue
        tekuci: list[str] = []
        for i, r in enumerate(retci):
            prethodni = retci[i - 1] if i else ""
            nova = _RE_NASLOVNI_REDAK.match(r) and not (_RE_STAVKA_REDAK.match(r) and _RE_STAVKA_REDAK.match(prethodni))
            if nova and tekuci:
                out.append("\n".join(tekuci))
                tekuci = []
            tekuci.append(r)
        if tekuci:
            out.append("\n".join(tekuci))
    return out


def _odlomci_iz_teksta(tekst: str) -> list[list[dict]]:
    """Stranice (\\f) → odlomci (prazan redak = granica). Retci se čuvaju za popise."""
    stranice = []
    for si, stranica in enumerate(tekst.split("\f"), start=1):
        odlomci = []
        for blok in _blokovi(stranica):
            retci = [r.strip() for r in blok.splitlines() if r.strip()]
            if not retci:
                continue
            spojeno = ""
            for r in retci:
                if spojeno.endswith("-") and r[:1].islower():
                    spojeno = spojeno[:-1] + r
                else:
                    spojeno = (spojeno + " " + r).strip()
            odlomci.append({"stranica": si, "odlomak_idx": len(odlomci) + 1, "tekst": spojeno, "retci": retci})
        stranice.append(odlomci)
    # numerirani popis prelomljen preko stranice: nastavak se spaja na početak popisa
    for i in range(1, len(stranice)):
        if not stranice[i - 1] or not stranice[i]:
            continue
        zadnji, prvi = stranice[i - 1][-1], stranice[i][0]
        if (all(_RE_STAVKA_REDAK.match(r) for r in zadnji["retci"]) and all(_RE_STAVKA_REDAK.match(r) for r in prvi["retci"])
                and int(re.match(r"\s*(\d+)", prvi["retci"][0]).group(1)) == int(re.match(r"\s*(\d+)", zadnji["retci"][-1]).group(1)) + 1):
            zadnji["retci"] = zadnji["retci"] + prvi["retci"]
            zadnji["tekst"] = zadnji["tekst"] + " " + prvi["tekst"]
            stranice[i].pop(0)
            for j, o in enumerate(stranice[i], start=1):
                o["odlomak_idx"] = j
    return stranice


def _pdf_tekst(put: str) -> str:
    if shutil.which("pdftotext"):
        r = subprocess.run(["pdftotext", "-layout", put, "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout
    try:
        import pypdf
        return "\f".join((p.extract_text() or "") for p in pypdf.PdfReader(put).pages)
    except ImportError:
        pass
    try:
        import pdfplumber
        with pdfplumber.open(put) as pdf:
            return "\f".join((p.extract_text() or "") for p in pdf.pages)
    except ImportError as exc:
        raise SystemExit("❌ za PDF treba pdftotext (poppler), pypdf ili pdfplumber — ništa nije instalirano") from exc


def _docx_tekst(put: str) -> str:
    from docx import Document
    doc = Document(put)
    out = []
    for p in doc.paragraphs:
        xml = p._p.xml
        if 'w:type="page"' in xml or "pageBreakBefore" in xml or "<w:sectPr" in xml:
            out.append("\f")
        t = p.text.strip()
        if t:
            out.append(t + "\n\n")
    return "".join(out)


def ucitaj(put: str) -> list[list[dict]]:
    ext = os.path.splitext(put)[1].lower()
    if ext == ".pdf":
        tekst = _pdf_tekst(put)
    elif ext == ".docx":
        tekst = _docx_tekst(put)
    else:
        tekst = open(put, encoding="utf-8", errors="replace").read()
    return _odlomci_iz_teksta(tekst)


# --------------------------------------------------------------------- pomoćno

def _n(s: str) -> str:
    """Normalizirani tekst iste duljine (indeksi se poklapaju s izvornikom)."""
    return bez_dijakritika(s).lower()


# granica rečenice: interpunkcija + razmak + veliko slovo; kratice „br.", „str.", „npr.", „odj." ne prekidaju
_RE_RECENICA = re.compile(r"(?<=[.!?])(?<!\bbr\.)(?<!\bstr\.)(?<!\bnpr\.)(?<!\bodj\.)(?<!\btzv\.)(?<!\bsl\.)\s+(?=[A-ZČĆŽŠĐ„(])")


def recenice(tekst: str) -> list[str]:
    return [s.strip() for s in _RE_RECENICA.split(tekst) if s.strip()]


def _broj(s: str) -> float:
    return float(s.replace(".", "").replace(",", ".")) if re.search(r"\d[.,]\d", s) and "," in s else float(s.replace(",", "."))


def _cijeli(s: str) -> int:
    return int(re.sub(r"[.\s]", "", s))


def kandidat(putanja, vrijednost, citat, odl, conf, pravilo):
    return {"putanja_u_profilu": putanja, "vrijednost": vrijednost,
            "citat": citat.strip()[:MAX_CITAT], "lokator": {"stranica": odl["stranica"], "odlomak_idx": odl["odlomak_idx"]},
            "confidence": round(float(conf), 2), "pravilo_detekcije": pravilo}


# nazivi dijelova u Uputama → slug (za opseg po dijelovima i podsekcije)
_DIO_RE = re.compile(r"\b(uvod\w*|rasprav\w*|sazet\w*|summary|abstract|zakljuc\w*|metod\w*|rezultat\w*|zivotopis\w*|"
                     r"literatur\w*|teorijsk\w* dio|empirijsk\w* dio|prilo[gz]\w*)\b")


def _slug_dijela(rijec: str) -> str | None:
    return prepoznaj_dio(rijec)


TIPOVI = {"diplomski": r"diplomsk", "zavrsni": r"zavrsn", "seminarski": r"seminarsk", "esej": r"\besej"}


def tip_iz_recenice(n: str, zadani: str | None) -> str | None:
    for tip, rx in TIPOVI.items():
        if re.search(rx, n):
            return tip
    return zadani


# ------------------------------------------------------------------- detektori

FONTOVI = ["times new roman", "book antiqua", "palatino linotype", "liberation serif", "dejavu serif",
           "arial", "calibri", "cambria", "garamond", "georgia", "verdana", "palatino", "helvetica"]
_RE_FONT = re.compile(r"\b(" + "|".join(re.escape(f) for f in FONTOVI) + r")\b")
_RE_VEL = re.compile(r"(?:velicin\w*\s+(?:fonta|slova|pisma|teksta)?\s*(?:je|od|:)?\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:pt|tocak[ae]|tockic[ae])\b)")


def d_font(odl, ctx):
    out = []
    for s in recenice(odl["tekst"]):
        n = _n(s)
        m = _RE_FONT.search(n)
        if m:
            ime = s[m.start():m.end()]
            conf = 0.9 if re.search(r"\bfont|pism[oa]|slov", n) else 0.7
            out.append(kandidat("format.font", [ime], s, odl, conf, "D_FONT"))
        if re.search(r"\bfont|pism[oa]|slov|tekst rada|velicin", n) and not re.search(r"naslov|natpis|tablic|fusnot|biljes", n):
            mv = _RE_VEL.search(n)
            if mv:
                v = int(mv.group(1) or mv.group(2))
                if 8 <= v <= 16:
                    out.append(kandidat("format.velicina_pt", v, s, odl, 0.85 if m else 0.7, "D_VELICINA"))
    return out


_RE_PRORED = re.compile(r"(?:prored\w*|razmak (?:izmedu|medu) (?:redova|redaka|linija|slova)|line spacing)\s*(?:je|od|iznosi|:|teksta je)?\s*(\d[,.]\d{1,2}|\d)\b")


def d_prored(odl, ctx):
    out = []
    for s in recenice(odl["tekst"]):
        n = _n(s)
        if re.search(r"naslov|natpis|tablic|fusnot|sazetak", n) and not re.search(r"tekst rada|cijel", n):
            continue
        m = _RE_PRORED.search(n)
        if m:
            out.append(kandidat("format.prored", float(m.group(1).replace(",", ".")), s, odl, 0.85, "D_PRORED"))
        elif re.search(r"jednostruk\w* prored", n):
            out.append(kandidat("format.prored", 1.0, s, odl, 0.8, "D_PRORED"))
        elif re.search(r"dvostruk\w* prored", n):
            out.append(kandidat("format.prored", 2.0, s, odl, 0.8, "D_PRORED"))
    return out


_STRANE = {"gornj": "gore", "donj": "dolje", "lijev": "lijevo", "desn": "desno"}


def d_margine(odl, ctx):
    out = []
    for s in recenice(odl["tekst"]):
        n = _n(s)
        if "margin" not in n:
            continue
        nasao = False
        for kor, kljuc in _STRANE.items():
            m = re.search(kor + r"\w*\s*(?:margin\w*)?\s*(?:je|od|:)?\s*(\d+[,.]?\d*)\s*cm", n)
            if m:
                out.append(kandidat(f"format.margine_cm.{kljuc}", _broj(m.group(1)), s, odl, 0.85, "D_MARGINE"))
                nasao = True
        if not nasao:
            m = re.search(r"(?:sve\s+)?margin\w*\s*(?:su|je|od|iznose|:)?\s*(\d+[,.]?\d*)\s*cm", n)
            if m:
                for kljuc in _STRANE.values():
                    out.append(kandidat(f"format.margine_cm.{kljuc}", _broj(m.group(1)), s, odl, 0.8, "D_MARGINE_SVE"))
    return out


_RE_RASPON = re.compile(r"(?:od\s+)?(\d{1,3}(?:[.]\d{3})?)\s*(?:do|-|–|i)\s*(\d{1,3}(?:[.]\d{3})?)\s*(stranic|kartic|rijec)")
_RE_IZVORI = re.compile(r"(?:najmanje|minimalno|barem)\s+(\d{1,3})\s+(?:razlicit\w+\s+)?(?:izvor|referenc|jedinic\w* literatur|bibliografsk|literaturn)")


def d_opseg(odl, ctx):
    out = []
    for s in recenice(odl["tekst"]):
        n = _n(s)
        if _DIO_RE.search(n) and not re.search(r"\brad\b|rada\b", n):
            continue  # opseg dijela rješava d_dijelovi
        tip = tip_iz_recenice(n, ctx.get("tip"))
        m = _RE_RASPON.search(n)
        if m and tip and re.search(r"opseg|duljin|dug|obuhva|ima|sadrz|stranic|rijec", n):
            a, b = _cijeli(m.group(1)), _cijeli(m.group(2))
            kljuc = "stranice" if m.group(3).startswith("stranic") else ("rijeci" if m.group(3).startswith("rijec") else "kartice")
            put = f"struktura.opseg.{tip}.{kljuc}"
            out.append(kandidat(put, [a, b], s, odl, 0.85 if kljuc != "kartice" else 0.5, "D_OPSEG_RASPON"))
        mi = _RE_IZVORI.search(n)
        if mi and tip:
            out.append(kandidat(f"struktura.opseg.{tip}.izvori_min", int(mi.group(1)), s, odl, 0.85, "D_IZVORI_MIN"))
        mn = re.search(r"najmanje\s+(\d{1,3})\s+ispitanik", n)
        if mn:
            out.append(kandidat("struktura.istrazivanje.ispitanici_min", int(mn.group(1)), s, odl, 0.6, "D_ISPITANICI"))
    return out


_RE_MIN = re.compile(r"(?:najmanje|minimalno|ne manje od|barem|mora (?:sadrzavati|imati) najmanje)\s+(\d{1,3}(?:[. ]?\d{3})*)\s*(rijec|znak|stranic|kartic)")
_RE_MAX = re.compile(r"(?:najvise|maksimalno|ne vise od|ne smije (?:prelaziti|biti (?:dulj\w+|duz\w+|vec\w+) od)|moze imati najvise|do)\s+(\d{1,3}(?:[. ]?\d{3})*)\s*(rijec|znak|stranic|kartic)")
_RE_UDIO = re.compile(r"(?:ne smije (?:prelaziti|biti (?:vec\w+|dulj\w+) od)|najvise|do)\s+(trecin\w*|polovi[cn]\w*|cetvrtin\w*|petin\w*|(\d{1,2})\s*%)")
_UDJELI = {"trecin": 0.3333, "polovi": 0.5, "cetvrtin": 0.25, "petin": 0.2}


def d_dijelovi(odl, ctx):
    out = []
    tip = ctx.get("tip")
    if not tip:
        return out
    for s in recenice(odl["tekst"]):
        n = _n(s)
        spomeni = [(m.start(), _slug_dijela(m.group(1))) for m in _DIO_RE.finditer(n)]
        spomeni = [(p, sl) for p, sl in spomeni if sl]
        if not spomeni:
            continue

        def dio_za(poz):
            prije = [sl for p, sl in spomeni if p <= poz]
            return prije[-1] if prije else spomeni[0][1]

        for m in _RE_MIN.finditer(n):
            jed = m.group(2)
            kljuc = {"rijec": "rijeci_min", "znak": "znakovi_min", "stranic": "stranice_min", "kartic": "kartice_min"}[jed]
            conf = 0.85 if kljuc == "rijeci_min" else 0.5
            out.append(kandidat(f"struktura.opseg.{tip}.dijelovi.{dio_za(m.start())}.{kljuc}", _cijeli(m.group(1)), s, odl, conf, "D_DIO_MIN"))
        for m in _RE_MAX.finditer(n):
            jed = m.group(2)
            kljuc = {"rijec": "rijeci_max", "znak": "znakovi_max", "stranic": "stranice_max", "kartic": "kartice_max"}[jed]
            conf = 0.85 if kljuc in ("rijeci_max", "znakovi_max") else 0.5
            out.append(kandidat(f"struktura.opseg.{tip}.dijelovi.{dio_za(m.start())}.{kljuc}", _cijeli(m.group(1)), s, odl, conf, "D_DIO_MAX"))
        for m in _RE_UDIO.finditer(n):
            if m.group(2):
                udio = int(m.group(2)) / 100
            else:
                udio = next((v for k, v in _UDJELI.items() if m.group(1).startswith(k)), None)
            if udio is not None and re.search(r"teksta|rada|opsega|ukupn", n):
                out.append(kandidat(f"struktura.opseg.{tip}.dijelovi.{dio_za(m.start())}.udio_max", udio, s, odl, 0.8, "D_DIO_UDIO"))
    return out


_RE_POPIS_STAVKA = re.compile(r"^\s*(\d{1,2})[.)]\s+(\S.*?)\s*$")
_RE_NEOBAVEZNO = re.compile(r"\(\s*(?:nije\s+obavez|nije\s+obvez|neobavez|neobvez|po\s+potrebi|ako\s+(?:postoj|je\s+potreb)|opcional|fakultativ)[^)]*\)", re.I)


def _stavke_popisa(retci: list[str]) -> list[tuple[int, str]]:
    stavke = []
    for r in retci:
        m = _RE_POPIS_STAVKA.match(r)
        if not m or len(m.group(2).split()) > 7 or m.group(2).endswith("."):
            return stavke if len(stavke) >= 5 else []
        stavke.append((int(m.group(1)), m.group(2)))
    return stavke if len(stavke) >= 5 else []


def d_obavezni_dijelovi(odl, ctx, sljedeci: list[dict]):
    """Numerirani popis naslova (≥ 5 stavki, počinje s 1.) u jednom odlomku ili u nizu odlomaka-stavki
    (pdftotext -layout svaku stavku daje kao zaseban odlomak)."""
    if not odl["retci"] or not all(_RE_STAVKA_REDAK.match(r) for r in odl["retci"]):
        return []
    retci = list(odl["retci"])
    for o in sljedeci:
        if o["retci"] and all(_RE_STAVKA_REDAK.match(r) for r in o["retci"]):
            retci += o["retci"]
        else:
            break
    stavke = _stavke_popisa(retci)
    if not stavke or stavke[0][0] != 1 or [b for b, _ in stavke] != list(range(1, len(stavke) + 1)):
        return []
    tip = ctx.get("tip")
    citat = " ".join(f"{b}. {t}" for b, t in stavke)
    obavezni, out = [], []
    for broj, naziv in stavke:
        neob = bool(_RE_NEOBAVEZNO.search(naziv))
        cisto = _RE_NEOBAVEZNO.sub("", naziv).strip().lower()
        if not neob:
            obavezni.append(cisto)
        slug = prepoznaj_dio(cisto)
        if slug and tip:
            out.append(kandidat(f"struktura.opseg.{tip}.dijelovi.{slug}.redoslijed", broj, citat, odl, 0.8, "D_POPIS_REDOSLIJED"))
            out.append(kandidat(f"struktura.opseg.{tip}.dijelovi.{slug}.obavezan", not neob, citat, odl, 0.8, "D_POPIS_OBAVEZAN"))
    out.insert(0, kandidat("struktura.obavezni_dijelovi", obavezni, citat, odl, 0.85, "D_POPIS_DIJELOVA"))
    return out


def d_citiranje(odl, ctx):
    out = []
    for s in recenice(odl["tekst"]):
        n = _n(s)
        if not re.search(r"citir|referenc|literatur|navod|bibliograf|stil", n):
            continue
        if "vancouver" in n:
            out.append(kandidat("citiranje.stil", "vancouver", s, odl, 0.9, "D_STIL_KLJUCNA"))
        if re.search(r"\bapa\b", n):
            out.append(kandidat("citiranje.stil", "apa", s, odl, 0.85, "D_STIL_KLJUCNA"))
        if "harvard" in n:
            out.append(kandidat("citiranje.stil", "harvard", s, odl, 0.85, "D_STIL_KLJUCNA"))
        if re.search(r"\bieee\b", n):
            out.append(kandidat("citiranje.stil", "ieee", s, odl, 0.85, "D_STIL_KLJUCNA"))
        if re.search(r"chicago|mla\b|oxford", n):
            out.append(kandidat("citiranje.stil", re.search(r"chicago|mla\b|oxford", n).group(0), s, odl, 0.5, "D_STIL_IZVAN_ENUMA"))
        if re.search(r"autor[\s-]+godin|prezime,?\s*godin|\(prezime, \d{4}", n):
            out.append(kandidat("citiranje.stil", "autor-godina", s, odl, 0.8, "D_STIL_KLJUCNA"))
        if re.search(r"fusnot|biljesk\w* ispod crte", n) and re.search(r"citir|navod", n):
            out.append(kandidat("citiranje.stil", "legal-footnote", s, odl, 0.5, "D_STIL_FUSNOTE"))
        # primjeri oblika citata u tekstu
        if re.search(r"\(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\)", s) and re.search(r"citir|referenc", n):
            out.append(kandidat("citiranje.stil", "vancouver", s, odl, 0.5, "D_STIL_PRIMJER_OVALNE"))
            out.append(kandidat("citiranje.u_tekstu", s, s, odl, 0.5, "D_U_TEKSTU_PRIMJER"))
        if re.search(r"\[\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\]", s) and re.search(r"citir|referenc", n):
            out.append(kandidat("citiranje.stil", "ieee", s, odl, 0.55, "D_STIL_PRIMJER_UGLATE"))
        if re.search(r"\([A-ZČĆŽŠĐ][a-zčćžšđ]+(?: i [A-ZČĆŽŠĐ][a-zčćžšđ]+)?,?\s*\d{4}\.?(?:,\s*str\.\s*\d+)?\)", s):
            out.append(kandidat("citiranje.stil", "autor-godina", s, odl, 0.6, "D_STIL_PRIMJER_AUTOR_GODINA"))
            out.append(kandidat("citiranje.u_tekstu", s, s, odl, 0.5, "D_U_TEKSTU_PRIMJER"))
        if re.search(r"uvlak|uvuc", n) and re.search(r"popis|literatur|bibliograf", n):
            out.append(kandidat("citiranje.uvlaka_u_popisu", not bool(re.search(r"\bne\b|bez", n)), s, odl, 0.6, "D_UVLAKA"))
    m = re.search(r"(?:primjer|npr\.?)\s*:?\s*([A-ZČĆŽŠĐ][^\n]{30,220}\d{4}[^\n]{0,80})", odl["tekst"])
    if m and re.search(r"citir|referenc|literatur|popis", _n(odl["tekst"])):
        out.append(kandidat("citiranje.popis_primjer", m.group(1).strip(), odl["tekst"], odl, 0.5, "D_POPIS_PRIMJER"))
    return out


def d_numeracija(odl, ctx):
    """Fragmenti iz više rečenica istog odlomka spajaju se u jedan objekt (prednji_dio + tijelo)."""
    obj: dict = {}
    citati = []
    for s in recenice(odl["tekst"]):
        n = _n(s)
        if not re.search(r"stranic|paginac", n) or not re.search(r"numer|broj\w*\s+stranic|paginac|oznac", n):
            continue
        prije = dict(obj)
        if re.search(r"rimsk", n):
            obj["prednji_dio"] = "rimski"
        if re.search(r"(naslovnic|prednj\w* dio|prve stranice|uvodn\w* stranice)[^.]*?(ne nos|ne numerir|bez broj|ne broj|nemaju broj)", n):
            obj["prednji_dio"] = "bez"
        if re.search(r"arapsk", n):
            obj["tijelo"] = "arapski"
        if re.search(r"(?:prva stranica uvoda|uvod\w*)[^.]*?(?:stranic\w*\s*(?:br\.?\s*)?1\b|broj\w*\s*1\b|kao\s*1\b|od\s*1\b)", n):
            obj["tijelo_pocinje_od"] = 1
            obj["prijelom_kod"] = "uvod"
            obj.setdefault("tijelo", "arapski")
        if obj != prije or re.search(r"donj|gornj|sredin|desn|lijev", n):
            citati.append(s.strip())
    if not obj:
        return []
    obj["opis"] = " ".join(citati)[:200]
    conf = 0.8 if "prednji_dio" in obj and "tijelo" in obj else 0.5
    return [kandidat("format.numeracija", obj, " ".join(citati), odl, conf, "D_NUMERACIJA")]


def d_format_ostalo(odl, ctx):
    out = []
    for s in recenice(odl["tekst"]):
        n = _n(s)
        m = re.search(r"razmak\w*\s+(?:izmedu|iza|nakon|ispred|prije)?\s*odloma?k\w*\s*(?:je|od|iznosi|:)?\s*(\d{1,2})\s*(?:pt|tocak|tockic)", n)
        if m:
            out.append(kandidat("format.odlomak.razmak_pt", int(m.group(1)), s, odl, 0.85, "D_RAZMAK_ODLOMAKA"))
        m = re.search(r"odloma?k\w*\s+(?:sadrzi|ima|obuhvaca|se sastoji od|treba imati)?\s*(?:od\s+)?(\d{1,2})\s*(?:-|–|do)\s*(\d{1,2})\s*(redaka|redova|recenic)", n)
        if m:
            kljuc = "recenica" if m.group(3).startswith("recenic") else "redaka"
            out.append(kandidat(f"format.odlomak.min_{kljuc}", int(m.group(1)), s, odl, 0.85, "D_ODLOMAK_RASPON"))
            if kljuc == "redaka":
                out.append(kandidat("format.odlomak.max_redaka", int(m.group(2)), s, odl, 0.85, "D_ODLOMAK_RASPON"))
        if re.search(r"obostran\w*\s+poravna|poravna\w*\s+obostran|justif", n):
            out.append(kandidat("format.poravnanje", "obostrano", s, odl, 0.85, "D_PORAVNANJE"))
        elif re.search(r"poravna\w*\s+(?:u)?lijevo|lijev\w*\s+poravna", n):
            out.append(kandidat("format.poravnanje", "lijevo", s, odl, 0.85, "D_PORAVNANJE"))
        if re.search(r"svako\s+(?:novo\s+)?poglavlje\s+(?:pocinje|zapocinje|mora poceti|se pise)\s+na\s+novoj\s+stranici|nov\w+\s+stranic\w+\s+za\s+svako\s+poglavlje", n):
            out.append(kandidat("format.prijelom_pred_poglavljem", True, s, odl, 0.85, "D_PRIJELOM"))
        m = re.search(r"trecem\s+licu\s+(jednine|mnozine)|prvom\s+licu\s+(mnozine|jednine)", n)
        if m:
            v = {"jednine": "trece-jednina", "mnozine": "trece-mnozina"}.get(m.group(1)) if m.group(1) else \
                {"mnozine": "prvo-mnozina", "jednine": "prvo-jednina"}.get(m.group(2))
            out.append(kandidat("format.lice", v, s, odl, 0.85 if v != "prvo-jednina" else 0.5, "D_LICE"))
        m = re.search(r"naslov\w*\s+poglavlj\w*[^.]*?(\d{1,2})\s*(?:pt|tocak|tockic)", n)
        if m:
            out.append(kandidat("format.naslov_poglavlja_pt", int(m.group(1)), s, odl, 0.7, "D_NASLOV_PT"))
    return out


def d_prikazi(odl, ctx):
    out = []
    for s in recenice(odl["tekst"]):
        n = _n(s)
        if not re.search(r"tablic|slik|grafikon|prikaz", n):
            continue
        _gl = r"(?:stoji|se pise|pise se|navodi se|se navodi|nalazi se|se nalazi|je|se stavlja|stavlja se|treba biti|mora biti)"
        m = re.search(r"(?:naslov|natpis|naziv)\w*\s+tablic\w*\s+" + _gl + r"?\s*(iznad|ispod)\b", n) or \
            re.search(r"\b(iznad|ispod)\s+tablic\w*\s+" + _gl + r"\s+(?:naslov|natpis|naziv)", n)
        if m:
            out.append(kandidat("struktura.prikazi.natpis", m.group(1), s, odl, 0.85, "D_NATPIS"))
        m = re.search(r"izvor\w*[^.]*?(ne\s+)?(?:navodi|pise|stoji|nalazi)\s+se\s+ispod", n)
        if m:
            out.append(kandidat("struktura.prikazi.izvor_ispod", not bool(m.group(1)), s, odl, 0.75, "D_IZVOR_ISPOD"))
        if re.search(r"(?:svak\w+|sve)\s+(?:tablic|slik|prikaz)\w*[^.]*?(?:mora|moraju|treba)\w*\s+biti\s+(?:spomenut|naveden|referenc|citiran|najavljen)\w*\s+u\s+tekstu", n):
            out.append(kandidat("struktura.prikazi.mora_biti_spomenut_u_tekstu", True, s, odl, 0.8, "D_SPOMENUT"))
        if re.search(r"(?:tablic|prikaz)\w*[^.]*?ne\s+smije\s+(?:se\s+)?(?:lomiti|prelamati|dijeliti)", n):
            out.append(kandidat("struktura.prikazi.ne_smije_se_lomiti", True, s, odl, 0.75, "D_NE_LOMITI"))
    return out


_BROJEVI = {"jedan": 1, "jedna": 1, "dva": 2, "dvije": 2, "tri": 3, "cetiri": 4, "pet": 5}


def d_predaja(odl, ctx):
    out = []
    for s in recenice(odl["tekst"]):
        n = _n(s)
        if "turnitin" in n:
            out.append(kandidat("predaja.turnitin", True, s, odl, 0.9, "D_TURNITIN"))
        elif re.search(r"(?:program|softver|sustav|alat)\w*\s+(?:koji\s+otkriva|za\s+otkrivanje|za\s+provjeru)\s+(?:plagi|izvornosti)|provjer\w*\s+(?:izvornosti|plagi)|otkriva\w*\s+plagi", n):
            out.append(kandidat("predaja.turnitin", True, s, odl, 0.7, "D_PROVJERA_IZVORNOSTI"))
        m = re.search(r"(\d{1,2})\s*%\s*(?:podudar|slicnost|preklap)", n)
        if m:
            out.append(kandidat("predaja.prag_podudarnosti", int(m.group(1)), s, odl, 0.8, "D_PRAG"))
        m = re.search(r"\b(\d|jedan|jedna|dva|dvije|tri|cetiri|pet)\s+(?:tiskan\w*\s+|uvezan\w*\s+|tvrdo\s+uvezan\w*\s+)?primjer", n)
        if m and re.search(r"predaj|dostav|uvez|tisk", n):
            v = int(m.group(1)) if m.group(1).isdigit() else _BROJEVI[m.group(1)]
            out.append(kandidat("predaja.broj_uvezanih", v, s, odl, 0.75, "D_PRIMJERCI"))
        m = re.search(r"(tvrd\w*|mek\w*|spiraln\w*)\s+uvez", n)
        if m:
            out.append(kandidat("predaja.uvez", s[m.start():m.end()], s, odl, 0.7, "D_UVEZ"))
        m = re.search(r"obran\w*[^.]*?(\d{1,3})\s*minut", n)
        if m:
            out.append(kandidat("obrana.trajanje_min", int(m.group(1)), s, odl, 0.75, "D_OBRANA"))
        m = re.search(r"(\d{1,2})\s*slajd", n)
        if m and "obran" in n:
            out.append(kandidat("obrana.slajdova", int(m.group(1)), s, odl, 0.7, "D_OBRANA"))
    return out


_RE_POPIS_U_RECENICI = re.compile(r":\s*([A-ZČĆŽŠĐ][^.;:]{2,200})")


def d_podsekcije(odl, ctx):
    out = []
    tip = ctx.get("tip")
    if not tip:
        return out
    for s in recenice(odl["tekst"]):
        n = _n(s)
        spomeni = [(m.start(), _slug_dijela(m.group(1))) for m in _DIO_RE.finditer(n)]
        spomeni = [(p, sl) for p, sl in spomeni if sl]
        if not spomeni:
            continue
        slug = spomeni[0][1]
        if re.search(r"podnaslov|podsekcij|potpoglavlj|odjelj|dijelov|sadrzi|sastoji se|obuhvaca|redoslijed|struktur", n):
            m = _RE_POPIS_U_RECENICI.search(s)
            if m:
                stavke = [x.strip() for x in re.split(r",\s*(?:i\s+|te\s+)?|\s+i\s+(?=[A-ZČĆŽŠĐ])", m.group(1)) if x.strip()]
                stavke = [x for x in stavke if len(x.split()) <= 5]
                if len(stavke) >= 3:
                    out.append(kandidat(f"struktura.opseg.{tip}.dijelovi.{slug}.podsekcije", [slugify(x) for x in stavke], s, odl, 0.8, "D_PODSEKCIJE_POPIS"))
        m = re.search(r"predzadnj\w+[^„\"“]*[„\"“]([^\"”“]+)[\"”“][^„\"“]*zadnj\w+[^„\"“]*[„\"“]([^\"”“]+)[\"”“]", s, re.I)
        if m:
            out.append(kandidat(f"struktura.opseg.{tip}.dijelovi.{slug}.podsekcije", [slugify(m.group(1)), slugify(m.group(2))], s, odl, 0.75, "D_PODSEKCIJE_ZADNJE"))
    return out


DETEKTORI = [d_font, d_prored, d_margine, d_opseg, d_dijelovi, d_citiranje, d_numeracija, d_format_ostalo, d_prikazi, d_predaja, d_podsekcije]


def zadani_tip(stranice, eksplicitno: str | None) -> str | None:
    if eksplicitno:
        return eksplicitno
    n = _n(" ".join(o["tekst"] for st in stranice[:2] for o in st))
    brojac = {tip: len(re.findall(rx, n)) for tip, rx in TIPOVI.items()}
    naj = max(brojac, key=brojac.get)
    return naj if brojac[naj] else None


def detektiraj(stranice, tip: str | None) -> tuple[list[dict], dict]:
    ctx = {"tip": zadani_tip(stranice, tip)}
    svi = [o for st in stranice for o in st]
    kand = []
    for i, odl in enumerate(svi):
        for d in DETEKTORI:
            kand.extend(d(odl, ctx))
        kand.extend(d_obavezni_dijelovi(odl, ctx, svi[i + 1:i + 25]))
    # isti (putanja, vrijednost) iz više odlomaka → jedan kandidat s najvećim confidenceom
    jedinstveni: dict[tuple, dict] = {}
    for k in kand:
        kljuc = (k["putanja_u_profilu"], json.dumps(k["vrijednost"], ensure_ascii=False, sort_keys=True))
        if kljuc not in jedinstveni or k["confidence"] > jedinstveni[kljuc]["confidence"]:
            jedinstveni[kljuc] = k
    kand = sorted(jedinstveni.values(), key=lambda k: (k["putanja_u_profilu"], -k["confidence"]))
    return kand, ctx


# ---------------------------------------------------------------------- skica

def _postavi(d: dict, putanja: str, v):
    dijelovi = putanja.split(".")
    for p in dijelovi[:-1]:
        d = d.setdefault(p, {})
        if not isinstance(d, dict):
            raise ValueError(putanja)
    d[dijelovi[-1]] = v


def _validiraj(profil: dict) -> list[str]:
    try:
        import jsonschema
    except ImportError:
        sys.path.insert(0, SKRIPTE)
        from profile_rules import _validate_against, ProfileRuleError  # type: ignore
        try:
            _validate_against(profil, __import__("pathlib").Path(SHEMA), "skica")
            return []
        except ProfileRuleError as exc:
            return [str(exc)]
    shema = json.load(open(SHEMA, encoding="utf-8"))
    return [f"{'/'.join(str(p) for p in e.path) or '(korijen)'}: {e.message[:120]}"
            for e in jsonschema.Draft7Validator(shema).iter_errors(profil)]


def skica_profila(kand: list[dict], ctx: dict, slug: str, naziv: str, dokument: str, stil: str | None) -> tuple[dict, list[dict]]:
    danas = _dt.date.today().isoformat()
    izvor = f"{os.path.basename(dokument)} — kandidati iz scripts/upute_u_profil.py, NEPOTVRĐENO"
    profil: dict = {
        "slug": slug, "naziv": naziv, "status": "nepotvrdeno",
        "izvor": {"dokument": izvor, "provjereno": danas},
        "citiranje": {}, "format": {}, "struktura": {},
        "napomene": [],
        "provenance": {"default": {"source": izvor, "type": "explicit", "confidence": 0.5, "verified_at": danas}, "rules": {}},
    }
    if ctx.get("tip"):
        profil["tipovi_radova"] = [ctx["tip"]]
    za_potvrdu: list[dict] = []
    # po putanji: najbolji kandidat ulazi, ostali (sukob) idu na potvrdu
    po_putanji: dict[str, list[dict]] = {}
    for k in kand:
        po_putanji.setdefault(k["putanja_u_profilu"], []).append(k)
    for putanja, lista in sorted(po_putanji.items()):
        lista.sort(key=lambda k: -k["confidence"])
        najbolji = lista[0]
        ostali = [k for k in lista[1:] if json.dumps(k["vrijednost"], sort_keys=True) != json.dumps(najbolji["vrijednost"], sort_keys=True)]
        if najbolji["confidence"] < PRAG:
            for k in lista:
                za_potvrdu.append({**k, "razlog": f"confidence {k['confidence']} < {PRAG}"})
            continue
        proba = json.loads(json.dumps(profil))
        try:
            _postavi(proba, putanja, najbolji["vrijednost"])
        except ValueError:
            za_potvrdu.append({**najbolji, "razlog": "putanja se sudara s postojećom vrijednošću"})
            continue
        greske = _validiraj(proba)
        if greske:
            za_potvrdu.append({**najbolji, "razlog": "shema odbija: " + greske[0]})
            continue
        profil = proba
        lok = najbolji["lokator"]
        profil["provenance"]["rules"]["/" + putanja.replace(".", "/")] = {
            "source": izvor, "locator": f"str. {lok['stranica']}, odl. {lok['odlomak_idx']} — „{najbolji['citat'][:120]}\"",
            "type": "explicit", "confidence": najbolji["confidence"], "verified_at": danas,
        }
        for k in ostali:
            za_potvrdu.append({**k, "razlog": f"SUKOB s prihvaćenim {json.dumps(najbolji['vrijednost'], ensure_ascii=False)} (conf {najbolji['confidence']})"})
    if "stil" not in profil["citiranje"]:
        if not stil:
            raise SystemExit("❌ stil citiranja nije pouzdano detektiran (shema ga traži). Što napraviti: pogledaj kandidate "
                             "citiranje.stil u --out datoteci pa zadaj --stil <vancouver|apa|apa-hr|harvard|ieee|autor-godina|legal-footnote>.")
        profil["citiranje"]["stil"] = stil
        profil["provenance"]["rules"]["/citiranje/stil"] = {"source": "zadano ručno (--stil), nije iz Uputa", "type": "derived",
                                                            "confidence": 0.5, "verified_at": danas, "derivation": "argument --stil"}
    profil["napomene"].insert(0, f"SKICA iz Uputa (scripts/upute_u_profil.py, {danas}): ništa nije potvrđeno čitanjem izvornika od strane čovjeka; "
                                 "svaka vrijednost ima citat i lokator u provenance.rules. Prije registryja: potvrditi, dopuniti aliase, "
                                 "podići confidence, provući faculty_scale_gate.py.")
    for k in za_potvrdu:
        lok = k["lokator"]
        profil["napomene"].append(f"[ZA POTVRDU] {k['putanja_u_profilu']} = {json.dumps(k['vrijednost'], ensure_ascii=False)[:80]} "
                                  f"(conf {k['confidence']}, {k['pravilo_detekcije']}; {k['razlog']}) — „{k['citat'][:140]}\" (str. {lok['stranica']}, odl. {lok['odlomak_idx']})")
    greske = _validiraj(profil)
    if greske:
        raise SystemExit("❌ skica ne prolazi _schema.json: " + "; ".join(greske[:5]))
    return profil, za_potvrdu


# ------------------------------------------------------------------- usporedba

RULE_ROOTS = ("citiranje", "format", "struktura", "predaja", "obrana")
OPISNI = re.compile(r"(^|\.)(napomena|u_tekstu|popis_primjer|opis|_razina_nalaza|_pravilo)(\.|$)")


def _listovi(d, prefiks="") -> dict[str, object]:
    out = {}
    if isinstance(d, dict) and d:
        for k, v in d.items():
            out.update(_listovi(v, f"{prefiks}.{k}" if prefiks else k))
    else:
        out[prefiks] = d
    return out


def _isto(a, b) -> bool:
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool):
        return abs(float(a) - float(b)) <= 0.01
    if isinstance(a, list) and isinstance(b, list):
        return [_n(str(x)).strip() for x in a] == [_n(str(x)).strip() for x in b]
    if isinstance(a, str) and isinstance(b, str):
        return _n(a).strip() == _n(b).strip()
    return a == b


def usporedi(skica: dict, rucni: dict) -> dict:
    prov = ((rucni.get("provenance") or {}).get("rules") or {})
    r_list = {k: v for k, v in _listovi({r: rucni[r] for r in RULE_ROOTS if r in rucni}).items()}
    s_list = {k: v for k, v in _listovi({r: skica[r] for r in RULE_ROOTS if r in skica}).items()}
    rez = {"pogodeno": [], "razlika": [], "nedostaje": [], "opisno": [], "zadano_paketa": [], "visak": []}
    for k, v in sorted(r_list.items()):
        pointer = "/" + k.replace(".", "/")
        if OPISNI.search(k):
            rez["opisno"].append((k, v, s_list.get(k)))
            continue
        p = prov.get(pointer) or {}
        if p.get("type") == "default":
            rez["zadano_paketa"].append((k, v))
            continue
        if k not in s_list:
            rez["nedostaje"].append((k, v))
        elif _isto(s_list[k], v):
            rez["pogodeno"].append((k, v))
        else:
            rez["razlika"].append((k, v, s_list[k]))
    for k, v in sorted(s_list.items()):
        if k not in r_list and not OPISNI.search(k):
            rez["visak"].append((k, v))
    n_usp = len(rez["pogodeno"]) + len(rez["razlika"]) + len(rez["nedostaje"])
    rez["postotak"] = round(100.0 * len(rez["pogodeno"]) / n_usp, 1) if n_usp else 0.0
    rez["usporedivo"] = n_usp
    # stroža mjera: bez `redoslijed`/`obavezan` listova, koji svi dolaze iz JEDNOG popisa dijelova
    # i inače napuhuju postotak
    iz_popisa = re.compile(r"\.dijelovi\.[a-z0-9_-]+\.(redoslijed|obavezan)$")
    pog = sum(1 for k, _ in rez["pogodeno"] if not iz_popisa.search(k))
    ukup = sum(1 for k, *_ in rez["pogodeno"] + rez["razlika"] + rez["nedostaje"] if not iz_popisa.search(k))
    rez["postotak_bez_popisa"] = round(100.0 * pog / ukup, 1) if ukup else 0.0
    rez["usporedivo_bez_popisa"] = ukup
    return rez


def ispisi_usporedbu(rez: dict, rucni_put: str) -> None:
    print(f"\nUSPOREDBA s ručnim profilom {rucni_put}")
    print("=" * 64)
    for k, v in rez["pogodeno"]:
        print(f"  ✅ {k} = {json.dumps(v, ensure_ascii=False)[:70]}")
    for k, v, s in rez["razlika"]:
        print(f"  ❌ {k}: ručno {json.dumps(v, ensure_ascii=False)[:50]} ≠ skica {json.dumps(s, ensure_ascii=False)[:50]}")
    for k, v in rez["nedostaje"]:
        print(f"  ⚠️ nedostaje u skici: {k} = {json.dumps(v, ensure_ascii=False)[:60]}")
    for k, v in rez["zadano_paketa"]:
        print(f"  ℹ️  zadano paketa (nije iz Uputa, ne broji se): {k} = {v}")
    for k, v, s in rez["opisno"]:
        print(f"  ℹ️  opisno polje (ne uspoređuje se): {k}" + (" — skica ima vrijednost" if s is not None else " — skica nema"))
    for k, v in rez["visak"]:
        print(f"  ➕ skica ima, ručni nema: {k} = {json.dumps(v, ensure_ascii=False)[:60]}")
    print(f"\nPOGOĐENO {len(rez['pogodeno'])}/{rez['usporedivo']} usporedivih ključeva = {rez['postotak']} % "
          f"(razlika {len(rez['razlika'])}, nedostaje {len(rez['nedostaje'])}; cilj ≥ 70 %)")
    print(f"  strože, bez redoslijed/obavezan iz popisa dijelova: {rez['postotak_bez_popisa']} % ({rez['usporedivo_bez_popisa']} ključeva)")


# ----------------------------------------------------------------------- main

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Upute fakulteta → kandidati profila → skica profila (v1.9).")
    ap.add_argument("upute", help="PDF / DOCX / TXT Uputa")
    ap.add_argument("--out", help="zapiši kandidate (JSON lista)")
    ap.add_argument("--tip", help="zadani tip rada za opseg (zadano: iz naslova Uputa)")
    ap.add_argument("--profil-skica", dest="skica", help="zapiši skicu profila po _schema.json")
    ap.add_argument("--fakultet", help="slug profila (uz --profil-skica)")
    ap.add_argument("--naziv", help="puni naziv fakulteta (uz --profil-skica)")
    ap.add_argument("--stil", help="stil citiranja ako nije detektiran (shema ga traži)")
    ap.add_argument("--usporedi", help="ručni profil <slug>.json za usporedbu sa skicom")
    ap.add_argument("--json", action="store_true", help="ispiši kandidate kao JSON na stdout")
    a = ap.parse_args(argv)

    stranice = ucitaj(a.upute)
    kand, ctx = detektiraj(stranice, a.tip)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            json.dump(kand, fh, ensure_ascii=False, indent=1)
    if a.json:
        print(json.dumps(kand, ensure_ascii=False, indent=1))
    else:
        print(f"UPUTE → KANDIDATI — {a.upute}  (stranica: {len(stranice)}, odlomaka: {sum(len(s) for s in stranice)}, tip: {ctx.get('tip') or '?'})")
        print("=" * 64)
        for k in kand:
            z = "✅" if k["confidence"] >= PRAG else "⚠️"
            print(f"  {z} {k['confidence']:.2f} {k['putanja_u_profilu']} = {json.dumps(k['vrijednost'], ensure_ascii=False)[:60]}"
                  f"   [str. {k['lokator']['stranica']}, odl. {k['lokator']['odlomak_idx']}, {k['pravilo_detekcije']}]")
        print(f"\n{len(kand)} kandidata, {sum(1 for k in kand if k['confidence'] >= PRAG)} s confidence ≥ {PRAG}" + (f" → {a.out}" if a.out else ""))

    skica = None
    if a.skica or a.usporedi:
        if not (a.fakultet and a.naziv):
            print("❌ --profil-skica/--usporedi traže --fakultet <slug> i --naziv \"<puni naziv>\"", file=sys.stderr)
            return 2
        skica, za_potvrdu = skica_profila(kand, ctx, a.fakultet, a.naziv, a.upute, a.stil)
        if a.skica:
            with open(a.skica, "w", encoding="utf-8") as fh:
                json.dump(skica, fh, ensure_ascii=False, indent=1)
            sidecar = re.sub(r"\.json$", "", a.skica) + ".kandidati_za_potvrdu.json"
            with open(sidecar, "w", encoding="utf-8") as fh:
                json.dump(za_potvrdu, fh, ensure_ascii=False, indent=1)
            print(f"\nskica: {a.skica} (prošla _schema.json; status nepotvrdeno) · za potvrdu: {len(za_potvrdu)} → {sidecar}")
    if a.usporedi:
        rucni = json.load(open(a.usporedi, encoding="utf-8"))
        rez = usporedi(skica, rucni)
        ispisi_usporedbu(rez, a.usporedi)
    return 0


if __name__ == "__main__":
    sys.exit(main())
