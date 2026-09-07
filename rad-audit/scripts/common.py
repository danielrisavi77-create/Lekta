"""Zajedničke funkcije za audit skripte. Ovisi samo o python-docx (+ standardna lib)."""
import re
import sys
import zipfile
import html


def die(msg):
    print(msg, file=sys.stderr)
    sys.exit(1)


def load_docx_text(path, include_tables=True):
    """Vrati čist tekst rada (odlomci + opcionalno ćelije tablica) preko python-docx.
    NE koristi regex po XML-u (povlači markup)."""
    try:
        from docx import Document
    except ImportError:
        die("Treba python-docx:  pip install python-docx --break-system-packages")
    d = Document(path)
    paras = [p.text for p in d.paragraphs]
    cells = []
    if include_tables:
        for t in d.tables:
            for row in t.rows:
                for c in row.cells:
                    cells.append(c.text)
    return "\n".join(paras), cells, d


def read_document_xml(path):
    """Sirovi word/document.xml (za provjeru polja, prijeloma, stilova)."""
    with zipfile.ZipFile(path) as z:
        return z.read("word/document.xml").decode("utf-8")


def read_part(path, part):
    with zipfile.ZipFile(path) as z:
        try:
            return z.read(part).decode("utf-8")
        except KeyError:
            return ""


_W_T_RE = re.compile(r"<w:t\b[^>]*>(.*?)</w:t>", re.S)


def _text_from_part_xml(xml):
    if not xml:
        return ""
    return "".join(html.unescape(m) for m in _W_T_RE.findall(xml))


def load_supplementary_text(path):
    """Tekst iz fusnota/endnota/headera/footera — python-docx .paragraphs ih NE
    pokriva, pa citiranje u fusnotama (Chicago stil) i brojke u zaglavljima/podnožjima
    ostaju nevidljive ostatku audita ako se ovo ne doda posebno.

    Vraća dict: {'footnotes': str, 'endnotes': str, 'headers': str, 'footers': str}
    (svaki str je spljošteni tekst iz odgovarajućih XML dijelova, prazan ako dio ne postoji)."""
    out = {"footnotes": "", "endnotes": "", "headers": "", "footers": ""}
    try:
        with zipfile.ZipFile(path) as z:
            names = z.namelist()

            def read(part):
                try:
                    return z.read(part).decode("utf-8")
                except KeyError:
                    return ""

            out["footnotes"] = _text_from_part_xml(read("word/footnotes.xml"))
            out["endnotes"] = _text_from_part_xml(read("word/endnotes.xml"))
            headers = sorted(n for n in names if re.match(r"word/header\d+\.xml$", n))
            footers = sorted(n for n in names if re.match(r"word/footer\d+\.xml$", n))
            out["headers"] = "\n".join(_text_from_part_xml(read(n)) for n in headers)
            out["footers"] = "\n".join(_text_from_part_xml(read(n)) for n in footers)
    except Exception:
        pass  # read-only pomoćna funkcija — ne rušimo audit ako dio nedostaje/je oštećen
    return out


ABBREVIATIONS = [
    "npr.", "tzv.", "d.o.o.", "j.d.o.o.", "god.", "str.", "sl.", "itd.", "itsl.",
    "tj.", "odn.", "br.", "prof.", "doc.", "dr.", "mr.", "sc.", "ing.", "vol.",
    "gl.", "\u010dl.", "st.", "sur.", "ur.", "izd.", "nakl.", "i.e.", "e.g.",
]
_ABBR_PLACEHOLDER = "\x01"  # sentinel koji se ne pojavljuje u normalnom tekstu

