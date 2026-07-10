# Citatni spec: efst (outcome: style-pin, status: draft)

Stil: **Harvard (sluzbene upute EFST)** (token `harvard`)
Izvor: Uputa za izradu studentskih radova (Ekonomski fakultet u Splitu, 2013) (`efst-upute-studentski-radovi-2013`)
Snapshot: `data/sources/efst/efst-upute-studentski-radovi-2013.pdf` (hash `04a74df6eab0...`)

## STYLE-PIN dokaz  [str. 10] (rule-text)
Otvori PDF: `data/sources/efst/efst-upute-studentski-radovi-2013.pdf#page=10`
```
PIN     : izvor propisuje stil "harvard" -> format ostaje obiteljski motor
QUOTE   : izvora u fusnoti2 ili uporabom tzv. Harvardskog stila citiranja. Pravilo o obveznom   [grep: OK]
```

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs efst "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
