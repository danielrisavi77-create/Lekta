# Citatni spec: pravri (outcome: custom-spec, status: verified)

Stil: **Pravne fusnote (sluzbene upute PRAVRI)** (token `pravri-fusnote`)
Izvor: Upute za izradu studentskih pisanih radova (PRAVRI, rev. 2023) (`pravri-upute-radovi-2023`)
Snapshot: `data/sources/pravri/pravri-upute-radovi-2023.pdf` (hash `1943a0cbb283...`)

## knjiga  [str. 18] (worked-example)
Otvori PDF: `data/sources/pravri/pravri-upute-radovi-2023.pdf#page=18`
```
TEMPLATE: {authors}, {title}[[, {volume}. izd.]], {place}, {publisher}, {year}.
QUOTE   : Petranovi, Anamari, Obligationes iuris romani: breviarum, Rijeka, Pravni fakultet Sveucilista,   [grep: OK]
IZVOR   : Petranovi, Anamari, Obligationes iuris romani: breviarum, Rijeka, Pravni fakultet Sveucilista, 2010.
RENDER  : Petranovi, Anamari, Obligationes iuris romani: breviarum, Rijeka, Pravni fakultet Sveucilista, 2010.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Poglavlje 6.1.1: autor (prezime, ime), naslov (podnaslov iza dvotocja), izdanje ako postoji, MJESTO pa nakladnik, godina; titule se ne pisu. Broj izdanja ide u polje volume ('N. izd.', potvrdjeno primjerom Pavisi '2. izd.', str. 20; Hartley u fusnoti ima '2. hrv. izd.', str. 13). Redoslijed mjesto-nakladnik je obrnut od zagrebackog Pravnog.
```

## clanak  [str. 20] (worked-example)
Otvori PDF: `data/sources/pravri/pravri-upute-radovi-2023.pdf#page=20`
```
TEMPLATE: {authors}, {title}, {container}[[, vol. {volume}]][[, br. {issue}]]({year})[[, str. {pages}]]
QUOTE   : Zuni Kovacevi, Natasa, Gadzo, Stjepan, Institut zakonskog poreznog jamstva nakon novele   [grep: OK]
IZVOR   : Zuni Kovacevi, Natasa, Gadzo, Stjepan, Institut zakonskog poreznog jamstva nakon novele Opeg poreznog zakona 2012: proboj pravne osobnosti trgovackih drustava u slucaju zloporabe prava, Zbornik Pravnog fakulteta Sveucilista u Rijeci, vol. 34, br. 1(2013), str. 393-416
RENDER  : Zuni Kovacevi, Natasa, Gadzo, Stjepan, Institut zakonskog poreznog jamstva nakon novele Opeg poreznog zakona 2012: proboj pravne osobnosti trgovackih drustava u slucaju zloporabe prava, Zbornik Pravnog fakulteta Sveucilista u Rijeci, vol. 34, br. 1(2013), str. 393-416
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Poglavlje 6.2: 'bitni su podatci o autoru (prezime, ime ili inicijali imena), naslov rada, volumen, broj, godina te prva i zadnja stranica clanka'. Godina u zagradi odmah iza broja: 'vol. 34, br. 1(2013)'. Primjer u izvoru NEMA zavrsnu tocku iza raspona stranica; prenijeto doslovno.
```

## poglavlje  [str. 20] (worked-example)
Otvori PDF: `data/sources/pravri/pravri-upute-radovi-2023.pdf#page=20`
```
TEMPLATE: {authors}, {title}, u: {editor} (eds.), {container}, {place}, {publisher}, {year}.[[, str. {pages}.]]
QUOTE   : Benacchio, Gian Antonio,Winkler, Sandra, The Europeanisation of Law : Imposition or Natural   [grep: OK]
IZVOR   : Benacchio, Gian Antonio,Winkler, Sandra, The Europeanisation of Law : Imposition or Natural Development of Legal Models, u: Bodiroga-Vukobrat, N., Sander, G.G., Rodin, S. (eds.), Legal Culture in Transition : Supranational and International Law before National Courts, Berlin, Logos, 2013., str. 61-73.
RENDER  : Benacchio, Gian Antonio, Winkler, Sandra, The Europeanisation of Law : Imposition or Natural Development of Legal Models, u: Bodiroga-Vukobrat, N., Sander, G.G., Rodin, S. (eds.), Legal Culture in Transition : Supranational and International Law before National Courts, Berlin, Logos, 2013., str. 61-73.
VERDIKT : DIFF (deklariran)  <-- USPOREDI ZNAK PO ZNAK
DEKLARIRANO: Tipfeler u izvoru: nema razmaka iza zareza izmedu autora ('Antonio,Winkler'); render normalizira razmak ('Antonio, Winkler'). Ostatak retka je istovjetan.
NAPOMENA: Poglavlje 6.2.1 (Clanak ili poglavlje u knjizi): autori, naslov poglavlja, 'u:' urednici s inicijalima i naznakom (eds.), naslov zbornika, mjesto, nakladnik, godina, str. raspon. Izvor u primjerima koristi englesko '(eds.)' odnosno '(ed.)' (Crni-Groti/Matulovi, str. 20); hrvatsko '(ur.)' nije potvrdjeno u ekstrakciji. Urednici se u polje editor upisuju doslovno ('Bodiroga-Vukobrat, N., Sander, G.G., Rodin, S.').
```

