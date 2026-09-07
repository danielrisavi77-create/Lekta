#!/usr/bin/env python3
"""Provjera postoji li izvor uopće — Crossref (DOI i naslov), Hrčak, obični HTTP.

Izmišljen izvor je najskuplja greška u radu: prolazi sve formalne provjere,
izgleda kao literatura, a ne postoji. Ova skripta ne ocjenjuje kvalitetu izvora
nego samo odgovara na pitanje „može li se ovo naći".

Stabilni semantički ishodi su `verified`, `unverified`, `conflict` i `invalid`.
Vizualni simboli ostaju radi kompatibilnosti: ✅ verified, ⚠️ unverified, 🟠 conflict,
❌ invalid; ⏸ označava da je provider nedostupan i mapira se na `unverified` s
`availability: unavailable`.

`unverified` nije optužba. Hrvatske knjige, zbornici i fakultetska izdanja često nisu
u Crossrefu. Takav izvor se provjerava ručno, ne briše se.

Uporaba:
  python3 <KATEDRA_SKILL>/scripts/verify_sources.py ./literatura.md
  python3 <KATEDRA_SKILL>/scripts/verify_sources.py ./rad.docx --popis-od "POPIS IZVORA"
  python3 <KATEDRA_SKILL>/scripts/verify_sources.py ./rad.docx --pokrivenost
  python3 <KATEDRA_SKILL>/scripts/verify_sources.py ./literatura.md --json ./.katedra/izvori.json --offline
  python3 <KATEDRA_SKILL>/scripts/verify_sources.py ./rad.docx --profil <...>/references/fakulteti/efzg.json --tip zavrsni

Izlazni kodovi:
  0  nijedan izvor nije opovrgnut
  1  barem jedan ❌ (izvor ne postoji), citat bez izvora u --pokrivenost, ili
     manje izvora nego što profil fakulteta traži (--profil ... --tip ...)
  2  popis izvora se ne može pročitati (kriva datoteka, prazan popis, loš profil)
"""
import argparse
import difflib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import citation_dialects as C  # noqa: E402
import hr_text as H  # noqa: E402
from evidence_model import stable_source_id  # noqa: E402
from source_semantics import (  # noqa: E402
    CONFLICT,
    INVALID,
    QUALITY_TAXONOMY,
    UNVERIFIED,
    VERIFIED,
    classify_quality,
    infer_source_type,
    is_blocking_verification,
    is_discovery_service_entity,
    normalize_discovery_channel,
    verification_record,
)

POTVRDEN, NEPOTVRDEN, NEPOSTOJI, NEDOSTUPNO, SUKOB = "✅", "⚠️", "❌", "⏸", "🟠"

CROSSREF = "https://api.crossref.org"
UA = ("katedra-verify_sources/1.0 (akademska provjera izvora; "
      "https://github.com/katedra)")
TIMEOUT = 10
MIN_RAZMAK = 1 / 3.0        # max 3 zahtjeva u sekundi
PRAG_SLICNOSTI = 0.75

_zadnji_zahtjev = [0.0]

DOI_RE = re.compile(r"\b(10\.\d{4,9}/[-._;()/:A-Za-z0-9]+)")
URL_RE = re.compile(r"https?://[^\s<>\"')\]]+")
GODINA_RE = re.compile(r"\b(1[89]\d{2}|20\d{2})\b")
PREFIKS_RE = re.compile(r"^\s*(?:[-*•]\s*|\[\d+\]\s*|\(?\d{1,3}[.)]\s+)")
IZDAVAC_RE = re.compile(
    r"(?i)(:\s*[A-ZČĆŽŠĐ]|\bizd\.|\bnakladnik|\bpress\b|\bpublish|\buniversity\b|"
    r"\bsveučiliš|\bfakultet|\bškolska knjiga|\bnarodne novine|\broutledge|"
    r"\bspringer|\belsevier|\bsage\b|\bwiley\b|\bOECD\b|\bUNWTO\b|\bEurostat\b|"
    r"\d+\s*\(\d+\)|\bvol\.|\bno\.|\bstr\.\s*\d+\s*[–—-]\s*\d+)")


# ----------------------------------------------------------- čitanje popisa

class GreskaUlaza(Exception):
    """Ulazna datoteka se ne može pročitati — izlazni kod 2, bez trapa."""


def _iz_docxa(put, od):
    try:
        from docx import Document
    except ImportError:
        raise GreskaUlaza("treba python-docx:  pip install python-docx --break-system-packages")
    try:
        d = Document(put)
    except Exception as e:
        raise GreskaUlaza(
            f".docx se ne može otvoriti ({put}): {e}\n"
            f"   Što napraviti: otvori ga u Wordu i spremi ponovno, ili provjeri "
            f"je li datoteka uopće .docx (a ne preimenovani .doc; prazna datoteka "
            f"od 0 bajta isto daje ovu poruku).")
    redci, stilovi = [], []
    for p in d.paragraphs:
        t = (p.text or "").strip()
        if not t:
            continue
        try:
            s = p.style.name or ""
        except Exception:
            s = ""
        redci.append(t)
        stilovi.append(s)

    poceo = None
    for i, t in enumerate(redci):
        if od and od.strip().lower() in t.lower() and len(t) < 120:
            poceo = i + 1
            break
        if H.NASLOV_LIT.match(t):
            poceo = i + 1
            break
    if poceo is None:
        return None, redci
    kraj = len(redci)
    for i in range(poceo, len(redci)):
        if stilovi[i].startswith("Heading") and not H.NASLOV_LIT.match(redci[i]):
            kraj = i
            break
    return redci[poceo:kraj], redci


def _iz_teksta(put, od):
    try:
        tekst = open(put, encoding="utf-8").read()
    except (OSError, UnicodeDecodeError) as e:
        raise GreskaUlaza(f"datoteka se ne može pročitati ({put}): {e}\n"
                          f"   Što napraviti: popis izvora mora biti .md/.txt u UTF-8, "
                          f"ili .docx.")
    redci = [r.strip() for r in tekst.split("\n")]
    poceo = None
    for i, t in enumerate(redci):
        if not t:
            continue
        cist = t.lstrip("#").strip()
        if od and od.strip().lower() in cist.lower() and len(cist) < 120:
            poceo = i + 1
            break
        if H.NASLOV_LIT.match(cist):
            poceo = i + 1
            break
    tijelo = redci[poceo:] if poceo is not None else redci
    return [r for r in tijelo if r and not r.startswith(("#", ">", "|", "---"))], \
           [r for r in redci if r]


def je_izvor(red):
    """Je li redak uopće bibliografska jedinica, a ne naslov ili broj stranice."""
    t = PREFIKS_RE.sub("", red).strip()
    if len(t) < 15:
        return False
    if DOI_RE.search(t) or URL_RE.search(t):
        return True
    return bool(GODINA_RE.search(t)) and ("," in t or "." in t)


def procitaj_popis(put, od):
    if put.lower().endswith(".docx"):
        popis, svi = _iz_docxa(put, od)
    else:
        popis, svi = _iz_teksta(put, od)
    upozorenje = None
    if popis is None:
        upozorenje = ("naslov popisa izvora nije pronađen — uzimam sve retke koji "
                      "izgledaju kao bibliografska jedinica; suzi s --popis-od \"POPIS IZVORA\"")
        popis = svi
    return [PREFIKS_RE.sub("", r).strip() for r in popis if je_izvor(r)], upozorenje


# ---------------------------------------------------------- razlaganje unosa

# v1.1-advisory patch #3 (autoriziran u sesiji — v. docs/v1_1_dodaci.md
# #core-patch #self-review): sekvencijalni tokenizator "Prezime[ Prezime2...],
# Inicijali" skupina, umjesto jednog unazad-neanchoriranog `findall()`-a.
#
# Zašto sekvencijalno, a ne findall(): findall() smije zapodjeti podudaranje
# BILO GDJE u nizu, pa je patch #2 (v. git/changelog povijest) za
# „van der Berg, J." vraćao samo „Berg" — regex se jednostavno ponovno
# usidrio na drugi dio prezimena umjesto da cijeli unos odbije. Nezavisna
# revizija (drugi model, izoliran kontekst) uhvatila je ovo kao regresiju:
# tvrdnja u dokumentaciji da „van der Berg" pada na identičan fallback kao i
# prije patcha bila je netočna. Sekvencijalni parser ovdje umjesto toga
# zahtijeva da SVAKA prepoznata autor-skupina počne točno tamo gdje je
# prethodna završila (početak niza, ili odmah iza prepoznatog rastavljača) —
# ako parsiranje na bilo kojoj točki ne uspije, cijeli rezultat se odbacuje i
# koristi se stari fallback (prvi token prije zareza/zagrade), umjesto da se
# vrati djelomično, krivo prezime.
#
# `\w`/`[^\W\d_]` u Pythonu 3 je Unicode-svjestan bez ikakvog dodatnog razreda
# znakova, pa hrvatska (č ć ž š đ Č Ć Ž Š Đ) i strana dijakritika (ü ö ä é ø å
# ñ ß ...) rade identično bez posebnog nabrajanja — patch #2 je imao samo
# eksplicitan razred malih hrvatskih slova, što je i bio uzrok bugova #1/#2
# iz nezavisne revizije (strana dijakritika u drugom/trećem koautoru tiho se
# gubila).
# Q13, drugi krug: popis plemićkih/patronimskih čestica živi u
# `citation_dialects` (vlasnik pojma „prvi autor") i preuzima se odavde. Dva
# odvojena popisa istog pojma su i bila uzrok Q13 — popis literature je davao
# ključ „de vries", narativni citat „vries", pa je isti izvor bio istovremeno
# „nigdje citiran" i „citiran bez izvora".
_PARTIKULA = C.PARTIKULA
_RIJEC = r"[^\W\d_]+(?:['’\-][^\W\d_]+)*"
_PREZIME_RE = re.compile(rf"(?:{_PARTIKULA}\s+)*{_RIJEC}(?:\s+{_RIJEC})*")
_INICIJALI_RE = re.compile(r"(?:[^\W\d_]\.\s*)+")
_AUTOR_SEP_RE = re.compile(r"\s*(?:,|;|\bi\b|\bte\b|&|\band\b)\s*", re.IGNORECASE)
_I_DR_RE = re.compile(r"^\s*(?:i\s+dr\.?|et\s+al\.?)\b", re.IGNORECASE)


