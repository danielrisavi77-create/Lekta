#!/usr/bin/env python3
"""Jesi li u zaostatku — mjereno, ne procijenjeno.

Zašto postoji
-------------
Hodogram u `references/predaja.md` računa unatrag od roka i **postoji tek u modu
6**. Do tada nitko ne zna stoji li rad. A sve što treba za odgovor već je u
projektu: `plan.json` nosi `stranice`, `status` i `rijeci` po potpoglavlju,
`stanje.json` nosi `rok`. Nijedan alat te dvije datoteke nije spojio.

Posljedica je poznata: student misli da je „na pola" jer je napisao pola
poglavlja, a poglavlja koja su ostala nose dvije trećine stranica. Razlika se
vidi tek kad se broji ono što je planirano, a ne ono što je otkucano.

Što ovo NIJE
------------
Nije procjena kvalitete ni obećanje da će rad biti gotov. Mjeri **opseg naspram
vremena** i ništa više. Administrativni rep (Turnitin, uvez, referada) uzima se
iz profila i oduzima od raspoloživih dana, jer se on redovito zaboravi.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
if SKRIPTE not in sys.path:
    sys.path.insert(0, SKRIPTE)

import context  # noqa: E402

GOTOVO = ("napisano", "provjereno")
U_TIJEKU = ("u-tijeku",)
# Bez podatka iz profila: koliko dana pojedu Turnitin, ispravci, uvez i referada.
REP_DANA_ZADANO = 14


def _ucitaj(put):
    try:
        with open(put, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _potpoglavlja(plan):
    for pg in plan.get("poglavlja") or []:
        pp = pg.get("potpoglavlja") or []
        if pp:
            for x in pp:
                yield pg, x
        else:
            # Poglavlje bez potpoglavlja je vlastita jedinica posla.
            yield pg, {"broj": pg.get("broj"), "naslov": pg.get("naslov"),
                       "stranice": pg.get("stranice"),
                       "status": pg.get("status", "nije-napisano"),
                       "rijeci": pg.get("rijeci", 0)}


def izracun(plan, stanje, profil=None, danas=None):
    danas = danas or date.today()
    jedinice = list(_potpoglavlja(plan))
    ukupno_str = sum((x.get("stranice") or 0) for _, x in jedinice)
    gotovo_str = sum((x.get("stranice") or 0) for _, x in jedinice
                     if x.get("status") in GOTOVO)
    u_tijeku_str = sum((x.get("stranice") or 0) for _, x in jedinice
                       if x.get("status") in U_TIJEKU)
    budzet = plan.get("budzet_stranica") or ukupno_str or 0

    r = {
        "danas": danas.isoformat(),
        "jedinica_ukupno": len(jedinice),
        "jedinica_gotovo": sum(1 for _, x in jedinice if x.get("status") in GOTOVO),
        "stranica_planirano": ukupno_str,
        "stranica_gotovo": gotovo_str,
        "stranica_u_tijeku": u_tijeku_str,
        "budzet_stranica": budzet,
        "rijeci_napisano": sum((x.get("rijeci") or 0) for _, x in jedinice),
        "udio_gotovo": round(gotovo_str / ukupno_str, 3) if ukupno_str else None,
        "rok": None, "dana_do_roka": None, "rep_dana": None,
        "dana_za_pisanje": None, "stranica_dnevno": None,
        "ocjena": None, "poruka": None,
        "sljedece": [f"{x.get('broj')} {x.get('naslov')}" for _, x in jedinice
                     if x.get("status") not in GOTOVO][:5],
    }

    rok = (stanje or {}).get("rok")
    if not rok:
        r["poruka"] = ("nema roka u stanje.json — tempo se ne može izračunati. "
                       "Upiši ga: stanje_init.py --set rok=RRRR-MM-DD")
        return r
    try:
        d_rok = datetime.strptime(str(rok), "%Y-%m-%d").date()
    except ValueError:
        r["poruka"] = f"rok „{rok}” nije u obliku RRRR-MM-DD"
        return r

    # Rep predaje pripada VRSTI rada, ne fakultetu: koraci koji ga čine (Turnitin,
    # uvez, repozitorij, prijava obrane) su koraci završnog i diplomskog. Dok se
    # čitao samo s razine fakulteta, svaki seminarski s rokom kraćim od 14 dana
    # dobivao je „rok je prošao ili ga jede administrativni rep" — na seminarskom
    # koji se predaje e-mailom, sedam dana prije roka, to je bila neistina koja
    # gasi cijelu procjenu tempa. Izvor repa se sada i ispisuje, jer brojka bez
    # izvora ne da se provjeriti.
    _pred = (profil or {}).get("predaja") or {}
    rep = _pred.get("administrativni_rep_dana")
    if isinstance(rep, (int, float)):
        r["rep_izvor"] = "profil (predaja.administrativni_rep_dana)"
    else:
        rep, r["rep_izvor"] = REP_DANA_ZADANO, "zadano u tempo.py (profil ga ne propisuje)"
    rep = int(rep)
    do_roka = (d_rok - danas).days
    za_pisanje = do_roka - rep

    r.update({"rok": d_rok.isoformat(), "dana_do_roka": do_roka,
              "rep_dana": rep, "dana_za_pisanje": za_pisanje})

    preostalo = ukupno_str - gotovo_str
    r["stranica_preostalo"] = preostalo

    if za_pisanje <= 0:
        r["ocjena"] = "rok je prošao ili ga jede administrativni rep"
        r["poruka"] = (f"do roka je {do_roka} dana, a sam administrativni rep traži "
                       f"{rep}. Realno je pomaknuti rok ili skratiti krug s mentorom.")
        return r

    dnevno = preostalo / za_pisanje
    r["stranica_dnevno"] = round(dnevno, 2)
    if dnevno <= 0.8:
        r["ocjena"] = "u planu"
    elif dnevno <= 1.5:
        r["ocjena"] = "napeto"
    elif dnevno <= 3:
        r["ocjena"] = "zaostatak"
    else:
        r["ocjena"] = "nerealno"
    r["poruka"] = (f"{preostalo} od {ukupno_str} planiranih stranica u "
                   f"{za_pisanje} dana pisanja = {dnevno:.2f} str./dan")
    return r


def ispisi(r):
    print("TEMPO — opseg naspram vremena")
    print("=" * 32)
    print(f"  napisano: {r['stranica_gotovo']}/{r['stranica_planirano']} planiranih "
          f"stranica"
          + (f" ({r['udio_gotovo']:.0%})" if r["udio_gotovo"] is not None else "")
          + f" · {r['jedinica_gotovo']}/{r['jedinica_ukupno']} jedinica")
    if r["stranica_u_tijeku"]:
        print(f"  u tijeku: {r['stranica_u_tijeku']} str.")
    if r["rijeci_napisano"]:
        print(f"  riječi zabilježeno: {r['rijeci_napisano']}")
    if r["rok"]:
        print(f"\n  rok: {r['rok']} · do roka {r['dana_do_roka']} dana"
              f" · administrativni rep {r['rep_dana']} dana ({r.get('rep_izvor', '?')})"
              f" → {r['dana_za_pisanje']} dana pisanja")
    if r["poruka"]:
        print(f"\n  {r['poruka']}")
    if r["ocjena"]:
        znak = {"u planu": "✅", "napeto": "⚠️", "zaostatak": "❌",
                "nerealno": "❌"}.get(r["ocjena"], "•")
        print(f"  {znak} {r['ocjena'].upper()}")
    if r["sljedece"]:
        print("\n  sljedeće na redu:")
        for s in r["sljedece"]:
            print(f"     · {s}")
    print("\nMjeri se opseg naspram vremena, ne kvaliteta. Administrativni rep je")
    print("odbijen od raspoloživih dana jer se redovito zaboravi.")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Jesi li u zaostatku: planirane stranice naspram dana do roka.")
    ap.add_argument("--project-root", dest="project_root")
    ap.add_argument("--kat")
    ap.add_argument("--profil", help="resolved_profile.json (administrativni rep)")
    ap.add_argument("--danas", help="RRRR-MM-DD, za provjeru izračuna")
    ap.add_argument("--json", dest="kao_json", metavar="PUT")
    ap.add_argument("--strogo", action="store_true",
                    help="izlazni kod 1 kad je ocjena zaostatak ili nerealno")
    args = ap.parse_args(argv)

    kat = context.resolve_state_dir(args.kat, args.project_root)
    plan = _ucitaj(os.path.join(kat, "plan.json"))
    stanje = _ucitaj(os.path.join(kat, "stanje.json"))
    if not plan:
        print(f"❌ nema {os.path.join(kat, 'plan.json')} — tempo se mjeri protiv "
              f"PLANA, ne protiv dokumenta", file=sys.stderr)
        return 2
    profil = _ucitaj(args.profil) if args.profil else None
    danas = None
    if args.danas:
        try:
            danas = datetime.strptime(args.danas, "%Y-%m-%d").date()
        except ValueError:
            print("❌ --danas mora biti RRRR-MM-DD", file=sys.stderr)
            return 2

    r = izracun(plan, stanje, profil, danas)
    ispisi(r)
    if args.kao_json:
        context.atomic_write_json(os.path.abspath(args.kao_json), r)
    if args.strogo and r["ocjena"] in ("zaostatak", "nerealno",
                                       "rok je prošao ili ga jede administrativni rep"):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