## mrezni  [str. 20] (derived)
Otvori PDF: `data/sources/pravri/pravri-upute-radovi-2023.pdf#page=20`
```
TEMPLATE: {authors}, {title}[[, {container}]][[, {year}]], {url} ({accessed}).
QUOTE   : Isto se pravilo primjenjuje kod citiranje clanka u casopisu (podatci o autoru (prezime, ime ili   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Poglavlje 6.2.2 (Clanak s interneta) propisuje ista polja kao clanak 'uz dodatne podatke o mreznoj stranici i datumu pregleda casopisa', ali sam PRIMJER nije u ekstrahiranim stranicama. Predlozak je izveden: lanac zarezima u stilu izvora + URL i datum pregleda u zagradi; tocnu interpunkciju URL-a i datuma potvrditi pri verifikaciji protiv PDF-a.
```

## zavrsni  [str. 18] (derived)
Otvori PDF: `data/sources/pravri/pravri-upute-radovi-2023.pdf#page=18`
```
TEMPLATE: {authors}, {title}[[, {place}]], {institution}, {year}.
QUOTE   : 6.1.1. Kod citiranja knjige bitni su podatci o autoru (prezime, ime ili inicijali imena), naslov   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju citiranje zavrsnih/diplomskih radova kao izvora. Predlozak je izveden iz oblika za knjigu (6.1.1): nakladnik zamijenjen ustanovom, redoslijed mjesto-ustanova-godina zadrzan. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 17] (derived)
Otvori PDF: `data/sources/pravri/pravri-upute-radovi-2023.pdf#page=17`
```
TEMPLATE: {title}, {container}[[, br. {issue}]][[, str. {pages}]].
QUOTE   : Uredba Vijea (EZ) br. 2001/2003 od 27. studenog 2003 o nadleznosti, priznavanju i ovrsi   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Ekstrakcija sadrzi samo EU primjere propisa (5.9.2: naslov akta, sluzbeno glasilo 'SL L 338, 23.12.2003., str. 1.-29.'); poglavlja 5.9.1 i 6.3 (Hrvatski pravni propisi) nisu u ekstrahiranim stranicama. Predlozak je izveden iz strukture EU primjera (naslov, glasilo, broj, stranice) prilagodjene navodu iz Narodnih novina; potvrditi protiv PDF-a pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Prior iz profila je bio 'pravo-fusnote' (zagrebacki Pravni fakultet); pravri upute propisuju vlastiti fusnotni oblik koji se razlikuje: puna imena autora umjesto inicijala, autori odvojeni zarezom umjesto tockom sa zarezom, mjesto prije nakladnika, a clanak ima 'vol. X, br. N(godina)'. Zato zaseban spec (pravri-fusnote), ne pin na pravo-fusnote.
- Clanak primjer u izvoru zavrsava bez tocke ('str. 393-416'), dok knjiga i poglavlje zavrsavaju tockom; prenijeto doslovno, potvrditi pri verifikaciji je li to namjera ili tipfeler izvora.
- Naznaka urednika: izvor u primjerima koristi englesko '(ed.)'/'(eds.)' nekonzistentno (dva urednika s '(ed.)' u Crni-Groti primjeru); hrvatska varijanta '(ur.)' nije dokazana u ekstrakciji.
- Pravilo o kracenju popisa autora (et al. / i dr.) nije u ekstrahiranim stranicama; authorFormat namjerno bez et-al kracenja.
- Primjeri za hrvatske propise (5.9.1, 6.3), clanak s interneta (6.2.2) i enciklopedijske odrednice nisu u ekstrahiranim stranicama; mrezni, zavrsni i propis su izvedeni (derived).

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `1943a0cbb283...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs pravri "Daniel Risavi"`.
