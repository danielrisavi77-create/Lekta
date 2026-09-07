#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ograde za stare kvarove koji ih dosad nisu imali (kvar 141).

Kvar 140 je izmjerio da jedanaest unosa iz duga nema nijedan test koji dodiruje
isti kod. Ovdje se zatvaraju oni koji se daju provjeriti bez dokumenta i bez
mreže: 24, 25, 31, 33, 52.

Prva verzija ovih testova bila je LAŽNA: provjeravala je `"esej" in json.dumps(...)`
i `any("synced" in redak)`, pa je mutacija `"esej"` → `"esejX"` prolazila jer
podniska i dalje postoji. Svih pet mutacija prošlo je bez ijednog pada. Zato ovdje
nema provjere nad tekstom datoteke: gleda se ponašanje ili razriješena struktura.
"""
import importlib.util
import io
import json
import os
import re
import sys
import tempfile

TU = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(TU)
KORIJEN = os.path.dirname(SCRIPTS)

PALO = []
SVE = []


def check(naziv, uvjet, detalj=""):
    SVE.append(naziv)
    print("  %-8s %s" % ("✓" if uvjet else "✗ FAIL", naziv))
    if not uvjet:
        PALO.append(naziv)
        if detalj:
            print("           detalj: %r" % (detalj,))


def modul_rad_audit(ime):
    """Modul iz sestrinskog skilla `rad-audit`."""
    put = os.path.join(os.path.dirname(KORIJEN), "rad-audit", "scripts")
    spec = importlib.util.spec_from_file_location(ime, os.path.join(put, ime + ".py"))
    m = importlib.util.module_from_spec(spec)
    if put not in sys.path:
        sys.path.insert(0, put)
    spec.loader.exec_module(m)
    return m


def modul_rad_docx(ime):
    """Modul iz sestrinskog skilla `rad-docx`."""
    put = os.path.join(os.path.dirname(KORIJEN), "rad-docx", "scripts")
    spec = importlib.util.spec_from_file_location(ime, os.path.join(put, ime + ".py"))
    m = importlib.util.module_from_spec(spec)
    if put not in sys.path:
        sys.path.insert(0, put)
    spec.loader.exec_module(m)
    return m


def modul_katedra(ime):
    """Modul iz sestrinskog skilla `katedra` (isti paket, druga mapa)."""
    put = os.path.join(os.path.dirname(KORIJEN), "katedra", "scripts")
    spec = importlib.util.spec_from_file_location(ime, os.path.join(put, ime + ".py"))
    m = importlib.util.module_from_spec(spec)
    if put not in sys.path:
        sys.path.insert(0, put)
    spec.loader.exec_module(m)
    return m


def modul(ime):
    spec = importlib.util.spec_from_file_location(ime, os.path.join(SCRIPTS, ime + ".py"))
    m = importlib.util.module_from_spec(spec)
    if SCRIPTS not in sys.path:
        sys.path.insert(0, SCRIPTS)
    spec.loader.exec_module(m)
    return m


def shema(ime):
    with io.open(os.path.join(KORIJEN, "references", "fakulteti", ime),
                 encoding="utf-8") as f:
        return json.load(f)


def _svi_stringovi(o):
    """Sve niske u strukturi, kao skup — ne kao tekst datoteke."""
    out = set()
    if isinstance(o, str):
        out.add(o)
    elif isinstance(o, dict):
        for k, v in o.items():
            out.add(k)
            out |= _svi_stringovi(v)
    elif isinstance(o, list):
        for v in o:
            out |= _svi_stringovi(v)
    return out


def main():
    print("=" * 70)
    print("TESTOVI starih kvarova bez ograde")
    print("=" * 70)

    # --- kvar 25: satelit u synced/<hash>/<slug> --------------------------------
    # Pravi uvjet: lažni HOME u kojem satelit STVARNO leži pod synced/<hash>/.
    # Bez tog uzorka `kandidati()` ga ne vraća, pa satelit koji jest instaliran
    # prolazi kao „nije pronađen" i posao se improvizira (pravilo 10).
    lazni_home = tempfile.mkdtemp()
    gnijezdo = os.path.join(lazni_home, ".claude", "skills", "synced", "abc123", "rad-docx")
    os.makedirs(gnijezdo)
    stari_home = {k: os.environ.get(k) for k in ("HOME", "USERPROFILE")}
    os.environ["HOME"] = lazni_home
    os.environ["USERPROFILE"] = lazni_home
    try:
        v = modul("vjestine")
        nadjeni = v.kandidati("rad-docx")
    finally:
        for k, val in stari_home.items():
            if val is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = val
    check("K25: satelit iz synced/<hash>/ je među kandidatima",
          any(os.path.normcase(gnijezdo) == os.path.normcase(p) for p in nadjeni),
          nadjeni[:4])

    # --- kvar 31: nepoznat naslov popisa ne smije rušiti gate -------------------
    pl = modul("provjeri_literaturu")
    for naslov in ("POPIS LITERATURE", "Izvori i literatura", "CITIRANA LITERATURA",
                   "5. Popis korištene literature", "Bibliografija", "Popis referenci"):
        check("K31: „%s” je naslov popisa" % naslov[:28], pl.je_naslov_literature(naslov))
    check("K31: obična rečenica NIJE naslov popisa",
          not pl.je_naslov_literature("U literaturi se navodi da je to tako."))

    # --- kvar 52: strukturni znak je osjetljiv na veličinu slova ----------------
    # `re.IGNORECASE` nad CIJELIM uzorkom činio je da „autor: vlastita obrada"
    # ispadne tuđe autorstvo, jer je veliko slovo iza „autor" bilo strukturni
    # znak koji je ignorecase pojeo.
    ca = modul("check_argument")
    check("K52: „autor Kovačević” JEST tuđe autorstvo",
          bool(ca._TUDJE_AUTORSTVO_IME_RE.search("prema autor Kovačević")))
    check("K52: „autor vlastita obrada” NIJE tuđe autorstvo",
          not ca._TUDJE_AUTORSTVO_IME_RE.search("Izvor: autor vlastita obrada"))
    check("K52: „Autori Marić i Horvat” JEST tuđe autorstvo",
          bool(ca._TUDJE_AUTORSTVO_IME_RE.search("Autori Marić i Horvat")))

    # --- kvar 24: tip rada `esej` i `primjerci` u shemama -----------------------
    # Gleda se RAZRIJEŠENA struktura, ne tekst datoteke: `"esej" in json.dumps(...)`
    # prolazi i kad u shemi piše „esejX".
    s, rs = shema("_schema.json"), shema("_resolved_schema.json")
    n_s, n_rs = _svi_stringovi(s), _svi_stringovi(rs)
    check("K24: shema poznaje tip rada „esej”", "esej" in n_s, sorted(x for x in n_s if "esej" in x))
    check("K24: razriješena shema poznaje tip rada „esej”", "esej" in n_rs)
    check("K24: razriješena shema poznaje `primjerci`", "primjerci" in n_rs)

    # --- kvar 33: opseg po dijelovima ------------------------------------------
    check("K33: obje sheme poznaju `dioOpsega`",
          "dioOpsega" in n_s and "dioOpsega" in n_rs)
    check("K33: `provjeri_dijelove.py` postoji",
          os.path.exists(os.path.join(SCRIPTS, "provjeri_dijelove.py")))

    # --- kvar 29: uvjet je znao samo fakultet, ne i tip rada ------------------
    # Kućni stil završnog primjenjivao se na seminarski jer `uvjet.tipovi`
    # nitko nije gledao. `_primjenjivo` je čista funkcija, pa se mjeri izravno.
    zapis = {"uvjet": {"tipovi": ["zavrsni", "diplomski"]}}
    check("K29: sposobnost za završni NE vrijedi za seminarski",
          not v._primjenjivo(zapis, None, "seminarski"))
    check("K29: ista sposobnost vrijedi za diplomski",
          v._primjenjivo(zapis, None, "diplomski"))
    check("K29: bez `tipovi` ne isključuje se ništa",
          v._primjenjivo({"uvjet": {}}, None, "seminarski"))
    check("K29: bez konteksta (tip nije poznat) ne isključuje se ništa",
          v._primjenjivo(zapis, None, None))

    # --- kvar 26: `meta` se koristio u `_renderiraj` koji ga nikad nije primio --
    import inspect
    bd = modul("build_docx")
    par = inspect.signature(bd._renderiraj).parameters
    check("K26: `_renderiraj` prima `meta`", "meta" in par)
    check("K26: `meta` ima zadanu vrijednost (poziv bez njega ne puca)",
          "meta" in par and par["meta"].default is not inspect.Parameter.empty,
          str(par.get("meta")))

    # --- kvar 48: proturječje u vlastitim brojkama rada ------------------------
    # „šest od sedam koraka" u jednom poglavlju i „pet od sedam koraka" u drugom
    # ne pada ni na jednoj provjeri lanca — nijedna ne gleda rad protiv njega
    # samoga. Lens i usporedba su čiste funkcije.
    pb = modul("provjeri_brojke_u_tekstu")
    m = pb.UZORAK_OD.search("Time je zatvoreno šest od sedam koraka postupka.")
    check("K48: uzorak hvata „N od M <imenica>”", bool(m), m and m.groups())
    nalazi = [("korak", "od", "6", "7", "Rasprava", "šest od sedam koraka"),
              ("korak", "od", "5", "7", "Zaključak", "pet od sedam koraka")]
    prot = pb.proturjecja(nalazi)
    check("K48: dvije različite vrijednosti istog pojma su nalaz",
          len(prot) == 1 and prot[0]["pojam"] == "korak", prot)
    isti = [("korak", "od", "6", "7", "Rasprava", "šest od sedam"),
            ("korak", "od", "6", "7", "Zaključak", "šest od sedam")]
    check("K48: ista vrijednost dvaput NIJE nalaz", pb.proturjecja(isti) == [])

    # --- doktrinarni kvarovi: 43, 49, 134 -------------------------------------
    # Doktrina je artefakt kao i kod, pa ograda smije mjeriti njezin tekst — ali
    # samo ODLUČUJUĆI token, ne rečenicu. Preformulacija ne smije rušiti test;
    # brisanje odluke mora.
    with io.open(os.path.join(KORIJEN, "SKILL.md"), encoding="utf-8") as f:
        router = f.read()

    # 43: 403 se rješava pojmom „izvor sesije", ne imenom klika u postavkama
    check("K43: doktrina imenuje `izvor sesije`", "izvor sesije" in router)
    check("K43: doktrina ne šalje korisnika u konkretnu postavku",
          "Add from GitHub" not in router.split("| Površina |")[0])

    # 49: uz verziju paketa u prvoj poruci mora stajati i redak drift.py
    # Odlučujući token je zahtjev iz pravila (4), ne prvi spomen varijable:
    # ista se riječ pojavljuje i u bash bloku iznad.
    zahtjev = re.search(r"ispiši u prvoj poruci", router)
    okolina = router[max(0, zahtjev.start() - 260):zahtjev.end()] if zahtjev else ""
    check("K49: uz verziju paketa traži se i redak `drift.py --kratko`",
          "drift.py --kratko" in okolina, okolina[-90:])

    # 134: Cowork redak je ❌ BEZ uvjeta — uvjet koji se ne ispunjava nigdje
    #      briše se, ne ublažava (issue #84581)
    red = next((x for x in router.splitlines() if x.startswith("| Cowork")), "")
    check("K134: Cowork redak postoji i nosi ❌", "❌" in red, red[:90])
    check("K134: Cowork redak nema uvjetni izlaz („samo ako”)",
          "samo ako" not in red, red[:90])

    # --- fixture dokumenti: 40, 41, 45, 71 ------------------------------------
    # Najmanji .docx koji kvar izaziva. Fixture je jeftiniji od cijelog rada i
    # preživljava; gradi se ovdje, ne čuva u repou.
    from docx import Document
    from docx.shared import Cm
    from PIL import Image
    mapa = tempfile.mkdtemp()

    # 40: slika koju je autor „povukao mišem" je <wp:anchor>, ne <wp:inline>,
    #     i inline_shapes je ne vidi — alat je javljao „nema što mjeriti".
    png = os.path.join(mapa, "s.png")
    Image.new("RGB", (40, 40), "white").save(png)
    p_inline = os.path.join(mapa, "inline.docx")
    d = Document(); d.add_paragraph("Tekst."); d.add_picture(png, width=Cm(4)); d.save(p_inline)
    pp = modul("provjeri_prikaze")
    check("K40: inline slika se broji", len(pp._slike(p_inline)[1]) == 1)
    p_anchor = os.path.join(mapa, "anchor.docx")
    d2 = Document(p_inline)
    WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
    for el in list(d2.element.body.iter("{%s}inline" % WP)):
        el.tag = "{%s}anchor" % WP
    d2.save(p_anchor)
    d3 = Document(p_anchor)
    check("K40: fixture doista zaobilazi inline_shapes", len(d3.inline_shapes) == 0)
    check("K40: plutajuća slika se ipak broji", len(pp._slike(p_anchor)[1]) == 1,
          pp._slike(p_anchor)[1])
    check("K40: ograda protiv tihe nule — <w:drawing> u XML-u je 1",
          pp._crteza_u_xml(d3) == 1, pp._crteza_u_xml(d3))

    # 41: „Uvod" zabunom na Heading 2 → uvod je None → „rad nema tezu"
    p41 = os.path.join(mapa, "uvod2.docx")
    d = Document()
    d.add_paragraph("Uvod", style="Heading 2")
    d.add_paragraph("Ovaj rad tvrdi da je X posljedica Y, jer se Z pokazalo presudnim u tri slučaja.")
    d.add_paragraph("Rasprava", style="Heading 1")
    d.add_paragraph("Duga rečenica koja prelazi četrdeset znakova da bi bila odlomak, i završava točkom.")
    d.add_paragraph("Zaključak", style="Heading 1")
    d.add_paragraph("Još jedna dovoljno duga rečenica koja završava točkom za zaključak rada.")
    d.save(p41)
    ca.poglavlja(p41)
    krivi = ca._uvod_na_krivoj_razini()
    check("K41: „Uvod” na Heading 2 se prepoznaje kao kriva razina, ne kao odsutan",
          krivi is not None and krivi[0] == 2, krivi)
    p41b = os.path.join(mapa, "uvod1.docx")
    d = Document(); d.add_paragraph("Uvod", style="Heading 1")
    d.add_paragraph("Rečenica uvoda koja je dovoljno duga da bude odlomak i završava točkom.")
    d.save(p41b)
    ca.poglavlja(p41b)
    check("K41: „Uvod” na Heading 1 nije kriva razina", ca._uvod_na_krivoj_razini() is None)

    # 45: format papira — Letter je prolazio kao A4 jer ga nitko nije mjerio
    cr = modul("check_rules")

    class Iz:
        def __init__(self):
            self.r = []

        def dodaj(self, pravilo, trazeno, nadjeno, stanje, detalji=None, **kw):
            self.r.append((pravilo, stanje, kw.get("rule_id")))

    def dokument_formata(w_cm, h_cm, ime):
        p = os.path.join(mapa, ime)
        dd = Document()
        dd.sections[0].page_width = Cm(w_cm)
        dd.sections[0].page_height = Cm(h_cm)
        dd.add_paragraph("Tekst.")
        dd.save(p)
        return Document(p)

    iz = Iz()
    cr.provjeri_format_stranice(iz, dokument_formata(21.59, 27.94, "letter.docx"), {"format": {}})
    check("K45: Letter uz očekivani A4 je KRŠENJE (format.stranica)",
          any(st == cr.LOSE and rid == "format.stranica" for _p, st, rid in iz.r), iz.r)
    iz = Iz()
    cr.provjeri_format_stranice(iz, dokument_formata(21.0, 29.7, "a4.docx"), {"format": {}})
    check("K45: A4 uz očekivani A4 prolazi",
          any(st == cr.OK and rid == "format.stranica" for _p, st, rid in iz.r)
          and not any(st == cr.LOSE for _p, st, _r in iz.r), iz.r)

    # 71: faza A (placeholderi) mora imati izvršitelja. U predaji je to izravan
    #     blokirajući korak; u auditu ide kroz motor (engine.py --audit →
    #     rad-audit/generate_report.py:115, koji sam citira kvar 71), pa se ondje
    #     mjeri da je motor blokirajući — bez toga bi faza A opet bila bez ruke.
    g = modul("gate")
    c = {"rad": "rad.docx", "pdf": None, "profil": "p.json", "tip": "diplomski",
         "kat": ".katedra"}
    k = next((x for x in g.koraci("predaja", c) if x.kid == "placeholderi"), None)
    check("K71: predaja zove check_placeholders.py kao blokirajući korak",
          k is not None and k.blokira
          and any("check_placeholders.py" in str(a) for a in k.argv),
          None if k is None else (k.blokira, [str(a) for a in k.argv][:3]))
    m = next((x for x in g.koraci("audit", c) if x.kid == "motor_audit"), None)
    check("K71: audit ima blokirajući motor koji nosi fazu A",
          m is not None and m.blokira and any("--audit" in str(a) for a in m.argv),
          None if m is None else (m.blokira, [str(a) for a in m.argv][:3]))

    # --- 46: odluka o vlastitom istraživanju je u stanju projekta -----------
    # Prije se izvodila iz statusa dijela `metodologija`, koji je time sam sebi
    # stvarao kriterij. `_empirijski(kat)` je čista funkcija nad mapom.
    rb = modul("rubrika")

    def kat_sa(stanje):
        k = tempfile.mkdtemp()
        with open(os.path.join(k, "stanje.json"), "w", encoding="utf-8") as f:
            json.dump(stanje, f)
        return k

    check("K46: odluka autora `vlastito_istrazivanje: true` je empirijski rad",
          rb._empirijski(kat_sa({"vlastito_istrazivanje": True})) is True)
    check("K46: odluka „ne” NIJE empirijski rad",
          rb._empirijski(kat_sa({"vlastito_istrazivanje": "ne"})) is False)

    # --- 34: gotov rad bez plana nije „nezapočet” ---------------------------
    nap = modul("napredak")
    vr, opis = nap.komponenta_opseg(kat_sa({}), None,
                                    {"datoteke": {"rad_docx": "rad.docx"}})
    check("K34: gotov rad bez plana daje opseg 100 „iz gotovog rada”",
          vr == 100 and isinstance(opis, dict) and "postojeći rad" in opis.get("ocjena", ""),
          (vr, opis))
    vr2, opis2 = nap.komponenta_opseg(kat_sa({}), None, {})
    check("K34: bez plana i bez rada opseg se NE izmišlja", vr2 is None, (vr2, opis2))

    # --- 56: doktrina o gateovima (pravila 33 i 34) mora stajati u routeru -------
    # Odlučujući token je broj + naslov pravila, ne cijela rečenica.
    check("K56: pravilo 33 „provjera koja ne može pasti” je u routeru",
          bool(re.search(r"^33\. \*\*Provjera koja ne može pasti", router, re.M)))
    check("K56: pravilo 34 „provjera se prima tek kad je pokazano da pada” je u routeru",
          bool(re.search(r"^34\. \*\*Provjera se prima tek kad je pokazano da pada", router, re.M)))

    # --- 72–73: provjera tvrdnji ne smije javiti ✓ nad skillom bez testova -------
    # SKILL.md tvrdi 12/12 testova i spominje test_all.py, a datoteke nema.
    za = modul_katedra("zakrpa")
    sk = os.path.join(tempfile.mkdtemp(), "lazni-skill")
    os.makedirs(os.path.join(sk, "scripts"))
    with open(os.path.join(sk, "SKILL.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write("# Skill\n\nProlazi 12/12 testova (scripts/tests/test_all.py).\n")
    n7273 = za.provjeri_tvrdnje(sk)
    check("K72: tvrdnja o testovima bez suitea je ❌",
          any("suite se ne može pokrenuti" in x for x in n7273), n7273)
    check("K73: spomen test_all.py bez datoteke je ❌",
          any("test_all.py ne postoji" in x or "ne postoji" in x and "test_all" in x for x in n7273), n7273)

    # --- 27: „popis literature” nije običan „popis” --------------------------
    # Grana startswith("popis") hvatala je i popis literature prije specifične
    # grane. Popravak je uveo `_je_popis_literature`; ograda mjeri tu funkciju
    # (djelomično — redoslijed grana u generatoru traži cijeli rukopis).
    bdx = modul("build_docx")
    check("K27: „popis literature” jest popis literature",
          bdx._je_popis_literature("popis literature"))
    check("K27: „popis korištenih izvora” jest popis literature",
          bdx._je_popis_literature("popis korištenih izvora"))
    check("K27: „popis tablica” NIJE popis literature",
          not bdx._je_popis_literature("popis tablica"))

    # --- 28: izlazni kod iz toga SMIJE LI simbol blokirati, ne iz broja simbola --
    # Ugovor: kod je 1 točno kad postoji ❌ (broj_krsenja > 0); sama ⚠ daje 0.
    # Mjeri se CLI na dva dokumenta i uspoređuje s vlastitim JSON-om alata.
    import subprocess
    prof = os.path.join(mapa, "prazan_profil.json")
    with open(prof, "w", encoding="utf-8") as f:
        json.dump({"slug": "proba", "format": {}}, f)

    def check_rules_kod(docx_put):
        js = docx_put + ".json"
        rr = subprocess.run([sys.executable, "-B", os.path.join(SCRIPTS, "check_rules.py"),
                             docx_put, "--profil", prof, "--tip", "seminarski", "--json", js],
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
        # Alat koji je pukao nije provjera koja je prosla (pravilo 20): ako JSON
        # nije napisan, to je NALAZ s razlogom, ne traceback koji zakloni ostatak.
        if not os.path.exists(js):
            return rr.returncode, None, (rr.stderr or rr.stdout).strip().splitlines()[-3:]
        with open(js, encoding="utf-8") as f:
            iz = json.load(f)
        return rr.returncode, int(iz.get("broj_krsenja") or 0), None

    for ime, (w, h) in (("letter", (21.59, 27.94)), ("a4", (21.0, 29.7))):
        dokument_formata(w, h, "k28_%s.docx" % ime)
        kod, krsenja, greska = check_rules_kod(os.path.join(mapa, "k28_%s.docx" % ime))
        check("K28: %s — alat je napisao JSON (nije pukao)" % ime, greska is None, greska)
        if greska is None:
            check("K28: %s — izlazni kod 1 ⇔ broj_krsenja > 0 (kod %d, kršenja %d)" % (ime, kod, krsenja),
                  (kod == 1) == (krsenja > 0), (kod, krsenja))

    # --- 61–63: srušena faza nije faza bez nalaza -------------------------------
    aa = modul_rad_audit("audit_all")
    aa.KODOVI.clear()
    check("K61: faza koja vrati 1 upisuje 1", aa.run("t1", lambda: 1) == 1 and aa.KODOVI["t1"] == 1)

    def pukni():
        raise RuntimeError("proba")

    check("K61: iznimka u modulu je kod 2 (KRITIČNO), ne 0",
          aa.run("t2", pukni) == 2 and aa.KODOVI["t2"] == 2)

    def izadji3():
        sys.exit(3)

    check("K61: SystemExit(3) ostaje 3 — granica se ne pretvara u pad",
          aa.run("t3", izadji3) == 3 and aa.KODOVI["t3"] == 3)

    # --- 42: dokaz.py razlikuje smjer tihog kvara --------------------------------
    dz = os.path.join(os.path.dirname(KORIJEN), "katedra", "scripts", "dokaz.py")
    PY = sys.executable
    prolazi = PY + " -c \"import sys;print('A');sys.exit(0)\""
    pada    = PY + " -c \"import sys;print('B');sys.exit(1)\""

    def dokaz(*argv):
        rr = subprocess.run([PY, "-B", dz] + list(argv), capture_output=True, text=True,
                            encoding="utf-8", errors="replace",
                            env=dict(os.environ, PYTHONIOENCODING="utf-8"))
        return rr.returncode, rr.stdout

    k, out = dokaz("--prije", prolazi, "--poslije", pada)
    check("K42: 0 → ≠0 bez --tihi je „obrnuto od očekivanog” i pada",
          k == 1 and "obrnuto" in out, (k, out[-160:]))
    k, out = dokaz("--prije", prolazi, "--poslije", pada, "--tihi")
    check("K42: isti par s --tihi je dokazan tihi kvar i prolazi",
          k == 0 and "tihi kvar" in out, (k, out[-160:]))
    k, out = dokaz("--prije", prolazi, "--poslije", prolazi)
    check("K42: dva jednaka stanja ne dokazuju ništa",
          k == 1 and "ne razlikuje" in out, (k, out[-160:]))

    # --- 74: napomena o metodi nije nalaz ---------------------------------------
    # Redak koji vrijedi za svaki rad ne smije nositi ⚠, inače brojač nikad ne
    # pokazuje nulu. Mjeri se ispis nad čistim dokumentom.
    p74 = os.path.join(mapa, "cist_citat.docx")
    d = Document()
    d.add_paragraph("Uvod", style="Heading 1")
    d.add_paragraph("Ranija analiza pokazuje jasan trend u ovom području (Horvat, 2020).")
    d.add_paragraph("Literatura", style="Heading 1")
    d.add_paragraph("Horvat, M. (2020). Naslov djela o trendovima. Zagreb: Izdavač.")
    d.save(p74)
    cay = os.path.join(os.path.dirname(KORIJEN), "rad-audit", "scripts", "check_citations_authoryear.py")
    rr = subprocess.run([PY, "-B", cay, p74], capture_output=True, text=True,
                        encoding="utf-8", errors="replace",
                        env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    redci = rr.stdout.splitlines()
    napomena = next((x for x in redci if "NAPOMENA O METODI" in x), "")
    check("K74: napomena o metodi postoji i NE počinje znakom ⚠",
          napomena and not napomena.lstrip().startswith("⚠"), napomena[:80])
    check("K74: čist dokument nema nijedan ⚠ redak",
          not any(x.lstrip().startswith("⚠") for x in redci),
          [x for x in redci if x.lstrip().startswith("⚠")][:3])

    # --- 38: nepotvrđen izvor dobiva NAREDBU čovjeku, ne samo simbol ---------
    # Nalaz koji ništa ne traži tretira se kao nalaz koji ništa ne znači.
    vs = modul("verify_sources")
    bez_adrese = {"status": "?", "url": None, "doi": None,
                  "verification": {"status": vs.UNVERIFIED, "reason": "nema u Crossrefu"}}
    _o, radnja = vs.radnja_za_izvor(bez_adrese)
    check("K38: unverified bez URL-a i DOI-ja kaže GDJE pogledati",
          bool(radnja) and "potraži" in radnja, radnja[:100])
    s_adresom = dict(bez_adrese, url="https://example.org/jedinica")
    _o, radnja2 = vs.radnja_za_izvor(s_adresom)
    check("K38: unverified s URL-om kaže da se adresa otvori i provjeri",
          "otvori" in radnja2 and "example.org" in radnja2, radnja2[:100])
    nedostupno = dict(bez_adrese, status=vs.NEDOSTUPNO)
    _o, radnja3 = vs.radnja_za_izvor(nedostupno)
    check("K38: ⏸ nedostupno prvo traži ponovnu provjeru mreže",
          "ponovi" in radnja3, radnja3[:100])

    # --- 35: u numeričkom dijalektu točka iza godine je kraj reference -----------
    # Na Vancouver profilu (tocka_iza_godine: false) jedinica „…; 2014.”
    # davala je ❌ „godina s točkom” — 11 od 75 na stvarnom radu, sve lažno.
    # Katalog je kvar vodio kao NEPOPRAVLJEN, a kod ga je popravio (v1.9): ovo je
    # ograda i za popravak i za istinitost unosa.
    jed = "15. Ozimec Vulinec Š. Palijativna skrb. Zagreb: Zdravstveno veleučilište; 2014."
    o_van = pl.ocekivani_oblik({"citiranje": {"stil": "vancouver", "tocka_iza_godine": False}})
    o_ag = pl.ocekivani_oblik({"citiranje": {"stil": "autor-godina", "tocka_iza_godine": False}})
    check("K35: Vancouver — završna točka iza godine NIJE nalaz",
          not any("godina s točkom" in x[1] for x in pl.provjeri_jedinicu(jed, o_van)),
          pl.provjeri_jedinicu(jed, o_van))
    check("K35: autor-godina bez točke — ista jedinica JEST nalaz (pravilo i dalje živi)",
          any("godina s točkom" in x[1] for x in pl.provjeri_jedinicu(jed, o_ag)))

    # --- 32: gate bez benchmarka, registry bez gatea ---------------------------
    # evals/ nije u paketu: gate je tražio benchmark i cases koji nikad nisu bili u
    # repou, registry je od v1.9.3 bio stale za efzg i nitko nije primijetio.
    import shutil
    fsg = modul("faculty_scale_gate")
    prr = modul("profile_rules")
    pol = {"core_benchmark_min_accuracy": 1.0, "max_regressions": 0, "max_critical_regressions": 0}
    prov, sha, upoz = fsg.benchmark_check(None, pol)
    check("K32: bez benchmarka provjera je preskočena, prolazi, hash None i nosi ⚠",
          prov.get("passed") and prov.get("skipped") and sha is None
          and any("bez benchmarka" in u for u in upoz), (prov, sha, upoz))
    for ime, acc in (("ok", 1.0), ("los", 0.5)):
        with open(os.path.join(mapa, "bench_%s.json" % ime), "w", encoding="utf-8") as f:
            json.dump({"candidate": {"score": {"accuracy": acc}}, "comparison": {}}, f)
    prov, sha, upoz = fsg.benchmark_check(fsg.Path(os.path.join(mapa, "bench_ok.json")), pol)
    check("K32: benchmark koji postoji i prolazi daje passed + hash, bez ⚠",
          prov.get("passed") and not prov.get("skipped") and sha and not upoz, (prov, sha, upoz))
    prov, sha, upoz = fsg.benchmark_check(fsg.Path(os.path.join(mapa, "bench_los.json")), pol)
    check("K32: benchmark s accuracy 0.5 NE prolazi (prag i dalje živi)", not prov.get("passed"), prov)

    fak = os.path.join(mapa, "fakulteti")
    shutil.copytree(os.path.join(KORIJEN, "references", "fakulteti"), fak,
                    ignore=shutil.ignore_patterns("__pycache__", "*.diff"))
    prr.refresh_stale_admissions(fak)          # polazište: kopija je usklađena
    # … i efzg je production, inače bi „→ advisory” prošlo vakuumski (kopija repoa
    # već jest advisory; prva inačica ove ograde preživjela je mutaciju zbog toga).
    kat_put = os.path.join(fak, "_support_catalog.json")
    with open(kat_put, encoding="utf-8") as f:
        kat_sve = json.load(f)
    kat_sve["profiles"]["efzg"]["tier"] = "production"
    with open(kat_put, "w", encoding="utf-8") as f:
        json.dump(kat_sve, f, ensure_ascii=False, indent=2)
    efzg = os.path.join(fak, "efzg.json")
    with open(efzg, "a", encoding="utf-8") as f:
        f.write("\n")                          # isti JSON, drugi bajtovi = drugi bundle
    try:
        prr._admitted_profiles(fak)
        stale = ""
    except prr.ProfileRuleError as e:
        stale = str(e)
    check("K32: promijenjen bundle je stale i poruka kaže oba izlaza",
          "stale za efzg" in stale and "bez-admisije" in stale, stale[:160])

    def registry(*argv):
        rr = subprocess.run([sys.executable, "-B", os.path.join(SCRIPTS, "profile_registry.py"),
                             "--faculty-dir", fak] + list(argv), capture_output=True, text=True,
                            encoding="utf-8", errors="replace",
                            env=dict(os.environ, PYTHONIOENCODING="utf-8"))
        return rr.returncode, rr.stdout + rr.stderr

    k, out = registry("--check")
    check("K32: --check nad stale registryjem vraća 2 i imenuje profil", k == 2 and "efzg" in out, (k, out[-160:]))
    k, out = registry("--write")
    check("K32: --write bez --bez-admisije i dalje odbija (gate se ne zaobilazi tiho)", k == 2, (k, out[-160:]))
    k, out = registry("--check", "--bez-admisije")
    check("K32: --bez-admisije bez --write je greška uporabe", k == 2, (k, out[-160:]))
    k, out = registry("--write", "--bez-admisije")
    check("K32: --write --bez-admisije prolazi i na ispisu imenuje što je degradirao",
          k == 0 and "⚠ efzg" in out and "production → advisory" in out, (k, out[-200:]))
    with open(os.path.join(fak, "_support_catalog.json"), encoding="utf-8") as f:
        kat = json.load(f)["profiles"]["efzg"]
    check("K32: katalog nosi novi hash i tier advisory",
          kat["tier"] == "advisory" and kat["bundle_sha256"] == prr.faculty_bundle_sha256(fak, "efzg"), kat)
    with open(os.path.join(fak, "index.json"), encoding="utf-8") as f:
        tier_u_indeksu = {x["slug"]: x.get("support_tier") for x in json.load(f)["fakulteti"]}
    check("K32: index.json kaže advisory za efzg", tier_u_indeksu.get("efzg") == "advisory", tier_u_indeksu)
    k, out = registry("--check")
    check("K32: poslije toga --check prolazi", k == 0, (k, out[-160:]))

    # gate bez cases (evals/ nije u paketu): poruka s izlazom, ne Errno — i prije jsonschema
    def gate(*argv, **env):
        rr = subprocess.run([sys.executable, "-B", os.path.join(SCRIPTS, "faculty_scale_gate.py"),
                             "--faculty-dir", fak, "--fakultet", "efzg", "--tier", "pilot",
                             "--as-of", "2026-09-07"] + list(argv),
                            capture_output=True, text=True, encoding="utf-8", errors="replace",
                            env=dict(os.environ, PYTHONIOENCODING="utf-8", **env))
        return rr.returncode, rr.stderr

    k, err = gate("--cases", os.path.join(mapa, "nema.jsonl"))
    check("K32: gate bez cases kaže gdje je izlaz (--bez-admisije), kod 2, ne Errno",
          k == 2 and "bez-admisije" in err and "Errno" not in err and "Traceback" not in err, (k, err[-200:]))

    # bez paketa jsonschema: ❌ s uputom i kod 2, ne traceback (stub zaklanja pravi paket)
    stub = os.path.join(mapa, "bez_jsonschema", "jsonschema")
    os.makedirs(stub)
    with open(os.path.join(stub, "__init__.py"), "w", encoding="utf-8") as f:
        f.write("raise ImportError('stub: nema jsonschema')\n")
    cases = os.path.join(mapa, "cases.jsonl")
    with open(cases, "w", encoding="utf-8") as f:
        f.write(json.dumps({"id": "c1", "faculty": "efzg", "query": "efzg", "expected": {"/slug": "efzg"}}) + "\n")
    k, err = gate("--cases", cases, PYTHONPATH=os.path.join(mapa, "bez_jsonschema"))
    check("K32: bez paketa jsonschema gate kaže ❌ što napraviti (kod 2), ne traceback",
          k == 2 and "jsonschema" in err and "Traceback" not in err, (k, err[-200:]))

    # --- 148: registry ne smije ovisiti o OS-u na kojem je generiran ---------
    # Stvarna provjera samo na Windowsu (na Linuxu relative_to i bez popravka daje /).
    reg = prr.generate_registry(fak)
    s_bs = [x for x in reg["generated_from"] if "\\" in x]
    r_bs = [x["source"] for x in reg["rute"] if "\\" in x["source"]]
    check("K148: generated_from nema backslash", not s_bs, s_bs)
    check("K148: rute[].source nema backslash", not r_bs, r_bs[:3])

    # --- 99: pod zahvatom `stil` tipografski popravak markera nije promjena ------
    # Isti par .md datoteka: natpis s dvostrukim razmakom → s NBSP-om i jednim.
    vr = modul("verify_rewrite")
    tijelo99 = "Ovo je odlomak tijela rada koji ima dovoljno riječi da bude odlomak, a ne natpis niti naslov."
    md_a = os.path.join(mapa, "prije.md")
    md_b = os.path.join(mapa, "poslije.md")
    with open(md_a, "w", encoding="utf-8") as f:
        f.write("# Uvod\n\n" + tijelo99 + "\n\n## Tablica 1. Udaljenost 5 km  po danu\n\n" + tijelo99 + "\n")
    with open(md_b, "w", encoding="utf-8") as f:
        f.write("# Uvod\n\n" + tijelo99 + "\n\n## Tablica 1. Udaljenost 5" + chr(160) + "km po danu\n\n" + tijelo99 + "\n")

    def markeri99(zahvat):
        return [k for k, p, *_ in vr.usporedi(md_a, md_b, zahvat=zahvat) if "marker" in p]

    check("K99: pod `stil` NBSP/dvostruki razmak u natpisu NIJE promjena markera",
          markeri99("stil") == ["ok"], markeri99("stil"))
    check("K99: pod `geometrija` isti par JEST promjena markera (doslovnost ostaje)",
          markeri99("geometrija") == ["x"], markeri99("geometrija"))

    # --- 100/101/104: alati rad-docx nad fixture dokumentima ---------------------
    from docx.enum.text import WD_LINE_SPACING
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Cm, Pt
    import zipfile
    pp = modul_rad_docx("provjeri_predaju")

    def dxml_iz(put):
        with zipfile.ZipFile(put) as zz:
            return zz.read("word/document.xml").decode("utf-8")

    # 100: numeracija tijela je ondje gdje se RESTARTA, ne u posljednjoj sekciji
    def doc_numeracija(ime, restart_u_sredini):
        d = Document()
        d.add_paragraph("Naslovnica i sadržaj")
        d.add_section()
        d.add_paragraph("Uvod", style="Heading 1")
        d.add_paragraph(tijelo99)
        d.add_section()
        d.add_paragraph("Prilog", style="Heading 1")
        d.add_paragraph(tijelo99)
        if restart_u_sredini is not None:
            # python-docx: add_section() vraća sekciju nad ISTIM sentinel sectPr-om
            # (kasnije zadnjom), pa prva inačica ove ograde nije gađala srednju
            # sekciju i mutacija ju je preživjela. Sekcija se uzima po indeksu.
            cilj = d.sections[1] if restart_u_sredini else d.sections[2]
            pg = OxmlElement("w:pgNumType")
            pg.set(qn("w:start"), "1")
            cilj._sectPr.append(pg)
            cilj.footer.is_linked_to_previous = False
            cilj.footer.paragraphs[0].text = "str."
        put = os.path.join(mapa, ime)
        d.save(put)
        return put

    prof100 = {"format": {"numeracija": {"tijelo_pocinje_od": 1, "prednji_dio": "bez"}}}

    def numeracija_greske(put):
        P100 = pp.Provjera()
        pp.provjeri_numeraciju(P100, dxml_iz(put), prof100)
        return P100.greske

    g = numeracija_greske(doc_numeracija("num_sredina.docx", True))
    check("K100: restart u SREDNJOJ sekciji s podnožjem, zadnja (prilog) bez podnožja → bez greške", not g, g)
    g = numeracija_greske(doc_numeracija("num_bez.docx", None))
    check("K100: nijedna sekcija ne restarta → greška koja to kaže (provjera je živa)",
          any("nijedna sekcija" in x for x in g), g)

    # 101: „prored je fiksan — slike se obrežu” samo za odlomke koji NOSE sliku
    from PIL import Image
    png = os.path.join(mapa, "slika101.png")
    Image.new("RGB", (300, 120), "white").save(png)

    def doc_prored(ime, slika, slika_fiksna):
        d = Document()
        sec = d.sections[0]
        sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
        d.add_paragraph("Uvod", style="Heading 1")
        for i in range(5):
            p = d.add_paragraph(tijelo99 + " (%d)" % i)
            p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
            p.paragraph_format.line_spacing = Pt(12)
        if slika:
            p = d.add_paragraph(tijelo99 + " (sa slikom)")
            if slika_fiksna:
                p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
                p.paragraph_format.line_spacing = Pt(12)
            else:
                p.paragraph_format.line_spacing = 1.5
            p.add_run().add_picture(png, width=Cm(5))
        put = os.path.join(mapa, ime)
        d.save(put)
        return put

    def fiksan(put):
        P101 = pp.Provjera()
        pp.provjeri_format(P101, put, Document(put), {"format": {"prored": 1.5}})
        # Filtar mora pogoditi PORUKE O SLIKAMA, ne svaku koja sadrži "fiksan":
        # od kvara 150 i poruka o proredu u točkama nosi tu riječ, pa je goli
        # "fiksan" počeo hvatati tuđi nalaz i rušiti ovu ogradu.
        return ([x for x in P101.greske if "fiksan" in x and "slik" in x],
                [x for x in P101.upozorenja if "fiksan" in x and "slik" in x])

    g, u = fiksan(doc_prored("prored_bez.docx", False, False))
    check("K101: fiksan prored bez ijedne slike → ni greška ni upozorenje o slikama", not g and not u, (g, u))
    g, u = fiksan(doc_prored("prored_fiks.docx", True, True))
    check("K101: slika u fiksno proređenom odlomku → GREŠKA (obrezuje se)", bool(g), (g, u))
    g, u = fiksan(doc_prored("prored_nefiks.docx", True, False))
    check("K101: slika u nefiksnom odlomku uz fiksni ostatak → samo upozorenje", not g and bool(u), (g, u))

    # 104: mrtvi medijski dijelovi se vide, broje i čiste u ZASEBAN izlaz
    import hashlib
    ip = modul_rad_docx("inventar_paketa")
    ps = modul_rad_docx("priprema_slanja")
    d = Document()
    d.add_paragraph("Uvod", style="Heading 1")
    d.add_paragraph(tijelo99)
    d.add_picture(png, width=Cm(8))
    cist = os.path.join(mapa, "cist104.docx")
    d.save(cist)
    mrtav = os.path.join(mapa, "mrtav104.docx")
    with zipfile.ZipFile(cist) as zin, zipfile.ZipFile(mrtav, "w", zipfile.ZIP_DEFLATED) as zout:
        for i in zin.infolist():
            data = zin.read(i.filename)
            if i.filename == "word/document.xml":
                data = re.sub(rb"<w:drawing>.*?</w:drawing>", b"", data, flags=re.S)
            zout.writestr(i, data)
    check("K104: čist dokument nema mrtvih medijskih dijelova", ip.mrtvi_mediji(cist) == [], ip.mrtvi_mediji(cist))
    m = ip.mrtvi_mediji(mrtav)
    check("K104: slika bez <w:drawing> je točno jedan mrtvi dio s veličinom",
          len(m) == 1 and m[0][1].startswith("word/media/") and m[0][2] > 0, m)
    check("K104: težina broji mrtvo zasebno i jednako",
          m and ip.tezina(mrtav)["mrtvo_bajtova"] == m[0][2], ip.tezina(mrtav))
    izlaz = os.path.join(mapa, "za_slanje104.docx")
    h0 = hashlib.sha256(open(mrtav, "rb").read()).hexdigest()
    ps.pripremi(mrtav, izlaz, 300)
    h1 = hashlib.sha256(open(mrtav, "rb").read()).hexdigest()
    # I bajtovi moraju otići, ne samo relacija: datoteka bez relacije i dalje se da
    # izvaditi iz paketa (prva inačica gledala je samo relacije i mutacija je prošla).
    check("K104: izlaz za slanje nema mrtvih dijelova NI medijskih bajtova, a ulaz je netaknut",
          os.path.isfile(izlaz) and ip.mrtvi_mediji(izlaz) == [] and ip.tezina(izlaz)["medij_bajtova"] == 0 and h0 == h1,
          (ip.mrtvi_mediji(izlaz), ip.tezina(izlaz), h0 == h1))
    rr = subprocess.run([sys.executable, "-B", os.path.join(os.path.dirname(KORIJEN), "rad-docx", "scripts", "priprema_slanja.py"),
                         mrtav, "--izlaz", mrtav], capture_output=True, text=True,
                        encoding="utf-8", errors="replace", env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    check("K104: izlaz = ulaz odbija s kodom 2 (arhiva se ne prepisuje)", rr.returncode == 2, (rr.returncode, rr.stderr[-120:]))

    # --- 150: fiksan prored se javlja u TOČKAMA, ne u EMU -----------------------
    # python-docx vraća `line_spacing` kao Length kad je pravilo EXACTLY/AT_LEAST.
    # Poruka je taj Length gurala kroz `float()` i ispisivala „prored je 152400,00,
    # profil traži 1,50" — broj u EMU, nečitljiv, i k tome je skrivao pravu
    # činjenicu: prored je zadan u točkama, pa višekratnik ne može ni pogoditi.
    def prored_greske(ime, pravilo, vrijednost):
        d = Document()
        sec = d.sections[0]
        sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
        d.add_paragraph("Uvod", style="Heading 1")
        for i in range(5):
            p = d.add_paragraph(tijelo99 + " (%d)" % i)
            if pravilo is not None:
                p.paragraph_format.line_spacing_rule = pravilo
            p.paragraph_format.line_spacing = vrijednost
        put = os.path.join(mapa, "prored150_%s.docx" % ime)
        d.save(put)
        P150 = pp.Provjera()
        pp.provjeri_format(P150, put, Document(put), {"format": {"prored": 1.5}})
        # Poruke o slikama su predmet ograde K101, ne ove: bez tog izuzeća
        # mutacija grane 101 obarala bi i K150 i zamutila tko što čuva.
        return [x for x in P150.greske
                if x.startswith("prored") and "slik" not in x]

    g = prored_greske("exactly", WD_LINE_SPACING.EXACTLY, Pt(12))
    check("K150: EXACTLY → poruka je u točkama i kaže da je prored fiksan",
          g == ["prored je fiksan 12 pt, profil traži višekratnik 1,5 "
                "(u 100 % odlomaka tijela)"], g)
    check("K150: EXACTLY → u poruci nema sirovog EMU broja",
          bool(g) and "152400" not in g[0], g)
    g = prored_greske("atleast", WD_LINE_SPACING.AT_LEAST, Pt(12))
    check("K150: AT_LEAST → najmanje 12 pt (nije fiksan, ne tvrdi se krivo)",
          g == ["prored je najmanje 12 pt, profil traži višekratnik 1,5 "
                "(u 100 % odlomaka tijela)"], g)
    # Ostala logika ostaje netaknuta: višekratnik se i dalje uspoređuje brojem,
    # a točan višekratnik i dalje prolazi bez greške.
    g = prored_greske("mult20", WD_LINE_SPACING.MULTIPLE, 2.0)
    check("K150: MULTIPLE 2,0 → stara poruka o višekratniku (provjera je živa)",
          g == ["prored je 2,00, profil traži 1,50 (u 100 % odlomaka tijela)"], g)
    g = prored_greske("mult15", WD_LINE_SPACING.MULTIPLE, 1.5)
    check("K150: MULTIPLE 1,5 → nijedna greška o proredu", g == [], g)

    # --- rad-docx 11: osnovica zaokruživanja -----------------------------------
    # RD = katalog skilla rad-docx (vlastita numeracija), da se ne pomiješa s
    # K-brojevima katedra-lite. Udio i zbroj moraju se računati iz PRIKAZANIH
    # vrijednosti, inače recenzent koji podijeli dvije brojke iz tablice dobije
    # drugu znamenku od one koja piše u istom retku.
    _mp_put = os.path.join(os.path.dirname(KORIJEN), "rad-docx", "assets",
                           "model_predlozak.py")
    _mp_spec = importlib.util.spec_from_file_location("model_predlozak", _mp_put)
    mp = importlib.util.module_from_spec(_mp_spec)
    _mp_spec.loader.exec_module(mp)

    # Zaokružuje se POLA GORE. Pythonov `round` to nije: round(1.8155, 3) = 1,815,
    # jer je 1,8155 u dvojnom zapisu nešto ispod polovice. Otud nudge 1e-12.
    check("RD11: r2 zaokružuje pola gore (2,155 → 2,16)", mp.r2(2.155) == 2.16, mp.r2(2.155))
    check("RD11: r3 zaokružuje pola gore (1,8155 → 1,816)", mp.r3(1.8155) == 1.816, mp.r3(1.8155))

    # `ale()` mora biti zbroj PRIKAZANIH doprinosa, da se stupac može provjeriti
    # sabiranjem. Prva inačica ove ograde mjerila je to na SC iz predloška i
    # mutacija ju je preživjela: gubici 6,856 / 24,66 / 77,94 su takvi da `r2` ne
    # promijeni nijedan doprinos, pa se izbor osnovice ondje uopće ne vidi.
    # Zato scenariji na kojima se vidi — `gubitak` se privremeno zamjenjuje da
    # fixture zada iznos izravno.
    def ale_nad(sc):
        _stari_sc, _stara_g = mp.SC, mp.gubitak
        mp.SC, mp.gubitak = sc, (lambda s, fd=1.0, fr=1.0: s["_g"])
        try:
            return mp.ale()
        finally:
            mp.SC, mp.gubitak = _stari_sc, _stara_g

    # 2,1549 → prikazano 2,15; iz punog iznosa ispalo bi 2,155
    check("RD11: ale() računa doprinos iz PRIKAZANOG iznosa, ne iz punog",
          ale_nad({"a": {"freq": 1.0, "_g": 2.1549}}) == 2.15,
          ale_nad({"a": {"freq": 1.0, "_g": 2.1549}}))
    # dva doprinosa po 0,0005 → prikazano 0,001 + 0,001 = 0,002; nezaokruženo 0,001
    check("RD11: ale() sabire ZAOKRUŽENE doprinose, ne nezaokružene",
          ale_nad({"a": {"freq": 0.0005, "_g": 1.0},
                   "b": {"freq": 0.0005, "_g": 1.0}}) == 0.002,
          ale_nad({"a": {"freq": 0.0005, "_g": 1.0},
                   "b": {"freq": 0.0005, "_g": 1.0}}))
    # Primjer iz brojke.md mora ostati točan: prikazano 1,816, točan zbroj 1,8151.
    check("RD11: primjer iz brojke.md stoji (1,816 naspram točnih 1,8151)",
          mp.ale() == 1.816
          and round(sum(_sc["freq"] * mp.gubitak(_sc) for _sc in mp.SC.values()), 4) == 1.8151,
          (mp.ale(), sum(_sc["freq"] * mp.gubitak(_sc) for _sc in mp.SC.values())))

    # --- 156/157: pokrivenost zna numerički i fusnotni stil, sklonidbu svodi na korijen,
    # a nula prepoznatih citata NIJE popis necitiranih (Lekta 141/142) -------------------
    fx = os.path.join(KORIJEN, "evals", "files")
    vs156 = modul("verify_sources")

    def pokr(docx_put):
        js = os.path.join(mapa, os.path.basename(docx_put) + ".pokr.json")
        rr = subprocess.run([sys.executable, "-B", os.path.join(SCRIPTS, "verify_sources.py"), docx_put,
                             "--pokrivenost", "--offline", "--json", js],
                            capture_output=True, text=True, encoding="utf-8", errors="replace",
                            env=dict(os.environ, PYTHONIOENCODING="utf-8"))
        with open(js, encoding="utf-8") as f:
            return rr.returncode, rr.stdout, json.load(f)["pokrivenost"]

    def kratko(p):
        return {k2: (len(v) if isinstance(v, list) else v) for k2, v in p.items()}

    k, out, p = pokr(os.path.join(fx, "fzsri--final--prijediplomski--uskladjen.docx"))
    check("K156: Vancouver rad — stil numerički, 20 citata, nijedna jedinica lažno necitirana",
          p["stil"] == "numericki" and p["izmjereno"] and p["citata_razlicitih"] == 20
          and p["necitirani"] == [] and p["bez_izvora"] == [], kratko(p))
    check("K156: ispis više ne tvrdi „nigdje citirano (20)”", "nigdje citirano (20)" not in out, out[-300:])
    k, out, p = pokr(os.path.join(fx, "effectus--seminar--diplomski--uskladjen.docx"))
    check("K156: fusnotni rad — stil fusnote, citati čitani iz fusnota, ne sve jedinice necitirane",
          p["stil"] == "fusnote" and p["izmjereno"] and p["citata_razlicitih"] > 0
          and len(p["necitirani"]) < 18, kratko(p))
    d = Document()
    d.add_paragraph("Uvod", style="Heading 1")
    d.add_paragraph("Ovaj rad ne citira nikoga u tijelu teksta, ali ima popis literature s dvije jedinice na kraju dokumenta.")
    d.add_paragraph("Drugi odlomak tijela rada koji je dovoljno dugačak da bude prozni odlomak, a ne natpis.")
    d.add_paragraph("Literatura", style="Heading 1")
    d.add_paragraph("Horvat, M. (2020). Naslov djela o trendovima. Zagreb: Izdavač.")
    d.add_paragraph("Kovač, A. (2019). Drugo djelo o istoj temi. Split: Nakladnik.")
    bez_cit = os.path.join(mapa, "bez_citata156.docx")
    d.save(bez_cit)
    k, out, p = pokr(bez_cit)
    check("K156: rad bez ijednog prepoznatog citata → pokrivenost NIJE izmjerena, bez popisa necitiranih",
          p["izmjereno"] is False and p["necitirani"] == [] and "NIJE IZMJERENA" in out, (kratko(p), out[-200:]))

    kor = vs156._korijen
    check("K157: sklonidba se svodi na korijen na obje strane (Galtungu=Galtung, Wallacea=Wallace, Bandure=Bandura)",
          kor("galtungu") == kor("galtung") and kor("wallacea") == kor("wallace")
          and kor("bandure") == kor("bandura"), (kor("galtungu"), kor("wallacea"), kor("bandure")))
    check("K157: korijen kraći od 4 znaka se ne dira (Mara ostaje mara)", kor("mara") == "mara", kor("mara"))
    k, out, p = pokr(os.path.join(fx, "fpzg--final--prijediplomski--uskladjen.docx"))
    check("K157: fpzg — sklonjeni citati se poklapaju s popisom: bez ❌ i bez necitiranih",
          p["bez_izvora"] == [] and p["necitirani"] == [] and "❌ citirano u tekstu" not in out, (kratko(p), out[-200:]))

    # --- 158: provjera koja nije izvedena ne ispisuje se kao „0 kršenja” (Lekta 143) ----
    def fusn(docx_put):
        js = os.path.join(mapa, os.path.basename(docx_put) + ".fn.json")
        rr = subprocess.run([sys.executable, "-B", os.path.join(SCRIPTS, "provjeri_fusnote.py"), docx_put, "--json", js],
                            capture_output=True, text=True, encoding="utf-8", errors="replace",
                            env=dict(os.environ, PYTHONIOENCODING="utf-8"))
        with open(js, encoding="utf-8") as f:
            return rr.returncode, rr.stdout, json.load(f)

    pf158 = modul("provjeri_fusnote")
    check("K158: Chicago fusnota s imenom ispred daje prezime prvog autora („Michael C. Jensen i William H. Meckling, …” → Jensen)",
          pf158.kljuc_fusnote("Michael C. Jensen i William H. Meckling, „Theory of the Firm”, 1976.") == "Jensen"
          and pf158.kljuc_fusnote("Spence, „Job Market Signaling”, 359.") == "Spence",
          (pf158.kljuc_fusnote("Michael C. Jensen i William H. Meckling, x"), pf158.kljuc_fusnote("Spence, x")))
    eff = os.path.join(fx, "effectus--seminar--diplomski--uskladjen.docx")
    k, out, j = fusn(eff)
    pr = j.get("provjere") or {}
    check("K158: numerirani popis se čita — sve 4 provjere izvedene, fusnote razriješene, bez ➖",
          pr.get("izvedeno") == 4 and pr.get("ukupno") == 4 and pr.get("fusnota_pregledano", 0) >= 1
          and not any(n["stanje"] == "➖" for n in j["nalazi"]) and "nije nađen" not in out, (pr, out[-200:]))
    import docx as _docx
    hrt = modul("hr_text")
    dd = _docx.Document(eff)
    for para in dd.paragraphs:
        if hrt.NASLOV_LIT.match((para.text or "").strip()):
            for run in para.runs:
                run.text = ""
            para.runs[0].text = "Dodatak"
    bez_popisa = os.path.join(mapa, "bez_popisa158.docx")
    dd.save(bez_popisa)
    k, out, j = fusn(bez_popisa)
    check("K158: bez popisa literature — poruka to kaže, sažetak imenuje neizvedenu provjeru, nema golog „0 kršenja”",
          "nije nađen" in out and "NIJE izvedena" in out and not re.search(r"(?m)^0 kršenja$", out)
          and (j.get("provjere") or {}).get("izvedeno") == 3, out[-300:])
    dd = _docx.Document(eff)
    u = False
    for para in dd.paragraphs:
        t = (para.text or "").strip()
        if hrt.NASLOV_LIT.match(t):
            u = True
            continue
        if u and len(t) > 15 and para.runs:
            para.runs[0].text = "— " + para.runs[0].text
    neproc = os.path.join(mapa, "neprocitan158.docx")
    dd.save(neproc)
    k, out, j = fusn(neproc)
    check("K158: popis postoji, a jedinice se ne daju pročitati — druga poruka, ne „nije nađen”",
          "nijedno prezime nije pročitano" in out and "nije nađen" not in out, out[-300:])

    print("=" * 70)
    print("REZULTATI TESTOVA: %d/%d prošlo"
          % (len(SVE) - len(PALO), len(SVE)))
    print("=" * 70)
    return 1 if PALO else 0


if __name__ == "__main__":
    sys.exit(main())
