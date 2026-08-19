# Citatni spec: pmf (outcome: custom-spec, status: verified)

Stil: **Harvardski sustav (upute Geografskog odsjeka PMF)** (token `pmf`)
Izvor: Upute za prijavu i izradu diplomskog rada, Geografski odsjek Prirodoslovno-matematičkog fakulteta u Zagrebu (`pmf-geog-upute-diplomski-2026`)
Snapshot: `data/sources/pmf/pmf-geog-diplomski-2026.pdf` (hash `bef096b5167b...`)

## knjiga  [str. 7] (worked-example)
Otvori PDF: `data/sources/pmf/pmf-geog-diplomski-2026.pdf#page=7`
```
TEMPLATE: {authors}, {year}: {title}, {publisher}, {place}.
QUOTE   : Longman, 2013: Longman Dictionary of Contemporary English (New   [grep: OK]
IZVOR   : Longman, 2013: Longman Dictionary of Contemporary English (New Edition), Pearson Education Limited, Harlow.
RENDER  : Longman, 2013: Longman Dictionary of Contemporary English (New Edition), Pearson Education Limited, Harlow.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Jedini knjizni primjer u ekstrakciji je tiskani rjecnik s korporativnim autorom (red 'Referenca u tiskanom rjecniku' u Tab. 1); oblik autor, godina: naslov, izdavac, mjesto. Knjiga s osobnim autorom nije izravno pokazana, pretpostavljen isti oblik s 'Prezime, I.' po uzoru na clanke. Nazivi knjiga pisu se u kurzivu (pravilo str. 5); alat radi plain text.
```

## clanak  [str. 6] (worked-example)
Otvori PDF: `data/sources/pmf/pmf-geog-diplomski-2026.pdf#page=6`
```
TEMPLATE: {authors}, {year}: {title}, {container} {volume}[[ ({issue})]], {pages}[[, DOI: {doi}]].
QUOTE   : Klari, Z., 2016: Geographical aspects of the territorial organisation of   [grep: OK]
IZVOR   : Klari, Z., 2016: Geographical aspects of the territorial organisation of Croatia and comparison with other European countries, Hrvatski geografski glasnik 78 (2), 49-75, DOI: 10.21861/HGG78.02.02.
RENDER  : Klari, Z., 2016: Geographical aspects of the territorial organisation of Croatia and comparison with other European countries, Hrvatski geografski glasnik 78 (2), 49-75, DOI: 10.21861/HGG78.02.02.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Tab. 1: godina iza autora pa dvotocka, naslov, casopis, godiste (volumen) golim brojem, broj sveska u zagradi, paginacija bez 'str.', DOI na kraju ako postoji ('Ako publikacija ima DOI, treba ga navesti na kraju reference u popisu literature', str. 5). Legenda u izvoru: 'Broj 78 oznacuje godiste (volumen) casopisa, (2) broj sveska unutar godista, 49-75 paginaciju rada u svesku'. Dva autora bez veznika: 'Garay, L., Canoves, G., 2011: ...'; tri autora: 'Radeva, K., Nikolova, N., Gera, M., 2018: ...' (svi autori u popisu). Naziv casopisa u kurzivu u izvorniku; alat radi plain text.
```

## poglavlje  [str. 5] (derived)
Otvori PDF: `data/sources/pmf/pmf-geog-diplomski-2026.pdf#page=5`
```
TEMPLATE: {authors}, {year}: {title}, u: {editor} (ur.), {container}, {publisher}, {place}[[, {pages}]].
QUOTE   : Kod urednickih knjiga, ako je knjiga izvorno pisana na hrvatskom, u zagradi iza inicijala   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Ekstrakcija nema cijeli worked-example za poglavlje u urednickoj knjizi (Tab. 1 je stupcano ispremijesana i taj red nije uhvacen). Red je izveden iz oblika za clanak i knjigu (autor, godina: naslov, podaci o izdanju), a oznaka urednika iz pravila: za knjige na hrvatskom '(ur.)', za knjige na engleskom ili drugom jeziku 'ed.' odnosno 'eds.'. Veznik 'u:' nije potvrdjen izvorom. Potvrditi ili oboriti pri verifikaciji nad punom Tab. 1.
```

