# Citatni spec: unidu-harvard (outcome: style-pin, status: draft)

Stil: **Harvard (sluzbene upute Odjela za komunikologiju, unidu)** (token `harvard`)
Izvor: Upute za izradu diplomskog rada (2025), Odjel za komunikologiju (Sveuciliste u Dubrovniku) (`unidu-komunikologija-upute-2025`)
Snapshot: `data/sources/unidu/unidu-komunikologija-upute-2025.pdf` (hash `0ffa9c114e9d...`)

## STYLE-PIN dokaz  [str. 7] (rule-text)
Otvori PDF: `data/sources/unidu/unidu-komunikologija-upute-2025.pdf#page=7`
```
PIN     : izvor propisuje stil "harvard" -> format ostaje obiteljski motor
QUOTE   : Studenti trebaju koristiti harvardski stil citiranja literature i to u: citatima u tekstu,   [grep: OK]
```

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs unidu-harvard "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
