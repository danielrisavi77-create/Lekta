#!/usr/bin/env python3
"""Popis literature protiv kućnog stila — jedinica po jedinica.

Zašto postoji
-------------
Profil fakulteta **već nosi** kako bibliografska jedinica mora izgledati:
``popis_primjer``, ``tocka_iza_godine``, ``uvlaka_u_popisu``,
``razmak_izmedu_jedinica``. Do v1.4 od svega toga provjeravala su se točno dva
pravila, i oba u TEKSTU: ``citiranje.stil`` i ``citiranje.tocka_iza_godine``.
Format same jedinice, uvlaka, razmak i abecedni red **nad dokumentom** nije
provjeravao nitko — skill je znao kako jedinica mora izgledati i nije gledao je
li tako napisana.

Razlika je vidljiva golim okom i mentor ju vidi prva:

    EFZG   Čavlek, N. (1998.), Turoperatori i svjetski turizam, Zagreb: …
    FPZG   Šiber, Ivan (2003) Politički marketing. Zagreb: Politička kultura.

Puno ime naspram inicijala, zarez naspram točke iza godine, uvlaka naspram
ravnog lijevog ruba. Ništa od toga nije stvar ukusa.

Kako se izbjegava lažni nalaz
-----------------------------
Popis literature je najšarolikiji dio rada: propisi, mrežni izvori, institucijski
autori i uredničke knjige legitimno odstupaju od obrasca za knjigu jednog autora.
Zato svaka jedinica završi u jednoj od tri skupine — **u skladu**, **odstupa**,
**nije provjereno** — a treća se ISPISUJE, ne prešućuje. Crveno dobiva samo ono
što se ne da drukčije protumačiti (željezno pravilo 18).
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

# Jedinica koja NE opisuje djelo jedne ili više imenovanih osoba: propis, odluka,
# mrežni izvor, institucijski autor. Obrazac za knjigu na njih ne vrijedi.
# DVA uzorka, ne jedan. Prvi je neosjetljiv na velika slova (nazivi propisa i
# institucija), drugi to NE smije biti jer prepoznaje VERZALNI institucijski
# autor („DZS, 2024.”). Spojeni u jedan uzorak s globalnim `(?i)`, drugi je
# progutao cijeli popis: `[A-ZČĆŽŠĐ]{3,}` pod `(?i)` znači „bilo koja tri
# slova”, pa je svaka jedinica ispala „propis ili institucija” i nijedna nije
# bila provjerena — nalaz koji je izgledao kao uredan popis.
NEOSOBNI_RIJEC = re.compile(
    r"(?i)^\s*(?:narodne novine|nn\b|zakon\b|pravilnik\b|uredba\b|odluka\b|"
    r"ustav\b|direktiva\b|https?://|www\.|"
    r"(?:europska|vlada|ministarstvo|državni|institut|agencija|"
    r"ured|zavod|komisija|sud)\w*\s)"
)
NEOSOBNI_VERZAL = re.compile(r"^\s*[A-ZČĆŽŠĐ]{3,}(?:\s+[A-ZČĆŽŠĐ]{2,})*\s*[,(]")


def je_neosoban(t):
    return bool(NEOSOBNI_RIJEC.match(t) or NEOSOBNI_VERZAL.match(t))


GODINA = re.compile(r"\(?\b(1[89]\d{2}|20\d{2})\b\.?\)?")
# „Prezime, N.” (inicijal) naspram „Prezime, Ime” (puno ime)
INICIJAL = re.compile(r"^\s*[^\s,]+,\s*(?:[A-ZČĆŽŠĐ]\.\s*){1,3}")
PUNO_IME = re.compile(r"^\s*[^\s,]+,\s*[A-ZČĆŽŠĐ][a-zčćžšđ]{2,}")
# „Prezime, Ime (2003)” — FPZG oblik bez zareza pred zagradom
PREZIME_ZAGRADA = re.compile(r"^\s*[^\s,]+,\s*[^()]{1,40}\(\s*\d{4}")


def _tekst(p):
    return (p.text or "").strip()


# v1.9 (nalaz 7): H.NASLOV_LIT zna samo „Literatura/Popis literature/Reference/
# Bibliografija/Popis izvora/Izvori". Radovi u praksi nose i „POPIS CITIRANE
# LITERATURE", „Citirana literatura", „Literatura i izvori", „Popis referenci",
# „Korištena literatura" — bez ovoga alat javlja „nema popisa literature" na
# radu koji ga ima (75 stavki). Neosjetljivo na velika slova i na numeraciju.
NASLOV_LIT_PROSIREN = re.compile(
    r"(?i)^\s*(?:\d+\.?\s*)?(?:POPIS\s+)?(?:CITIRANE\s+|KORI[SŠ]TENE\s+|KORI[SŠ]TENA\s+|"
    r"CITIRANA\s+)?(?:LITERATURA|LITERATURE|REFERENC[EI]|REFERENCIJ[AE]|BIBLIOGRAFIJ[AE]|"
    r"IZVORA|IZVORI)(?:\s+I\s+(?:IZVORA|IZVORI|LITERATURE|LITERATURA))?\s*[:.]?\s*$"
)


def je_naslov_literature(t):
    return bool(H.NASLOV_LIT.match(t) or NASLOV_LIT_PROSIREN.match(t))


def izvuci_popis(put):
    """(odlomci_literature, python-docx odlomci) — od naslova popisa do kraja/idućeg H1.

    Vraća i same objekte odlomaka, jer se uvlaka i razmak čitaju iz oblikovanja,
    ne iz teksta.
    """
    if not put.endswith(".docx"):
        raise ValueError("očekuje se .docx — uvlaka i razmak se ne vide u markdownu")
    import docx
    d = docx.Document(put)
    unutra, jedinice = False, []
    for p in d.paragraphs:
        t = _tekst(p)
        if not t:
            continue
        _stil, je_naslov, je_h1 = H._stil_i_razina(p)
        if je_naslov_literature(t):
            unutra = True
            continue
        if unutra and (je_h1 or (je_naslov and len(t) < 80)):
            break                      # sljedeći dio rada (npr. Prilozi, Životopis)
        if unutra:
            jedinice.append(p)
    return jedinice


def ocekivani_oblik(profil):
    """Iz `popis_primjer` izvedi ono što se dade pouzdano izmjeriti.

    Ne parsira se cijeli obrazac — to bi bio nov izvor istine uz profil. Uzimaju
    se tri svojstva koja su jednoznačna i vidljiva: oblik imena, završna točka i
    mjesto godine.
    """
    cit = profil.get("citiranje") or {}
    primjer = str(cit.get("popis_primjer") or "").strip()
    oblik = {
        "primjer": primjer or None,
        "ime": None,
        "zavrsna_tocka": None,
        "tocka_iza_godine": cit.get("tocka_iza_godine"),
        "uvlaka": cit.get("uvlaka_u_popisu"),
        "razmak": cit.get("razmak_izmedu_jedinica"),
        "stil": cit.get("stil"),
    }
    if primjer:
        if INICIJAL.match(primjer):
            oblik["ime"] = "inicijal"
        elif PUNO_IME.match(primjer) or PREZIME_ZAGRADA.match(primjer):
            oblik["ime"] = "puno_ime"
        oblik["zavrsna_tocka"] = primjer.endswith(".")
    return oblik


def provjeri_jedinicu(t, oblik):
    """[(stanje, poruka)] za jednu jedinicu. Prazno = sve u skladu."""
    nalazi = []
    if oblik["ime"] == "inicijal" and PUNO_IME.match(t) and not INICIJAL.match(t):
        nalazi.append((LOSE, "puno ime autora, a profil traži inicijal "
                             f"(„{oblik['primjer'][:40]}…”)"))
    elif oblik["ime"] == "puno_ime" and INICIJAL.match(t):
        nalazi.append((LOSE, "inicijal, a profil traži puno ime autora "
                             f"(„{oblik['primjer'][:40]}…”)"))

    if oblik["zavrsna_tocka"] is not None:
        ima = t.endswith(".")
        if oblik["zavrsna_tocka"] and not ima:
            nalazi.append((LOSE, "jedinica ne završava točkom, a profil traži"))
        elif not oblik["zavrsna_tocka"] and ima:
            nalazi.append((LOSE, "jedinica završava točkom, a profil to ne traži"))

    m = GODINA.search(t)
    if not m:
        nalazi.append((UPOZ, "nema godine izdanja"))
    elif oblik["tocka_iza_godine"] is not None and oblik.get("stil") in NUMERICKI_STILOVI:
        # v1.9 (kvar 35): u numeričkim dijalektima (Vancouver/IEEE) godina stoji
        # u sredini jedinice („2020;12(3):45–50.") ili neposredno prije završne
        # točke jedinice („Zagreb: ZVU; 2014."). Ta točka zatvara jedinicu, ne
        # godinu — „godina s točkom" je svojstvo autor-godina popisa i ovdje se
        # NE provjerava. 11/75 lažnih ❌ na stvarnom HKS radu.
        pass
    elif oblik["tocka_iza_godine"] is not None:
        ima_tocku = bool(re.search(r"\b\d{4}\.\)?", m.group(0)))
        if oblik["tocka_iza_godine"] and not ima_tocku:
            nalazi.append((LOSE, f"godina bez točke ({m.group(0)}), a profil ju traži"))
        elif not oblik["tocka_iza_godine"] and ima_tocku:
            nalazi.append((LOSE, f"godina s točkom ({m.group(0)}), a profil ju ne traži"))
    return nalazi


NUMERICKI_STILOVI = ("ieee", "vancouver")


def provjeri_oblikovanje(odlomci, oblik):
    """Uvlaka i razmak — iz oblikovanja, ne iz teksta."""
    nalazi = []
    if oblik["uvlaka"] is not None:
        s_uvlakom = 0
        for p in odlomci:
            pf = p.paragraph_format
            uvucen = bool((pf.first_line_indent and pf.first_line_indent < 0)
                          or (pf.left_indent and pf.left_indent > 0))
            s_uvlakom += int(uvucen)
        udio = s_uvlakom / max(1, len(odlomci))
        if oblik["uvlaka"] and udio < 0.5:
            nalazi.append((LOSE, f"profil traži uvlaku u popisu, a ima ju "
                                 f"{s_uvlakom}/{len(odlomci)} jedinica"))
        elif not oblik["uvlaka"] and udio > 0.5:
            nalazi.append((LOSE, f"profil NE traži uvlaku, a ima ju "
                                 f"{s_uvlakom}/{len(odlomci)} jedinica"))
        else:
            nalazi.append((OK, "uvlaka u popisu je po profilu"))

    if oblik["razmak"] is not None:
        s_razmakom = sum(
            1 for p in odlomci
            if (p.paragraph_format.space_after and p.paragraph_format.space_after > 0)
            or (p.paragraph_format.space_before and p.paragraph_format.space_before > 0))
        udio = s_razmakom / max(1, len(odlomci))
        if oblik["razmak"] and udio < 0.5:
            nalazi.append((UPOZ, f"profil traži razmak između jedinica, a ima ga "
                                 f"{s_razmakom}/{len(odlomci)} — provjeri je li "
                                 f"razmak zadan stilom, što se ovdje ne vidi"))
        else:
            nalazi.append((OK, "razmak između jedinica je po profilu"))
    return nalazi


def abecedni_red(tekstovi):
    """Parovi koji su izvan hrvatskog abecednog reda (C < Č < Ć, S < Š, Z < Ž, D < Đ)."""
    kljucevi = [H.hr_kljuc(t.split(",")[0] if "," in t[:60] else t[:40])
                for t in tekstovi]
    lose = []
    for i in range(1, len(kljucevi)):
        if kljucevi[i] < kljucevi[i - 1]:
            lose.append((tekstovi[i - 1][:50], tekstovi[i][:50]))
    return lose


def provjeri(put, profil):
    odlomci = izvuci_popis(put)
    tekstovi = [_tekst(p) for p in odlomci]
    oblik = ocekivani_oblik(profil)

    u_skladu, odstupa, neprovjereno = [], [], []
    for t in tekstovi:
        if len(t) < 15:
            continue
        if je_neosoban(t):
            neprovjereno.append((t, "propis, mrežni ili institucijski izvor — "
                                    "obrazac za knjigu ne vrijedi"))
            continue
        if oblik["ime"] is None and oblik["zavrsna_tocka"] is None:
            neprovjereno.append((t, "profil nema `popis_primjer` iz kojeg bi se "
                                    "obrazac izveo"))
            continue
        n = provjeri_jedinicu(t, oblik)
        (odstupa if n else u_skladu).append((t, n))

    return {
        "jedinica": len([t for t in tekstovi if len(t) >= 15]),
        "u_skladu": len(u_skladu),
        "odstupa": [{"jedinica": t, "nalazi": [{"stanje": s, "poruka": p}
                                               for s, p in n]}
                    for t, n in odstupa],
        "neprovjereno": [{"jedinica": t, "razlog": r} for t, r in neprovjereno],
        "oblikovanje": [{"stanje": s, "poruka": p}
                        for s, p in provjeri_oblikovanje(odlomci, oblik)],
        # numerički popis (Vancouver/IEEE) ide po redoslijedu citiranja, ne
        # abecedi — provjera abecede tamo bi bila lažni nalaz (kvar 35b)
        "abecedni_red": [] if oblik.get("stil") in NUMERICKI_STILOVI else
                        [{"prije": a, "poslije": b}
                         for a, b in abecedni_red([t for t in tekstovi
                                                   if len(t) >= 15])],
        "oblik_iz_profila": oblik,
    }


def ispisi(r):
    print("POPIS LITERATURE — jedinica po jedinica protiv kućnog stila")
    print("=" * 60)
    o = r["oblik_iz_profila"]
    print(f"  profil: stil {o['stil']} · ime {o['ime'] or '?'} · "
          f"završna točka {o['zavrsna_tocka']} · godina s točkom {o['tocka_iza_godine']}")
    print(f"  {r['jedinica']} jedinica: {r['u_skladu']} u skladu, "
          f"{len(r['odstupa'])} odstupa, {len(r['neprovjereno'])} nije provjereno\n")

    for x in r["odstupa"]:
        print(f"{LOSE} {x['jedinica'][:78]}")
        for n in x["nalazi"]:
            print(f"     {n['stanje']} {n['poruka']}")
    for n in r["oblikovanje"]:
        print(f"{n['stanje']} {n['poruka']}")
    if r["abecedni_red"]:
        print(f"{UPOZ} abecedni red (hrvatski: C < Č < Ć, S < Š, Z < Ž, D < Đ) — "
              f"{len(r['abecedni_red'])} mjesta:")
        for x in r["abecedni_red"][:6]:
            print(f"     „{x['prije']}” pa „{x['poslije']}”")
    else:
        print(f"{OK} abecedni red je ispravan po hrvatskoj abecedi")
    if r["neprovjereno"]:
        print(f"\n{PRESKOK} nije provjereno ({len(r['neprovjereno'])}) — "
              f"ide u RUČNO PROVJERI:")
        for x in r["neprovjereno"][:8]:
            print(f"     {x['jedinica'][:60]} — {x['razlog']}")

    losih = len(r["odstupa"]) + sum(1 for n in r["oblikovanje"] if n["stanje"] == LOSE)
    print(f"\n{losih} kršenja koja blokiraju predaju." if losih
          else "\nNijedno kršenje kućnog stila u popisu.")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Popis literature protiv kućnog stila iz profila fakulteta.")
    ap.add_argument("rad", help=".docx (uvlaka i razmak se u markdownu ne vide)")
    ap.add_argument("--profil", required=True, help="resolved_profile.json")
    ap.add_argument("--json", dest="kao_json", metavar="PUT")
    ap.add_argument("--kat", help="putanja do .katedra/ (za jezik rada)")
    ap.add_argument("--project-root", dest="project_root")
    args = ap.parse_args(argv)

    smije, _j, _izvor = J.guard("provjeri_literaturu", ("hr",),
                                kat=getattr(args, "kat", None) or
                                    __import__("context").resolve_state_dir(
                                        None, getattr(args, "project_root", None)),
                                profil=getattr(args, "profil", None))
    if not smije:
        return 0


    if not os.path.exists(args.rad):
        print(f"❌ nema datoteke: {args.rad}", file=sys.stderr)
        return 2
    try:
        with open(args.profil, encoding="utf-8") as f:
            profil = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"❌ profil se ne da pročitati: {e}", file=sys.stderr)
        return 2

    try:
        r = provjeri(args.rad, profil)
    except ValueError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 2
    except Exception as e:  # noqa: BLE001 — alat koji pukne mora to reći
        print(f"❌ provjera nije uspjela: {type(e).__name__}: {e}", file=sys.stderr)
        return 2

    if not r["jedinica"]:
        print("❌ nijedna jedinica nije nađena — ima li rad naslov "
              "„Literatura”/„Popis literature”/„Popis citirane literature”/"
              "„Popis izvora”/„Reference”/„Bibliografija”?", file=sys.stderr)
        return 2

    ispisi(r)
    if args.kao_json:
        with open(args.kao_json, "w", encoding="utf-8") as f:
            json.dump(r, f, ensure_ascii=False, indent=1)
    losih = len(r["odstupa"]) + sum(1 for n in r["oblikovanje"] if n["stanje"] == LOSE)
    return 1 if losih else 0


if __name__ == "__main__":
    sys.exit(main())
