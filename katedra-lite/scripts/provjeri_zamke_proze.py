#!/usr/bin/env python3
"""
provjeri_zamke_proze.py — šest tihih zamki proze koje nijedan drugi alat ne gleda.

`check_ai_style.py` mjeri koheziju, ritam, početke rečenica i atribuciju. Ovdje su
zamke koje te mjere ne vide, a lektor ih vidi odmah (SKILL.md §3):

  a) ZAREZ + VELIKO SLOVO   rečenice spojene zarezom („…rezultati, Međutim…")
  b) INTERPUNKCIJSKI TIK    dvotočka ili spojna crtica kao ponovljena konstrukcija:
                            stopa na 1000 riječi + prag, te „isti kostur triput zaredom"
  c) KOSTUR ODLOMKA         iste prve tri riječi u ≥3 odlomka poglavlja, ili ista shema
                            („Prvo, … Drugo, … Treće, …") u ≥3 uzastopna odlomka
  d) JEDINICE               decimalni udio i postotak zajedno u odlomku („12 %" pa
                            „0,12"), raspon s jedinicom samo uz drugi član („od 3 do
                            5 %"), ista veličina u dvjema jedinicama („3–5 godina i
                            48 mjeseci")
  e) JEDNOKRATNA BROJKA     broj u rečenici s citatom koji se ne pojavljuje ni u jednoj
     UZ CITAT (ℹ️)          drugoj rečenici ni tablici — informativno, ne nalaz
  f) DOSEG UZ CITAT         „jedini", „svi", „prvi", „nikad", „uvijek", „nitko",
                            „najveći" u rečenici s citatom → doseg mora stati unutar
                            uzorka izvora (željezno pravilo 28)

    python3 <KATEDRA_SKILL>/scripts/provjeri_zamke_proze.py <rad.docx|rukopis.md|.katedra/poglavlja/>
        [--json out.json] [--profil resolved_profile.json] [--stil vancouver]
        [--usporedi prije.json] [--tiho]

IZLAZNI KOD: uvijek 0, osim 2 za grešku ulaza (datoteka ne postoji, ne da se
pročitati, nema proze). Stilske zamke NISU blokirajuće — ovo je alat za
usporedbu „prije/poslije" stilskog prolaza (SKILL.md §3: popravak jednog tika
lako proizvede drugi), ne gate. Blokirajući pragovi žive u `check_ai_style.py`.

Pragovi za (b) čitaju se iz `references/glas_fpzg.md` §7 ako postoji (dvotočka
≤ 3/1000 riječi, spojna crtica ≤ 2 u cijelom radu); inače vrijede te iste
vrijednosti kao zadane. En-crtica u rasponu („2019–2024") nije tik.

Citate prepoznaje isključivo `citation_dialects.py` (B10: bez vlastitih regexa);
dijalekt dolazi iz `--stil`, pa iz profila (`citiranje.stil`), a tek kad nema ni
jednog ni drugog pogađa se iz teksta uz upozorenje.

Ispis: po poglavlju, pa sažetak s brojkama. `--usporedi prije.json` ispisuje
razliku prema ranijem `--json` izlazu (prije → poslije) po svakoj provjeri.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import hr_text as H              # noqa: E402
import citation_dialects as C    # noqa: E402

# ------------------------------------------------------------------ pragovi
PRAGOVI = {
    "dvotocka_na_1000": 3.0,       # glas_fpzg.md §7: ≤ ~3 na 1.000 riječi
    "dvotocka_min_broj": 4,        # isti pod kao Q6d u check_ai_style: bez njega
                                   # jedna dvotočka na kratkom poglavlju „prelazi prag"
    "spojna_crtica_po_radu": 2,    # glas_fpzg.md §7: ≤ 1–2 u cijelom radu
    "kostur_zaredom": 3,           # tri uzastopne rečenice s istim znakom
    "kostur_odlomka_min": 3,       # iste prve tri riječi u ≥3 odlomka poglavlja
    "shema_zaredom": 3,            # ista shema u ≥3 uzastopna odlomka
}

GLAS_FPZG = os.path.join(HERE, "..", "references", "glas_fpzg.md")


def ucitaj_pragove_iz_glasa(putanja=GLAS_FPZG):
    """Dvotočka/1000 i spojna crtica po radu iz tablice u glas_fpzg.md §7.

    Tablica je izvor istine za FPZG glas; kad je nema ili se promijeni oblik,
    ostaju zadane vrijednosti iz PRAGOVI (iste brojke). Vraća izvor kao tekst.
    """
    try:
        with open(putanja, encoding="utf8") as f:
            tekst = f.read()
    except OSError:
        return "zadano"
    izvor = "zadano"
    m = re.search(r"^\|\s*dvoto[čc]ka[^|]*\|\s*[≤<=]+\s*~?\s*(\d+(?:[.,]\d+)?)\s*(?:na|/)\s*1[.,]?000",
                  tekst, re.I | re.M)
    if m:
        PRAGOVI["dvotocka_na_1000"] = float(m.group(1).replace(",", "."))
        izvor = "references/glas_fpzg.md"
    m = re.search(r"^\|\s*spojna crtica[^|]*\|\s*[≤<=]+\s*(?:\d+\s*[–—-]\s*)?(\d+)\s*u\s*\**cijelom",
                  tekst, re.I | re.M)
    if m:
        PRAGOVI["spojna_crtica_po_radu"] = int(m.group(1))
        izvor = "references/glas_fpzg.md"
    return izvor


# -------------------------------------------------------------- učitavanje

def poglavlja_iz(ulaz):
    """[(naslov, [odlomci])] + [ćelije tablica] iz .docx, .md ili mape poglavlja."""
    p = str(ulaz)
    if os.path.isdir(p):
        return _poglavlja_iz_mape(p)
    if not os.path.isfile(p):
        raise FileNotFoundError(p)
    if p.lower().endswith(".docx"):
        return _poglavlja_iz_docxa(p)
    with open(p, encoding="utf8") as f:
        tekst = f.read()
    pog, celije = _markdown_poglavlja(tekst)
    return pog, celije


def _markdown_poglavlja(tekst, naslov_zadani="(prije prvog poglavlja)"):
    """Isto pravilo kao check_ai_style._poglavlja_markdown, uz tablične retke."""
    pog = [(naslov_zadani, [])]
    celije = []
    u_literaturi = False
    for red in tekst.split("\n"):
        t = red.strip()
        if not t:
            continue
        if re.match(r"^#\s+\S", t):
            naslov = t.lstrip("#").strip()
            u_literaturi = bool(H.NASLOV_LIT.match(naslov))
            pog.append((naslov, []))
            continue
        if u_literaturi:
            continue
        if t.startswith("|"):
            if not re.match(r"^\|[\s:|-]+\|$", t):
                celije.extend(c.strip() for c in t.strip("|").split("|") if c.strip())
            continue
        if t.startswith(H.STRUKTURNI):
            continue
        if H.NATPIS.match(t) or H.IZVOR.match(t):
            continue
        pog[-1][1].append(t)
    return [(n, o) for n, o in pog if o], celije


def _poglavlja_iz_mape(mapa):
    try:
        import rukopis as R
        popis = R.poglavlja(mapa)
    except Exception:
        popis = []
        for ime in sorted(os.listdir(mapa)):
            if ime.lower().endswith(".md"):
                popis.append({"put": os.path.join(mapa, ime), "datoteka": ime})
    pog, celije = [], []
    for stavka in popis:
        with open(stavka["put"], encoding="utf8") as f:
            tekst = f.read()
        naslov_dat = stavka.get("naslov") or stavka["datoteka"]
        if H.NASLOV_LIT.match(str(naslov_dat)) or re.search(
                r"(?i)literatur|referenc|bibliograf", stavka["datoteka"]):
            continue
        p, c = _markdown_poglavlja(tekst, naslov_dat)
        # rukopis po datoteci = jedno poglavlje; podnaslovi „#" unutar datoteke
        # ostaju u istom poglavlju, jer pragovi vrijede po poglavlju rada
        odlomci = [o for _, od in p for o in od]
        if odlomci:
            pog.append((str(naslov_dat), odlomci))
        celije.extend(c)
    return pog, celije


def _poglavlja_iz_docxa(putanja):
    """Segmentacija po Heading 1 kao u check_ai_style.po_poglavljima, ali kroz
    hr_text.tekst_odlomka (vidi inline `w:sdt` citate) i s ćelijama tablica."""
    try:
        from docx import Document
    except ImportError:
        sys.exit("Treba python-docx:  pip install python-docx --break-system-packages")
    prevelik = H.prevelik_dio_docxa(putanja)
    if prevelik:
        raise ValueError(f"{prevelik[0]} raspakiran prelazi "
                         f"{H.MAX_XML_BAJTOVA // (1024 * 1024)} MB — oštećen ili napuhan zip")
    d = Document(putanja)
    pog = [("(prije prvog poglavlja)", [])]
    celije = []
    poceo, u_literaturi, u_sadrzaju = False, False, False
    for vrsta, blok in H._blokovi_u_redoslijedu(d):
        if vrsta == "tbl":
            if poceo and not u_literaturi:
                try:
                    celije.extend(H.celije_tablica([blok]))
                except Exception:
                    pass
            continue
        t = H.tekst_odlomka(blok).strip()
        if not t:
            continue
        stil, je_naslov, je_h1 = H._stil_i_razina(blok)
        if not poceo:
            if je_naslov or je_h1:
                u_sadrzaju = False
            if H.SADRZAJ_NASLOV.match(t):
                u_sadrzaju = True
            elif not je_naslov and len(t) >= 80 and t.endswith((".", "!", "?")):
                u_sadrzaju = False
            if H.je_pocetak_tijela(t, stil, je_naslov, u_sadrzaju):
                poceo = True
                pog.append((t, []))
            continue
        if H.NASLOV_LIT.match(t):
            u_literaturi = True
            continue
        if u_literaturi:
            continue
        if je_naslov:
            if je_h1:
                pog.append((t, []))
            continue
        if H.NATPIS.match(t) or H.IZVOR.match(t):
            continue
        if len(t) < 40 and not t.endswith((".", "!", "?")):
            continue
        pog[-1][1].append(t)
    pog = [(n, o) for n, o in pog if o]
    if not pog:
        # sigurnosna mreža kao u hr_text._iz_docx: bez prepoznatog početka tijela
        # uzmi sve, da se ne vrati „uredno" na dokumentu koji očito ima prozu
        odl, _ = H.ucitaj(putanja)
        if odl:
            pog = [("(cijeli dokument)", odl)]
            celije = H.celije_tablica(d.tables)
    return pog, celije


# ------------------------------------------------------------- pomoćnici

_ZAGRADA = re.compile(r"\([^()]{0,200}\)")
_GODINA = re.compile(r"(?<!\d)(?:1[89]|20)\d{2}(?!\d)")


def bez_zagrada(t):
    return _ZAGRADA.sub(" ", t)


def kratki(t, n=100):
    t = re.sub(r"\s+", " ", t.strip())
    return t if len(t) <= n else t[:n - 1] + "…"


def _dijalekt_iz_teksta(tekst):
    """Rezerva kad nema ni --stil ni profila: koji dijalekt tekst uopće ima."""
    ay = len(C.parse_citations(tekst, "autor-godina"))
    va = len(C.parse_citations(tekst, "vancouver"))
    ie = len(C.parse_citations(tekst, "ieee"))
    if ay >= max(va, ie):
        return "autor-godina"
    return "vancouver" if va >= ie else "ieee"


# Katedrin placeholder „: [PROVJERI STR.]" i lokatori koji nisu stranica („: odj.
# 4.1–4.2", „: čl. 12", „: st. 3", „: t. 4") NISU citatni dijalekt nego oznaka
# nedovršenog lokatora iz pisanje.md §2, a `citation_dialects.LOKATOR` zna samo
# str./s./p. Skidaju se PRIJE parsera da rečenica s takvim citatom ne ispadne
# „bez citata" — pravi dom te dopune je LOKATOR u citation_dialects.py (B10).
_NESTRANICNI_LOKATOR = re.compile(
    r"(\b(?:1[89]|20)\d{2}\.?[a-z]?)\s*:\s*(?:\[PROVJERI[^\]]*\]|(?:odj|čl|st|t|toč|para|§)\.?\s*[^()]*?)(?=\s*[;)])")


def citati_u(recenica, stil):
    return C.parse_citations(_NESTRANICNI_LOKATOR.sub(r"\1", recenica), stil)


def bez_citata(recenica, refs):
    """Rečenica bez citatnih spanova (raw) i bez lokatora — za brojanje brojki."""
    t = C.bez_lokatora(_NESTRANICNI_LOKATOR.sub(r"\1", recenica))
    for r in refs:
        if r.raw:
            t = t.replace(r.raw, " ")
    return t


# ----------------------------------------------------------- (a) zarez+veliko

# Riječi koje iza zareza gotovo nikad nisu ime: veznici i prilozi kojima
# započinje nova rečenica. Uvijek nalaz.
SPOJNICE = {
    "međutim", "stoga", "ipak", "naime", "također", "nadalje", "dakle", "osim",
    "zbog", "primjerice", "isto", "nasuprot", "prema", "time", "ovo", "to", "ono",
    "štoviše", "doduše", "ujedno", "pritom", "zato", "unatoč", "usprkos", "kako",
    "iako", "premda", "budući", "tako", "tada", "potom", "zatim", "konačno",
    "naposljetku", "uz", "s", "sa", "u", "na", "ovaj", "ova", "ovi", "ove", "taj",
    "ta", "ti", "te", "riječ", "cilj", "rezultati", "rezultat", "ispitanici",
}
_ZAREZ_VELIKO = re.compile(r",\s+([A-ZČĆŽŠĐ][a-zčćžšđ]+)\b")


def _profil_rijeci(recenice_sve):
    """(male, velike_sred) — koje riječi tekst piše malim slovom, a koje velikim u
    sredini rečenice na mjestu koje NIJE iza zareza (imena, ustanove)."""
    male, velike_sred = set(), set()
    for r in recenice_sve:
        tok = H.rijeci(bez_zagrada(r))
        for i, w in enumerate(tok):
            c = w.strip("„“\"'()[]{}.,;:!?»«")
            if not c:
                continue
            if c[0].islower():
                male.add(c.lower())
            elif i > 0 and c[0].isupper() and not tok[i - 1].endswith(",") \
                    and not tok[i - 1].endswith((".", "!", "?", ":")):
                velike_sred.add(c.lower())
    return male, velike_sred


def provjera_a(poglavlja, sve_recenice):
    male, velike_sred = _profil_rijeci(sve_recenice)
    nalazi = []
    for naslov, odlomci in poglavlja:
        for o in odlomci:
            for r in H.recenice(o):
                cist = bez_zagrada(r)
                for m in _ZAREZ_VELIKO.finditer(cist):
                    w = m.group(1)
                    lw = w.lower()
                    prije = cist[max(0, m.start() - 2):m.start()]
                    if lw in SPOJNICE:
                        nalazi.append((naslov, w, kratki(r)))
                        continue
                    # ime/kratica: vidi se velikim slovom i drugdje u sredini
                    # rečenice, ili se nikad ne piše malim slovom
                    if lw in velike_sred or lw not in male:
                        continue
                    # nabrajanje imena „Ivić, Marić i Perić" — ako je ispred zareza
                    # riječ velikim slovom, to je popis, ne spojene rečenice
                    lijevo = cist[:m.start()].split()
                    if lijevo and lijevo[-1][:1].isupper():
                        continue
                    # „…hospicij, Hospicij „Marija Krucifiksa Kozulić\"" — iza
                    # kandidata ide još jedna velika riječ ili navodnik: naziv
                    desno = cist[m.end():].lstrip()
                    if desno[:1].isupper() or desno[:1] in "„“\"»":
                        continue
                    if re.search(r"\d$", prije):
                        continue
                    nalazi.append((naslov, w, kratki(r)))
    return nalazi


# -------------------------------------------------------- (b) tik interpunkcije

_DVOTOCKA_PROZE = re.compile(r"(?<!\d):(?!\d)(?!/)")      # ne 12:30, ne 1:2, ne http://
_SPOJNA = re.compile(r"\s[—–]\s|—")                        # „ – " i „ — " su umetak; „–" bez razmaka je raspon


def _dvotocke_u(recenica, stil):
    recenica = _NESTRANICNI_LOKATOR.sub(r"\1", recenica)
    t = C.bez_lokatora(recenica)
    for r in citati_u(recenica, stil):
        if r.raw:
            t = t.replace(r.raw, " ")
    return len(_DVOTOCKA_PROZE.findall(t))


_OZNAKA_CRTICA = re.compile(r"^\s*\S{1,12}(?:\s\d{1,3})?\s[–—]\s")   # „H1 – …", „Cjelina 1 – …", „n – broj"


_RASPON_S_RAZMACIMA = re.compile(r"\d\s[–—]\s\d")                   # „0 – 12 bodova": raspon, ne umetak


def _spojne_u(recenica):
    """Spojne crtice kao umetak: „—" uvijek, „ – " (en-crtica s razmacima) također,
    osim kad je oznaka na početku rečenice ili stavke iza „;" („H1 – Većina…",
    „n – broj…; % – postotak") ili raspon brojeva s razmacima („0 – 12 bodova")."""
    t = _RASPON_S_RAZMACIMA.sub("0-0", recenica)
    dijelovi = [_OZNAKA_CRTICA.sub(" ", d, count=1) for d in t.split(";")]
    return sum(len(_SPOJNA.findall(d)) for d in dijelovi)


def provjera_b(poglavlja, stil):
    po_pog, kosturi = [], []
    uk_r, uk_d, uk_c = 0, 0, 0
    for naslov, odlomci in poglavlja:
        rijeci = sum(len(H.rijeci(o)) for o in odlomci)
        d, c = 0, 0
        niz_d, niz_c, prva_d, prva_c = 0, 0, None, None
        for o in odlomci:
            for r in H.recenice(o):
                nd, nc = _dvotocke_u(r, stil), _spojne_u(r)
                d += nd
                c += nc
                if nd:
                    niz_d += 1
                    prva_d = prva_d or r
                    if niz_d == PRAGOVI["kostur_zaredom"]:
                        kosturi.append((naslov, "dvotočka", kratki(prva_d)))
                else:
                    niz_d, prva_d = 0, None
                if nc:
                    niz_c += 1
                    prva_c = prva_c or r
                    if niz_c == PRAGOVI["kostur_zaredom"]:
                        kosturi.append((naslov, "spojna crtica", kratki(prva_c)))
                else:
                    niz_c, prva_c = 0, None
        stopa = d / rijeci * 1000 if rijeci else 0.0
        po_pog.append({"poglavlje": naslov, "rijeci": rijeci, "dvotocke": d,
                       "dvotocka_na_1000": round(stopa, 1), "spojne_crtice": c,
                       "prag_dvotocka": (stopa > PRAGOVI["dvotocka_na_1000"]
                                         and d >= PRAGOVI["dvotocka_min_broj"])})
        uk_r += rijeci
        uk_d += d
        uk_c += c
    return {
        "po_poglavljima": po_pog,
        "rijeci": uk_r, "dvotocke": uk_d,
        "dvotocka_na_1000": round(uk_d / uk_r * 1000, 1) if uk_r else 0.0,
        "spojne_crtice": uk_c,
        "prag_dvotocka": (uk_r and uk_d / uk_r * 1000 > PRAGOVI["dvotocka_na_1000"]
                          and uk_d >= PRAGOVI["dvotocka_min_broj"]),
        "prag_crtica": uk_c > PRAGOVI["spojna_crtica_po_radu"],
        "kosturi": kosturi,
    }


# --------------------------------------------------------- (c) kostur odlomka

ENUMERATORI = re.compile(
    r"^(?:Prv[oiae]|Drug[oiae]|Treć[eiae]|Četvrt[oiae]|Pet[oiae]|Šest[oiae]|"
    r"Nadalje|Zatim|Potom|Konačno|Naposljetku|Nakon toga|Osim toga|Također|"
    r"Isto tako|Uz to|S jedne strane|S druge strane|Prvi|Drugi|Treći)\b[,:]?\s", re.I)


def _prve(odlomak, n):
    tok = [re.sub(r"^[„“\"'(]+|[„“\"'),.:;!?]+$", "", w) for w in H.rijeci(odlomak)[:n]]
    return " ".join(w.lower() for w in tok if w)


def _shema(odlomak):
    if ENUMERATORI.match(odlomak):
        return "nabrajanje"
    return "2:" + _prve(odlomak, 2)


def provjera_c(poglavlja):
    nalazi = []
    for naslov, odlomci in poglavlja:
        if len(odlomci) < PRAGOVI["kostur_odlomka_min"]:
            continue
        prve3 = Counter(_prve(o, 3) for o in odlomci if len(H.rijeci(o)) >= 3)
        for k, n in prve3.items():
            if n >= PRAGOVI["kostur_odlomka_min"]:
                nalazi.append((naslov, "prve tri riječi", f"„{k}…\" u {n} odlomka"))
        # ista shema u uzastopnim odlomcima
        niz, prosla, prvi = 0, None, None
        for i, o in enumerate(odlomci):
            s = _shema(o)
            if s == prosla:
                niz += 1
            else:
                niz, prosla, prvi = 1, s, i
            if niz == PRAGOVI["shema_zaredom"]:
                opis = ("„Prvo, … Drugo, … Treće, …\"" if s == "nabrajanje"
                        else f"početak „{s[2:]}…\"")
                nalazi.append((naslov, "ista shema zaredom",
                               f"{opis} u {niz} uzastopna odlomka (od odlomka {prvi + 1}); "
                               f"prvi: {kratki(odlomci[prvi], 70)}"))
    return nalazi


# -------------------------------------------------------------- (d) jedinice

_POSTOTAK = re.compile(r"\d+(?:[.,]\d+)?\s*%")
_UDIO = re.compile(r"(?<![\d,.])0[.,]\d+(?![\d%])")
# decimala koja je statistika, ne udio: p = 0,03; r = 0,41; α = 0,87; SD = 0,8; ± 0,8; CI
_STATISTIKA = re.compile(r"(?:\b(?:p|r|rs|rho|R2|R²|β|b|α|alfa|SD|SE|d|η2|η²|κ|OR|RR|HR|CI)\s*[=<>≤≥]\s*"
                         r"|±\s*|\bCI\b[^.;]{0,20}|Cronbach[^.;]{0,20}|interval[^.;]{0,30}"
                         r"|\bp\b[^.;]{0,40}|(?:korelacij|koeficijent|pouzdanost|alfa|kapa|kappa|"
                         r"indeks|omjer|vrijednost)[^.;]{0,40})$", re.I)
# iza udjela ne stoji jedinica: „0,5 boda", „0,8 službi na 100 000" su mjere, ne udio
_UDIO_NASTAVAK = re.compile(r"^\s*(?:[,.;:)\]!?]|$|(?:i|te|odnosno|dok|a|što|koj[aie]|ili)\b)")
_RASPON_JEDNA_JEDINICA = re.compile(
    r"\b(?:od|između)\s+\d+(?:[.,]\d+)?\s+(?:do|i)\s+\d+(?:[.,]\d+)?\s*%")
_VRIJEME = {
    "godina": re.compile(r"\d+(?:[.,]\d+)?(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?\s+god(?:in[aeuo]|\.)", re.I),
    "mjeseci": re.compile(r"\d+(?:[.,]\d+)?(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?\s+mjesec", re.I),
    "tjedana": re.compile(r"\d+(?:[.,]\d+)?(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?\s+tjed", re.I),
    "dana": re.compile(r"\d+(?:[.,]\d+)?(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?\s+dan[ai]?\b", re.I),
    "sati": re.compile(r"\d+(?:[.,]\d+)?(?:\s*[–—-]\s*\d+(?:[.,]\d+)?)?\s+sat[ia]?\b", re.I),
}
_VALUTA = {
    "kn": re.compile(r"\d\s*(?:kn|kuna|HRK)\b"),
    "eur": re.compile(r"\d\s*(?:€|eur[ao]?|EUR)\b", re.I),
}


def _udjeli_bez_statistike(t):
    out = []
    for m in _UDIO.finditer(t):
        if _STATISTIKA.search(t[max(0, m.start() - 60):m.start()]):
            continue
        if not _UDIO_NASTAVAK.match(t[m.end():]):
            continue
        out.append(m.group(0))
    return out


def provjera_d(poglavlja):
    nalazi = []
    for naslov, odlomci in poglavlja:
        for o in odlomci:
            post = _POSTOTAK.findall(o)
            udio = _udjeli_bez_statistike(o)
            if post and udio:
                nalazi.append(("!", naslov, "udio i postotak zajedno",
                               f"{', '.join(post[:3])} uz {', '.join(udio[:3])} — {kratki(o, 80)}"))
            for r in H.recenice(o):
                m = _RASPON_JEDNA_JEDINICA.search(r)
                if m:
                    nalazi.append(("i", naslov, "jedinica samo uz drugi član raspona",
                                   f"„{m.group(0)}\" — {kratki(r, 80)}"))
                vrijeme = [k for k, rx in _VRIJEME.items() if rx.search(r)]
                if len(vrijeme) >= 2:
                    nalazi.append(("!", naslov, "ista veličina u dvjema jedinicama",
                                   f"{' i '.join(vrijeme)} — {kratki(r, 90)}"))
                valute = [k for k, rx in _VALUTA.items() if rx.search(r)]
                if len(valute) >= 2:
                    nalazi.append(("!", naslov, "iznos u dvjema valutama", kratki(r, 90)))
    return nalazi


# ------------------------------------------------ (e) jednokratna brojka uz citat

_BROJ = re.compile(r"(?<![\d,.A-Za-z])(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+(?:[.,]\d+)?)(?![\d,.]*\d|[A-Za-z])")


def _brojke(t):
    """Brojke u tekstu, bez godina, rednih i jednoznamenkastih cijelih brojeva."""
    out = []
    for m in _BROJ.finditer(t):
        s = m.group(0)
        if _GODINA.fullmatch(s):
            continue
        iza = t[m.end():m.end() + 1]
        if iza == "." and not re.match(r"\.\s*$", t[m.end():]):
            continue            # redni broj: „5. stavak", „2. godine"
        if re.fullmatch(r"\d", s):
            continue
        s = re.sub(r"[ \u00a0\u202f]", "", s)
        s = re.sub(r"^(\d{1,3})\.(\d{3})$", r"\1\2", s)     # „30.000" = tisućice, ne decimala
        out.append(s.replace(".", ","))
    return out


def provjera_e(poglavlja, celije, stil):
    """ℹ️ popis brojki koje se u rečenici s citatom pojavljuju, a nigdje drugdje."""
    recenice = []      # (naslov, rečenica, refs)
    svi = Counter()
    for naslov, odlomci in poglavlja:
        for o in odlomci:
            for r in H.recenice(o):
                refs = citati_u(r, stil)
                b = _brojke(bez_citata(r, refs) if refs else r)
                for x in set(b):
                    svi[x] += 1
                if refs and b:
                    recenice.append((naslov, r, sorted(set(b))))
    for c in celije:
        for x in set(_brojke(c)):
            svi[x] += 1
    out = []
    for naslov, r, b in recenice:
        jednokratne = [x for x in b if svi[x] == 1]
        if jednokratne:
            out.append((naslov, jednokratne, kratki(r)))
    return out


# ------------------------------------------------------- (f) doseg uz citat

KVANTIFIKATORI = re.compile(
    r"\b(?:jedin[iaoe]|jedin[ao]m|jedinih|jedinim|"
    r"sv[ie]|sva|svih|svim[a]?|svaki|svak[aou]|svakom|"
    r"prv[iao]|"
    r"nikad[a]?|uvijek|nitko|nikog[a]?|nikome|ni[jt]ko|"
    r"najveć[iaeu]|najveće[gm]|najviš[ei]|najbolj[iae]|nijedan|nijedn[aoue])\b", re.I)
# „prvi put", „prvi korak", „u prvom redu", „prvi dio" — redni broj, ne doseg
_PRVI_NE_DOSEG = re.compile(r"(?i)\bprv[iao]\s+(?:put[a]?|korak|red[u]?|dio|dijel|"
                            r"faz[aie]|skupin[aie]|hipotez[aie]|poglavlj|pitanj|"
                            r"kategorij|čimbenik|godin|stupanj|razin|mjesec|dan|"
                            r"objašnjenj|razlog|pretpostavk|tablic|slik|graf|odlom|"
                            r"cjelin|domen|dimenzij|mjer|polovic|polovin|krug|"
                            r"istraživačk|generacij|val|ciklus)"
                            r"|^\s*(?:Prvo|Drugo|Treće)\s*[,:]")


def provjera_f(poglavlja, stil):
    out = []
    for naslov, odlomci in poglavlja:
        for o in odlomci:
            for r in H.recenice(o):
                refs = citati_u(r, stil)
                if not refs:
                    continue
                t = bez_citata(r, refs)
                t = _PRVI_NE_DOSEG.sub(" ", t)
                kv = sorted({m.group(0).lower() for m in KVANTIFIKATORI.finditer(t)})
                if kv:
                    out.append((naslov, kv, kratki(r)))
    return out


# --------------------------------------------------------------- pokretanje

def analiza(poglavlja, celije, stil):
    sve_rec = [r for _, od in poglavlja for o in od for r in H.recenice(o)]
    a = provjera_a(poglavlja, sve_rec)
    b = provjera_b(poglavlja, stil)
    c = provjera_c(poglavlja)
    d = provjera_d(poglavlja)
    e = provjera_e(poglavlja, celije, stil)
    f = provjera_f(poglavlja, stil)
    rijeci = sum(len(H.rijeci(o)) for _, od in poglavlja for o in od)
    return {
        "rijeci": rijeci,
        "recenica": len(sve_rec),
        "odlomaka": sum(len(od) for _, od in poglavlja),
        "poglavlja": [n for n, _ in poglavlja],
        "stil": stil,
        "pragovi": dict(PRAGOVI),
        "a_zarez_veliko": [{"poglavlje": p, "rijec": w, "recenica": r} for p, w, r in a],
        "b_tik": b,
        "c_kostur": [{"poglavlje": p, "vrsta": v, "opis": o} for p, v, o in c],
        "d_jedinice": [{"razina": z, "poglavlje": p, "vrsta": v, "opis": o} for z, p, v, o in d],
        "e_jednokratne": [{"poglavlje": p, "brojke": b_, "recenica": r} for p, b_, r in e],
        "f_doseg": [{"poglavlje": p, "kvantifikatori": k, "recenica": r} for p, k, r in f],
        "sazetak": {
            "a_zarez_veliko": len(a),
            "b_dvotocka_na_1000": b["dvotocka_na_1000"],
            "b_spojne_crtice": b["spojne_crtice"],
            "b_kosturi_zaredom": len(b["kosturi"]),
            "c_kostur_odlomka": len(c),
            "d_jedinice": sum(1 for z, *_ in d if z == "!"),
            "d_jedinice_info": sum(1 for z, *_ in d if z == "i"),
            "e_jednokratne": len(e),
            "f_doseg": len(f),
        },
    }


def _grupiraj(stavke, kljuc="poglavlje"):
    g = defaultdict(list)
    for s in stavke:
        g[s[kljuc]].append(s)
    return g


def ispis(a, tiho=False):
    P = PRAGOVI
    S = a["sazetak"]
    ga = _grupiraj(a["a_zarez_veliko"])
    gc = _grupiraj(a["c_kostur"])
    gd = _grupiraj(a["d_jedinice"])
    ge = _grupiraj(a["e_jednokratne"])
    gf = _grupiraj(a["f_doseg"])
    gk = defaultdict(list)
    for p, v, r in a["b_tik"]["kosturi"]:
        gk[p].append((v, r))
    b_pog = {x["poglavlje"]: x for x in a["b_tik"]["po_poglavljima"]}

    print("=" * 72)
    print(f"ZAMKE PROZE — {a['rijeci']} riječi | {a['odlomaka']} odlomaka | "
          f"{a['recenica']} rečenica | dijalekt {a['stil']}")
    print("=" * 72)
    for naslov in a["poglavlja"]:
        bp = b_pog.get(naslov, {})
        n_nal = (len(ga[naslov]) + len(gc[naslov]) + len(gk[naslov]) + len(gf[naslov])
                 + sum(1 for x in gd[naslov] if x["razina"] == "!") + (1 if bp.get("prag_dvotocka") else 0))
        print(f"\n## {naslov}  ({bp.get('rijeci', 0)} riječi, dvotočka "
              f"{bp.get('dvotocka_na_1000', 0)}/1000, spojna crtica {bp.get('spojne_crtice', 0)})")
        if not n_nal and not ge[naslov] and not any(x["razina"] == "i" for x in gd[naslov]):
            print("  ✅ bez nalaza")
            continue
        for x in ga[naslov]:
            print(f"  ⚠️  (a) zarez + veliko slovo „, {x['rijec']}\": {x['recenica']}")
        if bp.get("prag_dvotocka"):
            print(f"  ⚠️  (b) dvotočka {bp['dvotocka_na_1000']}/1000 riječi "
                  f"(prag {P['dvotocka_na_1000']}) — {bp['dvotocke']}× u poglavlju")
        for v, r in gk[naslov]:
            print(f"  ⚠️  (b) isti kostur triput zaredom ({v}): {r}")
        for x in gc[naslov]:
            print(f"  ⚠️  (c) {x['vrsta']}: {x['opis']}")
        for x in gd[naslov]:
            print(f"  {'⚠️ ' if x['razina'] == '!' else 'ℹ️ '} (d) {x['vrsta']}: {x['opis']}")
        for x in gf[naslov]:
            print(f"  ⚠️  (f) doseg uz citat [{', '.join(x['kvantifikatori'])}]: {x['recenica']}")
            print("      → doseg mora stati unutar uzorka izvora (pravilo 28)")
        if not tiho:
            for x in ge[naslov]:
                print(f"  ℹ️  (e) jednokratna brojka uz citat {x['brojke']}: {x['recenica']}")
        elif ge[naslov]:
            print(f"  ℹ️  (e) jednokratnih brojki uz citat: {len(ge[naslov])} rečenica")

    b = a["b_tik"]
    print("\n" + "-" * 72)
    print("SAŽETAK")
    print("-" * 72)

    def red(ok, tekst):
        print(f"  {'✅' if ok else '⚠️ '} {tekst}")

    red(S["a_zarez_veliko"] == 0, f"(a) rečenice spojene zarezom uz veliko slovo: {S['a_zarez_veliko']}")
    red(not b["prag_dvotocka"], f"(b) dvotočka {b['dvotocka_na_1000']}/1000 riječi "
                                f"({b['dvotocke']}×; prag {P['dvotocka_na_1000']}/1000)")
    red(not b["prag_crtica"], f"(b) spojna crtica {b['spojne_crtice']}× u radu "
                              f"(prag ≤ {P['spojna_crtica_po_radu']})")
    red(S["b_kosturi_zaredom"] == 0, f"(b) isti kostur triput zaredom: {S['b_kosturi_zaredom']}")
    red(S["c_kostur_odlomka"] == 0, f"(c) ponovljen kostur odlomka: {S['c_kostur_odlomka']}")
    red(S["d_jedinice"] == 0, f"(d) stopa/raspon u različitim jedinicama: {S['d_jedinice']}"
                              + (f" (+{S['d_jedinice_info']} ℹ️)" if S["d_jedinice_info"] else ""))
    print(f"  ℹ️  (e) jednokratne brojke uz citat: {S['e_jednokratne']} rečenica (informativno)")
    red(S["f_doseg"] == 0, f"(f) kvantifikator dosega uz citat: {S['f_doseg']}")
    print("\n  Zamke proze nisu blokirajuće (izlazni kod 0). Ponovi nakon stilskog prolaza\n"
          "  uz --usporedi prije.json i provjeri da popravak jednog tika nije rodio drugi.")


def usporedi(prije, sada):
    S0, S1 = prije.get("sazetak", {}), sada["sazetak"]
    print("\n" + "-" * 72)
    print("PRIJE → POSLIJE")
    print("-" * 72)
    imena = {
        "a_zarez_veliko": "(a) zarez + veliko slovo",
        "b_dvotocka_na_1000": "(b) dvotočka /1000",
        "b_spojne_crtice": "(b) spojne crtice",
        "b_kosturi_zaredom": "(b) kostur triput zaredom",
        "c_kostur_odlomka": "(c) kostur odlomka",
        "d_jedinice": "(d) jedinice",
        "e_jednokratne": "(e) jednokratne brojke ℹ️",
        "f_doseg": "(f) doseg uz citat",
    }
    pogorsano = 0
    for k, ime in imena.items():
        v0, v1 = S0.get(k), S1.get(k)
        if v0 is None:
            znak = "  "
        elif v1 < v0:
            znak = "▼ "
        elif v1 > v0:
            znak = "▲ "
            if k != "e_jednokratne":
                pogorsano += 1
        else:
            znak = "= "
        print(f"  {znak}{ime}: {v0} → {v1}")
    if pogorsano:
        print(f"\n  ⚠️  {pogorsano} provjera lošija nego prije — popravak jednog tika rodio je drugi.")
    else:
        print("\n  ✅ nijedna provjera nije lošija nego prije.")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("rad", help="rad.docx, rukopis.md ili mapa .katedra/poglavlja/")
    ap.add_argument("--json", metavar="OUT", help="upiši puni rezultat u JSON (za --usporedi)")
    ap.add_argument("--profil", help="resolved_profile.json (dijalekt citiranja)")
    ap.add_argument("--stil", help="citatni stil (" + ", ".join(C.CITATION_STYLES) + ")")
    ap.add_argument("--usporedi", metavar="PRIJE", help="raniji --json izlaz za usporedbu prije/poslije")
    ap.add_argument("--tiho", action="store_true", help="bez pojedinačnih ℹ️ (e) redaka")
    args = ap.parse_args(argv)

    izvor_pragova = ucitaj_pragove_iz_glasa()

    try:
        poglavlja, celije = poglavlja_iz(args.rad)
    except FileNotFoundError:
        print(f"❌ ne postoji: {args.rad}", file=sys.stderr)
        return 2
    except Exception as e:      # oštećen docx, napuhan zip, nečitljiv rukopis
        print(f"❌ {args.rad}: {e}", file=sys.stderr)
        return 2
    if not poglavlja:
        print(f"❌ {args.rad}: nije pronađen prozni tekst (za .docx provjeri stilove Heading, "
              f"za mapu imena „01-uvod.md\")", file=sys.stderr)
        return 2

    try:
        stil, dijalekt, izvor = C.resolve_style(args.stil, args.profil)
    except C.CitationDialectError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 2
    if izvor == "default":
        tekst = " ".join(o for _, od in poglavlja for o in od)
        stil = _dijalekt_iz_teksta(tekst)
        if not args.tiho:
            print(f"⚠️  dijalekt citiranja pogođen iz teksta ({stil}) — zadaj --profil "
                  f"resolved_profile.json ili --stil", file=sys.stderr)

    a = analiza(poglavlja, celije, stil)
    a["izvor_pragova"] = izvor_pragova
    a["ulaz"] = str(args.rad)

    ispis(a, tiho=args.tiho)

    if args.usporedi:
        try:
            with open(args.usporedi, encoding="utf8") as f:
                prije = json.load(f)
        except (OSError, ValueError) as e:
            print(f"❌ --usporedi {args.usporedi}: {e}", file=sys.stderr)
            return 2
        usporedi(prije, a)

    if args.json:
        with open(args.json, "w", encoding="utf8") as f:
            json.dump(a, f, ensure_ascii=False, indent=1)
        print(f"\n  JSON: {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
