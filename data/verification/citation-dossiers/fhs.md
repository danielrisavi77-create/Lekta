# Citatni spec: fhs (outcome: custom-spec, status: verified)

Stil: **Prilagođeni APA 7 autor-godina (službene upute FHS za diplomski rad)** (token `fhs-apa`)
Izvor: Upute za izradu diplomskoga rada (Fakultet hrvatskih studija, 2026) (`fhs-upute-diplomski-2026`)
Snapshot: `data/sources/fhs/fhs-upute-diplomski-2026.pdf` (hash `8807628d8863...`)

## knjiga  [str. 19] (worked-example)
Otvori PDF: `data/sources/fhs/fhs-upute-diplomski-2026.pdf#page=19`
```
TEMPLATE: {authors} ({year}). {title}. {place}: {publisher}.
QUOTE   : Tierney, R.J., Carter, M.A. i Desai, L.E. (1991). Portfolio assessment in reading-writing classrooms.   [grep: OK]
IZVOR   : Tierney, R.J., Carter, M.A. i Desai, L.E. (1991). Portfolio assessment in reading-writing classrooms. Norwood, MA: Christopher-Gordon.
RENDER  : Tierney, R. J., Carter, M. A. i Desai, L. E. (1991). Portfolio assessment in reading-writing classrooms. Norwood, MA: Christopher-Gordon.
VERDIKT : DIFF (deklariran)  <-- USPOREDI ZNAK PO ZNAK
DEKLARIRANO: Izvor je interno nekonzistentan u inicijalima: ovaj primjer ima kompaktne (R.J.), a drugi primjeri razmaknute (M. O.); spec koristi dotted-spaced kao prevladavajuci oblik pa render pise 'R. J.'. Covjek bira pri verifikaciji.
NAPOMENA: Nastavak prelomljenog retka: 'Norwood, MA: Christopher-Gordon.' Shema u izvoru: '(Prezime(na) autora, inicijal imena. (godina izdavanja). Naslov knjige. Grad izdavanja: Ime izdavaca.)' (str. 19). Drugi primjer (Nunnally i Bernstein, 1994) ima izdanje u zagradi unutar naslova ('Psychometric theory (3rd edition)'); izdanje ide u polje title. Naslov knjige je u izvorniku vjerojatno kurzivom, alat radi plain text. OCEKIVANI DIFF u dosjeu: primjer u izvoru ima kompaktne inicijale (R.J.), a spec koristi dotted-spaced (R. J.) kao prevladavajuci oblik iz drugih primjera; izvor je interno nekonzistentan, covjek bira.
```

## poglavlje  [str. 19] (worked-example)
Otvori PDF: `data/sources/fhs/fhs-upute-diplomski-2026.pdf#page=19`
```
TEMPLATE: {authors} ({year}). {title}. U {editor} (ur.), {container}[[ (str. {pages})]]. {place}: {publisher}.
QUOTE   : Delale, E. A., Branica, V. (2007). Ethnicity in the Curriculum and Research of the Croatian School   [grep: OK]
IZVOR   : Delale, E. A., Branica, V. (2007). Ethnicity in the Curriculum and Research of the Croatian School of Social Work. U D. Zavirsek, J. Zorn, LJ. Rihter, S. Znidarec Demsar (ur.), Ethnicity in Eastern Europe, A challenge for Social Work Education (str. 197-213). Ljubljana: Fakulteta za socijalno delo (Book series Anti-rasist social work).
RENDER  : Delale, E. A. i Branica, V. (2007). Ethnicity in the Curriculum and Research of the Croatian School of Social Work. U D. Zavirsek, J. Zorn, LJ. Rihter, S. Znidarec Demsar (ur.), Ethnicity in Eastern Europe, A challenge for Social Work Education (str. 197-213). Ljubljana: Fakulteta za socijalno delo (Book series Anti-rasist social work).
VERDIKT : DIFF (deklariran)  <-- USPOREDI ZNAK PO ZNAK
DEKLARIRANO: Izvor je interno nekonzistentan u spajanju autora: ovaj primjer spaja dva autora zarezom bez 'i', a vecina primjera koristi ' i ' (Martin i Morgan, Nunnally i Bernstein); spec koristi finalJoiner ' i '. Covjek bira pri verifikaciji.
NAPOMENA: Nastavak prelomljenih redaka: 'of Social Work. U D. Zavirsek, J. Zorn, LJ. Rihter, S. Znidarec Demsar (ur.), Ethnicity in Eastern Europe, A challenge for Social Work Education (str. 197-213). Ljubljana: Fakulteta za socijalno delo (Book series Anti-rasist social work).' Shema u izvoru: '(Prezime autora, inicijali imena. (godina izdavanja). Naslov poglavlja u knjizi. Urednik(ci) ...' (str. 19). UREDNICI se pisu inicijal-prvo (npr. 'B. Greer i G. Mulhern' u Oldham primjeru, str. 18), suprotno od autora. 'U' bez dvotocke, '(ur.)' s tockom. Oldham primjer (str. 18 i 19) potvrduje isti oblik. OCEKIVANI DIFF u dosjeu: primjer spaja dva autora zarezom bez 'i' (Delale, E. A., Branica, V.), a spec koristi finalJoiner ' i ' iz vecine primjera; izvor je interno nekonzistentan, covjek bira.
```

