# Citatni spec: grf (outcome: custom-spec, status: verified)

Stil: **GRF numericki stil (sluzbene upute za zavrsni rad)** (token `grf`)
Izvor: Upute za izradu zavrsnog rada (Graficki fakultet Sveucilista u Zagrebu) (`grf-upute-zavrsni`)
Snapshot: `data/sources/grf/grf-upute-zavrsni.pdf` (hash `fb5934de22d9...`)

## knjiga  [str. 5] (derived)
Otvori PDF: `data/sources/grf/grf-upute-zavrsni.pdf#page=5`
```
TEMPLATE: {authors}, {title},[[ {publisher},]] {place}, {year}.
QUOTE   : za knjige   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Primjer izvora pod 'za knjige' zapravo prikazuje prilog u uredjenoj knjizi (u DAAAM International Scientific Book, (B. Katalini, ur.)) pa je mapiran na tip poglavlje. Samostalna monografija je IZVEDENA ispustanjem 'u {container}, ({editor}, ur.)' i stranica; izdavac u primjeru izvora nije prikazan (samo mjesto i godina) pa je opcionalan. Potvrditi pri verifikaciji.
```

## poglavlje  [str. 5] (worked-example)
Otvori PDF: `data/sources/grf/grf-upute-zavrsni.pdf#page=5`
```
TEMPLATE: {authors}, {title}, u {container}, ({editor}, ur.), {place}, {year}.[[ {pages}.]]
QUOTE   : 1. D. Babi, D. Jureci, A.Tomas, Interakcije u doradnom procesu kao rezultat   [grep: OK]
IZVOR   : D. Babi, D. Jureci, A. Tomas, Interakcije u doradnom procesu kao rezultat plastificiranja digitalno otisnutih araka, u DAAAM International Scientific Book, (B. Katalini, ur.), Vienna, 2006. 1-8.
RENDER  : D. Babi, D. Jureci, A. Tomas, Interakcije u doradnom procesu kao rezultat plastificiranja digitalno otisnutih araka, u DAAAM International Scientific Book, (B. Katalini, ur.), Vienna, 2006. 1-8.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Cijeli primjer (spojeni redci): D. Babi, D. Jureci, A.Tomas, Interakcije u doradnom procesu kao rezultat plastificiranja digitalno otisnutih araka, u DAAAM International Scientific Book, (B. Katalini, ur.), Vienna, 2006. 1-8. U ekstrakciji iza naslova stoji zaostali zavrsni navodnik (araka") pa je naslov priloga u izvorniku vjerojatno pod navodnicima, otvoreni navodnik izgubljen u ekstrakciji; predlozak radi bez navodnika, potvrditi pri verifikaciji. Vodeci redni broj (1.) je numeracija popisa, ne dio natuknice. U expected je rekonstruiran razmak 'A. Tomas' (ekstrakcija ima 'A.Tomas'; svi ostali autori u istom popisu imaju razmak iza inicijala pa je gubitak razmaka pdftotext artefakt); potvrditi u PDF-u.
```

## clanak  [str. 5] (worked-example)
Otvori PDF: `data/sources/grf/grf-upute-zavrsni.pdf#page=5`
```
TEMPLATE: {authors}, {container}, {volume} ({year}), {pages}.
QUOTE   : 3. V.D. Stankovi, M. Gojo, Surf. Coat. Technol., 81 (1996), 225-232.   [grep: OK]
IZVOR   : V.D. Stankovi, M. Gojo, Surf. Coat. Technol., 81 (1996), 225-232.
RENDER  : V.D. Stankovi, M. Gojo, Surf. Coat. Technol., 81 (1996), 225-232.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Casopisni oblik NE sadrzi naslov clanka; naziv casopisa je u primjeru kracen (Surf. Coat. Technol.). Oblik: autori, casopis, godiste (godina), stranice. Vodeci redni broj (3.) je numeracija popisa, ne dio natuknice.
```

