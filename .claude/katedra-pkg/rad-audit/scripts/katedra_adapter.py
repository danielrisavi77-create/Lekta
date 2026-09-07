#!/usr/bin/env python3
"""Adapter: rad-audit → Katedrin engine contract v1.

ZAŠTO POSTOJI
-------------
rad-audit i katedra razišli su se u verziji ugovora, ne u sposobnostima.
rad-audit u svom SKILL.md-u deklarira: „python3 generate_report.py rad.docx
--json .katedra/nalazi.json je cijeli ugovor" — i taj oblik stvarno proizvodi
`findings`, `counts` i `phase_exit_codes`. Katedrin `rad_audit_contract.py`
(CONTRACT_VERSION = "1") od istog izlaza traži još četiri polja omotnice:
`contract_version`, `engine`, `engine_version` i `capabilities`.

Nedostaje, dakle, samo omotnica. Ovaj adapter je dodaje BEZ diranja
generate_report.py — pozove ga nepromijenjenog, pročita njegov JSON, dopuni
omotnicu i vrati njegov izlazni kod. Time ostaje na snazi Katedrino željezno
pravilo 10 (tuđi se kod ne kopira i ne mijenja) i načelo iz
rad_audit_contract.py: Katedra vjeruje deklariranom ugovoru, ne izvornom kodu.

ŠTO JE PROVJERENO PRIJE NEGO SU SPOSOBNOSTI DEKLARIRANE
-------------------------------------------------------
Sposobnosti u engine_contract.json nisu prepisane iz koda nego potvrđene
IZVOĐENJEM (21. 8. 2026.):

  audit.report-json.v1              generate_report.py --json dao je JSON s
                                    findings/counts/phase_exit_codes
  hr.citations.author-year.v1       tests/test_all.py 63/63, uključujući
                                    skupinu R13 (autor-godina citati i popis)
  hr.citations.vancouver.v1         v1.9: tests/test_all.py skupina R16 +
                                    HKS-FZS rad (75 referenci, 96 citata,
                                    0 siročadi, 0 lažnih kritičnih)
  hr.typography.numbers.v1          isti paket, skupina R8 (tipografija i
                                    brojčani inventar)
  safe-fixes.preserve-page-breaks   apply_safe_fixes.py nad stvarnim radom:
                                    page-break runovi 1→1, sekcije 2→2,
                                    odlomci 69→69, riječi 2050→2050,
                                    render 8→8 stranica

ENGINE_VERSION
--------------
rad-audit ne deklarira verziju u SKILL.md metadata bloku, pa se ovdje ne
izmišlja semantička verzija nego se koristi otisak sadržaja njegovih skripti.
Ako se motor promijeni, otisak se promijeni i ugovor prestaje odgovarati —
što je ispravno ponašanje, a ne smetnja.
"""
from __future__ import annotations

import hashlib
import glob
import json
import os
import subprocess
import sys

TU = os.path.dirname(os.path.abspath(__file__))
CONTRACT_VERSION = "1"
ENGINE = "rad-audit"
CAPABILITIES = [
    "audit.report-json.v1",
    "hr.citations.author-year.v1",
    "hr.citations.vancouver.v1",
    "hr.typography.numbers.v1",
    "safe-fixes.preserve-page-breaks.v1",
    "phase.G",
]


def otisak_motora() -> str:
    h = hashlib.sha256()
    for put in sorted(glob.glob(os.path.join(TU, "*.py"))):
        if os.path.basename(put) == "katedra_adapter.py":
            continue
        with open(put, "rb") as f:
            # Prijelomi retka se normaliziraju prije hashiranja. Git s
            # `core.autocrlf=true` (zadano na Windowsu) piše CRLF u radno stablo,
            # pa je ISTI commit davao dva otiska: 3b6c7a3e na Windowsu i b133a824
            # uz LF. Manifest ispravan na jednoj platformi bio je pogrešan na
            # drugoj, a R22 je time postao lutrija po okolini umjesto provjere
            # slaganja koda i ugovora.
            sadrzaj = f.read().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
            h.update(sadrzaj)
    return "0.0.0-undeclared+" + h.hexdigest()[:8]


def main(argv: list[str]) -> int:
    json_put = None
    if "--json" in argv:
        json_put = argv[argv.index("--json") + 1]

    rc = subprocess.run(
        [sys.executable, os.path.join(TU, "generate_report.py")] + argv,
        cwd=TU,
    ).returncode

    if json_put is None:
        return rc
    if not os.path.isfile(json_put):
        print("adapter: generate_report.py nije proizveo --json datoteku", file=sys.stderr)
        return rc if rc not in (0, 1) else 4

    with open(json_put, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        print("adapter: DocumentAuditResult nije JSON objekt", file=sys.stderr)
        return 4

    data["contract_version"] = CONTRACT_VERSION
    data["engine"] = ENGINE
    data["engine_version"] = otisak_motora()
    data["capabilities"] = list(CAPABILITIES)

    # Druga polovica neusklađenosti verzija: rad-audit `findings` vraća kao
    # RJEČNIK grupiran po težini, a ugovor v1 traži POPIS. Prijevod je čisto
    # preslagivanje oblika — nijedan nalaz se ne gubi ni ne mijenja, a izvorna
    # grupacija ostaje pod `findings_by_severity` da ništa ne bude izgubljeno.
    nalazi = data.get("findings")
    if isinstance(nalazi, dict):
        data["findings_by_severity"] = nalazi
        ravno = []
        for tezina in ("kritično", "srednje", "kozmetičko"):
            for stavka in nalazi.get(tezina, []) or []:
                if isinstance(stavka, dict):
                    zapis = dict(stavka)
                else:
                    zapis = {"line": str(stavka)}
                zapis["severity"] = tezina
                ravno.append(zapis)
        for tezina, stavke in nalazi.items():
            if tezina in ("kritično", "srednje", "kozmetičko"):
                continue
            for stavka in stavke or []:
                zapis = dict(stavka) if isinstance(stavka, dict) else {"line": str(stavka)}
                zapis["severity"] = tezina
                ravno.append(zapis)
        data["findings"] = ravno
    elif not isinstance(nalazi, list):
        data["findings"] = []

    data.setdefault("counts", {})
    data.setdefault("phase_exit_codes", {})
    for k in ("kritično", "srednje", "kozmetičko"):
        data["counts"].setdefault(k, 0)

    with open(json_put, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
