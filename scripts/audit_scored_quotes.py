"""
Revizija SVIH bodovanih pravila protiv njihova vlastita izvora.

    python scripts/audit_scored_quotes.py [--json putanja]

Zasto: `scripts/verify_rule_claims.py` provjerava tvrdnje PRIJE nego postanu pravila. Ovaj skript
gleda unatrag, na ono sto vec boduje studentske radove. Dva izmjerena nalaza pokazuju da tamo doista
ima kvarova, i to razlicitih:

  - `efzg-specijalisticki--paper-size` citirao je recenicu o OPSEGU ("opsega od 70 do 90 stranica
    teksta formata A4"), u kojoj je A4 usputna oznaka, a ne odredba o formatu.
  - `unizd-turizam-*` boduje sest pravila iz dokumenta koji o sebi kaze da "predstavlja samo jednu
    od vise mogucnosti" i da su "najvaznije upute vaseg mentora".

Provjere su ISTE kao kod tvrdnji (dijeli se kod iz verify_rule_claims.py), uz jednu razliku: profilni
`sourcePage` je cesto tekstualni lokator ("odjeljak o tehnickom oblikovanju"), ne broj stranice, pa
se citat trazi kroz CIJELI dokument. To je slabija provjera od sidra na stranici i tako je i
prijavljena.

Skript NISTA ne mijenja. Nalaz je razlog da se dokument procita, ne presuda.
"""

from __future__ import annotations

import difflib
import glob
import importlib.util
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_spec = importlib.util.spec_from_file_location("vrc", os.path.join(ROOT, "scripts", "verify_rule_claims.py"))
if _spec is None or _spec.loader is None:  # pragma: no cover
    raise SystemExit("ne mogu ucitati scripts/verify_rule_claims.py")
vrc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vrc)

squash = vrc.squash
QUALIFIERS = vrc.QUALIFIERS
SENTENCE_END = vrc.SENTENCE_END


def fold(text: str) -> str:
    """Usporedni oblik: bez dijakritike i bez velicine slova.

    NIJE kozmetika. Profilni citati su vecinom preuzeti OCR-om pa im je dijakritika ogoljena
    ("velicine fonta 12"), dok tekstualni sloj PDF-a ima punu ("veličine fonta 12"). Doslovna
    usporedba je zato prvo prijavila 933 od 1391 pravila kao "citat se ne nalazi u dokumentu", od
    cega je 279 nestalo cim je dijakritika ogoljena s obje strane. Tvrdnja o 67% pokvarenih pravila
    bila bi kvar MJERENJA, ne podataka.
    """
    decomposed = unicodedata.normalize("NFD", text)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    # ß nije dijakriticki znak pa ga NFD ne rastavlja; bez ove zamjene njemacki izvori
    # (ffri-germanistika) nikad ne pogadjaju citat pisan kao "Schriftgrosse".
    folded = stripped.replace("đ", "d").replace("Đ", "D").lower()
    return folded.replace("ß", "ss")


# Citat po konvenciji smije IZOSTAVLJATI: "Rad mora sadrzavati: (...) Sadrzaj" spaja dva nesusjedna
# ulomka. Takav citat NIKAD nije neprekinut podniz, pa se dijeli na ulomke i svaki se trazi zasebno,
# REDOM. Bez toga je 654 valjanih citata izgledalo kao izmisljeno.
ELISION = re.compile(r"\(\s*\.\.\.\s*\)|\.\.\.|…|\[\s*\.\.\.\s*\]")


WORD = re.compile(r"[0-9a-z]+")


def bigrams(text: str) -> list[tuple[str, str]]:
    words = WORD.findall(fold(text))
    return list(zip(words, words[1:]))


def quote_coverage(full_text: str, quote: str) -> float:
    """Udio susjednih parova rijeci iz citata koji postoje i u dokumentu (0 do 1).

    Zasto NE doslovno podudaranje niza: profilni citati nisu fotografija teksta nego uredan prijepis.
    Izmjereno na zivim podacima, tri razlicita odstupanja, sva bezopasna po smislu:
      - dijakritika ogoljena OCR-om ("velicine" prema "veličine"),
      - izostavljanje ("Rad mora sadrzavati: (...) Sadrzaj"),
      - normalizirana interpunkcija (agr-doktorski--margins ima "; " ondje gdje dokument u
        nabrajanju ima " - ").
    Strogo podudaranje prijavilo je 933 od 1391 pravila kao izmisljen citat; to je bio kvar mjerenja.
    Parovi rijeci prezive sva tri odstupanja, a i dalje padnu kad citat govori o necem drugom
    (izmjereno na alu-kiparstvo, gdje citat nosi "najmanje 10 a najvise 20", a odjeljak na tom mjestu
    "najmanje 5 a najvise 15").
    """
    pairs = bigrams(quote)
    if not pairs:
        return 0.0
    have = set(bigrams(full_text))
    return sum(1 for p in pairs if p in have) / len(pairs)


# Prag je namjerno visok: ispod 85% se parovi rijeci vise ne daju objasniti prijepisom.
COVERAGE_MIN = 0.85

NUM = re.compile(r"\d+(?:[.,]\d+)?")

_doc_index: dict[int, dict] = {}


def doc_index(full_text: str) -> dict:
    """Za svaki par rijeci popis ZNAKOVNIH odmaka u dokumentu; gradi se jednom po dokumentu.

    Cuvaju se odmaci, ne indeksi rijeci. Prva izvedba je prozor sastavljala spajanjem TOKENA, a
    tokenizator rijeci cijepa "2,5" na "2" i "5", pa se broj 2,5 u prozoru nikad nije mogao pojaviti
    i tri citata koja DOSLOVNO stoje u dokumentu padala su kao neistinita.
    """
    key = id(full_text)
    if key in _doc_index:
        return _doc_index[key]
    folded = fold(full_text)
    spans = [(mm.group(0), mm.start()) for mm in WORD.finditer(folded)]
    positions: dict[tuple[str, str], list[int]] = {}
    for (w1, o1), (w2, _) in zip(spans, spans[1:]):
        positions.setdefault((w1, w2), []).append(o1)
    index = {"folded": folded, "positions": positions}
    _doc_index[key] = index
    return index


# Brojevi koji IMENUJU mjesto, a ne vrijednost pravila: "Tablica 1", "Cl. 48", "Slika 2". Oni ne
# opisuju ono sto se boduje nego gdje je odredba nadjena, pa njihova odsutnost u odlomku nije kvar
# pravila. Izmjereno 2026-08-22: 6 od 47 nalaza bilo je upravo to (effectus "Tablica 1" dvaput,
# alu "Cl. 48"), a tablica je u tekstualnom sloju spljostena bez svoga natpisa.
LABEL_NUM = re.compile(
    r"\b(?:tablic\w*|slik\w*|grafikon\w*|shem\w*|prilog\w*|clan\w*|cl|to[čc]k\w*|str|stranic\w*|poglavlj\w*)\.?\s*"
    r"(\d+(?:[.,]\d+)?)",
    re.I,
)


