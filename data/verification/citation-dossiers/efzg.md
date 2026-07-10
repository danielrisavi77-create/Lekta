# Citatni spec: efzg (outcome: style-pin, status: draft)

Stil: **Harvard stil (sluzbene upute EFZG za zavrsni rad)** (token `harvard`)
Izvor: Postupak prijave, izrade i obrane zavrsnog rada na preddiplomskom sveucilisnom studiju (EFZG) (`efzg-postupak-zavrsni`)
Snapshot: `data/sources/efzg/efzg-postupak-zavrsni.pdf` (hash `0807863ff289...`)

## STYLE-PIN dokaz  [str. 2] (rule-text)
Otvori PDF: `data/sources/efzg/efzg-postupak-zavrsni.pdf#page=2`
```
PIN     : izvor propisuje stil "harvard" -> format ostaje obiteljski motor
QUOTE   : ispravno citirati. Preporucuje se na tue radove upuivati harvardskim stilom navoenja literature.   [grep: OK]
```

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs efzg "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
