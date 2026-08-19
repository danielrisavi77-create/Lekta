# Citatni spec: unin-harvard (outcome: style-pin, status: verified)

Stil: **Harvard (službene upute UNIN, društvene znanosti)** (token `harvard`)
Izvor: Upute za izradu završnih i diplomskih radova (Sveučilište Sjever) (`unin-upute-radovi-2026`)
Snapshot: `data/sources/unin/unin-upute.docx` (hash `53d0ff0b8b18...`)

## STYLE-PIN dokaz  [str. 1] (rule-text)
Otvori PDF: `data/sources/unin/unin-upute.docx#page=1`
```
PIN     : izvor propisuje stil "harvard" -> format ostaje obiteljski motor
QUOTE   : Harvard stil citiranja u području društvenih znanosti.   [grep: OK]
```

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `53d0ff0b8b18...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs unin-harvard "Daniel Risavi"`.
