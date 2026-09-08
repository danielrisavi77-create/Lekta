#!/usr/bin/env python3
"""Os dijelova rada — registar, sijanje iz profila i izvještaj o pokrivenosti.

Modovi su os vremena. Ovo je os dokumenta. Prije v1.3 Katedra nije imala nijednu
datoteku koja odgovara na pitanje „od kojih se dijelova rad sastoji i koji dio
nitko ne provjerava"; pokrivenost je postojala samo kao nuspojava odabranog moda.

Podjela posla je stroga i namjerna:

* ``check_rules.py``  — je li dio PRISUTAN u .docx-u (zrela sinonimika, padeži,
  naslovi vs. proza). Ovaj modul ju UVOZI, ne prepisuje: dva popisa sinonima
  razišla bi se unutar tjedna (željezno pravilo 13 primijenjeno na tekst).
* ``dijelovi.py``     — koje dijelove rad UOPĆE treba, tko ih proizvodi, tko ih
  provjerava i što im je status. Ono čega nema u profilu, a postoji u svijetu
  (izjava o AI alatima, rasprava, prilozi), ovdje ima svoj zapis.

Registar je ``references/dijelovi.json``; stanje rada je ``.katedra/dijelovi.json``.
Novi dio = jedan zapis u registru, bez ijedne izmjene ovoga koda.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
KORIJEN = os.path.dirname(SKRIPTE)
if SKRIPTE not in sys.path:
    sys.path.insert(0, SKRIPTE)

import context  # noqa: E402
from check_rules import (  # noqa: E402
    SINONIMI,
    je_neobavezan_dio,
    norm,
)

REGISTAR = os.path.join(KORIJEN, "references", "dijelovi.json")
STANJE_IME = "dijelovi.json"
SHEMA = 1

STATUSI = ("nije-napravljeno", "u-izradi", "napravljeno", "provjereno",
           "ne-primjenjuje-se")
RAZINE = ("strojno", "rucno", "nepokriveno")

OZNAKA_STATUSA = {
    "nije-napravljeno": "⬜",
    "u-izradi": "\U0001f7e8",
    "napravljeno": "✅",
    "provjereno": "✅",
    "ne-primjenjuje-se": "➖",
}
OZNAKA_RAZINE = {"strojno": "\U0001f527", "rucno": "\U0001f441", "nepokriveno": "❗"}


class RegistarError(RuntimeError):
    """Registar dijelova je neispravan ili nedostupan."""


# --------------------------------------------------------------------------- #
# registar
# --------------------------------------------------------------------------- #

def ucitaj_registar(put: str = REGISTAR) -> dict:
    try:
        with open(put, encoding="utf-8") as f:
            reg = json.load(f)
    except FileNotFoundError as e:
        raise RegistarError(f"registar dijelova nije nađen: {put}") from e
    except json.JSONDecodeError as e:
        raise RegistarError(f"registar dijelova nije valjan JSON: {e}") from e
    if not isinstance(reg.get("dijelovi"), dict) or not reg["dijelovi"]:
        raise RegistarError("registar nema ključ 'dijelovi'")
    for pid, zapis in reg["dijelovi"].items():
        provjera = zapis.get("provjera") or {}
        if provjera.get("razina") not in RAZINE:
            raise RegistarError(
                f"dio '{pid}': provjera.razina mora biti jedna od {RAZINE}")
    return reg


def _oblici(zapis: dict, pid: str) -> list[str]:
    """Normalizirani oblici pod kojima profil može zvati ovaj dio.

    Uz eksplicitne ``profil_nazivi`` uzimaju se i sinonimi iz ``check_rules`` za
    svaki od njih, pa se registar ne mora održavati usporedo s tom tablicom.
    """
    sirovi = list(zapis.get("profil_nazivi") or [])
    sirovi.append(zapis.get("naziv") or pid)
    sirovi.append(pid.replace("_", " "))
    oblici: set[str] = set()
    for s in sirovi:
        n = norm(s)
        if not n:
            continue
        oblici.add(n)
        oblici.update(norm(x) for x in SINONIMI.get(n, []))
    return sorted(o for o in oblici if o)


def mapiraj_profil(nazivi, reg: dict) -> tuple[dict[str, list[str]], list[str]]:
    """Naziv iz profila -> kanonski id(evi) dijela.

    Preslikavanje je jedan-prema-više: Libertas jednim nazivom
    („popis-tablica-slika-grafikona") traži dva dijela, i oba moraju biti
    zasijana. Prvi pogodak bi tiho izgubio drugi.

    Vraća i popis naziva koje registar NE poznaje. Taj popis nije kozmetika: on
    je jedini način da se vidi kako os dijelova zaostaje za stvarnim profilom.
    Registar koji šuti o onome što ne pokriva mjeri sam sebe.
    """
    tablica = {pid: _oblici(z, pid) for pid, z in reg["dijelovi"].items()}
    mapa: dict[str, list[str]] = {}
    nepoznati: list[str] = []
    for naziv in nazivi:
        n = norm(naziv)
        if not n:
            continue
        pogodci = [pid for pid, oblici in tablica.items() if n in oblici]
        if not pogodci:
            # Širi prolaz: profil zna nabrajati („popis tablica, slika i grafikona")
            pogodci = [pid for pid, oblici in tablica.items()
                       if any(o and (o in n or n in o) and len(o) > 4 for o in oblici)]
        if pogodci:
            mapa[naziv] = pogodci
        else:
            nepoznati.append(naziv)
    return mapa, nepoznati


# --------------------------------------------------------------------------- #
# stanje projekta
# --------------------------------------------------------------------------- #

def _put_stanja(args) -> str:
    return context.resolve_state_file(
        STANJE_IME, kat=getattr(args, "kat", None),
        project_root=getattr(args, "project_root", None))


def ucitaj_stanje(put: str) -> dict | None:
    try:
        with open(put, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as e:
        raise RegistarError(f"{put} nije valjan JSON: {e}") from e


def _pokazatelj(profil: dict, pointer: str | None):
    """Vrijednost na JSON Pointeru u profilu, ili None.

    Neki dio nije naveden medju `struktura.obavezni_dijelovi` jer nije dio
    dokumenta (Turnitin), a ipak je obavezan cim ga profil negdje propisuje.
    Bez ovoga bi takav dio ispao „ne primjenjuje se" na svakom fakultetu.
    """
    if not pointer:
        return None
    cvor = profil
    for korak in pointer.strip("/").split("/"):
        if not isinstance(cvor, dict) or korak not in cvor:
            return None
        cvor = cvor[korak]
    return cvor


def _profil(put: str | None) -> dict:
    if not put:
        return {}
    try:
        with open(put, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise RegistarError(f"profil nije nađen: {put}")
    except json.JSONDecodeError as e:
        raise RegistarError(f"profil nije valjan JSON: {e}") from e


def sij(reg: dict, profil: dict, tip: str | None,
        postojece: dict | None = None) -> dict:
    """Sastavi stanje dijelova iz registra + resolved profila.

    Sijanje je **monotono**: status već zapisanog dijela se ne gubi kad se profil
    kasnije promijeni ili kad se registar proširi. Rad koji je na pola ne smije
    izgubiti trag samo zato što je netko dodao novi dio u registar.
    """
    struktura = (profil.get("struktura") or {})
    trazeni = list(struktura.get("obavezni_dijelovi") or [])
    mapa, nepoznati = mapiraj_profil(trazeni, reg)
    iz_profila = {pid for pidovi in mapa.values() for pid in pidovi}
    neobavezni_u_profilu = {
        pid for n in trazeni if n in mapa and je_neobavezan_dio(n)
        for pid in mapa[n]
    }

    stari = ((postojece or {}).get("dijelovi") or {})
    dijelovi: dict[str, dict] = {}
    for pid, zapis in reg["dijelovi"].items():
        obavezan = zapis.get("obavezan")
        if obavezan == "uvijek":
            trazi = "da"
        elif obavezan == "profil":
            trazi = "da" if pid in iz_profila else "ne"
        else:  # uvjetno
            if pid in iz_profila:
                trazi = "da"
            elif _pokazatelj(profil, zapis.get("profil_pokazatelj")) is not None:
                trazi = "da"
            else:
                trazi = "provjeri"
        if pid in neobavezni_u_profilu:
            trazi = "provjeri"

        prosli = stari.get(pid) or {}
        dijelovi[pid] = {
            "naziv": zapis.get("naziv", pid),
            "skupina": zapis.get("skupina"),
            "trazi_profil": trazi,
            "uvjet": zapis.get("uvjet"),
            "razina_provjere": (zapis.get("provjera") or {}).get("razina"),
            "status": prosli.get("status", "nije-napravljeno"),
            "napomena": prosli.get("napomena"),
        }
        if trazi == "ne" and prosli.get("status") in (None, "nije-napravljeno"):
            dijelovi[pid]["status"] = "ne-primjenjuje-se"

    return {
        "schema_version": SHEMA,
        "zasijano": (postojece or {}).get("zasijano") or date.today().isoformat(),
        "azurirano": date.today().isoformat(),
        "tip": tip or (postojece or {}).get("tip"),
        "fakultet": profil.get("slug") or (postojece or {}).get("fakultet"),
        "profil_nepoznati_nazivi": nepoznati,
        "dijelovi": dijelovi,
    }


# --------------------------------------------------------------------------- #
# izvještaj
# --------------------------------------------------------------------------- #

def redci(stanje: dict, reg: dict, samo_trazeno: bool = False) -> list[dict]:
    out = []
    for pid, s in stanje.get("dijelovi", {}).items():
        zapis = reg["dijelovi"].get(pid, {})
        if samo_trazeno and s.get("trazi_profil") == "ne":
            continue
        out.append({
            "id": pid,
            "naziv": s.get("naziv", pid),
            "skupina": s.get("skupina"),
            "trazi_profil": s.get("trazi_profil"),
            "status": s.get("status"),
            "razina": s.get("razina_provjere"),
            "naredba": (zapis.get("provjera") or {}).get("naredba"),
            "kako": (zapis.get("provjera") or {}).get("kako"),
            "napomena": s.get("napomena"),
            "redoslijed": zapis.get("redoslijed", 999),
        })
    red = {"prednji": 0, "tijelo": 1, "zadnji": 2, "proces": 3}
    out.sort(key=lambda r: (red.get(r["skupina"], 9), r["redoslijed"], r["naziv"]))
    return out


def _ispis(stanje: dict, reg: dict, opsirno: bool = False) -> None:
    rs = redci(stanje, reg)
    zaglavlje = (f"DIJELOVI RADA — {stanje.get('fakultet') or 'bez profila'}"
                 f" / {stanje.get('tip') or 'bez tipa'}")
    print(zaglavlje)
    print("=" * len(zaglavlje))
    trenutna = None
    for r in rs:
        if r["skupina"] != trenutna:
            trenutna = r["skupina"]
            print(f"\n— {(reg.get('skupine') or {}).get(trenutna, trenutna)}")
        trazi = {"da": "obavezno", "ne": "–", "provjeri": "provjeri"}[r["trazi_profil"]]
        print(f"  {OZNAKA_STATUSA.get(r['status'], '?')} "
              f"{OZNAKA_RAZINE.get(r['razina'], '?')} "
              f"{r['naziv']:<46} {trazi:<9} {r['status']}")
        if opsirno and r["razina"] == "nepokriveno":
            print(f"        ❗ nitko ne provjerava: {r['kako']}")
        elif opsirno and r["naredba"]:
            print(f"        $ {r['naredba']}")

    nepoznati = stanje.get("profil_nepoznati_nazivi") or []
    if nepoznati:
        print("\n⚠️  profil traži dijelove koje registar ne poznaje "
              "(dodaj zapis u references/dijelovi.json):")
        for n in nepoznati:
            print(f"      · {n}")

    s = sazetak(stanje, reg)
    print(f"\n{s['trazeno']} traženih dijelova: "
          f"{s['provjereno']} provjereno, {s['napravljeno']} napravljeno, "
          f"{s['u_izradi']} u izradi, {s['nije_napravljeno']} nije napravljeno")
    print(f"pokrivenost provjerom: {s['strojno']} strojno, {s['rucno']} ručno, "
          f"{s['nepokriveno']} nepokriveno")
    if s["nepokriveno"]:
        print("nepokriveni dijelovi idu u tablicu RUČNO PROVJERI — "
              "željezno pravilo 8 traži da se granica kaže, ne prešuti.")


def sazetak(stanje: dict, reg: dict) -> dict:
    rs = [r for r in redci(stanje, reg) if r["trazi_profil"] != "ne"]
    br = lambda st: sum(1 for r in rs if r["status"] == st)  # noqa: E731
    razina = lambda x: sum(1 for r in rs if r["razina"] == x)  # noqa: E731
    return {
        "trazeno": len(rs),
        "provjereno": br("provjereno"),
        "napravljeno": br("napravljeno"),
        "u_izradi": br("u-izradi"),
        "nije_napravljeno": br("nije-napravljeno"),
        "ne_primjenjuje_se": br("ne-primjenjuje-se"),
        "strojno": razina("strojno"),
        "rucno": razina("rucno"),
        "nepokriveno": razina("nepokriveno"),
        "otvoreni": [r["id"] for r in rs
                     if r["status"] in ("nije-napravljeno", "u-izradi")],
    }


def izlazni_kod(stanje: dict, reg: dict, faza: str) -> int:
    """0 = može dalje. 1 = nešto obavezno nije gotovo.

    Prije predaje se traži ``provjereno`` ili ``napravljeno``; „u izradi" i
    „nije napravljeno" blokiraju. Za ranije faze blokira samo ono što je još
    netaknuto, jer rad u pisanju po definiciji ima nedovršene dijelove.
    """
    rs = [r for r in redci(stanje, reg) if r["trazi_profil"] == "da"]
    if faza == "predaja":
        losi = [r for r in rs if r["status"] in ("nije-napravljeno", "u-izradi")]
    else:
        losi = [r for r in rs if r["status"] == "nije-napravljeno"
                and r["skupina"] != "proces"]
    return 1 if losi else 0


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Os dijelova rada: sijanje iz profila, status i pokrivenost.")
    ap.add_argument("--sij", action="store_true",
                    help="sastavi/osvježi .katedra/dijelovi.json iz registra i profila")
    ap.add_argument("--status", action="store_true", help="tablica dijelova")
    ap.add_argument("--provjeri", action="store_true",
                    help="izlazni kod 1 ako obavezan dio nije gotov")
    ap.add_argument("--faza", default="pisanje", choices=("pisanje", "predaja"),
                    help="strogost provjere (predaja je stroža)")
    ap.add_argument("--set", dest="postavi", action="append", metavar="ID=STATUS",
                    help=f"postavi status dijela; {'|'.join(STATUSI)}")
    ap.add_argument("--napomena", help="napomena uz --set")
    ap.add_argument("--profil", help="put do .katedra/resolved_profile.json")
    ap.add_argument("--tip", help="seminarski|zavrsni|diplomski")
    ap.add_argument("--registar", default=REGISTAR)
    ap.add_argument("--project-root", dest="project_root")
    ap.add_argument("--kat")
    ap.add_argument("--json", dest="kao_json", action="store_true")
    ap.add_argument("--opsirno", action="store_true",
                    help="uz svaki dio ispiši naredbu ili razlog nepokrivenosti")
    args = ap.parse_args(argv)

    try:
        reg = ucitaj_registar(args.registar)
    except RegistarError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 2

    put = _put_stanja(args)
    try:
        stanje = ucitaj_stanje(put)

        if args.sij:
            profil = _profil(args.profil)
            if not profil and not stanje:
                print("⚠️  bez --profil sije se samo ono što registar traži uvijek; "
                      "razriješi profil pa ponovi (references/intake.md § 0.5)",
                      file=sys.stderr)
            stanje = sij(reg, profil, args.tip, stanje)
            context.atomic_write_json(put, stanje)
            print(f"✅ zasijano: {put}")

        if args.postavi:
            if stanje is None:
                print("❌ nema .katedra/dijelovi.json — prvo --sij", file=sys.stderr)
                return 2
            for par in args.postavi:
                if "=" not in par:
                    print(f"❌ očekujem ID=STATUS, dobio: {par}", file=sys.stderr)
                    return 2
                pid, status = par.split("=", 1)
                pid, status = pid.strip(), status.strip()
                if pid not in stanje["dijelovi"]:
                    print(f"❌ nepoznat dio: {pid}", file=sys.stderr)
                    return 2
                if status not in STATUSI:
                    print(f"❌ nepoznat status: {status} ({'|'.join(STATUSI)})",
                          file=sys.stderr)
                    return 2
                stanje["dijelovi"][pid]["status"] = status
                if args.napomena:
                    stanje["dijelovi"][pid]["napomena"] = args.napomena
            stanje["azurirano"] = date.today().isoformat()
            context.atomic_write_json(put, stanje)
            print(f"✅ zapisano: {put}")

        if stanje is None:
            print("❌ nema .katedra/dijelovi.json — pokreni --sij "
                  "(mod 1, nakon razrješavanja profila)", file=sys.stderr)
            return 2

        if args.kao_json:
            print(json.dumps({"sazetak": sazetak(stanje, reg),
                              "dijelovi": redci(stanje, reg),
                              "profil_nepoznati_nazivi":
                                  stanje.get("profil_nepoznati_nazivi") or []},
                             ensure_ascii=False, indent=1))
        elif args.status or not (args.sij or args.postavi or args.provjeri):
            _ispis(stanje, reg, opsirno=args.opsirno)

        if args.provjeri:
            kod = izlazni_kod(stanje, reg, args.faza)
            if kod:
                otvoreni = [r["naziv"] for r in redci(stanje, reg)
                            if r["trazi_profil"] == "da"
                            and r["status"] in (("nije-napravljeno", "u-izradi")
                                                if args.faza == "predaja"
                                                else ("nije-napravljeno",))
                            and (args.faza == "predaja" or r["skupina"] != "proces")]
                print(f"❌ nije gotovo ({args.faza}): " + "; ".join(otvoreni),
                      file=sys.stderr)
            return kod
        return 0
    except RegistarError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
