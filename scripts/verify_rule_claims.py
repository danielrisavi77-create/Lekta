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
# Roman ili Arial"); provjera fonta vec radi nad popisom dopustenih. Za brojcane osi nije.
SINGLE_VALUED = ("font-size", "line-spacing", "margins")


def is_choice(check_id: str, value, quote: str) -> bool:
    if check_id not in SINGLE_VALUED:
        return False
    if isinstance(value, list) and len({str(v) for v in value}) > 1:
        return True
    # Izbor zapisan u samom citatu ("12 ili 14"), a tvrdnja navodi samo jednu stranu.
    return bool(re.search(r"\d\s*(pt|to[čc]\w*|cm|mm)?\s+ili\s+\d", quote, re.I))


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


def value_tokens(check_id: str, value) -> list[list[str]]:
    """Za svaki dio vrijednosti vraca DOPUSTENE zapise; svaki dio mora imati barem jedan pogodak."""
    if check_id == "paper-size":
        # "A-4" i "A 4" su isti format. Bez ovoga verifikator odbacuje TOCNU tvrdnju: izmjereno na
        # alu-okiru uputama, gdje citat glasi "Diplomski rad se pise u formatu A-4".
        return [["A4", "A-4", "A 4"]]
    if check_id == "font":
        return [[str(v)] for v in (value if isinstance(value, list) else [value])]
    if check_id in ("font-size", "line-spacing"):
        raw = value if not isinstance(value, list) else value[0]
        return [numeric_forms(raw)]
    if check_id == "margins":
        vals = list(value.values()) if isinstance(value, dict) else [value]
        # Jednake margine se u uputama navode JEDNOM ("2.5 cm sa svih strana"), pa se traze
        # razlicite vrijednosti, ne cetiri ponavljanja iste.
        unique = sorted({str(v) for v in vals})
        return [numeric_forms(v) for v in unique]
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

    groups = value_tokens(check_id, value)
    if not groups:
        derivable = False
        reasons.append(f"za checkId '{check_id}' nema pravila izvoda (vrijednost se ne moze mehanicki provjeriti)")
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
        "mechanicalPass": anchored and derivable,
        "needsHuman": bool(qualifier) or bool(disclaimer) or choice or bool(tail),
        "reasons": reasons,
    }


def main() -> None:
    if len(sys.argv) < 2:
        print("Upotreba: python scripts/verify_rule_claims.py <claims.json>", file=sys.stderr)
        raise SystemExit(2)
    with open(sys.argv[1], encoding="utf-8") as fh:
        payload = json.load(fh)
    claims = payload["claims"] if isinstance(payload, dict) else payload

    results = [verify(c) for c in claims]
    ok = [r for r in results if r["mechanicalPass"]]
    human = [r for r in ok if r["needsHuman"]]

    out_path = os.path.splitext(sys.argv[1])[0] + ".verified.json"
    with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"schemaVersion": 1, "results": results}, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print("=== Mehanicka provjera tvrdnji ===")
    print(f"tvrdnji: {len(results)}")
    print(f"  prolazi mehanicki (sidro + izvod): {len(ok)}")
    print(f"  od toga trazi ljudsku odluku (kvalifikator): {len(human)}")
    print(f"  pada: {len(results) - len(ok)}")
    for r in results:
        if not r["mechanicalPass"]:
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
