# Citatni spec: zvu (outcome: custom-spec, status: verified)

Stil: **Vancouver numericki (sluzbene upute ZVU)** (token `vancouver`)
Izvor: Pravilnik o zavrsnim radovima na strucnim i specijalistickim diplomskim studijima, Prilog 3: Citiranje literature (Zdravstveno veleuciliste, 2015) (`zvu-pravilnik-zavrsni-2015`)
Snapshot: `data/sources/zvu/zvu-pravilnik-zavrsni-2015.pdf` (hash `4f171b8ed92a...`)

## knjiga  [str. 15] (worked-example)
Otvori PDF: `data/sources/zvu/zvu-pravilnik-zavrsni-2015.pdf#page=15`
```
TEMPLATE: {authors}. {title}.[[ {volume}. izdanje.]] {place}: {publisher}; {year}.
QUOTE   : Grozdek ovCci G, aekMc Z. Neurofacilitacijska fizioterapija. Zagreb: Zdravstveno eistul;cv   [grep: OK]
IZVOR   : Grozdek Covic G, Macek Z. Neurofacilitacijska fizioterapija. Zagreb: Zdravstveno veleuciliste; 2011.
RENDER  : Grozdek Covic G, Macek Z. Neurofacilitacijska fizioterapija. Zagreb: Zdravstveno veleuciliste; 2011.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Recept (str. 15): 'Prezime autora Inicijal imena autora. Naslov knjige. Izdanje. Mjesto izdavanja: Izdavac; godina.' Vancouver oblik autora: prezime + razmak + spojeni inicijali bez tocaka ('Grozdek Covic G, Macek Z'), autori odvojeni zarezom. Broj izdanja (kad nije prvo) ide u polje volume ('2. izdanje'); u primjeru izdanja nema. PDF je izmijesao slova u dijakritickim rijecima: 'ovCci'=Covic, 'aekMc'=Macek, 'eistul;cv'=veleuciliste; expected je rekonstruiran (izdavac je sam ZVU, Zdravstveno veleuciliste).
```

## clanak  [str. 16] (worked-example)
Otvori PDF: `data/sources/zvu/zvu-pravilnik-zavrsni-2015.pdf#page=16`
```
TEMPLATE: {authors}. {title}. {container}. {year};{volume}[[({issue})]]:{pages}.
QUOTE   : Halpern SD, Ubel PA, Caplan AL. Solid-organ transplantation in HIV-infected patients. N Engl   [grep: OK]
IZVOR   : Halpern SD, Ubel PA, Caplan AL. Solid-organ transplantation in HIV-infected patients. N Engl J Med. 2002;347:284-7.
RENDER  : Halpern SD, Ubel PA, Caplan AL. Solid-organ transplantation in HIV-infected patients. N Engl J Med. 2002;347:284-7.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Cijeli primjer (spojeni redci, str. 16): 'Halpern SD, Ubel PA, Caplan AL. Solid-organ transplantation in HIV-infected patients. N Engl J Med. 2002;347:284-7.' Recept: 'Prezime autora Inicijal imena autora. Naslov rada. Naziv casopisa. Godina izdavanja; broj (volumen): stranice.' Redoslijed potvrdjuju primjeri: godina;volumen(broj):stranice (347 = volumen bez broja; drugi primjer 'Brain Res. 2002;935(1-2):40-6.' volumen 935, broj 1-2). Pravilo za vise autora (str. 16): 'navodi se prvih 6 autora te se navede et al.' (primjer 'Rose ME, Huerbin MB, Melick J, Marion DW, Palmer AM, Schiding JK, et al.').
```

## poglavlje  [str. 16] (derived)
Otvori PDF: `data/sources/zvu/zvu-pravilnik-zavrsni-2015.pdf#page=16`
```
TEMPLATE: {authors}. {title}. U: {editor}, ur. {container}. {place}: {publisher}; {year}.[[ {pages}.]]
QUOTE   : Prezime autora Inicijal imena autora. Naslov rada. U : Prezime urednika Inicijal urednika, ur.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor daje EKSPLICITAN recept za clanak u knjizi/zborniku radova konferencije (str. 16): 'Prezime autora Inicijal imena autora. Naslov rada. U: Prezime urednika Inicijal urednika, ur. Naslov knjige (zbornika radova). Datum odrzavanja konferencije; Mjesto odrzavanja, drzava. Mjesto izdavanja: Izdavac; godina. Stranice.' Predlozak je izveden iz tog recepta (podskup polja alata; datum/mjesto konferencije nemaju placeholder pa su izostavljeni). Worked example u izvoru ('Christensen S, Oppacher F. An analysis of Koza's computational effort statistic for genetic programming. In: Foster JA, Lutton E, Miller J, Ryan C, Tettamanzi AG, editors. Genetic...') je ODREZAN u ekstrakciji (str. 16 zavrsava na 'Genetic'), pa nema potpunog examplea.
```