# Kracenice iza kojih tocka NE zavrsava recenicu. Bez ovoga se "(Cl. 48: pohranjuju se...)" lomi
# tocno izmedu oznake i njezina broja, pa `label_numbers` vise ne vidi da je 48 broj CLANKA i broj
# se trazi kao da je propisana vrijednost. Izmjereno 2026-08-22 na alu-pravilnik-diplomski-2014.
ABBREV = {
    "cl", "clanak", "clanka", "st", "str", "tab", "sl", "npr", "tj", "itd", "god", "br", "odn",
    "dr", "mr", "prof", "usp", "vidi",
}
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")


def sentences(quote: str) -> list[str]:
    """Recenice citata, ali BEZ loma iza kracenice ("Cl. 48" ostaje jedna cjelina)."""
    out: list[str] = []
    for part in _SENTENCE_SPLIT.split(quote):
        if out:
            tail = fold(out[-1]).rstrip().rstrip(".")
            raw_last = tail.rsplit(" ", 1)[-1] if tail else ""
            last = "".join(ch for ch in raw_last if ch.isalpha())
            if last in ABBREV:
                out[-1] = out[-1] + " " + part
                continue
        out.append(part)
    return out


def label_numbers(quote: str) -> set[str]:
    return set(LABEL_NUM.findall(fold(quote)))


def align_end(index: dict, quote: str, start: int) -> int:
    """Gdje ZAVRSAVA odlomak koji citat opisuje: zadnje uporiste citata, poredano unaprijed.

    Prozor se do 2026-08-22 mjerio duljinom citata ("pocetak + len(citat)"), a citat redovito
    IZOSTAVLJA stavke koje izvor nabraja izmedju: `unizd-sociologija` ima jedanaest natuknica o
    oblikovanju, citat sest, pa je opisani odlomak dvostruko dulji od citata i zadnji broj
    ("velicine 10 tocaka") ostajao je izvan prozora. Isto na `vuv` (sest velicina fonta, citat dvije)
    i `ffri-kulturalni` (dvotocka spaja recenicu i natuknicu 241 znak dalje).

    Poravnanje je MONOTONO: svaka sljedeca dvorijec citata trazi se tek IZA prethodne. Zato prozor
    ne moze odlutati unatrag ni preskociti u drugi odjeljak, pa provjera i dalje hvata citat prepisan
    iz KRIVOG odjeljka, zbog cega je i uvedena.
    """
    pos = start
    for pair in bigrams(quote):
        for hit in index["positions"].get(pair, ()):  # rastuce po konstrukciji indeksa
            if hit >= pos:
                pos = hit
                break
    return pos


def numbers_match(full_text: str, quote: str) -> bool:
    """Brojevi iz citata moraju stajati u ODLOMKU koji citat opisuje, ne bilo gdje u dokumentu.

    Ovo je dodano nakon sto je mjera po parovima rijeci PALA na poznatom stvarnom promasaju:
    `alu-kiparstvo-diplomski--*` nosi citat "najmanje 10 a najvise 20 kartica", a odjeljak na tom
    mjestu glasi "najmanje 5 a najvise 15" (to je Slikarski odsjek). Rijeci se poklapaju gotovo sve,
    razlikuju se samo brojevi, a upravo brojevi su ono sto se boduje. Provjera po cijelom dokumentu
    ne bi pomogla, jer se "10" i "20" negdje drugdje sigurno pojavljuju.
    """
    # Citat zna SPOJITI dva nesusjedna odlomka bez oznake izostavljanja (izmjereno na
    # unizd-turizam-diplomski--margins: zadnjih 137 znakova stoji na jednom mjestu, prvih 160 na
    # drugom). Jedan prozor tada nuzno promasi polovicu brojeva. Zato se svaka recenica provjerava
    # zasebno: unutar recenice tekst JEST susjedan.
    parts = [p for p in sentences(quote) if NUM.search(p)]
    if len(parts) > 1:
        return all(numbers_match(full_text, part) for part in parts)

    wanted = [n for n in NUM.findall(quote) if n not in label_numbers(quote)]
    if not wanted:
        return True
    index = doc_index(full_text)
    folded = index["folded"]
    # Ako citat doslovno stoji u dokumentu, brojevi su time vec dokazani.
    fq = fold(squash(quote))
    at = folded.find(fq)
    span = max(len(fq), 80)
    end = at + span
    if at < 0:
        hits: list[int] = []
        for pair in bigrams(quote):
            hits.extend(index["positions"].get(pair, ()))
        if not hits:
            return False
        hits.sort()
        best, count, j = hits[0], 0, 0
        for i, start in enumerate(hits):
            while j < len(hits) and hits[j] <= start + span:
                j += 1
            if j - i > count:
                count, best = j - i, start
        at = best
        end = align_end(index, quote, best) + 80
    window = folded[max(0, at - 40) : max(at + span, end) + 40]
    present = set(NUM.findall(window)) | {n.replace(",", ".") for n in NUM.findall(window)}
    return all(n in present or n.replace(",", ".") in present for n in wanted)


def quote_found(full_text: str, quote: str) -> bool:
    return quote_coverage(full_text, quote) >= COVERAGE_MIN and numbers_match(full_text, quote)

# Osi na kojima skup dopustenih vrijednosti nije ciljana vrijednost (isto kao kod tvrdnji).
# `font-size` je 2026-08-22 IZBACEN: engine usporedjuje clanstvo u skupu (`profile.size.some(...)`),
# pa `value: [11, 12]` nije izbor jedne strane nego vjeran prijepis izvora koji dopusta oboje.
# Dokaz je `tests/font-size-allowed-set.test.ts`. Ostaju osi koje stvarno primaju JEDAN broj.
NUMERIC_AXES = ("line-spacing", "margins")

# Isti razred problema u DRUGOM smjeru, i ondje gdje engine zna za skup: izbor je zapisan u CITATU
# ("11 ili 12"), a pravilo boduje samo jednu stranu. Tada pravilo boduje uze od izvora i kaznjava rad
# koji tocno slijedi svoju uputu, pa nalaz ostaje.
CHOICE_AXES = NUMERIC_AXES + ("font-size",)
CHOICE_PAIR = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:pt|to[čc]\w*|cm|mm)?\s+ili\s+(\d+(?:[.,]\d+)?)", re.I)


def _forms(raw: str) -> set[str]:
    return {raw, raw.replace(".", ","), raw.replace(",", ".")}