## mrezni  [str. 5] (worked-example)
Otvori PDF: `data/sources/grf/grf-upute-zavrsni.pdf#page=5`
```
TEMPLATE: [[{authors}, ]][[{title}, ]]{url}, {accessed}.
QUOTE   : 4. www.heidelberg.com, 11.12.2006.   [grep: OK]
IZVOR   : www.heidelberg.com, 11.12.2006.
RENDER  : www.heidelberg.com, 11.12.2006.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Izvor uz primjer daje i pravilo: 'po redoslijedu citiranja navesti web stranice ili prezime i inicijal imena autora ili naslov citiranog te u nastavku potpunu web adresu i svakako datum posjeta toj web stranici' (str. 5). Autor odnosno naslov su zato opcionalni, URL i datum posjeta obavezni. Vodeci redni broj (4.) je numeracija popisa, ne dio natuknice.
```

## zavrsni  [str. 6] (worked-example)
Otvori PDF: `data/sources/grf/grf-upute-zavrsni.pdf#page=6`
```
TEMPLATE: {authors}, {title}, diplomski rad, {institution}, {place}, {year}.
QUOTE   : 5. P. Pavici, Utjecaj gume na okolis, doktorska disertacija, (odnosno magistarski rad,   [grep: OK]
IZVOR   : P. Pavici, Utjecaj gume na okolis, diplomski rad, Graficki fakultet Sveucilista u Zagrebu, Zagreb, 1999.
RENDER  : P. Pavici, Utjecaj gume na okolis, diplomski rad, Graficki fakultet Sveucilista u Zagrebu, Zagreb, 1999.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer izvora je doktorska disertacija: P. Pavici, Utjecaj gume na okolis, doktorska disertacija, Graficki fakultet Sveucilista u Zagrebu, Zagreb, 1999. Izvor izricito dopusta zamjenu oznake vrste rada ('odnosno magistarski rad, diplomski rad'); alat koristi varijantu 'diplomski rad' kao default. Vodeci redni broj (5.) je numeracija popisa, ne dio natuknice.
```

## propis  [str. 6] (derived)
Otvori PDF: `data/sources/grf/grf-upute-zavrsni.pdf#page=6`
```
TEMPLATE: {title}, {container}, {issue}.
QUOTE   : U literaturu se ne uvrstavaju skripta, biljeske s predavanja, upute proizvoaca, pro-   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor IZRICITO ISKLJUCUJE pravilnike i propise iz popisa literature ('U literaturu se ne uvrstavaju ... pravilnici i propisi'). Predlozak (naslov, glasilo, broj) je minimalno izveden po uzoru na zarezom odvojene natuknice izvora, samo radi potpunosti alata; na stranici alata navesti da GRF propise ne uvrstava u literaturu. Potvrditi pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- PRIOR iz profila je 'ieee', ali izvor propisuje vlastiti numericki format koji nije IEEE (clanak bez naslova rada, autori bez 'and', vlastita interpunkcija); slijedjen je izvor pa je ishod custom-spec, ne style-pin ieee.
- Tocan oblik oznake u tekstu nije prikazan u ekstrakciji ('oznaka za biljesku', str. 6); bracket-number je pretpostavka u skladu s priorom ieee i numeracijom po redoslijedu citiranja, potvrditi pri verifikaciji.
- Primjer izvora pod 'za knjige' je prilog u uredjenoj knjizi (u ..., (ur.)) pa je mapiran na tip poglavlje; samostalna knjiga je izvedena (derived).
- Izvor ima i zaseban oblik 'za zbornike' (autori, naziv zbornika / (urednik, ur.), mjesto, godina, stranice, BEZ naslova priloga) koji se ne mapira cisto ni na jedan od 6 tipova alata; najblizi je poglavlju.
- Izvor izricito iskljucuje pravilnike i propise iz popisa literature; tip propis je izveden samo radi potpunosti alata.
- U primjeru za poglavlje iza naslova stoji zaostali zavrsni navodnik (araka"), vjerojatno je naslov u izvorniku pod navodnicima a otvoreni navodnik je izgubljen u ekstrakciji; predlosci rade bez navodnika, potvrditi pri verifikaciji.
- Primjer za zavrsni rad je doktorska disertacija; izvor izricito dopusta oznake 'magistarski rad' i 'diplomski rad', alat koristi 'diplomski rad'.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `fb5934de22d9...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs grf "Daniel Risavi"`.