## mrezni  [str. 15] (derived)
Otvori PDF: `data/sources/zvu/zvu-pravilnik-zavrsni-2015.pdf#page=15`
```
TEMPLATE: [[{authors}. ]]{title}. Dostupno na: {url}[[ ({accessed})]].
QUOTE   : Literatura koristena prilikom izrade rada navodi se na   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Prilog 3 (Navodjenje popisa literature) prikazuje samo tri oblika natuknice: knjiga, clanak u casopisu i clanak u zborniku/knjizi radova konferencije. Mrezni (internetski) izvor NIJE prikazan pa je predlozak izveden iz uobicajenog Vancouver web oblika (naslov, dostupno na: URL, datum pristupa u zagradi); autor je opcionalan. Potvrditi ili oboriti pri verifikaciji.
```

## zavrsni  [str. 2] (derived)
Otvori PDF: `data/sources/zvu/zvu-pravilnik-zavrsni-2015.pdf#page=2`
```
TEMPLATE: {authors}. {title} [zavrsni rad].[[ {place}:]] {institution}; {year}.
QUOTE   : Zavrsni rad je samostalni pisani rad studenta u kojem student pod vodstvom mentora   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Prilog 3 ne prikazuje kako se zavrsni/diplomski rad NAVODI kao izvor u popisu literature (obuhvaca knjigu, clanak, zbornik). Predlozak je izveden iz oblika za knjigu: izdavac zamijenjen ustanovom, dodana oznaka vrste rada '[zavrsni rad]'. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 4] (derived)
Otvori PDF: `data/sources/zvu/zvu-pravilnik-zavrsni-2015.pdf#page=4`
```
TEMPLATE: {title}. {container}[[, {issue}]].
QUOTE   : U popisu literature redom koji su citirani navode se svi u radu koristeni izvori. Ne navode se   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor ne obradjuje citiranje propisa/pravnih akata (Prilog 3 pokriva knjigu, clanak i zbornik). Predlozak je minimalno izveden radi potpunosti alata (naslov, glasilo, broj). Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Izvor Vancouver stil propisuje samo za podrucje biomedicine i to formulacijom 'najcesce se koristi' (registry ga vodi kao advisory); ipak je to JEDINI detaljno razradjeni stil u Prilogu 3 pa je uzet kao profilni. Potvrditi obveznost pri verifikaciji.
- Skracivanje autora: eksplicitno pravilo i primjer clanka koriste 'et al.' (prvih 6 autora te et al.), ali primjer knjige koristi hrvatsku varijantu 'Klanfar Z i sur.'; odabran 'et al.' po eksplicitnom pravilu, 'i sur.' zabiljezen kao varijanta.
- pdftotext je izmijesao slova u dijakritickim rijecima primjera knjige (ovCci=Covic, aekMc=Macek, eistul;cv=veleuciliste); quoteRaw je ostavljen doslovno, a expected je rekonstruiran kao 'Grozdek Covic G, Macek Z. ... Zdravstveno veleuciliste; 2011.' (visoka pouzdanost jer je izdavac sam ZVU). Provjeriti znak po znak protiv PDF-a.
- Worked example za poglavlje (Christensen S, Oppacher F...) je odrezan u ekstrakciji (str. 16 zavrsava na 'Genetic'); predlozak je izveden iz eksplicitnog recepta za clanak u zborniku, bez examplea.
- mrezni, zavrsni i propis nisu prikazani u Prilogu 3 (obuhvaca knjigu, clanak u casopisu i clanak u zborniku); predlosci su izvedeni iz najblizih oblika i potrebno ih je potvrditi ili oboriti.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `4f171b8ed92a...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs zvu "Daniel Risavi"`.
