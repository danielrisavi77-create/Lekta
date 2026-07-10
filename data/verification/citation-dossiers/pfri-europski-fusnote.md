# Citatni spec: pfri-europski-fusnote (outcome: custom-spec, status: verified)

Stil: **Europski fusnotni sustav (sluzbene upute PFRI)** (token `europski-fusnote`)
Izvor: Upute za izradu zavrsnog rada (Sveuciliste u Rijeci, Pomorski fakultet, ozujak 2025) (`pfri-upute-zavrsni-2025`)
Snapshot: `data/sources/pfri/pfri-upute-zavrsni-2025.pdf` (hash `2b6ab8d65a52...`)

## knjiga  [str. 19] (worked-example)
Otvori PDF: `data/sources/pfri/pfri-upute-zavrsni-2025.pdf#page=19`
```
TEMPLATE: {authors}: {title}[[, {volume}]], {publisher}, {place}, {year}.
QUOTE   : U literaturi, pisalo bi Zugaj, M.: Osnove znanstvenog i strucnog rada, Zagreb,   [grep: OK]
IZVOR   : Zugaj, M.: Osnove znanstvenog i strucnog rada, Zagreb, Samobor, 1989.
RENDER  : Zugaj, M.: Osnove znanstvenog i strucnog rada, Zagreb, Samobor, 1989.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer je u ekstrakciji prelomljen ('Samobor, 1989.' u sljedecem retku), spojen u expected. Raspodjela 'Zagreb, Samobor' na izdavaca i mjesto je pretpostavljena prema redoslijedu izdavac-mjesto-godina iz jedinice u predgovoru (str. 3: 'Zelenika, R.: Metodologija i tehnologija izrade znanstvenog i strucnog djela, 5. izmijenjeno i dopunjeno izdanje, Ekonomski fakultet Sveucilista u Rijeci, Rijeka, 2011.'); potvrditi pri verifikaciji. Broj izdanja unosi se cijeli u polje volume. Naslov je u izvorniku vjerojatno kurzivom, alat radi plain text.
```

## poglavlje  [str. 20] (derived)
Otvori PDF: `data/sources/pfri/pfri-upute-zavrsni-2025.pdf#page=20`
```
TEMPLATE: {authors}: {title}, u: {container}, {publisher}, {place}, {year}.
QUOTE   : spominju u referencama. Popis literature mora biti potpun, tocan, svaka bibliografska jedinica   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor nema primjer poglavlja ili zbornika u Europskom sustavu (primjeri poglavlja 4.5.2 nisu zahvaceni ekstrakcijom); predlozak izveden iz oblika za knjigu uz izvedenu oznaku 'u:' ispred naslova cjeline. Urednik nije evidentiran u isjeccima pa nije ukljucen. Potvrditi pri verifikaciji.
```

## clanak  [str. 23] (derived)
Otvori PDF: `data/sources/pfri/pfri-upute-zavrsni-2025.pdf#page=23`
```
TEMPLATE: {authors}: {title}, {container}[[, {volume}]][[, {issue}]], {year}[[, p. {pages}]].
QUOTE   : 4.5.2. Europski sustav pisanja literature   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Primjeri clanka u Europskom sustavu nisu zahvaceni ekstrakcijom (isjecak zavrsava na najavi 'primjerice:'); predlozak izveden iz oblika za knjigu (autor: naslov, ..., godina), oznaka 'p.' za stranice iz fusnotnog primjera na str. 19. Potvrditi pri verifikaciji.
```

## mrezni  [str. 19] (derived)
Otvori PDF: `data/sources/pfri/pfri-upute-zavrsni-2025.pdf#page=19`
```
TEMPLATE: [[{authors}: ]]{title}[[, {year}]], online: {url} ({accessed})
QUOTE   : Koristeni izvori sadrze sve podatke o referenciranom djelu kao sto je navedeno u   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Europski dio izvora ne pokazuje mrezne izvore; oznaka 'online: URL (datum pristupa)' preuzeta iz Harvardskog dijela istog dokumenta (str. 22-23, gdje jedinica zavrsava bez tocke iza zagrade), redoslijed autor-naslov iz oblika za knjigu. Potvrditi pri verifikaciji.
```

## zavrsni  [str. 17] (derived)
Otvori PDF: `data/sources/pfri/pfri-upute-zavrsni-2025.pdf#page=17`
```
TEMPLATE: {authors}: {title}, {institution}, {place}, {year}.
QUOTE   : bibliografskih jedinica (knjiga, clanaka, zbornika radova, pravilnika, rjecnika...)   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Zavrsni i diplomski radovi nisu medju vrstama koje izvor obraduje; predlozak izveden iz oblika za knjigu (izdavac zamijenjen ustanovom). Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 20] (derived)
Otvori PDF: `data/sources/pfri/pfri-upute-zavrsni-2025.pdf#page=20`
```
TEMPLATE: {title}, {container}[[, {issue}]], {year}.
QUOTE   : bibliografskih jedinica (knjiga, clanaka, pravilnika, rjecnika...).   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Pravilnici su izrijekom dopustena bibliografska jedinica, ali izvor ne daje format za propise; naslov kao prvi element (bez autora) izveden iz Harvardskog dijela istog dokumenta (str. 22), rep container-broj-godina po analogiji s oblikom za knjigu. Broj sluzbenog glasila u {issue}. Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Prior profila je chicago-notes; Europski sustav jest fusnotni, ali izvor ga ne imenuje Chicago i format jedinice (autor: naslov, izdavac, mjesto, godina, 'p.' za stranice) nije Chicago. Zato custom-spec, ne style-pin.
- Izvor dopusta izbor izmedju Europskog i Harvardskog sustava uz dosljednu primjenu samo jednog nacina kroz cijeli rad (str. 19); Harvardski je u pfri-harvardski-brojcani.
- Fusnota dodaje ', p. N.' (tocna stranica citata) na kraj jedinice (str. 19); alat generira bibliografski oblik bez stranice, oblik fusnote provjerava covjek.
- Jedinica iz predgovora 'Zugaj, M., Dumici, K., Dusak, V.: Temelji znanstvenoistrazivackog rada...' (str. 3) ima rep 'Varazdin, Tiva, 2006' (mjesto pa izdavac) suprotan Zelenika 2011 (izdavac pa mjesto); raspodjela publisher/place u primjeru knjige je zato nesigurna, potvrditi.
- Popis literature se 'svrstava u odgovarajuce skupine, abecednim redom autora, a potom kronoloski za radove istog autora' (str. 23); alat reproducira samo abecedni sort, grupiranje po vrstama izvora i kronologiju istog autora ne.
- Svi tipovi osim knjige su derived jer primjeri iz poglavlja 4.5.2 nisu zahvaceni ekstrakcijom (isjecak se prekida na str. 23).

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `2b6ab8d65a52...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs pfri-europski-fusnote "Daniel Risavi"`.
