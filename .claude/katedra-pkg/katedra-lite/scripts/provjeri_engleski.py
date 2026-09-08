#!/usr/bin/env python3
"""Engleski sloj rada protiv hrvatskog izvornika.

Zašto postoji
-------------
``provjeri_sazetak.py`` mjeri hrvatski sažetak protiv rada i radi to dobro.
Engleski summary do v1.3 nije dodirivao nijedan alat: ``check_rules.py`` gleda
samo postoji li naslov, a nijedna referenca nije tražila da se dva sažetka
usporede. To je dio koji čitaju tri različite publike — mentor, komisija i
repozitorij (Dabar) — i jedini dio rada koji poslije predaje ostaje javan i
nepromjenjiv.

Što se mjeri, a što ne
----------------------
Mjeri se **suglasje s hrvatskim izvornikom**: brojke, broj ključnih riječi,
odnos duljina, i je li tekst uopće preveden. Kvaliteta prijevoda se **ne**
ocjenjuje — to alat ne može, pa se ne pretvara da može (željezno pravilo 8).

Nalazi su namjerno podijeljeni: crveno je rezervirano za ono što se ne može
drukčije protumačiti (brojka koja se razilazi, nepreveden tekst, različit broj
ključnih riječi). Sve što ovisi o stilu prevoditelja je žuto. Lažni nalaz uči
korisnika da ignorira crvenu boju, pa promašeni nalaz poslije prođe neopaženo.
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

from provjeri_sazetak import (  # noqa: E402
    _bez_dijakritika,
    brojke,
    procitaj,
)

NASLOV_EN = re.compile(r"^(summary|abstract)(\s+and\s+key\s*words?)?\s*:?\s*$", re.I)
KLJUCNE_EN = re.compile(r"^key\s*words?\s*:?", re.I)
DIJAKRITIK = re.compile(r"[čćžšđČĆŽŠĐ]")
# Riječi koje u engleskom tekstu smiju nositi dijakritik: vlastita imena,
# nazivi ustanova i bibliografske jedinice. Prepoznaju se po velikom slovu.
VELIKO = re.compile(r"^[A-ZČĆŽŠĐ]")

# Brojevi ispisani riječima. `brojke()` iz provjeri_sazetak.py vidi samo znamenke,
# a upravo je ispisani broj bio kvar 30: sažetak je tvrdio „pet cjelina koje
# zauzimaju šest poglavlja", a rad ih je imao osam. Jedinica se namjerno izostavlja
# — „jedan"/„one" su prečeste kao gramatička riječ da bi nalaz bio pouzdan.
BROJ_RIJECIMA = {
    "hr": {"dva": 2, "dvije": 2, "tri": 3, "cetiri": 4, "pet": 5, "sest": 6,
           "sedam": 7, "osam": 8, "devet": 9, "deset": 10, "jedanaest": 11,
           "dvanaest": 12, "trinaest": 13, "cetrnaest": 14, "petnaest": 15,
           "sesnaest": 16, "sedamnaest": 17, "osamnaest": 18, "devetnaest": 19,
           "dvadeset": 20},
    "en": {"two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
           "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
           "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
           "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20},
}


def _brojevi_rijecima(tekst, jezik):
    tablica = BROJ_RIJECIMA[jezik]
    nadjeni = []
    for w in re.findall(r"[^\W\d_]+", tekst, re.UNICODE):
        kljuc = _bez_dijakritika(w).lower()
        if kljuc in tablica:
            nadjeni.append(tablica[kljuc])
    return sorted(nadjeni)


OK, UPOZ, LOSE = "✅", "⚠️", "❌"


def _izvuci(redci, naslov_re, kljucne_re):
    """(tekst, kljucne) za sekciju koja počinje naslovom `naslov_re`.

    Namjerno je zaseban od `procitaj()` u provjeri_sazetak.py: ta je skripta
    dio certificiranog releasea i njezin se potpis ne dira zbog nove provjere.
    Petlja je ista, ali granica vlasništva je važnija od petnaest redaka.
    """
    tekst, kljucne = [], []
    for i, r in enumerate(redci):
        if not naslov_re.match(r["t"]):
            continue
        for r2 in redci[i + 1:]:
            if kljucne_re.match(r2["t"]):
                kljucne = [k.strip(" .;") for k in
                           kljucne_re.sub("", r2["t"]).split(",") if k.strip(" .;")]
                break
            if r2["naslov"] or naslov_re.match(r2["t"]):
                break
            tekst.append(r2["t"])
        break
    return " ".join(tekst).strip(), kljucne


def _rijeci(t):
    return [w for w in re.findall(r"[^\W\d_]+", t, re.UNICODE) if w]


def _trazi_summary(profil):
    dijelovi = ((profil.get("struktura") or {}).get("obavezni_dijelovi")) or []
    for d in dijelovi:
        n = _bez_dijakritika(str(d)).lower()
        if "summary" in n or "abstract" in n or "engles" in n:
            return True
    return False


def provjeri(put, profil=None):
    redci, hr_tekst_redci, hr_kljucne, _naslovi, _tijelo, _zak = procitaj(put)
    hr = " ".join(hr_tekst_redci).strip()
    en, en_kljucne = _izvuci(redci, NASLOV_EN, KLJUCNE_EN)

    trazi = _trazi_summary(profil or {})
    nalazi = []

    def dodaj(kljuc, stanje, poruka, detalji=None):
        nalazi.append({"provjera": kljuc, "stanje": stanje, "poruka": poruka,
                       "detalji": detalji or []})

    if not en:
        if trazi:
            dodaj("postoji", LOSE,
                  "profil traži engleski sažetak, a nijedan naslov "
                  "„Summary\"/„Abstract\" nije nađen")
        else:
            dodaj("postoji", UPOZ,
                  "engleski sažetak nije nađen; profil ga izrijekom ne traži — "
                  "provjeri Upute prije nego zaključiš da nije potreban")
        return {"hr_rijeci": len(_rijeci(hr)), "en_rijeci": 0,
                "hr_kljucne": len(hr_kljucne), "en_kljucne": 0, "nalazi": nalazi}

    if not hr:
        dodaj("hrvatski", UPOZ,
              "hrvatski sažetak nije nađen, pa se usporedba ne može napraviti; "
              "provjerava se samo engleski sam za sebe")

    # 1) nepreveden tekst
    if hr and _bez_dijakritika(hr).lower()[:200] == _bez_dijakritika(en).lower()[:200]:
        dodaj("preveden", LOSE,
              "engleski sažetak je isti tekst kao hrvatski — nije preveden")

    # 2) brojke se moraju poklapati
    if hr:
        b_hr, b_en = brojke(hr), brojke(en)
        samo_hr = sorted(b_hr - b_en)
        samo_en = sorted(b_en - b_hr)
        if samo_hr or samo_en:
            det = []
            if samo_hr:
                det.append("u hrvatskom, nema u engleskom: " + ", ".join(samo_hr))
            if samo_en:
                det.append("u engleskom, nema u hrvatskom: " + ", ".join(samo_en))
            dodaj("brojke", LOSE,
                  "brojke se razilaze između sažetaka", det)
        else:
            dodaj("brojke", OK, f"{len(b_hr)} brojki, poklapaju se")

    # 3) brojevi ispisani riječima (kvar 30 — „pet cjelina, šest poglavlja")
    if hr:
        r_hr = _brojevi_rijecima(hr, "hr")
        r_en = _brojevi_rijecima(en, "en")
        if r_hr != r_en:
            dodaj("brojevi_rijecima", UPOZ,
                  "brojevi ispisani riječima se razilaze",
                  [f"hrvatski: {', '.join(map(str, r_hr)) or '—'}",
                   f"engleski: {', '.join(map(str, r_en)) or '—'}",
                   "nije nužno pogreška (jezici drukčije slažu rečenicu), ali "
                   "„pet cjelina\" naspram „eight chapters\" jest — pogledaj oba "
                   "sažetka rečenicu po rečenicu"])
        elif r_hr:
            dodaj("brojevi_rijecima", OK,
                  f"{len(r_hr)} ispisanih brojeva, poklapaju se")

    # 4) broj ključnih riječi
    if hr_kljucne or en_kljucne:
        if len(hr_kljucne) != len(en_kljucne):
            dodaj("kljucne", LOSE,
                  f"različit broj ključnih riječi: hrvatski {len(hr_kljucne)}, "
                  f"engleski {len(en_kljucne)}",
                  [f"hr: {', '.join(hr_kljucne) or '—'}",
                   f"en: {', '.join(en_kljucne) or '—'}"])
        else:
            dodaj("kljucne", OK, f"{len(hr_kljucne)} ključnih riječi na obje strane")

    # 5) odnos duljina — savjetodavno, ovisi o prevoditelju
    n_hr, n_en = len(_rijeci(hr)), len(_rijeci(en))
    if n_hr and n_en:
        odnos = n_en / n_hr
        if odnos < 0.7 or odnos > 1.5:
            dodaj("duljina", UPOZ,
                  f"engleski sažetak je {odnos:.2f}× duljine hrvatskog "
                  f"({n_en} prema {n_hr} riječi)",
                  ["engleski je od hrvatskoga tipično 5–15 % dulji; "
                   "veliko odstupanje znači da je tekst skraćen ili dopisan, "
                   "a ne preveden"])
        else:
            dodaj("duljina", OK, f"{n_en} prema {n_hr} riječi ({odnos:.2f}×)")

    # 6) hrvatski ostaci u engleskom tekstu
    ostaci = sorted({w for w in _rijeci(en)
                     if DIJAKRITIK.search(w) and not VELIKO.match(w)})
    if ostaci:
        dodaj("ostaci", UPOZ,
              f"{len(ostaci)} riječi s hrvatskim dijakritikom u engleskom tekstu",
              [", ".join(ostaci[:12]),
               "riječi s velikim početnim slovom se ne prijavljuju (imena, "
               "ustanove, bibliografske jedinice)"])
    ostaci_k = sorted({k for k in en_kljucne if DIJAKRITIK.search(k)})
    if ostaci_k:
        dodaj("kljucne_ostaci", LOSE,
              "engleske ključne riječi nose hrvatski dijakritik — nisu prevedene",
              [", ".join(ostaci_k)])

    return {"hr_rijeci": n_hr, "en_rijeci": n_en,
            "hr_kljucne": len(hr_kljucne), "en_kljucne": len(en_kljucne),
            "hr_kljucne_popis": hr_kljucne, "en_kljucne_popis": en_kljucne,
            "nalazi": nalazi}


def ispisi(r):
    print("ENGLESKI SLOJ — summary i ključne riječi protiv hrvatskog izvornika")
    print("=" * 66)
    for n in r["nalazi"]:
        print(f"{n['stanje']} {n['poruka']}")
        for d in n["detalji"]:
            print(f"     {d}")
    losih = sum(1 for n in r["nalazi"] if n["stanje"] == LOSE)
    upoz = sum(1 for n in r["nalazi"] if n["stanje"] == UPOZ)
    print(f"\n{losih} kršenja, {upoz} za provjeru")
    if losih:
        print("Engleski sažetak ide u repozitorij i ostaje javan — "
              "ispravlja se prije predaje, ne poslije.")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Engleski summary/ključne riječi protiv hrvatskog sažetka.")
    ap.add_argument("rad", help=".docx ili .md")
    ap.add_argument("--profil", help="resolved_profile.json (traži li summary)")
    ap.add_argument("--dio", choices=("sazetak", "naslov"), default="sazetak",
                    help="naslov: provjeri samo engleski naslov (druga naslovnica)")
    ap.add_argument("--json", dest="kao_json", metavar="PUT")
    args = ap.parse_args(argv)

    if not os.path.exists(args.rad):
        print(f"❌ nema datoteke: {args.rad}", file=sys.stderr)
        return 2

    profil = {}
    if args.profil:
        try:
            with open(args.profil, encoding="utf-8") as f:
                profil = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            print(f"❌ profil se ne da pročitati: {e}", file=sys.stderr)
            return 2

    try:
        r = provjeri(args.rad, profil)
    except Exception as e:  # noqa: BLE001 — alat koji pukne mora to i reći
        print(f"❌ provjera nije uspjela: {type(e).__name__}: {e}", file=sys.stderr)
        return 2

    ispisi(r)
    if args.kao_json:
        with open(args.kao_json, "w", encoding="utf-8") as f:
            json.dump(r, f, ensure_ascii=False, indent=1)
    return 1 if any(n["stanje"] == LOSE for n in r["nalazi"]) else 0


if __name__ == "__main__":
    sys.exit(main())
