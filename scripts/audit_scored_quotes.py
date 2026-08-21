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


def numbers_match(full_text: str, quote: str) -> bool:
    """Brojevi iz citata moraju stajati u ODLOMKU koji citat opisuje, ne bilo gdje u dokumentu.

    Ovo je dodano nakon sto je mjera po parovima rijeci PALA na poznatom stvarnom promasaju:
    `alu-kiparstvo-diplomski--*` nosi citat "najmanje 10 a najvise 20 kartica", a odjeljak na tom
    mjestu glasi "najmanje 5 a najvise 15" (to je Slikarski odsjek). Rijeci se poklapaju gotovo sve,
    razlikuju se samo brojevi, a upravo brojevi su ono sto se boduje. Provjera po cijelom dokumentu
    ne bi pomogla, jer se "10" i "20" negdje drugdje sigurno pojavljuju.
    """
    wanted = NUM.findall(quote)
    if not wanted:
        return True
    index = doc_index(full_text)
    folded = index["folded"]
    # Ako citat doslovno stoji u dokumentu, brojevi su time vec dokazani.
    fq = fold(squash(quote))
    at = folded.find(fq)
    span = max(len(fq), 80)
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
    window = folded[max(0, at - 40) : at + span + 40]
    present = set(NUM.findall(window)) | {n.replace(",", ".") for n in NUM.findall(window)}
    return all(n in present or n.replace(",", ".") in present for n in wanted)


def quote_found(full_text: str, quote: str) -> bool:
    return quote_coverage(full_text, quote) >= COVERAGE_MIN and numbers_match(full_text, quote)

# Osi na kojima skup dopustenih vrijednosti nije ciljana vrijednost (isto kao kod tvrdnji).
NUMERIC_AXES = ("font-size", "line-spacing", "margins")

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
    return tail.strip() if re.search(r"\d", tail) else None


def is_choice(check_id: str, value) -> bool:
    if check_id not in NUMERIC_AXES:
        return False
    if isinstance(value, list) and len({str(v) for v in value}) > 1:
        return True
    return False


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

    rows = collect_scored()
    findings: list[dict] = []
    unreadable = 0

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
        elif not quote_found(text, quote):
            cov = quote_coverage(text, quote)
            if cov >= COVERAGE_MIN:
                problems.append(f"BROJEVI iz citata ne stoje u odlomku koji citat opisuje (rijeci se poklapaju {cov:.0%})")
            else:
                problems.append(f"citat se NE nalazi u dokumentu (podudaranje {cov:.0%})")

        qualifier = QUALIFIERS.search(quote) if quote else None
        if qualifier:
            problems.append(f"kvalifikator u citatu bodovanog pravila: '{qualifier.group(0)}'")

        disclaimer = vrc.document_disclaimer(rel)
        if disclaimer:
            problems.append(f"dokument se odrice (str. {disclaimer['page']}: '{disclaimer['phrase']}')")

        if is_choice(check_id, entry.get("value")):
            problems.append("vrijednost je SKUP, ne ciljana vrijednost")

        tail = truncated_tail(text, quote) if quote and quote in text else None  # samo za doslovne
        if tail:
            problems.append(f"citat odsjecen, recenica se nastavlja: {tail[:110]}")

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
    print(f"  pravila s barem jednim nalazom: {len(findings)}")
    print("")
    for kind, count in sorted(by_kind.items(), key=lambda kv: -kv[1]):
        print(f"  {count:5}  {kind}")
    print("")
    print(f"zapisano: {os.path.relpath(out_path, ROOT)}")
    print("Nalaz NIJE presuda: to je razlog da se dokument procita.")


if __name__ == "__main__":
    main()