# Regex koji matcha kraticu SAMO kao samostalnu rije\u010d (ispred nje ne smije biti
# slovo) \u2014 obi\u010dan substring replace bi progutao to\u010dku na kraju svake rije\u010di
# koja ZAVR\u0160AVA kraticom: "nosivost." sadr\u017ei "st.". U hrvatskom su -ost imenice
# na kraju re\u010denice posvuda, pa bi statistika re\u010denica bila sustavno iskrivljena.
_ABBR_RE = re.compile(
    r"(?<![\w\u010d\u0107\u017e\u0161\u0111\u010c\u0106\u017d\u0160\u0110])("
    + "|".join(re.escape(ab) for ab in sorted(ABBREVIATIONS, key=len, reverse=True))
    + r")",
    re.IGNORECASE,
)



# v1.9.3: v. komentar u `sentences`.
_re_pravna_referenca = re.compile(
    r"(?i)\b(?:čl|st|t|toč|točk\w*|član\w*|stav\w*|alinej\w*|paragraf\w*"
    r"|odjelj\w*|redak|retku)\.?\s*\d+[a-z]?\.(?=\s+[A-ZČĆŽŠĐ])")


def _zastiti_u_zagradi(t):
    """Točka unutar otvorene zagrade nije kraj rečenice."""
    out, dubina = [], 0
    for ch in t:
        if ch == "(":
            dubina += 1
        elif ch == ")":
            dubina = max(0, dubina - 1)
        out.append(_ABBR_PLACEHOLDER if (ch == "." and dubina > 0) else ch)
    return "".join(out)


def sentences(text):
    """Grubo dijeljenje na re\u010denice (hr).

    Prije dijeljenja za\u0161titi uobi\u010dajene kratice (npr., tzv., d.o.o., god., str.\u2026)
    tako da njihova to\u010dka ne bude pogre\u0161no protuma\u010dena kao kraj re\u010denice.
    Kratica se \u0161titi samo kao samostalna rije\u010d (v. _ABBR_RE), ne kao sufiks
    ("nosivost." NIJE "st.")."""
    text = re.sub(r"\s+", " ", text)
    protected = _ABBR_RE.sub(lambda m: m.group(0).replace(".", _ABBR_PLACEHOLDER), text)
    # Dvije točke koje NISU kraj rečenice, a uzorak iznad ih ne hvata:
    # (1) redni broj iza najavne riječi pravne reference („prema članku 6. ZPD-a")
    #     — pravilo o kraticama gleda samu kraticu, ne broj iza nje;
    # (2) svaka točka unutar otvorene zagrade („(MRS 12, t. 24.)") — citatni
    #     lokator nikad ne završava rečenicu.
    # Bez toga je na radu iz poreznog računovodstva mjereno 280 rečenica umjesto
    # 193, medijan 18 umjesto 24 i „vrlo kratke (≤8): 71 (25 %)" umjesto 10 %,
    # pa je faza E prijavljivala staccato ritam kojega nema. Najkraća „rečenica"
    # u tom ispisu bila je `24.).`
    # (3) redni broj / datum ispred malog slova ili druge znamenke („od 1.
    #     siječnja 2026.", „NN 155/23, 151/25"). katedra-lite/hr_text.py to
    #     pravilo ima od početka; ovaj ga splitter nije imao, pa je datum
    #     lomio rečenicu na „…od 1." + „siječnja 2026.".
    protected = re.sub(r"(\d)\.(?=\s*[a-zčćžšđ(\d–—-])",
                       r"\1" + _ABBR_PLACEHOLDER, protected)
    protected = _re_pravna_referenca.sub(
        lambda m: m.group(0)[:-1] + _ABBR_PLACEHOLDER, protected)
    protected = _zastiti_u_zagradi(protected)
    parts = re.split(r"(?<=[\.\!\?])\s+", protected)
    parts = [p.replace(_ABBR_PLACEHOLDER, ".") for p in parts]
    return [s.strip() for s in parts if len(s.strip()) > 3]


