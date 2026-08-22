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
    return stripped.replace("đ", "d").replace("Đ", "D").lower()


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


def document_text(rel_path: str) -> str:
    """Spojeni tekst cijelog PDF-a, normaliziran. Prazan string ako se ne moze procitati."""
    if rel_path in _doc_text:
        return _doc_text[rel_path]
    text = ""
    path = os.path.join(ROOT, rel_path.replace("/", os.sep))
    if os.path.exists(path) and path.lower().endswith(".pdf"):
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


def truncated_tail(full_text: str, quote: str) -> str | None:
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
    return tail


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


def hedge_on_own_clause(quote: str, value, check_id: str) -> str | None:
    """Kvalifikator se prijavljuje SAMO ako stoji u istoj recenici kao vrijednost pravila.

    Bez ovog suzenja provjera je dala 43 nalaza od kojih je citanjem izvora 35 ispalo lazno, uvijek
    istim obrascem: citat obuhvaca vise recenica, ublazavanje pripada onoj o OPSEGU, a odredba o
    obliku stoji u drugoj i nosi "mora" ili goli indikativ. Primjer (fizri): "Diplomski rad MORA
    biti otisnut ... na papiru formata A4 ... PREPORUCA SE da diplomski rad ima najvise 100 stranica.
    Glavni tekst MORA imati velicinu slova 12". Ublazavanje se odnosi na 100 stranica, a bodovani su
    format, velicina i prored, svi s "mora".
    """
    if check_id in RANGE_AXES:
        return None  # tamo je raspon sama odredba
    atoms = value_atoms(value)
    sentences = [s for s in re.split(r"(?<=[.!?;])\s+", quote) if s.strip()]
    for sentence in sentences:
        found = QUALIFIERS.search(sentence)
        if not found:
            continue
        low = fold(sentence)
        if not atoms or any(fold(a) in low for a in atoms):
            return found.group(0)
    return None


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

        if not rel.lower().endswith(".pdf"):
            # .doc / .docx / .html / .rar se ovdje NE citaju. Prijavljuje se kao NEREVIDIRANO, ne kao
            # uredno: sutnja o neprovjerenom je isti kvar kao lazno zeleno.
            unreadable += 1
            continue

        text = document_text(rel)
        if not text:
            unreadable += 1
            continue

        problems: list[str] = []
        if not quote:
            problems.append("bez citata")
        elif not quote_found(text, quote) and has_scanned_pages(rel):
            # Citat vjerojatno dolazi sa SKENIRANE stranice, preuzet OCR-om. To nije nalaz nego
            # granica alata, i broji se kao nerevidirano, ne kao kvar.
            inconclusive += 1
        elif not quote_found(text, quote):
            cov = quote_coverage(text, quote)
            if cov >= COVERAGE_MIN:
                problems.append(f"BROJEVI iz citata ne stoje u odlomku koji citat opisuje (rijeci se poklapaju {cov:.0%})")
            else:
                problems.append(f"citat se NE nalazi u dokumentu (podudaranje {cov:.0%})")

        qualifier = hedge_on_own_clause(quote, entry.get("value"), check_id) if quote else None
        if qualifier:
            problems.append(f"kvalifikator u citatu bodovanog pravila: '{qualifier}'")

        disclaimer = vrc.document_disclaimer(rel)
        if disclaimer:
            problems.append(f"dokument se odrice (str. {disclaimer['page']}: '{disclaimer['phrase']}')")

        if is_choice(check_id, entry.get("value"), quote or ""):
            problems.append("vrijednost je SKUP, ne ciljana vrijednost")

        tail = truncated_tail(text, quote) if quote and quote in text else None  # samo za doslovne
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
