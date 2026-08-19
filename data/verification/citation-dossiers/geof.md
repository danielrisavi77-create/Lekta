# Citatni spec: geof (outcome: custom-spec, status: verified)

Stil: **GEOF autor-godina (službeni Naputak za ocjenske radove)** (token `geof`)
Izvor: Opći naputak za pisanje ocjenskih radova na Geodetskom fakultetu (`geof-naputak-ocjenski-2000`)
Snapshot: `data/sources/geof/geof-naputak-ocjenski-2000.pdf` (hash `c68ba17ed259...`)

## knjiga  [str. 3] (worked-example)
Otvori PDF: `data/sources/geof/geof-naputak-ocjenski-2000.pdf#page=3`
```
TEMPLATE: {authors} ({year}): {title}, {publisher}, {place}.
QUOTE   : Lovric, P. (1988): Opa kartografija, Sveucilisna naklada Liber, Zagreb.   [grep: OK]
IZVOR   : Lovric, P. (1988): Opa kartografija, Sveucilisna naklada Liber, Zagreb.
RENDER  : Lovric, P. (1988): Opa kartografija, Sveucilisna naklada Liber, Zagreb.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Rule-text redoslijed: prezime autora (vise ih se odvaja zarezom), inicijali imena, godina u zagradi, naslov knjige, izdavac, mjesto izdanja. Dvotocka iza (godine). Dijakritika u ekstrakciji ostecena ('Opa' = Opca).
```

## clanak  [str. 3] (worked-example)
Otvori PDF: `data/sources/geof/geof-naputak-ocjenski-2000.pdf#page=3`
```
TEMPLATE: {authors} ({year}): {title}, {container} {volume}, {pages}.
QUOTE   : Coli, K. (1996): Geodezija u Hrvatskoj 1991-1994, Geodetski list 1, 17-28.   [grep: OK]
IZVOR   : Coli, K. (1996): Geodezija u Hrvatskoj 1991-1994, Geodetski list 1, 17-28.
RENDER  : Coli, K. (1996): Geodezija u Hrvatskoj 1991-1994, Geodetski list 1, 17-28.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Rule-text nabraja: prezime autora, inicijali imena, godina u zagradi, naslov clanka, broj sveska, pocetna i zavrsna stranica; primjer sadrzi i naslov casopisa (Geodetski list) prije broja sveska pa ga template ukljucuje. Nema zasebnog broja godista/issue. 'Coli' je ostecena dijakritika (Colic).
```

## poglavlje  [str. 3] (derived)
Otvori PDF: `data/sources/geof/geof-naputak-ocjenski-2000.pdf#page=3`
```
TEMPLATE: {authors} ({year}): {title}, u: {editor} (ur.), {container}, {publisher}, {place}[[, {pages}]].
QUOTE   : Lovric, P. (1988): Opa kartografija, Sveucilisna naklada Liber, Zagreb.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Naputak ne obraduje poglavlje u zborniku. Predlozak je izveden iz oblika za knjigu (autor (godina): naslov, izdavac, mjesto) uz uobicajeni hrvatski urednicki umetak 'u: Urednik (ur.), Zbornik'. Potvrditi ili oboriti pri verifikaciji.
```

## mrezni  [str. 3] (derived)
Otvori PDF: `data/sources/geof/geof-naputak-ocjenski-2000.pdf#page=3`
```
TEMPLATE: {authors} ({year}): {title}, {url}[[, pristupljeno {accessed}]].
QUOTE   : prezime autora (ako iz ima vise odvajaju se zarezom), inicijali imena, godina u   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Naputak (iz 2000.) ne obraduje mrezne izvore. Predlozak je izveden iz opceg oblika autor (godina): naslov uz dodan URL; datum pristupa je opcionalan jer ga izvor ne propisuje (accessDate false). Potvrditi ili oboriti pri verifikaciji.
```

## zavrsni  [str. 3] (derived)
Otvori PDF: `data/sources/geof/geof-naputak-ocjenski-2000.pdf#page=3`
```
TEMPLATE: {authors} ({year}): {title}, {institution}, {place}.
QUOTE   : Lovric, P. (1988): Opa kartografija, Sveucilisna naklada Liber, Zagreb.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Naputak ne obraduje citiranje zavrsnih/diplomskih radova. Predlozak izveden iz oblika za knjigu (izdavac zamijenjen ustanovom). Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 3] (derived)
Otvori PDF: `data/sources/geof/geof-naputak-ocjenski-2000.pdf#page=3`
```
TEMPLATE: {title} ({year}): {container}[[ {issue}]].
QUOTE   : Coli, K. (1996): Geodezija u Hrvatskoj 1991-1994, Geodetski list 1, 17-28.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Naputak ne obraduje citiranje propisa. Predlozak izveden iz oblika za clanak: naslov propisa na mjestu autora (propisi nemaju osobnog autora), glasilo kao container, broj glasila kao issue. Potvrditi ili oboriti pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort} {year})   /  s pages: (nema)
RENDER   : (Lovric 1988)   /  (Lovric 1988)
QUOTE    : izdanja, npr.: (Lovri 1988).   [grep: OK]
NAPOMENA : Puna recenica: 'Literatura se u tekstu citira navodenjem u zagradi prezimena autora i godine izdanja'. Primjer '(Lovri 1988)' (ostecena dijakritika, izvorno Lovric): prezime i godina BEZ zareza. Ponasanje za 2+ autora u tekstu nije obradeno u izvoru.
```

## Kontradikcije / otvorena pitanja
- Prior iz profila je 'harvard'; izvor jest autor-godina (blizak Harvardu), ali daje vlastite worked-example oblike (dvotocka iza (godine) u literaturi, in-text '(Lovri 1988)' bez zareza), pa je ishod custom-spec, ne cisti harvard pin.
- Primjeri imaju samo po jedan inicijal pa 'dotted-spaced' za visestruke inicijale nije potvrden.
- Rule-text za clanak ne spominje naslov casopisa, ali worked-example ga sadrzi (Geodetski list); template slijedi primjer.
- Poglavlje, mrezni, zavrsni i propis nisu pokriveni Naputkom; predlosci su izvedeni (derived) iz oblika za knjigu/clanak.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `c68ba17ed259...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs geof "Daniel Risavi"`.
