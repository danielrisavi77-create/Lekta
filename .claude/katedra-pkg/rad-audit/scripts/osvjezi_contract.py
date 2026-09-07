#!/usr/bin/env python3
"""Uskladi engine_contract.json s otiskom stvarnog koda.

Uporaba:
  python3 osvjezi_contract.py            # provjeri (izlazni kod 1 ako se razilazi)
  python3 osvjezi_contract.py --upisi    # upiši novi otisak

Zašto postoji
-------------
`engine_version` je sha256 svih skripti motora. Svaka izmjena bilo koje
provjere ga mijenja, a manifest se do sada osvježavao ručno, po bilješci u
references/zamke.md. Kad bi se razišao, Katedra bi po vlastitom ugovoru odbila
rezultat, dok bi `engine.py --provjeri` i dalje javljao ✅ jer čita manifest, a
ne kod: motor tiho ne postoji, a lanac izgleda zdravo.

Ovo se poziva kao zadnji korak test_all.py, pa se razilaženje vidi kao pad
testa u trenutku izmjene, a ne kao tiho nepostojanje audita tjednima kasnije.
"""
import json
import os
import sys

TU = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, TU)

from katedra_adapter import otisak_motora  # noqa: E402

MANIFEST = os.path.join(TU, "engine_contract.json")


def main(argv) -> int:
    upisi = "--upisi" in argv
    with open(MANIFEST, encoding="utf-8") as fh:
        m = json.load(fh)
    zapisano = m.get("engine_version", "")
    stvarno = otisak_motora()
    if zapisano == stvarno:
        print(f"✅ manifest se slaže s kodom: {stvarno}")
        return 0
    print(f"❌ manifest se razišao s kodom")
    print(f"   engine_contract.json: {zapisano}")
    print(f"   stvarni otisak koda:  {stvarno}")
    if not upisi:
        print("   Katedra u MOTOR načinu odbija rezultat s ovim otiskom, a")
        print("   engine.py --provjeri i dalje javlja ✅ jer čita manifest, ne kod.")
        print("   Popravak: python3 osvjezi_contract.py --upisi")
        return 1
    m["engine_version"] = stvarno
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(m, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(f"✅ upisano: {stvarno}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