def choice_narrows_rule(quote: str, value) -> bool:
    """Boduje li pravilo SAMO jednu stranu izbora koji izvor doslovno nudi.

    Sam izbor u recenici nije dovoljan: `unidu-komunikologija-diplomski` u istoj recenici propisuje
    tijelo na 12 tocaka i naslove na "14 ili 16 tocaka", pa je izbor tu odredba DRUGE osi. Nalaz ima
    smisla samo kad je vrijednost pravila JEDNA strana izbora, a druga strana nije pokrivena.
    """
    atoms = set(value_atoms(value))
    if not atoms:
        return False
    for left, right in CHOICE_PAIR.findall(quote):
        hit_left, hit_right = bool(_forms(left) & atoms), bool(_forms(right) & atoms)
        if hit_left != hit_right:
            return True
    return False

_doc_text: dict[str, str] = {}


# `.docx` je zip s XML-om, dakle citljiv bez ijedne dodatne ovisnosti. Do 2026-08-22 revizija ga je
# preskakala i time je 202 od 1934 bodovana pravila ostajalo NEREVIDIRANO, iako svih 24 datoteke
# stoje na disku. Preskok je bio nasljedje prve izvedbe (samo PDF), ne odluka.
#
# KLJUCNO: `</w:p>` i `<w:br/>` moraju postati RAZMAK prije nego se tagovi obrisu. Bez toga se
# zadnja rijec odlomka slijepi s prvom rijeci sljedeceg ("margine2,5"), pa citat koji doslovno stoji
# u dokumentu ispadne nenadjen. Isti razred kvara koji je u proizvodu popravljen za w:cr i w:ptab.
DOCX_TEXT_PARTS = ("word/document.xml", "word/footnotes.xml", "word/endnotes.xml")
_TAG = re.compile(r"<[^>]+>")
_BREAK = re.compile(r"</w:p>|<w:br[^>]*/?>|</w:tc>|<w:tab[^>]*/?>")


def docx_text(path: str) -> str:
    """Spojeni vidljivi tekst .docx paketa. Prazan string ako se ne moze procitati."""
    try:
        import zipfile
        import xml.sax.saxutils as saxutils

        chunks: list[str] = []
        with zipfile.ZipFile(path) as pack:
            names = set(pack.namelist())
            for part in DOCX_TEXT_PARTS:
                if part not in names:
                    continue
                xml = pack.read(part).decode("utf-8", "replace")
                chunks.append(_TAG.sub("", _BREAK.sub(" ", xml)))
        return squash(saxutils.unescape(" ".join(chunks)))
    except Exception:
        return ""

