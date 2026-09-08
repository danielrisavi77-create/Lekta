#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testovi za katedra/scripts/kvar.py — registar kvarova.

Skill `katedra` do sada nije imao nijedan test, a njegovi alati čuvaju registar
brojeva na koji se pozivaju svi ostali skillovi. Kvar 116 je nastao točno ondje:
naslov u tuđem obliku alat nije vidio, pa je „sljedeći slobodan" pokazivao na
broj koji je već potrošen.
"""
import contextlib
import importlib.util
import io
import os
import sys
import tempfile

TU = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(TU)

_spec = importlib.util.spec_from_file_location("kvar", os.path.join(SCRIPTS, "kvar.py"))
kvar = importlib.util.module_from_spec(_spec)
sys.path.insert(0, SCRIPTS)
_spec.loader.exec_module(kvar)

PALO = []
SVE = []


def check(naziv, uvjet, detalj=""):
    # Kvar 125: broj u izvještaju mora se BROJATI, ne tvrditi. Ukovana
    # konstanta („%d/%d" % (6 - len(PALO), 6)) razmakne se čim se doda
    # provjera, i onda suite javlja 6/6 dok ih je pokrenuo sedam. Taj broj
    # čita `zakrpa.py --provjeri-tvrdnje`, pa laž putuje dalje.
    SVE.append(naziv)
    print("  %-8s %s" % ("✓" if uvjet else "✗ FAIL", naziv))
    if not uvjet:
        PALO.append(naziv)
        if detalj:
            print("           detalj: %r" % (detalj,))


def katalog(sadrzaj):
    p = os.path.join(tempfile.mkdtemp(), "zamke.md")
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(sadrzaj)
    return p


TIJELO = "\nMjereno: 5 od 7.\n\n```\nizlaz koji kvar pokazuje\n```\n\n" + ("prozni opis mehanizma. " * 20) + "\n"
ZAGLAVLJE = "# Katalog\n\n"


def main():
    print("=" * 70)
    print("TESTOVI kvar.py")
    print("=" * 70)

    # R42: naslov u tuđem obliku je tvrdi nalaz, ne tišina
    p = katalog(ZAGLAVLJE + "## 1. prvi" + TIJELO + "\n## Kvar 2 — drugi" + TIJELO)
    tekst = open(p, encoding="utf-8").read()
    check("R42: tuđi oblik naslova se prepoznaje", len(kvar.tudji_naslovi(tekst)) == 1,
          kvar.tudji_naslovi(tekst))
    check("R42: takav katalog ne prolazi provjeru", kvar.provjeri(p) == 1)

    # R42b: raspon u tuđem obliku također
    p2 = katalog(ZAGLAVLJE + "## 1. prvi" + TIJELO + "\n## Kvarovi 2–4 — drugi" + TIJELO)
    check("R42: tuđi oblik s rasponom se prepoznaje",
          len(kvar.tudji_naslovi(open(p2, encoding="utf-8").read())) == 1)

    # R43: --popravi-naslove prevodi i time katalog postaje ispravan
    n = kvar.popravi_naslove(p2)
    tekst2 = open(p2, encoding="utf-8").read()
    check("R43: popravi_naslove prevodi raspon", n == 1 and "## 2–4. drugi" in tekst2,
          tekst2[:80])
    check("R43: poslije popravka katalog prolazi", kvar.provjeri(p2) == 0)
    check("R43: unos s rasponom pokriva sve brojeve",
          kvar.unosi(tekst2)[-1][1] == 4, kvar.unosi(tekst2)[-1][:2])

    # R43b: ispravan katalog se ne dira
    p3 = katalog(ZAGLAVLJE + "## 1. prvi" + TIJELO)
    prije = open(p3, encoding="utf-8").read()
    check("R43: ispravan katalog popravak ne mijenja",
          kvar.popravi_naslove(p3) == 0 and open(p3, encoding="utf-8").read() == prije)

    # R44 (kvar 151): meka provjera pita pokazuje li unos išta, a ne kojim oblikom
    # markdowna. Stara je tražila ograđen blok i ASCII znamenku, pa je na tri
    # kataloga dala 30 zastavica od kojih je 29 stajalo na unosima s mehanizmom,
    # popravkom i dokazom. Ovdje se svaki oblik dokaza koji kuća stvarno piše mjeri
    # zasebno, i uz svaki stoji unos koji doista ne pokazuje ništa — inače bi se
    # provjera dala „popraviti" tako da više nikad ne pukne.
    def zastavice(tijelo):
        p = katalog(ZAGLAVLJE + "## 1. naslov\n" + tijelo + "\n")
        vrecica = io.StringIO()
        with contextlib.redirect_stdout(vrecica):
            kvar.provjeri(p)
        return [r.strip()[2:].strip() for r in vrecica.getvalue().splitlines()
                if r.startswith("   · ")]

    # 330 znakova: iznad praga 250, ali ISPOD starih 400 — inače vraćanje praga
    # na 400 ne obori nijednu ogradu i mutacija tiho prođe (izmjereno).
    DUGO = "prozni opis mehanizma i popravka. " * 10
    check("R44: gola pritužba (bez broja i bez dokaza) se javlja",
          any("ne pokazuje ništa" in x for x in zastavice(DUGO)), zastavice(DUGO))
    check("R44: inline kod je dokaz, iako nije ograđen blok",
          not any("ne pokazuje" in x for x in zastavice(DUGO + "vrijednost `w:line` je kriva.")),
          zastavice(DUGO + "vrijednost `w:line` je kriva."))
    check("R44: tablica je dokaz",
          not any("ne pokazuje" in x for x in zastavice(DUGO + "\n| a | b |\n| - | - |\n")),
          zastavice(DUGO + "\n| a | b |\n| - | - |\n"))
    check("R44: doslovno citirana poruka alata je dokaz",
          not any("ne pokazuje" in x for x in zastavice(DUGO + "alat javi \u201eprored je fiksan\u201c i stane.")),
          zastavice(DUGO + "alat javi \u201eprored je fiksan\u201c i stane."))
    check("R44: ograđen blok je i dalje dokaz",
          not any("ne pokazuje" in x for x in zastavice(DUGO + "\n```\nizlaz\n```\n")),
          zastavice(DUGO + "\n```\nizlaz\n```\n"))
    # Kvar 151 je nastao baš na ovome: `#fcfcfb` naspram `#ffffff` je mjera, a u
    # njoj nema nijedne ASCII znamenke.
    # Bez backtickova: da mjeru drži BROJKA, a ne inline dokaz. S backtickovima
    # unos prolazi i sa starom BROJKA, pa mutacija ne bi pala.
    HEX = DUGO + "podloga je #ffffff, a validator uzima #fcfcfb."
    check("R44: heksadecimalna vrijednost bez znamenke je mjera",
          not any("ne pokazuje" in x for x in zastavice(HEX)), zastavice(HEX))
    # Prag duljine: pokazivač na drugi dokument pada, potpun kratak unos ne.
    check("R44: unos ispod praga (pokazivač) se javlja kao kratak",
          any("kratak unos" in x for x in zastavice("Vidi `brojke.md`. Nalaz 31,5 % naspram 31,4 %.")),
          zastavice("Vidi `brojke.md`. Nalaz 31,5 % naspram 31,4 %."))
    check("R44: potpun unos od 250+ znakova nije kratak",
          not any("kratak unos" in x for x in zastavice(DUGO)), zastavice(DUGO))

    print("=" * 70)
    print("REZULTATI TESTOVA: %d/%d prošlo"
          % (len(SVE) - len(PALO), len(SVE)))
    print("=" * 70)
    return 1 if PALO else 0


if __name__ == "__main__":
    sys.exit(main())
