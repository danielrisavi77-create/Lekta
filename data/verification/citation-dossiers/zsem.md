# Citatni spec: zsem (outcome: custom-spec, status: draft)

Stil: **Harvard autor-godina (sluzbeni Pravilnik ZSEM)** (token `zsem`)
Izvor: Pravilnik o diplomskom radu ZSEM (2023), cl. 31-32 (nacin citiranja i popis literature) (`zsem-pravilnik-diplomski-2023`)
Snapshot: `data/sources/zsem/zsem-pravilnik-diplomski-2023.pdf` (hash `14cbc4cdbbff...`)

## knjiga  [str. 15] (worked-example)
Otvori PDF: `data/sources/zsem/zsem-pravilnik-diplomski-2023.pdf#page=15`
```
TEMPLATE: {authors}, ({year}), {title}, {place}: {publisher}.
QUOTE   : Knjige: prezime, ime, (godina), naslov, mjesto izdavanja: ime izdavaca. Ukoliko su dva   [grep: OK]
IZVOR   : prezime, ime, (godina), naslov, mjesto izdavanja: ime izdavaca.
RENDER  : prezime, ime, (godina), naslov, mjesto izdavanja: ime izdavaca.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Izvor daje eksplicitni obrazac 'prezime, ime, (godina), naslov, mjesto izdavanja: ime izdavaca.'. Prvi autor puno ime (ne inicijal). Za 2-3 autora izvor tvrdi 'prezimena i inicijale', za 4+ prvi autor + 'et al ili i suradnici' (vidi contradictions).
```

## clanak  [str. 15] (worked-example)
Otvori PDF: `data/sources/zsem/zsem-pravilnik-diplomski-2023.pdf#page=15`
```
TEMPLATE: {authors}, ({year}), "{title}", {container}; {issue}, {volume}, {pages}.
QUOTE   : Casopisi: prezime, ime, (godina), "naslov clanka", naziv casopisa u kojem je objavljen;   [grep: OK]
IZVOR   : prezime, ime, (godina), "naslov clanka", naziv casopisa u kojem je objavljen; broj, volumen, stranice.
RENDER  : prezime, ime, (godina), "naslov clanka", naziv casopisa u kojem je objavljen; broj, volumen, stranice.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Obrazac za casopis: 'prezime, ime, (godina), "naslov clanka", naziv casopisa u kojem je objavljen; broj, volumen, svezak, stranice.'. Naslov clanka pod navodnicima; casopis odvojen tockom sa zarezom od brojcanih podataka. Izvor nabraja i 'svezak' kojemu alat nema zaseban placeholder (vidi contradictions).
```

## mrezni  [str. 15] (worked-example)
Otvori PDF: `data/sources/zsem/zsem-pravilnik-diplomski-2023.pdf#page=15`
```
TEMPLATE: {authors}, ({year}), "{title}", {container}, {volume}, {pages}, {url}, {accessed}.
QUOTE   : Izvori preuzeti s Internetskih stranica: prezime autora/urednika, ime, (godina), "naslov   [grep: OK]
IZVOR   : prezime autora/urednika, ime, (godina), "naslov clanka", naslov casopisa, godiste, broj stranice, internet adresa, datum posjete toj internetskoj stranici.
RENDER  : prezime autora/urednika, ime, (godina), "naslov clanka", naslov casopisa, godiste, broj stranice, internet adresa, datum posjete toj internetskoj stranici.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Obrazac za internetski izvor: 'prezime autora/urednika, ime, (godina), "naslov clanka", naslov casopisa, datum publikacije, godiste, broj stranice, internet adresa, datum posjete toj internetskoj stranici.'. Stvarni primjer iz izvora (odsjecen u ekstrakciji): 'Wells, Joseph (2007), "What Is Your Fraud IQ?", Journal of Accountancy, May 2007, Vol. 203, Br. 5,'. Polje 'datum publikacije' nema placeholder (vidi contradictions).
```

