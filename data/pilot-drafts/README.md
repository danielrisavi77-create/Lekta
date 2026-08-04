# Nacrti pravila iz pilota (NISU u zivom putu)

Ovdje je nusprodukt pilota od 2026-08-04: 116 nacrta asistiranih pravila za pet ustanova
(unizd, ffzg, ffri, efzg, pmf), izvedenih iz vec snapshotiranih sluzbenih uputa u
`data/sources/<unitId>/`.

## Zasto NISU u `data/profiles/<unit>/drafts/`

Ondje ih `src/profiles/drafts-runtime.ts` ucitava preko `import.meta.glob`, pa bi odmah usli u
sustav i pomaknuli coverage (drift guard u `tests/coverage-report.test.ts` to je i uhvatio).
Nijedan od ovih nacrta nije prosao ljudsku verifikaciju, pa ondje nemaju sto raditi.

## Sto se zna o njihovoj kvaliteti

Provjereno je 10 od 116 (adversarijalna provjera nad prva dva nacrta po ustanovi) i **svih 10 je
odbaceno**. Razlozi, po ucestalosti:

1. **Izvor je preporuka, ne obveza.** Svih pet ustanova ima izricitu ogradu, npr.
   "Predstavljaju samo jednu od vise mogucnosti" (unizd), "Ova je brosura koncipirana kao
   podsjetnik i prirucni savjetnik" (ffri), "Preporucuje se ... harvardskim stilom" (efzg).
   Takvo pravilo smije se nuditi kao preporuka, ali NE smije se bodovati.
2. **Vrijednost ne slijedi doslovno iz izvora** nego je izvedena zakljuckom.
3. **Netocna stranica** u navodu.
4. **Grupiranje prije abecede**: vise uputa trazi popis po skupinama (knjige, clanci, propisi,
   mrezni izvori) pa tek onda abecedno, a `bibliography-rules.sort` to ne moze izraziti.

Uzorak od 10 je premalen i pristran (uvijek prva dva nacrta), pa se iz njega NE smije zakljuciti
da su svi losi. Prava stopa prihvacanja jos nije izmjerena.

## Sto treba prije nego ijedan udje u `data/profiles/`

1. Puna provjera, ne uzorak: svaki nacrt kroz skeptika koji otvara PDF i provjerava doslovnost
   citata i tocnost stranice.
2. Svakom preziljelom nacrtu `scored: false` i `status: 'ai-confirmed'`, jer su izvori preporuke
   (isti postupak kao `legal-footnote-repair-rules` za pravo, commit 3e279ae).
3. Ljudski pass prije `status: 'verified'`.

Vidi i `docs/REAL_CORPUS_TESTING.md` i granicu u `CLAUDE.md` ("Dopusteno bez fakultetskog
pravila (preporuke)").