def _izvuci_autore(glava_sirov, glava_stripana):
    """Vrati (prikaz, lista_prezimena, prepoznato) za autore iz glave unosa.

    `prikaz` je hrvatskom konvencijom spojen string za ljudski prikaz (npr.
    „Payne, Gil-Alana i Mervar"), `lista_prezimena` je popis pojedinačnih
    prezimena za strukturirani downstream (BibTeX/RIS export treba svakog
    autora zasebno — v. `export_bibliography.izvor_u_bibtex()`), a
    `prepoznato` je True samo kad je barem jedna "Prezime, Inicijali" skupina
    stvarno parsirana (a ne kad je vraćen stari fallback-prvi-token).
    `rastavi()` koristi `prepoznato` da odluči smije li se rezultatu
    vjerovati i preko 60 znakova (v. Bug #7 iz nezavisne revizije — dug, ali
    ispravno parsiran popis od 5+ autora ne smije se odsjeći kao da je
    slučajni predugačak fragment).

    `glava_sirov` mora zadržati završnu točku zadnjeg inicijala (npr. „..., A.")
    jer `_INICIJALI_RE` traži doslovnu točku; pozivatelj (rastavi()) namjerno
    prosljeđuje verziju PRIJE `strip(" .,;(")` koraka. `glava_stripana` je
    charset-stripana verzija, korištena isključivo kao fallback ulaz kad
    parsiranje ne uspije niti za jednog autora.

    Podržano: hrvatske i strane dijakritike, spojena i višerječna prezimena
    („Marić-Šimun", „Kovačević Prpić"), čestice („van der Berg"), apostrofi
    („O'Brien"), rastavljači „,", „i", „te", „&", „and", te „i dr."/"et al."
    kao završni marker (dodaje se " i dr." na kraj prikaza bez izmišljanja
    dodatnih imena). Institucijski/jednoautorski unosi bez "Prezime,
    Inicijali" oblika padaju na identičan fallback kao i prije bilo kojeg od
    autor-patcheva (prvi token prije zareza/zagrade).
    """
    prezimena = []
    i_dr = False
    ostatak = glava_sirov.strip()
    while ostatak:
        m_prezime = _PREZIME_RE.match(ostatak)
        if not m_prezime or not m_prezime.group(0):
            break
        rest = ostatak[m_prezime.end():].lstrip()
        if not rest.startswith(","):
            break
        rest = rest[1:].lstrip()
        m_inicijali = _INICIJALI_RE.match(rest)
        if not m_inicijali:
            break
        prezimena.append(m_prezime.group(0))
        ostatak = rest[m_inicijali.end():]
        if _I_DR_RE.match(ostatak):
            i_dr = True
            break
        ostatak = ostatak.lstrip()
        if not ostatak:
            break
        m_sep = _AUTOR_SEP_RE.match(ostatak)
        if not m_sep or not m_sep.group(0).strip():
            break
        ostatak = ostatak[m_sep.end():]

    if not prezimena:
        stari = re.split(r"\s*[,(]", glava_stripana)[0].strip() if glava_stripana else ""
        return stari, ([stari] if stari else []), False

    prikaz = prezimena[0] if len(prezimena) == 1 else (
        ", ".join(prezimena[:-1]) + " i " + prezimena[-1]
    )
    if i_dr:
        prikaz += " i dr."
    return prikaz, prezimena, True


# v1.1-advisory patch #3 (naslov-strana popravaka, nezavisna revizija #8/#9/#10):
# poznate kratice čija točka NIJE granica naslova (Vol., str., izd., ...).
_KRATICE_PRIJE_TOCKE = frozenset({
    "vol", "no", "br", "str", "izd", "sv", "god", "sur", "dr", "prof", "ur",
    "gl", "op", "cit", "et", "al", "sl", "npr", "tzv", "tj", "odn", "id",
    "ibid", "cf", "usp", "cl", "čl", "st", "pr", "hr", "pp",
})

# Zarez ispred "Grad[ Grad2]: Nakladnik" repa — dopušta višerječne gradove
# ("New York:", "Slavonski Brod:") i izostanak razmaka iza dvotočke
# ("Zagreb:Naklada"), oboje otkriveno nezavisnom revizijom (bug #10).
_GRAD_NAKLADNIK_RE = re.compile(
    r",\s+(?=[A-ZČĆŽŠĐ][A-Za-zčćžšđ]*(?:\s+[A-ZČĆŽŠĐ][A-Za-zčćžšđ]*)*\s*:\s*)"
)

# Rep časopisnog citata ("..., Vol. 28, No. 1, str. 1-20.") — kad se pronađe,
# sve OD zareza koji mu prethodi se odsijeca s naslova (bug #9). Ostavlja
# poznato preostalo ograničenje: naziv časopisa ostaje zalijepljen za naslov
# (v. docs/v1_1_dodaci.md), ali brojevi sveska/broja/stranica ne curi.
_CASOPIS_METAPODACI_RE = re.compile(
    r"\s*,\s*\b(?:Vol\.?|No\.?|Br\.?|Sv\.?|God\.?|str\.?|pp\.?)\s*\d", re.IGNORECASE
)


# Hrvatski redni broj („2. izd.", „14. izmijenjeno izdanje") stavlja pred točku
# golu znamenku, a ne riječ. Zbog toga je `_je_kratica_prije_tocke` — koja gleda
# samo riječ prije točke — tu točku držala krajem naslova, pa je „Poslovni
# procesi, 2. izd. Zagreb: Školska knjiga." davalo naslov „Poslovni procesi, 2",
# tj. naslov odsječen nasred metapodatka o izdanju. To se vidjelo i u izvozu
# (`export_bibliography` je pisao `title = {{Poslovni procesi, 2}}`) i u
# Crossref pretrazi po naslovu.
# Četveroznamenkasta godina je iznimka: „…nakon 1990. godine" je stvarna
# rečenična granica, ne redni broj.
_REDNI_BROJ_PRIJE_TOCKE_RE = re.compile(r"(?<![\d.])(?!(?:1[89]|20)\d{2}\b)\d{1,3}$")
# PREKOREKCIJA (2. krug recenzije): pravilo „gola znamenka ispred točke je redni
# broj" bilo je istinito samo za znamenku U SREDINI naslova („Turizam u 21.
# stoljeću"). Na KRAJU naslova ista znamenka je kraj naslova, a ne redni broj, pa
# je naslov gutao cijeli ostatak unosa: „Ekonomika 1. Zagreb: Mikrorad." →
# „Ekonomika 1. Zagreb: Mikrorad", „…, 22(2), 135–147. https://doi.org/…" →
# naslov s repom DOI-ja u sebi. Na pravom radu to je mijenjalo 12 od 61 naslova u
# --json izlazu i u BibTeX izvozu, plus 4 stable_source_id vrijednosti.
# PREKOREKCIJA (3. krug recenzije): popravak te prekorekcije tražio je MALU riječ
# iza točke, pa je svaki stvarni redni broj iza kojega slijedi velika riječ postao
# granica naslova. To je čest hrvatski bibliografski oblik — nazivi skupova:
# „Zbornik radova s 3. Hrvatskog kongresa ekonomista" davao je naslov „Zbornik
# radova s 3". Pravilo je zato okrenuto u SIGURAN smjer: gola znamenka ispred
# točke znači redni broj (dakle NE granica), osim ako iza točke ne počinju podaci
# o izdavanju. Ako pogriješimo, naslov ostane malo dulji — a to ništa ne ruši,
# dok odsječen naslov ruši i izvoz i pretragu i `stable_source_id`.
# „Podaci o izdavanju" su strukturno prepoznatljivi: URL/DOI rep, ili oblik
# „Mjesto: Nakladnik" u kojem mjesto ima najviše dvije riječi („Zagreb:",
# „Slavonski Brod:"). Naziv skupa taj oblik nema — dvotočka u „Hrvatskog kongresa
# ekonomista: zbornik" dolazi iza tri riječi.
_IZDAVANJE_IZA_TOCKE_RE = re.compile(
    r"^\s*(?:https?://|www\.|doi:|DOI:)"
    r"|^\s*[A-ZČĆŽŠĐ][\wčćžšđ-]*(?:\s+[A-ZČĆŽŠĐ][\wčćžšđ-]*)?\s*:\s",
    re.UNICODE)
