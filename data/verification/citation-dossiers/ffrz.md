# Citatni spec: ffrz (outcome: custom-spec, status: draft)

Stil: **Autor-godina po pravilima casopisa Obnovljeni zivot (sluzbene upute FFRZ)** (token `ffrz`)
Izvor: Upute za oblikovanje diplomskog rada (FFRZ, 2021), pravila navodenja prema casopisu Obnovljeni zivot (`ffrz-oblikovanje-diplomski-2021`)
Snapshot: `data/sources/ffrz/ffrz-oblikovanje-diplomski-2021.pdf` (hash `224b21163df9...`)

## knjiga  [str. 6] (worked-example)
Otvori PDF: `data/sources/ffrz/ffrz-oblikovanje-diplomski-2021.pdf#page=6`
```
TEMPLATE: {authors} ({year}). {title}. {place}: {publisher}.
QUOTE   : Jambresi, Andrija (1742). Lexicon latinum interpretatione Illyrica, Germanica, et   [grep: OK]
IZVOR   : Jambresi, Andrija (1742). Lexicon latinum interpretatione Illyrica, Germanica, et Hungarica locuples. Zagreb: Typis Academicis Societatis JESU, per Adalbertum Wilh. Wesseli.
RENDER  : Jambresi, Andrija (1742). Lexicon latinum interpretatione Illyrica, Germanica, et Hungarica locuples. Zagreb: Typis Academicis Societatis JESU, per Adalbertum Wilh. Wesseli.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer je iz sekcije 4 (rjecnik citiran kao cjelina), ali slijedi opci oblik autorske knjige: Prezime, Puno ime (godina). Naslov. Mjesto: Izdavac. Tocka iza (godina), dvotocka izmedu mjesta i izdavaca. Vise mjesta ili izdavaca odvaja se crtom s razmacima (primjer Marevi, 2000: Velika Gorica i Zagreb; Marka i Matica hrvatska). Autori se navode prezimenom i punim imenom svih autora (bez inicijala).
```

## poglavlje  [str. 5] (derived)
Otvori PDF: `data/sources/ffrz/ffrz-oblikovanje-diplomski-2021.pdf#page=5`
```
TEMPLATE: {authors} ({year}). {title}. U: {editor} (ur.), {container}. {place}: {publisher}[[, {pages}]].
QUOTE   : objavljen ili gdje se nalazi: naslov publikacije, urednici, mjesto izdanja, izdavac, broj sveska,   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Ekstrakcija nema primjer poglavlja u zborniku (sekcije 1-3 izvora nisu u ekstrakciji). Predlozak izveden iz opceg nacela (izvor nabraja: naslov publikacije, urednici, mjesto izdanja, izdavac, stranice) i oblika za knjigu; veznik 'U:' je evidenciran u primjerima crkvenih dokumenata i enciklopedija. Oznaka (ur.) i tocan redoslijed nisu evidencirani, potvrditi pri verifikaciji.
```

## clanak  [str. 7] (derived)
Otvori PDF: `data/sources/ffrz/ffrz-oblikovanje-diplomski-2021.pdf#page=7`
```
TEMPLATE: {authors} ({year}). {title}. {container}, {volume}[[({issue})]], {pages}.[[ DOI:{doi}]]
QUOTE   : comparison. Philosophy & Social Criticism, 41(1), 21-28. DOI:10.1177/0191453714553496   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Rep primjera clanka je izravno vidljiv u fragmentu: casopis, svezak(broj), stranice, pa 'DOI:' bez razmaka. Pocetak retka (autor, godina, naslov) nije u ekstrakciji (odsjecen na prijelomu stranice), pa je glava predloska izvedena iz opceg nacela i oblika za knjigu; zato derived, ne worked-example. Za internetske izvore navodi se DOI ili URL s datumom pristupa u zagradama.
```

## mrezni  [str. 7] (worked-example)
Otvori PDF: `data/sources/ffrz/ffrz-oblikovanje-diplomski-2021.pdf#page=7`
```
TEMPLATE: {authors}[[ ({year})]]. {title}.[[ U: {container}.]][[ {publisher}.]] URL: {url} ({accessed})
QUOTE   : Anon. Stepinac, Alojzije, bl. U: Hrvatska enciklopedija. Leksikografski zavod Miroslav   [grep: OK]
IZVOR   : Anon. Stepinac, Alojzije, bl. U: Hrvatska enciklopedija. Leksikografski zavod Miroslav Krleza. URL: http://www.enciklopedija.hr/natuknica.aspx?id=58021 (02.11.2016.)
RENDER  : Anon. Stepinac, Alojzije, bl. U: Hrvatska enciklopedija. Leksikografski zavod Miroslav Krleza. URL: http://www.enciklopedija.hr/natuknica.aspx?id=58021 (02.11.2016.)
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Oba primjera u izvoru (Anon i Granderoute) nemaju godinu (pravilo: nedostupni podatci se izostavljaju), pa je (godina) opcionalna grupa. Anonimni autor u primjeru izvora je 'Anon.'. Datum pristupa u zagradama u obliku DD.MM.GGGG. iza URL-a, bez zavrsne tocke iza zagrade.
```

