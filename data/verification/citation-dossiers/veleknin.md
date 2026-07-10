# Citatni spec: veleknin (outcome: custom-spec, status: draft)

Stil: **Autor-godina (sluzbene upute Veleucilista Marko Marulic u Kninu)** (token `veleknin`)
Izvor: Upute za izradu i obranu zavrsnog rada (Veleuciliste Marko Marulic u Kninu) (`veleknin-upute-zavrsni-2020`)
Snapshot: `data/sources/veleknin/veleknin.pdf` (hash `e383dfbd3d6a...`)

## knjiga  [str. 12] (worked-example)
Otvori PDF: `data/sources/veleknin/veleknin.pdf#page=12`
```
TEMPLATE: {authors} ({year}): {title}. {publisher}, {place}.
QUOTE   : Rupi, V. (2009): Zastita zdravlja domaih zivotinja 1. Unutrasnje i kirurske bolesti i zahvati.   [grep: OK]
IZVOR   : Rupi, V. (2009): Zastita zdravlja domaih zivotinja 1. Unutrasnje i kirurske bolesti i zahvati. Hrvatska mljekarska udruga, Zagreb.
RENDER  : Rupi, V. (2009): Zastita zdravlja domaih zivotinja 1. Unutrasnje i kirurske bolesti i zahvati. Hrvatska mljekarska udruga, Zagreb.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Cijeli primjer (spojena dva retka), sekcija 6.2 'Knjige - jedan autor': Rupi, V. (2009): Zastita zdravlja domaih zivotinja 1. Unutrasnje i kirurske bolesti i zahvati. Hrvatska mljekarska udruga, Zagreb. Prezime pa inicijal(i) imena, godina u zagradi iza koje ide DVOTOCKA, naslov s tockom, zatim izdavac, ZAREZ, mjesto, tocka. Dijakritika ostecena od pdftotext-a ('Rupi' = Rupic, 'domaih' = domacih).
```

## mrezni  [str. 14] (worked-example)
Otvori PDF: `data/sources/veleknin/veleknin.pdf#page=14`
```
TEMPLATE: {authors} ({year}): {title}. Dostupno na: {url} (pristupljeno {accessed}).
QUOTE   : Wood, B. J. B., Holzapfel, W. H. (1995): Genera of lactic acid bacteria. Dostupno na:   [grep: OK]
IZVOR   : Wood, B. J. B., Holzapfel, W. H. (1995): Genera of lactic acid bacteria. Dostupno na: http://books.google.hr/books?id=Q8B_WusVacsC&printsec=frontcover#v=onepage&q&f=true (pristupljeno 19.04.2015.).
RENDER  : Wood, B. J. B., Holzapfel, W. H. (1995): Genera of lactic acid bacteria. Dostupno na: http://books.google.hr/books?id=Q8B_WusVacsC&printsec=frontcover#v=onepage&q&f=true (pristupljeno 19.04.2015.).
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Cijeli primjer (spojena tri retka), sekcija 'Mrezni izvori': Wood, B. J. B., Holzapfel, W. H. (1995): Genera of lactic acid bacteria. Dostupno na: http://books.google.hr/books?id=Q8B_WusVacsC&printsec=frontcover#v=onepage&q&f=true (pristupljeno 19.04.2015.). Isti autor-godina-dvotocka oblik kao knjiga, zatim 'Dostupno na:' + URL + '(pristupljeno DATUM).'. Dva autora odvojena su ZAREZOM (', '); inicijali su razmaknuti s tockom (dotted-spaced, 'B. J. B.').
```

## clanak  [str. 12] (derived)
Otvori PDF: `data/sources/veleknin/veleknin.pdf#page=12`
```
TEMPLATE: {authors} ({year}): {title}. {container}[[, {volume}]][[({issue})]][[: {pages}]].
QUOTE   : U popisu literature navode se svi izvori (knjige, znanstveni i strucni clanci, pravilnici i ostalo)   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Sekcija 6.2 popis literature izricito imenuje 'znanstvene i strucne clanke' kao vrstu izvora, ali NE daje formatirani primjer clanka (ekstrakcija sadrzi samo primjer knjige i mreznog izvora). Predlozak je izveden iz oblika za knjigu (autor, (godina):, naslov.) prosiren nazivom casopisa, sveskom, brojem i rasponom stranica po opcem hrvatskom prirodoznanstvenom obicaju. Interpunkciju (zarez/dvotocka oko volumena i stranica) potvrditi ili oboriti pri verifikaciji.
```

