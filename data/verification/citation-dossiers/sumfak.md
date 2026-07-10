# Citatni spec: sumfak (outcome: custom-spec, status: draft)

Stil: **Autor-godina (sluzbene upute Fakulteta sumarstva i drvne tehnologije)** (token `sumfak`)
Izvor: Upute za izradu zavrsnog i diplomskog rada, poglavlje Pravila citiranja i izrada popisa literature (Fakultet sumarstva i drvne tehnologije, Sveuciliste u Zagrebu) (`sumfak-upute-zavrsni-diplomski-2024`)
Snapshot: `data/sources/sumfak/sumfak-upute-zavrsni-diplomski-2024.docx` (hash `16c870fde070...`)

## knjiga  [str. 1] (worked-example)
Otvori PDF: `data/sources/sumfak/sumfak-upute-zavrsni-diplomski-2024.docx#page=1`
```
TEMPLATE: {authors}, {year}: {title}, {publisher}, {place}[[, {pages}]].
QUOTE   : Eckenwalder, J. E., 2009: Conifers of the world, Timber Press, Portland, 744 str.   [grep: OK]
IZVOR   : Eckenwalder, J. E., 2009: Conifers of the world, Timber Press, Portland, 744 str.
RENDER  : Eckenwalder, J. E., 2009: Conifers of the world, Timber Press, Portland, 744 str.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Oblik: Prezime, Inicijal(i). (dotted-spaced), godina: Naslov, Izdavac, Mjesto, (opseg u str.). Iza godine dvotocka. Napomena: pisano pravilo (Prezime autora, inicijal(i) osobnoga imena, godina: Naslov. Izdanje. Izdavac, Mjesto) trazi tocku iza naslova, ali worked-example iza naslova ima ZAREZ ('Conifers of the world, Timber Press'); slijedim primjer. Polje pages nosi ukupan opseg '744 str' (tocka iza 'str.' dolazi iz zavrsne tocke predloska). Izdanje/svezak (ako nije prvo) spomenuto u pravilu, ali nije u primjeru, pa nije u predlosku.
```

## poglavlje  [str. 1] (derived)
Otvori PDF: `data/sources/sumfak/sumfak-upute-zavrsni-diplomski-2024.docx#page=1`
```
TEMPLATE: {authors}, {year}: {title}. U: {editor} (ur.), {container}. {publisher}, {place}[[, {pages}]].
QUOTE   : Pervan, S., Prekrat, S., Gorišek, Ž., Straže, A., Humar, M., 2006: Effect of steaming on colour and chemistry of cherrywood (Prunus avium L.). Wood structure and properties ’06, IUFRO, 3. 9. 2006, Zvolen, Slovačka.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor NEMA primjer poglavlja u knjizi s urednikom. Najblizi zanr je 'Rad u zborniku radova' (proceedings): 'Pervan, S., ... 2006: Effect of steaming ... Wood structure and properties 06, IUFRO, 3. 9. 2006, Zvolen, Slovacka.' - taj primjer nema urednika i sadrzi datum skupa (3. 9. 2006) za koji ne postoji placeholder, pa se ne moze vjerno rekonstruirati. Predlozak je izveden iz oblika za knjigu ovog fakulteta + opceg hrvatskog obrasca 'U: Urednik (ur.), Zbornik'; oznaka 'U:' i '(ur.)' NISU evidencirane u izvoru, potvrditi ili oboriti pri verifikaciji.
```

## clanak  [str. 1] (worked-example)
Otvori PDF: `data/sources/sumfak/sumfak-upute-zavrsni-diplomski-2024.docx#page=1`
```
TEMPLATE: {authors}, {year}: {title}. {container}, {volume}: {pages}.[[ {url}.]]
QUOTE   : Kärki, T., 2001: Variation of wood density and shrinkage in European aspen (Populus tremula). Holz als Roh- und Werkstoff, 59: 79-84. http://dx.doi.org/10.1007/s001070050479.   [grep: OK]
IZVOR   : Kärki, T., 2001: Variation of wood density and shrinkage in European aspen (Populus tremula). Holz als Roh- und Werkstoff, 59: 79-84. http://dx.doi.org/10.1007/s001070050479.
RENDER  : Kärki, T., 2001: Variation of wood density and shrinkage in European aspen (Populus tremula). Holz als Roh- und Werkstoff, 59: 79-84. http://dx.doi.org/10.1007/s001070050479.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Oblik: autori, godina: Naslov. Casopis, godiste: prva-zadnja stranica. DOI/URL na kraju s tockom. Iza naslova clanka TOCKA (za razliku od knjige koja ima zarez). Broj sveska (issue) nije u primjeru (samo godiste 59), pa nije u predlosku. DOI je u izvoru dan kao puni URL 'http://dx.doi.org/...' pa se unosi u polje url doslovno (polje doi/doiUrl bi normaliziralo na https://doi.org/ i ne bi se poklopilo).
```

