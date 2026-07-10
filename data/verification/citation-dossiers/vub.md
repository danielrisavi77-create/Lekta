# Citatni spec: vub (outcome: style-pin, status: draft)

Stil: **Vancouver (sluzbene upute VUB)** (token `vancouver`)
Izvor: Upute za izradu diplomskog rada (Veleuciliste u Bjelovaru) (`vub-upute-diplomski-2025`)
Snapshot: `data/sources/vub/vub.pdf` (hash `bd6702cb3ca7...`)

## STYLE-PIN dokaz  [str. 13] (rule-text)
Otvori PDF: `data/sources/vub/vub.pdf#page=13`
```
PIN     : izvor propisuje stil "vancouver" -> format ostaje obiteljski motor
QUOTE   : Citirati relevantne studije koristei odgovarajui citatni stil (npr. Vancouver).   [grep: OK]
```

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs vub "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