# Kvar 79 (nađen na stvarnom radu, 5.9.2026.): popis literature se svugdje rezao
# kao „od naslova do KRAJA dokumenta". U radu koji iza literature ima Popis
# tablica, Popis grafikona, sažetak i summary — dakle u standardnoj FPZG
# strukturi — sve je to ulazilo u popis literature. Posljedice: redci popisa
# prikaza i rečenice sažetka brojali su se kao bibliografske jedinice, a
# `unmatched` brojač je rastao bez razloga.
#
# Popis literature završava na PRVOM sljedećem naslovu istoga ranga.
KRAJ_LITERATURE_RE = re.compile(
    r"(?im)^\s*(?:\d+\.?\s*)?"
    r"(?:POPIS\s+(?:TABLICA|GRAFIKONA|SLIKA|PRIKAZA|PRILOGA|KRATICA|SIMBOLA)"
    r"|PRILO(?:G|ZI)(?:\s+\d+)?"
    r"|SA[ŽZ]ETAK|SUMMARY|ABSTRACT|KLJU[ČC]NE\s+RIJE[ČC]I|KEYWORDS"
    r"|[ŽZ]IVOTOPIS|IZJAVA(?:\s+O\s+\w+)*|SADR[ŽZ]AJ)\s*:?\s*$"
)


def dio_literature(body: str) -> str:
    """Tekst popisa literature, omeđen s obje strane.

    Vraća prazan niz kad naslova popisa nema. Kraj je prvi sljedeći naslov
    istoga ranga (popis prikaza, prilozi, sažetak, izjava), ili kraj dokumenta.
    """
    m = list(LIT_HEADING_RE.finditer(body or ""))
    if not m:
        return ""
    pocetak = m[-1].end()
    kraj = len(body)
    k = KRAJ_LITERATURE_RE.search(body, pocetak)
    if k:
        kraj = k.start()
    return body[pocetak:kraj]


def parse_citation_group(inner):
    """'[19, 21]' / '[19–22]' -> set brojeva."""
    nums = set()
    for part in re.split(r",", inner):
        part = part.strip()
        rng = re.split(r"[–\-]", part)
        if len(rng) == 2 and rng[0].strip().isdigit() and rng[1].strip().isdigit():
            nums.update(range(int(rng[0]), int(rng[1]) + 1))
        elif part.isdigit():
            nums.add(int(part))
    return nums


# ---------------------------------------------------------------------------
# Autor-godina (APA/Harvard) citiranje — pored numeričkog IEEE [N] stila.
# ---------------------------------------------------------------------------

IEEE_CITE_RE = re.compile(r"\[\d{1,3}(?:[\s,–\-]+\d{1,3})*\]")

# ---------------------------------------------------------------------------
# Vancouver (N) — numerički citat u OVALNIM zagradama (biomedicina, ICMJE).
# Kvar koji ga je iznudio: HKS-FZS diplomski sa 132 navoda u obliku "(1)", "(12,40)"
# detektiran je kao unknown/0 citata, IEEE checker je javio "popis nije prepoznat",
# a autor-godina checker izmislio citat iz "Recommendation Rec(2003)24".
# Lažni kritični nalaz + svi stvarni citati neprovjereni.
#
# Zamke koje uzorak MORA izbjeći (sve nađene na stvarnom radu):
#   svezak(broj)   "53(3-4)", "106(12)"   → ispred zagrade je znamenka
#   decimala u tablici "158 (77,8)"       → ispred zagrade je znamenka + razmak
#   godina         "(2003)", "(2020)"     → broj > 999, nijedan rad nema 1000 referenci
#   raspon stranica u referenci "(1-56)"  → hvata se tek unutar popisa, ne u tijelu
# ---------------------------------------------------------------------------
VANCOUVER_CITE_RE = re.compile(r"(?<![\d])\((\d{1,3}(?:\s*[,;–\-]\s*\d{1,3})*)\)")


