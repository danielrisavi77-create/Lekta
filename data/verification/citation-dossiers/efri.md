# Citatni spec: efri (outcome: style-pin, status: draft)

Stil: **Harvard (sluzbeni pravilnici EFRI)** (token `harvard`)
Izvor: Pravilnik o zavrsnom radu Ekonomskog fakulteta Sveucilista u Rijeci (2014) (`efri-pravilnik-zavrsni-2014`)
Snapshot: `data/sources/efri/efri-pravilnik-zavrsni-2014.pdf` (hash `76d4b8d90d66...`)

## STYLE-PIN dokaz  [str. 2] (rule-text)
Otvori PDF: `data/sources/efri/efri-pravilnik-zavrsni-2014.pdf#page=2`
```
PIN     : izvor propisuje stil "harvard" -> format ostaje obiteljski motor
QUOTE   : za radove istog autora. Za popis kori5tene literature treba koristiti Harvard style.   [grep: OK]
```

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs efri "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