# Naslijedjeni `.doc` (Word 97, OLE) nosi jos 187 bodovanih pravila. Cita se preko TABLICE KOMADA
# (piece table) iz CLX zapisa, ne heuristickim skupljanjem citljivih nizova: samo tako se dobije
# tocan tekst s dijakritikom i bez ostataka strukture. Provjereno prije ugradnje na grf, fesb i fer;
# na grf-u je poznat profilni citat prisutan u izvucenom tekstu.
#
# Polja (`\x13 instrukcija \x14 rezultat \x15`) se odbacuju do rezultata: instrukcija je kod, ne
# vidljivi tekst, pa bi inace "PAGE" i "TOC" ulazili u usporedbu citata.
_DOC_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def doc97_text(path: str) -> str:
    """Vidljivi tekst naslijedjenog .doc paketa. Prazan string ako se ne moze procitati."""
    try:
        import struct

        import olefile

        ole = olefile.OleFileIO(path)
        try:
            stream = ole.openstream("WordDocument").read()
            table_name = "1Table" if (struct.unpack_from("<H", stream, 0x0A)[0] & 0x0200) else "0Table"
            if not ole.exists(table_name):
                return ""
            table = ole.openstream(table_name).read()
            fc_clx, lcb_clx = struct.unpack_from("<II", stream, 0x01A2)
            clx = table[fc_clx : fc_clx + lcb_clx]
            at = 0
            while at < len(clx) and clx[at] == 1:  # Prc zapisi prije tablice komada
                at += 3 + struct.unpack_from("<H", clx, at + 1)[0]
            if at >= len(clx) or clx[at] != 2:
                return ""
            size = struct.unpack_from("<I", clx, at + 1)[0]
            pcdt = clx[at + 5 : at + 5 + size]
            pieces = (len(pcdt) - 4) // 12
            cps = [struct.unpack_from("<I", pcdt, 4 * k)[0] for k in range(pieces + 1)]
            chunks: list[str] = []
            for k in range(pieces):
                fc = struct.unpack_from("<I", pcdt, 4 * (pieces + 1) + 8 * k + 2)[0]
                compressed, offset = bool(fc & 0x40000000), fc & 0x3FFFFFFF
                length = cps[k + 1] - cps[k]
                if compressed:
                    chunks.append(stream[offset // 2 : offset // 2 + length].decode("cp1252", "replace"))
                else:
                    chunks.append(stream[offset : offset + 2 * length].decode("utf-16-le", "replace"))
            text = "".join(chunks)
        finally:
            ole.close()
    except Exception:
        return ""
    text = re.sub(r"\x13[^\x14\x15]*[\x14\x15]?", " ", text)  # kod polja, ne vidljivi tekst
    return squash(_DOC_CONTROL.sub(" ", text))



def document_text(rel_path: str) -> str:
    """Spojeni tekst izvora (PDF, .docx ili naslijedjeni .doc), normaliziran. Prazan ako se ne cita."""
    if rel_path in _doc_text:
        return _doc_text[rel_path]
    text = ""
    path = os.path.join(ROOT, rel_path.replace("/", os.sep))
    if os.path.exists(path) and path.lower().endswith(".doc"):
        text = doc97_text(path)
    elif os.path.exists(path) and path.lower().endswith(".docx"):
        text = docx_text(path)
    elif os.path.exists(path) and path.lower().endswith(".pdf"):
        try:
            import fitz

            doc = fitz.open(path)
            try:
                text = squash(" ".join(doc[i].get_text() for i in range(doc.page_count)))
            finally:
                doc.close()
        except Exception:
            text = ""
    _doc_text[rel_path] = text
    return text


_scanned: dict[str, bool] = {}


def has_scanned_pages(rel_path: str) -> bool:
    """Ima li dokument stranica koje su SLIKA bez teksta (skenirani dio).

    Bez ovoga revizija lazno optuzuje. Izmjereno na forenzika-pravilnik-diplomski.pdf: stranice 1-10
    su skenirane slike s nula znakova (ondje su clanci Pravilnika), a 11-23 su strojno pisani prilozi
    (PRILOG 1-9). Dokument time daje 12 tisuca znakova teksta i prolazi kao "citljiv", dok su upravo
    stranice s pravilima nevidljive. Osam bodovanih pravila citira te clanke preko OCR-a, sasvim
    ispravno, a provjera ih je prijavila kao izmisljene.
    """
    if rel_path in _scanned:
        return _scanned[rel_path]
    result = False
    path = os.path.join(ROOT, rel_path.replace("/", os.sep))
    if os.path.exists(path) and path.lower().endswith(".pdf"):
        try:
            import fitz

            doc = fitz.open(path)
            try:
                for i in range(doc.page_count):
                    page = doc[i]
                    if not page.get_text().strip() and page.get_images():
                        result = True
                        break
            finally:
                doc.close()
        except Exception:
            result = False
    _scanned[rel_path] = result
    return result


# Prag ostecenja tekstualnog sloja. Dobiven MJERENJEM 2026-08-22, ne procjenom: udio tokena duljine
# barem 4 koji mijesaju slova i znamenke ("zavr5ni", "bilje5ke", "formatu 44"). Kod 36 izvora bez
# ijednog nalaza medijan je 0,11%, a najveci 2,86%; kod izvora s nalazima najnizi ostecen je 3,81%
# (efri) a najvisi 7,41% (unipu). Izmedju 2,86 i 3,81 nema nijednog izvora, pa prag lezi u praznini.
DAMAGED_TEXT_RATIO = 0.035
_damaged: dict[str, bool] = {}


def text_layer_damaged(rel_path: str) -> bool:
    """Je li tekstualni sloj PDF-a toliko ostecen da usporedba citata vise nista ne dokazuje.

    Isti razred kao `has_scanned_pages`, ali suptilniji: stranica NIJE skenirana, ima tekstualni
    sloj, samo je taj sloj pun zamjena ("zavr5ni rad", "u formatu 44", "velidina slova"). Citat je
    ondje uredno prepisan s OTISNUTE stranice, pa podudaranje pada ispod praga a podatak je tocan.
    Potvrdjeno gledanjem renderirane stranice na biolos-pravilnik-diplomski-2023 ("2,n" umjesto
    "2,5"): otisnuto je bilo ispravno.

    Takav nalaz nije kvar podatka nego granica alata, pa se broji kao NEPROVJERIVO, kao i skenirano.
    """
    if rel_path in _damaged:
        return _damaged[rel_path]
    tokens = [t for t in WORD.findall(fold(document_text(rel_path))) if len(t) >= 4]
    if len(tokens) < 200:
        _damaged[rel_path] = False
        return False
    mixed = sum(1 for t in tokens if any(c.isdigit() for c in t) and any(c.isalpha() for c in t))
    _damaged[rel_path] = mixed / len(tokens) >= DAMAGED_TEXT_RATIO
    return _damaged[rel_path]


def truncated_tail(full_text: str, quote: str, check_id: str = "", value=None) -> str | None:
    """Ostatak recenice iza citata, ako jos nosi znamenku. Citat koji zavrsava tockom nije odsjecen."""
    quote = squash(quote)
    if not quote or not full_text or quote[-1] in ".!?":
        return None
    index = full_text.find(quote)
    if index < 0:
        return None
    tail = full_text[index + len(quote) :]
    end = SENTENCE_END.search(tail)
    tail = tail[: end.start() + 1] if end else tail[:240]
    tail = tail.strip()
    if not re.search(r"\d", tail) or not SCOPE_CARVEOUT.search(tail):
        return None
    if check_id and not tail_overrides_rule(check_id, value, tail):
        return None
    return tail


# Rjecnik OSI: kojim rijecima izvor govori bas o onome sto pravilo boduje. Bez toga se svaka
# natuknica popisa cita kao iznimka, i kad govori o tudjoj osi. Izmjereno 2026-08-22: od 37
# preostalih nalaza njih 30 imalo je rep o DRUGOJ osi (pravilo o marginama, rep o fontu i proredu).
AXIS_WORDS = {
    "margins": r"margin\w*|rubnic\w*",
    # `pt` je namjerno IZOSTAVLJEN: hrvatske upute istom mjerom pisu razmak prije i poslije
    # odlomka ("razmak - prije i poslije - 0 pt"), pa je goli "pt" hvatao tudju os. Velicina
    # slova se u tim uputama uvijek imenuje ("velicina", "tocaka"), sto guard slucajevi potvrduju.
    "font-size": r"veli[cč]in\w*|to[cč]ak\w*|to[cč]k\w*|kegl",
    "font": r"\bfont\w*|pism\w*|times|arial|calibri|garamond|antiqua|cambria|helvetica",
    "line-spacing": r"prored\w*|jednostruk\w*|dvostruk\w*|razmak\w* (?:me[dđ]u )?redov\w*",
    "justify": r"poravnan\w*|justif|obostran\w*",
    "paper-size": r"format\w*|\ba4\b|papir\w*",
    "page-numbers": r"numerir\w*|numeracij\w*|paginac\w*|broj\w* stranic\w*",
    "footnote-size": r"fusnot\w*|bilje[sš]k\w*",
    "citation-style": r"stil\w*|citir\w*|vancouver|apa|harvard|chicago|ieee|mla",
}

# Osi kojima je vrijednost IME, ne broj. Ondje "druga vrijednost" znaci drugo IME, a brojevi u repu
# (velicina pisma, margine, prored) pripadaju tudjoj osi. Bez te razlike su tri `font` pravila
# ispadala kao nalaz jer im rep spominje 12 i 1,5, sto s izborom fonta nema veze.
NAME_AXES = {
    "font": (
        "times new roman", "arial", "calibri", "garamond", "book antiqua", "cambria",
        "helvetica", "verdana", "tahoma", "georgia", "palatino",
    ),
    "citation-style": ("apa", "harvard", "chicago", "vancouver", "ieee", "mla", "oscola"),
}


def tail_overrides_rule(check_id: str, value, tail: str) -> bool:
    """Daje li nastavak DRUGU vrijednost za dio rada, i to bas na osi koju pravilo boduje.

    Tri uvjeta kumulativno: rep imenuje dio rada (SCOPE_CARVEOUT, provjeren prije ovoga), govori o
    ISTOJ osi, i nudi vrijednost razlicitu od one koju pravilo boduje. Tek tada se druga vrijednost
    boduje kao da vrijedi svugdje, a to je jedini razred zbog kojeg provjera postoji.
    """
    pattern = AXIS_WORDS.get(check_id)
    if not pattern or not re.search(pattern, tail, re.I):
        return False
    folded_tail = fold(tail)
    if check_id in NAME_AXES:
        own = {fold(str(v)) for v in (value if isinstance(value, list) else [value]) if v}
        return any(name in folded_tail and name not in own for name in NAME_AXES[check_id])
    atoms = set(value_atoms(value))
    return any(n not in atoms and n.replace(",", ".") not in atoms for n in NUM.findall(tail))


# Nastavak recenice prijavljuje se SAMO ako izuzima drugi dio dokumenta.
#
# Bez ovoga provjera mjeri pogresnu stvar. Izmjereno: 68 nalaza svelo se na 53 jedinice, a u gotovo
# svima je "nastavak" samo SLJEDECA STAVKA u popisu specifikacija (ttf: "Prored: 1,5 redak" pa
# "Lijeva i desna margina: 2,5 cm"; iv: "Font: Arial, 12 pt" pa "Prored: 1,5"). Popisi nemaju
# recenicne tocke, pa svaka stavka izgleda odsjecena, a rijec je o drugoj osi, ne o iznimci.
#
# Opasan je samo slucaj u kojem nastavak daje DRUGU VRIJEDNOST ZA DRUGI DIO RADA, jer se ta
# vrijednost tada boduje kao da vrijedi svugdje. Ta dva stvarna nalaza (unidu) glase:
#   "...font size treba biti 12 tocaka" [, DOK NASLOVI I PODNASLOVI trebaju biti 14 ili 16]
#   "...prored treba biti 1,5 u glavnom tekstu" [, jednostruki (1) U BILJESKAMA (FUSNOTAMA)]
# Oba nastavka imenuju DIO RADA, i po tome se prepoznaju.
SCOPE_CARVEOUT = re.compile(
    r"(bilje[sš]k\w*|fusnot\w*|podno[žz]\w*|naslov\w*|natpis\w*|tablic\w*|prilog\w*|prilo[žz]\w*|sa[žz]et\w*|literatur\w*|korica\w*|korice)",
    re.I,
)


def is_choice(check_id: str, value, quote: str = "") -> bool:
    if check_id not in CHOICE_AXES:
        return False
    if isinstance(value, list) and len({str(v) for v in value}) > 1:
        # Skup je problem samo ondje gdje engine prima jedan broj.
        return check_id in NUMERIC_AXES
    return bool(quote and choice_narrows_rule(quote, value))


# Osi kojima je RASPON sama odredba: ondje "najmanje 30 stranica" nije ublazavanje nego pravilo.
RANGE_AXES = ("page-count", "reference-count", "word-count")


def value_atoms(value) -> list[str]:
    """Brojevi i nazivi koje vrijednost pravila nosi, u obliku u kojem se traze u recenici."""
    out: list[str] = []
    if isinstance(value, dict):
        for v in value.values():
            out.extend(value_atoms(v))
    elif isinstance(value, list):
        for v in value:
            out.extend(value_atoms(v))
    elif isinstance(value, bool):
        pass
    elif value is not None:
        text = str(value)
        out.extend({text, text.replace(".", ","), text.replace(",", ".")})
    return [a for a in out if a]


# Imenice po kojima se prepoznaje O CEMU kvalifikator govori. Sire od AXIS_WORDS, jer nastavak zna
# govoriti o osi koja se uopce ne boduje (opseg, alat), a upravo to je najcesci lazan nalaz.
GOVERNED_AXES = dict(AXIS_WORDS)
GOVERNED_AXES.update(
    {
        "page-count": r"stranic\w*|kartic\w*|opseg",
        "word-count": r"rije[cč]\w*|znakov\w*",
        "reference-count": r"navod\w*|referenc\w*",
        "_alat": r"ms word|microsoft word|ra[cč]unal\w*|program\w*",
    }
)

# Uspravna orijentacija je ono sto provjera formata ionako pretpostavlja, pa je "Portrait" potvrda,
# ne izmjena. Opasan je samo POLOZENI format (zamijenjene dimenzije), zbog kojeg je rijec i usla u
# rjecnik. Izmjereno na mefst-uputa-diplomski-2021: "Orijentacija: Portrait, Velicina: A4".
UPRIGHT_ORIENTATION = re.compile(r"^(uspravn\w*|portrait)$", re.I)

# Koliko znakova iza kvalifikatora se gleda cime on upravlja. Recenica specifikacije nabraja osi
# gusto, pa dulji doseg pocinje hvatati sljedecu natuknicu.
HEDGE_REACH = 60


def bound_atoms(value) -> set[str]:
    """Brojevi koje pravilo vec drzi kao GRANICU (`min*`, `max*`).

    "najvise do tri (3) razine" uz `maxLevel: 3` nije ublazavanje nego iskaz same granice, isto kao
    "najmanje 30 stranica" kod opsega. Bez ovoga bi svako pravilo s gornjom medjom prijavljivalo
    vlastitu odredbu kao ublazavanje. Margine NISU takav slucaj: ondje su kljucevi strane
    (top/right/bottom/left), pa "najmanje 2,5 cm" ostaje stvaran nalaz jer engine trazi tocno 2,5.
    """
    out: set[str] = set()
    if isinstance(value, dict):
        # `minimum: true` znaci da pravilo vrijednost boduje kao DONJU MEDJU, pa je "najmanje 2,5 cm"
        # iskaz same odredbe, ne ublazavanje. Bez ovoga bi forenzika ostala prijavljena i nakon sto je
        # engine naucio taj pojam (`marginsMinimum`), dakle nalaz bi trazio ono sto je vec ispravljeno.
        if value.get("minimum") is True:
            out.update(a for sub in value.values() for a in value_atoms(sub))
        for key, sub in value.items():
            if re.match(r"^(min|max)", str(key), re.I):
                out.update(value_atoms(sub))
            else:
                out.update(bound_atoms(sub))
    elif isinstance(value, list):
        for sub in value:
            out.update(bound_atoms(sub))
    return {fold(a) for a in out}


def hedge_on_own_clause(quote: str, value, check_id: str) -> str | None:
    """Kvalifikator se prijavljuje SAMO ako upravlja vrijednoscu KOJU PRAVILO BODUJE.

    Prva izvedba trazila je kvalifikator u istoj recenici kao vrijednost. To je 2026-08-22 mjereno
    na svih 46 preostalih nalaza i palo: 43 su bila lazna. Dva razloga, oba sustavna:

      1. Vrijednost tipa `true` (justify, toc, paper-size) nema tekstualni atom, pa je uvjet
         `not atoms` propustao BILO KOJI kvalifikator iz citata.
      2. Recenica specifikacije nabraja sve osi odjednom, pa su "najmanje 20 kartica" i "preporuca
         se MS Word" zavrsavali u istoj recenici kao font i prored.

    Sada se gleda CIME kvalifikator upravlja: gleda se unaprijed od njega, i nalaz vrijedi samo ako
    se prije bilo koje tudje osi pojavi vrijednost ovog pravila (ili, kad vrijednosti nema, rijec
    njegove osi). Time "najmanje 20 kartica ispisanih fontom Times New Roman" vise ne ublazava font,
    a "rubovi moraju biti siroki najmanje 2,5 cm" i dalje ublazava margine.
    """
    if check_id in RANGE_AXES:
        return None  # tamo je raspon sama odredba
    folded = fold(quote)
    atoms = [re.escape(fold(a)) for a in value_atoms(value)]
    own = "|".join(r"(?<!\d)" + a + r"(?!\d)" for a in atoms) if atoms else AXIS_WORDS.get(check_id)
    if not own:
        return None
    bounds = bound_atoms(value)
    for found in QUALIFIERS.finditer(folded):
        if UPRIGHT_ORIENTATION.match(found.group(0)):
            continue
        ahead = folded[found.end() : found.end() + HEDGE_REACH]
        mine = re.search(own, ahead, re.I)
        if not mine:
            continue
        if any(
            (other := re.search(pattern, ahead, re.I)) and other.start() < mine.start()
            for axis, pattern in GOVERNED_AXES.items()
            if axis != check_id
        ):
            continue
        if mine.group(0) in bounds:
            continue  # kvalifikator samo izrice granicu koju pravilo vec boduje
        if isinstance(value, list) and len(value) > 1:
            wide = folded[found.end() : found.end() + 120]
            if sum(1 for v in value if fold(str(v)) in wide) > 1:
                continue  # "moze biti X ili Y", a pravilo boduje OBOJE
        return found.group(0)
    return None


# --- 7. CITAT KOJI NE NOSI VLASTITU VRIJEDNOST -------------------------------------------------
#
# Najskuplji razred za institucionalnu obranu: pravilo boduje vrijednost koju njegov citat uopce ne
# spominje. Fakultet koji pita "pokazite gdje to pise u nasem dokumentu" tu ne dobiva odgovor.
# Nadjeno 2026-08-22 na fhs (`value: "Times New Roman"`, citat govori samo o potpori hrvatskih
# znakova) i na kif (`value: 12`, citat glasi doslovno "velicina fonta").
#
# Provjera je namjerno uska, jer je siroka verzija izmjerena i odbacena: dala je 38 pogodaka od kojih
# je vecina bila lazna. Tri razreda laznih su iskljucena, svaki izmjeren:
#   - JEDINICE. Izvori pisu margine u milimetrima ("lijeva 25 mm"), profil ih drzi u centimetrima
#     (2,5). To je pretvorba, ne izostala vrijednost: 35 od 43 pogotka bilo je upravo to.
#   - TIPFELER U IZVORU. `unizd-pomorski` ima "Marriweather" uz autorovu oznaku [sic]; usporedba
#     imena je zato fuzzy (slicnost 0,92 pri pragu 0,85).
#   - KANONSKI TOKEN. `citation-style` nosi klasifikaciju koju je covjek IZVEO iz opisa
#     (`chicago-notes`, `custom`, `autor-godina`), pa se ta os ne provjerava ovako.
VALUE_IN_QUOTE_NUMERIC = ("font-size", "line-spacing", "margins", "footnote-size", "footnote-spacing")
VALUE_IN_QUOTE_NAMES = ("font",)
LENGTH_AXES = ("margins",)
NAME_SIMILARITY = 0.85


def _length_forms(atom: str) -> set[str]:
    """Isti rub zapisan u cm i u mm: 2,5 cm je "25 mm" u vecini hrvatskih uputa."""
    forms = {atom, atom.replace(".", ","), atom.replace(",", ".")}
    try:
        value = float(atom.replace(",", "."))
    except ValueError:
        return forms
    millimetres = value * 10
    forms.add(f"{millimetres:g}")
    forms.add(f"{millimetres:g}".replace(".", ","))
    return forms


def _name_in_quote(name: str, folded_quote: str) -> bool:
    parts = [p for p in re.split(r"[^a-z0-9]+", fold(str(name))) if len(p) > 2]
    if not parts:
        return False
    if len(parts) > 1:
        return sum(1 for p in parts if p in folded_quote) * 2 >= len(parts)
    words = re.findall(r"[a-z]{4,}", folded_quote)
    return any(
        difflib.SequenceMatcher(None, parts[0], word).ratio() >= NAME_SIMILARITY for word in words
    )


def value_missing_from_quote(check_id: str, value, quote: str) -> list[str]:
    """Dijelovi vrijednosti kojih u vlastitom citatu NEMA. Prazna lista znaci uredan citat."""
    if not quote or value is None:
        return []
    folded_quote = fold(quote)
    if check_id in VALUE_IN_QUOTE_NAMES:
        names = [v for v in (value if isinstance(value, list) else [value]) if v]
        if not names:
            return []
        return [] if any(_name_in_quote(n, folded_quote) for n in names) else [str(n) for n in names]
    if check_id not in VALUE_IN_QUOTE_NUMERIC:
        return []
    missing: list[str] = []
    for atom in sorted(set(value_atoms(value))):
        if not re.search(r"\d", atom):
            continue
        forms = _length_forms(atom) if check_id in LENGTH_AXES else {
            atom,
            atom.replace(".", ","),
            atom.replace(",", "."),
        }
        if not any(form in folded_quote for form in forms):
            missing.append(atom)
    return missing


# --- 8. PREDLOZAK: citat koji opisuje XML paketa, a ne prozu ------------------------------------
#
# Kod obveznih predlozaka (.docx) citat NIJE recenica iz dokumenta nego opis onoga sto predlozak
# stvarno sadrzi: "Normal stil: font Times New Roman, velicina 12pt (w:sz=24), prored 1,5
# (w:line=360 auto)". Usporedjivati to s prozom je kategorijalna greska: cim je revizija 2026-08-22
# pocela citati .docx, tih 28 pravila odmah je palo kao "citat nije doslovan prijepis", uz
# podudaranje od 0 do 19 posto.
#
# Takva tvrdnja se ne izuzima nego PROVJERAVA, i to protiv XML-a koji sama citira. To je jaca
# provenijencija od proze: pravilo se ne poziva na recenicu koju je netko protumacio, nego na
# postavku koju predlozak doista nosi. Izmjereno na svih 28: sve tvrdnje su tocne.
TEMPLATE_XML_QUOTE = re.compile(
    r"\bw:[a-zA-Z]|word/(?:styles|document|settings|numbering)\.xml|sectPr|rFonts|pgSz|pgMar",
    re.I,
)
# "w:sz=24", "w:sz w:val=24", "w:rFonts w:ascii=Times New Roman", "w:line=360 auto".
XML_CLAIM = re.compile(r"\bw:([a-zA-Z]+)\s*(?:w:val\s*)?=\s*\"?([^\",;)]+)")
NEXT_CLAIM = re.compile(r"\s+(?=w:[a-zA-Z]+\s*=)|\s*\(")
# Opseg u kojem tvrdnja mora vrijediti. Prvo je provjera trazila `w:sz="24"` po CIJELOM paketu i
# time je bila vakuumska: predlozak legitimno sadrzi `w:sz="28"` (naslovi) i `w:jc="center"`
# (naslovnica), pa su i IZMISLJENE tvrdnje prolazile. Uhvatio ju je negativni gard, ne citanje.
PAGE_SCOPED = ("pgsz", "pgmar", "pgnumtype", "titlepg", "cols", "docgrid")
_STYLE_NORMAL = re.compile(r"<w:style\b[^>]*w:styleId=\"Normal\".*?</w:style>", re.I | re.S)
_DOC_DEFAULTS = re.compile(r"<w:docDefaults\b.*?</w:docDefaults>", re.I | re.S)
_SECTPR = re.compile(r"<w:sectPr\b.*?</w:sectPr>", re.I | re.S)
_scopes: dict[str, tuple[str, str]] = {}


def template_scopes(path: str) -> tuple[str, str]:
    """(XML stila Normal + docDefaults, XML svih sectPr). Prazno ako se paket ne moze procitati."""
    if path in _scopes:
        return _scopes[path]
    body, page = "", ""
    try:
        import zipfile

        with zipfile.ZipFile(path) as pack:
            names = set(pack.namelist())
            if "word/styles.xml" in names:
                styles = pack.read("word/styles.xml").decode("utf-8", "replace")
                body = " ".join(_STYLE_NORMAL.findall(styles) + _DOC_DEFAULTS.findall(styles))
            if "word/document.xml" in names:
                document = pack.read("word/document.xml").decode("utf-8", "replace")
                page = " ".join(_SECTPR.findall(document))
    except Exception:
        body, page = "", ""
    _scopes[path] = (body, page)
    return _scopes[path]


def template_claims_unmet(rel_path: str, quote: str) -> list[str]:
    """Tvrdnje o XML-u koje predlozak NE potvrdjuje u opsegu na koji se pozivaju.

    Postavke stranice se traze u `w:sectPr`, sve ostalo u stilu `Normal` i `w:docDefaults`, jer
    citat govori bas o njima ("Normal stil: ... w:sz=24").

    Dvije zamke, obje uhvacene mjerenjem na stvarnim citatima, ne citanjem koda:
      - VRIJEDNOST zavrsava na sljedecem `w:` tokenu, a ne tek na zarezu. Bez toga je
        "w:pgSz w:w=11906 w:h=16838 (210x297 mm = A4 format)" dalo vrijednost "11906 w:h=16838
        (210x297 mm = A4 format" i tvrdnja nikad nije mogla proci. Ime fonta s razmacima
        ("w:ascii=Times New Roman") i dalje prolazi jer iza njega nema `w:` tokena.
      - OPSEG se odredjuje po ELEMENTU, ne po atributu. `<w:pgNumType w:fmt="upperRoman"/>` nosi
        atribut `fmt`, koji sam po sebi ne kaze da je rijec o postavci stranice, pa se trazio u
        stilu Normal i nikad nalazio.
    """
    path = os.path.join(ROOT, rel_path.replace("/", os.sep))
    body, page = template_scopes(path)
    if not body and not page:
        return []
    unmet: list[str] = []
    for found in XML_CLAIM.finditer(quote):
        name, raw = found.group(1), found.group(2)
        raw = NEXT_CLAIM.split(raw, 1)[0].strip().rstrip(".,;:")
        claimed = fold(raw)
        if not claimed:
            continue
        lead = fold(quote[max(0, found.start() - 40) : found.start()] + name)
        scope = page if any(word in lead for word in PAGE_SCOPED) else body
        if not scope:
            continue
        actual = re.findall(rf"w:{re.escape(name)}(?:[^>]*?)\bw:val=\"([^\"]*)\"", scope, re.I)
        actual += re.findall(rf"\bw:{re.escape(name)}=\"([^\"]*)\"", scope, re.I)
        if not any(
            fold(v).startswith(claimed) or claimed.startswith(fold(v)) for v in actual if v
        ):
            unmet.append(f"w:{name}={raw}")
    return unmet


def collect_scored() -> list[dict]:
    """Sva `verified` + `scored` pravila iz staging draftova, s profilom uz svako."""
    rows: list[dict] = []
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "profiles", "*", "drafts", "*.json"))):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception:
            continue
        groups = data["profiles"].items() if "profiles" in data else [(data.get("profileId"), data.get("entries", []))]
        for profile_id, entries in groups:
            for entry in entries or []:
                if entry.get("status") == "verified" and entry.get("scored"):
                    rows.append({"profileId": profile_id, "entry": entry})
    return rows


