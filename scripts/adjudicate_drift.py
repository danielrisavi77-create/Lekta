"""
Priprema PRESUDE za raskorak izmedju verificirane tvrdnje i vrijednosti koju motor boduje.

    python scripts/adjudicate_drift.py [--json putanja]

Sto radi: za svaki raskorak iz `data/verification/scored-value-drift.json` cita SNAPSHOT izvora i
odgovara na jedno mehanicko pitanje: **pojavljuje li se u tom dokumentu uopce vrijednost koju motor
boduje?** To je jedini dio presude koji stroj smije donijeti, i on sam suzuje odluku na tri slucaja:

  claim-supported : izvor nosi vrijednost TVRDNJE, a ne onu koju motor boduje -> zrcalo je krivo;
  engine-supported: izvor nosi vrijednost MOTORA, a ne onu iz tvrdnje -> tvrdnja je kriva;
  both-present    : izvor nosi obje -> pitanje opsega ili hijerarhije, trazi citanje;
  neither         : izvor ne nosi nijednu -> obje su sumnjive, pravilo ide na reverifikaciju.

Uz to se provjerava i najostrija stvar: **nalazi li se citat same tvrdnje u dokumentu koji citira**.
Izmjereno na `vuka-strojarski-*`: citat glasi "Lijeva margina 3.0 cm Gornja margina 3.0 cm...", a u
cijelom dokumentu niz "3,0 cm" ne postoji nijednom; dokument o marginama kaze tocno jedno:
"margine 2,0 cm (desno, gore i dolje) i 2,5 cm (lijevo)". Tvrdnja je `verified` i ljudski potpisana.

SKRIPT NE ODLUCUJE koja je strana tocna. Razred A nije dokaz da je tvrdnja tocna: dokument moze biti
odsjecki, zastario ili nadjacan drugim aktom. Skript samo kaze gdje treba gledati, po istom ugovoru
kao `extract_rule_candidates.py`.

Zasto uopce: 40 raskoraka stoji na 18 razlicitih dokumenata. Citanje po dokumentu, ne po pravilu, je
postupak koji se vec pokazao ispravnim (68 pravila = 53 jedinice, 43 = 8 jedinica).
"""

from __future__ import annotations

import glob
import importlib.util
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DRIFT = os.path.join(ROOT, "data", "verification", "scored-value-drift.json")
REGISTRY = os.path.join(ROOT, "data", "sources", "source-registry.json")

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    print("PyMuPDF nije instaliran: pip install pymupdf", file=sys.stderr)
    raise SystemExit(1)


def fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text or "")
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", stripped.lower().replace("đ", "d"))


# Citanje izvora se NE pise ponovno nego posudjuje od revizije: ona vec zna PDF, `.docx` (zip s
# XML-om), naslijedjeni `.doc` (OLE tablica komada), HTML i pratitelje `<ime>-ocr.txt` /
# `<ime>-text.txt`. Prva izvedba ovdje citala je samo PDF, pa je 8 raskoraka ispadalo "necitljivo"
# iako su im izvori `.docx` koji revizija bez problema cita. Dvije izvedbe istog citanja bi k tome
# neizbjezno odlutale jedna od druge.
_audit_spec = importlib.util.spec_from_file_location(
    "_audit", os.path.join(os.path.dirname(os.path.abspath(__file__)), "audit_scored_quotes.py")
)
_audit = importlib.util.module_from_spec(_audit_spec)
_audit_spec.loader.exec_module(_audit)


def doc_text(rel: str) -> str:
    return _audit.document_text(rel)


def atom_groups(value) -> list[list[str]]:
    """Po JEDNA skupina za svaku razlicitu vrijednost; unutar skupine su njezini ZAPISI.

    Grupiranje je bitno, ne kozmetika: "2", "2,0" i "2.0" su isti broj, pa je dovoljno da se pojavi
    bilo koji. Prva izvedba je trazila SVE zapise i time postala to stroza sto je vise zapisa
    poznavala, pa je `vuka-strojarski` ispao "izvor ne nosi nijednu stranu" iako doslovno pise
    "margine 2,0 cm (desno, gore i dolje) i 2,5 cm (lijevo)".
    """
    values: list[str] = []

    def walk(v):
        if isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)
        elif isinstance(v, bool) or v is None:
            pass
        else:
            values.append(str(v))

    walk(value)
    groups: list[list[str]] = []
    seen: set[str] = set()
    for text in values:
        key = text.replace(",", ".")
        if key in seen:
            continue
        seen.add(key)
        forms = {text, text.replace(".", ","), text.replace(",", ".")}
        if text.endswith(".0"):
            forms.add(text[:-2])
        if re.fullmatch(r"\d+", text):
            forms.update({f"{text},0", f"{text}.0"})
        groups.append(sorted(forms))
    return groups


