# Citatni spec: unipu-chicago-notes (outcome: custom-spec, status: verified)

Stil: **Chicago fusnotni stil (službene upute FET Pula)** (token `chicago-notes`)
Izvor: Naputak za izradu završnih i diplomskih radova (Fakultet ekonomije i turizma, Sveučilište Jurja Dobrile u Puli) (`fet-naputak-radovi`)
Snapshot: `data/sources/unipu/fet-naputak-radovi.pdf` (hash `68059a4cab8c...`)

## knjiga  [str. 6] (worked-example)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=6`
```
TEMPLATE: {authors}, {title}[[, {volume}. izdanje.]], {place}, {publisher}, {year}.
QUOTE   : Ratnagar, S., Trading Encounters: From the Euphrates to the Indus in the Bronze   [grep: NEMA EKSTRAKCIJE]
IZVOR   : Ratnagar, S., Trading Encounters: From the Euphrates to the Indus in the Bronze Age, New Delhi, Oxford University Press, 2004.
RENDER  : Ratnagar, S., Trading Encounters: From the Euphrates to the Indus in the Bronze Age, New Delhi, Oxford University Press, 2004.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Popis literature (referenca u literaturi) invertira prvi autor: 'Prezime, I.'. Naslov u izvorniku kurzivom (alat radi plain text). Broj izdanja ide u polje volume (npr. 11 -> '11. izdanje.'); primjer izdanja str. 20: 'Kring, A. et al., Abnormal Psychology, 11. izdanje., Hoboken, NJ, John Wiley & Sons, 2010.'. Za 4 i vise autora koristi se 'et al.' nakon prvog autora.
```

## poglavlje  [str. 20] (worked-example)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=20`
```
TEMPLATE: {authors}, {title}, {place}, {publisher}, {year}.
QUOTE   : Blackledge, A. i A. Creese, Multilingualism: a Critical   [grep: NEMA EKSTRAKCIJE]
IZVOR   : Blackledge, A. i A. Creese, Multilingualism: a Critical Perspective, London, Continuum, 2010.
RENDER  : Blackledge, A. i A. Creese, Multilingualism: a Critical Perspective, London, Continuum, 2010.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer iz tablice Chicago stila (redak 'Poglavlje u knjizi'): 'Blackledge, A. i A. Creese, Multilingualism: a Critical Perspective, London, Continuum, 2010.'. Izvor NE razdvaja naslov poglavlja od naslova knjige niti navodi urednika/zbornik (nema 'u:' ni (ur.)); oblik je strukturno jednak knjizi. Drugi autor je given-first (A. Creese), dva autora spojena s ' i '. Polje input.authors upisano je u vec renderiranom obliku jer izvor ne daje puna imena.
```

## clanak  [str. 6] (derived)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=6`
```
TEMPLATE: {authors}, {title}, {container}[[, {volume}]][[ ({issue})]], {year}[[, str. {pages}]].
QUOTE   : Prezime, Inicijal imena., Naslov knjige italic slovima. Izdanje knjige ako postoji, Mjesto   [grep: NEMA EKSTRAKCIJE]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Naputak za Chicago daje primjere samo za knjigu i poglavlje; casopisni clanak NIJE u ekstrakciji. Predlozak je izveden iz opceg Chicago obrasca (zarezi, invertiran prvi autor, naslov, naziv casopisa, godina, stranice). Potvrditi ili oboriti pri verifikaciji.
```

## mrezni  [str. 8] (derived)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=8`
```
TEMPLATE: {authors}, {title}, {year}, {url}, (pristupljeno {accessed}).
QUOTE   : 2009, http://www.rosetta.bham.ac.uk, (pristupljeno 10. rujan 2010.).   [grep: NEMA EKSTRAKCIJE]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: U ekstrakciji je samo REP mreznog Chicago primjera (godina, URL, (pristupljeno datum)); glava (autor, naslov) je na prethodnoj, neuhvacenoj stranici (str. 7). Predlozak je izveden iz tog repa + opceg Chicago obrasca za autora/naslov; primjer nije potpun pa je example null. Potvrditi pri verifikaciji.
```

## zavrsni  [str. 6] (derived)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=6`
```
TEMPLATE: {authors}, {title}, {institution}, {place}, {year}.
QUOTE   : Prezime, Inicijal imena., Naslov knjige italic slovima. Izdanje knjige ako postoji, Mjesto   [grep: NEMA EKSTRAKCIJE]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Naputak ne obraduje citiranje zavrsnih/diplomskih radova u Chicago stilu; predlozak je izveden iz obrasca za knjigu (izdavac -> ustanova). Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 3] (derived)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=3`
```
TEMPLATE: {title}, {container}[[, br. {issue}]], {year}.
QUOTE   : Za popis koristene literature (nacin citiranja) student moze koristiti Chicago ili   [grep: NEMA EKSTRAKCIJE]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Naputak (ekonomsko-turisticki kontekst) ne obraduje navodenje propisa u Chicago stilu; predlozak je izveden iz opceg obrasca (naslov, glasilo, broj, godina). Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Naputak dopusta i Chicago i Harvard stil (str. 3 i str. 4: 'student moze koristiti Chicago ili Harvard stil'); ovo je jedan od dva dokazana stila (mixed).
- Chicago se ovdje vodi kao FUSNOTNI stil (note-number); prvo navodenje u fusnoti je given-first ('V. Gorenc, ...'), a popis literature invertira prvi autor ('Ratnagar, S., ...'). Alat generira bibliografski (popis literature) oblik.
- Ponovljena navodenja (loc. cit., ibidem, op. cit.) opisana su u izvoru (str. 5) ali su izvan dosega generatora.
- Naslovi (knjige, casopisi) su u izvorniku kurzivom; alat radi plain text (napomena na stranici alata).
- bibliography.sort 'alphabetical' je izveden iz invertiranog (prezime-prvo) oblika popisa literature; izvor to ne navodi izrijekom.
- clanak, mrezni, zavrsni i propis nemaju potpun Chicago worked-example u ekstrakciji (mrezni ima samo rep primjera); ti su predlosci izvedeni (derived).

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `68059a4cab8c...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs unipu-chicago-notes "Daniel Risavi"`.
