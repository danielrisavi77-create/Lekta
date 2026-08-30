# Citatni spec: biotech (outcome: custom-spec, status: verified)

Stil: **Vancouver numeričko (službene upute Odjela za biotehnologiju)** (token `biotech`)
Izvor: Upute za pisanje završnog i diplomskog rada (Odjel za biotehnologiju) (`biotech-upute-radovi`)
Snapshot: `data/sources/biotech/biotech.pdf` (hash `e5182e75a4ad...`)

## clanak  [str. 12] (worked-example)
Otvori PDF: `data/sources/biotech/biotech.pdf#page=12`
```
TEMPLATE: {authors}. {title}. {container} {year}; {volume}: {pages}.
QUOTE   : Silva-Vargas V, Maldonado-Soto AR, Mizrak D, Codega P, Doetsch F.   [grep: OK]
IZVOR   : Silva-Vargas V, Maldonado-Soto AR, Mizrak D, Codega P, Doetsch F. Age-Dependent Niche Signals from the Choroid Plexus Regulate Adult Neural Stem Cells. Cell Stem Cell 2016; 19: 643-652.
RENDER  : Silva-Vargas V, Maldonado-Soto AR, Mizrak D, Codega P, Doetsch F. Age-Dependent Niche Signals from the Choroid Plexus Regulate Adult Neural Stem Cells. Cell Stem Cell 2016; 19: 643-652.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Jedini formatirani primjer u Uputama (str. 12). Puni redak (prelomljen u ekstrakciji): 'Silva-Vargas V, Maldonado-Soto AR, Mizrak D, Codega P, Doetsch F. Age-Dependent Niche Signals from the Choroid Plexus Regulate Adult Neural Stem Cells. Cell Stem Cell 2016; 19: 643-652.' Navode se SVI autori (bez et al.), inicijali bez tocaka i razmaka iza prezimena, casopis i volumen u izvorniku u kurzivu (alat plain text), oblik 'godina; volumen: raspon stranica'. Izvor stil imenuje 'Nature Publishing Group-Vancuver' (Zotero).
```

## knjiga  [str. 12] (derived)
Otvori PDF: `data/sources/biotech/biotech.pdf#page=12`
```
TEMPLATE: {authors}. {title}. {place}: {publisher}; {year}.
QUOTE   : Rad se citira na sljedeći način: svi autori, naslov rada, časopis, godina   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute formatirani primjer daju ISKLJUCIVO za clanak u casopisu; oblik za knjigu je izveden iz iste NPG-Vancouver numericke konvencije (autori 'Prezime II', naslov, mjesto: izdavac; godina). Izvor ga ne egzemplificira, potvrditi ili oboriti pri verifikaciji.
```

## poglavlje  [str. 12] (derived)
Otvori PDF: `data/sources/biotech/biotech.pdf#page=12`
```
TEMPLATE: {authors}. {title}. U: {editor}, ur. {container}. {place}: {publisher}; {year}[[. str. {pages}]].
QUOTE   : Rad se citira na sljedeći način: svi autori, naslov rada, časopis, godina   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Nema primjera za poglavlje u zborniku; oblik je izveden iz NPG-Vancouver konvencije (autori poglavlja, naslov, U: urednik, ur. naslov knjige, mjesto: izdavac; godina, stranice). Izvor ga ne egzemplificira, potvrditi pri verifikaciji.
```

## mrezni  [str. 12] (derived)
Otvori PDF: `data/sources/biotech/biotech.pdf#page=12`
```
TEMPLATE: {authors}. {title}.[[ {container}.]] Dostupno na: {url} (pristupljeno {accessed}).
QUOTE   : Rad se citira na sljedeći način: svi autori, naslov rada, časopis, godina   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju mrezne izvore; oblik i datum pristupa su izvedeni iz Vancouver konvencije za elektronicke izvore. Izvor ga ne egzemplificira, potvrditi pri verifikaciji.
```

## zavrsni  [str. 12] (derived)
Otvori PDF: `data/sources/biotech/biotech.pdf#page=12`
```
TEMPLATE: {authors}. {title} (diplomski rad). {place}: {institution}; {year}.
QUOTE   : Rad se citira na sljedeći način: svi autori, naslov rada, časopis, godina   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute opsirno opisuju izradu zavrsnog i diplomskog rada, ali NE obraduju citiranje takvog rada kao izvora; oblik je izveden iz Vancouver konvencije za teze (naslov [tip rada], ustanova; godina). Izvor ga ne egzemplificira, potvrditi pri verifikaciji.
```

## propis  [str. 12] (derived)
Otvori PDF: `data/sources/biotech/biotech.pdf#page=12`
```
TEMPLATE: {title}. {container}[[ {issue}]].
QUOTE   : Rad se citira na sljedeći način: svi autori, naslov rada, časopis, godina   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju propise/pravne akte kao izvore; oblik (naslov, sluzbeno glasilo, broj) je izveden iz opce hrvatske norme, ne iz izvora. Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Samo clanak u casopisu ima formatirani worked-example (str. 12); knjiga, poglavlje, mrezni, zavrsni i propis su DERIVED iz imenovanog NPG-Vancouver numerickog stila i izvor ih ne egzemplificira. Svaki derived predlozak zasebno provjeriti.
- Izvor stil izrijekom imenuje 'Nature Publishing Group-Vancuver' (Zotero), sto potvrduje prior ['vancouver']; derived tipovi primjenjuju genericku Vancouver konvenciju koja se moze razlikovati od NPG specifičnosti.
- Izvor trazi navodenje SVIH autora ('svi autori', str. 12), pa je etAlAfter=null (bez skracivanja); genericki NPG/Vancouver inace skracuje nakon 6 autora, provjeriti.
- Naziv casopisa i volumen su u izvorniku u kurzivu (*Cell Stem Cell* 2016; *19*); alat daje plain text bez kurziva.
- Raspon stranica u izvoru koristi crtu (n-crtu ostecenu u pdftotext-u kao znak '�'); alat izlaze obicnu spojnicu (643-652).

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `e5182e75a4ad...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs biotech "Daniel Risavi"`.
