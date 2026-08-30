# Citatni spec: ffzg-filoz-fusnote (outcome: custom-spec, status: verified)

Stil: **Fusnotni stil Odsjeka za filozofiju (službene upute FFZG)** (token `filoz-fusnote`)
Izvor: Upute za oblikovanje diplomskoga rada na studiju filozofije (Odsjek za filozofiju, Filozofski fakultet u Zagrebu) (`ffzg-filoz-diplomski-2019`)
Snapshot: `data/sources/ffzg/ffzg-filoz-diplomski-2019.pdf` (hash `ba222ed21e3a...`)

## knjiga  [str. 5] (rule-text)
Otvori PDF: `data/sources/ffzg/ffzg-filoz-diplomski-2019.pdf#page=5`
```
TEMPLATE: {authors}, {title}, {publisher}, {place}, {year}.
QUOTE   : Prezime, Ime [autora], Naslov knjige, Izdavač, Mjesto izdavanja, godina izdavanja.   [grep: OK]
IZVOR   : Prezime, Ime, Naslov knjige, Izdavac, Mjesto izdavanja, godina izdavanja.
RENDER  : Prezime, Ime, Naslov knjige, Izdavac, Mjesto izdavanja, godina izdavanja.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Izvor daje shematski redak (bez konkretne instance) pa je kind rule-text; example je zadrzan jer je shematski redak ovdje bez ostecenih glifova i renderer ga tocno reproducira. Uglata anotacija [autora] izostavljena iz examplea. Fusnotno prvo navodenje ima drugi oblik (Ime Prezime, ..., str. xxx; str. 4) i izvan je dosega generatora.
```

## poglavlje  [str. 5] (rule-text)
Otvori PDF: `data/sources/ffzg/ffzg-filoz-diplomski-2019.pdf#page=5`
```
TEMPLATE: {authors}, „{title}”, u: {editor} (ur.), {container}, {publisher}, {place}, {year}, str. {pages}.
QUOTE   : Prezime, Ime [autora], „Naslov rada/poglavlja iz zbornika/knjige“, u: Prezime, Ime   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Nastavak prelomljenog retka u izvoru: '[urednika/autora] (ur.), Naslov zbornika/knjige, Izdavac, Mjesto izdavanja, godina izdavanja, str. xxx�xxx [raspon stranica rada].' Urednik se upisuje u obliku Prezime, Ime; skracenica (ur.) s tockom. Redak je shematski i navodnici su u ekstrakciji osteceni (,, i ") pa je kind rule-text bez examplea; predlozak koristi prave hrvatske navodnike „ i ” (ASCII ,, bi pojeo tidy cleanup), stvarne glifove potvrditi u PDF-u pri verifikaciji.
```

## clanak  [str. 5] (rule-text)
Otvori PDF: `data/sources/ffzg/ffzg-filoz-diplomski-2019.pdf#page=5`
```
TEMPLATE: {authors}, „{title}”, {container}, {volume}[[ ({issue})]], {year}, str. {pages}.
QUOTE   : Prezime, Ime [autora], „Naslov rada“, Naslov časopisa, XX (X) [godište časopisa (svezak/broj   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Nastavak prelomljenog retka u izvoru: 'casopisa)], godina izdavanja, str. xxx�xxx [raspon stranica rada].' XX (X) znaci godiste casopisa (svezak/broj casopisa): volume ide prije zagrade, issue u zagradu. Redak je shematski i navodnici su u ekstrakciji osteceni pa je kind rule-text bez examplea; predlozak koristi prave hrvatske navodnike „ i ”, potvrditi glifove u PDF-u.
```

## mrezni  [str. 5] (rule-text)
Otvori PDF: `data/sources/ffzg/ffzg-filoz-diplomski-2019.pdf#page=5`
```
TEMPLATE: {authors}, „{title}”, {url} (pristup: {accessed}).
QUOTE   : Prezime, Ime [autora], „Naslov teksta“, internetska adresa (pristup: [datum pristupa]).   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Vrijedi za tekstove s internetskih stranica koji nisu objavljeni u znanstvenim casopisima; clanci koji postoje u casopisu citiraju se kao clanak. Redak je shematski i navodnici su u ekstrakciji osteceni pa je kind rule-text bez examplea; predlozak koristi prave hrvatske navodnike „ i ”, potvrditi glifove u PDF-u.
```

## zavrsni  [str. 5] (derived)
Otvori PDF: `data/sources/ffzg/ffzg-filoz-diplomski-2019.pdf#page=5`
```
TEMPLATE: {authors}, {title}, {institution}, {place}, {year}.
QUOTE   : Prezime, Ime [autora], Naslov knjige, Izdavač, Mjesto izdavanja, godina izdavanja.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute Odsjeka za filozofiju NE obraduju citiranje zavrsnih/diplomskih radova; predlozak je izveden iz oblika za knjigu (izdavac -> ustanova). Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 5] (derived)
Otvori PDF: `data/sources/ffzg/ffzg-filoz-diplomski-2019.pdf#page=5`
```
TEMPLATE: {title}, {container}[[, {issue}]][[, {year}]].
QUOTE   : Prezime, Ime [autora], „Naslov rada“, Naslov časopisa, XX (X) [godište časopisa (svezak/broj   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute NE obraduju citiranje propisa/pravnih izvora; minimalni predlozak izveden iz opceg reda za clanak bez autora (naslov, publikacija, broj, godina). Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- classHint naivnog skenera bio je 'b' (autor-godina), a Odsjek za filozofiju propisuje vlastiti fusnotni stil (note-number); slijedi izvor.
- Fusnotno prvo navodenje ima oblik 'Ime Prezime, ..., str. xxx' (str. 4), ponovljeno 'I. Prezime' odnosno 'Isto'; alat generira bibliografski oblik iz popisa literature (Prezime, Ime), fusnotne varijante provjerava analizator, ne generator.
- Navodnici oko naslova su u ekstrakciji osteceni pdftotext-om (,, i "); pri verifikaciji utvrditi stvarne glifove iz PDF-a.
- Separator raspona stranica je u ekstrakciji ostecen znak (xxx�xxx); cijeli raspon ide u polje pages.
- Zavrsni i propis nisu pokriveni u izvoru; predlosci su izvedeni (derived), example je null.
- Eventualni kurziv naslova nije vidljiv u tekstualnoj ekstrakciji; alat radi plain text.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `ba222ed21e3a...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs ffzg-filoz-fusnote "Daniel Risavi"`.