## clanak  [str. 18] (worked-example)
Otvori PDF: `data/sources/fhs/fhs-upute-diplomski-2026.pdf#page=18`
```
TEMPLATE: {authors} ({year}). {title}. {container}, {volume}[[({issue})]], {pages}.
QUOTE   : Martin, M. O. i Morgan, M. (1994). Reading literacy in Irish schools: A comparative analysis. Irish   [grep: OK]
IZVOR   : Martin, M. O. i Morgan, M. (1994). Reading literacy in Irish schools: A comparative analysis. Irish Journal of Education, 26(1), 3-101.
RENDER  : Martin, M. O. i Morgan, M. (1994). Reading literacy in Irish schools: A comparative analysis. Irish Journal of Education, 26(1), 3-101.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Nastavak prelomljenog retka: 'Journal of Education, 26(1), 3-101.' Shema u izvoru: '(Prezime autora, inicijal imena. (godina izdavanja). Naslov rada. Naslov casopisa, volumen' (str. 18, prelomljeno). Broj sveska ide u zagradu odmah iza volumena bez razmaka: 26(1). Naslov casopisa je u izvorniku vjerojatno kurzivom, alat radi plain text.
```

## mrezni  [str. 7] (derived)
Otvori PDF: `data/sources/fhs/fhs-upute-diplomski-2026.pdf#page=7`
```
TEMPLATE: {authors} ({year}). {title}.[[ {container}.]] {url}
QUOTE   : Općenito, sadržaj i uređenje teksta treba biti u skladu s APA standardima za pisanje   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Ekstrahirani isjecci NE pokrivaju mrezne izvore (odjeljak o novinskim napisima i intervjuima je odrezan na kraju ekstrakcije). Predlozak je izveden iz opceg APA 7 oblika (autor, godina, naslov, naziv stranice, URL) na koji se upute izrijekom pozivaju; APA 7 ne trazi datum pristupa za stabilan sadrzaj pa je accessed izostavljen. Potvrditi ili oboriti pri verifikaciji.
```

