# Citatni spec: ttf-vancouver (outcome: style-pin, status: draft)

Stil: **Vancouver (sluzbene upute TTF)** (token `vancouver`)
Izvor: Upute za izradu zavrsnog i diplomskog rada (Tekstilno-tehnoloski fakultet, Sveuciliste u Zagrebu) (`ttf-upute-zavrsni-diplomski`)
Snapshot: `data/sources/ttf/ttf-upute-zavrsni-diplomski.pdf` (hash `a56354fe4ac7...`)

## STYLE-PIN dokaz  [str. 2] (rule-text)
Otvori PDF: `data/sources/ttf/ttf-upute-zavrsni-diplomski.pdf#page=2`
```
PIN     : izvor propisuje stil "vancouver" -> format ostaje obiteljski motor
QUOTE   : U podrucju tehnickih znanosti treba koristiti Vancouver stil referenciranja, a u drustvenom,   [grep: OK]
```

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs ttf-vancouver "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
