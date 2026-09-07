# Katedra ↔ rad-audit contract v1

Ovo je jedina podržana granica između Katedre i zasebnog `rad-audit` skilla.
Katedra **ne inspecta source kod motora** i ne zaključuje kompatibilnost iz imena
funkcija, regexa ili sadržaja Python datoteka.

## 1. Engine manifest

Motor u svojem `scripts/` direktoriju izlaže `engine_contract.json`:

```json
{
  "contract_version": "1",
  "engine": "rad-audit",
  "engine_version": "2.0.0",
  "capabilities": [
    "audit.report-json.v1",
    "phase.A",
    "phase.B",
    "phase.C",
    "phase.E",
    "phase.F",
    "hr.citations.author-year.v1",
    "hr.typography.numbers.v1",
    "safe-fixes.preserve-page-breaks.v1"
  ],
  "entrypoints": {
    "audit": "generate_report.py",
    "phases": {
      "A": "check_fields.py",
      "B": "check_citations_authoryear.py",
      "C": "numbers_inventory.py",
      "E": "check_typography.py",
      "F": "check_fields.py"
    }
  }
}
```

Katedra v1 contract zahtijeva:

- `contract_version = "1"`
- `engine = "rad-audit"`
- capability `audit.report-json.v1`
- `hr.citations.author-year.v1`
- `hr.typography.numbers.v1`
- `safe-fixes.preserve-page-breaks.v1`
- valjan `entrypoints.audit` koji ostaje unutar direktorija motora.

`phase.X` capability potreban je samo kada se ta faza pokreće izravno preko
`engine.py --faza X`.

Nedostajući ili nevaljani manifest znači **incompatible engine (exit 4)**. Katedra
ne pokušava “pogoditi” kompatibilnost čitanjem implementacije motora.

## 2. DocumentAuditResult

Ako Katedra pokrene puni audit s `--json`, motor mora na toj putanji proizvesti
verzionirani `DocumentAuditResult`:

```json
{
  "contract_version": "1",
  "engine": "rad-audit",
  "engine_version": "2.0.0",
  "capabilities": ["audit.report-json.v1"],
  "findings": [],
  "counts": {
    "kritično": 0,
    "srednje": 0,
    "kozmetičko": 0
  },
  "phase_exit_codes": {
    "A": 0,
    "B": 0,
    "C": 0,
    "E": 0,
    "F": 0
  }
}
```

Katedra provjerava da `contract_version`, `engine` i `engine_version` odgovaraju
manifestu te da su `capabilities`, `findings`, `counts` i `phase_exit_codes`
strukturno valjani. Legacy JSON bez contract identiteta **ne interpretira se** kao
pouzdan nalaz.

## 3. Faculty profil nije dio motornog contracta

`--profil` pripada Katedri. Katedra ga koristi za prikaz i kasniju interpretaciju
fakultetskih pravila, ali ga **ne prosljeđuje** `rad-audit` entrypointu.

Podjela ostaje:

> **rad-audit provjerava dokument, Katedra provjerava rad.**
