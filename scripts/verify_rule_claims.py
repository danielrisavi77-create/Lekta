"""
MEHANICKA provjera tvrdnji o pravilima - bez modela, bez prosudbe.

    python scripts/verify_rule_claims.py <claims.json>

Zasto postoji: tri agenta koja citaju isti tekst dijele iste sljepoce. Ako model sustavno procita
"od ruba barem 2.5 cm (do 3 cm)" kao margins=2.5, sva tri ce pogrijesiti jednako i slozno -
slaganje NIJE tocnost. Ove provjere su determinsticke i zato hvataju ono sto agentski pregled ne
moze: izmisljen citat, citat s krive stranice, i vrijednost koja se iz citata ne moze izvesti.

Tri provjere po tvrdnji:
  1. SIDRO   - citat se doslovno nalazi u tekstu NAVEDENE stranice (usporedba bez viska razmaka).
  2. IZVOD   - vrijednost se moze izvesti iz citata (broj/naziv se u njemu doista pojavljuje).
  3. KVALIFIKATOR - citat sadrzi rijec koja mijenja znacenje ("preporuceni", "barem", "do",
     "iznimno", "najmanje"). To NIJE greska nego zastavica: takva tvrdnja ide covjeku, jer odluka
     je li nesto obveza ili preporuka nije citanje nego politika bodovanja.

Izlaz je presuda po tvrdnji; skript nikad ne mijenja podatke.
"""

from __future__ import annotations

import json
import os
import re
import sys

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
    r"\b(preporu[čc]\w*|barem|najmanje|najvi[šs]e|do\s+\d|iznimno|mo[žz]e\s+(se|koristi)"
    r"|po[žz]eljno|okvirno|u\s+pravilu|ukoliko|ako\s+se|u\s+slu[čc]aju|ovisno\s+o"
    r"|po\s+dogovoru|s\s+mentorom|ili\s+sli[čc]an|neka\s+bude)\b",
    re.I,
)

_page_cache: dict[tuple[str, int], str] = {}


def squash(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


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


def value_tokens(check_id: str, value) -> list[list[str]]:
    """Za svaki dio vrijednosti vraca DOPUSTENE zapise; svaki dio mora imati barem jedan pogodak."""
    if check_id == "paper-size":
        return [["A4"]]
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
    return {
        **claim,
        "anchored": anchored,
        "derivable": derivable,
        "qualifier": qualifier.group(0) if qualifier else None,
        # `pass` znaci samo da tvrdnja nije mehanicki neispravna. Kvalifikator je razlog za
        # ljudsku odluku, ne za odbacivanje.
        "mechanicalPass": anchored and derivable,
        "needsHuman": bool(qualifier),
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
        print(f"    COVJEK [{r.get('checkId')}] kvalifikator '{r['qualifier']}': {squash(r.get('quote',''))[:90]}")
    print("")
    print(f"zapisano: {os.path.relpath(out_path, ROOT)}")


if __name__ == "__main__":
    main()
