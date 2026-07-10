# Citatni spec: ferit (outcome: custom-spec, status: verified)

Stil: **Brojcani stil citiranja (sluzbene upute FERIT)** (token `ferit-brojcani`)
Izvor: Sluzbene upute za pisanje diplomskog rada (FERIT), t. 2.9 i 2.10 (`ferit-upute-diplomski`)
Snapshot: `data/sources/ferit/ferit-upute-diplomski.pdf` (hash `d596eb1f8605...`)

## knjiga  [str. 3] (rule-text)
Otvori PDF: `data/sources/ferit/ferit-upute-diplomski.pdf#page=3`
```
TEMPLATE: {authors}, {title}, {publisher}, {place}, {year}.
QUOTE   : [3] Inicijali imena, prezime autora, naslov knjige, izdavac, mjesto, godina izdanja.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Redak u izvoru je shematski (opisna polja s doslovnom interpunkcijom), ne konkretan citat, pa je kind rule-text i nema examplea (opisni autorski blok nije provediv kroz parser autora). Redoslijed: autor (inicijali imena pa prezime), naslov, izdavac, mjesto, godina; sve odvojeno zarezima, tocka na kraju. Redni broj [3] je pozicijska oznaka u popisu literature (redoslijed pojavljivanja u radu) i nije dio predloska.
```

## poglavlje  [str. 3] (derived)
Otvori PDF: `data/sources/ferit/ferit-upute-diplomski.pdf#page=3`
```
TEMPLATE: {authors}, {title}, {container}[[, sv. {volume}]][[, str. {pages}]], {place}, {year}.
QUOTE   : [2] Inicijali imena, prezime autora, naslov referata, naziv konferencije, sv. (broj   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor daje primjer samo za referat u zborniku konferencije: autor, naslov referata, naziv konferencije, sv. (broj sveska), str. od-do, mjesto, godina izdanja. Poglavlje u knjizi ili zborniku izvedeno je analogijom (container umjesto naziva konferencije). Urednika izvor uopce ne propisuje pa ga predlozak nema. Potvrditi pri verifikaciji.
```

## clanak  [str. 3] (rule-text)
Otvori PDF: `data/sources/ferit/ferit-upute-diplomski.pdf#page=3`
```
TEMPLATE: {authors}, {title}, {container}[[, br. {issue}]][[, sv. {volume}]], str. {pages}, {year}.
QUOTE   : [1] Inicijali imena, prezime autora, naslov rada, naziv casopisa, broj casopisa   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Nastavak retka u izvoru: '(br./No.), broj sveska (sv./Vol.), str. (pp.) od - do, mjesec i godina izdanja.' Redak je shematski (opisna polja + objasnjenja etiketa u zagradama), ne konkretan citat, pa je kind rule-text i nema examplea; predlozak pise 'br.', 'sv.' i 'str.' bez objasnjenja. Neuobicajeno: broj casopisa (issue) dolazi PRIJE broja sveska (volume). Izvor trazi 'mjesec i godina izdanja', alat ima samo polje year.
```

## mrezni  [str. 3] (derived)
Otvori PDF: `data/sources/ferit/ferit-upute-diplomski.pdf#page=3`
```
TEMPLATE: {authors}, {title}, {url}[[, pristupljeno {accessed}]].
QUOTE   : 2.9. Literaturu treba svrstati redom kojim se pojavljuje u radu i napisati na slijedei nacin:   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute (t. 2.9) ne obraduju mrezne izvore. Predlozak je izveden iz opceg zareznog niza polja kojim izvor pise sve bibliografske jedinice; oznaka pristupa je dodana konvencija (izvor ne spominje datum pristupa, zato accessDate false). Potvrditi ili oboriti pri verifikaciji.
```

## zavrsni  [str. 3] (derived)
Otvori PDF: `data/sources/ferit/ferit-upute-diplomski.pdf#page=3`
```
TEMPLATE: {authors}, {title}, {institution}, {place}, {year}.
QUOTE   : [3] Inicijali imena, prezime autora, naslov knjige, izdavac, mjesto, godina izdanja.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju citiranje zavrsnih i diplomskih radova; predlozak je izveden iz oblika za knjigu (izdavac -> ustanova). Potvrditi pri verifikaciji.
```

## propis  [str. 3] (derived)
Otvori PDF: `data/sources/ferit/ferit-upute-diplomski.pdf#page=3`
```
TEMPLATE: {title}, {container} br. {issue} iz {year}.[[, str. {pages}.]]
QUOTE   : zakonite (Zakon o mjernim jedinicama, NN br. 58 iz 1993., str. 1469).   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Sekcija o literaturi (t. 2.9) ne propisuje oblik za propise; predlozak je izveden iz nacina na koji same upute usput navode zakon u t. 2.7 (naslov, NN br. X iz GGGG., str. N). To je uporabna instanca, ne propisani primjer. Potvrditi pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Prior profila predlaze ieee, ali upute ne imenuju nijedan standardni stil; propisuju vlastiti brojcani oblik slican IEEE-u s razlikama (broj casopisa prije broja sveska kod clanka, izdavac prije mjesta kod knjige), pa je izraden custom-spec umjesto style-pin ieee.
- Primjeri u izvoru su shematski (opisna polja s doslovnom interpunkcijom), ne konkretni citati; example.expected je doslovni shematski redak iz izvora, ukljucujuci pozicijski redni broj [n] i objasnjenja etiketa (br./No., sv./Vol., pp.) koje predlozak ne reproducira.
- Oblik autora 'Inicijali imena, prezime autora' ne pokazuje tockanje i razmake inicijala ni odvajanje vise autora; pretpostavljeno 'I. I. Prezime' (dotted-spaced) i zarez izmedu autora, potvrditi pri verifikaciji.
- Za clanak izvor trazi 'mjesec i godina izdanja'; alat ima samo polje year pa se mjesec gubi ili ga korisnik upisuje uz godinu.
- Identicna pravila citiranja postoje i u ferit-upute-zavrsni-2010 (str. 3, t. 2.9 i 2.10, uz sitne pravopisne razlike 'sljedei'/'slijedei'); jedan spec pokriva zavrsni i diplomski rad.
- Mrezni izvori, zavrsni radovi i propisi nisu obradeni u t. 2.9; predlosci su izvedeni (derived) iz najblizih oblika u izvoru.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `d596eb1f8605...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs ferit "Daniel Risavi"`.