## zavrsni  [str. 5] (derived)
Otvori PDF: `data/sources/ffrz/ffrz-oblikovanje-diplomski-2021.pdf#page=5`
```
TEMPLATE: {authors} ({year}). {title}. {place}: {institution}.
QUOTE   : 1. Autorska knjiga, doktorski ili magistarski rad   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor svrstava doktorske i magistarske radove u istu kategoriju s autorskom knjigom (naslov sekcije 1), ali konkretan primjer nije u ekstrakciji (prijelom stranice). Predlozak izveden iz oblika za knjigu s ustanovom umjesto izdavaca; potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 5] (derived)
Otvori PDF: `data/sources/ffrz/ffrz-oblikovanje-diplomski-2021.pdf#page=5`
```
TEMPLATE: {authors} ({year}). {title}. {container}[[, {issue}]].
QUOTE   : (imena) autora, godina izdanja i naslov rada. Ostali podatci odnose se na mjesto gdje je rad   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju drzavne propise. Predlozak izveden iz opceg nacela bibliografske jedinice (autor ili donositelj, godina, naslov, publikacija odnosno glasilo, broj). Crkveni dokumenti imaju vlastiti kratica-model (u tekstu (GS 30), u popisu npr. 'RF. Relatio finalis. U: ...'), koji je izvan dosega ovog predloska.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: ({authorsShort}, {year}, {pages})
RENDER   : (Lovric, 1988)   /  (Lovric, 1988, 45)
QUOTE    : voce u citiranom izvoru, primjerice: (Macan, 1997, 15-16); (Jalsenjak i Sestak, 2015, 153); (Cifrak i   [grep: OK]
NAPOMENA : Puni primjeri iz izvora: (Macan, 1997, 15-16); (Jalsenjak i Sestak, 2015, 153); (Cifrak i dr., 2008, 32); (Jambresi, 1742, s. v. pietas). Dva autora vezuje 'i', kod tri i vise navodi se samo prvi autor s 'i dr.'. Bazni template bez stranica je izveden (svi primjeri u izvoru imaju stranicu ili s. v.); polje pages moze primiti i 's. v. natuknica'. Vise radova istog autora u istoj godini: 1998a, 1998b, 1998c.
```

## Kontradikcije / otvorena pitanja
- Svi cjeloviti bibliografski primjeri u ekstrakciji su jednoautorski; separator i finalJoiner u authorFormat za popis literature nisu evidencirani, ' i ' je izveden iz unutartekstnog primjera (Jalsenjak i Sestak, 2015, 153). Potvrditi pri verifikaciji, po mogucnosti iz uputa casopisa Obnovljeni zivot.
- Primjer za clanak je u ekstrakciji odsjecen na prijelomu stranice (vidljiv samo rep: Philosophy & Social Criticism, 41(1), 21-28. DOI:...), pa je clanak derived umjesto worked-example.
- Zavrsni rad i drzavni propis nemaju vlastiti primjer u ekstrakciji; zavrsni je izveden iz naslova sekcije 1 (Autorska knjiga, doktorski ili magistarski rad), propis iz opceg nacela.
- Dokument za diplomski rad na str. 5 doslovno kaze 'Bakalaureatski rad se ureuje prema pravilima casopisa Obnovljeni zivot' (vjerojatno prijepis iz bakalaureatskih uputa u samom izvorniku); oba dokumenta (ffrz-oblikovanje-diplomski-2021 i ffrz-oblikovanje-bakalaureatski-2021) propisuju identican stil.
- Kratica-model za djela bez autora, crkvene dokumente i arhivsko gradivo (unutartekstno (GS 30), (HR-HDA-650)) alat ne generira; izvan dosega 6 sourceTypes.
- Prior iz profila ('harvard') je potvrdjen sadrzajem: izvor izrijekom kaze 'tzv. harvardski nacin referiranja po uzoru na standard APA', ali s vlastitim kucnim primjerima casopisa Obnovljeni zivot, pa je ishod custom-spec, ne style-pin.

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs ffrz "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
