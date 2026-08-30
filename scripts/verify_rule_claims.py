"""
MEHANICKA provjera tvrdnji o pravilima - bez modela, bez prosudbe.

    python scripts/verify_rule_claims.py <claims.json>

Zasto postoji: tri agenta koja citaju isti tekst dijele iste sljepoce. Ako model sustavno procita
"od ruba barem 2.5 cm (do 3 cm)" kao margins=2.5, sva tri ce pogrijesiti jednako i slozno -
slaganje NIJE tocnost. Ove provjere su determinsticke i zato hvataju ono sto agentski pregled ne
moze: izmisljen citat, citat s krive stranice, i vrijednost koja se iz citata ne moze izvesti.

Sest provjera po tvrdnji:
  1. SIDRO   - citat se doslovno nalazi u tekstu NAVEDENE stranice (usporedba bez viska razmaka).
  2. IZVOD   - vrijednost se moze izvesti iz citata (broj/naziv se u njemu doista pojavljuje).
  3. KVALIFIKATOR - citat sadrzi rijec koja mijenja znacenje ("preporuceni", "barem", "do",
     "iznimno", "najmanje"). To NIJE greska nego zastavica: takva tvrdnja ide covjeku, jer odluka
     je li nesto obveza ili preporuka nije citanje nego politika bodovanja.
  4. DOKUMENT - dokument sam za sebe kaze da nije obvezujuci. Tada NIJEDNA njegova tvrdnja nije
     obveza, ma koliko pojedina recenica zvucala propisno.
  5. IZBOR - tvrdnja daje SKUP dopustenih vrijednosti ("11 ili 12 pt"), ne jednu ciljanu. Popravak
     bi tada srusio rad koji je ispravan po drugom clanu skupa.

Cetvrta provjera je dodana nakon izmjerene rupe koju prve tri ne mogu vidjeti (unizd): pet tvrdnji
proslo je 5/5 bez ijedne zastavice, jer recenice glase "Format rada je A4 (210 x 297 mm)." - prezent
indikativa, jaci od "treba". Ali isti dokument o SEBI kaze: "Predstavljaju samo jednu od vise
mogucnosti kako se pisu navedeni studentski radovi" i "preporucujemo postivanje ovih Uputa". Snaga
recenice ne moze nadjacati odricanje dokumenta. Provjera po citatu to strukturno ne vidi, jer je taj
odricaj na drugoj stranici.

Izlaz je presuda po tvrdnji; skript nikad ne mijenja podatke.
"""

from __future__ import annotations

import json
import os
import re
import sys
import unicodedata

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    print("PyMuPDF nije instaliran: pip install pymupdf", file=sys.stderr)
    raise SystemExit(1)

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

# Rijeci koje mijenjaju status tvrdnje iz obveze u nesto slabije ili uvjetovano.
#
# Dvije skupine, obje znace "ovo nije bezuvjetna obveza":
#   UBLAZAVANJE - preporuceni, barem, do 3, iznimno, u pravilu
#   UVJET       - ukoliko, ako se, ovisno o, po dogovoru s mentorom
#
# Uvjeti su dodani nakon sto je pilot pokazao rupu: "Ukoliko se koristi font Arial ... moze koristi
# i font velicine 11" proslo je BEZ zastavice, iako to pravilo vrijedi samo uz drugi font. Bodovano
# bezuvjetno, kaznjavalo bi rad koji je zapravo ispravan.
QUALIFIERS = re.compile(
    # `mo[žz]e` bez nastavka: treci put uhvacena ista rupa gledajuci sto je PROSLO. Prvo je
    # propusteno "moze koristi", pa "Ukoliko se koristi", pa "moze biti Times New Roman ILI Arial".
    # Uzak popis nastavaka uvijek propusti sljedecu varijantu, pa se hvata sam glagol.
    r"\b(preporu[čc]\w*|barem|najmanje|najvi[šs]e|do\s+\d|iznimno|mo[žz]e\w*"
    r"|po[žz]eljno|okvirno|obi[čc]no|u\s+pravilu|ukoliko|ako\s+se|u\s+slu[čc]aju|ovisno\s+o"
    r"|po\s+dogovoru|s\s+mentorom|ili\s+sli[čc]an|neka\s+bude|primjerice|npr\."
    # Orijentacija nije ublazavanje nego IZMJENA vrijednosti: "u polozenom formatu A4" je landscape,
    # dakle zamijenjene dimenzije, a ne isti A4. Provjera formata koja to ne razlikuje prijavila bi
    # sukladan kiparski rad kao neispravan. Izmjereno na alu-pravilnik-diplomski-2014, str. 7 i 9.
    r"|polo[žz]en\w*|uspravn\w*|landscape|portrait)\b",
    re.I,
)

# NAMJERNO NIJE kvalifikator: `treba` / `potrebno je`.
#
# To je srednja razina modaliteta i u hrvatskim fakultetskim uputama je NAJJACA formulacija koja se
# realno pojavljuje za oblikovanje (izmjereno: unidu "margine trebaju biti po 2,5 cm", uz upute koje
# je prihvatilo Fakultetsko vijece). Kad bi i `treba` slalo tvrdnju covjeku, covjek bi dobio sve i
# lanac ne bi imao svrhu. Razlika prema `mora`/`ne smije` biljezi se u `modality` polju tvrdnje, ne
# ovdje.

_page_cache: dict[tuple[str, int], str] = {}


def squash(text: str) -> str:
    """Normalizira razmake I Unicode oblik dijakritike.

    NFC nije kozmetika nego ispravak lazno negativnog nalaza: tekstualni sloj nekih PDF-ova mijesa
    slozeni i rastavljeni oblik (izmjereno u muza-pravilnik-zavrsetak-2025.pdf, gdje je "s" u
    "predlosku" zapisan kao s + U+030C, a ne kao U+0161). Bez normalizacije doslovno TOCAN citat ne
    nalazi se na stranici s koje je prepisan, pa verifikator odbacuje valjanu tvrdnju.
    """
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", text or "")).strip()


def page_text(rel_path: str, page: int) -> str:
    key = (rel_path, page)
    if key in _page_cache:
        return _page_cache[key]
    path = os.path.join(ROOT, rel_path.replace("/", os.sep))
    text = ""
    if os.path.exists(path):
        try:
            doc = fitz.open(path)
            if 1 <= page <= doc.page_count:
                text = doc[page - 1].get_text()
            doc.close()
        except Exception:
            text = ""
    _page_cache[key] = text
    return text


