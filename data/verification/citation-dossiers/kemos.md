# Citatni spec: kemos (outcome: custom-spec, status: verified)

Stil: **Brojčani stil citiranja (službene upute Odjela za kemiju u Osijeku)** (token `kemos-brojcani`)
Izvor: Upute za pisanje završnog / diplomskog rada, Sveučilište u Osijeku, Odjel za kemiju (lipanj 2024.) (`kemos-upute-radovi-2024`)
Snapshot: `data/sources/kemos/kemos-upute-radovi-2024.pdf` (hash `c4e0f565e130...`)

## knjiga  [str. 11] (worked-example)
Otvori PDF: `data/sources/kemos/kemos-upute-radovi-2024.pdf#page=11`
```
TEMPLATE: {authors}, {title}, {publisher}, {place}, {year}[[, p. {pages}]].
QUOTE   : 2. E. Wingender, Gene Regulation in Eukaryotes, VCH, Weinheim, 1993, p. 215.   [grep: OK]
IZVOR   : E. Wingender, Gene Regulation in Eukaryotes, VCH, Weinheim, 1993, p. 215.
RENDER  : E. Wingender, Gene Regulation in Eukaryotes, VCH, Weinheim, 1993, p. 215.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Redni broj '2.' je pozicijska oznaka popisa literature i nije dio predloska. Autor kao inicijal pa prezime; sve odvojeno zarezima. Primjer navodi konkretnu stranicu s engleskom oznakom 'p.' unatoc hrvatskim uputama; stranica je u predlosku opcionalna.
```

## poglavlje  [str. 11] (derived)
Otvori PDF: `data/sources/kemos/kemos-upute-radovi-2024.pdf#page=11`
```
TEMPLATE: {authors}, {title}, u: {container}, {publisher}, {place}, {year}[[, p. {pages}]].
QUOTE   : *primjere, citata i bilješki pogledajte u posebnom prilogu – prilog 3.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Ekstrakcija ne sadrzi primjer za poglavlje u knjizi ili zborniku (puni primjeri su u Prilogu 3 uputa, koji nije u ekstrakciji). Predlozak je izveden iz oblika za knjigu: naslov poglavlja, zatim 'u:' i naslov knjige, pa izdavac, mjesto, godina. Urednika izvor nigdje ne prikazuje pa ga predlozak nema. Potvrditi prema Prilogu 3 pri verifikaciji.
```

## clanak  [str. 11] (worked-example)
Otvori PDF: `data/sources/kemos/kemos-upute-radovi-2024.pdf#page=11`
```
TEMPLATE: {authors}, {title}. {container} {year}, {volume}, {pages}.
QUOTE   : 1. M. Martins-Costa, J. M. Anglada, J. S. Francisco M. Ruiz-López, The Aqueous Surface as   [grep: OK]
IZVOR   : M. Martins-Costa, J. M. Anglada, J. S. Francisco M. Ruiz-L�pez, The Aqueous Surface as an Efficient Transient Stop for the Reactivity of Gaseous NO2 in Liquid Water. J. Am Chem. Soc. 2020, 142, 20937�20941.
RENDER  : M. Martins-Costa, J. M. Anglada, J. S. Francisco, M. Ruiz-L�pez, The Aqueous Surface as an Efficient Transient Stop for the Reactivity of Gaseous NO2 in Liquid Water. J. Am Chem. Soc. 2020, 142, 20937�20941.
VERDIKT : DIFF (deklariran)  <-- USPOREDI ZNAK PO ZNAK
DEKLARIRANO: Ekstrakcija je izgubila zarez izmedju 3. i 4. autora (izvor: "J. S. Francisco M. Ruiz-L�pez"); proper autorski unos daje ispravan zarez pa render pise "J. S. Francisco, M. Ruiz-L�pez". Rijec je o given-first ACS obliku (inicijali ispred prezimena); potvrditi u PDF-u je li zarez doista izostao.
NAPOMENA: Nastavak prelomljenih redaka u izvoru: 'an Efficient Transient Stop for the Reactivity of Gaseous NO2 in Liquid Water. J. Am Chem. Soc. 2020, 142, 20937�20941.'. Redni broj '1.' je pozicijska oznaka popisa i nije dio predloska. Kemijski oblik: naslov clanka pa tocka, casopis kraticom, godina, volumen, raspon stranica bez oznake 'str.'. Naziv casopisa u ekstrakciji glasi 'J. Am Chem. Soc.', vjerojatno 'J. Am. Chem. Soc.' s tockom izgubljenom na prijelomu retka. Autori se unose kao "Prezime, Inicijali" par po autoru (odvojeno tocka-zarezom); alat ih preslaguje u given-first oblik.
```

