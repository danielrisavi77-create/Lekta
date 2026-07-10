# Citatni spec: sfzg (outcome: style-pin, status: draft)

Stil: **Vancouver (ICMJE, sluzbene upute SFZG)** (token `vancouver`)
Izvor: Naputak za tehnicko oblikovanje i izradu diplomskog rada na Stomatoloskom fakultetu Sveucilista u Zagrebu (`sfzg-naputak-diplomski-2024`)
Snapshot: `data/sources/sfzg/sfzg-naputak-diplomski-2024.pdf` (hash `830c7620b5aa...`)

## STYLE-PIN dokaz  [str. 9] (rule-text)
Otvori PDF: `data/sources/sfzg/sfzg-naputak-diplomski-2024.pdf#page=9`
```
PIN     : izvor propisuje stil "vancouver" -> format ostaje obiteljski motor
QUOTE   : prema International Committee of Medical Journal Editors � ICMJE (ranije Vancouverski stil).   [grep: OK]
```

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs sfzg "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