# Broj bez MJERNE JEDINICE nije vrijednost pravila. Bez ovoga "2,5" pogadja broj stranice, redni
# broj clanka, godinu i pola tablice, pa bi svaki margins raskorak ispao razred C ("vrijednost motora
# postoji u izvoru") iako se u dokumentu nigdje ne govori o marginama od 2,5 cm. Isti razred kvara
# koji je revizija vec izmjerila kod oznaka mjesta ("Tablica 1", "Cl. 48").
UNIT_AFTER = re.compile(r"^\s*(cm|mm|pt|tock\w*|tocaka|inc\w*)")
NUMERIC = re.compile(r"^\d+([.,]\d+)?$")


def find_windows(text: str, needle: str, radius: int = 110) -> list[str]:
    """Ulomci oko pojave niza, do tri. Za BROJ se trazi mjerna jedinica odmah iza njega."""
    folded = fold(text)
    target = fold(needle)
    if not target:
        return []
    numeric = bool(NUMERIC.match(target))
    out: list[str] = []
    start = 0
    while len(out) < 3:
        at = folded.find(target, start)
        if at < 0:
            break
        end = at + len(target)
        start = end
        if numeric:
            # Znamenka slijeva znaci da smo pogodili SREDINU drugog broja (12,5 nije 2,5).
            if at > 0 and folded[at - 1].isdigit():
                continue
            if not UNIT_AFTER.match(folded[end : end + 12]):
                continue
        out.append(folded[max(0, at - radius) : end + radius].strip())
    return out


def bigrams(text: str) -> list[str]:
    words = [w for w in re.findall(r"[a-z0-9]+", fold(text)) if w]
    return [f"{a} {b}" for a, b in zip(words, words[1:])]


# Citat koji OPISUJE POSTAVKE PAKETA, a ne recenicu iz dokumenta. Prepoznaje se po OOXML oznakama
# koje autor navodi kao dokaz (`w:sz=24`, `w:line=360`, `w:jc=both`, `w:pgMar`).
#
# Zasto to mora biti zaseban razred: `document_text` cita VIDLJIVI tekst, a te postavke zive u
# `word/styles.xml` i `<w:sectPr><w:pgMar>`, dakle u atributima. Pokrivanje takvog citata ispada
# 0,08, sto je NIZE od `vuka` (0,21) koji je doista izmisljen. Bez razlikovanja bi sest ispravnih
# `ffst-*` pravila bilo optuzeno za izmisljanje. Provjereno rucno na
# `ffst-predlozak-zavrsnoga-diplomskoga-final.docx`: Normal stil nosi w:ascii="Times New Roman",
# w:sz=24 (12 pt), w:line=360 (1,5), w:jc=both, a pgMar 1440 twipsa (2,54 cm) sa svih strana,
# dakle tocno ono sto tvrdnje kazu.
#
# NAPOMENA ZA PRESUDU, ne za stroj: predlozak OPISUJE, ne propisuje. FER pilot je pao tocno na tome
# (`line-spacing = 1.2` bio je opis predloska). Je li predlozak obvezujuc je pitanje hijerarhije
# izvora i ostaje covjeku.
OOXML_MARKER = re.compile(r"w:(sz|line|jc|pgMar|ascii|spacing)\s*=|<w:", re.I)


def quote_describes_settings(quote: str) -> bool:
    return bool(OOXML_MARKER.search(quote or ""))


def quote_coverage(text: str, quote: str) -> float:
    """Udio parova rijeci iz citata koji stoje u dokumentu. Broj, ne boolean.

    Boolean je ovdje bio opasan i to je izmjereno: od 11 citata koje je prag 0,85 proglasio
    odsutnima, DEVET je bilo na 0,62-0,81, dakle parafraza ili urednička napomena, a samo dva na
    0,21, dakle stvarno odsutna. `unizd-pomorski` gubi parove iskljucivo na umetku
    "[sic - tipfeler u izvoru]" koji je autor STAVIO U CITAT; ostatak recenice stoji doslovno.
    Da se flagalo po booleanu, devet ispravnih pravila bi bilo oznaceno kao izmisljena.
    """
    pairs = bigrams(quote)
    if not pairs:
        return 0.0
    have = set(bigrams(text))
    return sum(1 for p in pairs if p in have) / len(pairs)


def quote_present(text: str, quote: str, minimum: float = 0.85) -> bool:
    """Nalazi li se citat u dokumentu, mjereno pokrivanjem parova rijeci.

    Doslovna usporedba ovdje ne valja i to je vec izmjereno: profilni `quote` NIJE fotografija
    teksta nego uredan prijepis (dijakritika ogoljena OCR-om, izostavljanja bez oznake,
    normalizirana interpunkcija). Prag 0,85 je isti kao u `audit_scored_quotes.py`.
    """
    pairs = bigrams(quote)
    if not pairs:
        return False
    have = set(bigrams(text))
    return sum(1 for p in pairs if p in have) / len(pairs) >= minimum


def quote_position(text: str, quote: str) -> int:
    """Gdje u dokumentu stoji citat. -1 ako se ne nalazi (citat je uredan prijepis, ne fotografija)."""
    folded = fold(text)
    fq = fold(quote)
    at = folded.find(fq)
    if at >= 0:
        return at
    # Citat je redovito skracen ili normaliziran; probaj prvih 60 znakova.
    head = fq[:60]
    return folded.find(head) if head else -1