## poglavlje  [str. 15] (derived)
Otvori PDF: `data/sources/zsem/zsem-pravilnik-diplomski-2023.pdf#page=15`
```
TEMPLATE: {authors}, ({year}), {title}. U: {editor} (ur.), {container}, {place}: {publisher}.
QUOTE   : Knjige: prezime, ime, (godina), naslov, mjesto izdavanja: ime izdavaca. Ukoliko su dva   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor ne obraduje poglavlje u zborniku; predlozak je izveden iz oblika za knjigu dodavanjem 'U: {editor} (ur.), {container}'. Potvrditi ili oboriti pri verifikaciji.
```

## zavrsni  [str. 15] (derived)
Otvori PDF: `data/sources/zsem/zsem-pravilnik-diplomski-2023.pdf#page=15`
```
TEMPLATE: {authors}, ({year}), {title} (neobjavljen zavrsni rad), {place}: {institution}.
QUOTE   : Knjige: prezime, ime, (godina), naslov, mjesto izdavanja: ime izdavaca. Ukoliko su dva   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Ni diplomski ni zavrsni pravilnik ZSEM ne obraduje citiranje zavrsnih/diplomskih radova; predlozak je izveden iz oblika za knjigu (izdavac -> ustanova). Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 15] (derived)
Otvori PDF: `data/sources/zsem/zsem-pravilnik-diplomski-2023.pdf#page=15`
```
TEMPLATE: {title} ({year}), {container}, br. {issue}.
QUOTE   : Svaka referenca mora se u potpunosti navesti u popisu literature.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor ne propisuje oblik za pravne akte/propise (Harvard autor-godina, ekonomsko-menadzerski profil); predlozak je izveden iz opceg autor-godina oblika i uobicajene hrvatske prakse (naziv, godina, Narodne novine, broj). Potvrditi ili oboriti pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: ({authorsShort}, {year}:{pages})
RENDER   : (Lovric, 1988)   /  (Lovric, 1988:45)
QUOTE    : 2003). U slucaju citata navodi se i broj stranice (Bombelles, 2003:150). Ne koristi se   [grep: OK]
NAPOMENA : U zagradu ide prezime autora i godina '(Bombelles, 2003)'; broj stranice iza dvotocke bez razmaka '(Bombelles, 2003:150)'. Dva autora '(Bombelles i Marusi, 2004)'; vise autora prvi + 'i suradnici' '(Bombelles i suradnici, 2003)'. Izvor izricito zabranjuje ibid/op.cit. (svaka biljeska navodi se kao i prvi put).
```

## Kontradikcije / otvorena pitanja
- Izvor imenuje 'Harvardski sistem citiranja bibliografije' kao uzor ('napravljen po uzoru na...'), ali propisuje vlastite obrasce; spec je custom-spec izveden iz tih obrazaca, ne cista Harvard referenca.
- Mentor/komentor moze odobriti drukciji nacin citiranja (student ga tada koristi konzistentno); spec vrijedi kao zadana opcija (Pravilnik cl. 31, str. 14).
- Nedosljednost imena autora: jedan autor puno ime ('prezime, ime', primjer 'Wells, Joseph'), a za dva-tri autora izvor trazi 'prezimena i inicijale'. Spec koristi puno ime (initials none) uz ovu napomenu.
- Za 4+ autora izvor dopusta 'et al' ILI 'i suradnici'; spec koristi 'et al.' u bibliografiji, a 'i suradnici' u in-text obliku (kako je u izvoru).
- Casopisni obrazac nabraja 'broj, volumen, svezak, stranice' (cetiri polja); alat nema zaseban placeholder za 'svezak' pa je izostavljen iz clanak predloska.
- Internetski obrazac nabraja i 'datum publikacije'; alat nema zaseban placeholder pa je izostavljen iz mrezni predloska.
- Reference u tekstu izvor navodi u kurzivu ili pod navodnicima; alat radi plain text (napomena na stranici alata).
- Popis literature je numeriran ('Literatura se numerira'), ali uredem abecednim redom autora; spec biljezi sort alphabetical, numeriranje je prezentacijsko.

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs zsem "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
