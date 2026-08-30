# Citatni spec: mefos (outcome: custom-spec, status: verified)

Stil: **Vancouver numeričko (službene upute MEFOS)** (token `mefos`)
Izvor: Upute za izradu i oblikovanje završnog i diplomskog rada (MEFOS, 2025) (`mefos-upute-radovi-2025`)
Snapshot: `data/sources/mefos/mefos-upute-radovi-2025.pdf` (hash `4bfabfddce83...`)

## knjiga  [str. 11] (worked-example)
Otvori PDF: `data/sources/mefos/mefos-upute-radovi-2025.pdf#page=11`
```
TEMPLATE: {authors}. {title}.[[ {volume}. izd.]] {place}: {publisher}; {year}.
QUOTE   : Murray PR, Rosenthal KS, Kobayashi GS, Pfaller MA. Medical microbiology. 4. izd. St. Louis:   [grep: OK]
IZVOR   : Murray PR, Rosenthal KS, Kobayashi GS, Pfaller MA. Medical microbiology. 4. izd. St. Louis: Mosby; 2002.
RENDER  : Murray PR, Rosenthal KS, Kobayashi GS, Pfaller MA. Medical microbiology. 4. izd. St. Louis: Mosby; 2002.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Sekcija 'Knjiga' u primjerima navodenja (str. 11); Slika 2 (str. 11) anotira sastavnice (inicijali imena, izdanje, mjesto izdanja, izdavac, godina izdanja). Broj izdanja ide u polje volume (4 -> '4. izd.'). Knjiga s urednicima ima isti oblik uz oznaku 'ur.' iza urednika: 'Bemmel JH van, Musen MA, ur. Handbook of medical informatics. Houten/Diegem: Springer; 1997.' (str. 11).
```

## poglavlje  [str. 11] (derived)
Otvori PDF: `data/sources/mefos/mefos-upute-radovi-2025.pdf#page=11`
```
TEMPLATE: {authors}. {title}. U: {editor}, ur. {container}.[[ {volume}. izd.]] {place}: {publisher}; {year}.[[ str. {pages}.]]
QUOTE   : Bemmel JH van, Musen MA, ur. Handbook of medical informatics. Houten/Diegem: Springer;   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute NE egzemplificiraju poglavlje u knjizi/zborniku; predlozak je izveden iz Vancouver (NLM uniform requirements) oblika za poglavlje, na koji izvor izrijekom upucuje (str. 10), uz oznaku urednika 'ur.' preuzetu iz primjera knjige s urednicima (Bemmel, str. 11). Oznaka stranica 'str.' je hrvatska prilagodba (NLM koristi 'p.'). Potvrditi ili oboriti pri verifikaciji.
```

## clanak  [str. 10] (worked-example)
Otvori PDF: `data/sources/mefos/mefos-upute-radovi-2025.pdf#page=10`
```
TEMPLATE: {authors}. {title}. {container}. {year};{volume}[[({issue})]]:{pages}.[[ doi: {doi}.]]
QUOTE   : Cancer. 2012;22(5):842-9. doi: 10.1097/IGC.0b013e31824ff142.   [grep: OK]
IZVOR   : Ferraioli D, Buenerd A, Marchiolè P, Constantini S, Venturini PL, Mathevet P. Early invasive cervical cancer during pregnancy: different therapeutic options to preserve fertility. Int J Gynecol Cancer. 2012;22(5):842-9. doi: 10.1097/IGC.0b013e31824ff142.
RENDER  : Ferraioli D, Buenerd A, Marchiolè P, Constantini S, Venturini PL, Mathevet P. Early invasive cervical cancer during pregnancy: different therapeutic options to preserve fertility. Int J Gynecol Cancer. 2012;22(5):842-9. doi: 10.1097/IGC.0b013e31824ff142.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Sekcija 'Clanak u casopisu (do 6 autora)' (Ferraioli, str. 10); Slika 1 (str. 11) anotira sastavnice. Skraceni naziv casopisa po Index Medicus/Medline (str. 10). Prozno pravilo o autorima: 'Navode se imena samo prvih sest autora, a ako ih ima vise, iza sestoga stavlja se zarez i oznaka "i sur.".' (str. 10). Drugi primjer (Zhang, BMJ 2009) ima puni datum ('2009 Jan 7;338:a2752') i doi bez zavrsne tocke, sto ovaj predlozak ne izrazava. 'Marchiol' u ekstrakciji je pdftotext-om osteceni 'Marchiole' (izvorno s akcentom), expected koristi rekonstruirani oblik.
```