def find_vancouver_citations(text, u_tablici=False):
    """Vraća [(pozicija, [brojevi])] za Vancouver citate, redom pojavljivanja.

    `u_tablici=True` uključuje strožu zaštitu: u ćelijama tablica oblik
    "158 (77,8)" je n (%), ne citat. U prozi ista zaštita ubija STVARAN citat
    iza broja — "korelacija iznosi 0,53 (21)" — pa se ondje odbacuje samo
    zagrada zalijepljena uz znamenku ("53(3-4)" = svezak(broj)).
    """
    out = []
    for m in VANCOUVER_CITE_RE.finditer(text):
        prije = text[max(0, m.start() - 12):m.start()]
        if re.search(r"\d$", prije):                       # 53(3-4), 106(12)
            continue
        if u_tablici and re.search(r"\d\s+$", prije):      # 158 (77,8)
            continue
        nums = parse_citation_group(m.group(1))
        if not nums or any(n > 999 for n in nums):
            continue
        out.append((m.start(), sorted(nums)))
    return out


# Naslov popisa literature. Rječnik je bio preuzak: "POPIS CITIRANE LITERATURE"
# (HKS-FZS) i "Izvori i literatura" (FPZG, kvar R14) nisu prolazili, a kad naslov
# ne prođe, popis ostaje prazan i SVAKI citat ispada "citat bez reference".
LIT_HEADING_RE = re.compile(
    r"(?im)^\s*(?:\d+\.?\s*)?"
    r"(?:POPIS\s+)?(?:CITIRANE\s+|KORI[ŠS]TENE\s+|KORI[ŠS]TENIH\s+)?"
    r"(?:LITERATURA|LITERATURE|POPIS LITERATURE|REFERENCE|BIBLIOGRAFIJA"
    r"|POPIS IZVORA|IZVORI|IZVORI I LITERATURA|LITERATURA I IZVORI)\s*:?\s*$"
)


# Lokator stranice iza godine: "(Becker, 2007: 45)", "(Streeck, 2014: xiv)".
# FPZG Upute propisuju BAŠ taj oblik s dvotočkom. Bez njega ispada svaki citat sa
# stranicom — a to je citat koji je BOLJE napisan od golog — pa referenca postane
# „siroče" i izvještaj prijavi nepostojeće greške. Najgora vrsta kvara: alat
# kažnjava rad zato što je precizniji.
# Lokator stranice ima dva dijalekta: FPZG piše dvotočkom („Becker, 2007: 9"),
# a apa-hr zarezom i kraticom („Jurić, 2022, str. 170"). Uzorak je poznavao samo
# prvi, pa je u NARATIVNOM položaju („Šimović (2008, str. 6)") cijeli citat
# ispadao — zagradni ga je hvatao repnom klauzulom, narativni nije. Na jednom
# radu s pet narativnih i četiri zagradna citata siročad je bilo točno tih pet.
LOKATOR = (r"(?:\s*[:,]\s*(?:str\.|s\.|p\.|pp\.)?\s*"
           r"[\dxivlcdmXIVLCDM]+(?:\s*[-–]\s*[\dxivlcdmXIVLCDM]+)?)?")

# Parentetički citat s ", GODINA" (dopušta ; za više grupa u istoj zagradi).
# Poslije godine smije stajati kratka napomena („, za analizu"), a prije autora
# signalna riječ („usp."). Identitet ključa i dalje čine autor + godina.
# HR APA: točka iza godine je dopuštena — "(Čavlek i sur., 2011.)"
_AY_NAPOMENA = r"(?:\s*,\s*[^;()]{1,80})?"
CITE_AY_RE = re.compile(
    r"\(([^()]{2,160}?,\s*\d{4}\.?[a-z]?" + LOKATOR + _AY_NAPOMENA +
    r"(?:\s*;\s*[^()]{2,160}?,\s*\d{4}\.?[a-z]?" + LOKATOR + _AY_NAPOMENA + r")*)\)"
)

