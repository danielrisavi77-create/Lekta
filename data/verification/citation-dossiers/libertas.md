# Citatni spec: libertas (outcome: style-pin, status: draft)

Stil: **Harvard (Pravilnik o diplomskom radu, Libertas)** (token `harvard`)
Izvor: Pravilnik o diplomskom radu (Libertas, srpanj 2024) (`libertas-pravilnik-diplomski-2024`)
Snapshot: `data/sources/libertas/libertas-pravilnik-diplomski-2024.pdf` (hash `38cd29c599d7...`)

## STYLE-PIN dokaz  [str. 4] (rule-text)
Otvori PDF: `data/sources/libertas/libertas-pravilnik-diplomski-2024.pdf#page=4`
```
PIN     : izvor propisuje stil "harvard" -> format ostaje obiteljski motor
QUOTE   : Za citiranje se preporuca koristiti americki (harvardski) stil koji je detaljnije opisan u prilogu   [grep: OK]
```

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs libertas "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
