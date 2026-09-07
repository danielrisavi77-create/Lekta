# -*- coding: utf-8 -*-
"""Dokaz popravka: ista naredba prije i poslije, oba izlaza ispisana.

Popravak bez dokaza je pretpostavka. Ovaj alat traži ono što se u praksi
preskoči — da se kvar prvo REPRODUCIRA, pa tek onda popravi. Kvar koji se ne da
reproducirati nije dovoljno shvaćen, i popravak mu je pogađanje.

Dva su uobičajena oblika dokaza:

  1. **ista naredba, dva stanja alata** — pokreni prije zakrpe pa poslije;
     očekuje se pad (izlazni kod ≠ 0) pa prolaz.
  2. **isti alat, dva dokumenta** — pokvareni fixture pa ispravljeni rad;
     očekuje se isto: nalaz pa tišina.

    python3 dokaz.py --prije "python3 alat.py pokvareni.docx" \\
                     --poslije "python3 alat.py ispravni.docx"

`--tihi` je za kvarove kod kojih je alat prije LAŽNO PROLAZIO (0 → ≠0).
Bez `--dopusti-isto` alat javlja grešku ako su oba izlazna koda jednaka: to
znači da dokaz ne razlikuje stanja, pa ništa ne dokazuje.
"""
import argparse
import subprocess
import sys


def pokreni(naredba, oznaka):
    print("─" * 72)
    print(f"{oznaka}: {naredba}")
    print("─" * 72)
    r = subprocess.run(naredba, shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
    izlaz = (r.stdout or "") + (r.stderr or "")
    print(izlaz.rstrip() or "(bez izlaza)")
    print(f"[izlazni kod: {r.returncode}]")
    return r.returncode, izlaz


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--prije", required=True, help="naredba koja mora POKAZATI kvar")
    ap.add_argument("--poslije", required=True, help="ista provjera nakon popravka")
    ap.add_argument("--dopusti-isto", action="store_true",
                    help="ne traži razliku u izlaznom kodu (npr. kad se razlika vidi u tekstu)")
    ap.add_argument("--tihi", action="store_true",
                    help="kvar je bio TIHI PROLAZ: očekuje se 0 → ≠0 (alat je prije "
                         "propuštao ono što sad prijavljuje)")
    a = ap.parse_args()

    print("=" * 72)
    print("DOKAZ POPRAVKA")
    print("=" * 72)
    kod_prije, tekst_prije = pokreni(a.prije, "PRIJE")
    print()
    kod_poslije, tekst_poslije = pokreni(a.poslije, "POSLIJE")

    print()
    print("=" * 72)
    if kod_prije == kod_poslije and not a.dopusti_isto:
        print(f"❌ oba stanja daju izlazni kod {kod_prije} — dokaz ne razlikuje stanja")
        print("   Ili kvar nije reproduciran, ili popravak nije primijenjen.")
        print("   Ako se razlika vidi samo u tekstu, dodaj --dopusti-isto i reci u čemu.")
        return 1
    if tekst_prije.strip() == tekst_poslije.strip():
        print("❌ oba stanja daju isti izlaz — nema što dokazati")
        return 1
    if a.tihi:
        if kod_prije == 0 and kod_poslije != 0:
            print(f"✅ dokazan tihi kvar: {kod_prije} → {kod_poslije}")
            print("   Alat je prije šutio nad dokumentom koji sad prijavljuje.")
            print("   Prilijepi oba izlaza uz unos u katalogu kvarova.")
            return 0
        print(f"❌ --tihi očekuje 0 → ≠0, a dobio {kod_prije} → {kod_poslije}")
        print("   Ako popravak ne pretvara lažno zeleno u crveno, to nije tihi kvar.")
        return 1
    if kod_prije == 0 and kod_poslije != 0:
        print(f"⚠ obrnuto od očekivanog: prije prolazi ({kod_prije}), "
              f"poslije pada ({kod_poslije})")
        print("   Ako je kvar bio TIHI PROLAZ — alat je šutio nad dokumentom koji je "
              "trebao prijaviti — to je očekivan smjer: ponovi s --tihi.")
        print("   Inače provjeri jesu li naredbe zamijenjene.")
        return 1
    print(f"✅ dokazano: {kod_prije} → {kod_poslije}")
    print("   Prilijepi oba izlaza uz unos u katalogu kvarova.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
