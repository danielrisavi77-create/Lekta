# Citatni spec: fer (outcome: custom-spec, status: verified)

Stil: **FER numeričko navođenje (službene upute za diplomski rad, ZEMRIS)** (token `fer`)
Izvor: Upute za izradu diplomskog rada (FER, ZEMRIS predlozak) (`fer-upute-diplomski-zemris`)
Snapshot: `data/sources/fer/fer-upute-diplomski-zemris.pdf` (hash `853f096a6496...`)

## knjiga  [str. 16] (derived)
Otvori PDF: `data/sources/fer/fer-upute-diplomski-zemris.pdf#page=16`
```
TEMPLATE: {authors}, {title}[[, {publisher}]], {year}.
QUOTE   : 3. izdavač (ako je poznat),   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor nema worked-example za knjigu; predlozak izveden iz popisa elemenata reference (str. 16): autor, naslov djela (koso), izdavac ako je poznat, godina, elementi odvojeni zarezom. Naslov je u izvorniku koso, alat radi plain text. Potvrditi pri verifikaciji.
```

## poglavlje  [str. 16] (derived)
Otvori PDF: `data/sources/fer/fer-upute-diplomski-zemris.pdf#page=16`
```
TEMPLATE: {authors}, {title}, {container}[[, {publisher}]], str. {pages}, {year}.
QUOTE   : 5. stranice „od-od“ (ako se radi o poglavlju knjige ili zbornika radova, ili članku nekog   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor propisuje stranice od-do za poglavlje knjige ili zbornika, ali ne imenuje naslov cjeline (container) ni urednike kao elemente; container je izveden i smjesten iza naslova, urednici izostavljeni. Oznaka 'str.' ispred raspona je izvedena (izvor kaze samo stranice od-od). Potvrditi pri verifikaciji.
```

## clanak  [str. 16] (derived)
Otvori PDF: `data/sources/fer/fer-upute-diplomski-zemris.pdf#page=16`
```
TEMPLATE: {authors}, {title}, {container}, str. {pages}, {year}.
QUOTE   : 5. stranice „od-od“ (ako se radi o poglavlju knjige ili zbornika radova, ili članku nekog   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor trazi stranice od-do za clanak casopisa, ali casopis (container) nije eksplicitno imenovan kao element pa je izveden; volume i issue izvor uopce ne spominje pa nisu ukljuceni. Potvrditi pri verifikaciji.
```

## mrezni  [str. 16] (worked-example)
Otvori PDF: `data/sources/fer/fer-upute-diplomski-zemris.pdf#page=16`
```
TEMPLATE: [[{authors}, ]]{title}, {url}, {accessed}
QUOTE   : 2. Repozitorij predmeta Završni rad, http://www.fer.unizg.hr/predmet/zavrad, 2. 7. 2013.   [grep: OK]
IZVOR   : Repozitorij predmeta Zavrsni rad, http://www.fer.unizg.hr/predmet/zavrad, 2. 7. 2013.
RENDER  : Repozitorij predmeta Zavrsni rad, http://www.fer.unizg.hr/predmet/zavrad, 2. 7. 2013.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer iz Literature predloska; redni broj '2.' je oznaka mjesta u numeriranom popisu, ne dio jedinice. Autor izostavljen jer je nepoznat (pravilo: autor ako je poznat); primjer s autorima na istoj stranici: '5. Sandor Dembitz, Gordan Gledec, Hrvoje Miholi, Hascheck...' (puna imena, given-first, zarez). Datum je 'datum zadnje provjere adrese' i nosi vlastitu tocku; godina objave se u primjerima ne pojavljuje.
```

## zavrsni  [str. 16] (derived)
Otvori PDF: `data/sources/fer/fer-upute-diplomski-zemris.pdf#page=16`
```
TEMPLATE: {authors}, {title}, {institution}, {year}.
QUOTE   : Svaka reference bi se trebala sastojati od:   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju citiranje zavrsnih/diplomskih radova; predlozak izveden iz opceg popisa elemenata (autor, naslov, izdavac zamijenjen ustanovom, godina), elementi odvojeni zarezom. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 16] (derived)
Otvori PDF: `data/sources/fer/fer-upute-diplomski-zemris.pdf#page=16`
```
TEMPLATE: {title}, {container}[[, {issue}]], {year}.
QUOTE   : Elemente referenci odvojiti zarezom.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju pravne propise; predlozak izveden iz opceg popisa elemenata (naslov djela, glasilo kao container, broj glasila, godina), elementi odvojeni zarezom. Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Prior profila navodi ieee i harvard; ekstrakcija ne imenuje nijedan standardni stil. Izvor propisuje vlastiti numericki oblik [n] s elementima odvojenim zarezom (slici IEEE po numeraciji, ali format elemenata nije IEEE: dopustena puna imena autora, naslov koso). Harvard nema nikakve potpore u isjeccima.
- Izvor dopusta tri oblika autora ('Pero Peri, Ivo Ivi', 'P. Peri, I. Ivi' ili 'Peri, P.; Ivi, I.', str. 16); authorFormat pinan na oblik iz worked-examplea u Literaturi (puna imena, given-first, zarez), ostali oblici su po izvoru takoder dopusteni.
- Izvor dopusta redanje literature po kriteriju znacaja ILI po redoslijedu koristenja (str. 17); schema podrzava samo alphabetical/appearance pa je odabran appearance (jedini koji izvor eksplicitno ilustrira: 'prva referenca bi tada imala brojku [1]').
- Bibliografske jedinice u izvoru su numerirane ('1.', '2.' s tockom); polje numbering ostavljeno null jer format markera nije izrazen u schemi, broj proizlazi iz bracket-number moda.
- Jedini worked-example primjeri su mrezni izvori iz predloskove Literature; knjiga, clanak, poglavlje, zavrsni i propis su derived iz popisa elemenata na str. 16 i traze ljudsku verifikaciju.
- Naslov djela je u izvorniku koso (kurziv); alat radi plain text.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `853f096a6496...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs fer "Daniel Risavi"`.