# Redni broj je pridjev — iza njegove točke UVIJEK stoji riječ. Ako ondje ne
# počinje slovo, to nije redni broj nego granica naslova: „…, 22(2), 135–147.
# )00048-0" (rep DOI-ja koji ostane nakon uklanjanja URL-a) inače uđe u naslov,
# a odatle i u BibTeX izvoz.
_IZA_TOCKE_RIJEC_RE = re.compile(r"\s+[^\W\d_]", re.UNICODE)
# Metapodatak o IZDANJU iza zareza („…, 2. izd.", „…, 3. dopunjeno izdanje") nije
# dio naslova i naslov ondje završava.
#
# PREKOREKCIJA (2. krug recenzije): prijašnji uzorak obrezivao je SVAKI redni broj
# iza zareza, pa je gutao i redni broj koji je DIO IDENTITETA jedinice („Povijest
# Hrvatske, 1. dio" i „…, 2. dio" oba su davala naslov „Povijest Hrvatske"). Dva
# različita sveska istog djela tako su dobivala isti naslov, a preko njega i isti
# `evidence_model.stable_source_id` — kolizija ključa identiteta cijelog evidence
# modela, najskuplji mogući ishod ovdje.
# Oblik „, N. riječ" je isti u oba slučaja, pa razlika NIJE strukturna nego
# semantička: „izdanje" je svojstvo otiska (isto djelo), „dio/svezak/knjiga" je
# dio identiteta djela. Zato je popis namjerno zatvoren i uzak, i pravilo radi u
# sigurnom smjeru — nepoznata riječ iza rednog broja se NE obrezuje (naslov
# ostane malo duži, što ništa ne ruši), a obrezuje se samo ono što je dokazano
# oznaka izdanja/otiska. Obratni smjer (obreži pa vidi) proizvodi koliziju.
_IZDANJE_RIJEC = (
    r"(?:izd|izdanje|izdanja|izdanju|izdanjem|dopunjeno|dopunjeno-izmijenjeno|"
    r"prošireno|prerađeno|izmijenjeno|neizmijenjeno|nepromijenjeno|popravljeno|"
    r"nakl|naklada|tisak|otisak|ed|edn|edition|reprint|printing)"
)
_IZDANJE_REP_RE = re.compile(
    r"\s*,\s*(?<![\d.])(?!(?:1[89]|20)\d{2}\b)\d{1,3}\.\s+" + _IZDANJE_RIJEC + r"\b",
    re.IGNORECASE)


def _je_kratica_prije_tocke(tekst, pozicija_tocke):
    """Je li točka na `pozicija_tocke` dio kratice ili rednog broja, a ne granica
    naslova? Kratice su poznat popis ("Vol"/"str"/"izd") — nezavisna revizija
    (bug #9) pokazala je da „..., Tourism Economics, Vol. 28, No. 1, str. 1-20."
    lažno prekida naslov odmah iza „Vol". Redni broj je strukturno pravilo: gola
    znamenka ispred točke je redni broj osim ako iza točke ne počinju podaci o
    izdavanju (v. `_IZDAVANJE_IZA_TOCKE_RE`)."""
    prije = tekst[:pozicija_tocke]
    poslije = tekst[pozicija_tocke + 1:]
    if (_REDNI_BROJ_PRIJE_TOCKE_RE.search(prije)
            and _IZA_TOCKE_RIJEC_RE.match(poslije)
            and not _IZDAVANJE_IZA_TOCKE_RE.match(poslije)):
        return True
    m = re.search(r"([A-Za-zčćžšđČĆŽŠĐ]+)$", prije)
    return bool(m) and m.group(1).lower() in _KRATICE_PRIJE_TOCKE


def _razdvoji_naslov_kandidate(rep):
    """Podijeli rep (sve iza godine) na kandidate za naslov.

    Dvije razlike prema pred-v1.1-patch#3 verziji, obje iz nezavisne revizije:
    1. Točke koje pripadaju poznatim kraticama (Vol./str./izd./...) više se
       ne tretiraju kao granica naslova (bug #9).
    2. Kad nema stvarne granične točke pa se koristi zarez-stil "Grad:
       Nakladnik" fallback, uzima se POSLJEDNJA takva granica u repu, ne
       prva — naslov koji sam sadrži "Riječ: Podnaslov" (npr. „Turizam:
       ekonomske osnove") inače lažno okida na svom vlastitom dvotočju i
       cijeli stvarni rep (grad, nakladnik) završava u naslovu (bug #8).
    """
    granice = [
        m for m in re.finditer(r"(?<=[a-zšđčćž0-9\"'”’])\.\s+", rep)
        if not _je_kratica_prije_tocke(rep, m.start())
    ]
    if not granice:
        kandidati = [rep]
    else:
        kandidati = []
        zadnji_kraj = 0
        for m in granice:
            kandidati.append(rep[zadnji_kraj:m.start() + 1])
            zadnji_kraj = m.end()
        kandidati.append(rep[zadnji_kraj:])

    if len(kandidati) == 1:
        granicnici = list(_GRAD_NAKLADNIK_RE.finditer(rep))
        if granicnici:
            zadnja = granicnici[-1]
            kandidati = [rep[:zadnja.start()], rep[zadnja.end():]]
    return kandidati


def rastavi(red):
    """Iz jedne bibliografske jedinice izvuci autora, godinu, naslov, DOI, URL.

    Heuristika prilagođena hrvatskom autor-godina zapisu:
    „Čavlek, N. (1998.) Turoperatori i svjetski turizam. Zagreb: Golden marketing."

    v1.1-advisory patch (autoriziran u sesiji, nije prošao B01-B20 audit lanac
    — v. docs/v1_1_dodaci.md #core-patch): stvarni oblici otkriveni
    provjerom na pravom EFZG radu i naknadnom nezavisnom revizijom, svi i
    dalje podržavaju izvorni oblik iz docstringa bez regresije (v.
    tests/regression/test_source_verification_semantics.py i
    tests/regression/test_efzg_comma_style_citations.py):

    1. EFZG-ov vlastiti stil koristi ZAREZ, ne točku, iza godine.
    2. Godina s slovom za razdvajanje istog autora/godine („2025.a", „2025.b").
    3. Višeautorski unosi (v. `_izvuci_autore()` docstring za punu listu
       podržanih oblika: strana dijakritika, spojena/višerječna prezimena,
       čestice, apostrofi, „i dr."/"et al.").
    4. Naslov koji sam sadrži "Riječ: Podnaslov" više ne okida lažno na
       zarez-stil "Grad: Nakladnik" granicu (v. `_razdvoji_naslov_kandidate()`).
    5. Časopisni citati s "Vol./No./str." repom više ne lome naslov nasred
       kratice (isto).
    """
    doi = None
    m = DOI_RE.search(red)
    if m:
        doi = m.group(1).rstrip(".,;)]>")
    url = None
    mu = URL_RE.search(red)
    if mu:
        url = mu.group(0).rstrip(".,;)]>")
        if doi is None and "doi.org/" in url:
            md = DOI_RE.search(url)
            if md:
                doi = md.group(1).rstrip(".,;)]>")

    mg = GODINA_RE.search(red)
    godina = mg.group(1) if mg else None

    glava_sirov = red[:mg.start()] if mg else red
    # v1.1-advisory patch #2: zadrži glava_sirov (bez skidanja završne točke)
    # za _izvuci_autore() — zadnji koautor u "..., Mervar, A." inače gubi
    # točku iza inicijala u strip(" .,;(") koraku ispod, pa ga regex
    # "Prezime, Inicijali" skupina (koja traži doslovnu točku) više ne
    # prepoznaje. `glava` (charset-stripan) ostaje nepromijenjen fallback
    # ulaz — identičan prijašnjem ponašanju kad parsiranje ne nađe nijednog
    # autora.
    glava_sirov = re.sub(r"[(\[]\s*$", "", glava_sirov).strip()
    glava = glava_sirov.strip(" .,;(")
    autor, autori, autor_prepoznat = _izvuci_autore(glava_sirov, glava)
    # v1.1-advisory patch #3 (bug #7): guard od 60 znakova vrijedi SAMO za
    # fallback-prvi-token rezultat — legitiman, ispravno parsiran popis od
    # 5+ autora smije biti dulji od 60 znakova bez da ga se odsiječe nasred
    # riječi.
    if not autor or (not autor_prepoznat and len(autor) > 60):
        autor = (glava[:60] or red[:40]).strip()
        autori = [autor] if autor else []

    rep = red[mg.end():] if mg else red
    # v1.1-advisory: dopusti i jedno slovo za disambiguaciju („.a)", „b)")
    # između zatvarajuće interpunkcije, npr. iza „2025" u „(2025.a)".
    rep = re.sub(r"^\s*[.)\]]*[a-z]?[.)\]]*\s*", "", rep)
    rep = re.sub(r"^\s*\.\s*", "", rep)
    rep = URL_RE.sub(" ", rep)
    rep = re.sub(r"(?i)\bdoi\s*:?\s*", " ", rep)
    if doi:
        rep = rep.replace(doi, " ")
    naslov = ""
    for dio in _razdvoji_naslov_kandidate(rep):
        dio = dio.strip(" .,;:")
        if len(dio) >= 6:
            naslov = dio
            break
    if not naslov:
        naslov = rep.strip(" .,;:")[:160]
    # v1.1-advisory patch #3 (bug #9): odsijeci "Vol./No./str." rep časopisnog
    # citata s odabranog kandidata prije konačnog skraćivanja na 200 znakova.
    mcm = _CASOPIS_METAPODACI_RE.search(naslov)
    if mcm:
        obrezan = naslov[:mcm.start()].strip(" .,;:")
        if len(obrezan) >= 6:
            naslov = obrezan
    # Oznaka izdanja („…, 2. izd. Zagreb: …") je metapodatak o otisku, ne dio
    # naslova; naslov ondje završava. Redni broj koji nosi identitet jedinice
    # („…, 1. dio") se NE dira — v. `_IZDANJE_REP_RE`.
    mrb = _IZDANJE_REP_RE.search(naslov)
    if mrb:
        obrezan = naslov[:mrb.start()].strip(" .,;:")
        if len(obrezan) >= 6:
            naslov = obrezan
    naslov = re.sub(r"\s+", " ", naslov)[:200]

    return {"unos": red, "autor": autor, "autori": autori, "godina": godina,
            "naslov": naslov, "doi": doi, "url": url}


# ------------------------------------------------------------------- mreža

def _cekaj():
    razmak = time.monotonic() - _zadnji_zahtjev[0]
    if razmak < MIN_RAZMAK:
        time.sleep(MIN_RAZMAK - razmak)
    _zadnji_zahtjev[0] = time.monotonic()


