#!/usr/bin/env python3
"""Regresijski testovi za gate.py — kvar 58.

Kvar 58 (5.9.2026.): blokirajući korak kojemu fali ulaz izlazio je kao
`preskočeno`, a `zakljucak()` je blokirao samo NALAZ i PUKAO. Gate je ispisivao
„✅ nijedna blokirajuća provjera nije pala" uz izlazni kod 0, dok se sedam
blokirajućih provjera nikad nije pokrenulo. Dovoljno je bilo da se rad zove
drukčije od `rad.docx`.

Ovi testovi postoje da se to ne vrati. Uporaba:  python3 tests/test_gate.py
"""
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(HERE)
sys.path.insert(0, SCRIPTS)

import gate  # noqa: E402

REZULTATI = []


def check(naziv, uvjet, detalj=None):
    REZULTATI.append((naziv, bool(uvjet), detalj))


def r(korak, stanje, blokira=True):
    return {"korak": korak, "naziv": korak, "stanje": stanje, "blokira": blokira}


def main() -> int:
    # ── zakljucak() ───────────────────────────────────────────────────────
    # Kvar 112: neprimjenjivo ≠ preskočeno
    kod, sz = gate.zakljucak([r("hipoteze", gate.NEPRIMJENJIVO)])
    check("G13: neprimjenjiva BLOKIRAJUĆA provjera NE blokira", kod == 0, (kod, sz))
    check("G13: i imenuje se pod 'neprimjenjivo'",
          sz["neprimjenjivo"] == ["hipoteze"], sz)
    kod, _ = gate.zakljucak([r("hipoteze", gate.NEPRIMJENJIVO),
                             r("pravila", gate.PRESKOCENO)])
    check("G13: preskočeno i dalje blokira uz neprimjenjivo", kod == 1, kod)

    kod, s = gate.zakljucak([r("pravila", gate.PRESKOCENO)])
    check("G1: preskočen BLOKIRAJUĆI korak daje izlazni kod 1", kod == 1, (kod, s))
    check("G1: i imenuje se pod 'nepokrenuto'", s["nepokrenuto"] == ["pravila"], s)

    kod, _ = gate.zakljucak([r("stil", gate.PRESKOCENO, blokira=False)])
    check("G2: preskočen SAVJETODAVNI korak ne blokira", kod == 0, kod)

    kod, s = gate.zakljucak([r("pravila", gate.PRESKOCENO)],
                            {"pravila": "rad je tuđi, profil fakulteta nije dostupan"})
    check("G3: izuzet preskok ne blokira", kod == 0, (kod, s))
    check("G3: razlog izuzeća ostaje u izvještaju",
          s["preskok_dopusten"]["pravila"].startswith("rad je tuđi"), s)

    kod, _ = gate.zakljucak([r("pravila", gate.OK), r("jezik", gate.NALAZ)])
    check("G4: nalaz i dalje blokira", kod == 1, kod)

    kod, _ = gate.zakljucak([r("pravila", gate.OK), r("jezik", gate.OK)])
    check("G5: sve prošlo daje 0", kod == 0, kod)

    kod, s = gate.zakljucak([r("a", gate.NALAZ), r("b", gate.PRESKOCENO)])
    check("G6: nalaz i nepokrenuto se broje odvojeno",
          s["blokira"] == ["a"] and s["nepokrenuto"] == ["b"], s)

    # ── faze: koje provjere uopće blokiraju ───────────────────────────────
    c = {"rad": "rad.docx", "pdf": None, "profil": "p.json", "tip": "diplomski",
         "kat": ".katedra"}
    audit = gate.koraci("audit", c)
    blok = {k.kid for k in audit if k.blokira}
    for korak in ("motor_audit", "jezik", "fusnote", "dosljednost", "literatura",
                  "revizije", "pravila"):
        check(f"G7: faza audit blokira na '{korak}'", korak in blok, sorted(blok))
    check("G7: faza audit ima više od jedne blokirajuće provjere",
          len(blok) >= 6, sorted(blok))

    for korak in ("tvrdnja_izvor", "reference_postoje"):
        check(f"G7b: faza audit ima korak '{korak}'",
              korak in {k.kid for k in audit}, sorted(k.kid for k in audit))

    predaja = gate.koraci("predaja", c)
    kidovi = {k.kid for k in predaja}
    check("G8: faza predaja zove provjeri_predaju.py (rad-docx)",
          "predaja_docx" in kidovi, sorted(kidovi))
    check("G8: faza predaja provjerava metapodatke",
          "metapodaci" in kidovi, sorted(kidovi))
    check("G8: faza predaja provjerava praćene izmjene",
          "revizije" in kidovi, sorted(kidovi))
    k = next(x for x in predaja if x.kid == "reference_postoje")
    check("G8: u fazi predaja postojanje reference ide sa --strogo",
          "--strogo" in k.argv, k.argv)

    # check_rules dobiva --strogo u obje faze
    for faza in ("audit", "predaja"):
        k = next(x for x in gate.koraci(faza, c) if x.kid == "pravila")
        check(f"G9: check_rules u fazi {faza} dobiva --strogo",
              "--strogo" in k.argv, k.argv)

    # ── end-to-end: prazan projekt ────────────────────────────────────────
    with tempfile.TemporaryDirectory() as d:
        os.makedirs(os.path.join(d, ".katedra"), exist_ok=True)
        p = subprocess.run(
            [sys.executable, os.path.join(SCRIPTS, "gate.py"), "--faza", "audit",
             "--kat", os.path.join(d, ".katedra"), "--project-root", d],
            capture_output=True, text=True, encoding="utf-8", errors="replace")
        check("G10: prazan projekt NE prolazi fazu audit", p.returncode == 1,
              p.returncode)
        check("G10: ispis imenuje što se nije pokrenulo",
              "NIJE POKRENUTO" in p.stdout, p.stdout[-300:])
        check("G10: ispis NE tvrdi da je sve prošlo",
              "nijedna blokirajuća provjera nije pala" not in p.stdout,
              p.stdout[-300:])

        # nepoznat korak u --dopusti-preskok je greška, ne tiho ignoriranje
        p = subprocess.run(
            [sys.executable, os.path.join(SCRIPTS, "gate.py"), "--faza", "audit",
             "--kat", os.path.join(d, ".katedra"), "--project-root", d,
             "--dopusti-preskok", "nepostojeci=razlog"],
            capture_output=True, text=True, encoding="utf-8", errors="replace")
        check("G11: --dopusti-preskok s nepoznatim korakom vraća 2",
              p.returncode == 2, (p.returncode, p.stderr[-200:]))

        p = subprocess.run(
            [sys.executable, os.path.join(SCRIPTS, "gate.py"), "--faza", "audit",
             "--kat", os.path.join(d, ".katedra"), "--project-root", d,
             "--dopusti-preskok", "bez-razloga"],
            capture_output=True, text=True, encoding="utf-8", errors="replace")
        check("G12: --dopusti-preskok bez razloga vraća 2", p.returncode == 2,
              p.returncode)

        # Kvar 152: --iskljuci korak NE pokreće, upiše razlog, ne blokira; nepoznato ime je greška
        import json as _j
        gj = os.path.join(d, ".katedra", "gate.json")
        p = subprocess.run(
            [sys.executable, os.path.join(SCRIPTS, "gate.py"), "--faza", "audit",
             "--kat", os.path.join(d, ".katedra"), "--project-root", d,
             "--iskljuci", "literatura=forma: Lekta", "--json", gj],
            capture_output=True, text=True, encoding="utf-8", errors="replace")
        g = _j.load(open(gj, encoding="utf-8")) if os.path.exists(gj) else {"koraci": [], "sazetak": {}}
        lit = next((k for k in g["koraci"] if k["korak"] == "literatura"), {})
        check("G14: isključeni korak je u izvještaju kao iskljuceno s razlogom, bez naredbe",
              lit.get("stanje") == "iskljuceno" and "forma: Lekta" in lit.get("razlog", "")
              and lit.get("naredba") is None, lit)
        check("G14: sažetak imenuje isključeno i NE broji ga među nepokrenute",
              g["sazetak"].get("iskljuceno") == {"literatura": lit.get("razlog")}
              and "literatura" not in (g["sazetak"].get("nepokrenuto") or []), g["sazetak"])
        check("G14: ispis kaže da je isključeno pozivom", "isključeno pozivom" in p.stdout, p.stdout[-300:])
        p = subprocess.run(
            [sys.executable, os.path.join(SCRIPTS, "gate.py"), "--faza", "audit",
             "--kat", os.path.join(d, ".katedra"), "--project-root", d,
             "--iskljuci", "nepostojeci=razlog"],
            capture_output=True, text=True, encoding="utf-8", errors="replace")
        check("G14: --iskljuci s nepoznatim korakom vraća 2 i imenuje ga",
              p.returncode == 2 and "nepostojeci" in p.stderr, (p.returncode, p.stderr[-200:]))

        # Kvar 153: izlaz koraka se čita kao utf-8, dijete piše utf-8 — i na cp1250 konzoli
        k15 = gate.Korak("proba", "proba", [sys.executable, "-c", "print(chr(268)+chr(353)+' '+chr(10004))"])
        r15 = gate.pokreni(k15, d, False)
        check("G15: korak koji ispiše Čš ✔ vraća točno taj izlaz (kod 0)",
              r15.get("stanje") == "ok" and r15.get("izlaz") == chr(268) + chr(353) + " " + chr(10004),
              (r15.get("stanje"), r15.get("kod"), r15.get("izlaz"), (r15.get("greska") or "")[-120:]))

    # ── kvarovi iz audita Znahor ─────────────────────────────────────────
    # 98: profil bez format.odlomak je granica (kod 3), ne pad (kod 2)
    import json as _json
    with tempfile.TemporaryDirectory() as d:
        prof = os.path.join(d, "p.json")
        with open(prof, "w", encoding="utf-8") as fh:
            _json.dump({"slug": "test", "format": {"velicina_pt": 12}}, fh)
        from docx import Document
        rad = os.path.join(d, "r.docx")
        dd = Document(); dd.add_paragraph("Tekst rada u jednom odlomku."); dd.save(rad)
        izlaz_cp = subprocess.run(
            [sys.executable, os.path.join(SCRIPTS, "check_paragraphs.py"), rad,
             "--profil", prof], capture_output=True, text=True, encoding="utf-8", errors="replace")
        check("Z1: profil bez format.odlomak daje kod 3 (preskoceno), ne 2",
              izlaz_cp.returncode == 3,
              (izlaz_cp.returncode, izlaz_cp.stderr[-160:]))

    # 103: sadržaj odrezan rubom platna
    import provjeri_prikaze as PP
    check("Z2: _rub_odrezan postoji", callable(getattr(PP, "_rub_odrezan", None)))
    from PIL import Image
    cist = Image.new("RGB", (40, 40), "white")
    check("Z2: bijelo platno nije odrezano", PP._rub_odrezan(cist) == {}, "")
    odrezan = Image.new("RGB", (40, 40), "white")
    for y in range(40):
        odrezan.putpixel((0, y), (0, 0, 0))
    check("Z2: crni stupac na lijevom rubu JEST nalaz",
          "lijevo" in PP._rub_odrezan(odrezan), PP._rub_odrezan(odrezan))

    proslo = sum(1 for _, ok, _ in REZULTATI if ok)
    print("=" * 66)
    print(f"GATE TESTOVI: {proslo}/{len(REZULTATI)} prošlo")
    print("=" * 66)
    for naziv, ok, detalj in REZULTATI:
        print(f"  {'✓' if ok else '✗ FAIL':8} {naziv}")
        if not ok and detalj is not None:
            print(f"           detalj: {detalj}")
    return 0 if proslo == len(REZULTATI) else 1


if __name__ == "__main__":
    sys.exit(main())