# Narativni citat: "Faulkner (2001.)", "Hall, Prayag i Amore (2018.)".
# U hrvatskim radovima čini VEĆINU citata; bez njega je brojanje besmisleno.
# Mora obuhvatiti i višečlana imena ("TUI AG", "UN Tourism",
# "Načinović Braje") te čestice ("van Heiningen") — inače se sidri na
# zadnju riječ i ključ ispadne "ag" umjesto "tui".
# Institucionalni autor nosi malu riječ u imenu („Europska komisija", „Hrvatska
# narodna banka", „Državni zavod za statistiku"). Uzorak je dopuštao samo velike
# riječi i čestice, pa je takav narativni citat ispadao, a njegov redak u popisu
# literature postajao lažno „siroče". Broj malih riječi je OGRANIČEN na dvije:
# bez granice bi „Analiza je provedena u razdoblju (2021.)" prošlo kao citat.
_MALA_RIJEC = r"[a-zčćžšđ][\wÀ-ɏ'’\-]+"
CITE_AY_NARRATIVE_RE = re.compile(
    r"\b([A-ZČĆŽŠĐ][\wÀ-ɏ'’\-]+"
    r"(?:[\s,]+(?:i|te|sur\.|suradnici|dr\.|van|von|de|del|di|da"
    r"|[A-ZČĆŽŠĐ][\wÀ-ɏ'’\-]+))*"
    r"(?:\s+" + _MALA_RIJEC + r"){0,2})"
    r"\s*\((\d{4})\.?([a-z]?)" + LOKATOR + r"\)"
)

# Čestice u prezimenu ("van der Zwan", "de Vries", "von Hayek"). Ključ se gradi od
# PRVE riječi koja nije čestica: "TUI AG" → "tui" (institucija, prva riječ nosi
# identitet), "Van der Zwan" → "zwan". Prije je pravilo bilo „uzmi prvu riječ", pa
# je isto prezime davalo „van" iz teksta i „zwan" iz popisa literature — dvije
# funkcije istog alata, dva ključa, i uredna referenca ispadne siroče.
CESTICE = {"van", "von", "de", "del", "della", "di", "da", "dos", "der", "den",
           "la", "le", "el", "al", "ten", "ter", "af", "av", "bin", "ibn", "mac"}

# Kvar 70: hrvatska rečenica koja uvodi narativni citat počinje velikim slovom
# na funkcijskoj riječi („Prema Kovačević (2019)"), pa je ključ autora ispadao
# „prema", a ne „kovačević". Citat je tada bio i lažno „bez reference" i
# istovremeno je pravi autor ostajao neuparen. Ove riječi nikad nisu prezime.
UVODNE_RIJECI = {
    "prema", "sukladno", "kako", "kao", "poput", "usporedi", "vidi", "npr",
    "primjerice", "slično", "slicno", "za", "uz", "kod", "po", "u", "na", "o",
    "iz", "sa", "s", "i", "te", "no", "dok", "ako", "jer", "iako", "budući",
    "buduci", "istraživanje", "istrazivanje", "studija", "analiza", "autor",
    "autori", "autorica", "rad", "radovi", "podaci", "rezultati", "tablica",
    "grafikon", "slika", "prilog", "poglavlje", "dio", "uvod", "zaključak",
    "zakljucak", "metodologija", "rasprava", "sažetak", "sazetak",
}


def kljuc_prezimena(ime, *, preskoci_uvodne=False):
    """Ključ autora iz imena: prva riječ koja nije čestica, mala slova.

    ``preskoci_uvodne`` dodatno preskače hrvatske uvodne riječi rečenice
    („Prema Kovačević" → „kovačević"). Koristi ga SAMO parser narativnih citata
    iz teksta; popis literature nikad ne počinje uvodnom riječju, pa se tamo ta
    grana ne uključuje da se ne izgubi institucionalni autor.
    """
    rijeci = [r for r in re.split(r"[\s,]+", (ime or "").strip()) if r]
    preskoci = CESTICE | UVODNE_RIJECI if preskoci_uvodne else CESTICE
    for r in rijeci:
        cista = r.strip(".").lower()
        if cista and cista not in preskoci:
            return cista
    # sve su riječi preskočive: vrati prvu koja nije čestica, pa makar bila uvodna
    for r in rijeci:
        cista = r.strip(".").lower()
        if cista and cista not in CESTICE:
            return cista
    return rijeci[0].strip(".").lower() if rijeci else ""


