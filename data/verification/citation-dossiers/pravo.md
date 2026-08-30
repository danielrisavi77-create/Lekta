# Citatni spec: pravo (outcome: custom-spec, status: verified)

Stil: **Pravni fakultet: pravne fusnote (službene upute)** (token `pravo-fusnote`)
Izvor: Upute za oblikovanje i uređenje teksta i navođenje izvora (Pravni fakultet u Zagrebu) (`pravo-upute-oblikovanje-2024`)
Snapshot: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf` (hash `1917a74d113d...`)

## knjiga  [str. 5-6] (worked-example)
Otvori PDF: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf#page=5`
```
TEMPLATE: {authors}, {title}[[, {volume}. izdanje]], {publisher}, {place}, {year}.
QUOTE   : Horvat, M.; Petrak, M., Rimsko pravo, 17. izdanje, Pravni fakultet Sveučilišta u Zagrebu,   [grep: OK]
IZVOR   : Horvat, M.; Petrak, M., Rimsko pravo, 17. izdanje, Pravni fakultet Sveucilista u Zagrebu, Zagreb, 2022.
RENDER  : Horvat, M.; Petrak, M., Rimsko pravo, 17. izdanje, Pravni fakultet Sveucilista u Zagrebu, Zagreb, 2022.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Bibliografski (popis literature) oblik BEZ stranica: 'U popisu literature ne navode se stranice'. Broj izdanja ide u polje volume (17 -> '17. izdanje'). Vise autora odvaja se tockom sa zarezom.
```

## clanak  [str. 6] (worked-example)
Otvori PDF: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf#page=6`
```
TEMPLATE: {authors}, {title}, {container}[[, vol. {volume}]][[, br. {issue}]], {year}.[[, str. {pages}.]]
QUOTE   : Apostolova Maršavelski, M., O problemu porijekla rimske hipoteke, Zbornik Pravnog fakulteta   [grep: OK]
IZVOR   : Apostolova Marsavelski, M., O problemu porijekla rimske hipoteke, Zbornik Pravnog fakulteta u Zagrebu, vol. 24, br. 1, 1974., str. 345-361.
RENDER  : Apostolova Marsavelski, M., O problemu porijekla rimske hipoteke, Zbornik Pravnog fakulteta u Zagrebu, vol. 24, br. 1, 1974., str. 345-361.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: U popisu literature navode se prva i zadnja stranica clanka (str. 345-361); iza broja stranice ne stavlja se tocka osim na kraju biljeske/recenice.
```

## poglavlje  [str. 6] (worked-example)
Otvori PDF: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf#page=6`
```
TEMPLATE: {authors}, {title}, u: {editor} (ur.), {container}, {publisher}, {place}, {year}.[[, str. {pages}.]]
QUOTE   : Petrak, M., The Byzantine Emperor in Medieval Dalmatian Exultets, u: Slootjes, D.;   [grep: OK]
IZVOR   : Petrak, M., The Byzantine Emperor in Medieval Dalmatian Exultets, u: Slootjes, D.; Verhoeven, M. (ur.), Byzantium in Dialogue with the Mediterranean: History and Heritage, Brill, Leiden, 2019., str. 47-66.
RENDER  : Petrak, M., The Byzantine Emperor in Medieval Dalmatian Exultets, u: Slootjes, D.; Verhoeven, M. (ur.), Byzantium in Dialogue with the Mediterranean: History and Heritage, Brill, Leiden, 2019., str. 47-66.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Urednici se odvajaju tockom sa zarezom i upisuju u obliku 'Prezime, I.'; skracena naznaka (ur.) S tockom (razlika od FPZG).
```

## mrezni  [str. 8] (worked-example)
Otvori PDF: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf#page=8`
```
TEMPLATE: {authors}, {title}[[, {container}]][[, {year}.]], dostupno na: {url} ({accessed}).
QUOTE   : Primjer: Koske, I.; Naru, F.; Beiter, P.; Wanner, I., Regulatory Management Practices in OECD   [grep: OK]
IZVOR   : De Stefano, V.; Aloisi, A., European legal framework for digital labour platforms, Publication Office of the European Union, Luxembourg, 2018., dostupno na: https://publications.jrc.ec.europa.eu/repository/handle/JRC112243 (29. rujna 2022.).
RENDER  : De Stefano, V.; Aloisi, A., European legal framework for digital labour platforms, Publication Office of the European Union, Luxembourg, 2018., dostupno na: https://publications.jrc.ec.europa.eu/repository/handle/JRC112243 (29. rujna 2022.).
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Oblik: autori, naslov, (naziv stranice/publikacije), godina, dostupno na: URL (datum pristupa). Clanci koji postoje u casopisu citiraju se kao clanak, bez URL-a.
```

## propis  [str. 8-9] (worked-example)
Otvori PDF: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf#page=8`
```
TEMPLATE: {title}[[ (dalje u tekstu: {institution})]], {container}[[, br. {issue}]].
QUOTE   : Primjer za navođenje zakona u bilješci: Zakon o obveznim odnosima (dalje u tekstu: ZOO),   [grep: OK]
IZVOR   : Zakon o obveznim odnosima (dalje u tekstu: ZOO), Narodne novine, br. 35/05, 41/08, 125/11, 78/15, 29/18, 126/21.
RENDER  : Zakon o obveznim odnosima (dalje u tekstu: ZOO), Narodne novine, br. 35/05, 41/08, 125/11, 78/15, 29/18, 126/21.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Uvedena kratica zakona ide u polje institution (opcionalno); brojevi svih izmjena u issue (npr. 35/05, 41/08). Kod ponovljenog navodenja koristi se kratica (Cl. 15. ZOO-a), nikad op. cit.
```

## zavrsni  [str. 5] (derived)
Otvori PDF: `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf#page=5`
```
TEMPLATE: {authors}, {title}, {institution}, {place}, {year}.
QUOTE   : Prezime autora, prvo slovo imena autora s točkom, naslov djela (u kurzivu), broj izdanja (ako   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute NE obraduju citiranje zavrsnih/diplomskih radova; predlozak je izveden iz opceg oblika za knjigu (izdavac -> ustanova). Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Zavrsni/diplomski rad kao izvor nije pokriven u Uputama; predlozak je izveden iz knjige (derived).
- Naslov djela je u izvorniku kurzivom; alat radi plain text (napomena na stranici alata).
- Fusnotni oblik s brojem stranice (prvo navodenje, npr. 'str. 55.') razlikuje se od bibliografskog; alat generira bibliografski (popis literature) oblik jer je to ono sto student lijepi u rad.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-09); verifiedHash `1917a74d113d...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs pravo "Daniel Risavi"`.
