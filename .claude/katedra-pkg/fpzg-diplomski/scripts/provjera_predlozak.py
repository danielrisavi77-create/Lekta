#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PREDLOŽAK neovisne provjere brojki.

Pravilo: svaka brojka koja stoji u radu mora se dati izračunati **iz sirovih
podataka, drugim kodom** od onoga koji ju je proizveo. Ponovno pokretanje iste
analize ne dokazuje ništa — dokazuje samo da je skripta determinističa.

U radu na kojemu je ovaj predložak nastao taj je postupak uhvatio:
  · postotak koji u podacima uopće nije postojao (89,3 % umjesto 77,9 %),
  · regionalni udio kriv za 25 postotnih bodova,
  · medijan naveden kao 4 umjesto 3,
  · broj ispitanika prepisan iz sirovog umjesto iz analitičkog uzorka.

Nijedan od njih ne bi bio primijećen čitanjem.

Kako se koristi:
  1. prepiši TVRDNJE tako da lijevo stoji vlastiti izračun, desno ono što PIŠE
     u radu (prepisano rukom iz teksta, ne učitano iz nalazi.json),
  2. pokreni; izlazni kod 1 znači da se nešto ne poklapa,
  3. nijedno odstupanje ne rješava se zaokruživanjem tolerancije.
"""
import sys

import pandas as pd

TOLERANCIJA = 0.02          # apsolutno odstupanje koje se prihvaća kao zaokruživanje

# ── 1. učitaj SIROVE podatke, ne međurezultate ──────────────────────────────
SIROVO = "anketa_sirovo.csv"
d = pd.read_csv(SIROVO)

# ── 2. ponovi čišćenje uzorka nezavisno ─────────────────────────────────────
# Namjerno se ne uvozi funkcija iz analize; postupak se prepisuje iz opisa u
# poglavlju o metodologiji. Ako se opis i kod razilaze, to je nalaz.
# primjer:
# d = d[d["S1..."] == "Da"]
# d = d[d["S2..."] == "Da"]
# d = d[d["S3..."].str.startswith("Da")]
# d = d[d[KONTROLNA] == "3 (Ponekad)"]

N = len(d)

# ── 3. izračunaj sve što se u radu tvrdi ────────────────────────────────────
# primjer:
# udio_nedovoljno = (d[OBRAZOVANJE].isin(["Uopće ne", "Uglavnom ne"])).mean() * 100

# ── 4. usporedi s onim što DOSLOVNO piše u radu ─────────────────────────────
TVRDNJE = {
    # "opis":            (izracunato,        u_radu),
    # "N analitički":    (N,                 131),
    # "obrazovanje nedovoljno %": (udio_nedovoljno, 77.9),
}

if not TVRDNJE:
    sys.exit("TVRDNJE je prazan — predložak treba popuniti prije pokretanja.")

lose = 0
for opis, (izr, u_radu) in TVRDNJE.items():
    ok = abs(float(izr) - float(u_radu)) <= TOLERANCIJA
    print(f"{'✅' if ok else '❌'} {opis:<34} izračunato={izr!s:<10} u radu={u_radu}")
    lose += not ok

print()
print("✅ SVE BROJKE POTVRĐENE NEOVISNIM IZRAČUNOM" if not lose
      else f"❌ {lose} ODSTUPANJA — ispravi RAD, ne toleranciju")
sys.exit(1 if lose else 0)