def main() -> None:
    out_flag = sys.argv.index("--json") if "--json" in sys.argv else -1
    out_path = (
        sys.argv[out_flag + 1]
        if out_flag > -1
        else os.path.join(ROOT, "docs", "generated", "drift-adjudication.json")
    )

    with open(DRIFT, encoding="utf-8") as fh:
        drift = json.load(fh)
    with open(REGISTRY, encoding="utf-8") as fh:
        sources = {s["id"]: s for s in json.load(fh)}

    # Citat po ruleId: provjera "je li citat uopce u svom izvoru" je najostrija od svih, jer pada i
    # kad su obje vrijednosti obranjive.
    quotes: dict[str, str] = {}
    for path in glob.glob(os.path.join(ROOT, "data", "profiles", "*", "drafts", "*.json")):
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        groups = data["profiles"].items() if "profiles" in data else [(data.get("profileId"), data.get("entries", []))]
        for _profile_id, entries in groups:
            for entry in entries or []:
                if entry.get("ruleId") and entry.get("quote"):
                    quotes[entry["ruleId"]] = entry

    rows = []
    counts: dict[str, int] = {}
    for finding in drift["findings"]:
        if finding["kind"] != "drift":
            continue
        src = sources.get(finding.get("sourceId") or "")
        snapshot = (src or {}).get("snapshotPath")
        text = doc_text(snapshot) if snapshot else ""
        entry = quotes.get(finding["ruleId"]) or {}
        quote = entry.get("quote") or ""
        quote_cov = round(quote_coverage(text, quote), 2) if (text and quote) else None
        quote_in_source = (quote_cov >= 0.85) if quote_cov is not None else None
        if not text:
            verdict = "unreadable"
            evidence: list[str] = []
            engine_atoms: list[str] = []
            missing: list[str] = []
            claim_missing: list[str] = []
        else:
            def probe(groups):
                """Po skupini: prvi zapis koji se nadje. Skupina bez ijednog pogotka nedostaje."""
                hits, gone = [], []
                for group in groups:
                    window = next((w for form in group for w in find_windows(text, form)[:1]), None)
                    (hits.append(window) if window else gone.append(" / ".join(group)))
                return hits, gone

            engine_groups = atom_groups(finding.get("scoredValue"))
            claim_groups = atom_groups(finding.get("claimValue"))
            engine_windows, missing = probe(engine_groups)
            claim_windows, claim_missing = probe(claim_groups)
            # Dokaz je korisniji kad pokazuje OBJE strane jednu do druge.
            evidence = claim_windows[:2] + engine_windows[:2]
            engine_atoms = [f for g in engine_groups for f in g]
            engine_ok = bool(engine_groups) and not missing
            claim_ok = bool(claim_groups) and not claim_missing
            if engine_ok and claim_ok:
                verdict = "both-present"
            elif claim_ok:
                verdict = "claim-supported"
            elif engine_ok:
                verdict = "engine-supported"
            else:
                verdict = "neither"
        counts[verdict] = counts.get(verdict, 0) + 1
        rows.append(
            {
                "profileId": finding["profileId"],
                "ruleId": finding["ruleId"],
                "checkId": finding["checkId"],
                "sourceId": finding.get("sourceId"),
                "snapshot": snapshot,
                "claimValue": finding.get("claimValue"),
                "engineValue": finding.get("scoredValue"),
                "engineAtomsMissingFromSource": missing,
                "claimAtomsMissingFromSource": claim_missing if text else [],
                "claimQuoteInSource": quote_in_source,
                # Broj uz boolean: 0,2 je odsutan citat, 0,8 je parafraza. Bez broja se to ne
                # razlikuje, a razlika je izmedju "izmisljeno" i "uredan prijepis".
                "claimQuoteCoverage": quote_cov,
                # Kad je citat opis postavki paketa, pokrivanje nad vidljivim tekstom nije mjera
                # istinitosti nego mjera krive usporedbe.
                "claimQuoteKind": "package-settings" if quote_describes_settings(quote) else "text",
                "verdict": verdict,
                "evidence": evidence,
            }
        )

    rows.sort(key=lambda r: (r["verdict"], r["sourceId"] or "", r["profileId"]))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"schemaVersion": 1, "counts": counts, "rows": rows}, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print("=== Priprema presude za raskorake ===")
    print(f"raskoraka: {len(rows)}")
    for key in sorted(counts):
        print(f"  {key}: {counts[key]}")
    print("")
    print("claim-supported  = izvor nosi vrijednost TVRDNJE, ne onu koju motor boduje -> zrcalo je krivo")
    print("engine-supported = izvor nosi vrijednost MOTORA, ne onu iz tvrdnje -> tvrdnja je kriva")
    print("both-present     = izvor nosi obje -> pitanje opsega ili hijerarhije, trazi citanje")
    print("neither          = izvor ne nosi nijednu -> pravilo ide na reverifikaciju")
    print(f"zapisano: {os.path.relpath(out_path, ROOT)}")
    print("SKRIPT NE ODLUCUJE koja je strana tocna; kaze samo gdje treba gledati.")


if __name__ == "__main__":
    main()
