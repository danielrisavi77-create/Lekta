# Citatni spec: fmtu-chicago-author (outcome: style-pin, status: draft)

Stil: **Chicago autor-datum sustav (sluzbene upute FMTU)** (token `chicago-author`)
Izvor: Upute za prijavu, izradu, predaju i obranu zavrsnog rada na sveucilisnom prijediplomskom studiju (FMTU Opatija) (`fmtu-upute-zavrsni-2025`)
Snapshot: `data/sources/fmtu/fmtu-upute-zavrsni-2025.pdf` (hash `700b66c3100a...`)

## STYLE-PIN dokaz  [str. 2] (rule-text)
Otvori PDF: `data/sources/fmtu/fmtu-upute-zavrsni-2025.pdf#page=2`
```
PIN     : izvor propisuje stil "chicago-author" -> format ostaje obiteljski motor
QUOTE   : 8.8.1. Chicago stil � Bibliografski sustav i Autor-datum sustav (primjeri)   [grep: OK]
```

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs fmtu-chicago-author "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