# --- 4. Odricaj na razini DOKUMENTA ----------------------------------------------------------
#
# Dokument koji o sebi kaze da je preporuka ne moze pojedinom recenicom propisati obvezu. Trazi se
# SUPOJAVLJIVANJE dvoje: samoreferenca na dokument (ove upute, ovaj naputak) i ublazavanje
# (preporucujemo, jedna od mogucnosti, nije obvezujuce). Sama rijec "preporucujemo" nije dovoljna,
# jer upute redovito preporucuju POJEDINOSTI ("preporucuje se koristiti Zotero") a da same nisu
# preporuka.
SELF_REFERENCE = re.compile(
    r"(ov\w{0,3}\s+(uput\w*|naput\w*|preporuk\w*|smjernic\w*)"
    r"|(uput\w*|naput\w*|smjernic\w*)\s+ov\w{0,3}\b"
    r"|predstavljaj\w*\s+samo)",
    re.I,
)
DOC_DISCLAIMER = re.compile(
    r"(preporu[čc]uj\w*|nisu?\s+obvez\w*|ne\s+obvez\w*|jedn\w*\s+od\s+(vi[šs]e\s+)?mogu[čć]nost\w*"
    r"|samo\s+prijedlog|neobvez\w*|informativn\w*\s+karakter)",
    re.I,
)
# Odricaj i samoreferenca moraju biti u ISTOJ recenici. Prozor od dvije recenice je isproban i
# ODBACEN jer je odmah dao lazno pozitivan nalaz: u pmf-biol uputama recenica "To se posebice
# preporucuje u slucajevima pitanja o prihvatljivosti same teme" preporucuje SAVJETOVANJE S
# MENTOROM, a samoreferenca je bila u susjednoj recenici o necem drugom. Time bi cetiri valjane
# odredbe bile srusene tudjom recenicom.
#
# Zato `predstavljaj\w*\s+samo` stoji u SELF_REFERENCE: to je anaforicki subjekt ("Upute ...
# Predstavljaju samo jednu od mogucnosti") koji drzi odricaj unutar jedne recenice, pa prozor nije
# potreban.
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")

# Odricaj se PONISTAVA ako isti dokument drugdje kaze da obvezuje. Izmjereno: vss-upute-zavrsni-2023
# nosi DOSLOVNO isti predlozak predgovora kao unizd-turizam ("Predstavljaju samo jednu od vise
# mogucnosti"), ali nastavlja "...duzni ste postivati ove Upute i svoje zavrsne radove pisati
# sukladno ovim Uputama", dok unizd na tom mjestu kaze "preporucujemo postivanje ovih Uputa". Isti
# tekst, suprotan zakljucak; bez ove provjere oba dobiju istu presudu.
BINDING_OVERRIDE = re.compile(
    r"(du[žz]n\w*\s+(ste|su|je)|obvez(n\w*\s+(ste|su|je)|uju|an\s+je)|sukladno\s+ov\w+\s+uput)",
    re.I,
)

# "u ovim uputama" je mjesna odredba ("ondje pise"), ne subjekt odricaja. Izmjereno na mefst, gdje
# "preporucuje se onaj koristen u ovim uputama" preporucuje STIL GRAFICKIH OZNAKA, a ne sam dokument.
LOCATIVE_SELF = re.compile(r"\bu\s+ov\w{0,3}\s+(uput\w*|naput\w*|smjernic\w*)", re.I)

_doc_cache: dict[str, object] = {}


def binding_override(doc) -> bool:
    """Kaze li dokument IGDJE da obvezuje. Trazi se po cijelom dokumentu, jer obvezujuca recenica i
    ublazavajuca redovito stoje u istom predgovoru, ali ne u istoj recenici."""
    for i in range(doc.page_count):
        if BINDING_OVERRIDE.search(squash(doc[i].get_text())):
            return True
    return False


def document_disclaimer(rel_path: str):
    """Prvi odricaj na razini dokumenta, ili None. Cita SVE stranice, ne samo onu iz citata."""
    if rel_path in _doc_cache:
        return _doc_cache[rel_path]
    found = None
    path = os.path.join(ROOT, rel_path.replace("/", os.sep))
    if os.path.exists(path):
        try:
            doc = fitz.open(path)
        except Exception:
            doc = None
        if doc is not None:
            try:
                # Racuna se JEDNOM po dokumentu. Prva izvedba zvala je binding_override unutar petlje
                # po recenicama, pa je svaki kandidat ponovno citao sve stranice; revizija od 1391
                # pravila time je postala nemjerljivo spora.
                binding = binding_override(doc)
                if binding:
                    return None  # dokument drugdje izricito kaze da obvezuje
                for page_index in range(doc.page_count):
                    text = squash(doc[page_index].get_text())
                    if not text:
                        continue
                    sentences = SENTENCE_SPLIT.split(text)
                    for sentence in sentences:
                        hedge = DOC_DISCLAIMER.search(sentence)
                        if not hedge:
                            continue
                        if LOCATIVE_SELF.search(sentence):
                            continue  # samoreferenca je mjesna odredba, ne subjekt
                        if SELF_REFERENCE.search(sentence):
                            found = {
                                "page": page_index + 1,
                                "phrase": hedge.group(0),
                                "sentence": sentence[:220],
                            }
                            break
                    if found:
                        break
            finally:
                doc.close()
    _doc_cache[rel_path] = found
    return found


def numeric_forms(raw) -> list[str]:
    """Zapisi istog broja koje hrvatski tekst legitimno koristi: 2.5, 2,5 i (za cijele) 2.

    Bez ovoga verifikator odbacuje ISPRAVNE tvrdnje: izmjereno na FER-u, citat pise "barem 2.5 cm",
    a trazio se samo oblik "2,5", pa je valjana tvrdnja pala kao neizvediva.
    """
    text = str(raw)
    forms = {text, text.replace(".", ","), text.replace(",", ".")}
    if text.endswith(".0"):
        forms.add(text[:-2])
    return [f for f in forms if f]


# --- 5. IZBOR umjesto ciljane vrijednosti -----------------------------------------------------
#
# "Velicina slova u tekstu treba biti 11 ili 12 pt" nije jedna ciljana vrijednost nego skup od dvije
# dopustene. Popravak koji postavi 12 pt srusio bi rad legitimno pisan u 11 pt. Zato takva tvrdnja
# ide covjeku: on odlucuje boduje li se kao clanstvo u skupu ili se ne boduje uopce.
#
# Za `font` je skup NORMALAN i ne oznacava se (efzg "Calibri ili Times New Roman", unidu "Times New
# Roman ili Arial"); provjera fonta vec radi nad popisom dopustenih.
#
# ISTO VRIJEDI ZA `font-size`, sto je do 2026-08-22 bilo krivo zapisano ovdje. Engine usporedjuje
# clanstvo u skupu (`profile.size.some(...)`) i tako i formulira poruku (`profile.size.join(' ili ')`),
# pa `value: [11, 12]` nije izbor jedne strane nego vjeran prijepis izvora koji dopusta oboje.
# Izmjereno na tri profila u `tests/font-size-allowed-set.test.ts`: 11 pt i 12 pt prolaze s punim
# bodovima, 13 pt pada. Premisa vrijedi samo za osi koje stvarno primaju JEDAN broj: prored
# (`near(x, profile.spacing)`) i margine (`profile.margins[side]`).
SINGLE_VALUED = ("line-spacing", "margins")

# Osi na kojima izbor i dalje trazi covjeka, i ondje gdje engine zna za skup: kad je izbor zapisan u
# CITATU ("11 ili 12"), a tvrdnja navodi samo jednu stranu, pravilo boduje uze od izvora i kaznjava
# rad koji tocno slijedi svoju uputu.
CHOICE_AXES = SINGLE_VALUED + ("font-size",)