## mrezni  [str. 11] (worked-example)
Otvori PDF: `data/sources/kemos/kemos-upute-radovi-2024.pdf#page=11`
```
TEMPLATE: {title}. URL: {url} ({accessed})
QUOTE   : 3. Hrvatsko knjižničarsko društvo. URL: http://www.hkdrustvo.hr/ (10.11.2024.)   [grep: OK]
IZVOR   : Hrvatsko knjiznicarsko drustvo. URL: http://www.hkdrustvo.hr/ (10.11.2024.)
RENDER  : Hrvatsko knjiznicarsko drustvo. URL: http://www.hkdrustvo.hr/ (10.11.2024.)
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Redni broj '3.' je pozicijska oznaka popisa i nije dio predloska. Primjer koristi naziv organizacije odnosno stranice kao jedini element prije URL-a (mapirano u polje title). Oznaka 'URL:' doslovno, datum pristupa u zagradi u obliku D.M.GGGG., bez tocke iza zavrsne zagrade. Oblik s osobnim autorom nije prikazan u ekstrakciji.
```

## zavrsni  [str. 10] (derived)
Otvori PDF: `data/sources/kemos/kemos-upute-radovi-2024.pdf#page=10`
```
TEMPLATE: {authors}, {title}, {institution}, {place}, {year}.
QUOTE   : Na kraju je teksta potrebno pobrojati i napisati korištenu literatura. Djela koja su navedena u tekstu   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju citiranje zavrsnih i diplomskih radova; predlozak je izveden iz oblika za knjigu (izdavac zamijenjen ustanovom). Potvrditi ili oboriti pri verifikaciji, po mogucnosti prema Prilogu 3.
```

## propis  [str. 11] (derived)
Otvori PDF: `data/sources/kemos/kemos-upute-radovi-2024.pdf#page=11`
```
TEMPLATE: {title}, {container}, br. {issue}.
QUOTE   : *primjere, citata i bilješki pogledajte u posebnom prilogu – prilog 3.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor (prirodoslovne upute Odjela za kemiju) nigdje ne obraduje pravne propise. Predlozak je izveden iz opceg zareznog niza polja kojim izvor pise bibliografske jedinice, uz uobicajeno navodenje sluzbenog glasila s brojem. Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Prior profila predlaze ieee, ali upute ne imenuju nijedan standardni stil: pozivi [N] i redoslijed pojavljivanja jesu slicni IEEE-u, no bibliografski primjeri slijede kemijski oblik (casopis kraticom, godina iza casopisa, pa volumen i raspon stranica bez oznake str.), pa je izraden custom-spec umjesto style-pin ieee.
- U primjeru clanka izmedu treceg i cetvrtog autora ('J. S. Francisco M. Ruiz-L�pez') u ekstrakciji nema zareza; separator ', ' je pretpostavljen za sve autore, moguci tipfeler u izvoru ili gubitak pri ekstrakciji.
- Puni primjeri citata i biljeski su u Prilogu 3 uputa, koji NIJE u ekstrakciji; predlosci za poglavlje, zavrsni i propis su izvedeni (derived) i treba ih potvrditi prema Prilogu 3.
- Popis literature u izvoru numeriran je oblikom 'N.' (broj s tockom), a pozivi u tekstu oblikom [N]; pozicijski redni brojevi nisu dio predlozaka i izostavljeni su iz example.expected.
- Osteceni znakovi iz pdftotext ekstrakcije (Ruiz-L�pez, raspon 20937�20941, 'J. Am Chem. Soc.' bez tocke iza Am) zadrzani su doslovno u quoteRaw i example poljima, ne popravljati bez uvida u izvorni PDF.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `c4e0f565e130...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs kemos "Daniel Risavi"`.
