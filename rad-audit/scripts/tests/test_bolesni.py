#!/usr/bin/env python3
"""Test koji traži da audit PADNE.

Zašto postoji
-------------
`test_all.py` mjeri da alat ne prijavljuje lažne nalaze nad zdravim tekstom.
To je pola posla. Suite bez ovog testa može biti 100/100 i istovremeno ne
hvatati ništa: dovoljno je da svaka provjera vrati praznu listu.

Ovdje je obrnut smjer. `bolesni_rad.docx` nosi po jedan primjerak svake klase
pogreške koju lanac tvrdi da hvata. Test pada ako:
  * audit vrati izlazni kod 0 (rad s deset pogrešaka „prošao"),
  * bilo koja posijana klasa nije prisutna u nalazima,
  * faza se nije izvela, a ukupna ocjena je ostala čista.

Kad se doda nova provjera, ovamo ide nova posijana pogreška. Kad neka klasa
ostane nepokrivena, to se vidi ODMAH, kao crveni test, a ne na tuđem radu.

Uporaba:  python3 tests/test_bolesni.py
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(HERE)
sys.path.insert(0, SCRIPTS)
sys.path.insert(0, HERE)

import bolesni_rad  # noqa: E402

# klasa → podniz koji se MORA pojaviti u nekom retku nalaza
OCEKIVANO = {
    "citat bez reference": ["citat bez reference"],
    "siroče u popisu literature": ["siročad", "sirocad"],
    "nesuglasna veličina uzorka": ["ista imenica, različiti brojevi"],
    "zbroj kategorija bez uputnice": ["bez uputnice u rečenici"],
    "radna oznaka [TREBA IZVOR]": ["treba izvor"],
    "duga crtica": ["duga crtica"],
    "nedosljedan postotak": ["postotak nedosljedno"],
    "tri točke umjesto trotočke": ["tri točke umjesto trotočke"],
    "ravni navodnici": ["ravni navodnici"],
    "x kao znak množenja": ["kao množenje"],
}

prosli, pali = 0, []


def tvrdi(uvjet, opis):
    global prosli
    if uvjet:
        prosli += 1
        print(f"  ✓ {opis}")
    else:
        pali.append(opis)
        print(f"  ✗ {opis}")


def main() -> int:
    radni = tempfile.mkdtemp(prefix="bolesni-")
    docx = bolesni_rad.sagradi(os.path.join(radni, "bolesni_rad.docx"))
    izvjestaj = os.path.join(radni, "izvjestaj.json")

    r = subprocess.run(
        [sys.executable, os.path.join(SCRIPTS, "generate_report.py"), docx,
         "--out", os.path.join(radni, "izvjestaj.md"), "--json", izvjestaj],
        capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=SCRIPTS)

    print("BOLESNI RAD — audit mora pasti")
    print("=" * 56)
    tvrdi(r.returncode != 0,
          f"generate_report vraća ≠ 0 na radu s pogreškama (dobiveno {r.returncode})")

    if not os.path.exists(izvjestaj):
        print("  ✗ izvještaj nije napisan — dalje se ne može provjeriti")
        return 1

    with open(izvjestaj, encoding="utf-8") as fh:
        d = json.load(fh)
    redci = [f["line"].lower()
             for v in d["findings"].values() for f in v]
    spojeno = "\n".join(redci)

    for klasa, tragovi in OCEKIVANO.items():
        tvrdi(any(t.lower() in spojeno for t in tragovi),
              f"nalaz sadrži klasu: {klasa}")

    # Kod 3 je deklarirana granica (fixture nema poglavlje „Rasprava"), ne pad.
    pali = [n for n, k in d["phase_exit_codes"].items() if k >= 2 and k != 3]
    tvrdi(not pali, f"nijedna faza se nije srušila na ovom fixtureu ({pali})")

    # ── negativna kontrola ────────────────────────────────────────────────
    # Bez ovoga bi test prolazio i da svaka provjera prijavljuje sve, uvijek.
    zdravi = bolesni_rad.sagradi_zdravi(os.path.join(radni, "zdravi_rad.docx"))
    izvjestaj_z = os.path.join(radni, "zdravi.json")
    rz = subprocess.run(
        [sys.executable, os.path.join(SCRIPTS, "generate_report.py"), zdravi,
         "--out", os.path.join(radni, "zdravi.md"), "--json", izvjestaj_z],
        capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=SCRIPTS)
    with open(izvjestaj_z, encoding="utf-8") as fh:
        dz = json.load(fh)
    kriticni_z = dz["findings"]["kritično"]
    tvrdi(rz.returncode == 0 and not kriticni_z,
          "negativna kontrola: zdravi rad prolazi bez kritičnih nalaza "
          f"(kod {rz.returncode}, kritičnih {len(kriticni_z)})")

    # ── tipovi rada koje sintetički fixture ne pokriva ────────────────────
    # Kvar 91: pravni rad (fusnotni aparat) i tehnički rad (formule, jedinice)
    # ruše i pale drukčije provjere od teorijskoga i empirijskoga. Oba fixturea
    # su ČISTA: nijedan ne smije proizvesti kritični nalaz.
    fiks = os.path.join(HERE, "fixtures")
    for ime, dopusteno_kozmeticko in [("pravni.docx", 0), ("tehnicki.docx", 1)]:
        put = os.path.join(fiks, ime)
        if not os.path.exists(put):
            tvrdi(False, f"fixture nedostaje: {ime}")
            continue
        izl = os.path.join(radni, ime + ".json")
        subprocess.run(
            [sys.executable, os.path.join(SCRIPTS, "generate_report.py"), put,
             "--out", os.path.join(radni, ime + ".md"), "--json", izl],
            capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=SCRIPTS)
        with open(izl, encoding="utf-8") as fh:
            dd = json.load(fh)
        tvrdi(dd["counts"]["kritično"] == 0,
              f"čist {ime}: nula kritičnih nalaza "
              f"(dobiveno {dd['counts']['kritično']}: "
              f"{[x['line'][:70] for x in dd['findings']['kritično']]})")
        tvrdi(dd["counts"]["kozmetičko"] <= dopusteno_kozmeticko,
              f"čist {ime}: najviše {dopusteno_kozmeticko} kozmetičkih "
              f"(dobiveno {dd['counts']['kozmetičko']})")

    print("=" * 56)
    print(f"REZULTAT: {prosli}/{prosli + len(pali)} prošlo")
    if pali:
        print("\nNEPOKRIVENE KLASE (audit ih ne hvata):")
        for p in pali:
            print(f"  • {p}")
        print("\nSvaka od njih znači da rad s tom pogreškom prolazi do predaje.")
    return 1 if pali else 0


if __name__ == "__main__":
    sys.exit(main())