CHOICE_PAIR = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:pt|to[čc]\w*|cm|mm)?\s+ili\s+(\d+(?:[.,]\d+)?)", re.I)


def _atoms(value) -> set[str]:
    """Svi brojcani oblici koje vrijednost pravila nosi, ukljucujuci margine po stranama."""
    if isinstance(value, dict):
        return {f for v in value.values() for f in _atoms(v)}
    if isinstance(value, list):
        return {f for v in value for f in _atoms(v)}
    if isinstance(value, bool) or value is None:
        return set()
    return set(numeric_forms(value))


def choice_narrows_claim(quote: str, value) -> bool:
    """Boduje li tvrdnja SAMO jednu stranu izbora koji izvor doslovno nudi.

    Sam izbor u recenici nije dovoljan: `unidu-komunikologija-diplomski` u istoj recenici propisuje
    tijelo na 12 tocaka i naslove na "14 ili 16 tocaka", pa je izbor ondje odredba DRUGE osi i nalaz
    je bio lazan na sva tri pravila te recenice. Nalaz ima smisla samo kad je vrijednost tvrdnje
    JEDNA strana izbora, a druga strana nije pokrivena.
    """
    atoms = _atoms(value)
    if not atoms:
        return False
    for left, right in CHOICE_PAIR.findall(quote):
        hit_left = bool({left, left.replace(".", ","), left.replace(",", ".")} & atoms)
        hit_right = bool({right, right.replace(".", ","), right.replace(",", ".")} & atoms)
        if hit_left != hit_right:
            return True
    return False


def is_choice(check_id: str, value, quote: str) -> bool:
    if check_id not in CHOICE_AXES:
        return False
    if isinstance(value, list) and len({str(v) for v in value}) > 1:
        # Skup je problem samo ondje gdje engine prima jedan broj.
        return check_id in SINGLE_VALUED
    # Izbor zapisan u samom citatu ("12 ili 14"), a tvrdnja navodi samo jednu stranu.
    return choice_narrows_claim(quote, value)


# --- 6. ODSJECEN CITAT koji krije iznimku -----------------------------------------------------
#
# Najopasniji nadjen razred: citat je doslovan, vrijednost je iz njega izvediva, nema kvalifikatora,
# a IPAK je pogresan - jer je prekinut tocno prije iznimke u istoj recenici.
#
# Izmjereno na unidu-komunikologija-upute-2025.pdf, str. 7, dva puta:
#   "velicina slova u tekstu (font size) treba biti 12 tocaka" [, DOK NASLOVI I PODNASLOVI TREBAJU
#    BITI NESTO VECI (14 ILI 16 TOCAKA)]
#   "prored (line spacing) treba biti 1,5 u glavnom tekstu rada" [, JEDNOSTRUKI (1) U BILJESKAMA]
# Bodovano kako je citirano, prvo bi oborilo svaki sukladan naslov, a drugo svaku sukladnu fusnotu.
#
# Pravilo je namjerno grubo i bez tumacenja: ako citat NE zavrsava na kraju recenice, a ostatak te
# iste recenice sadrzi znamenku, tvrdnja ide covjeku. Ne odlucuje je li ostatak doista iznimka - to
# je prosudba; odlucuje samo da je citat odsjecen ondje gdje jos ima brojeva.
SENTENCE_END = re.compile(r"[.!?](\s|$)")


def truncated_tail(rel_path: str, page: int, quote: str) -> str | None:
    """Ostatak recenice iza citata, ako taj ostatak jos nosi neku brojcanu vrijednost."""
    text = squash(page_text(rel_path, page))
    quote = squash(quote)
    if not quote or not text:
        return None
    # Citat koji i sam zavrsava na kraju recenice NIJE odsjecen. Bez ove grane provjera mjeri
    # SLJEDECU recenicu i lazno prijavljuje 24 od 33 tocne tvrdnje (izmjereno na akademijama).
    if quote[-1] in ".!?":
        return None
    index = text.find(quote)
    if index < 0:
        return None
    tail = text[index + len(quote) :]
    end = SENTENCE_END.search(tail)
    tail = tail[: end.start() + 1] if end else tail[:240]
    return tail.strip() if re.search(r"\d", tail) else None


# --- 7. IZVOD ZA PREDIKATNE OSI -----------------------------------------------------------------
#
# Do 2026-08-22 je `value_tokens` pokrivao pet osi (paper-size, font, font-size, line-spacing,
# margins), a za sve ostale vracao prazno, sto je postavljalo `derivable = False` i tvrdnja je
# MEHANICKI PADALA. Izmjereno: 628 od 1934 bodovanih pravila (32,5%) stoji na osi koja kroz ovaj
# verifikator nije mogla proci, i to ne zato sto je s njima nesto bilo, nego zato sto pravila izvoda
# nije bilo. Pad koji znaci "ne znam" je gori od nikakvog nalaza jer trosi ljudsku paznju na sum.
#
# Predikatne osi nisu broj nego TVRDNJA: citat ne mora sadrzavati vrijednost `true`, nego recenicu
# koja tu odredbu izrice. Zato imaju vlastiti oblik izvoda.
PREDICATE_TOKENS: dict[str, list[str]] = {
    # KORIJENI, ne cijele rijeci: hrvatski mijenja nastavak, a izvori nisu dosljedni. Prosireno
    # 2026-08-24 nakon mjerenja koje je 60 tvrdnji proglasilo neuporistenima; uzorak od 6 je pokazao
    # da su 3 bile promasaj RJECNIKA, ne podataka:
    #   - token "poravnan" nije hvatao "tekst poravnat s obje strane" (aspira, efst): jedno slovo,
    #   - "obrojcavanje stranica" (apuri) nije bilo ni u jednom obliku,
    #   - dijakritika se nije skidala, pa "obrojcavanje" nikad ne bi pogodilo ASCII token.
    # Gard koji vristi na tocnu tvrdnju jednako je beskoristan kao onaj koji suti.
    # Njemacki i opis PAKETA su ravnopravni oblici izvora: `ffri-germanistika` uputa je na njemackom
    # ("Blocksatz"), a `ffst` citat opisuje Word predlozak ("Footer: PAGE polje"). Oboje IZRICE
    # odredbu; da rjecnik pokriva samo hrvatsku prozu, tocna tvrdnja bi ispala neuporistena.
    # `footnote-justify` dijeli rjecnik s `justify`: odredba je ista, samo je opseg fusnota, a opseg
    # je vec u identitetu osi. Izvor koji je iznudio unos: "prored jednostruk s obostranim
    # poravnanjem" (biljeske na dnu stranice).
    "footnote-justify": [
        "obostran", "justify", "poravna", "poravnat", "blok", "obje strane", "blocksatz",
    ],
    # Numeriranje koje POCINJE od Uvoda. Tokeni su namjerno visesloznicni: goli "uvod" stoji u
    # gotovo svakoj uputi, pa bi jednorjecni token palio na necemu sto o numeraciji ne govori.
    "page-number-start-at-intro": [
        "prva stranica je stranica uvod", "prva stranica je uvod", "od uvoda", "pocevsi od uvoda",
        "pocinje s uvodom", "pocinje od uvoda", "uvod je prva numerirana",
    ],
    # Naslovnica (i njoj slicne stranice) BEZ broja. Odredba se u izvorima gotovo uvijek pise
    # nijecno ("ne numerirati"), pa rjecnik hvata negaciju, ne potvrdu.
    "page-number-title-suppression": [
        "ne numerirati", "ne numerira", "bez broja stranice", "ne oznacava se brojem",
        "ne oznacavaju se brojem", "se ne broji", "naslovna stranica se ne",
    ],
    "justify": [
        "obostran", "justify", "poravna", "poravnat", "blok", "obje strane", "objema margina",
        "blocksatz", "w:jc=both",
    ],
    "toc": ["sadrzaj", "kazalo", "table of contents", "inhaltsverzeichnis"],
    "page-numbers": [
        "numerir", "numerac", "paginac", "broj stranic", "brojevi stranic", "oznacene brojevima",
        "obrojcav", "brojcano", "oznacavaju stranic", "oznacene stranic", "stranice se oznac",
        "oznacene rednim brojem", "oznacen rednim brojem", "page polje", "seitenzahl",
    ],
    "footnote-font": ["fusnot", "biljesk", "podnozj"],
}