def parse_ay_narrative(text):
    """Skup (prvo_prezime, godina) iz narativnih citata."""
    out = set()
    # Kvar 68: uzorak je radio nad tekstom spojenim s "\n", a \s u njemu hvata
    # prijelom retka — pa je naslov „1. UVOD" iza kojega slijedi „Prema Beckeru
    # (2007: 45)" davao ključ ('uvod', '2007') i izvještaj ga je svrstavao u
    # KRITIČNO „citat bez reference". Narativni citat ne prelazi odlomak.
    for odlomak in text.split("\n"):
        for imena, god, sufiks in CITE_AY_NARRATIVE_RE.findall(odlomak):
            if _je_naslovni_redak(odlomak, imena):
                continue
            kljuc = kljuc_prezimena(imena, preskoci_uvodne=True)
            if not kljuc or kljuc in UVODNE_RIJECI:
                continue
            out.add((kljuc, (god + sufiks).lower()))
            # Kvar 76: institucionalni autor od više riječi („Notes from Poland")
            # u popisu daje ključ prve riječi (`notes`), a u tekstu je uvodna
            # riječ preskočena pa je ključ bio `poland`. Ista jedinica, dva
            # ključa, pa i lažno siroče i lažni citat bez reference. Za višečlano
            # ime dodaje se i ključ PRVE riječi, bez preskakanja.
            # Zakrpa za kvar 76 najprije je dodavala SVAKI sirovi ključ, pa je
            # „Prema Marković (2021)" opet davalo ključ `prema` — kvar 70 u novom
            # obliku. Sirovi ključ se dodaje samo ako prva riječ NIJE uvodna,
            # dakle samo za institucionalna imena („Notes from Poland").
            sirovi = kljuc_prezimena(imena)
            if sirovi and sirovi != kljuc and sirovi not in UVODNE_RIJECI:
                out.add((sirovi, (god + sufiks).lower()))
    return out



def _je_naslovni_redak(odlomak: str, imena: str) -> bool:
    """Je li „ime" zapravo naslov poglavlja koji stoji neposredno prije citata.

    Naslovi su kratki, bez glagola i često verzalom. Prezime uhvaćeno iz takvog
    retka nije autor nego naslov, i svaki takav ključ je lažni nalaz.
    """
    redak = odlomak.strip()
    if len(redak) > 120 and imena.upper() != imena:
        return False
    prvi = imena.strip()
    return prvi.isupper() and len(prvi.split()) <= 4


def parse_ay_segment(seg):
    """'Ivić i Perić, 2020a' -> ('ivić', '2020a'). None ako ne prepozna oblik."""
    # Sufiks (2013a / 2013b) je DIO identiteta jedinice: dva rada istog autora iz
    # iste godine inače se slijevaju u jedan ključ i jedan od njih uvijek ispadne
    # siroče. Narativni parser sufiks je zadržavao, zagradni ga je odbacivao — pa
    # su dvije funkcije istog alata davale različite ključeve za isti citat.
    # Lokator stranice iza godine ("Becker, 2007: 45") ovdje se prepoznaje i
    # odbacuje: on je oznaka mjesta u izvoru, ne dio identiteta.
    # Kvar 95: hrvatski izvor prikaza redovito glasi „(autorski sažetak prema:
    # Podobnik, 2026)" ili „(autorska analiza prema: Porter, 2008)". Uzorak je
    # skidao samo golo „prema" na početku, pa je ključ ispadao „autorski" i
    # svaki takav izvor prijavljivan kao citat bez reference.
    seg = re.sub(r"^.{0,60}?\bprema\s*:\s*", "", seg.strip(), flags=re.IGNORECASE)
    seg = re.sub(r"^(?:izvor|izrada|obrada|prilagođeno|prilagodeno|autorski|autorska|"
                 r"autorsko|vlastita|vlastiti)\b[^:]{0,40}:\s*", "", seg,
                 flags=re.IGNORECASE)
    seg = re.sub(r"^(?:usp\.|vidi|vidjeti|prema|cf\.)\s+", "", seg.strip(),
                 flags=re.IGNORECASE)
    m = re.match(r"\s*(.+?),\s*(\d{4})\.?([a-z]?)" + LOKATOR +
                 r"(?:\s*,\s*[^;()]{1,80})?\s*$", seg)
    if not m:
        return None
    author_part, year = m.group(1), m.group(2) + m.group(3)
    kljuc = kljuc_prezimena(author_part)
    if not kljuc or not kljuc[:1].isalpha():
        return None
    return (kljuc, year.lower())