## poglavlje  [str. 12] (derived)
Otvori PDF: `data/sources/veleknin/veleknin.pdf#page=12`
```
TEMPLATE: {authors} ({year}): {title}. U: {editor} (ur.), {container}. {publisher}, {place}.
QUOTE   : 6.2. Izrada popisa literature   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Poglavlje u knjizi/zborniku nije prikazano u ekstrakciji (pada pod 'i ostalo' iz popisa vrsta izvora). Predlozak je izveden iz oblika za knjigu uz umetak 'U: urednik (ur.), naslov djela'. Redoslijed izdavac, mjesto preuzet iz potvrdenog oblika za knjigu. Potvrditi ili oboriti pri verifikaciji.
```

## zavrsni  [str. 12] (derived)
Otvori PDF: `data/sources/veleknin/veleknin.pdf#page=12`
```
TEMPLATE: {authors} ({year}): {title}. Zavrsni rad. {institution}, {place}.
QUOTE   : 6.2. Izrada popisa literature   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute NE obraduju citiranje zavrsnih/diplomskih radova kao izvora (dokument propisuje IZRADU zavrsnog rada, ne njegovo citiranje). Predlozak je izveden iz oblika za knjigu: izdavac zamijenjen ustanovom, dodana oznaka vrste rada 'Zavrsni rad.'. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 12] (derived)
Otvori PDF: `data/sources/veleknin/veleknin.pdf#page=12`
```
TEMPLATE: {title} ({year}): {container}[[, {issue}]].
QUOTE   : U popisu literature navode se svi izvori (knjige, znanstveni i strucni clanci, pravilnici i ostalo)   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Popis literature imenuje 'pravilnike' kao vrstu izvora, ali bibliografski oblik propisa nije prikazan (u tekstu se propisi navode samo in-text: 'Pravilnik ... (NN 01/13)' i '(Anonymus, 2013)', str. 12). Predlozak je minimalno izveden iz opceg autor-godina reda natuknice (naslov propisa, godina u zagradi s dvotockom, glasilo, broj). Potvrditi pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: (nema)
RENDER   : (Lovric, 1988)   /  (Lovric, 1988)
QUOTE    : (Rahman, 2014).   [grep: OK]
NAPOMENA : Sekcija 6.1 Citiranje izvora u tekstu. Jedan autor: '(Rahman, 2014)' ili narativno 'prema Rahmanu (2014)' (str. 11). Dva autora spajaju se s ' i ': '(Konrad i Marosevi, 2001)' (str. 11). Tri i vise autora: prvi autor + 'i sur.': 'Davier i sur. (2012)' (str. 12). Organizacije/institucije: '(WHO, 2010)', '(HZN, 2004)' (str. 12). Vise radova istog autora iz iste godine: '2015a; 2015b' (str. 12). Oblik s brojem stranice nije prikazan u izvoru pa withPagesTemplate nije definiran.
```

## Kontradikcije / otvorena pitanja
- PRIOR iz profila je prazan; izvor daje vlastite worked-example primjere (autor-godina s dvotockom iza godine) pa je spec izveden iskljucivo iz njih, a ne pinnan na standardni stil.
- Izvor propisuje da se literatura navodi abecednim redom prema prezimenu prvog autora i kronoloski (str. 12), ali istovremeno trazi da se 'literaturne izvore numerira' (str. 12); numeriranje je ovdje samo redni broj abecedno sortiranog popisa, a in-text ostaje autor-godina, pa je bibliography.sort = alphabetical, a mode = author-year.
- Worked-example primjeri postoje samo za knjigu (str. 12) i mrezni izvor (str. 14); clanak, poglavlje, zavrsni i propis su izvedeni (derived) i traze verifikaciju.
- Primjer knjige ima jedan inicijal ('Rupi, V.'), ali mrezni primjer potvrduje razmaknute inicijale s tockom ('Wood, B. J. B.'), pa je initials = dotted-spaced potvrden.
- Naslovi u izvorniku (knjige/casopisi) mogli bi biti kurzivom; ekstrakcija to ne pokazuje pa se ne pretpostavlja, a alat ionako radi plain text.
- Propis se in-text navodi dvojako: preko broja Narodnih novina ('(NN 01/13)') i preko '(Anonymus, godina)' (str. 12); bibliografski oblik propisa nije potvrden.

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs veleknin "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