def predicate_hit(check_id: str, quote: str) -> bool:
    """Izrice li citat tu odredbu uopce. Namjerno grubo: dokazuje da se recenica bavi tom osi.

    Usporedjuje se BEZ DIJAKRITIKE na obje strane: draft citati su mijesani (dio je vec ASCII, dio
    nije), pa bi inace isti izvor prolazio ili padao ovisno o tome kako je prepisan.
    """
    low = fold(quote)
    return any(token in low for token in PREDICATE_TOKENS.get(check_id, []))


def range_tokens(value) -> list[list[str]]:
    """Za osi kojima je RASPON sama odredba (page-count, word-count): svaka granica mora se pojaviti."""
    if isinstance(value, dict):
        bounds = [v for k, v in sorted(value.items()) if k in ("min", "max", "target") and v is not None]
    elif isinstance(value, list):
        bounds = list(value)
    else:
        bounds = [value]
    return [numeric_forms(v) for v in bounds if v is not None]


COMPOSITE_AXES = {
    "bibliography-rules",
    "citation-sync-rules",
    "section-surgery-rules",
    "required-section-rules",
}


def fold(text: str) -> str:
    """Bez dijakritike, malim slovima. Citati u draftovima su miejsani: dio je vec ASCII."""
    stripped = unicodedata.normalize("NFD", text or "")
    return "".join(c for c in stripped if not unicodedata.combining(c)).lower()


def _word_group(word: str) -> list[str]:
    """Oblici jedne rijeci natpisa: KORIJEN s dijakritikom i bez nje.

    Korijen a ne cijela rijec jer hrvatski citat mijenja padez: propis kaze "Kljucne rijeci", a izvor
    "uz sazetak treba navesti i nekoliko kljucnih rijeci". Trazenje cijele rijeci ondje promasi
    TOCNU tvrdnju, sto je isti razred greske kao `paper-size` koji je ignorirao vrijednost.
    """
    stem_len = max(4, len(word) - 2)
    return sorted({word[:stem_len].lower(), fold(word)[:stem_len]})


def label_groups(label: str) -> list[list[str]]:
    """Natpis sekcije -> po jedna skupina za svaku ZNACAJNU rijec (>=4 znaka)."""
    words = [w for w in re.findall(r"\w+", label or "", flags=re.UNICODE) if len(w) >= 4]
    return [_word_group(w) for w in words]


# Snopovi pravila: objekt s vise odredbi, gdje svaki LIST mora imati vlastito sidro u citatu.
#
# Rjecnik je izveden iz STVARNIH citata koji te snopove nose, ne iz pretpostavke. Sva 44 bodovana
# pravila na ove cetiri osi dolaze iz jednog izvora (fpzg-upute-akademski-radovi) i svode se na 13
# listova, pa je svaki oblik ovdje prepisan iz recenice koja ga propisuje. List bez unosa vraca
# NEPROVJERIVO (prazan izlaz), nikad prolaz: izmisljen rjecnik bi "izveo" bilo koju vrijednost, sto
# je tocno kvar koji je `paper-size` vec jednom imao.
COMPOSITE_VOCABULARY: dict[tuple[str, str, str], list[str]] = {
    # "izvori redaju abecedno prema prezimenu autora"
    ("bibliography-rules", "sort", '"alphabetical"'): ["abeced"],
    # "treba ih razlikovati slovima (a, b, c itd) iza godine izdanja"
    ("bibliography-rules", "authorYearSuffixes", "true"): ["slovima (a", "iza godine"],
    # "bibliografskim jedinicama u obliku autor - godina"
    ("citation-sync-rules", "mode", '"author-year"'): ["autor - godina", "autor-godina", "autor – godina"],
    # "prethodni dijelovi numeriraju se rimskim brojkama"
    ("section-surgery-rules", "frontMatter.numbering", '"roman"'): ["rimsk"],
    # "Stranice rada se numeriraju, ali ne i naslovnice"
    ("section-surgery-rules", "frontMatter.removePageNumberFromTitlePage", "true"): [
        "ne i naslovnic",
        "osim naslovnic",
        "bez naslovnic",
    ],
    # "a osnovni tekst arapskima"
    ("section-surgery-rules", "mainMatter.numbering", '"decimal"'): ["arapsk", "decimaln"],
    # "tako da brojka 1 bude na prvoj stranici uvoda"
    ("section-surgery-rules", "mainMatter.startAt", "1"): ["brojka 1", "broj 1", "od 1"],
}


def _leaves(value, prefix: str = "") -> list[tuple[str, object]]:
    if isinstance(value, dict):
        out: list[tuple[str, object]] = []
        for key, sub in value.items():
            out.extend(_leaves(sub, f"{prefix}.{key}" if prefix else str(key)))
        return out
    if isinstance(value, list):
        out = []
        for item in value:
            out.extend(_leaves(item, f"{prefix}[]"))
        return out
    return [(prefix, value)]


def composite_tokens(check_id: str, value) -> list[list[str]]:
    """Snop pravila -> po jedna skupina za svaki list. Nepoznat list = NEPROVJERIVO, ne prolaz."""
    if not isinstance(value, dict):
        return []
    labels = value.get("labels") if isinstance(value.get("labels"), dict) else {}
    groups: list[list[str]] = []
    for path, leaf in _leaves(value):
        # `order[]` i `labels.X` govore o ISTOJ sekciji; sidro je natpis, pa se broji jednom.
        if path.startswith("order["):
            label = labels.get(leaf) if isinstance(leaf, str) else None
            if not label:
                return []  # sekcija bez natpisa: nema se sto traziti u citatu
            continue
        if path.startswith("labels."):
            found = label_groups(str(leaf))
            if not found:
                return []
            groups.extend(found)
            continue
        forms = COMPOSITE_VOCABULARY.get((check_id, path, json.dumps(leaf, ensure_ascii=False)))
        if forms is None:
            return []
        groups.append(forms)
    return groups