def parse_ay_citation_group(inner):
    """Sadržaj cijele zagrade (može imati više '; '-odvojenih grupa) -> set (prezime, godina)."""
    keys = set()
    for seg in re.split(r"\s*;\s*", inner):
        k = parse_ay_segment(seg)
        if k:
            keys.add(k)
    return keys


# Kvar 91 (nađen na pravnom fixtureu): rad koji citira U FUSNOTAMA nema u tijelu
# ni [N] ni (N) ni (Prezime, godina), pa je detektor vraćao „unknown", a onda je
# generate_report svejedno puštao autor-godina provjeru. Ona je svaku jedinicu iz
# popisa proglasila SIROČETOM, jer citata u tijelu doista nema. Na pravnom radu s
# 12 fusnota to je 100 % lažnih kritičnih nalaza.
#
# Fusnotni citat prepoznaje se po vlastitom rječniku: ibid., op. cit., nav. dj.,
# loc. cit., supra, „bilj.", te po tome što jedinice stoje u fusnotama, ne u tekstu.
FOOTNOTE_CITE_RE = re.compile(
    r"(?i)\b(ibid\.?|op\.\s*cit\.?|nav\.\s*dj\.?|loc\.\s*cit\.?|cf\.|usp\.|"
    r"vidi\s+supra|supra\s*,?\s*bilj|bilj\.\s*\d+|infra\b|str\.\s*\d+)")


def detect_footnote_citing(footnote_text: str, body_text: str) -> bool:
    """Citira li rad u fusnotama, a ne u tijelu.

    Traži se dvoje istodobno: fusnote nose oznake fusnotnog aparata (ibid.,
    op. cit., str. N), a tijelo NEMA vlastitih oznaka citata. Jedno bez drugoga
    nije dovoljno: rad s autor-godina citiranjem smije imati i pokoju fusnotu.
    """
    if not footnote_text or len(footnote_text.strip()) < 40:
        return False
    aparat = len(FOOTNOTE_CITE_RE.findall(footnote_text))
    if aparat < 2:
        return False
    # Narativni citat („Prema Marković (2021)") mora se brojati jednako kao
    # zagradni: prvi test ove funkcije pao je upravo zato što ga nije brojala,
    # pa je rad s tri autor-godina citata u tijelu izgledao kao fusnotni.
    u_tijelu = (len(IEEE_CITE_RE.findall(body_text))
                + len(find_vancouver_citations(body_text))
                + sum(len(parse_ay_citation_group(m))
                      for m in CITE_AY_RE.findall(body_text))
                + len(parse_ay_narrative(body_text)))
    return u_tijelu <= 1


def detect_citation_style(text):
    """Heuristička detekcija: 'ieee' ([N]), 'vancouver' ((N)), 'authoryear'
    (Prezime, GODINA), 'mixed' ili 'unknown'. Vraća (stil, brojači)."""
    ieee_n = len(IEEE_CITE_RE.findall(text))
    van_n = len(find_vancouver_citations(text))
    ay_n = sum(len(parse_ay_citation_group(m)) for m in CITE_AY_RE.findall(text))
    counts = {"ieee": ieee_n, "vancouver": van_n, "authoryear": ay_n}
    best = max(counts, key=lambda k: counts[k])
    if counts[best] == 0:
        return "unknown", counts
    drugi = max(v for k, v in counts.items() if k != best)
    if counts[best] >= drugi * 1.5:
        return best, counts
    return "mixed", counts