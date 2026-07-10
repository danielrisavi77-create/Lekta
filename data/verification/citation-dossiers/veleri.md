# Citatni spec: veleri (outcome: custom-spec, status: draft)

Stil: **Autor-godina (sluzbene upute Veleucilista u Rijeci)** (token `veleri`)
Izvor: Upute za izradu i formalni izgled zavrsnog/diplomskog rada (Veleuciliste u Rijeci) (`veleri-upute-formalni-izgled`)
Snapshot: `data/sources/veleri/veleri.pdf` (hash `bcd508baf145...`)

## knjiga  [str. 6] (worked-example)
Otvori PDF: `data/sources/veleri/veleri.pdf#page=6`
```
TEMPLATE: {authors}, {title}[[, {volume}]], {publisher}, {place}, {year}.
QUOTE   : Dujani, M., Osnove menadzmenta, Veleuciliste u Rijeci, Rijeka, 2006.   [grep: OK]
IZVOR   : Dujani, M., Osnove menadzmenta, Veleuciliste u Rijeci, Rijeka, 2006.
RENDER  : Dujani, M., Osnove menadzmenta, Veleuciliste u Rijeci, Rijeka, 2006.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Oblik: Prezime, I., Naslov, Izdavac, Mjesto, Godina. Prezime + inicijal(i), autori odvojeni zarezom bez 'i' (npr. 'Tudor, G., Rijavec, M., Zarevski, P.'). Cetiri i vise autora skracuje se na 'Kotler, P. et al.' (authorFormat etAlAfter 3). Izdanje (npr. 'petnaesto izdanje', 'drugo izdanje') upisuje se u polje volume i ide iza naslova (primjeri Samuelson i Ani u izvoru).
```

## poglavlje  [str. 6] (worked-example)
Otvori PDF: `data/sources/veleri/veleri.pdf#page=6`
```
TEMPLATE: {authors}, {title}, {container}, {publisher}, {place}, {year}.[[, str. {pages}.]]
QUOTE   : Horvat, ., Nedovi Cubarkapa, M., Ucinkovitost upravljanja dobavnim lancem primjenom   [grep: OK]
IZVOR   : Horvat, Nedovi Cubarkapa, M., Ucinkovitost upravljanja dobavnim lancem primjenom metrike, Zbornik radova, osmi meunarodni znanstveni skup Poslovna logistika u suvremenom menadzmentu, Ekonomski fakultet u Osijeku, Osijek, 2008., str. 15-37.
RENDER  : Horvat, Nedovi Cubarkapa, M., Ucinkovitost upravljanja dobavnim lancem primjenom metrike, Zbornik radova, osmi meunarodni znanstveni skup Poslovna logistika u suvremenom menadzmentu, Ekonomski fakultet u Osijeku, Osijek, 2008., str. 15-37.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Kategorija 'Rad u zborniku, poglavlje u knjizi, esej u zbirci'. Oblik: Autori, Naslov priloga, Container (npr. 'Zbornik radova, ... znanstveni skup ...'), Izdavac, Mjesto, Godina., str. X-Y. Primjer nema urednika, pa template ne nosi editor polje. NAPOMENA: prvom autoru je inicijal izgubljen u pdftotext ekstrakciji (izvor: 'Horvat, .') i dijakritika je ostecena ('meunarodni' = medunarodni); pri verifikaciji vratiti protiv PDF-a.
```

## clanak  [str. 6] (worked-example)
Otvori PDF: `data/sources/veleri/veleri.pdf#page=6`
```
TEMPLATE: {authors}, {title}, {container}[[, vol. {volume}]][[, {year}.]][[, br. {issue}]][[, str. {pages}.]]
QUOTE   : Pasali, Z., Prometni sustavi i prometna trzista, Suvremeni promet, vol. 29, 2009., br. 1-2, str.   [grep: OK]
IZVOR   : Pasali, Z., Prometni sustavi i prometna trzista, Suvremeni promet, vol. 29, 2009., br. 1-2, str. 11-16.
RENDER  : Pasali, Z., Prometni sustavi i prometna trzista, Suvremeni promet, vol. 29, 2009., br. 1-2, str. 11-16.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Oblik: Autor, Naslov clanka, Casopis, vol. X, Godina., br. Y, str. A-B. Godina stoji izmedju godista (vol.) i broja (br.).
```

