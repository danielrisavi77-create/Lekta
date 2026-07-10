# Citatni spec: pvzg (outcome: style-pin, status: draft)

Stil: **Harvard (Pravilnik o zavrsnom radu PVZG)** (token `harvard`)
Izvor: Pravilnik o zavrsnom radu, Poslovno veleuciliste Zagreb (2018) (`pvzg-pravilnik-zavrsni-2018`)
Snapshot: `data/sources/pvzg/pvzg-pravilnik-zavrsni-2018.pdf` (hash `c91b7f287351...`)

## STYLE-PIN dokaz  [str. 8] (rule-text)
Otvori PDF: `data/sources/pvzg/pvzg-pravilnik-zavrsni-2018.pdf#page=8`
```
PIN     : izvor propisuje stil "harvard" -> format ostaje obiteljski motor
QUOTE   : navoditi izvore prema harvardskome ili europskome citatnome stilu kako je navedeno u   [grep: OK]
```

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs pvzg "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