## mrezni  [str. 7] (worked-example)
Otvori PDF: `data/sources/pmf/pmf-geog-diplomski-2026.pdf#page=7`
```
TEMPLATE: {authors}[[, {year}]]: {title}, {url} ({accessed})
QUOTE   : Longman, 2018: Longman Dictionary of Contemporary English   [grep: OK]
IZVOR   : Longman, 2018: Longman Dictionary of Contemporary English Online, https://www.ldoceonline.com/ (13. 12. 2018.)
RENDER  : Longman, 2018: Longman Dictionary of Contemporary English Online, https://www.ldoceonline.com/ (13. 12. 2018.)
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Red 'Referenca u rjecniku na internetu' u Tab. 1: 'Longman, 2018: Longman Dictionary of Contemporary English Online, https://www.ldoceonline.com/ (13. 12. 2018.)'. Pravilo (str. 5): puna referenca mora sadrzavati ime institucije, tvrtke ili izdavaca, godinu objave (ako je dostupna, zato opcionalna), puni naziv publikacije, link i datum ucitavanja. Primjer nema zavrsnu tocku iza zagrade s datumom; zadrzano doslovno.
```

## zavrsni  [str. 4] (derived)
Otvori PDF: `data/sources/pmf/pmf-geog-diplomski-2026.pdf#page=4`
```
TEMPLATE: {authors}, {year}: {title}, {institution}, {place}.
QUOTE   : Literatura se citira prema harvardskom sustavu.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju citiranje zavrsnih/diplomskih radova kao izvora. Red je izveden iz oblika za knjigu, s ustanovom umjesto izdavaca. Oznaka vrste rada (npr. 'diplomski rad') nije dodana jer je izvor ne potvrdjuje. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 5] (derived)
Otvori PDF: `data/sources/pmf/pmf-geog-diplomski-2026.pdf#page=5`
```
TEMPLATE: {authors}, {year}: {title}, {container}[[ {issue}]][[, {url} ({accessed})]].
QUOTE   : Prilikom citiranja dokumenata ili internetskih stranica pojedinih internetskih portala,   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju pravne propise; za geografiju su rijedak tip izvora. Red je izveden iz oblika za clanak (autor, godina: naslov, publikacija broj) s donositeljem/institucijom kao autorom, po pravilu da se za institucijske dokumente u tekstu navodi ime institucije i godina objave. Broj glasila u opcionalnom issue, mrezna inacica s linkom i datumom po pravilu za internetske izvore. Nepotvrdjeno izvorom, potvrditi pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: ({authorsShort}, {year}, {pages})
RENDER   : (Lovric, 1988)   /  (Lovric, 1988, 45)
QUOTE    : prepricani sadrzaj iz literature, npr. ,,(Chang, 2019)".   [grep: OK]
NAPOMENA : Doslovni citat sa stranicom: '(Chang, 2019, 97)' (stranica odvojena ZAREZOM, ne dvotockom). Dva autora: '(Garay i Canoves, 2011)'. Tri i vise: prezime prvog + 'i dr.', npr. '(Graham i dr., 2000)', a u popisu literature SVI autori. Vise radova u kontinuitetu odvaja se tockom sa zarezom kronoloski '(Andriotis, 2002; 2006)'; ista godina dobiva slova '(Harvey, 2016a; 2016b)'; posredno citiranje preko 'prema' '(Ward 1975 prema Rianovi, 2007)'. Za institucijske dokumente i mrezne stranice u tekstu se navodi ime institucije i godina (str. 5).
```

## Kontradikcije / otvorena pitanja
- Profil-prior ukljucuje ieee, ali u ekstrakciji nema nikakvog traga numerickom stilu; izvor Geografskog odsjeka izrijekom propisuje harvardski sustav (autor-godina), pa je izradjen custom-spec prema primjerima iz Tab. 1.
- Spec je dokazan SAMO za Geografski odsjek (pmf-geog-upute-diplomski-2026); isjecci Bioloskog odsjeka (pmf-biol-upute-diplomski-2026) i PMF pravilnika ne sadrze pravila formata citiranja, pa PMF-wide primjena nije dokazana (PMF je per-odsjek heterogen).
- Tab. 1 je u ekstrakciji stupcano ispremijesana (pdftotext), expected redci su spojeni iz prelomljenih linija; treci primjer clanka (Radeva i dr., 2018) odrezan je na kraju str. 6 pa nije koristen kao example.
- Nekonzistentnost u izvornoj tablici (ili artefakt ekstrakcije): tiskani rjecnik u stupcu citiranja u tekstu ima (Longman, 2003), a puna referenca 2013; mrezni rjecnik u tekstu (Longman, 2013), a referenca 2018.
- Kurziv naziva knjiga, zbornika, casopisa i publikacija (pravilo str. 5) alat ne reproducira; plain text izlaz, navesti kao napomenu na stranici alata.
- initials dotted-spaced je pretpostavka: svi primjeri imaju samo jedan inicijal pa razmak izmedu visestrukih inicijala nije dokaziv.
- Za urednicke knjige na engleskom ili drugom jeziku izvor propisuje 'ed.'/'eds.' umjesto '(ur.)'; template poglavlja nosi samo hrvatsku varijantu (ur.), jezicna varijanta je izvan dosega jednog templatea.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `bef096b5167b...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs pmf "Daniel Risavi"`.