## mrezni  [str. 7] (worked-example)
Otvori PDF: `data/sources/veleri/veleri.pdf#page=7`
```
TEMPLATE: {authors}, {title}, {container}[[, vol. {volume}]][[, {year}.]][[, br. {issue}.]], Dostupno na: {url} ({accessed})
QUOTE   : Papageorgiou, G., Modeliranje i simulacija transportnih sustava: pristup planiranja scenarija,   [grep: OK]
IZVOR   : Papageorgiou, G., Modeliranje i simulacija transportnih sustava: pristup planiranja scenarija, Automatika, vol. 50, 2009., br. 1-2., Dostupno na: http://hrcak.srce.hr/index.php?show=clanak&id_clanak_jezik=59573 (8. 1. 2021.)
RENDER  : Papageorgiou, G., Modeliranje i simulacija transportnih sustava: pristup planiranja scenarija, Automatika, vol. 50, 2009., br. 1-2., Dostupno na: http://hrcak.srce.hr/index.php?show=clanak&id_clanak_jezik=59573 (8. 1. 2021.)
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Clanak na web-stranici s poznatim autorom: Prezime, I., naslov clanka, naziv publikacije, vol., godina., br., Dostupno na: URL (datum pristupa). Ako autor nije poznat, prvo se navodi naslov/naziv i nakladnik (npr. 'Godisnje izvjese 2021., Ericsson Nikola Tesla Grupa, dostupno na: ...'). NAPOMENA: izvor nekonzistentno pise 'Dostupno na:' (Papageorgiou) i 'dostupno na:' (Ericsson/DZS); predlozak koristi verzalni oblik iz odabranog primjera.
```

## zavrsni  [str. 6] (derived)
Otvori PDF: `data/sources/veleri/veleri.pdf#page=6`
```
TEMPLATE: {authors}, {title}, {institution}, {place}, {year}.
QUOTE   : Na kraju rada slijedi Popis koristene literature koju navodimo ovako (ili odabrati stil APA 6):   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute NE daju primjer citiranja zavrsnog/diplomskog rada kao IZVORA u popisu literature. Predlozak je izveden iz opceg oblika za knjigu (izdavac -> ustanova): Prezime, I., Naslov, Ustanova, Mjesto, Godina. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 5] (worked-example)
Otvori PDF: `data/sources/veleri/veleri.pdf#page=5`
```
TEMPLATE: {title} ({container}, {issue}[[; u daljnjem tekstu: {institution}]]).
QUOTE   : Zakon o radu (NN, 93/14., 127/17.; u daljnjem tekstu: ZR ili Zakon).   [grep: OK]
IZVOR   : Zakon o radu (NN, 93/14., 127/17.; u daljnjem tekstu: ZR ili Zakon).
RENDER  : Zakon o radu (NN, 93/14., 127/17.; u daljnjem tekstu: ZR ili Zakon).
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Izvor daje zakonsku regulativu u zagradnom (in-text) obliku: Naziv zakona (NN, brojevi; u daljnjem tekstu: kratica). Kratica ('ZR ili Zakon') ide u polje institution (opcionalno), brojevi izmjena u issue, glasilo (NN) u container. Zaseban oblik za popis literature nije izrijecno propisan.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: ({authorsShort}, {year}, {pages})
RENDER   : (Lovric, 1988)   /  (Lovric, 1988, 45)
QUOTE    : (Dujani, 2020, 55).   [grep: OK]
NAPOMENA : Izvori u zagradi prije tocke; polja zarezom odvojena: (autor, godina, stranica). Ostali primjeri iz izvora: 2-3 autora '(Samuelson, Nordhaus, 2000, 225-227)', cetiri i vise autora '(Kotler et al., 2006)', isti autor dva naslova iste godine '(Dujani, 2020a, 100)'. Dva ili vise izvora odvaja se tockom sa zarezom u istoj zagradi.
```

## Kontradikcije / otvorena pitanja
- PRIOR hint iz profila je 'harvard', ali izvor propisuje vlastiti kucni autor-godina oblik s hrvatskim konvencijama (vol./br., 'Dostupno na:', prezime + inicijal, autori odvojeni zarezom bez 'i'), a ne udzbenicki Harvard.
- Izvor nudi alternativu 'ili odabrati stil APA 6' (str. 6); alat implementira kucni veleri oblik, ne APA 6. Verifikator neka odluci treba li zaseban APA-varijantni izlaz.
- poglavlje: prvom autoru u jedinom primjeru ('Horvat, .') izgubljen je inicijal u ekstrakciji; primjer je zbornicki rad bez urednika pa template nema editor polje (poglavlje u knjizi s urednikom nije primjerom pokriveno).
- zavrsni/diplomski rad kao IZVOR nije pokriven primjerom; predlozak je izveden iz oblika za knjigu (derived).

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs veleri "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