# Rjecnik za snop pravila o naslovima. Kljuc je (svojstvo, vrijednost), pa razina naslova ne
# umnaza unose: izvor koji trazi podebljanje na tri razine to izrice jednom.
# Vrijednost je LISTA SKUPINA: svaka skupina mora imati barem jedan pogodak. Dvije skupine za
# velika slova nisu pedanterija nego mjerenje: izvor pise "VELIKIM PODEBLJANIM slovima", pa
# jednorjecni token "velikim slov" promasi jer rijeci nisu susjedne. Jedan token "velikim" bi pak
# palio i na "velikim fontom", sto o velikim slovima ne govori nista. Dvije skupine traze i pojam
# velicine i pojam slova, pa prolazi samo ono sto stvarno govori o verzalu.
HEADING_VOCABULARY: dict[tuple[str, object], list[list[str]]] = {
    ("bold", True): [["podebljan", "bold", "masn", "boldan"]],
    ("italic", True): [["kurziv", "italic", "koso", "nakosen"]],
    ("uppercase", True): [
        ["velik", "verzal", "uppercase", "tiskan"],
        # VODECI RAZMAK NIJE SITNICA: goli "slov" je podniz rijeci "naslov", pa bi recenica
        # "naslovi se pisu velikim fontom" lazno potvrdila verzal. Izmjereno kontrolom ispod.
        [" slov", "verzal", "uppercase", "tiskan"],
    ],
    ("numberRequired", True): [["numerir", "broj"]],
    ("romanLevelOneAllowed", True): [["rimsk"]],
    # Tocka iza broja poglavlja ("2. Razrada"). Izvori to pisu i opisno i primjerom, pa se traze
    # oba oblika; `false` se NE izvodi jer izostanak tocke izvori gotovo nikad ne izricu.
    ("trailingDot", True): [["tocka", "tockom", "tocke", "1."]],
    ("align", "left"): [["lijev"]],
    ("align", "center"): [["centr", "sredin", "sredis"]],
    ("align", "justify"): [["obostran", "justify", "poravnat", "blok"]],
}

# Koliko razina naslova: izvori to pisu i brojkom i rijecju, pa se traze oba oblika.
HEADING_LEVEL_WORDS: dict[int, list[str]] = {
    1: ["1", "jedn", "prv"],
    2: ["2", "dvij", "drug"],
    3: ["3", "tri", "trec"],
    4: ["4", "cetiri", "cetvrt"],
    5: ["5", "pet"],
}


def heading_rules_tokens(value) -> list[list[str]]:
    """Snop pravila o naslovima -> po jedna skupina za svaku ODREDBU koju vrijednost izrice.

    Dvije odluke vrijedne biljeske:

    1. `false` NIJE odredba nego izostanak zahtjeva. Izvor koji o velikim slovima ne kaze nista
       proizvodi `uppercase: false`, a od citata se tada ne moze ni traziti dokaz. Takvi listovi se
       preskacu; ako vrijednost NEMA nijednu potvrdnu odredbu, izvod vraca prazno, sto znaci
       NEPROVJERIVO, ne prolaz. Bez toga bi profil sa samim `false` vrijednostima prolazio vakuumski.
    2. Nepoznato svojstvo obara cijeli izvod (deny-by-default), isto kao kod `composite_tokens`.
       Tiho preskakanje bi znacilo da tvrdnja prolazi na dijelu koji nitko nije provjerio.
    """
    if not isinstance(value, dict):
        return range_tokens(value)
    groups: list[list[str]] = []
    for key, leaf in value.items():
        if key == "levels":
            if not isinstance(leaf, dict):
                return []
            for _level, props in leaf.items():
                if not isinstance(props, dict):
                    return []
                for prop, pv in props.items():
                    if pv is False or pv is None:
                        continue
                    if prop == "size":
                        found = range_tokens(pv)
                        if not found:
                            return []
                        groups.extend(found)
                        continue
                    forms = HEADING_VOCABULARY.get((prop, pv))
                    if forms is None:
                        return []
                    groups.extend(forms)
            continue
        if key == "size":
            found = range_tokens(leaf)
            if not found:
                return []
            groups.extend(found)
            continue
        if key == "maxLevel":
            words = HEADING_LEVEL_WORDS.get(leaf if isinstance(leaf, int) else -1)
            if words is None:
                return []
            groups.append(words)
            continue
        if leaf is False or leaf is None:
            continue
        forms = HEADING_VOCABULARY.get((key, leaf))
        if forms is None:
            return []
        groups.extend(forms)
    return groups


def value_tokens(check_id: str, value) -> list[list[str]]:
    """Za svaki dio vrijednosti vraca DOPUSTENE zapise; svaki dio mora imati barem jedan pogodak."""
    if check_id == "paper-size":
        # "A-4" i "A 4" su isti format. Bez ovoga verifikator odbacuje TOCNU tvrdnju: izmjereno na
        # alu-okiru uputama, gdje citat glasi "Diplomski rad se pise u formatu A-4".
        #
        # ISPRAVAK 2026-08-22: prije se vrijednost IGNORIRALA i uvijek se trazio A4, pa bi se tvrdnja
        # `value: "A3"` "izvela" iz citata koji govori o A4. Sada se trazi naziv koji tvrdnja doista
        # nosi; boolean `true` i dalje znaci A4 (naslijedeno znacenje, vidi rule-compiler).
        names = value if isinstance(value, list) else [value]
        groups: list[list[str]] = []
        for name in names:
            if isinstance(name, bool) or name is None:
                groups.append(["A4", "A-4", "A 4"])
                continue
            text = str(name).upper().replace("-", "").replace(" ", "")
            groups.append([text, f"{text[:1]}-{text[1:]}", f"{text[:1]} {text[1:]}"])
        return groups or [["A4", "A-4", "A 4"]]
    if check_id == "font":
        return [[str(v)] for v in (value if isinstance(value, list) else [value])]
    if check_id in ("font-size", "line-spacing", "footnote-size", "footnote-spacing"):
        # ISPRAVAK 2026-08-22: prije se za listu gledao SAMO `value[0]`, pa drugi clan dopustenog
        # skupa ("11 ili 12") nikad nije bio usidren. Sada je dovoljno da se pojavi BILO KOJI clan:
        # skup je zapisan kao skup jer izvor dopusta oboje, pa citat ne mora navesti oba.
        raws = value if isinstance(value, list) else [value]
        forms: list[str] = []
        for raw in raws:
            forms.extend(numeric_forms(raw))
        return [forms] if forms else []
    if check_id == "margins":
        vals = list(value.values()) if isinstance(value, dict) else [value]
        # Jednake margine se u uputama navode JEDNOM ("2.5 cm sa svih strana"), pa se traze
        # razlicite vrijednosti, ne cetiri ponavljanja iste.
        unique = sorted({str(v) for v in vals if not isinstance(v, bool)})
        return [numeric_forms(v) for v in unique]
    if check_id in ("page-count", "word-count", "reference-count"):
        return range_tokens(value)
    if check_id == "required-sections":
        # Svaki nazvani dio rada mora se pojaviti u citatu. Popis je odredba, ne primjer.
        names = value if isinstance(value, list) else [value]
        out: list[list[str]] = []
        for name in names:
            text = str(name.get("label") if isinstance(name, dict) else name)
            out.append([text, text[:6]] if len(text) > 6 else [text])
        return out
    if check_id == "heading-rules":
        return heading_rules_tokens(value)
    if check_id == "citation-style":
        # Naziv stila ILI njegov nedvosmislen potpis. `custom` po definiciji nema potpis, pa se ne
        # izvodi mehanicki: to je oznaka "stil postoji, nije standardni".
        token = str(value).lower()
        if token in ("custom", "none", "null"):
            return []
        # IMENOVAN STIL MORA BITI IMENOVAN. Do 2026-08-30 su `ieee` i `vancouver` prolazili i na
        # golom "[1]" ili "uglat", dakle na dokazu koji ta dva stila NE RAZLIKUJE i koji jednako
        # opisuje obicno brojcano navodjenje. Izvod bi tako mehanicki potvrdio tvrdnju koju izvor
        # ne izrice: tocno razred greske zbog kojeg je 26 profila 2026-08-29 vraceno s `ieee` na
        # `custom` (nijedan njihov izvor IEEE ne spominje; jedina pojava rijeci u cijelom korpusu
        # tih vrela bilo je ime casopisa u primjeru literature).
        #
        # Zaostravanje ne obara nijednu postojecu tvrdnju: izmjereno na svih 141 `citation-style`
        # unosa, nijedan ne prolazi SAMO na zagradi. Gard je dakle preventivan, ne retroaktivan.
        signatures = {
            "ieee": ["ieee"],
            "vancouver": ["vancouver"],
            "apa7": ["apa"],
            "harvard": ["harvard"],
            "chicago-notes": ["chicago"],
            "chicago-author": ["chicago"],
            "mla9": ["mla"],
        }
        return [signatures.get(token, [token])]
    if check_id in COMPOSITE_AXES:
        return composite_tokens(check_id, value)
    return []


