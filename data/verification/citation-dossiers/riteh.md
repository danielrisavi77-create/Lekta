# Citatni spec: riteh (outcome: custom-spec, status: verified)

Stil: **Numericko citiranje u uglatim zagradama (sluzbene upute RiTeh)** (token `riteh`)
Izvor: Upute za izradu zavrsnog i diplomskog rada (Tehnicki fakultet u Rijeci) (`riteh-upute-radovi-2025`)
Snapshot: `data/sources/riteh/riteh.pdf` (hash `017dda8a9896...`)

## knjiga  [str. 7] (worked-example)
Otvori PDF: `data/sources/riteh/riteh.pdf#page=7`
```
TEMPLATE: {authors}: "{title}", {publisher}, {place}, {year}.
QUOTE   : [1] Poor, H.: "An Introduction to Signal Detection and Estimation", Springer-Verlag, New York,   [grep: OK]
IZVOR   : Poor, H.: "An Introduction to Signal Detection and Estimation", Springer-Verlag, New York, 1985.
RENDER  : Poor, H.: "An Introduction to Signal Detection and Estimation", Springer-Verlag, New York, 1985.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Autori family-first s inicijalima (Prezime, I.), vise autora odvojeno '; ', dvotocka iza autora, naslov u navodnicima. Redni broj [1] je oznaka popisa, ne dio bibliografskog retka. Vise od tri autora: prvi autor + 'i dr.' (str. 7).
```

## clanak  [str. 7] (worked-example)
Otvori PDF: `data/sources/riteh/riteh.pdf#page=7`
```
TEMPLATE: {authors}: "{title}", {container}[[, Vol. {volume}]][[, No. {issue}]][[, pp. {pages}]], {year}.
QUOTE   : Frequency Signals", IEEE Trans. Ind. Electron., Vol. 44, No. 2, pp. 258-264, 1997.   [grep: OK]
IZVOR   : Vainio, O.; Ovaska, S. J.: "Multistage Adaptive Filters for In-Phase Processing of Line-Frequency Signals", IEEE Trans. Ind. Electron., Vol. 44, No. 2, pp. 258-264, 1997.
RENDER  : Vainio, O.; Ovaska, S. J.: "Multistage Adaptive Filters for In-Phase Processing of Line-Frequency Signals", IEEE Trans. Ind. Electron., Vol. 44, No. 2, pp. 258-264, 1997.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Naziv casopisa, zatim Vol. (godiste), No. (broj), pp. (raspon stranica) i godina. Worked example ne sadrzi mjesto izdavanja iako ga geneicki predlozak spominje; predlozak gradjen iskljucivo iz primjera pa je Vol./No./pp. opcionalna grupa.
```

## mrezni  [str. 7] (worked-example)
Otvori PDF: `data/sources/riteh/riteh.pdf#page=7`
```
TEMPLATE: {authors}: "{title}", s Interneta, {url}, {accessed}.
QUOTE   : [4] Ally, M.: "Osnovne obrazovne teorije online ucenja", s Interneta,   [grep: OK]
IZVOR   : Ally, M.: "Osnovne obrazovne teorije online ucenja", s Interneta, http://www.carnet.hr/casopis/38/clanci/3, 11. rujna 2006.
RENDER  : Ally, M.: "Osnovne obrazovne teorije online ucenja", s Interneta, http://www.carnet.hr/casopis/38/clanci/3, 11. rujna 2006.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Uz internetsku adresu obvezno se navode autor citiranog materijala i tocan datum pristupa; oznaka 's Interneta' pise se doslovno prije URL-a (str. 6-7).
```

## zavrsni  [str. 7] (worked-example)
Otvori PDF: `data/sources/riteh/riteh.pdf#page=7`
```
TEMPLATE: {authors}: "{title}", doktorska disertacija, {institution}, {place}, {year}.
QUOTE   : [3] Williams, J.: "Narrow-band Analyzer", doktorska disertacija, Dept. Elect. Eng., Harvard Univ.,   [grep: OK]
IZVOR   : Williams, J.: "Narrow-band Analyzer", doktorska disertacija, Dept. Elect. Eng., Harvard Univ., Cambridge, MA, 1993.
RENDER  : Williams, J.: "Narrow-band Analyzer", doktorska disertacija, Dept. Elect. Eng., Harvard Univ., Cambridge, MA, 1993.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Jedini primjer studentskog/kvalifikacijskog rada u izvoru je doktorska disertacija: autor, naslov u navodnicima, vrsta rada, ustanova/odsjek, mjesto, godina. Za diplomski/zavrsni oznaka vrste rada bi se mijenjala; zadrzana doslovna 'doktorska disertacija' iz primjera.
```

## poglavlje  [str. 6] (derived)
Otvori PDF: `data/sources/riteh/riteh.pdf#page=6`
```
TEMPLATE: {authors}: "{title}", u: {editor} (ur.), {container}, {publisher}, {place}, {year}.
QUOTE   : [1] Prezime1, I1.; Prezime2, I2.; Prezime3, I3.: "Naslov knjige", Izdavac, mjesto izdavanja, godina.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor ne daje primjer poglavlja u uredjenoj knjizi/zborniku. Predlozak je izveden iz oblika za knjigu ubacivanjem urednika 'u: {editor} (ur.),' i naziva zbornika; potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 7] (derived)
Otvori PDF: `data/sources/riteh/riteh.pdf#page=7`
```
TEMPLATE: {title}, {container}[[, br. {issue}]], {year}.
QUOTE   : Postoje razliciti izvori informacija, a kao literaturu je najbolje koristiti strucne knjige i   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute (tehnicki fakultet) ne obradjuju citiranje propisa/pravnih akata; izvor pokriva samo knjige, clanke i internetske izvore. Predlozak je izveden iz uobicajenog hrvatskog oblika (naslov, glasilo, broj, godina); potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Prior hint bio je 'ieee', no izvor propisuje family-first imena (Prezime, I.) s odvajanjem '; ' i naslovom u navodnicima, sto se razlikuje od standardnog IEEE (given-first 'I. Prezime', bez navodnika). Slijedi se IZVOR: numericki stil u uglatim zagradama slican IEEE-u ali s vlastitim formatom autora.
- Poglavlje u uredjenoj knjizi/zborniku nije pokriveno primjerom u izvoru; predlozak je derived iz oblika za knjigu.
- Propis/pravni akt nije pokriven u izvoru (tehnicki fakultet); predlozak je derived iz opceg oblika.
- Jedini primjer kvalifikacijskog rada je doktorska disertacija; doslovna oznaka 'doktorska disertacija' zadrzana je iz primjera iako bi se za diplomski/zavrsni razlikovala.
- Worked example clanka ne sadrzi mjesto izdavanja iako ga genericki predlozak na str. 7 spominje; predlozak gradjen iskljucivo iz primjera pa mjesto nije ukljuceno.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `017dda8a9896...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs riteh "Daniel Risavi"`.
