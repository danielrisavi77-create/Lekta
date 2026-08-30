# Citatni spec: ttf-apa7 (outcome: style-pin, status: verified)

Stil: **APA (7. izdanje) (službene upute TTF)** (token `apa7`)
Izvor: Upute za izradu završnog i diplomskog rada (Tekstilno-tehnološki fakultet, Sveučilište u Zagrebu) (`ttf-upute-zavrsni-diplomski`)
Snapshot: `data/sources/ttf/ttf-upute-zavrsni-diplomski.pdf` (hash `a56354fe4ac7...`)

## STYLE-PIN dokaz  [str. 2] (rule-text)
Otvori PDF: `data/sources/ttf/ttf-upute-zavrsni-diplomski.pdf#page=2`
```
PIN     : izvor propisuje stil "apa7" -> format ostaje obiteljski motor
QUOTE   : humanističkom i umjetničkom području APA (7. izdanje) stil referenciranja.   [grep: OK]
```

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `a56354fe4ac7...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs ttf-apa7 "Daniel Risavi"`.