## zavrsni  [str. 19] (derived)
Otvori PDF: `data/sources/fhs/fhs-upute-diplomski-2026.pdf#page=19`
```
TEMPLATE: {authors} ({year}). {title}. {place}: {institution}.
QUOTE   : (Prezime autora, inicijal imena. (godina obrane). Naslov rada. Mjesto i institucija obrane.)   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor daje samo shemu ('Doktorske disertacije, magisteriji, diplomski radovi', str. 19) bez konkretnog worked-examplea. Veznik izmedju mjesta i institucije nije preciziran ('Mjesto i institucija obrane'); interpunkcija 'Mjesto: Institucija' izvedena po analogiji sa shemom za knjigu (Grad izdavanja: Ime izdavaca). Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 20] (worked-example)
Otvori PDF: `data/sources/fhs/fhs-upute-diplomski-2026.pdf#page=20`
```
TEMPLATE: {title}. {container}, br. {issue}.
QUOTE   : Obiteljski zakon. Narodne novine, br. 116/2003, 25/2013.   [grep: OK]
IZVOR   : Obiteljski zakon. Narodne novine, br. 116/2003, 25/2013.
RENDER  : Obiteljski zakon. Narodne novine, br. 116/2003, 25/2013.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Shema u izvoru: '(Ime zakona. Narodne novine, br. broj(evi) zakona.)' (str. 20). Izvor nudi i alternativni oblik s publikacijom kao autorom: 'Narodne novine (1992) Zakon o visokim ucilistima. Zagreb: Narodne novine d.d., 49 (1), str. 2142-2159.' (str. 20); alat koristi kraci primarni oblik. Citiranje pravnih izvora u tekstu: '(Obiteljski zakon, NN 116/2003, cl. 11, st1)' (str. 23).
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: ({authorsShort}, {year}; str. {pages})
RENDER   : (Lovric, 1988)   /  (Lovric, 1988; str. 45)
QUOTE    : djelu neka vrsta prostorne interakcije" (Coren, Ward i Enns, 2003; str. 109).   [grep: OK]
NAPOMENA : Parenteticki bez stranica: '(Wilson i Patterson, 1968)' (str. 20); doslovni citat sa stranicom koristi tocku-zarez prije 'str.'. 3 do 5 autora: pri PRVOM navodenju svi (Aronson, Wilson i Akert, 2005), kasnije 'Aronson i sur., 2005'; 6+ autora uvijek samo prvi + 'i sur.' (str. 21). etAlAfter 5 pokriva prvo navodenje, kasnija skracivanja provjerava analizator, ne generator. U tekstu izvan zagrade pise se 'i suradnici', u zagradi kratica 'i sur.'. Sekundarne reference oblika 'Smith i Kline (1992, prema Garder, 2002)' (str. 21) su izvan dosega generatora.
```

## Kontradikcije / otvorena pitanja
- Prior profila je apa7 i izvor se izrijekom poziva na APA 7 ('Publication Manual of the American Psychological Association, 7th edition', str. 7), ali uz ogradu 'osim u slucajevima u kojima APA standardi odstupaju od kulturalnih i jezicnih normi hrvatskoga jezika' i s vlastitim pravilima koja odstupaju: 'i' umjesto '&', 'U ... (ur.)' umjesto 'In ... (Ed.)', 'i sur.' umjesto 'et al.'; zato custom-spec, ne cisti style-pin apa7.
- In-text za 3 do 5 autora: pri prvom navodenju SVI autori (str. 21), dok APA 7 skracuje na 'et al.' vec od 3 autora; slijedi izvor.
- Doslovni citat navodi stranicu oblikom '; str. N' ('(Coren, Ward i Enns, 2003; str. 109)', str. 21; '(Milas, 2009; str.76)', str. 6), sto odstupa od APA 7 (', p. N'); razmak iza 'str.' nekonzistentan u izvoru, odabran oblik s razmakom.
- Isti autor s vise referenci: 'prvo se pisu one koje su novijega datuma' (str. 18), obrnuto od APA 7 (starije prvo); sortiranje unutar istog autora je izvan dosega generatora, biljezi se za analizator.
- Izvor sam deklarira odstupanje kod sekundarnih referenci: 'Stavite godinu i zarez iza godine (iako odstupa od APA preporuka).' (str. 21).
- Primjeri u izvoru nekonzistentni u inicijalima ('M. O.' s razmakom nasuprot 'R.J.' bez razmaka) i u spajanju autora ('Delale, E. A., Branica, V.' zarezom bez 'i'); odabrano dotted-spaced i finalJoiner ' i ' kao prevladavajuce (Martin i Morgan; Nunnally i Bernstein; Tierney, Carter i Desai).
- Mrezni izvori i zavrsni radovi nemaju worked-example u ekstrakciji; predlosci su derived (mrezni iz APA 7 oblika, zavrsni iz sheme u izvoru), example je null.
- Drugi izvor iz INDEX-a (fhs-upute-zavrsni-diplomski-2023, 9 isjecaka) NIJE prisutan u ekstrakcijskoj datoteci (odrezana na cap od ~19k znakova); nacrt je u cijelosti iz fhs-upute-diplomski-2026. Upute su izrazito psihologijski usmjerene (struktura Uvod/Metoda/Rezultati, Kodeks etike psiholoske djelatnosti), pa domet izvan studija psihologije potvrditi pri verifikaciji.
- Kurziv naslova (knjige, casopisi) nije vidljiv u tekstualnoj ekstrakciji; alat radi plain text.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `8807628d8863...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs fhs "Daniel Risavi"`.