## mrezni  [str. 1] (worked-example)
Otvori PDF: `data/sources/sumfak/sumfak-upute-zavrsni-diplomski-2024.docx#page=1`
```
TEMPLATE: {authors}[[ {year}:]] {title}. {url} (Pristupljeno {accessed})
QUOTE   : IUFRO 2021: International Union of Forest Research Organization. https://www.iufro.org/ (Pristupljeno 19. 1. 2021.)   [grep: OK]
IZVOR   : IUFRO 2021: International Union of Forest Research Organization. https://www.iufro.org/ (Pristupljeno 19. 1. 2021.)
RENDER  : IUFRO 2021: International Union of Forest Research Organization. https://www.iufro.org/ (Pristupljeno 19. 1. 2021.)
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Oblik: autor godina: Naslov. URL (Pristupljeno DD. M. GGGG.). Za mrezne izvore autor i godina spojeni su RAZMAKOM (bez zareza), za razliku od knjige/clanka gdje je zarez. Prescribeani model s osobnim autorom: 'Simpson, W. T. 2021: Dry Kiln Operator's Manual. https://... (Pristupljeno 19. 1. 2021.)'. Varijanta bez autora ('Projekt Naturavita: Naslov URL ...') i bez godine te slika/graf s mreze imaju drukciji oblik i nisu pokriveni ovim jednim predloskom; godina je zato opcionalna grupa.
```

## zavrsni  [str. 1] (derived)
Otvori PDF: `data/sources/sumfak/sumfak-upute-zavrsni-diplomski-2024.docx#page=1`
```
TEMPLATE: {authors}, {year}: {title}. {institution}, {place}.
QUOTE   : Eckenwalder, J. E., 2009: Conifers of the world, Timber Press, Portland, 744 str.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor opsirno opisuje strukturu zavrsnog i diplomskog rada, ali NEMA primjer kako se zavrsni/diplomski rad CITIRA kao izvor u popisu literature. Predlozak je izveden iz oblika za knjigu ovog fakulteta (izdavac zamijenjen ustanovom): 'Prezime, I., godina: Naslov. Ustanova, Mjesto.'. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 1] (derived)
Otvori PDF: `data/sources/sumfak/sumfak-upute-zavrsni-diplomski-2024.docx#page=1`
```
TEMPLATE: {title}. {container}[[, {issue}]].
QUOTE   : Prezime autora, inicijal(i) osobnoga imena, godina: Naslov.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor NE propisuje oblik za citiranje pravnih propisa (jedini kvazi-pravni navod je u tekstu: 'Eticki kodeks Sveucilista u Zagrebu ... (cl. 18. i 19)' s URL-om, bez bibliografskog oblika). Predlozak je izveden iz opceg bibliografskog obrasca (naslov, glasilo, broj); potpuno neevidencirano, potvrditi ili oboriti pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort} {year})   /  s pages: (nema)
RENDER   : (Lovric 1988)   /  (Lovric 1988)
QUOTE    : koje deklariraju njihovi proizvođači (Đuka 2014).   [grep: OK]
NAPOMENA : In-text je autor-godina BEZ zareza izmedu prezimena i godine: jedan autor 'Đuka (2014)' ili '(Đuka 2014)'; dva autora 'Ugarković i Pleša (2017)' ili '(Ugarković i Pleša 2017)' (veznik ' i '); tri i vise autora samo prvi + 'i dr.': 'Posavec i dr. (2015)' ili '(Posavec i dr. 2005)'. Posredno citiranje: 'Glass i sur. 1972 (prema: McDonald 2014)'. Izvor preporucuje neizravno (parafrazirano) citiranje, pa in-text primjeri nemaju broj stranice; withPagesTemplate se ne uvodi.
```

## Kontradikcije / otvorena pitanja
- Prior iz profila ('harvard') je sadrzajno konzistentan (autor-godina), ali konkretni oblik je kucna varijanta fakulteta: iza godine ide DVOTOCKA (npr. '2009:'), in-text je bez zareza ('(Djuka 2014)'), a visesautorstvo koristi 'i dr.'; zato je ishod custom-spec, ne style-pin na standardni harvard.
- Interna nedosljednost izvora: pisano pravilo za knjigu trazi tocku iza naslova ('...godina: Naslov. Izdavac...'), ali worked-example ima zarez ('Conifers of the world, Timber Press'). Predlozak slijedi worked-example (zarez).
- Visesautorska kratica u tekstu nije dosljedna: direktni primjeri koriste 'i dr.' (Posavec i dr.), ali primjer posrednog citiranja koristi 'i sur.' (Glass i sur.). Odabran je 'i dr.' kao dominantan; potvrditi pri verifikaciji.
- poglavlje: izvor daje samo 'rad u zborniku radova' (proceedings) bez urednika i s datumom skupa koji nema placeholder; predlozak (U: ... (ur.)) je izveden i neevidenciran.
- zavrsni i propis nemaju vlastiti bibliografski primjer u izvoru; zavrsni je izveden iz oblika za knjigu, propis iz opceg bibliografskog obrasca.
- Zanr 'Racunalni programi (softver)' ('*** 2020. Woodworking for inventor ...') i mrezni izvori bez autora / slike s mreze imaju vlastite oblike koje 6 standardnih sourceTypes ne pokriva.
- Kurziv (latinska imena roda i vrsta, oznake fizikalnih velicina) alat ne reproducira; izlaz je plain text (napomena na stranici alata).

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs sumfak "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