def verify(claim: dict) -> dict:
    quote = squash(claim.get("quote", ""))
    rel = claim.get("file", "")
    page = int(claim.get("page", 0) or 0)
    check_id = claim.get("checkId", "")
    value = claim.get("value")

    reasons: list[str] = []
    text = squash(page_text(rel, page))

    anchored = bool(quote) and bool(text) and quote in text
    if not quote:
        reasons.append("citat je prazan")
    elif not text:
        reasons.append(f"stranica {page} u {rel} nije citljiva")
    elif not anchored:
        reasons.append("citat se NE nalazi doslovno na navedenoj stranici")

    # PAD i NEPROVJERIVO su razlicite presude, i to razlikovanje je uvedeno 2026-08-22.
    # Prije je os bez pravila izvoda dobivala `derivable = False`, dakle isti ishod kao izmisljena
    # vrijednost. Os koju verifikator ne zna provjeriti nije laz: `unsupported` je odsutnost dokaza,
    # a `False` je dokaz odsutnosti, i mijesati ih znaci trositi ljudsku paznju na sum.
    groups = value_tokens(check_id, value)
    derivable: bool | str
    if not groups:
        if predicate_hit(check_id, quote):
            # Predikatna os: citat izrice odredbu iako u njoj nema broja koji bi se usporedio.
            derivable = True
        elif check_id in PREDICATE_TOKENS:
            derivable = False
            reasons.append(f"citat ne izrice odredbu o '{check_id}' (nijedan prepoznat pojam)")
        else:
            derivable = "unsupported"
            reasons.append(f"za checkId '{check_id}' nema pravila izvoda (NEPROVJERIVO, ne pad)")
    else:
        lowered = quote.lower()
        missing = [g for g in groups if not any(form.lower() in lowered for form in g)]
        derivable = not missing
        if missing:
            shown = ", ".join(" / ".join(g) for g in missing)
            reasons.append(f"vrijednost se ne moze izvesti iz citata (nedostaje: {shown})")

    qualifier = QUALIFIERS.search(quote)
    disclaimer = document_disclaimer(rel) if rel else None
    choice = is_choice(check_id, value, quote)
    tail = truncated_tail(rel, page, quote) if (rel and anchored) else None
    return {
        **claim,
        "anchored": anchored,
        "derivable": derivable,
        "qualifier": qualifier.group(0) if qualifier else None,
        "documentDisclaimer": disclaimer,
        "isChoice": choice,
        "truncatedTail": tail,
        # `pass` znaci samo da tvrdnja nije mehanicki neispravna. Kvalifikator i odricaj dokumenta
        # su razlozi za ljudsku odluku, ne za odbacivanje.
        # `unsupported` NIJE prolaz: tvrdnja se ne moze potvrditi, ali nije ni oborena. Zato ima
        # vlastito polje i ne broji se ni u prolaze ni u padove.
        "mechanicalPass": anchored and derivable is True,
        "unsupported": derivable == "unsupported",
        "needsHuman": bool(qualifier) or bool(disclaimer) or choice or bool(tail),
        "reasons": reasons,
    }


