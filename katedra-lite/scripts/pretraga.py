#!/usr/bin/env python3
"""Strategija pretrage i plan čitanja — zapisano, ne prepričano.

Zašto postoji
-------------
Sve nizvodno od „imaš izvore” bilo je pokriveno: `verify_sources.py` provjerava
postoje li, `evidence_ingest.py` vadi dokaze s lokatorom, `claim_ledger.py` veže
tvrdnju uz dokaz. **Uzvodno nije postojalo ništa.** Odakle izvori dolaze, koje
baze su pretražene, kojim riječima, što je odbačeno i zašto — ničiji posao.

Dvije posljedice, obje stvarne:

1. Na obrani se pita *„kako ste došli do ove literature”*, a odgovora nema jer
   nitko nije bilježio. Za sistematski pregled to nije propust nego **izostanak
   metode**.
2. Student čita redom kojim je izvore našao, a ne redom kojim mu trebaju, pa
   tjedan dana ode na tekst koji je trebao samo preletjeti.

Ovaj alat vodi dvije datoteke: `.katedra/pretraga.json` (što je pretraženo) i
`.katedra/citanje.json` (što se čita, kojim redom, dokle se stiglo).

Što ovo NIJE
------------
Ne pretražuje baze umjesto tebe i ne ocjenjuje je li izvor dobar — za to postoje
`verify_sources.py` (postoji li) i taksonomija A/B/C/D/E/X (koliko vrijedi).
Ovdje se **bilježi postupak**, jer je postupak ono što se poslije mora obraniti.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
if SKRIPTE not in sys.path:
    sys.path.insert(0, SKRIPTE)

import context  # noqa: E402

PRETRAGA = "pretraga.json"
CITANJE = "citanje.json"
SHEMA = 1

ULOGE = ("jezgra", "potpora", "kontekst", "metoda", "odbaceno")
STATUSI = ("neprocitano", "preleteno", "procitano", "izvuceno")

# Uloga određuje KOLIKO se čita, ne koliko izvor vrijedi.
OPIS_ULOGA = {
    "jezgra": "nosi tezu ili joj proturječi — čita se cijelo, s bilješkama",
    "potpora": "potkrjepljuje jednu tvrdnju — čita se odjeljak koji je nosi",
    "kontekst": "smješta temu — dovoljan je sažetak i zaključak",
    "metoda": "uzor za dizajn ili instrument — čita se metodološki dio",
    "odbaceno": "ne ulazi u rad; razlog se zapisuje (kriterij isključenja)",
}


def _put(args, ime):
    return context.resolve_state_file(ime, kat=getattr(args, "kat", None),
                                      project_root=getattr(args, "project_root", None))


def _ucitaj(put, zadano=None):
    try:
        with open(put, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return zadano
    except json.JSONDecodeError as e:
        raise SystemExit(f"❌ {put} nije valjan JSON: {e}")


# --------------------------------------------------------------------------- #
# pretraga
# --------------------------------------------------------------------------- #

def cmd_init(args):
    put = _put(args, PRETRAGA)
    if os.path.exists(put) and not args.prisili:
        print(f"❌ {put} već postoji — koristi `upit` za dodavanje ili --prisili",
              file=sys.stderr)
        return 2
    p = {
        "schema_version": SHEMA,
        "pitanje": args.pitanje,
        "zapoceto": date.today().isoformat(),
        "kriteriji": {
            "ukljuci": args.ukljuci or [],
            "iskljuci": args.iskljuci or [],
            "razdoblje": args.razdoblje,
            "jezici": args.jezici or [],
        },
        "upiti": [],
        "snowball": [],
        "zasicenje": {"dosegnuto": False, "obrazlozenje": None},
    }
    context.atomic_write_json(put, p)
    print(f"✅ {put}")
    if not (args.ukljuci or args.iskljuci):
        print("⚠️  nema kriterija uključivanja ni isključivanja. Bez njih se poslije "
              "ne\n    može obraniti zašto je nešto izostavljeno — dodaj ih s "
              "`init --prisili`\n    ili ručno u datoteci.")
    return 0


def cmd_upit(args):
    put = _put(args, PRETRAGA)
    p = _ucitaj(put)
    if not p:
        print("❌ nema pretraga.json — prvo `init`", file=sys.stderr)
        return 2
    p["upiti"].append({
        "baza": args.baza,
        "upit": args.upit,
        "datum": args.datum or date.today().isoformat(),
        "pogodaka": args.pogodaka,
        "zadrzano": args.zadrzano,
        "napomena": args.napomena,
    })
    context.atomic_write_json(put, p)
    print(f"✅ zabilježen upit u {args.baza}: {args.pogodaka} pogodaka, "
          f"{args.zadrzano} zadržano")
    return 0


def cmd_snowball(args):
    put = _put(args, PRETRAGA)
    p = _ucitaj(put)
    if not p:
        print("❌ nema pretraga.json — prvo `init`", file=sys.stderr)
        return 2
    p["snowball"].append({"iz": args.iz, "smjer": args.smjer,
                          "nasao": args.nasao,
                          "datum": date.today().isoformat()})
    context.atomic_write_json(put, p)
    print(f"✅ snowball ({args.smjer}) iz {args.iz}: {args.nasao} novih")
    return 0


def cmd_zasicenje(args):
    put = _put(args, PRETRAGA)
    p = _ucitaj(put)
    if not p:
        print("❌ nema pretraga.json — prvo `init`", file=sys.stderr)
        return 2
    p["zasicenje"] = {"dosegnuto": args.dosegnuto == "da",
                      "obrazlozenje": args.obrazlozenje,
                      "datum": date.today().isoformat()}
    context.atomic_write_json(put, p)
    print("✅ zasićenje zabilježeno")
    return 0


def cmd_pozicija(args):
    """Najbliži postojeći radovi i razlika prema svakome.

    Ovo je odgovor na prvo pitanje komisije („što je tu novo?”) i rečenica koja u
    uvodu razlikuje rad koji zna gdje stoji od rada koji je samo pročitao
    literaturu. Bez zapisa se ta rečenica piše napamet, pred kraj, i obično
    ispadne „o ovoj temi malo je pisano” — što je najslabija moguća tvrdnja jer
    se lako obara jednim naslovom.
    """
    put = _put(args, PRETRAGA)
    p = _ucitaj(put)
    if not p:
        print("❌ nema pretraga.json — prvo `init`", file=sys.stderr)
        return 2
    p.setdefault("pozicija", [])
    p["pozicija"] = [x for x in p["pozicija"] if x.get("izvor") != args.izvor]
    p["pozicija"].append({
        "izvor": args.izvor,
        "sto_radi": args.sto_radi,
        "razlika": args.razlika,
        "datum": date.today().isoformat(),
    })
    context.atomic_write_json(put, p)
    print(f"✅ {args.izvor}: razlika zabilježena "
          f"({len(p['pozicija'])} najbližih radova)")
    if len(p["pozicija"]) < 3:
        print("⚠️  tri najbliža rada su minimum. S jednim se ne vidi je li razlika "
              "u\n    temi, podacima ili pristupu.")
    return 0


# --------------------------------------------------------------------------- #
# čitanje
# --------------------------------------------------------------------------- #

def cmd_citanje(args):
    put = _put(args, CITANJE)
    c = _ucitaj(put, {"schema_version": SHEMA, "izvori": {}})
    z = c["izvori"].setdefault(args.izvor, {})
    if args.uloga:
        z["uloga"] = args.uloga
    if args.status:
        z["status"] = args.status
    if args.biljeska:
        z["biljeska"] = args.biljeska
    if args.razlog:
        z["razlog"] = args.razlog
    z.setdefault("uloga", "kontekst")
    z.setdefault("status", "neprocitano")
    z["azurirano"] = date.today().isoformat()
    if z["uloga"] == "odbaceno" and not z.get("razlog"):
        print("⚠️  odbačen izvor bez razloga — kriterij isključenja mora biti "
              "zapisan\n    (`--razlog \"izvan razdoblja\"`)")
    context.atomic_write_json(put, c)
    print(f"✅ {args.izvor}: uloga {z['uloga']}, status {z['status']}")
    return 0


def _redoslijed(c):
    """Redoslijed čitanja: jezgra prije potpore, nepročitano prije pročitanog."""
    tez_u = {"jezgra": 0, "metoda": 1, "potpora": 2, "kontekst": 3, "odbaceno": 9}
    tez_s = {"neprocitano": 0, "preleteno": 1, "procitano": 2, "izvuceno": 3}
    return sorted(c.get("izvori", {}).items(),
                  key=lambda kv: (tez_u.get(kv[1].get("uloga"), 5),
                                  tez_s.get(kv[1].get("status"), 5), kv[0]))


def cmd_status(args):
    p = _ucitaj(_put(args, PRETRAGA))
    c = _ucitaj(_put(args, CITANJE), {"izvori": {}})

    print("PRETRAGA I ČITANJE")
    print("=" * 20)
    if not p:
        print("➖ pretraga nije zabilježena — na obrani nema odgovora na pitanje "
              "„kako ste\n   došli do ove literature”. Pokreni `pretraga.py init`.")
    else:
        k = p.get("kriteriji") or {}
        print(f"  pitanje: {p.get('pitanje')}")
        print(f"  razdoblje: {k.get('razdoblje') or '—'} · "
              f"jezici: {', '.join(k.get('jezici') or []) or '—'}")
        print(f"  uključuje: {'; '.join(k.get('ukljuci') or []) or '—'}")
        print(f"  isključuje: {'; '.join(k.get('iskljuci') or []) or '—'}")
        upiti = p.get("upiti") or []
        pog = sum((u.get("pogodaka") or 0) for u in upiti)
        zad = sum((u.get("zadrzano") or 0) for u in upiti)
        sb = sum((s.get("nasao") or 0) for s in p.get("snowball") or [])
        print(f"\n  {len(upiti)} upita u {len({u['baza'] for u in upiti})} baza: "
              f"{pog} pogodaka → {zad} zadržano · snowball {sb}")
        for u in upiti:
            print(f"     {u['datum']}  {u['baza']:<12} „{u['upit']}” → "
                  f"{u.get('pogodaka')}/{u.get('zadrzano')}")
        z = p.get("zasicenje") or {}
        print(f"  zasićenje: {'da' if z.get('dosegnuto') else 'ne'}"
              + (f" — {z['obrazlozenje']}" if z.get("obrazlozenje") else ""))

    poz = (p or {}).get("pozicija") or []
    if poz:
        print(f"\n  POZICIJA — {len(poz)} najbližih radova")
        for x in poz:
            print(f"     {x['izvor']}")
            print(f"        radi:    {x.get('sto_radi')}")
            print(f"        razlika: {x.get('razlika')}")
        print("     → jedna rečenica u uvodu, odlomak u raspravi, prvo pitanje "
              "komisije")
    elif p:
        print("\n➖ pozicija nije zabilježena — na „što je tu novo?” nema "
              "pripremljenog\n   odgovora (`pretraga.py pozicija …`)")

    izvori = c.get("izvori") or {}
    if not izvori:
        print("\n➖ plan čitanja prazan — `pretraga.py citanje <src_id> --uloga …`")
        return 0
    print(f"\n  PLAN ČITANJA ({len(izvori)} izvora)")
    po_ulozi = {}
    for sid, z in izvori.items():
        po_ulozi.setdefault(z.get("uloga", "kontekst"), []).append((sid, z))
    for uloga in ULOGE:
        if uloga not in po_ulozi:
            continue
        print(f"\n  — {uloga}: {OPIS_ULOGA[uloga]}")
        for sid, z in sorted(po_ulozi[uloga]):
            znak = {"neprocitano": "⬜", "preleteno": "🟨",
                    "procitano": "✅", "izvuceno": "✅"}.get(z.get("status"), "?")
            red = f"     {znak} {sid} — {z.get('status')}"
            if z.get("razlog"):
                red += f" ({z['razlog']})"
            print(red)
    sljedeci = [sid for sid, z in _redoslijed(c)
                if z.get("uloga") != "odbaceno"
                and z.get("status") in ("neprocitano", "preleteno")]
    if sljedeci:
        print(f"\n  sljedeće na čitanje: {', '.join(sljedeci[:5])}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Strategija pretrage i plan čitanja — zapisano, ne prepričano.")
    ap.add_argument("--kat")
    ap.add_argument("--project-root", dest="project_root")
    sub = ap.add_subparsers(dest="naredba", required=True)

    i = sub.add_parser("init", help="započni zapis pretrage")
    i.add_argument("--pitanje", required=True)
    i.add_argument("--ukljuci", action="append", help="kriterij uključivanja")
    i.add_argument("--iskljuci", action="append", help="kriterij isključivanja")
    i.add_argument("--razdoblje", help="npr. 2015.–2026.")
    i.add_argument("--jezici", action="append")
    i.add_argument("--prisili", action="store_true")
    i.set_defaults(f=cmd_init)

    u = sub.add_parser("upit", help="zabilježi jedan upit u jednoj bazi")
    u.add_argument("--baza", required=True, help="Hrčak, CroRIS, Scopus, EBSCO, Dabar…")
    u.add_argument("--upit", required=True)
    u.add_argument("--pogodaka", type=int, required=True)
    u.add_argument("--zadrzano", type=int, required=True)
    u.add_argument("--datum")
    u.add_argument("--napomena")
    u.set_defaults(f=cmd_upit)

    s = sub.add_parser("snowball", help="izvori nađeni iz popisa drugog izvora")
    s.add_argument("--iz", required=True, help="source_id iz kojeg se išlo")
    s.add_argument("--smjer", choices=("unatrag", "unaprijed"), default="unatrag",
                   help="unatrag = iz popisa literature; unaprijed = tko ga citira")
    s.add_argument("--nasao", type=int, required=True)
    s.set_defaults(f=cmd_snowball)

    z = sub.add_parser("zasicenje", help="jesu li novi upiti prestali davati novo")
    z.add_argument("--dosegnuto", choices=("da", "ne"), required=True)
    z.add_argument("--obrazlozenje")
    z.set_defaults(f=cmd_zasicenje)

    c = sub.add_parser("citanje", help="uloga i status jednog izvora")
    c.add_argument("izvor", help="source_id iz .katedra/izvori.json")
    c.add_argument("--uloga", choices=ULOGE)
    c.add_argument("--status", choices=STATUSI)
    c.add_argument("--biljeska")
    c.add_argument("--razlog", help="obavezno uz --uloga odbaceno")
    c.set_defaults(f=cmd_citanje)

    pz = sub.add_parser("pozicija",
                        help="najbliži postojeći rad i razlika prema njemu")
    pz.add_argument("--izvor", required=True, help="source_id ili kratka oznaka rada")
    pz.add_argument("--sto-radi", dest="sto_radi", required=True,
                    help="što taj rad radi: predmet, podaci, metoda")
    pz.add_argument("--razlika", required=True,
                    help="što ovaj rad radi drukčije — ne „noviji podaci” samo")
    pz.set_defaults(f=cmd_pozicija)

    st = sub.add_parser("status", help="pregled pretrage i plana čitanja")
    st.set_defaults(f=cmd_status)

    args = ap.parse_args(argv)
    return args.f(args)


if __name__ == "__main__":
    sys.exit(main())