## mrezni  [str. 12] (worked-example)
Otvori PDF: `data/sources/mefos/mefos-upute-radovi-2025.pdf#page=12`
```
TEMPLATE: [[{authors}. ]]{title}. Dostupno na adresi: {url}. Datum pristupa: {accessed}.
QUOTE   : as of January 1997. Dostupno na adresi:http://www.icmje.org/jrnlist.html.   [grep: OK]
IZVOR   : International Comittee of Medical Journals Editors. Journals in the Uniform Requirements For Manuscripts Submitted to Biomedical Journals Agreement as of January 1997. Dostupno na adresi: http://www.icmje.org/jrnlist.html. Datum pristupa: 01.12.2007.
RENDER  : Editors ICOMJ. Journals in the Uniform Requirements For Manuscripts Submitted to Biomedical Journals Agreement as of January 1997. Dostupno na adresi: http://www.icmje.org/jrnlist.html. Datum pristupa: 01.12.2007.
VERDIKT : DIFF (deklariran)  <-- USPOREDI ZNAK PO ZNAK
DEKLARIRANO: Org-detekcija autora (ORG_KEYWORDS) je hrvatska pa englesko ime tijela bez zareza razbija kao osobu ('Editors ICOMJ...'); expected je vjeran izvoru (ukljucivo doslovni tipfeler izvora 'Comittee'). Covjek pri verifikaciji odlucuje o tretmanu korporativnih autora.
NAPOMENA: Slika 3 (str. 12), jedini primjer mrezne stranice (ICMJE); anotira 'URL adresa stranice' i 'Datum pristupa stranici'. U ekstrakciji iza 'adresi:' nema razmaka (vjerojatno pdftotext artefakt), predlozak koristi razmak, potvrditi prema PDF-u. 'URL adresa stranice pise se normalnim tekstom u crnoj boji i bez podvlake.' (str. 12). Primjer nema zasebnu godinu (dio naslova).
```

## zavrsni  [str. 10] (derived)
Otvori PDF: `data/sources/mefos/mefos-upute-radovi-2025.pdf#page=10`
```
TEMPLATE: {authors}. {title} [diplomski rad].[[ {place}:]] {institution}; {year}.
QUOTE   : adresi: http://www.nlm.nih.gov/bsd/uniform_requirements.html. Odlične upute o pisanju   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute NE egzemplificiraju citiranje zavrsnih/diplomskih radova; oblik je izveden iz NLM (Citing Medicine / uniform requirements) konvencije za teze, na koju izvor izrijekom upucuje: Autor. Naslov [vrsta rada]. Mjesto: Ustanova; godina. Oznaka vrste rada (zavrsni rad, diplomski rad, disertacija) prilagodava se stvarnom radu. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 10] (derived)
Otvori PDF: `data/sources/mefos/mefos-upute-radovi-2025.pdf#page=10`
```
TEMPLATE: {title}. {container}[[ {issue}]].
QUOTE   : Referencije čini popis literature u kojem se navode samo oni radovi koji su citirani u tekstu. Navodi   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute pravne propise uopce ne obraduju (biomedicinski izvori); oblik (naslov propisa, sluzbeno glasilo, broj) izveden je iz opce hrvatske prakse u numerickom okruzenju, ne iz izvora. Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Prior ['vancouver'] POTVRDJEN: 'Literatura se obvezatno navodi Vancouverskim stilom, pa se referencije nizu redoslijedom pojavljivanja u tekstu.' (str. 10); na str. 6 formulacija je blaza ('u pravilu se navodi iz literature citiraju Vancouverskim stilom'), spec slijedi obvezatnu formulaciju iz sekcije Literatura.
- Izvor je interno nekonzistentan kod 7+ autora: prozno pravilo trazi prvih sest + zarez + 'i sur.' (str. 10), ali primjer 'Clanak u casopisu (vise od 6 autora)' (Wager, str. 11) ispisuje svih 8 autora bez kracenja; spec slijedi prozno pravilo.
- etAlText je hrvatski 'i sur.' po proznom pravilu izvora, ne standardni Vancouver/ICMJE 'et al.'.
- Oblik in-text zagrade: izvor kaze 'brojem u zagradi' i zabranjuje eksponent (str. 10), ali sekcija 'Primjeri pisanja navoda u tekstu' (str. 6-7) nije zahvacena ekstrakcijom pa referenceMarker ({n}) pretpostavlja okruglu zagradu. Potvrditi prema PDF-u.
- DOI: prvi primjer clanka (Ferraioli) zavrsava tockom iza doi-ja, drugi (Zhang, BMJ) bez tocke; spec slijedi prvi ('Referencije zavrsavaju tockom.', str. 10).
- Poglavlje, zavrsni i propis nisu egzemplificirani u izvoru (derived); poglavlje preuzima oznaku 'ur.' iz primjera knjige s urednicima (Bemmel, str. 11).
- Mrezni: u ekstrakciji 'Dostupno na adresi:' bez razmaka prije URL-a (vjerojatno pdftotext); predlozak koristi razmak. Korporativni autor (ICMJE) se u alatu razbija kao osoba, deklarirano kao knownDiff.
- Rekonstrukcija dijakritike u expected: 'Marchiol' + osteceni znak u ekstrakciji je 'Marchiole' s akcentom (pdftotext).

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `4bfabfddce83...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs mefos "Daniel Risavi"`.
