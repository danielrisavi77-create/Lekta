# Citatni spec: unin-vancouver (outcome: style-pin, status: draft)

Stil: **Vancouver (sluzbene upute UNIN, tehnicke znanosti)** (token `vancouver`)
Izvor: Upute za izradu zavrsnih i diplomskih radova (Sveuciliste Sjever) (`unin-upute-radovi-2026`)
Snapshot: `data/sources/unin/unin-upute.docx` (hash `53d0ff0b8b18...`)

## STYLE-PIN dokaz  [str. 1] (rule-text)
Otvori PDF: `data/sources/unin/unin-upute.docx#page=1`
```
PIN     : izvor propisuje stil "vancouver" -> format ostaje obiteljski motor
QUOTE   : Vancouver stil citiranja u području tehničkih znanosti.   [grep: OK]
```

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs unin-vancouver "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