# --- NEGATIVNE KONTROLE -------------------------------------------------------------------------
#
# Gard bez dokaza da grize gori je od nikakvog. Svaka os koja je 2026-08-22 dobila pravilo izvoda
# ovdje ima par: citat iz kojeg se vrijednost DOISTA izvodi i citat iz kojeg se NE izvodi. Kad bi
# izvod bio prazan, oba bi prosla i to se ovdje vidi odmah.
#
# Pokreni: python scripts/verify_rule_claims.py --selftest
SELFTEST: list[tuple[str, object, str, bool]] = [
    # (checkId, value, quote, ocekuje se izvod?)
    # --- PREDIKATNE OSI: rjecnik mora pokriti kako izvori STVARNO pisu -------------------------
    # Sve tri "grize" kontrole su prepisane iz izvora koji su prosireni rjecnik iznudili: mjerenje je
    # 60 tvrdnji proglasilo neuporistenima, a uzorak od 6 pokazao da su 3 promasaj RJECNIKA.
    ("justify", True, "Margine su standardne, a tekst poravnat s obje strane.", True),
    # --- IMENOVAN CITATNI STIL: ime, ne puka zagrada -------------------------------------------
    ("citation-style", "ieee", "Literatura se navodi prema IEEE standardu.", True),
    ("citation-style", "ieee", "Svaki literaturni navod treba oznaciti brojem [1], koji se poziva na izvor.", False),
    ("citation-style", "vancouver", "Koristi se Vancouver stil citiranja.", True),
    ("citation-style", "vancouver", "Reference se navode rednim brojem u uglatim zagradama.", False),
    ("justify", True, "Tekst treba biti poravnat uz lijevi i desni rub stranice.", True),
    ("justify", True, "Die folgenden Angaben gelten verbindlich. Blocksatz.", True),
    ("justify", True, "Rad se pise u formatu A-4, font Times New Roman, velicina 12.", False),
    ("page-numbers", True, "Obrojčavanje stranica: u podnožju, desno", True),
    ("page-numbers", True, "stranice trebaju biti oznacene rednim brojem (dolje desno)", True),
    ("page-numbers", True, "Footer: PAGE polje, desno poravnano, dno stranice.", True),
    ("page-numbers", True, "Rad treba pisati na papiru A4 formata s marginama 3 cm.", False),
    ("toc", True, "Rad mora sadrzavati:", False),  # uvod u popis BEZ popisa: nije uporiste
    ("toc", True, "Sadrzaj se generira automatski u Wordu.", True),
    # --- SNOPOVI PRAVILA (objekt s vise odredbi): svaki LIST mora imati vlastito sidro ----------
    # Bez ovih kontrola bi rjecnik koji pogadja sve izgledao jednako kao rjecnik koji radi.
    (
        "section-surgery-rules",
        {"frontMatter": {"numbering": "roman", "removePageNumberFromTitlePage": True},
         "mainMatter": {"numbering": "decimal", "startAt": 1}},
        "Stranice rada se numeriraju, ali ne i naslovnice; prethodni dijelovi numeriraju se rimskim brojkama, a osnovni tekst arapskima tako da brojka 1 bude na prvoj stranici uvoda.",
        True,
    ),
    (   # isti snop, citat BEZ rimskih brojki: jedan list bez sidra rusi cijeli izvod
        "section-surgery-rules",
        {"frontMatter": {"numbering": "roman", "removePageNumberFromTitlePage": True},
         "mainMatter": {"numbering": "decimal", "startAt": 1}},
        "Stranice rada se numeriraju, ali ne i naslovnice; osnovni tekst arapskima tako da brojka 1 bude na prvoj stranici uvoda.",
        False,
    ),
    (   # citat govori o numeriranju, ali NE o naslovnici: druga odredba istog snopa
        "section-surgery-rules",
        {"frontMatter": {"numbering": "roman", "removePageNumberFromTitlePage": True},
         "mainMatter": {"numbering": "decimal", "startAt": 1}},
        "Prethodni dijelovi numeriraju se rimskim brojkama, a osnovni tekst arapskima tako da brojka 1 bude na prvoj stranici uvoda.",
        False,
    ),
    (   # VRIJEDNOST koja nije u rjecniku (frontMatter arapski) -> NEPROVJERIVO, nikad tihi prolaz
        "section-surgery-rules",
        {"frontMatter": {"numbering": "decimal"}},
        "Stranice rada se numeriraju, ali ne i naslovnice; prethodni dijelovi numeriraju se rimskim brojkama, a osnovni tekst arapskima tako da brojka 1 bude na prvoj stranici uvoda.",
        False,
    ),
    (
        "bibliography-rules",
        {"sort": "alphabetical", "authorYearSuffixes": True},
        "Popis literature gradi se tako da se izvori redaju abecedno prema prezimenu autora. Ako se navodi vise radova istog autora koji imaju istu godinu izdanja, treba ih razlikovati slovima (a, b, c itd) iza godine izdanja.",
        True,
    ),
    (   # abecedni redoslijed jest u citatu, sufiksi NISU: pola snopa nije snop
        "bibliography-rules",
        {"sort": "alphabetical", "authorYearSuffixes": True},
        "Popis literature gradi se tako da se izvori redaju abecedno prema prezimenu autora.",
        False,
    ),
    (
        "citation-sync-rules",
        {"mode": "author-year"},
        "bibliografskim jedinicama u obliku autor - godina",
        True,
    ),
    (   # citat govori o citiranju, ali NE imenuje autor-godina
        "citation-sync-rules",
        {"mode": "author-year"},
        "Studenti trebaju koristiti citatni stil s citatnicama u obliku unutartekstnih biljezaka.",
        False,
    ),
    (   # NATPISI sekcija: korijen rijeci mora podnijeti padez ("Kljucne rijeci" vs "kljucnih rijeci")
        "required-section-rules",
        {"order": ["summary-hr", "keywords-hr"],
         "labels": {"summary-hr": "Sažetak", "keywords-hr": "Ključne riječi"}},
        "Na samom kraju rada potrebno je napisati njegov sazetak. Uz sazetak treba navesti i nekoliko kljucnih rijeci.",
        True,
    ),
    (   # jedna od dvije sekcije nije spomenuta
        "required-section-rules",
        {"order": ["summary-hr", "keywords-hr"],
         "labels": {"summary-hr": "Sažetak", "keywords-hr": "Ključne riječi"}},
        "Na samom kraju rada potrebno je napisati njegov sazetak.",
        False,
    ),
    (   # sekcija bez natpisa: nema se sto traziti u citatu -> NEPROVJERIVO
        "required-section-rules",
        {"order": ["summary-hr"]},
        "Na samom kraju rada potrebno je napisati njegov sazetak.",
        False,
    ),
    ("paper-size", "A4", "Stranica treba biti A4 formata.", True),
    ("paper-size", "A3", "Stranica treba biti A4 formata.", False),  # prije 2026-08-22 je PROLAZILO
    ("paper-size", "A3", "Plakat se predaje u formatu A3.", True),
    ("font-size", [11, 12], "velicina slova 11 ili 12 tocaka", True),
    ("font-size", [11, 12], "velicina slova 12 tocaka", True),  # dovoljan je jedan clan skupa
    ("font-size", [10], "velicina slova 12 tocaka", False),
    ("line-spacing", 1.5, "prored 1,5", True),
    ("line-spacing", 2, "prored 1,5", False),
    ("footnote-size", [10], "Kod biljezaka se bira velicina slova 10", True),
    ("footnote-size", [9], "Kod biljezaka se bira velicina slova 10", False),
    ("footnote-spacing", 1, "Biljeske (fusnote) - prored: 1", True),
    ("page-count", {"min": 25, "max": 50}, "Rad moze imati najmanje 25, a najvise 50 stranica.", True),
    ("page-count", {"min": 30, "max": 50}, "Rad moze imati najmanje 25, a najvise 50 stranica.", False),
    ("reference-count", 20, "minimalno 20 referenci", True),
    ("reference-count", 30, "minimalno 20 referenci", False),
    ("word-count", {"min": 8000, "max": 10000}, "opseg od 8000 do 10000 rijeci", True),
    ("citation-style", "ieee", "Literatura se navodi po IEEE standardu.", True),
    ("citation-style", "ieee", "Ako je jako bitno, u tekst se moze staviti referenca na literaturu.", False),
    ("citation-style", "harvard", "koristi se Harvardski sustav citiranja", True),
    ("citation-style", "apa7", "koristi se Harvardski sustav citiranja", False),
    ("justify", True, "Tekst poravnati s obje strane (engl. justify).", True),
    ("justify", True, "Rad se pise fontom Times New Roman.", False),
    ("toc", True, "Rad mora sadrzavati sadrzaj s brojevima stranica.", True),
    ("toc", True, "Rad mora sadrzavati zakljucak.", False),
    ("page-numbers", True, "sve ostale stranice trebaju biti numerirane", True),
    ("page-numbers", True, "Rad se uvezuje termo uvezom.", False),
    ("required-sections", ["uvod", "zakljucak"], "Rad sadrzi uvod, razradu i zakljucak.", True),
    ("required-sections", ["uvod", "sazetak"], "Rad sadrzi uvod, razradu i zakljucak.", False),
    # --- OSI KOJE SU DO 2026-08-30 BILE BEZ IZVODA ---------------------------------------------
    ("footnote-justify", True, "biljeske se pisu na dnu stranice, prored jednostruk s obostranim poravnanjem", True),
    ("footnote-justify", True, "Biljeske se pisu na dnu stranice, velicine 10.", False),
    ("page-number-start-at-intro", True, "Stranice obavezno oznaciti brojevima (prva stranica je stranica Uvod)", True),
    ("page-number-start-at-intro", True, "Uvod treba jasno predstaviti temu rada.", False),
    ("page-number-title-suppression", True, "naslovnu stranicu i stranice sa sadrzajem ne numerirati", True),
    ("page-number-title-suppression", True, "Sve stranice numerirati arapskim brojevima.", False),
    # Snop pravila o naslovima: svaka POTVRDNA odredba mora imati uporiste u citatu.
    ("heading-rules", {"levels": {"1": {"uppercase": True, "bold": True}}},
     "Naslov poglavlja pise se VELIKIM PODEBLJANIM slovima.", True),
    ("heading-rules", {"levels": {"1": {"uppercase": True, "bold": True}}},
     "Naslov poglavlja pise se velikim slovima.", False),
    ("heading-rules", {"levels": {"2": {"italic": True}}}, "Podnaslovi se pisu kurzivom.", True),
    # Tocno zbog ovoga su dvije skupine: "velikim fontom" govori o VELICINI, ne o verzalu.
    ("heading-rules", {"levels": {"1": {"uppercase": True}}}, "Naslovi se pisu velikim fontom.", False),
    ("heading-rules", {"maxLevel": 3, "numberRequired": True},
     "Poglavlja se numeriraju do trece razine.", True),
    ("heading-rules", {"trailingDot": True}, "Iza broja poglavlja stavlja se tocka.", True),
    ("heading-rules", {"trailingDot": True}, "Poglavlja se numeriraju arapskim brojevima.", False),
    ("heading-rules", {"romanLevelOneAllowed": True}, "Prva razina moze biti rimskim brojem.", True),
    # `false` NIJE odredba: vrijednost bez ijedne potvrdne odredbe mora ostati NEPROVJERIVA.
    ("heading-rules", {"levels": {"1": {"uppercase": False}, "2": {"uppercase": False}}},
     "Naslov poglavlja pise se VELIKIM PODEBLJANIM slovima.", False),
    # Nepoznato svojstvo obara izvod, ne prolazi tiho.
    ("heading-rules", {"levels": {"1": {"nepoznatoSvojstvo": True}}},
     "Naslovi se pisu velikim slovima i podebljano.", False),
    ("heading-rules", {"size": 14}, "Naslovi se pisu velicinom 14.", True),
    ("heading-rules", {"size": 16}, "Naslovi se pisu velicinom 14.", False),
    ("font", ["Merriweather"], "Rad treba pisati fontom Merriweather, velicine 10 pt.", True),
    ("font", ["Times New Roman"], "Rad treba pisati fontom Merriweather, velicine 10 pt.", False),
    ("margins", {"top": 2.5, "right": 2.5, "bottom": 2.5, "left": 3.5}, "Margine su 2,5 cm osim lijeve koja je 3,5 cm.", True),
    ("margins", {"top": 3, "right": 3, "bottom": 3, "left": 3}, "Margine su 2,5 cm sa svih strana.", False),
]


