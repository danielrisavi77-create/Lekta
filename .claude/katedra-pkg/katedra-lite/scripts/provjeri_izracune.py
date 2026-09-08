#!/usr/bin/env python3
"""Izbor formule, ne aritmetika.

Zašto postoji
-------------
Aritmetika je pokrivena na tri mjesta: željezno pravilo 13 (`model.json` jedini
izvor izvedenih brojki), `rad-docx/references/brojke.md` (osnovica zaokruživanja,
neovisno prepisivanje izračuna, crna lista zastarjelih vrijednosti) i
`replikacija-pspp` (ponovni izračun u trećem programu).

Ostala je jedna kategorija koju **nitko ne hvata**: brojka je aritmetički točna, a
formula kriva. Postotak umjesto postotnog boda, rast računat na krivoj osnovici,
udjeli koji ne daju sto, CAGR predstavljen kao prosječna godišnja stopa, lančani
indeks čitan kao bazni, nominalni rast prodan kao realni. Svaka od njih prođe
svaku postojeću provjeru, jer ni jedan zbroj nije pogrešan — pogrešno je **što je
zbrojeno**.

Što ovo NIJE
------------
Ne provjerava je li broj točno izračunat (to radi `model.py` i replikacija) i ne
zna koji je pokazatelj trebao biti upotrijebljen — to traži poznavanje teme.
Provjerava **deklaracije**: je li osnovica navedena, zbrajaju li se udjeli, stoji
li uz razliku dviju stopa prava jedinica.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
if SKRIPTE not in sys.path:
    sys.path.insert(0, SKRIPTE)

import hr_text as H  # noqa: E402
import jezik as J  # noqa: E402

OK, UPOZ, LOSE, PRESKOK = "✅", "⚠️", "❌", "➖"

# Osnove glagola: „povećao” je poveća- + o, ne povećal-. Muški rod jednine
# gubi „l”, pa je uzorak s „povećal\w*” promašivao najčešći oblik u kojem se
# pogreška i piše.
# Razlika dviju stopa izražava se u postotnim bodovima. „Udio je porastao s 20 %
# na 24 %, dakle za 4 %” je pogrešno: porastao je za 4 postotna boda, odnosno
# za 20 % relativno. Uzorak traži glagol rasta/pada uz „%” u istoj rečenici,
# a izuzima rečenice koje bod već spominju.
# Između glagola i „za N %” redovito stoji cijela konstrukcija („povećao se
# s 20 % na 24 %, dakle za 4 %”) — upravo ona u kojoj pogreška i nastaje. Uzorak
# zato dopušta međuprostor unutar iste rečenice.
RAST_POSTO = re.compile(
    r"(?:poveća\w*|porast\w*|smanji\w*|pad\w*|rast\w*|snizi\w*|uveća\w*)"
    r"[^.!?]{0,70}?\bza\s+([\d.,]+)\s*(?:%|posto\b)", re.IGNORECASE)
BOD = re.compile(r"postotn\w+\s+bod", re.IGNORECASE)

# Rast bez navedene osnovice: „u odnosu na”, „naspram”, „prema” ili godina.
OSNOVICA = re.compile(
    r"(u\s+odnosu\s+na|naspram|prema\s+\d{4}|u\s+usporedbi\s+s|"
    r"\bs\s+\d{4}\.|\bod\s+\d{4}\.|bazn\w+|osnovic\w+)", re.IGNORECASE)

CAGR = re.compile(r"\b(CAGR|prosječn\w+\s+godišnj\w+\s+stop\w+)", re.IGNORECASE)
INDEKS = re.compile(r"\bindeks\w*\b", re.IGNORECASE)
LANCANI = re.compile(r"\b(lančan\w+|bazn\w+)\b", re.IGNORECASE)
REALNO = re.compile(r"\b(realn\w+|nominaln\w+|deflacionir\w+|stalnim\s+cijenama|"
                    r"tekućim\s+cijenama)\b", re.IGNORECASE)
NOVAC_RAST = re.compile(
    r"(?:prihod\w*|vrijednost\w*|plać\w*|dohod\w*|BDP)\D{0,40}"
    r"(?:porast\w*|rast\w*|poveća\w*)", re.IGNORECASE)


def _recenice(tekst):
    return [r.strip() for r in re.split(r"(?<=[.!?])\s+", tekst) if r.strip()]


def provjeri_tekst(tekst):
    nalazi = []

    def dodaj(stanje, pravilo, poruka, recenica):
        nalazi.append({"pravilo": pravilo, "stanje": stanje, "poruka": poruka,
                       "recenica": recenica[:180]})

    for r in _recenice(tekst):
        m = RAST_POSTO.search(r)
        if m and not BOD.search(r):
            # Ako rečenica uspoređuje dvije stope (dva „%”), razlika je u bodovima.
            if len(re.findall(r"[\d.,]+\s*%", r)) >= 2:
                dodaj(LOSE, "postotni_bod",
                      "razlika dviju stopa izražava se u POSTOTNIM BODOVIMA, "
                      "ne u postocima", r)
            elif not OSNOVICA.search(r):
                # Jedan postotak UZ navedenu osnovicu je nedvojbeno relativna
                # promjena („porastao za 8,1 % u odnosu na 2019.”) — ondje
                # upozorenje o postotnom bodu samo stvara šum.
                dodaj(UPOZ, "postotni_bod",
                      "ako je riječ o razlici dvaju udjela, jedinica je postotni "
                      "bod; ako je relativna promjena, „%” je u redu", r)
        if m and not OSNOVICA.search(r):
            dodaj(UPOZ, "osnovica",
                  "rast bez navedene osnovice — u odnosu na koju godinu ili "
                  "vrijednost?", r)
        if CAGR.search(r) and not re.search(r"\bCAGR\b", r):
            dodaj(UPOZ, "cagr",
                  "„prosječna godišnja stopa” i CAGR nisu isto: aritmetički "
                  "prosjek godišnjih stopa razlikuje se od složene stope. "
                  "Napiši koju si upotrijebio", r)
        if INDEKS.search(r) and not LANCANI.search(r):
            dodaj(UPOZ, "indeks",
                  "indeks bez oznake je li bazni ili lančani — dva različita "
                  "broja pod istim imenom", r)
        if NOVAC_RAST.search(r) and not REALNO.search(r):
            dodaj(UPOZ, "realno",
                  "rast novčane veličine bez oznake je li nominalan ili realan; "
                  "bez deflacioniranja dio rasta je inflacija", r)
    return nalazi


def provjeri_model(model):
    """Udjeli koji ne daju sto i osnovice koje model ne deklarira."""
    nalazi = []
    if not isinstance(model, dict):
        return nalazi
    skupine = {}
    for kljuc, v in model.items():
        if not isinstance(v, (int, float)):
            continue
        m = re.match(r"(.+?)_(udio|postotak|share)(?:_(\w+))?$", str(kljuc))
        if m:
            skupine.setdefault(m.group(3) or m.group(1).rsplit("_", 1)[0],
                               []).append((kljuc, float(v)))
    for skupina, stavke in skupine.items():
        if len(stavke) < 2:
            continue
        zbroj = sum(v for _, v in stavke)
        if 90 <= zbroj <= 110 and abs(zbroj - 100) > 0.15:
            nalazi.append({
                "pravilo": "udjeli_zbroj", "stanje": LOSE,
                "poruka": f"udjeli u skupini „{skupina}” daju {zbroj:.2f}, ne 100. "
                          f"Zbroj se računa iz PRIKAZANIH (zaokruženih) vrijednosti "
                          f"— v. rad-docx/references/brojke.md",
                "recenica": ", ".join(f"{k}={v}" for k, v in stavke)[:180]})
    return nalazi


def ispisi(nalazi, ogranicenje=4):
    print("IZRAČUNI — izbor formule, ne aritmetika")
    print("=" * 39)
    if not nalazi:
        print(f"{OK} nijedan nalaz u onome što se dade provjeriti iz teksta")
    po = {}
    for n in nalazi:
        po.setdefault((n["stanje"], n["pravilo"], n["poruka"]), []).append(n)
    for kljuc in sorted(po, key=lambda k: (k[0] != LOSE, -len(po[k]))):
        stanje, _pid, poruka = kljuc
        grupa = po[kljuc]
        print(f"\n{stanje} {poruka}  ({len(grupa)}×)")
        for n in grupa[:ogranicenje]:
            print(f"     … {n['recenica']}")
        if len(grupa) > ogranicenje:
            print(f"     … još {len(grupa) - ogranicenje}")
    n_lose = sum(1 for n in nalazi if n["stanje"] == LOSE)
    n_upoz = sum(1 for n in nalazi if n["stanje"] == UPOZ)
    print(f"\n{n_lose} kršenja, {n_upoz} za provjeru")
    print("Alat ne zna koji je pokazatelj TREBAO biti upotrijebljen — to traži")
    print("poznavanje teme. Provjerava deklaracije: osnovicu, jedinicu, vrstu indeksa.")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Izbor formule u tekstu i udjeli u modelu.")
    ap.add_argument("rad", nargs="?", help=".docx ili .md")
    ap.add_argument("--model", help=".katedra/model.json")
    ap.add_argument("--json", dest="kao_json", metavar="PUT")
    ap.add_argument("--kat", help="putanja do .katedra/ (za jezik rada)")
    ap.add_argument("--project-root", dest="project_root")
    args = ap.parse_args(argv)

    smije, _j, _izvor = J.guard("provjeri_izracune", ("hr",),
                                kat=getattr(args, "kat", None) or
                                    __import__("context").resolve_state_dir(
                                        None, getattr(args, "project_root", None)),
                                profil=getattr(args, "profil", None))
    if not smije:
        return 0


    if not args.rad and not args.model:
        print("❌ zadaj rad, model ili oboje", file=sys.stderr)
        return 2

    nalazi = []
    if args.rad:
        if not os.path.exists(args.rad):
            print(f"❌ nema datoteke: {args.rad}", file=sys.stderr)
            return 2
        try:
            odlomci, _ = H.ucitaj(args.rad, samo_tijelo=True, ukljuci_tablice=True)
        except Exception as e:  # noqa: BLE001
            print(f"❌ tekst se ne da pročitati: {type(e).__name__}: {e}",
                  file=sys.stderr)
            return 2
        nalazi += provjeri_tekst("\n".join(str(o) for o in odlomci))

    if args.model:
        if not os.path.exists(args.model):
            print(f"{PRESKOK} nema {args.model} — udjeli se ne provjeravaju")
        else:
            try:
                with open(args.model, encoding="utf-8") as f:
                    nalazi += provjeri_model(json.load(f))
            except json.JSONDecodeError as e:
                print(f"❌ model nije valjan JSON: {e}", file=sys.stderr)
                return 2

    ispisi(nalazi)
    if args.kao_json:
        with open(args.kao_json, "w", encoding="utf-8") as f:
            json.dump({"nalazi": nalazi}, f, ensure_ascii=False, indent=1)
    return 1 if any(n["stanje"] == LOSE for n in nalazi) else 0


if __name__ == "__main__":
    sys.exit(main())
