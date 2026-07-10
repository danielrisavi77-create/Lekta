# Citatni spec: fmtu-chicago-notes (outcome: style-pin, status: draft)

Stil: **Chicago bibliografski sustav s fusnotama (sluzbene upute FMTU)** (token `chicago-notes`)
Izvor: Upute za prijavu, izradu, predaju i obranu zavrsnog rada na sveucilisnom prijediplomskom studiju (FMTU Opatija) (`fmtu-upute-zavrsni-2025`)
Snapshot: `data/sources/fmtu/fmtu-upute-zavrsni-2025.pdf` (hash `700b66c3100a...`)

## STYLE-PIN dokaz  [str. 11] (rule-text)
Otvori PDF: `data/sources/fmtu/fmtu-upute-zavrsni-2025.pdf#page=11`
```
PIN     : izvor propisuje stil "chicago-notes" -> format ostaje obiteljski motor
QUOTE   : bibliografske jedinice trebaju biti potpuno i ispravno iskazane (Chicago stil � Bibliografski   [grep: OK]
```

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs fmtu-chicago-notes "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