def selftest() -> int:
    """Vraca broj promasaja. Nula znaci da svaka os grize u oba smjera."""
    failures = 0
    for check_id, value, quote, expected in SELFTEST:
        groups = value_tokens(check_id, value)
        if groups:
            lowered = squash(quote).lower()
            got = all(any(form.lower() in lowered for form in g) for g in groups)
        else:
            got = predicate_hit(check_id, quote)
        if got != expected:
            failures += 1
            print(f"  PROMASAJ [{check_id}] ocekivano izvod={expected}, dobiveno={got}: {quote[:70]}")
    covered = sorted({c for c, *_ in SELFTEST})
    print(f"negativne kontrole: {len(SELFTEST)} slucajeva, {len(covered)} osi, promasaja: {failures}")
    print(f"  pokrivene osi: {', '.join(covered)}")
    return failures


def main() -> None:
    if "--selftest" in sys.argv:
        raise SystemExit(1 if selftest() else 0)
    if len(sys.argv) < 2:
        print("Upotreba: python scripts/verify_rule_claims.py <claims.json>", file=sys.stderr)
        raise SystemExit(2)
    with open(sys.argv[1], encoding="utf-8") as fh:
        payload = json.load(fh)
    claims = payload["claims"] if isinstance(payload, dict) else payload

    results = [verify(c) for c in claims]
    ok = [r for r in results if r["mechanicalPass"]]
    unsupported = [r for r in results if r["unsupported"]]
    human = [r for r in ok if r["needsHuman"]]

    out_path = os.path.splitext(sys.argv[1])[0] + ".verified.json"
    with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"schemaVersion": 1, "results": results}, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print("=== Mehanicka provjera tvrdnji ===")
    print(f"tvrdnji: {len(results)}")
    print(f"  prolazi mehanicki (sidro + izvod): {len(ok)}")
    print(f"  od toga trazi ljudsku odluku (kvalifikator): {len(human)}")
    print(f"  NEPROVJERIVO (os bez pravila izvoda): {len(unsupported)}")
    print(f"  pada: {len(results) - len(ok) - len(unsupported)}")
    for r in results:
        if r["unsupported"]:
            print(f"    NEPROVJERIVO [{r.get('checkId')}] {r.get('file')} str.{r.get('page')}")
    for r in results:
        if not r["mechanicalPass"] and not r["unsupported"]:
            print(f"    PAD [{r.get('checkId')}] {r.get('file')} str.{r.get('page')}: {'; '.join(r['reasons'])}")
    for r in human:
        if r["truncatedTail"]:
            print(f"    COVJEK [{r.get('checkId')}] CITAT ODSJECEN, recenica se nastavlja: ...{r['truncatedTail'][:80]}")
    for r in human:
        if r["isChoice"]:
            print(f"    COVJEK [{r.get('checkId')}] IZBOR, ne ciljana vrijednost: {squash(r.get('quote',''))[:90]}")
    for r in human:
        if r["qualifier"]:
            print(f"    COVJEK [{r.get('checkId')}] kvalifikator '{r['qualifier']}': {squash(r.get('quote',''))[:90]}")
    # Odricaj je svojstvo DOKUMENTA, ne tvrdnje: ispisuje se jednom po datoteci, inace se ista
    # recenica ponovi uz svaku tvrdnju i zatrpa presude koje su stvarno pojedinacne.
    seen_docs: set[str] = set()
    for r in results:
        d = r.get("documentDisclaimer")
        if not d or r.get("file") in seen_docs:
            continue
        seen_docs.add(r.get("file"))
        affected = sum(1 for x in results if x.get("file") == r.get("file"))
        print(f"    DOKUMENT SE ODRICE [{r.get('file')}] str.{d['page']}, '{d['phrase']}' -> {affected} tvrdnji nije obveza")
        print(f"      > {d['sentence']}")
    print("")
    print(f"zapisano: {os.path.relpath(out_path, ROOT)}")


if __name__ == "__main__":
    main()
