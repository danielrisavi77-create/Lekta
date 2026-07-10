# Citatni spec: efst (outcome: style-pin, status: verified)

Stil: **Harvard (sluzbene upute EFST)** (token `harvard`)
Izvor: Uputa za izradu studentskih radova (Ekonomski fakultet u Splitu, 2013) (`efst-upute-studentski-radovi-2013`)
Snapshot: `data/sources/efst/efst-upute-studentski-radovi-2013.pdf` (hash `04a74df6eab0...`)

## STYLE-PIN dokaz  [str. 10] (rule-text)
Otvori PDF: `data/sources/efst/efst-upute-studentski-radovi-2013.pdf#page=10`
```
PIN     : izvor propisuje stil "harvard" -> format ostaje obiteljski motor
QUOTE   : izvora u fusnoti2 ili uporabom tzv. Harvardskog stila citiranja. Pravilo o obveznom   [grep: OK]
```

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `04a74df6eab0...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs efst "Daniel Risavi"`.