def main() -> None:
    out_flag = sys.argv.index("--json") if "--json" in sys.argv else -1
    out_path = sys.argv[out_flag + 1] if out_flag > -1 else os.path.join(ROOT, "docs", "generated", "scored-quote-audit.json")

    with open(os.path.join(ROOT, "data", "sources", "source-registry.json"), encoding="utf-8") as fh:
        registry = {s["id"]: s for s in json.load(fh)}

    # Priznati nalazi: vlasnik ih je procitao i odlucio ostaviti bodovanima. Postoje da stvaran NOV
    # nalaz ne bi nestao u sumu vec odlucenih; ne mijenjaju bodovanje niti tvrde da nalaz nije tocan.
    known_path = os.path.join(ROOT, "data", "verification", "known-findings.json")
    acknowledged: dict[str, set[str]] = {}
    if os.path.exists(known_path):
        with open(known_path, encoding="utf-8") as fh:
            for item in json.load(fh).get("acknowledged", []):
                for rule_id in item.get("ruleIds", []):
                    acknowledged.setdefault(rule_id, set()).add(item.get("finding", ""))

    rows = collect_scored()
    findings: list[dict] = []
    unreadable = 0
    inconclusive = 0

    for row in rows:
        entry = row["entry"]
        source = registry.get(entry.get("sourceId")) or {}
        rel = str(source.get("snapshotPath") or "").replace(chr(92), "/")
        quote = squash(entry.get("quote") or "")
        check_id = entry.get("checkId", "")

        # Usporedba citata s VLASTITOM vrijednoscu ne treba izvor, pa ide PRIJE vrata citljivosti.
        # Inace bi ispala bas ondje gdje je najkorisnija: `grf` (.doc), `vevu` (.docx) i `ffri-povum`
        # (potpuno skeniran PDF) su rulesi kojima se nista drugo ne moze provjeriti, a i dalje se
        # moze vidjeti da im citat ne spominje vrijednost koju boduju.
        missing_value = value_missing_from_quote(check_id, entry.get("value"), quote)
        value_problem = (
            [f"vrijednost pravila ne stoji u vlastitom citatu (nedostaje: {', '.join(missing_value)})"]
            if missing_value
            else []
        )

        def record_unverifiable() -> None:
            """Izvor se ne moze procitati, ali nalaz o citatu i dalje vrijedi."""
            if value_problem:
                known = acknowledged.get(entry.get("ruleId"), set())
                fresh = [p for p in value_problem if not any(p.startswith(k) for k in known)]
                if fresh:
                    findings.append(
                        {
                            "profileId": row["profileId"],
                            "ruleId": entry.get("ruleId"),
                            "checkId": check_id,
                            "sourceId": entry.get("sourceId"),
                            "snapshot": rel,
                            "quote": entry.get("quote"),
                            "problems": fresh,
                        }
                    )

        if not rel.lower().endswith((".pdf", ".docx", ".doc")):
            # .doc / .docx / .html / .rar se ovdje NE citaju. Prijavljuje se kao NEREVIDIRANO, ne kao
            # uredno: sutnja o neprovjerenom je isti kvar kao lazno zeleno.
            unreadable += 1
            record_unverifiable()
            continue

        text = document_text(rel)
        if not text:
            unreadable += 1
            record_unverifiable()
            continue

        # Predlozak: citat opisuje XML paketa, pa se provjerava PROTIV NJEGA i proza se preskace.
        # Blok mora stajati PRIJE usporedbe s tekstom: dok je stajao iza nje, ista su pravila
        # dobivala oba nalaza, i "citat nije doslovan prijepis" (podudaranje 0 do 19 posto) i
        # ispravan nalaz o predlosku.
        if rel.lower().endswith(".docx") and TEMPLATE_XML_QUOTE.search(quote or ""):
            problems = list(value_problem)
            unmet = template_claims_unmet(rel, quote)
            if unmet:
                problems.append(
                    f"predlozak ne sadrzi ono sto citat tvrdi (nedostaje: {', '.join(unmet)})"
                )
            known = acknowledged.get(entry.get("ruleId"), set())
            problems = [p for p in problems if not any(p.startswith(k) for k in known)]
            if problems:
                findings.append(
                    {
                        "profileId": row["profileId"],
                        "ruleId": entry.get("ruleId"),
                        "checkId": check_id,
                        "sourceId": entry.get("sourceId"),
                        "snapshot": rel,
                        "quote": entry.get("quote"),
                        "problems": problems,
                    }
                )
            continue

        problems: list[str] = []
        if not quote:
            problems.append("bez citata")
        elif not quote_found(text, quote) and (has_scanned_pages(rel) or text_layer_damaged(rel)):
            # Citat vjerojatno dolazi sa SKENIRANE stranice, preuzet OCR-om. To nije nalaz nego
            # granica alata, i broji se kao nerevidirano, ne kao kvar.
            inconclusive += 1
        elif not quote_found(text, quote):
            cov = quote_coverage(text, quote)
            if cov >= COVERAGE_MIN:
                problems.append(f"BROJEVI iz citata ne stoje u odlomku koji citat opisuje (rijeci se poklapaju {cov:.0%})")
            else:
                # Formulacija je 2026-08-22 promijenjena iz "citat se NE nalazi u dokumentu".
                # Stara je citana kao optuzba da je pravilo izmisljeno, pa je jedna cijela sesija
                # potrosena na 188 navodno izmisljenih pravila; citanje izvora pokazalo je da su
                # citati UREDNI PRIJEPISI natucnickih popisa, sa svim vrijednostima na mjestu.
                # Nalaz je o SLJEDIVOSTI (koliko je citat doslovan), ne o bodovanju.
                problems.append(f"citat nije doslovan prijepis (podudaranje rijeci {cov:.0%})")

        qualifier = hedge_on_own_clause(quote, entry.get("value"), check_id) if quote else None
        if qualifier:
            problems.append(f"kvalifikator u citatu bodovanog pravila: '{qualifier}'")

        disclaimer = vrc.document_disclaimer(rel)
        if disclaimer:
            problems.append(f"dokument se odrice (str. {disclaimer['page']}: '{disclaimer['phrase']}')")

        problems.extend(value_problem)


        if is_choice(check_id, entry.get("value"), quote or ""):
            problems.append("vrijednost je SKUP, ne ciljana vrijednost")

        tail = truncated_tail(text, quote, check_id, entry.get("value")) if quote and quote in text else None
        if tail:
            problems.append(f"citat odsjecen, recenica se nastavlja: {tail[:110]}")

        known = acknowledged.get(entry.get("ruleId"), set())
        # Nalaz se priznaje samo ako je TE VRSTE; nova vrsta nalaza na istom pravilu je i dalje nova.
        fresh = [p for p in problems if not any(p.startswith(k) for k in known)]
        if fresh and len(fresh) != len(problems):
            problems = fresh
        elif not fresh and problems:
            problems = []

        if problems:
            findings.append(
                {
                    "profileId": row["profileId"],
                    "ruleId": entry.get("ruleId"),
                    "checkId": check_id,
                    "sourceId": entry.get("sourceId"),
                    "snapshot": rel,
                    "quote": quote[:200],
                    "problems": problems,
                }
            )

    ack_rules = sum(1 for r in rows if acknowledged.get(r["entry"].get("ruleId")))
    audited = len(rows) - unreadable
    by_kind: dict[str, int] = {}
    for f in findings:
        for p in f["problems"]:
            kind = p.split(":")[0].split("(")[0].strip()
            by_kind[kind] = by_kind.get(kind, 0) + 1

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"schemaVersion": 1, "audited": audited, "unreadable": unreadable, "findings": findings}, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print("=== Revizija bodovanih pravila protiv izvora ===")
    print(f"bodovanih pravila: {len(rows)}")
    print(f"  revidirano (PDF snapshot citljiv): {audited}")
    print(f"  NEREVIDIRANO (doc/docx/html/rar ili necitljiv PDF): {unreadable}")
    print(f"  NEPROVJERIVO (citat je sa skenirane stranice, preuzet OCR-om): {inconclusive}")
    print(f"  pravila s NOVIM nalazom: {len(findings)}")
    print(f"  pravila s priznatim nalazom (odluceno, vidi data/verification/known-findings.json): {ack_rules}")
    print("")
    for kind, count in sorted(by_kind.items(), key=lambda kv: -kv[1]):
        print(f"  {count:5}  {kind}")
    print("")
    print(f"zapisano: {os.path.relpath(out_path, ROOT)}")
    print("Nalaz NIJE presuda: to je razlog da se dokument procita.")


if __name__ == "__main__":
    main()