def _zahtjev(url, metoda="GET"):
    """Vrati (status, tijelo|None, greška|None). Mrežna greška NIKAD ne ruši skriptu."""
    _cekaj()
    req = urllib.request.Request(url, method=metoda, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            tijelo = b"" if metoda == "HEAD" else r.read(400000)
            return r.status, tijelo, None
    except urllib.error.HTTPError as e:
        return e.code, None, None
    except Exception as e:                     # timeout, DNS, TLS, proxy, reset…
        return None, None, type(e).__name__


def normaliziraj_naslov(s):
    s = H.bez_dijakritika((s or "").lower())
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", s)).strip()


def slicnost(a, b):
    a, b = normaliziraj_naslov(a), normaliziraj_naslov(b)
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


# v1.1-advisory patch (D9/Q7b/Q7c): Crossref zapis ne nosi naslov samo u
# `title[0]`. Hrvatski časopisi (npr. Ekonomski pregled) redovito deponiraju
# dvojezične naslove, a redoslijed jezika NIJE stabilan — ista je jedinica
# jednom „Carbon accounting", drugi put „Računovodstvo ugljika". Zato se
# sličnost računa prema NAJBOLJOJ od svih varijanti: `title[]`,
# `original-title[]` i `title` spojen s `subtitle`.
def _crossref_lista_stringova(meta, kljuc):
    if not isinstance(meta, dict):
        return []
    v = meta.get(kljuc)
    if isinstance(v, str):
        return [v.strip()] if v.strip() else []
    if isinstance(v, list):
        return [s.strip() for s in v if isinstance(s, str) and s.strip()]
    return []


def crossref_varijante_naslova(meta):
    """Sve varijante naslova iz Crossref zapisa (title, original-title, title: subtitle)."""
    naslovi = _crossref_lista_stringova(meta, "title")
    varijante = list(naslovi) + _crossref_lista_stringova(meta, "original-title")
    for n in naslovi:
        for pod in _crossref_lista_stringova(meta, "subtitle"):
            varijante.append(f"{n}: {pod}")
    return varijante


def najbolja_slicnost_naslova(naslov, meta):
    """Vrati (najveća sličnost, varijanta naslova koja ju je dala)."""
    najs, najbolji = 0.0, ""
    for v in crossref_varijante_naslova(meta):
        s = slicnost(naslov, v)
        if s > najs:
            najs, najbolji = s, v
    return najs, najbolji


def crossref_prvi_autor(meta):
    """Prezime prvog autora iz Crossref zapisa, ili None."""
    if not isinstance(meta, dict):
        return None
    autori = meta.get("author")
    if not isinstance(autori, list):
        return None
    for a in autori:
        if not isinstance(a, dict):
            continue
        prez = str(a.get("family") or a.get("name") or "").strip()
        if prez:
            return prez
    return None


def crossref_godine(meta):
    """Sve godine koje Crossref navodi (issued, published-print/online, published).

    Online-first izdanja legitimno nose dvije godine; ako se studentova godina
    poklapa s BILO KOJOM od njih, godina se ne smatra neslaganjem.
    """
    if not isinstance(meta, dict):
        return []
    godine = []
    for kljuc in ("issued", "published-print", "published-online", "published"):
        blok = meta.get(kljuc)
        if not isinstance(blok, dict):
            continue
        dijelovi = blok.get("date-parts")
        if not isinstance(dijelovi, list):
            continue
        for d in dijelovi:
            if isinstance(d, list) and d:
                try:
                    godine.append(str(int(d[0])))
                except (TypeError, ValueError):
                    continue
    return godine


def _isto_prezime(a, b):
    a, b = normaliziraj_naslov(a), normaliziraj_naslov(b)
    if not a or not b:
        return True                     # nema signala → nema neslaganja
    if a == b or a in b.split() or b in a.split():
        return True
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.85


def usporedi_metapodatke(izvor, meta):
    """Vrati (popis neslaganja, ima_li_uopće_signala) za prvog autora i godinu.

    Q7b: Crossref provjera je i dalje samo „može li se ovo naći", ali autor i
    godina su već u ruci pa se neslaganje mora izreći, ne prešutjeti.
    """
    neslaganja, ima_signala = [], False

    autori = izvor.get("autori") or []
    domaci = (autori[0] if autori else "") or izvor.get("autor") or ""
    daljinski = crossref_prvi_autor(meta)
    if daljinski and domaci:
        ima_signala = True
        if not _isto_prezime(domaci, daljinski):
            neslaganja.append(f"prvi autor: u popisu „{domaci}\", u Crossrefu „{daljinski}\"")

    godine = crossref_godine(meta)
    if godine and izvor.get("godina"):
        ima_signala = True
        if izvor["godina"] not in godine:
            neslaganja.append(
                f"godina: u popisu {izvor['godina']}., u Crossrefu {godine[0]}.")
    return neslaganja, ima_signala


# Polja Crossref „work" zapisa; barem jedno mora postojati da bi se `message`
# smatrao stvarnim zapisom, a ne praznim odgovorom (v. `crossref_doi_metadata`).
_CROSSREF_POLJA_ZAPISA = (
    "DOI", "title", "original-title", "short-title", "subtitle", "container-title",
    "author", "editor", "issued", "published", "published-print", "published-online",
    "type", "publisher", "ISSN", "ISBN", "URL", "reference", "abstract",
)


def crossref_doi_metadata(doi):
    """Vrati (legacy_status, poruka, Crossref metadata|None)."""
    url = CROSSREF + "/works/" + urllib.parse.quote(doi, safe="")
    st, tijelo, greska = _zahtjev(url)
    if greska or st is None:
        return NEDOSTUPNO, f"Crossref nedostupan ({greska or 'bez odgovora'})", None
    if st == 404:
        return NEPOSTOJI, "Crossref: DOI ne postoji (404)", None
    if st != 200:
        return NEDOSTUPNO, f"Crossref HTTP {st}", None
    try:
        m = json.loads(tijelo.decode("utf-8", "replace")).get("message", {})
    except (ValueError, AttributeError):
        return NEDOSTUPNO, "Crossref: neočekivan odgovor", None
    # v1.1-advisory patch (Q7c): 200 s tijelom koje nije očekivanog oblika nije
    # razriješen DOI. Prije je `m.get(...)` na ne-dictu dizao AttributeError i
    # rušio cijeli izvještaj nasred popisa od 60 izvora.
    if not isinstance(m, dict):
        return NEDOSTUPNO, "Crossref: neočekivan odgovor", None
    # Q7, druga polovica: dosad je SVAKI parsabilni 200 značio „DOI razriješen ✅",
    # pa je i meki 404 — HTTP 200 s ispravno oblikovanim, ali praznim `message`-om
    # — prolazio kao potvrđen identitet, s obrazloženjem „DOI razriješen · „”".
    # Prazan zapis ne nosi nijedan podatak o jedinici, dakle ništa nije
    # razriješeno. Provjera je strukturna (ima li zapis ijedno polje Crossref
    # work sheme), ne nabrajanje poznatih odgovora, i radi u sigurnom smjeru:
    # nepoznat oblik → „nedostupno" (⚠️, neblokirajuće), a ne ❌.
    if not any(k in m for k in _CROSSREF_POLJA_ZAPISA):
        return NEDOSTUPNO, "Crossref: prazan zapis (200 bez ijednog podatka o jedinici)", None
    naslovi = crossref_varijante_naslova(m)
    return POTVRDEN, f"DOI razriješen · „{(naslovi[0] if naslovi else '')[:70]}”", m


def crossref_naslov(naslov, izvor=None):
    # v1.1-advisory patch (Q7b): u `select` idu i `author` i `issued` — bez njih
    # se naslovna pretraga ne može ni pokušati usporediti s autorom i godinom
    # iz popisa. Semantički doseg ostaje isti („može li se ovo naći"), samo se
    # neslaganje sada izriče u obrazloženju umjesto da se prešuti.
    if not naslov or len(normaliziraj_naslov(naslov)) < 8:
        return NEPOTVRDEN, "naslov prekratak za pretragu — provjeri ručno"
    url = (CROSSREF + "/works?rows=3&select=DOI,title,author,issued&query.bibliographic="
           + urllib.parse.quote(naslov[:250]))
    st, tijelo, greska = _zahtjev(url)
    if greska or st is None:
        return NEDOSTUPNO, f"Crossref nedostupan ({greska or 'bez odgovora'})"
    if st != 200:
        return NEDOSTUPNO, f"Crossref HTTP {st}"
    try:
        odgovor = json.loads(tijelo.decode("utf-8", "replace")).get("message", {})
    except (ValueError, AttributeError):
        return NEDOSTUPNO, "Crossref: neočekivan odgovor"
    # v1.1-advisory patch (Q7c): message/items koji nisu očekivanog oblika ne
    # smiju dizati AttributeError nasred popisa izvora.
    if not isinstance(odgovor, dict):
        return NEDOSTUPNO, "Crossref: neočekivan odgovor"
    stavke = odgovor.get("items")
    if not isinstance(stavke, list):
        return NEDOSTUPNO, "Crossref: neočekivan odgovor"
    najbolji, najs, najn = None, 0.0, ""
    for it in stavke:
        if not isinstance(it, dict):
            continue
        s, n = najbolja_slicnost_naslova(naslov, it)
        if s > najs:
            najs, najbolji, najn = s, it, n
    if not najbolji:
        return NEPOTVRDEN, "Crossref nema pogodak (knjige i zbornici često nisu ondje)"
    n = najn or (crossref_varijante_naslova(najbolji) or [""])[0]
    if najs >= PRAG_SLICNOSTI:
        obraz = (f"pogodak {najs:.2f} · {najbolji.get('DOI', '')} · „{n[:60]}\"")
        neslaganja, _ = usporedi_metapodatke(izvor or {}, najbolji)
        if neslaganja:
            obraz += ("  ⚠️ naslov je nađen, ali se ne slaže: " + "; ".join(neslaganja)
                      + " · Što napraviti: provjeri je li citirana baš ta jedinica.")
        return POTVRDEN, obraz
    return NEPOTVRDEN, (f"najbolji pogodak samo {najs:.2f} (prag {PRAG_SLICNOSTI:.2f}): "
                        f"„{n[:60]}\" — nije isto djelo ili nije u Crossrefu")


def provjeri_url(url):
    hrcak = "hrcak.srce.hr" in url
    # v1.1 (NEW-103): CROSBI (bib.irb.hr) je migrirao u CroRIS (croris.hr); oba
    # se pojavljuju u praksi, ni jedan nema javni strojno čitljiv API, pa je
    # ovo isto tako samo HTTP provjera dostupnosti, ne provjera identiteta.
    crosbi = ("bib.irb.hr" in url) or ("croris.hr" in url)
    st, _, greska = _zahtjev(url, "HEAD")
    if st in (403, 405, 501) or (st is None and not greska):
        st, _, greska = _zahtjev(url, "GET")
    dodatak = " · Hrčak nema javni API, ovo je samo HTTP provjera" if hrcak else ""
    if crosbi:
        dodatak = " · CROSBI/CroRIS nema javni API, ovo je samo HTTP provjera"
    if greska or st is None:
        return NEDOSTUPNO, f"URL nedostupan ({greska or 'bez odgovora'}){dodatak}"
    if st == 404 or st == 410:
        return NEPOSTOJI, f"URL vraća {st}{dodatak}"
    if 200 <= st < 400:
        return POTVRDEN, f"URL odgovara ({st}){dodatak}"
    return NEPOTVRDEN, f"URL vraća {st} — provjeri ručno{dodatak}"


# ------------------------------------------------------- formalna provjera

def formalno(izvor):
    """Bez mreže: ima li jedinica sve što treba da bi je itko mogao naći."""
    fali = []
    if not izvor["godina"]:
        fali.append("godina")
    if not IZDAVAC_RE.search(izvor["unos"]):
        fali.append("izdavač ili časopis")
    if fali:
        return NEPOTVRDEN, "nedostaje: " + ", ".join(fali)
    if not (izvor["doi"] or izvor["url"]):
        return NEPOTVRDEN, ("formalno uredno, ali bez DOI-ja i URL-a — knjiga je takva "
                            "sasvim uredna, samo se ne može provjeriti automatski")
    return NEPOTVRDEN, "formalno potpuno, ali postojanje/identitet nisu mrežno provjereni"



def _legacy_to_semantic(st, *, provider, reason, scope="identity"):
    if st == POTVRDEN:
        return verification_record(VERIFIED, provider=provider, reason=reason, scope=scope)
    if st == NEPOSTOJI:
        return verification_record(INVALID, provider=provider, reason=reason, scope=scope)
    if st == NEDOSTUPNO:
        return verification_record(
            UNVERIFIED,
            provider=provider,
            availability="unavailable",
            reason=reason,
            scope=scope,
        )
    return verification_record(UNVERIFIED, provider=provider, reason=reason, scope=scope)


def provjeri_izvor(izvor, offline=False, discovered_via=None):
    """Provjeri jedan bibliografski unos i vrati semantički obogaćen record.

    ``unverified`` nije blocking. ``invalid`` i ``conflict`` jesu blocking jer postoji
    negativan dokaz ili kontradikcija identiteta. Discovery channel ostaje odvojen od
    source entityja.
    """
    out = dict(izvor)
    out["source_id"] = stable_source_id(out)
    out["discovered_via"] = normalize_discovery_channel(discovered_via)

    if is_discovery_service_entity(out):
        ver = verification_record(
            INVALID,
            provider="discovery-policy",
            reason="Google Scholar je discovery servis, ne bibliografski izvor",
            scope="identity",
        )
        source_type = "discovery_service"
        out.update({
            "status": NEPOSTOJI,
            "obrazlozenje": ver["reason"],
            "verification": ver,
            "source_entity": {"kind": "discovery_service", "type": source_type},
            "quality": classify_quality(source_type, INVALID),
            "blocking": True,
        })
        return out

    provider_metadata = None
    if offline:
        legacy, obraz = formalno(out)
        # Formal completeness never proves existence/identity.
        ver = _legacy_to_semantic(legacy, provider="offline-formal", reason=obraz, scope="formal")
    elif out["doi"]:
        legacy, obraz, provider_metadata = crossref_doi_metadata(out["doi"])
        ver = _legacy_to_semantic(legacy, provider="crossref-doi", reason=obraz)
        if ver["status"] == VERIFIED and out.get("naslov") and provider_metadata:
            # v1.1-advisory patch (D9): sličnost se mjeri prema NAJBOLJOJ varijanti
            # naslova (title[], original-title[], title: subtitle), a ne samo prema
            # title[0]. Dvojezični zapisi hrvatskih časopisa nemaju stabilan
            # redoslijed jezika, pa je title[0] često engleski i uredan hrvatski
            # citat je ispadao „sukob".
            similarity, remote_title = najbolja_slicnost_naslova(out["naslov"], provider_metadata)
            neslaganja, ima_signala = usporedi_metapodatke(out, provider_metadata)
            if remote_title and similarity < 0.35:
                # v1.1-advisory patch (D9): razlika u naslovu SAMA po sebi nije
                # kontradikcija identiteta — prijevod naslova nije izmišljen izvor.
                # Sukob se proglašava tek kad i potkrepljujući signal (prezime prvog
                # autora ili godina) proturječi. Kad Crossref zapis uopće nema ni
                # autora ni godinu, nema se čime potkrijepiti identitet pa ostaje
                # staro, strože ponašanje (sukob).
                if neslaganja or not ima_signala:
                    razlog_neslaganja = ("; " + "; ".join(neslaganja)) if neslaganja else ""
                    obraz = (
                        f"DOI se razrješava, ali naslov se ne podudara "
                        f"({similarity:.2f}): „{remote_title[:70]}\"{razlog_neslaganja}"
                    )
                    ver = verification_record(
                        CONFLICT,
                        provider="crossref-doi",
                        reason=obraz,
                        scope="identity",
                        mismatches=neslaganja,
                    )
                    legacy = SUKOB
                else:
                    obraz = (
                        f"DOI se razrješava, autor i godina se slažu, ali naslov se "
                        f"razlikuje ({similarity:.2f}): „{remote_title[:70]}\" — moguć "
                        f"prijevod ili drugi zapis naslova. Što napraviti: usporedi "
                        f"naslov s jedinicom na DOI-ju i uskladi popis."
                    )
                    ver = verification_record(
                        UNVERIFIED,
                        provider="crossref-doi",
                        reason=obraz,
                        scope="identity",
                    )
                    legacy = NEPOTVRDEN
            elif neslaganja:
                # Q7b: naslov je pogođen, ali autor/godina nisu — to se izriče,
                # ne prešućuje (doseg provjere ostaje „može li se ovo naći").
                # Q7b, drugi krug: neslaganje je dosad živjelo SAMO u slobodnom
                # tekstu obrazloženja, pa potrošači JSON-a (izvoz, engine) nisu
                # imali kako razlikovati ovakav zapis od stvarno potvrđenog
                # izvora. Sada ide i u strojno čitljiv `verification.mismatches`.
                # Status namjerno OSTAJE `verified`: DOI se razrješava i naslov se
                # podudara, dakle jedinica postoji i nađena je — spuštanje u
                # `unverified`/`conflict` bilo bi prekorekcija na uredno citiranom
                # radu (online-first godine, transliterirana prezimena, uredništvo
                # umjesto autora), a upravo je prekorekcija ovdje najskuplji kvar.
                obraz += ("  ⚠️ ali se ne slaže: " + "; ".join(neslaganja)
                          + " · Što napraviti: provjeri je li citirana baš ta jedinica.")
                ver = verification_record(
                    VERIFIED, provider="crossref-doi", reason=obraz, scope="identity",
                    mismatches=neslaganja)
    elif out["url"]:
        legacy, obraz = provjeri_url(out["url"])
        ver = _legacy_to_semantic(legacy, provider="http", reason=obraz, scope="locator")
    else:
        legacy, obraz = crossref_naslov(out["naslov"], out)
        ver = _legacy_to_semantic(legacy, provider="crossref-title", reason=obraz)

    source_type = infer_source_type(out, provider_metadata)
    quality = classify_quality(source_type, ver["status"])
    out.update({
        "status": legacy,
        "obrazlozenje": obraz,
        "verification": ver,
        "source_entity": {"kind": "bibliographic_source", "type": source_type},
        "quality": quality,
        "blocking": is_blocking_verification(ver["status"]),
    })
    return out

def abecedni_red(izvori):
    """Vrati popis parova koji su izvan hrvatskog abecednog reda."""
    kljucevi = [H.hr_kljuc(i["autor"] or i["unos"]) for i in izvori]
    lose = []
    for i in range(1, len(kljucevi)):
        if kljucevi[i] < kljucevi[i - 1]:
            lose.append((izvori[i - 1]["autor"], izvori[i]["autor"]))
    return lose


# ------------------------------------------------------------- pokrivenost

def tijelo_rada(put):
    """Tekst rada BEZ popisa izvora — inače bi svaki izvor izgledao kao citiran."""
    if put.lower().endswith(".docx"):
        odl, _ = H.ucitaj(put, samo_tijelo=True)
        return "\n".join(odl)
    redci = open(put, encoding="utf-8").read().split("\n")
    tijelo = []
    for r in redci:
        t = r.strip()
        if H.NASLOV_LIT.match(t.lstrip("#").strip()):
            break
        if t and not t.startswith(("#", ">", "|", "---")):
            tijelo.append(t)
    return "\n".join(tijelo)


# v1.1-advisory patch (D13): ključ pokrivenosti je prezime PRVOG autora.
# Stari `re.split(r"\s*,", izvor["autor"])[0]` radio je nad PRIKAZNIM nizom, a
# hrvatski APA za točno dva autora daje „Ćorić, G. i Šimić, M.", što rastavi()
# ispravno sklopi u autor="Ćorić i Šimić" — bez zareza, pa je ključ postajao
# cijeli dvočlani niz i nikad se nije poklopio s ključem citata („ćorić").
# Posljedica u modu 6: ISTI izvor prijavljen i kao „nigdje citiran" i kao
# „citiran, a nema ga na popisu". Jedan i tri+ autora radili su, točno dva ne.
# Q13-fix, drugi krug: pravilo je prije živjelo OVDJE i, u drugom obliku, u
# `citation_dialects._first_author`. Popisi rastavljača su se razišli („&" i
# „and" postojali su samo ovdje), pa je isti dvoautorski izvor dobivao jedan
# ključ iz popisa literature, a drugi iz citata u tekstu. Sada je pravilo na
# jednom mjestu — u citatnom parseru, koji je i vlasnik pojma „prvi autor".
def kljuc_prvog_autora(niz):
    """Prezime prvog autora iz prikaznog niza autora („Müller & Schmidt" → „müller")."""
    return C.kljuc_prvog_autora(niz)


def kljuc_izvora(izvor):
    """Ključ bibliografske jedinice iz STRUKTURIRANE liste koju rastavi() daje."""
    autori = izvor.get("autori") or []
    prvi = (autori[0] if autori else "") or izvor.get("autor") or ""
    return kljuc_prvog_autora(prvi)


# Kvar 157 (Lekta 142): „Prema Galtungu i Rugeu (1965)” daje ključ „galtungu”, jedinica
# „Galtung, J.” daje „galtung” — isti citat izlazi na oba popisa. Padežni nastavci se
# skidaju iterativno, na obje strane; korijen kraći od četiri znaka se ne dira („Mara”
# ostaje „mara”), jer je lažno podudaranje gore od lažnog nepodudaranja.
_SUFIKSI = sorted(("ovima", "evima", "ima", "ova", "eva", "om", "em", "ju", "a", "e", "i", "u"),
                  key=len, reverse=True)


def _korijen(kljuc):
    k = (kljuc or "").strip().lower()
    while True:
        for suf in _SUFIKSI:
            if k.endswith(suf) and len(k) - len(suf) >= 4:
                k = k[: -len(suf)]
                break
        else:
            return k


def _broj_jedinice(izvor, pozicija):
    """Broj numerirane jedinice („7. Autor…”, „[7] Autor…”), inače njezin redni broj u popisu."""
    m = C.NUMERIC_LIST_ITEM.match(izvor.get("unos") or "")
    return int(m.group(1) or m.group(2)) if m else pozicija


def _nacin_pokrivenosti(tekst, fusnote, stil):
    """(način, broj prepoznatih citata). Profil ima prednost; bez njega se čita iz teksta.
    Kvar 156 (Lekta 141): pokrivenost je znala samo autor-godinu, pa je Vancouver rad dobio
    „na popisu, a nigdje citirano” za SVE jedinice — uredan popis koji je bio nalaz o čitaču."""
    n_ay = sum(H.kljucevi_citata(H.bez_lokatora(tekst)).values())
    n_num = len(C.parse_vancouver(tekst)) + len(C.parse_ieee(tekst))
    n_fn = sum(1 for t in fusnote.values() if (t or "").strip())
    if stil:
        try:
            d = C.resolve_dialect(stil)
        except Exception:  # noqa: BLE001 — nepoznat stil: čitaj iz teksta
            d = None
        if d in ("vancouver", "ieee"):
            return "numericki", n_num
        if d == "legal-footnote":
            return "fusnote", n_fn
        if d:
            return "autor-godina", n_ay
    if n_ay and n_ay >= n_num:
        return "autor-godina", n_ay
    if n_num:
        return "numericki", n_num
    if n_fn:
        return "fusnote", n_fn
    return "neprepoznat", 0


def pokrivenost(put, izvori, stil=None):
    tekst = tijelo_rada(put)
    if not tekst.strip():
        return None
    fusnote = C.extract_docx_footnotes(put) if put.lower().endswith(".docx") else {}
    nacin, prepoznato = _nacin_pokrivenosti(tekst, fusnote, stil)
    kljucevi_izvora = {}
    for iz in izvori:
        kljucevi_izvora.setdefault((_korijen(kljuc_izvora(iz)), iz["godina"] or ""), []).append(iz)
    rez = {"stil": nacin, "izmjereno": True, "razlog": "", "citata_razlicitih": 0,
           "necitirani": [], "bez_izvora": []}
    if nacin == "autor-godina":
        # lokator stranice („, str. 41") inače sakrije cijeli citat — v. hr_text.bez_lokatora;
        # ključ citata je prezime prvog autora (D13), svedeno na korijen (kvar 157).
        citati = {(_korijen(kljuc_prvog_autora(a)), g)
                  for a, g in H.kljucevi_citata(H.bez_lokatora(tekst))}
        rez["citata_razlicitih"] = len(citati)
        rez["necitirani"] = [v[0] for k, v in kljucevi_izvora.items()
                             if not any(ck[0] == k[0] and ck[1].rstrip("abcdefg") == k[1]
                                        for ck in citati)]
        rez["bez_izvora"] = sorted(c for c in citati
                                   if not any(c[0] == k[0] and c[1].rstrip("abcdefg") == k[1]
                                              for k in kljucevi_izvora))
    elif nacin == "numericki":
        brojevi = {int(ref.key) for ref in C.parse_vancouver(tekst) + C.parse_ieee(tekst)}
        rez["citata_razlicitih"] = len(brojevi)
        po_broju = {}
        for poz, iz in enumerate(izvori, 1):
            po_broju.setdefault(_broj_jedinice(iz, poz), iz)
        rez["necitirani"] = [iz for br, iz in sorted(po_broju.items()) if br not in brojevi]
        rez["bez_izvora"] = sorted((str(br), "") for br in brojevi if br not in po_broju)
    elif nacin == "fusnote":
        # citat živi u fusnoti („Ime Prezime, Naslov…”): jedinica je citirana ako se korijen
        # prezimena prvog autora pojavi u tekstu fusnota; „citat bez izvora” se iz fusnota ne izvodi.
        korpus = H.bez_dijakritika(" ".join(fusnote.values())).lower()
        rez["citata_razlicitih"] = prepoznato
        # ključ i korpus moraju biti iste abecede: korpus je bez dijakritika, pa i korijen
        # („Kovačević” → „kovacevic”), inače svaka hrvatska jedinica ispadne necitirana
        rez["necitirani"] = [v[0] for k, v in kljucevi_izvora.items()
                             if not (k[0] and re.search(r"\b" + re.escape(H.bez_dijakritika(k[0]).lower()), korpus))]
    if rez["citata_razlicitih"] == 0 and izvori:
        # tvrda ograda (kvar 156): nula prepoznatih citata uz pun popis nije nalaz o radu
        rez["izmjereno"] = False
        rez["razlog"] = (f"u tijelu rada nije prepoznat nijedan citat (stil: {nacin}) — popis "
                         f"necitiranih bio bi nalaz o čitaču, ne o radu; provjeri kako rad citira")
        rez["necitirani"], rez["bez_izvora"] = [], []
    return rez

# ------------------------------------------------------------------- ispis

def mn(n, jednina, dvojina, mnozina):
    """Hrvatska sročnost uz broj: 1 jedinica · 2 jedinice · 5 jedinica."""
    z, d = n % 10, n % 100
    if 11 <= d <= 14:
        return mnozina
    return jednina if z == 1 else (dvojina if z in (2, 3, 4) else mnozina)


def skrati(s, n):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[:n - 1] + "…"


# ------------------------------------------------------- minimalan broj izvora

def procitaj_izvori_min(put_profila, tip):
    """Vrati (minimum|None, tip, izvor_pravila) iz profila fakulteta.

    Q9: `struktura.opseg.<tip>.izvori_min` deklariran je u profilima fakulteta i
    schema-validiran, a nijedna skripta ga dosad nije čitala — iako ga
    references/predaja.md navodi kao blokirajuću stavku preflighta.
    """
    try:
        with open(put_profila, encoding="utf-8") as f:
            profil = json.load(f)
    except (OSError, ValueError) as e:
        raise GreskaUlaza(
            f"profil se ne može pročitati ({put_profila}): {e}\n"
            f"   Što napraviti: daj putanju do references/fakulteti/<slug>.json ili "
            f"do .katedra/resolved_profile.json.")
    if not isinstance(profil, dict):
        raise GreskaUlaza(f"profil nije JSON objekt ({put_profila}).\n"
                          f"   Što napraviti: daj profil fakulteta, ne popis ili niz.")
    opseg = (profil.get("struktura") or {}).get("opseg") or {}
    if not isinstance(opseg, dict) or not opseg:
        raise GreskaUlaza(
            f"profil nema struktura.opseg ({put_profila}).\n"
            f"   Što napraviti: provjeri da si dao profil fakulteta, a ne neki drugi JSON.")
    if not tip:
        if len(opseg) == 1:
            tip = next(iter(opseg))
        else:
            raise GreskaUlaza(
                "profil definira više vrsta rada pa se ne zna koji minimum vrijedi.\n"
                "   Što napraviti: dodaj --tip jednu od: " + ", ".join(sorted(opseg)))
    pravila = opseg.get(tip)
    if not isinstance(pravila, dict):
        raise GreskaUlaza(
            f"profil nema opseg za vrstu rada „{tip}\".\n"
            f"   Što napraviti: dodaj --tip jednu od: " + ", ".join(sorted(opseg)))
    minimum = pravila.get("izvori_min")
    if minimum is not None and not isinstance(minimum, int):
        minimum = None
    izvor_pravila = (profil.get("izvor") or {}).get("dokument") \
        or f"profil {os.path.basename(put_profila)} (bez navedenog izvora)"
    return minimum, tip, izvor_pravila


def spremi_json(put, podaci):
    os.makedirs(os.path.dirname(os.path.abspath(put)) or ".", exist_ok=True)
    tmp = put + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(podaci, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, put)


# --------------------------------------------- zahtjevi za čovjeka (kvar 38)

HITNO, RUCNO = "HITNO", "PROVJERI RUČNO"

# Redoslijed je namjeran i on je cijela logika ove zastavice: DOI je najjeftiniji
# put do odgovora (jedan klik — razriješi se ili ne), URL je sljedeći (adresa
# odgovara, sadržaj se i dalje gleda okom), a jedinica bez oba traži katalog ili
# mentora. Alat NE zna postoji li izvor — zna samo da ga on nije našao, pa radnja
# nikad ne glasi „makni izvor", nego „pogledaj ondje gdje ovaj alat ne gleda".
KATALOZI = ("katalogu NSK (katalog.nsk.hr)", "Hrčku (hrcak.srce.hr)",
            "CroRIS-u (croris.hr)")


def radnja_za_izvor(zapis):
    """(oznaka, radnja) za jedan izvor koji nije `verified`.

    Vraća konkretnu sljedeću kretnju, ne dijagnozu. Do ove zastavice izvještaj je
    za ⚠️/⏸ ispisivao simbol i obrazloženje pa stao — student je ostajao s „nije
    potvrđeno" i bez ijedne radnje, a takav se nalaz u praksi preskače.
    """
    ver = zapis["verification"]
    oznaka = HITNO if ver["status"] in (CONFLICT, INVALID) else RUCNO

    if zapis.get("doi"):
        radnja = (f"otvori https://doi.org/{zapis['doi']} — ako se razriješi, prepiši autora, "
                  f"godinu i naslov s te stranice u popis; ako ne, DOI je krivo prepisan i "
                  f"traži se točan (DOI se ne pogađa).")
    elif zapis.get("url"):
        radnja = (f"otvori {zapis['url']} i provjeri je li na toj adresi baš ova jedinica. "
                  f"Adresa koja odgovara nije dokaz o sadržaju — poslužitelj koji na "
                  f"nepostojeću stranicu vraća 200 ovdje izgleda uredno.")
    else:
        radnja = ("jedinica nema ni DOI ni URL, pa je stroj nema gdje provjeriti: potraži je u "
                  + ", ".join(KATALOZI) + ". Ako je nema ni ondje, pitaj mentora je li "
                  "bibliografski redak točno prepisan iz jedinice koju si držao u ruci.")

    if zapis["status"] == NEDOSTUPNO:
        radnja = ("prvo ponovi provjeru — ⏸ je nalaz o mreži, ne o izvoru. Ako i drugi put "
                  "bude ⏸: " + radnja)
    if ver["status"] == CONFLICT:
        radnja = ("razriješi koja je bibliografska jedinica točna prije nego išta drugo — "
                  "dok sukob stoji, izvor ne ulazi u rad. " + radnja)
    if ver["status"] == INVALID:
        radnja = ("izvor je nevaljan i ne ulazi u rad dok se ne ispravi ili zamijeni. "
                  + radnja)
    return oznaka, radnja


def zahtjevi_covjeka(izvori):
    """Izvori koji NISU `verified`, svaki sa svojom sljedećom radnjom."""
    stavke = []
    for z in izvori:
        if z["verification"]["status"] == VERIFIED:
            continue
        oznaka, radnja = radnja_za_izvor(z)
        stavke.append({
            "oznaka": oznaka,
            "source_id": z.get("source_id"),
            "autor": z.get("autor") or "—",
            "godina": z.get("godina") or "—",
            "naslov": z.get("naslov") or z.get("unos") or "—",
            "status": z["status"],
            "semantic": z["verification"]["status"],
            "razlog": z.get("obrazlozenje") or z["verification"].get("reason") or "—",
            "radnja": radnja,
        })
    return stavke


def zapisi_zahtjeve(put, datoteka, stavke, ukupno, lokatorski=0):
    """Checklista koju čovjek otvori i odradi redak po redak.

    Markdown, a ne JSON, jer je adresat student: popis se prepisuje u tablicu
    „RUČNO PROVJERI" (SKILL.md, pravilo 7) i nosi se mentoru.
    """
    hitni = [s for s in stavke if s["oznaka"] == HITNO]
    rucni = [s for s in stavke if s["oznaka"] == RUCNO]

    r = []
    r.append("# RUČNO PROVJERI — izvori")
    r.append("")
    r.append(f"Popis: `{os.path.basename(datoteka)}` · {len(stavke)} od {ukupno} "
             f"{mn(ukupno, 'izvora', 'izvora', 'izvora')} nije potvrđeno strojno.")
    r.append("")
    r.append("> `verify_sources.py` odgovara samo na „može li se ovo naći\". `unverified` nije")
    r.append("> optužba: hrvatske knjige, zbornici i fakultetska izdanja rijetko su u Crossrefu.")
    r.append("> Zato ovdje ne piše „makni izvor\" nego gdje pogledati — ondje gdje alat ne gleda.")
    if lokatorski:
        r.append(">")
        r.append(f"> Uz ovo: {lokatorski} strojno potvrđenih izvora prošlo je samo na razini")
        r.append("> adrese (scope: locator). Ti ovdje nisu, ali „adresa odgovara\" nije")
        r.append("> „jedinica je ondje\".")
    r.append("")

    if not stavke:
        r.append("✅ Svaki izvor s popisa potvrđen je strojno — nema ručnih provjera.")
        r.append("")
    for naslov, skupina, uvod in (
            ("HITNO — blokira predaju", hitni,
             "Sukob ili nevaljan izvor. Rad se ne predaje dok ovo stoji."),
            ("PROVJERI RUČNO — ne blokira, ali ulazi u tablicu", rucni,
             "Alat nije mogao potvrditi jedinicu. To nije isto što i „ne postoji\".")):
        if not skupina:
            continue
        r.append(f"## {naslov} ({len(skupina)})")
        r.append("")
        r.append(uvod)
        r.append("")
        for s in skupina:
            r.append(f"- [ ] **{s['oznaka']}** · {s['autor']} ({s['godina']}) — {s['naslov']}")
            r.append(f"      - stanje: {s['status']} `{s['semantic']}` · {s['razlog']}")
            r.append(f"      - radnja: {s['radnja']}")
            if s["source_id"]:
                r.append(f"      - source_id: `{s['source_id']}`")
            r.append("")

    r.append("---")
    r.append("")
    r.append("Kad redak dobije odgovor, upiši ga u popis literature i ponovi provjeru.")
    r.append("Redak koji ostane bez odgovora ide mentoru kao pitanje, ne u rad kao tvrdnja.")
    r.append("")

    os.makedirs(os.path.dirname(os.path.abspath(put)) or ".", exist_ok=True)
    tmp = put + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("\n".join(r))
    os.replace(tmp, put)


def main():
    ap = argparse.ArgumentParser(
        description="Provjera postoje li izvori s popisa (Crossref / Hrčak / HTTP).")
    ap.add_argument("datoteka", help="popis izvora (.md/.txt) ili rad (.docx)")
    ap.add_argument("--popis-od", metavar="NASLOV",
                    help="naslov iza kojeg počinje popis izvora (npr. \"POPIS IZVORA\")")
    ap.add_argument("--offline", action="store_true",
                    help="bez mreže: samo formalna provjera i abecedni red")
    ap.add_argument("--pokrivenost", action="store_true",
                    help="citirano u tekstu vs. popis izvora (heuristika)")
    ap.add_argument("--json", dest="json_out", metavar="PUT",
                    help="zapiši rezultate u JSON")
    ap.add_argument("--discovered-via", metavar="KANAL",
                    help="discovery kanal (npr. Google Scholar); nije bibliografski izvor")
    # Q9: profil fakulteta propisuje struktura.opseg.<tip>.izvori_min; do sada
    # ga nijedna skripta nije čitala.
    ap.add_argument("--profil", metavar="PUT",
                    help="profil fakulteta (JSON) — provjeri minimalan broj izvora")
    ap.add_argument("--tip", metavar="TIP",
                    help="vrsta rada za --profil (seminarski/zavrsni/diplomski)")
    # kvar 38: ⚠️/⏸ bez naredne kretnje je nalaz koji se u praksi preskače.
    ap.add_argument("--zahtjevi-covjeka", dest="zahtjevi", metavar="PUT",
                    help="zapiši checklistu ručnih provjera za izvore koji nisu potvrđeni")
    a = ap.parse_args()

    if not os.path.isfile(a.datoteka):
        print(f"❌ nema datoteke: {a.datoteka}\n"
              f"   Što napraviti: provjeri putanju; skripta se pokreće iz mape scripts/, "
              f"pa je rad obično ./rad.docx", file=sys.stderr)
        return 2

    try:
        izvori_red, upozorenje = procitaj_popis(a.datoteka, a.popis_od)
    except GreskaUlaza as e:
        print(f"❌ {e}", file=sys.stderr)
        return 2
    if not izvori_red:
        print("❌ u datoteci nije pronađen nijedan izvor.\n"
              "   Što napraviti: ako je popis u .docx-u, dodaj --popis-od \"POPIS IZVORA\" "
              "(ili točan naslov iz dokumenta). Ako je u .md-u, provjeri je li svaki izvor "
              "u svom retku.", file=sys.stderr)
        return 2
    izvori = [rastavi(r) for r in izvori_red]

    print("=" * 78)
    print(f"IZVORI — {os.path.basename(a.datoteka)}  ({len(izvori)} "
          f"{mn(len(izvori), 'jedinica', 'jedinice', 'jedinica')}"
          f"{', offline' if a.offline else ''})")
    print("=" * 78)
    if upozorenje:
        print(f"⚠️  {upozorenje}\n")

    brojac = {POTVRDEN: 0, NEPOTVRDEN: 0, NEPOSTOJI: 0, NEDOSTUPNO: 0, SUKOB: 0}
    semantic = {VERIFIED: 0, UNVERIFIED: 0, CONFLICT: 0, INVALID: 0}
    provjereni = []
    for iz in izvori:
        try:
            zapis = provjeri_izvor(iz, offline=a.offline, discovered_via=a.discovered_via)
        except Exception as e:
            # v1.1-advisory patch (Q7c): jedan neispravan odgovor providera ne
            # smije srušiti izvještaj o 60 izvora nasred popisa.
            razlog = (f"provjera ovog izvora nije uspjela ({type(e).__name__}) — ostali "
                      f"izvori su provjereni. Što napraviti: provjeri ovaj izvor ručno "
                      f"(DOI, Hrčak, katalog NSK).")
            ver = verification_record(UNVERIFIED, provider="verify_sources",
                                      availability="unavailable", reason=razlog,
                                      scope="identity")
            zapis = dict(iz)
            zapis.update({
                "source_id": stable_source_id(iz),
                "discovered_via": normalize_discovery_channel(a.discovered_via),
                "status": NEDOSTUPNO,
                "obrazlozenje": razlog,
                "verification": ver,
                "source_entity": {"kind": "bibliographic_source", "type": "unknown"},
                "quality": classify_quality("unknown", UNVERIFIED),
                "blocking": False,
            })
        provjereni.append(zapis)
        st, obraz = zapis["status"], zapis["obrazlozenje"]
        brojac[st] += 1
        semantic[zapis["verification"]["status"]] += 1
        print(f"{st}  {skrati(zapis['autor'], 28):<28} {zapis['godina'] or '—':<6} "
              f"{skrati(zapis['naslov'], 40)}")
        print(f"     {obraz}")
        q = zapis["quality"]
        if q["class"]:
            print(f"     kvaliteta {q['class']} · {QUALITY_TAXONOMY[q['class']]}")
    izvori = provjereni

    print()
    lose = abecedni_red(izvori)
    if lose:
        print(f"⚠️  abecedni red (hrvatska abeceda C < Č < Ć, S < Š, Z < Ž, D < Đ): "
              f"{len(lose)} {mn(len(lose), 'mjesto', 'mjesta', 'mjesta')}")
        for prije, poslije in lose[:5]:
            print(f"     „{skrati(prije, 30)}\" stoji ispred „{skrati(poslije, 30)}\"")
    else:
        print("✅ abecedni red popisa je ispravan po hrvatskoj abecedi")

    # Q9: minimalan broj izvora iz profila fakulteta (predaja.md, blokirajuće)
    min_nalaz = None
    if a.profil:
        print()
        try:
            minimum, tip_rada, izvor_pravila = procitaj_izvori_min(a.profil, a.tip)
        except GreskaUlaza as e:
            print(f"❌ {e}", file=sys.stderr)
            return 2
        if minimum is None:
            print(f"⚠️  profil ne propisuje izvori_min za „{tip_rada}\" — broj izvora "
                  f"({len(izvori)}) nije provjeren")
        else:
            manjak = minimum - len(izvori)
            min_nalaz = {"tip": tip_rada, "izvori_min": minimum,
                         "nadjeno": len(izvori), "zadovoljeno": manjak <= 0,
                         "izvor_pravila": izvor_pravila}
            if manjak > 0:
                print(f"❌ minimalan broj izvora za „{tip_rada}\": traženo {minimum}, "
                      f"nađeno {len(izvori)}")
                print(f"     Što napraviti: dodaj još {manjak} "
                      f"{mn(manjak, 'izvor', 'izvora', 'izvora')} i tek onda predaj rad.")
            else:
                print(f"✅ broj izvora ({len(izvori)}) zadovoljava minimum za "
                      f"„{tip_rada}\" ({minimum})")
            print(f"     izvor pravila: {izvor_pravila}")

    pokr = None
    if a.pokrivenost:
        print()
        stil_profila = None
        if a.profil:
            try:
                stil_profila = C.load_style_from_profile(a.profil)
            except Exception:  # noqa: BLE001 — profil bez stila: čitaj iz teksta
                stil_profila = None
        pokr = pokrivenost(a.datoteka, izvori, stil=stil_profila)
        if pokr is None:
            print("⚠️  pokrivenost se ne može izračunati: u datoteci nema proznog tijela "
                  "(daj .docx s radom, ne samo popis literature).")
        elif not pokr["izmjereno"]:
            print(f"⚠️  POKRIVENOST NIJE IZMJERENA: {pokr['razlog']}")
        else:
            print(f"POKRIVENOST — stil {pokr['stil']}, {pokr['citata_razlicitih']} različitih citata "
                  "(heuristika: višečlana prezimena i „i sur.\" mogu dati lažne nalaze; sklonidba se "
                  "svodi na korijen — svaki redak provjeri okom)")
            if pokr["necitirani"]:
                print(f"  ⚠️  na popisu, a nigdje citirano ({len(pokr['necitirani'])}):")
                for iz in pokr["necitirani"]:
                    print(f"      {skrati(iz['autor'], 30)} {iz['godina'] or '—'}")
            if pokr["bez_izvora"]:
                print(f"  ❌ citirano u tekstu, a nema ga na popisu ({len(pokr['bez_izvora'])}):")
                for prez, god in pokr["bez_izvora"]:
                    print(f"      [{prez}]" if pokr["stil"] == "numericki" else f"      ({prez.capitalize()}, {god}.)")
            if not pokr["necitirani"] and not pokr["bez_izvora"]:
                print("  ✅ svaki izvor je citiran i svaki citat ima izvor")

    print()
    print(f"SAŽETAK  ✅ potvrđen {brojac[POTVRDEN]} · ⚠️ nije potvrđen {brojac[NEPOTVRDEN]} "
          f"· 🟠 sukob {brojac[SUKOB]} · ❌ ne postoji/nevaljan {brojac[NEPOSTOJI]} "
          f"· ⏸ nedostupno {brojac[NEDOSTUPNO]}")
    print(f"         semantic: verified {semantic[VERIFIED]} · unverified {semantic[UNVERIFIED]} "
          f"· conflict {semantic[CONFLICT]} · invalid {semantic[INVALID]}")
    # Q7: „✅" iza HTTP provjere znači samo da adresa odgovara, ne da je na njoj
    # citirana jedinica. Ta razlika stoji u `verification.scope` svakog zapisa,
    # ali se u zbroju gubila — a poslužitelj koji na nepostojeću stranicu vraća
    # 200 umjesto 404 ovdje izgleda jednako uredno kao razriješen DOI.
    lokatorski = sum(1 for z in izvori
                     if z["verification"]["status"] == VERIFIED
                     and z["verification"].get("scope") == "locator")
    if lokatorski:
        print(f"         od toga {lokatorski} "
              f"{mn(lokatorski, 'izvor potvrđen', 'izvora potvrđena', 'izvora potvrđeno')} "
              f"samo na razini adrese (scope: locator) — URL odgovara, ali time nije "
              f"provjereno da je na njemu baš citirana jedinica.")
    if brojac[NEDOSTUPNO]:
        print("         ⏸ nije nalaz o izvoru nego o mreži — ponovi provjeru poslije.")
    if brojac[NEPOTVRDEN]:
        print("         ⚠️ ne znači „ne postoji\": hrvatske knjige, zbornici i fakultetska "
              "izdanja rijetko su u Crossrefu. Provjeri ručno (Hrčak, katalog NSK).")
    if brojac[SUKOB]:
        print("         🟠 conflict blokira izvor dok se ne razriješi koja je bibliografska jedinica točna.")
    if brojac[NEPOSTOJI]:
        print("         ❌ invalid izvor ne ulazi u rad dok se ne ispravi ili zamijeni.")

    if a.zahtjevi:
        print()
        stavke = zahtjevi_covjeka(izvori)
        zapisi_zahtjeve(a.zahtjevi, a.datoteka, stavke, len(izvori), lokatorski)
        print(f"[zahtjevi za čovjeka → {a.zahtjevi}] {len(stavke)} "
              f"{mn(len(stavke), 'izvor traži', 'izvora traže', 'izvora traži')} "
              f"ručnu provjeru")

    if a.json_out:
        spremi_json(a.json_out, {
            "schema_version": 1,
            "alat": "verify_sources",
            "napomena": "verification.status je stabilni semantic contract; legacy status simbol ostaje radi prikaza",
            "datoteka": os.path.abspath(a.datoteka),
            "offline": a.offline,
            "izvori": izvori,
            "abecedni_red_greske": [{"prije": p, "poslije": q} for p, q in lose],
            "pokrivenost": (None if not pokr else {
                "stil": pokr["stil"],
                "izmjereno": pokr["izmjereno"],
                "razlog": pokr["razlog"],
                "citata_razlicitih": pokr["citata_razlicitih"],
                "necitirani": [i["unos"] for i in pokr["necitirani"]],
                "bez_izvora": [f"{p} {g}" for p, g in pokr["bez_izvora"]],
            }),
            "sazetak": {"potvrden": brojac[POTVRDEN], "nije_potvrden": brojac[NEPOTVRDEN],
                        "sukob": brojac[SUKOB], "ne_postoji": brojac[NEPOSTOJI],
                        "nedostupno": brojac[NEDOSTUPNO]},
            "semantic_summary": semantic,
            "quality_taxonomy": QUALITY_TAXONOMY,
            "izvori_min": min_nalaz,
        })
        print(f"[izvori → {a.json_out}]")

    if semantic[CONFLICT] or semantic[INVALID]:
        return 1
    if pokr and pokr["bez_izvora"]:
        return 1
    # Q9: manjak izvora je blokirajući nalaz preflighta (references/predaja.md)
    if min_nalaz and not min_nalaz["zadovoljeno"]:
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        # ispis presječen (npr. `| head`) — to nije greška, samo tiho izađi
        os._exit(0)
    except KeyboardInterrupt:
        sys.exit(130)
