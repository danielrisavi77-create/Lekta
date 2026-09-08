#!/usr/bin/env python3
"""v1.1 (NEW-102) — Export .katedra/izvori.json u BibTeX (.bib) i RIS (.ris).

Ovo je čisti format-adapter, ne novi izvor istine. Ulaz je isključivo JSON koji
je već proizveo `verify_sources.py --json`; skripta ne mijenja verification/
quality polja niti sama odlučuje je li izvor prihvatljiv. Blokirani unosi
(`blocking: true` — invalid ili conflict) su po defaultu isključeni iz izvoza
jer ne bi trebali ni ući u konačni popis literature; `--include-blocked`
postoji samo za ručnu dijagnostiku, ne za produkciju.

Zasebno od `blocking`, discovery-service ENTITETI (izvorno samo Google
Scholar — meta-tražilica, ne bibliografski izvor) su UVIJEK isključeni iz
izvoza, bez obzira na `--include-blocked` (v. `izvozni_unosi()`). v1.1-advisory
fix (nezavisna revizija, bug #16): ranija verzija ovog docstringa i CLI
helpa netočno je navodila „CROSBI" kao primjer discovery-service entiteta.
CROSBI/CroRIS je `discovered_via` DISCOVERY KANAL (analogno Hrčaku) — kad je
izvor stvarno bibliografska jedinica pronađena preko CROSBI-ja, on OSTAJE
normalan bibliografski entitet i izvozi se kao i svaki drugi. Samo Google
Scholar (i slični meta-pretraživači) su `discovery_service` ENTITETI.

Uporaba:
  python3 <KATEDRA_SKILL>/scripts/export_bibliography.py .katedra/izvori.json \
      --bibtex literatura.bib --ris literatura.ris

Izlazni kodovi:
  0  izvoz uspješan (uključujući slučaj 0 dopuštenih unosa uz --allow-empty)
  1  nema nijednog izvoznog unosa (svi blocking ili prazan popis) bez --allow-empty
  2  ulazna datoteka se ne može pročitati / nije valjan verify_sources JSON
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Any

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import hr_text as H  # noqa: E402

# -------------------------------------------------------------- BibTeX tipovi

_BIBTEX_TYPE = {
    "journal_article": "article",
    "book": "book",
    "chapter": "incollection",
    "official_report": "techreport",
    "law": "misc",
    "regulation": "misc",
    "court_decision": "misc",
    "eu_act": "misc",
    "unknown": "misc",
}

_RIS_TYPE = {
    "journal_article": "JOUR",
    "book": "BOOK",
    "chapter": "CHAP",
    "official_report": "RPRT",
    "law": "GEN",
    "regulation": "GEN",
    "court_decision": "GEN",
    "eu_act": "GEN",
    "unknown": "GEN",
}


class GreskaUlaza(Exception):
    """Ulazna datoteka nije čitljiv verify_sources JSON — izlazni kod 2."""


def ucitaj_izvore(put: str) -> list[dict[str, Any]]:
    if not os.path.isfile(put):
        raise GreskaUlaza(f"nema datoteke: {put}")
    try:
        with open(put, encoding="utf-8") as fh:
            payload = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        raise GreskaUlaza(f"{put} nije valjan JSON: {exc}") from exc
    if payload.get("alat") != "verify_sources" or "izvori" not in payload:
        raise GreskaUlaza(
            f"{put} ne izgleda kao verify_sources.py --json izlaz "
            f"(očekivano polje 'alat': 'verify_sources' i 'izvori')"
        )
    izvori = payload.get("izvori")
    if not isinstance(izvori, list):
        raise GreskaUlaza(f"{put}: 'izvori' nije popis")
    return izvori


def _slug(s: str) -> str:
    s = H.bez_dijakritika((s or "").lower())
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s or "izvor"


def _dedup_sufiks(i: int) -> str:
    """Deterministički alfabetski sufiks za i>=1: a, b, ..., z, aa, ab, ..., zz, aaa, ...

    v1.1-advisory fix (nezavisna revizija, bug #13): stara implementacija
    (`chr(ord("a") + i - 1)`) je nakon 26. kolizije istog `baza` ključa
    proizvodila `{`, `|`, `}` (ord aritmetika prelazi preko 'z' u sljedeće
    ASCII znakove) — neuparena `{` u BibTeX ključu čini cijelu `.bib`
    datoteku strukturno nevaljanom. Dohvatljivo kod velikog broja izvora s
    istim autor+godina+prva-riječ-naslova (npr. 27+ izmjena istog zakona) ili
    kad se `baza` ponavlja preko `source_id`/`unos` fallbacka. Base-26 sufiks
    nikad ne izlazi iz [a-z].
    """
    slova = []
    n = i
    while n > 0:
        n, r = divmod(n - 1, 26)
        slova.append(chr(ord("a") + r))
    return "".join(reversed(slova))


def bibtex_key(izvor: dict[str, Any], zauzeti: set[str]) -> str:
    autor = _slug((izvor.get("autor") or "").split(",")[0].split(" ")[0])
    godina = re.sub(r"\D", "", str(izvor.get("godina") or ""))
    naslov_rijec = ""
    for w in re.split(r"\s+", izvor.get("naslov") or ""):
        w2 = _slug(w)
        if len(w2) >= 4:
            naslov_rijec = w2
            break
    baza = "".join(p for p in (autor, godina, naslov_rijec) if p) or _slug(
        izvor.get("source_id") or izvor.get("unos") or "izvor"
    )
    kljuc = baza
    i = 0
    while kljuc in zauzeti:
        i += 1
        kljuc = baza + _dedup_sufiks(i)
    zauzeti.add(kljuc)
    return kljuc


def _bibtex_escape(s: str) -> str:
    r"""Escape LaTeX-special characters so generated .bib compiles / round-trips.

    v1.1-advisory fix: the original version only escaped braces. Real academic
    titles routinely carry '%', '&', '#', '_' (e.g. "50% growth", "R&D",
    "COVID_19" style codes) which are LaTeX category-code-changing characters;
    left unescaped they either break compilation or silently corrupt the
    rendered text.

    Backslash uses a placeholder instead of being substituted directly: its
    own replacement text (\textbackslash{}) contains literal braces, and an
    earlier version replaced backslash first, then let the brace-escaping
    loop below re-escape those just-inserted braces into
    "\textbackslash\{\}" — a double-escape bug caught by
    test_bibtex_escape_handles_literal_backslash_without_double_escaping.
    The placeholder defers the backslash's own braces until after every
    other substitution has already run, so they're never seen by the brace
    rule. The placeholder text itself must avoid every character escaped
    below (in particular '_') or it would corrupt itself the same way.
    """
    s = s or ""
    zamjena = "\x00KATEDRABACKSLASH\x00"
    s = s.replace("\\", zamjena)
    for ch, esc in (
        ("&", r"\&"), ("%", r"\%"), ("$", r"\$"), ("#", r"\#"),
        ("_", r"\_"), ("{", r"\{"), ("}", r"\}"),
        ("~", r"\textasciitilde{}"), ("^", r"\textasciicircum{}"),
    ):
        s = s.replace(ch, esc)
    s = s.replace(zamjena, r"\textbackslash{}")
    return s


def _autori_popis(izvor: dict[str, Any]) -> list[str]:
    """Vrati popis pojedinačnih autora, preferirajući strukturirano `autori`
    polje (v1.1-advisory patch #3 u verify_sources.rastavi()) nad flat
    `autor` stringom.

    v1.1-advisory fix (nezavisna revizija, bug #6): dok god je postojao samo
    jedan spojen `autor` string (npr. „Payne, Gil-Alana i Mervar"), pisanje
    tog stringa doslovno u BibTeX `author = {...}` polje NIJE ispravljalo
    koautore u izvozu — BibTeX-ova gramatika imena dijeli SAMO na ključnu
    riječ " and ", a zarez unutar jednog imena znači "Prezime, Ime". Cijeli
    string bi se parsirao kao JEDAN autor („Gil-Alana i Mervar Payne"). RIS
    `AU` tag je ponovljiv jedan-autor-po-retku, pa isti problem vrijedi i za
    `.ris`. `izvori.json` koji dolazi iz `verify_sources.py --json` sada nosi
    `autori: list[str]`; kad ulaz nema to polje (stariji snapshot, ili ručno
    sastavljen test fixture), fallback je jedan-autor popis iz `autor`.
    """
    autori = izvor.get("autori")
    if isinstance(autori, list) and autori:
        return [a for a in autori if a]
    return [izvor["autor"]] if izvor.get("autor") else []


def izvor_u_bibtex(izvor: dict[str, Any], kljuc: str) -> str:
    tip = _BIBTEX_TYPE.get((izvor.get("source_entity") or {}).get("type"), "misc")
    polja = []
    autori = _autori_popis(izvor)
    if autori:
        # BibTeX razdvaja više autora ključnom riječi " and ", ne zarezom —
        # zarez unutar jednog imena znači "Prezime, Ime".
        polja.append(("author", " and ".join(_bibtex_escape(a) for a in autori)))
    if izvor.get("naslov"):
        polja.append(("title", "{" + _bibtex_escape(izvor["naslov"]) + "}"))
    if izvor.get("godina"):
        polja.append(("year", str(izvor["godina"])))
    if izvor.get("doi"):
        # v1.1-advisory fix (nezavisna revizija, bug #5): doi/url su prije
        # prolazili NEeskejpani u BibTeX polje (ternary koji je trebao
        # razlikovati doi/url od ostalih polja imao je oba grananja
        # identična — mrtav kod). Stvaran URL s '%'/'&'/'_' (upitnici s
        # query parametrima, česti na Eurostat/EC/Hrčak linkovima) je ili
        # otvarao LaTeX komentar (%) ili pucao kompilaciju (&, _, #).
        polja.append(("doi", _bibtex_escape(izvor["doi"])))
    if izvor.get("url"):
        polja.append(("url", _bibtex_escape(izvor["url"])))
    if izvor.get("source_id"):
        polja.append(("note", f"katedra:source_id={izvor['source_id']}"))
    redci = ",\n".join(f"  {k} = {{{v}}}" for k, v in polja)
    return f"@{tip}{{{kljuc},\n{redci}\n}}\n"


def izvor_u_ris(izvor: dict[str, Any]) -> str:
    tip = _RIS_TYPE.get((izvor.get("source_entity") or {}).get("type"), "GEN")
    redci = [f"TY  - {tip}"]
    # v1.1-advisory fix (nezavisna revizija, bug #6): AU je ponovljiv RIS tag
    # — jedan redak po autoru, ne jedan redak sa svim imenima spojenima.
    for a in _autori_popis(izvor):
        redci.append(f"AU  - {a}")
    if izvor.get("naslov"):
        redci.append(f"TI  - {izvor['naslov']}")
    if izvor.get("godina"):
        redci.append(f"PY  - {izvor['godina']}")
    if izvor.get("doi"):
        redci.append(f"DO  - {izvor['doi']}")
    if izvor.get("url"):
        redci.append(f"UR  - {izvor['url']}")
    if izvor.get("source_id"):
        redci.append(f"ID  - {izvor['source_id']}")
    redci.append("ER  - ")
    return "\n".join(redci) + "\n"


def izvozni_unosi(izvori: list[dict[str, Any]], ukljuci_blokirane: bool) -> list[dict[str, Any]]:
    out = []
    for iz in izvori:
        if (iz.get("source_entity") or {}).get("kind") == "discovery_service":
            continue
        if iz.get("blocking") and not ukljuci_blokirane:
            continue
        out.append(iz)
    return out


def _piso(put: str, sadrzaj: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(put)) or ".", exist_ok=True)
    tmp = put + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(sadrzaj)
    os.replace(tmp, put)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Izvezi .katedra/izvori.json (verify_sources.py --json) u BibTeX/RIS."
    )
    ap.add_argument("izvori_json", help="verify_sources.py --json izlaz, npr. .katedra/izvori.json")
    ap.add_argument("--bibtex", metavar="PUT", help="izlazna .bib datoteka")
    ap.add_argument("--ris", metavar="PUT", help="izlazna .ris datoteka")
    ap.add_argument("--include-blocked", action="store_true",
                     help="uključi i invalid/conflict unose (samo za dijagnostiku); "
                          "discovery-service entiteti (Google Scholar) ostaju isključeni "
                          "bez obzira na ovu zastavicu")
    ap.add_argument("--allow-empty", action="store_true",
                     help="ne vraćaj exit 1 ako nema nijednog izvoznog unosa")
    args = ap.parse_args(argv)

    if not args.bibtex and not args.ris:
        print("❌ navedi barem jedan izlaz: --bibtex i/ili --ris", file=sys.stderr)
        return 2

    try:
        izvori = ucitaj_izvore(args.izvori_json)
    except GreskaUlaza as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2

    odabrani = izvozni_unosi(izvori, args.include_blocked)
    preskoceno = len(izvori) - len(odabrani)

    if not odabrani and not args.allow_empty:
        print("❌ nijedan unos nije izvezen (svi su blocking i/ili discovery-service).\n"
              "   Što napraviti: razriješi conflict/invalid izvore (--include-blocked "
              "za dijagnostički izvoz i njih); discovery-service entiteti (Google "
              "Scholar) se ne mogu izvesti ni s tom zastavicom — nisu bibliografski "
              "izvor.", file=sys.stderr)
        return 1

    if args.bibtex:
        zauzeti: set[str] = set()
        blokovi = [izvor_u_bibtex(iz, bibtex_key(iz, zauzeti)) for iz in odabrani]
        _piso(args.bibtex, "\n".join(blokovi) if blokovi else "% (nema izvoznih unosa)\n")
        print(f"[bibtex → {args.bibtex}] {len(blokovi)} unosa")

    if args.ris:
        blokovi = [izvor_u_ris(iz) for iz in odabrani]
        _piso(args.ris, "\n".join(blokovi) if blokovi else "")
        print(f"[ris → {args.ris}] {len(blokovi)} unosa")

    if preskoceno:
        print(f"ℹ️  preskočeno {preskoceno} blocking/discovery-service unosa "
              f"(--include-blocked za sve)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
