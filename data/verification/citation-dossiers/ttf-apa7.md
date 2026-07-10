# Citatni spec: ttf-apa7 (outcome: style-pin, status: draft)

Stil: **APA (7. izdanje) (sluzbene upute TTF)** (token `apa7`)
Izvor: Upute za izradu zavrsnog i diplomskog rada (Tekstilno-tehnoloski fakultet, Sveuciliste u Zagrebu) (`ttf-upute-zavrsni-diplomski`)
Snapshot: `data/sources/ttf/ttf-upute-zavrsni-diplomski.pdf` (hash `a56354fe4ac7...`)

## STYLE-PIN dokaz  [str. 2] (rule-text)
Otvori PDF: `data/sources/ttf/ttf-upute-zavrsni-diplomski.pdf#page=2`
```
PIN     : izvor propisuje stil "apa7" -> format ostaje obiteljski motor
QUOTE   : humanistickom i umjetnickom podrucju APA (7. izdanje) stil referenciranja.   [grep: OK]
```

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs ttf-apa7 "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
