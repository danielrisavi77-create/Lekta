#!/usr/bin/env python3
"""Popravak POSTOJEĆEG rada po profilu fakulteta — samo oblik, nikad sadržaj.

Katedra je dosad kršenja samo prijavljivala. Šest ih je čisto mehaničkih (font,
veličina, prored, poravnanje, margine, prijelom pred poglavljem) i student ih
ispravlja rukom, klik po klik, na dokumentu od pedeset stranica. Ovdje ih
ispravlja alat — ali pod trima uvjetima koji se ne pregovaraju:

1. **Sadržaj se ne dira.** Nakon zahvata tekst rada mora biti ZNAK PO ZNAK isti.
   To se ne obećava nego provjerava, i ako se razlikuje, zapis se odbija. Alat
   koji mijenja tuđi rad mora imati dokaz da ga nije pokvario.
2. **Ne piše preko izvornika bez dokaza o snapshotu.** Isto pravilo koje već
   vrijedi za fazu G (`references/audit.md`): mutacija traži snapshot, inače se
   blokira prije nego išta napravi.
3. **Popravlja se samo ono što se dade izvesti iz profila.** Nedostajuće
   poglavlje, natpis prikaza ili izvor ispod tablice NISU oblik nego autorstvo i
   alat ih odbija dirati — izrijekom, s obrazloženjem, a ne prešutno.

Zahvati su TABLICA `rule_id → funkcija`, a `rule_id` dolazi iz strojnog ugovora
`check_rules.py`. Novo pravilo je novi zapis u tablici; grananja po hrvatskoj
prikaznoj niski nema nigdje.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import hr_text as H  # noqa: E402
from profile_rules import ProfileRuleError, resolve_profile  # noqa: E402

FAKULTETI = os.path.join(os.path.dirname(HERE), "references", "fakulteti")

IZLAZ_OK = 0
IZLAZ_OSTALO_KRSENJA = 1
IZLAZ_GRESKA = 2
IZLAZ_BLOKIRANO = 3


class GreskaUlaza(Exception):
    """Ulaz se ne može obraditi; poruka je namijenjena korisniku."""


# --------------------------------------------------------------- pomoćnici

def _qn(tag):
    from docx.oxml.ns import qn
    return qn(tag)


def _postavi_font(rpr_vlasnik, ime):
    """Font u sva tri slota: ascii, hAnsi, cs.

    `w:hAnsi` je slot koji u Wordu pokriva č/ć/ž/š/đ. Postaviti samo `w:ascii`
    znači da dijakritika ostane na starom fontu — kvar koji se u izvještaju vidi
    kao „font je ispravan", a u dokumentu kao dva različita pisma u istoj riječi.
    """
    from docx.oxml import OxmlElement
    rpr = rpr_vlasnik.get_or_add_rPr()
    rfonts = rpr.find(_qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    for slot in ("w:ascii", "w:hAnsi", "w:cs"):
        rfonts.set(_qn(slot), ime)
    for slot in ("w:asciiTheme", "w:hAnsiTheme", "w:cstheme"):
        if rfonts.get(_qn(slot)) is not None:
            del rfonts.attrib[_qn(slot)]


def _tijelo_proze(doc):
    """Odlomci glavne proze — isti opseg koji mjeri `check_rules.provjeri_font`.

    Naslovnica, naslovi, retci „Izvor:" i završni aparat se NE diraju: naslov
    poglavlja legitimno ima svoju veličinu (`naslov_poglavlja_pt`), pa bi ga
    ujednačavanje s prozom pokvarilo.
    """
    import check_rules as C
    redoslijed = list(C.blokovi(doc))
    poc = C.indeks_pocetka_tijela(redoslijed)
    u_tijelu = poc is None
    for i, (vrsta, blok) in enumerate(redoslijed):
        if vrsta != "p":
            continue
        tekst = C.tekst_bloka(blok).strip()
        if poc is not None and i == poc:
            u_tijelu = True
        if u_tijelu and (H.NASLOV_LIT.match(tekst) or C.je_back_matter_naslov(tekst)):
            break
        if not u_tijelu or C.razina_naslova(blok) or H.IZVOR.match(tekst):
            continue
        yield blok


# ------------------------------------------------------------------ zahvati

def zahvat_font(doc, profil, biljeske):
    trazeni = (profil.get("format") or {}).get("font") or []
    if not trazeni:
        return False
    ime = trazeni[0]
    promjena = False

    dd = doc.styles.element.find(_qn("w:docDefaults"))
    if dd is not None:
        rpr_def = dd.find(_qn("w:rPrDefault"))
        if rpr_def is not None:
            from docx.oxml import OxmlElement
            rpr = rpr_def.find(_qn("w:rPr"))
            if rpr is None:
                rpr = OxmlElement("w:rPr")
                rpr_def.append(rpr)
            rfonts = rpr.find(_qn("w:rFonts"))
            if rfonts is None:
                rfonts = OxmlElement("w:rFonts")
                rpr.append(rfonts)
            for slot in ("w:ascii", "w:hAnsi", "w:cs"):
                rfonts.set(_qn(slot), ime)
            for slot in ("w:asciiTheme", "w:hAnsiTheme", "w:cstheme"):
                if rfonts.get(_qn(slot)) is not None:
                    del rfonts.attrib[_qn(slot)]
            promjena = True
            biljeske.append("docDefaults → " + ime)

    try:
        _postavi_font(doc.styles["Normal"].element, ime)
        promjena = True
        biljeske.append("stil Normal → " + ime)
    except KeyError:
        pass

    dirnuto = 0
    for blok in _tijelo_proze(doc):
        for r in blok.runs:
            if not (r.text or "").strip():
                continue
            rpr = r._r.find(_qn("w:rPr"))
            rfonts = rpr.find(_qn("w:rFonts")) if rpr is not None else None
            if rfonts is None:
                continue          # nasljeđuje stil — nema što ispravljati
            _postavi_font(r._r, ime)
            dirnuto += 1
    if dirnuto:
        biljeske.append(f"runova proze s vlastitim fontom: {dirnuto} → {ime}")
        promjena = True
    return promjena


def zahvat_velicina(doc, profil, biljeske):
    from docx.shared import Pt
    vel = (profil.get("format") or {}).get("velicina_pt")
    if not vel:
        return False
    promjena = False
    try:
        doc.styles["Normal"].font.size = Pt(float(vel))
        biljeske.append(f"stil Normal → {vel} pt")
        promjena = True
    except KeyError:
        pass

    dirnuto = 0
    for blok in _tijelo_proze(doc):
        for r in blok.runs:
            if not (r.text or "").strip():
                continue
            if r.font.size is not None and abs(r.font.size.pt - float(vel)) > 0.01:
                r.font.size = Pt(float(vel))
                dirnuto += 1
    if dirnuto:
        biljeske.append(f"runova proze s vlastitom veličinom: {dirnuto} → {vel} pt")
        promjena = True
    return promjena


def zahvat_prored(doc, profil, biljeske):
    prored = (profil.get("format") or {}).get("prored")
    if prored is None:
        return False
    try:
        doc.styles["Normal"].paragraph_format.line_spacing = float(prored)
    except KeyError:
        return False
    biljeske.append(f"stil Normal → prored {prored:g}")
    return True


def zahvat_poravnanje(doc, profil, biljeske):
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    trazeno = (profil.get("format") or {}).get("poravnanje")
    mapa = {"lijevo": WD_ALIGN_PARAGRAPH.LEFT, "sredina": WD_ALIGN_PARAGRAPH.CENTER,
            "desno": WD_ALIGN_PARAGRAPH.RIGHT, "obostrano": WD_ALIGN_PARAGRAPH.JUSTIFY}
    if trazeno not in mapa:
        return False
    try:
        doc.styles["Normal"].paragraph_format.alignment = mapa[trazeno]
    except KeyError:
        return False
    biljeske.append(f"stil Normal → poravnanje {trazeno}")
    return True


def zahvat_margine(doc, profil, biljeske):
    from docx.shared import Cm
    trazene = (profil.get("format") or {}).get("margine_cm") or {}
    polja = [("gore", "top_margin"), ("dolje", "bottom_margin"),
             ("lijevo", "left_margin"), ("desno", "right_margin")]
    promjena = False
    for i, sek in enumerate(doc.sections, 1):
        for naziv, atr in polja:
            v = trazene.get(naziv)
            if not isinstance(v, (int, float)):
                continue
            sada = getattr(sek, atr)
            if sada is None or abs(sada.cm - float(v)) > 0.02:
                setattr(sek, atr, Cm(float(v)))
                promjena = True
    if promjena:
        biljeske.append("margine postavljene po profilu u svim sekcijama")
    return promjena


def zahvat_prijelom(doc, profil, biljeske):
    if not (profil.get("format") or {}).get("prijelom_pred_poglavljem"):
        return False
    try:
        doc.styles["Heading 1"].paragraph_format.page_break_before = True
    except KeyError:
        return False
    biljeske.append("stil Heading 1 → prijelom stranice prije")
    return True


# `rule_id` iz strojnog ugovora `check_rules.py` → zahvat. Sve što nije ovdje
# nije mehaničko: nedostajuće poglavlje, natpis prikaza, izvor ispod tablice i
# oblik citata traže autorstvo, i alat ih NE dira.
ZAHVATI = {
    "format.font": zahvat_font,
    "format.velicina_pt": zahvat_velicina,
    "format.prored": zahvat_prored,
    "format.poravnanje": zahvat_poravnanje,
    "format.margine_cm": zahvat_margine,
    "format.prijelom_pred_poglavljem": zahvat_prijelom,
}

OBRAZLOZENJE_ODBIJANJA = {
    "struktura.obavezni_dijelovi":
        "nedostaje dio rada — to je pisanje, ne oblikovanje",
    "struktura.opseg.rijeci": "opseg se ne popravlja formatiranjem",
    "struktura.opseg.stranice": "opseg se ne popravlja formatiranjem",
    "struktura.opseg.poglavlja": "broj poglavlja je odluka o strukturi rada",
    "prikazi.natpis": "natpis prikaza mora napisati autor (alat ne zna naziv)",
    "prikazi.izvor_ispod": "izvor prikaza zna samo autor",
    "prikazi.mora_biti_spomenut_u_tekstu":
        "poziv na prikaz je rečenica u tekstu, ne oblik",
    "citiranje.tocka_iza_godine":
        "citat se ne prepravlja automatski — mijenja se tekst rada",
    "format.odlomak.min_recenica": "duljina odlomka je pisanje, ne oblikovanje",
}


# ------------------------------------------------------------------ pogon

def _nalazi(rad, profil_put, tip):
    """Strojni izvještaj `check_rules.py` za ovaj rad."""
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        izlaz = f.name
    try:
        proc = subprocess.run(
            [sys.executable, os.path.join(HERE, "check_rules.py"), rad,
             "--profil", profil_put, "--tip", tip, "--json", izlaz],
            capture_output=True, text=True, encoding="utf-8", errors="replace")
        if proc.returncode not in (0, 1):
            raise GreskaUlaza(f"check_rules.py nije mogao pročitati rad: {proc.stderr.strip()}")
        with open(izlaz, encoding="utf-8") as f:
            return json.load(f)["redci"]
    finally:
        try:
            os.unlink(izlaz)
        except OSError:
            pass


def _tekst_rada(put):
    """Tekst rada kao jedna niska — mjera da zahvat NIJE dirao sadržaj."""
    odlomci, _ = H.ucitaj(put, samo_tijelo=False, ukljuci_tablice=True)
    return "\n".join(odlomci)


def _snapshot_status(rad, project_root):
    """Isti uvjet i isti kod kao faza G — ne vlastita inačica istog pravila.

    Provjera ide na HASH trenutnog dokumenta, ne na ime datoteke: snapshot koji
    je napravljen pa je rad poslije mijenjan nije dokaz nego uspomena. To je
    razlika koju je audit već jednom platio (`--require-snapshot` je potvrđivao
    „snapshot potvrđen" i kad je snimka bila obrisana).
    """
    from review_policy import mutation_snapshot_status
    return mutation_snapshot_status(rad, project_root)


def popravi(rad, profil, profil_put, tip, izlaz):
    """Primijeni sve mehaničke zahvate; vrati (izvještaj, promjene)."""
    try:
        import docx
    except ImportError as exc:
        raise GreskaUlaza("treba python-docx:  pip install python-docx") from exc

    prije = _nalazi(rad, profil_put, tip)
    # Popravlja se i ⚠️, ne samo ❌: „prored nije zadan u stilu Normal" je
    # upozorenje jer provjera ne zna je li postavljen ručno po odlomcima — ali
    # profil prored PROPISUJE, a upisati ga u stil ne mijenja izgled ondje gdje je
    # već ručno postavljen (odlomak nadjačava stil). Rad time postane izrijekom
    # usklađen umjesto slučajno.
    sporni = [r for r in prije if r["severity"] in ("krsenje", "za_provjeru")]

    popravljivi = [r for r in sporni if r["rule_id"] in ZAHVATI]
    odbijeni = [r for r in sporni if r["rule_id"] not in ZAHVATI
                and r["severity"] == "krsenje"]

    tekst_prije = _tekst_rada(rad)
    d = docx.Document(rad)
    biljeske, dirnuta_pravila = [], []
    for r in popravljivi:
        rid = r["rule_id"]
        if rid in dirnuta_pravila:
            continue
        if ZAHVATI[rid](d, profil, biljeske):
            dirnuta_pravila.append(rid)
    d.save(izlaz)

    tekst_poslije = _tekst_rada(izlaz)
    if tekst_prije != tekst_poslije:
        os.unlink(izlaz)
        raise GreskaUlaza(
            "zahvat je promijenio TEKST rada, ne samo oblik — zapis je odbijen i "
            "izlazna datoteka obrisana.\n"
            "   Ovo je greška u alatu, ne u tvom radu: prijavi je s imenom "
            "dokumenta i profila.")

    poslije = _nalazi(izlaz, profil_put, tip)
    return {"prije": prije, "poslije": poslije, "biljeske": biljeske,
            "popravljeno": dirnuta_pravila, "odbijeno": odbijeni}


def _ispis(izv, izlaz):
    po_id_prije = {r["rule_id"]: r for r in izv["prije"]}
    po_id_poslije = {r["rule_id"]: r for r in izv["poslije"]}

    print("=" * 78)
    print("POPRAVAK PO PROFILU — mijenja se OBLIK, tekst rada ostaje netaknut")
    print("=" * 78)
    for b in izv["biljeske"]:
        print(f"  · {b}")
    if not izv["biljeske"]:
        print("  (nijedan mehanički zahvat nije bio potreban)")
    print()

    print(f"{'pravilo':34} {'prije':>8}  {'poslije':>8}")
    print("-" * 78)
    for rid in sorted(set(po_id_prije) | set(po_id_poslije)):
        a = po_id_prije.get(rid, {}).get("stanje", "—")
        b = po_id_poslije.get(rid, {}).get("stanje", "—")
        if a == b and a == "✅":
            continue
        print(f"{rid:34} {a:>8}  {b:>8}")

    if izv["odbijeno"]:
        print()
        print("NIJE POPRAVLJENO (traži autora, ne alat):")
        for r in izv["odbijeno"]:
            zasto = OBRAZLOZENJE_ODBIJANJA.get(r["rule_id"], "nije mehanički popravljivo")
            print(f"  ❌ {r['rule_id']}: {zasto}")
            print(f"     nađeno: {r['nadjeno']}")

    ostalo = [r for r in izv["poslije"] if r["severity"] == "krsenje"]
    print()
    print(f"[rad → {izlaz}]  preostalih kršenja: {len(ostalo)}")
    return ostalo


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Popravi mehanička kršenja profila u postojećem .docx-u.")
    ap.add_argument("rad", help="postojeći .docx")
    ap.add_argument("--fakultet")
    ap.add_argument("--profil", help="razriješeni profil (JSON) umjesto --fakultet")
    ap.add_argument("--tip", default="zavrsni")
    ap.add_argument("--out", help="izlazna datoteka (zadano: <rad>_popravljen.docx)")
    ap.add_argument("--u-mjestu", dest="u_mjestu", action="store_true",
                    help="prepiši izvornik (traži snapshot, v. --project-root)")
    ap.add_argument("--project-root", dest="project_root")
    ap.add_argument("--json", dest="kao_json")
    a = ap.parse_args(argv)

    if not os.path.isfile(a.rad):
        print(f"❌ nema datoteke: {a.rad}", file=sys.stderr)
        return IZLAZ_GRESKA

    profil_put = a.profil
    try:
        if profil_put:
            with open(profil_put, encoding="utf-8") as f:
                profil = json.load(f)
        elif a.fakultet:
            import tempfile
            profil = resolve_profile(a.fakultet, faculty_dir=FAKULTETI,
                                     work_type=a.tip).profile
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                             encoding="utf-8") as f:
                json.dump(profil, f, ensure_ascii=False)
                profil_put = f.name
        else:
            print("❌ navedi --fakultet ili --profil", file=sys.stderr)
            return IZLAZ_GRESKA
    except (OSError, ValueError, ProfileRuleError) as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return IZLAZ_GRESKA

    if a.u_mjestu:
        status = _snapshot_status(a.rad, a.project_root)
        if not status.get("passed"):
            print("❌ pisanje preko izvornika je blokirano: nema valjanog snapshota.",
                  file=sys.stderr)
            print(f"   {status.get('reason', '')}", file=sys.stderr)
            print("   Isto pravilo vrijedi za fazu G (references/audit.md): "
                  "mutacija bez snapshota se ne izvodi.", file=sys.stderr)
            return IZLAZ_BLOKIRANO
        izlaz = a.rad
    else:
        korijen, ext = os.path.splitext(a.rad)
        izlaz = a.out or f"{korijen}_popravljen{ext}"

    try:
        izv = popravi(a.rad, profil, profil_put, a.tip, izlaz)
    except GreskaUlaza as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return IZLAZ_GRESKA

    ostalo = _ispis(izv, izlaz)
    if a.kao_json:
        with open(a.kao_json, "w", encoding="utf-8") as f:
            json.dump(izv, f, ensure_ascii=False, indent=2)
    return IZLAZ_OSTALO_KRSENJA if ostalo else IZLAZ_OK


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        os._exit(0)
    except KeyboardInterrupt:
        sys.exit(130)
