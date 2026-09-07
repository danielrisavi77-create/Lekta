#!/usr/bin/env python3
"""Gdje rad stoji prema kriterijima ocjenjivanja — i što ga drži.

Zašto postoji
-------------
Cijeli je paket optimiran prema petici, a nigdje nije stajalo prema čemu se ta petica
mjeri. Posljedica je bila da „rad je spreman" znači „prošao je formalne provjere", što
nije isto: rad koji prođe svih dvanaest provjera `check_rules.py`, a nema tezu, i dalje
ne nosi peticu (željezno pravilo 11).

Što ovo JEST i što NIJE
-----------------------
**Agregator, ne sudac.** Status svakog kriterija izvodi se iz artefakata koje su drugi
alati već napisali (`arg.json`, `pravila.json`, `dijelovi.json`, `evidence_gate.json`,
`zamjerke.json`, `stil.json`, `sazetak.json`, `zadatak.json`). Ne uvodi se nijedna nova
prosudba i nijedna vrijednost ne postoji na dva mjesta (pravilo 13).

**Ne predviđa ocjenu mentora.** Daje POJAS — gornju granicu koju rad u ovom stanju može
doseći — i imenuje što ju drži. Ocjenjuje mentor; ovo je popis onoga što bi mu smetalo.

**Artefakt kojega nema je `nepoznato`, ne `ispunjeno`.** Ako `nepoznato` padne na ključni
kriterij, pojas se **ne procjenjuje uopće**. To je isti princip po kojem `gate.py`
razlikuje „alat pukao" od „provjera prošla": nedostatak dokaza nije dokaz.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
KORIJEN = os.path.dirname(SKRIPTE)
if SKRIPTE not in sys.path:
    sys.path.insert(0, SKRIPTE)

import context  # noqa: E402

REGISTAR = os.path.join(KORIJEN, "references", "rubrika.json")

ISPUNJENO, DJELOMICNO, NEISPUNJENO, NEPOZNATO, NEPRIMJENJIVO = (
    "ispunjeno", "djelomicno", "neispunjeno", "nepoznato", "ne-primjenjuje-se")
ZNAK = {ISPUNJENO: "✅", DJELOMICNO: "⚠️", NEISPUNJENO: "❌",
        NEPOZNATO: "❔", NEPRIMJENJIVO: "➖"}


class RubrikaError(RuntimeError):
    """Registar rubrike je neispravan ili nedostupan."""


def _ucitaj(put):
    try:
        with open(put, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


# --------------------------------------------------------------------------- #
# čitači — svaki vraća (status, dokaz)
#
# Svaki čita SAMO polja koja su u ugovoru alata izvora. Ako alat promijeni oblik,
# čitač vraća `nepoznato` s razlogom umjesto da tiho izmisli status.
# --------------------------------------------------------------------------- #

def _dim(arg, ime):
    for d in arg.get("dimenzije") or []:
        if d.get("dimenzija") == ime:
            return d
    return None


def citac_arg_teza(a, _kat):
    if not a:
        return NEPOZNATO, "nema arg.json — pokreni check_argument.py --json"
    teza, krug = _dim(a, "teza"), _dim(a, "zaključak zatvara krug")
    if not teza:
        return NEPOZNATO, "arg.json nema dimenziju „teza\""
    st, sk = teza.get("stanje"), (krug or {}).get("stanje")
    dokaz = f"teza {st} ({teza.get('brojka')}), zaključak {sk or '—'}"
    if st == "❌":
        return NEISPUNJENO, dokaz
    if st == "✅" and sk == "✅":
        return ISPUNJENO, dokaz
    return DJELOMICNO, dokaz


def citac_arg_doprinos(a, _kat):
    if not a:
        return NEPOZNATO, "nema arg.json"
    d = a.get("doprinos") or {}
    desk = a.get("deskriptivnost") or {}
    vlastiti = d.get("vlastiti", 0)
    signal = desk.get("signal")
    dokaz = (f"{vlastiti} vlastitih prikaza od {d.get('ukupno', 0)}; "
             f"deskriptivnost {desk.get('udio_bez_analitickog_signala', '?')} % "
             f"(signal: {signal})")
    if vlastiti and signal != "high":
        return ISPUNJENO, dokaz
    if signal == "high" and not vlastiti:
        return NEISPUNJENO, dokaz
    return DJELOMICNO, dokaz + " — alat doprinos može opovrgnuti, ne potvrditi"


def citac_zadatak_komponente(_a, kat):
    z = _ucitaj(os.path.join(kat, "zadatak.json"))
    if not z:
        return NEPOZNATO, ("nema .katedra/zadatak.json — komponente koje uputa traži "
                           "nisu nigdje zapisane (pravilo 14)")
    kom = z.get("komponente") or []
    if not kom:
        return NEPOZNATO, "zadatak.json nema nijednu komponentu"
    imena = [k.get("naziv", "?") for k in kom]

    # Prvo nalaz gatea, ako postoji. `igle` govore samo da je komponenta strojno
    # PROVJERLJIVA, ne da je provjera prošla — komponenta s iglama kojih u radu nema
    # inače ulazi u „sve pokrivene", pa rubrika kaže ✅ dok provjeri_predaju.py nad
    # istim zadatak.json-om javlja ❌. Jedini dokaz o prisutnosti je nalaz alata koji
    # je gledao dokument, a ne zapis o tome što je trebalo gledati.
    nalaz = (_ucitaj(os.path.join(kat, "predaja.json")) or {}).get("zadatak") or {}
    if isinstance(nalaz, dict) and nalaz.get("provjeren"):
        po_imenu = {n.get("naziv"): n for n in nalaz.get("komponente") or []}
        strane = [n for n in imena if n not in po_imenu]
        if strane:
            return DJELOMICNO, (f"predaja.json ne poznaje {len(strane)} komponentu iz "
                                f"zadatak.json — nalaz je stariji od zadatka: "
                                + "; ".join(strane[:3]))
        nema = [n for n in imena if po_imenu[n].get("status") == "nema_u_radu"]
        if nema:
            return NEISPUNJENO, (f"provjeri_predaju.py: {len(nema)} komponenti zadatak "
                                 f"traži, a u radu ih nema: " + "; ".join(nema[:3]))
        neprovjerljive = [n for n in imena
                          if po_imenu[n].get("status") == "nije_strojno_provjerljivo"]
        if neprovjerljive:
            return DJELOMICNO, (f"{len(kom)} komponenti; {len(neprovjerljive)} bez igala i "
                                f"bez zapisanog nalaza provjere: "
                                + "; ".join(neprovjerljive[:3]))
        alatom = sum(1 for n in imena if po_imenu[n].get("status") == "provjereno_alatom")
        return ISPUNJENO, (f"{len(kom)} komponenti, sve potvrđene nalazom "
                           f"provjeri_predaju.py ({alatom} kroz zapisan nalaz alata)")

    # Bez nalaza gatea: `provjereno` uz komponentu jedini je dokaz koji uopće postoji.
    # Zahtjev poput „stranica i kod parafraze" ne postoji kao niska u dokumentu, pa se
    # ne da provjeriti iglama ni onda kad gate radi.
    bez = [k.get("naziv", "?") for k in kom
           if not (k.get("igle") or k.get("provjereno"))]
    if bez:
        return DJELOMICNO, (f"{len(kom)} komponenti zapisano, {len(bez)} bez igala i bez "
                            f"zapisanog nalaza provjere: " + "; ".join(bez[:3]))
    s_provjerom = sum(1 for k in kom if k.get("provjereno"))
    if s_provjerom == len(kom):
        return ISPUNJENO, (f"{len(kom)} komponenti, sve sa zapisanim nalazom provjere "
                           f"(nema predaja.json — prisutnost u dokumentu nije neovisno "
                           f"provjerena)")
    return DJELOMICNO, (f"{len(kom)} komponenti zapisano, {len(kom) - s_provjerom} "
                        f"pokriveno samo iglama — prisutnost u radu nije provjerena; "
                        f"pokreni provjeri_predaju.py --json .katedra/predaja.json")


def citac_evidence(a, kat):
    eg = _ucitaj(os.path.join(kat, "evidence_gate.json"))
    if eg:
        s = eg.get("summary") or {}
        blok = s.get("blocked", 0)
        dokaz = (f"{s.get('claims', 0)} tvrdnji, {s.get('passed', 0)} s potporom, "
                 f"{blok} blokirano ({eg.get('policy')})")
        if eg.get("passed") and not blok:
            return ISPUNJENO, dokaz
        return (NEISPUNJENO if blok else DJELOMICNO), dokaz
    izv = _ucitaj(os.path.join(kat, "izvori.json"))
    if not izv:
        # v1.9 (nalaz 6): numerički dijalekt (vancouver/ieee) ima numeriran popis,
        # pa check_argument u arg.json upisuje pokrivenost (siročad, citat bez
        # reference). To je dokaz iste snage kao verify_sources --pokrivenost za
        # autor-godina — slabiji od ledgera, i tako se prijavljuje. Bez toga je
        # rad u Vancouver stilu ovdje uvijek bio „nepoznato" samo zbog dijalekta.
        pokr = ((a or {}).get("citati") or {}).get("pokrivenost") if isinstance(a, dict) else None
        if isinstance(pokr, dict) and pokr.get("popis_stavki"):
            sir, bez = pokr.get("sirocad") or [], pokr.get("citat_bez_reference") or []
            dokaz = (f"numerički popis ({pokr.get('stil')}): {pokr['popis_stavki']} stavki, "
                     f"{len(sir)} siročadi, {len(bez)} citata bez reference — "
                     f"bez claim ledgera, slabiji dokaz")
            return (NEISPUNJENO if (sir or bez) else DJELOMICNO), dokaz
        return NEPOZNATO, "nema ni evidence_gate.json ni izvori.json"
    zapisi = izv if isinstance(izv, list) else (izv.get("izvori") or izv.get("sources") or [])
    if not isinstance(zapisi, list) or not zapisi:
        return NEPOZNATO, "izvori.json ne sadrži popis izvora u očekivanom obliku"
    lose = [z for z in zapisi if isinstance(z, dict)
            and z.get("status") in ("conflict", "invalid")]
    dokaz = (f"{len(zapisi)} izvora, {len(lose)} conflict/invalid — "
             f"bez claim ledgera, slabiji dokaz")
    return (NEISPUNJENO if lose else DJELOMICNO), dokaz


def citac_dijelovi(_a, kat):
    d = _ucitaj(os.path.join(kat, "dijelovi.json"))
    if not d:
        return NEPOZNATO, "nema .katedra/dijelovi.json — pokreni dijelovi.py --sij"
    trazeni = [v for v in (d.get("dijelovi") or {}).values()
               if v.get("trazi_profil") == "da"]
    gotovi = [v for v in trazeni if v.get("status") in ("napravljeno", "provjereno")]
    dokaz = f"{len(gotovi)}/{len(trazeni)} obaveznih dijelova gotovo"
    if not trazeni:
        return NEPOZNATO, "nijedan dio nije označen kao obavezan"
    if len(gotovi) == len(trazeni):
        return ISPUNJENO, dokaz
    return (DJELOMICNO if gotovi else NEISPUNJENO), dokaz


def citac_dio_metodologija(_a, kat):
    d = _ucitaj(os.path.join(kat, "dijelovi.json"))
    if not d:
        return NEPOZNATO, "nema .katedra/dijelovi.json"
    m = (d.get("dijelovi") or {}).get("metodologija")
    if not m:
        return NEPOZNATO, "registar dijelova nema `metodologija`"
    if m.get("status") == "ne-primjenjuje-se":
        return NEPRIMJENJIVO, (m.get("napomena")
                               or "označeno kao neprimjenjivo, bez obrazloženja")
    if m.get("trazi_profil") == "provjeri" and m.get("status") == "nije-napravljeno":
        return NEPOZNATO, ("nije odlučeno ima li rad vlastito istraživanje — "
                           "odluči s Uputama u ruci (references/metodologija.md)")
    # Kvar 46: obje su vrijednosti prije davale `djelomicno`, pa razlika između
    # „napisano" i „netko je provjerio osam odjeljaka" nije značila ništa, a
    # kriterij se nije mogao zatvoriti nijednim postupkom.
    if m.get("status") == "provjereno":
        return ISPUNJENO, ("potpunost osam odjeljaka je provjerena"
                           + (f"; {m['napomena']}" if m.get("napomena") else ""))
    if m.get("status") == "napravljeno":
        return DJELOMICNO, ("poglavlje postoji; potpunost osam odjeljaka provjerava "
                            "čovjek (references/metodologija.md §9), pa se status "
                            "nakon toga postavlja na `provjereno`")
    return NEISPUNJENO, f"status: {m.get('status')}"


def citac_pravila(_a, kat):
    p = _ucitaj(os.path.join(kat, "pravila.json"))
    if not p:
        return NEPOZNATO, "nema pravila.json — pokreni check_rules.py --json"
    redci = p.get("redci") or []
    krs = [r for r in redci if r.get("severity") == "krsenje"]
    prov = [r for r in redci if r.get("severity") == "za_provjeru"]
    dokaz = f"{len(krs)} kršenja, {len(prov)} za provjeru, od {len(redci)} pravila"
    if p.get("nalazi_su_advisory"):
        dokaz += " (profil nije admitiran — nalazi su savjetodavni)"
        return DJELOMICNO, dokaz
    if krs:
        return NEISPUNJENO, dokaz
    return (DJELOMICNO if prov else ISPUNJENO), dokaz


def citac_stil(_a, kat):
    s = _ucitaj(os.path.join(kat, "stil.json"))
    if not s:
        return NEPOZNATO, "nema stil.json — pokreni check_ai_style.py --json"
    nalazi = s.get("nalazi") or []
    dokaz = f"{len(nalazi)} stilskih nalaza"
    if not nalazi:
        return ISPUNJENO, dokaz
    return (NEISPUNJENO if len(nalazi) >= 3 else DJELOMICNO), dokaz


def citac_sazetak(_a, kat):
    s = _ucitaj(os.path.join(kat, "sazetak.json"))
    e = _ucitaj(os.path.join(kat, "engleski.json"))
    if not s:
        return NEPOZNATO, "nema sazetak.json — pokreni provjeri_sazetak.py --json"
    n_s = len(s.get("nalazi") or [])
    n_e = len([x for x in ((e or {}).get("nalazi") or []) if x.get("stanje") == "❌"])
    dokaz = f"sažetak: {n_s} nalaza" + (f"; engleski: {n_e} kršenja" if e else
                                        "; engleski nije provjeren")
    if n_s or n_e:
        return (NEISPUNJENO if (n_s + n_e) >= 3 else DJELOMICNO), dokaz
    return ISPUNJENO, dokaz


def citac_zamjerke(_a, kat):
    z = _ucitaj(os.path.join(kat, "zamjerke.json"))
    if not z:
        return NEPRIMJENJIVO, "nema zamjerki mentora (prvi krug)"
    stavke = z if isinstance(z, list) else (z.get("zamjerke") or [])
    if not isinstance(stavke, list):
        return NEPOZNATO, "zamjerke.json nije u očekivanom obliku"
    otv = [s for s in stavke if isinstance(s, dict) and s.get("status") == "otvoreno"]
    djel = [s for s in stavke if isinstance(s, dict) and s.get("status") == "djelomicno"]
    dokaz = f"{len(stavke)} zamjerki, {len(otv)} otvorenih, {len(djel)} djelomičnih"
    if otv:
        return NEISPUNJENO, dokaz
    return (DJELOMICNO if djel else ISPUNJENO), dokaz


def citac_razina(_a, kat):
    z = _ucitaj(os.path.join(kat, "razina.json"))
    if not z or not z.get("razina"):
        return NEPOZNATO, ("nema .katedra/razina.json — dubina objašnjavanja se "
                           "pogađa (references/razina.md)")
    dijelovi = [f"razina {z['razina']}"]
    if z.get("citatelj"):
        dijelovi.append(f"čitatelj {z['citatelj']}")
    if z.get("tema_poznata_citatelju") is not None:
        dijelovi.append("temu poznaje" if z["tema_poznata_citatelju"]
                        else "tema izvan uže specijalnosti")
    if not z.get("citatelj"):
        return DJELOMICNO, "; ".join(dijelovi) + " — čitatelj nije zadan"
    return ISPUNJENO, "; ".join(dijelovi)


def citac_jezik(_a, kat):
    j = _ucitaj(os.path.join(kat, "jezik.json"))
    if not j:
        return NEPOZNATO, "nema jezik.json — pokreni provjeri_jezik.py --json"
    lose = sum(1 for n in (j.get("nalazi") or []) if n.get("stanje") == "❌")
    upoz = sum(1 for n in (j.get("nalazi") or []) if n.get("stanje") == "⚠️")
    dokaz = f"{lose} pravopisnih/gramatičkih, {upoz} stilskih nalaza"
    if lose == 0:
        return ISPUNJENO, dokaz
    return (NEISPUNJENO if lose >= 5 else DJELOMICNO), dokaz


def citac_izracuni(_a, kat):
    z = _ucitaj(os.path.join(kat, "izracuni.json"))
    if not z:
        return NEPOZNATO, "nema izracuni.json — pokreni provjeri_izracune.py --json"
    n = z.get("nalazi") or []
    lose = sum(1 for x in n if x.get("stanje") == "❌")
    upoz = sum(1 for x in n if x.get("stanje") == "⚠️")
    dokaz = f"{lose} kršenja, {upoz} nedeklariranih izbora"
    if lose:
        return NEISPUNJENO, dokaz
    return (DJELOMICNO if upoz else ISPUNJENO), dokaz


def citac_fusnote(_a, kat):
    z = _ucitaj(os.path.join(kat, "fusnote.json"))
    if not z:
        return NEPOZNATO, "nema fusnote.json — pokreni provjeri_fusnote.py --json"
    if z.get("prazno"):
        return NEPRIMJENJIVO, "dokument nema fusnota"
    lose = sum(1 for n in (z.get("nalazi") or []) if n.get("stanje") == "❌")
    dokaz = f"{z.get('fusnota')} fusnota, {lose} kršenja"
    if lose:
        return NEISPUNJENO, dokaz
    return ISPUNJENO, dokaz


CITACI = {
    "arg_teza": citac_arg_teza,
    "arg_doprinos": citac_arg_doprinos,
    "zadatak_komponente": citac_zadatak_komponente,
    "evidence": citac_evidence,
    "dijelovi": citac_dijelovi,
    "dio_metodologija": citac_dio_metodologija,
    "pravila": citac_pravila,
    "stil": citac_stil,
    "sazetak": citac_sazetak,
    "zamjerke": citac_zamjerke,
    "razina": citac_razina,
    "jezik": citac_jezik,
    "izracuni": citac_izracuni,
    "fusnote": citac_fusnote,
}


# --------------------------------------------------------------------------- #

def ucitaj_registar(put: str = REGISTAR) -> dict:
    try:
        with open(put, encoding="utf-8") as f:
            reg = json.load(f)
    except FileNotFoundError as e:
        raise RubrikaError(f"registar rubrike nije nađen: {put}") from e
    except json.JSONDecodeError as e:
        raise RubrikaError(f"registar rubrike nije valjan JSON: {e}") from e
    if not isinstance(reg.get("kriteriji"), dict) or not reg["kriteriji"]:
        raise RubrikaError("registar nema ključ 'kriteriji'")
    for kid, k in reg["kriteriji"].items():
        citac = (k.get("izvor") or {}).get("citac")
        if citac not in CITACI:
            raise RubrikaError(f"kriterij '{kid}': nepoznat čitač '{citac}'")
    return reg


def _empirijski(kat) -> bool:
    """Ima li rad vlastito istraživanje.

    Kvar 46: prije se izvodilo iz statusa dijela `metodologija`, a taj dio time
    postaje uvjetno ključan — petlja u kojoj oznaka „napravljeno" sama sebi
    stvara kriterij koji zatim ne može zatvoriti. Odgovor je odluka autora i
    stoji u stanju projekta; registar dijelova je rezerva, i to samo preko
    `analiza`, koja o metodologiji ne ovisi.
    """
    s = _ucitaj(os.path.join(kat, "stanje.json")) or {}
    odluka = s.get("vlastito_istrazivanje")
    if isinstance(odluka, bool):
        return odluka
    if isinstance(odluka, str) and odluka.strip().lower() in ("da", "ne"):
        return odluka.strip().lower() == "da"
    d = _ucitaj(os.path.join(kat, "dijelovi.json")) or {}
    m = (d.get("dijelovi") or {}).get("metodologija") or {}
    if m.get("status") == "ne-primjenjuje-se":
        return False
    a = (d.get("dijelovi") or {}).get("analiza") or {}
    return a.get("status") in ("napravljeno", "provjereno")


def ocijeni(reg: dict, kat: str) -> dict:
    arg = _ucitaj(os.path.join(kat, "arg.json"))
    empirijski = _empirijski(kat)
    redci = []
    for kid, k in reg["kriteriji"].items():
        status, dokaz = CITACI[(k["izvor"])["citac"]](arg, kat)
        kljucni = bool(k.get("kljucni"))
        if not kljucni and k.get("uvjetno_kljucni") and empirijski:
            kljucni = True
        redci.append({
            "kriterij": kid, "naziv": k.get("naziv", kid),
            "tezina": k.get("tezina", 1), "kljucni": kljucni,
            "status": status, "dokaz": dokaz,
            "kako_rucno": k.get("kako_rucno", ""),
        })
    redci.sort(key=lambda r: (-int(r["kljucni"]), -r["tezina"], r["naziv"]))
    return {"empirijski": empirijski, "kriteriji": redci, **pojas(redci)}


def pojas(redci: list[dict]) -> dict:
    """Gornja granica koju rad u ovom stanju može doseći, i što ju drži.

    Nepoznato na ključnom kriteriju NE daje pojas. Rad se ne proglašava dobrim
    dok se ne zna prema čemu se mjeri — nedostatak dokaza nije dokaz.
    """
    kljucni = [r for r in redci if r["kljucni"]]
    nepoznati = [r for r in kljucni if r["status"] == NEPOZNATO]
    if nepoznati:
        return {"pojas": "nepoznato",
                "drzi": [r["naziv"] for r in nepoznati],
                "razlog": ("ključni kriterij nema artefakt — pojas se ne procjenjuje. "
                           "Nedostatak dokaza nije dokaz.")}
    pali = [r for r in kljucni if r["status"] == NEISPUNJENO]
    if pali:
        return {"pojas": "3", "drzi": [r["naziv"] for r in pali],
                "razlog": "ključni kriterij nije ispunjen"}
    polovicni = [r for r in kljucni if r["status"] == DJELOMICNO]
    if polovicni:
        return {"pojas": "4", "drzi": [r["naziv"] for r in polovicni],
                "razlog": "ključni kriterij je na pola"}
    slabi = [r for r in redci
             if not r["kljucni"] and r["status"] in (NEISPUNJENO, NEPOZNATO)]
    if slabi:
        return {"pojas": "4–5", "drzi": [r["naziv"] for r in slabi],
                "razlog": "ključno stoji; sporedni kriteriji još odvlače"}
    return {"pojas": "5", "drzi": [],
            "razlog": "svi kriteriji za koje postoji artefakt su ispunjeni"}


def ispisi(r: dict, opsirno: bool = False) -> None:
    print("RUBRIKA — gdje rad stoji prema kriterijima")
    print("=" * 46)
    for x in r["kriteriji"]:
        oznaka = "★" if x["kljucni"] else " "
        print(f"{ZNAK[x['status']]} {oznaka} {x['naziv']:<38} "
              f"tež. {x['tezina']}  {x['status']}")
        print(f"       {x['dokaz']}")
        if opsirno and x["status"] in (NEISPUNJENO, DJELOMICNO, NEPOZNATO):
            print(f"       → {x['kako_rucno']}")
    print(f"\n★ = ključni kriterij" +
          ("  ·  rad je prepoznat kao empirijski" if r["empirijski"] else ""))
    print(f"\nPOJAS: {r['pojas']}   ({r['razlog']})")
    if r["drzi"]:
        print("drži ga: " + ", ".join(r["drzi"]))
    print("\nOvo NIJE predviđanje ocjene mentora. Ocjenjuje mentor; ovdje stoji "
          "gornja\ngranica koju rad u ovom stanju može doseći i što ju drži. "
          "Kriterij bez\nartefakta je ❔ i nikad se ne broji kao ispunjen.")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Gdje rad stoji prema kriterijima ocjenjivanja i što ga drži.")
    ap.add_argument("--registar", default=REGISTAR)
    ap.add_argument("--project-root", dest="project_root")
    ap.add_argument("--kat")
    ap.add_argument("--cilj", choices=("3", "4", "5"),
                    help="ciljani pojas; uz --strogo daje izlazni kod 1 ako se ne doseže")
    ap.add_argument("--strogo", action="store_true",
                    help="izlazni kod 1 kad pojas ne doseže --cilj")
    ap.add_argument("--json", dest="kao_json", metavar="PUT")
    ap.add_argument("--opsirno", action="store_true")
    args = ap.parse_args(argv)

    try:
        reg = ucitaj_registar(args.registar)
    except RubrikaError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 2

    kat = context.resolve_state_dir(args.kat, args.project_root)
    if not os.path.isdir(kat):
        print(f"❌ nema {kat} — rubrika čita artefakte projekta, ne sam dokument",
              file=sys.stderr)
        return 2

    r = ocijeni(reg, kat)
    ispisi(r, opsirno=args.opsirno)

    if args.kao_json:
        context.atomic_write_json(
            os.path.abspath(args.kao_json), {"schema_version": 1, **r})

    if args.cilj and args.strogo:
        redoslijed = {"nepoznato": -1, "3": 3, "4": 4, "4–5": 4, "5": 5}
        if redoslijed.get(r["pojas"], -1) < int(args.cilj):
            print(f"\n❌ pojas {r['pojas']} ne doseže cilj {args.cilj}",
                  file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
