# Citatni spec: grafos (outcome: custom-spec, status: verified)

Stil: **Brojčani stil citiranja (službene smjernice GrAFOS)** (token `grafos-brojcani`)
Izvor: Smjernice za izradu i oblikovanje diplomskih i završnih radova (Građevinski i arhitektonski fakultet Osijek, 2022.), t. 3.4 (`grafos-smjernice-2022`)
Snapshot: `data/sources/grafos/grafos-smjernice-2022.docx` (hash `6916e4f1620c...`)

## knjiga  [str. 1] (rule-text)
Otvori PDF: `data/sources/grafos/grafos-smjernice-2022.docx#page=1`
```
TEMPLATE: {authors}, {title}, {publisher}, {place}, {year}.
QUOTE   : Prezime autora, inicijali imena, naslov knjige, izdavač, mjesto, godina izdanja.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Redak u izvoru je shematski (opisna polja s doslovnom interpunkcijom), ne konkretan citat, pa je kind rule-text i nema examplea (opisni autorski blok nije provediv kroz parser autora). Redoslijed: autor (prezime pa inicijali imena), naslov, izdavac, mjesto, godina; sve odvojeno zarezima, tocka na kraju.
```

## poglavlje  [str. 1] (derived)
Otvori PDF: `data/sources/grafos/grafos-smjernice-2022.docx#page=1`
```
TEMPLATE: {authors}, {title}, {container}[[, sv. {volume}]][[, str. {pages}]], {place}, {year}.
QUOTE   : Prezime autora, inicijali imena, naslov članka, naziv konferencije, sv. (broj sveska), str.  (stranice) od – do, mjesto, godina izdanja.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor daje oblik samo za clanak objavljen u zborniku konferencije: autor, naslov clanka, naziv konferencije, sv. (broj sveska), str. od-do, mjesto, godina izdanja. Poglavlje u knjizi ili zborniku izvedeno je analogijom (container umjesto naziva konferencije). Urednika izvor uopce ne propisuje pa ga predlozak nema. Potvrditi pri verifikaciji.
```

## clanak  [str. 1] (rule-text)
Otvori PDF: `data/sources/grafos/grafos-smjernice-2022.docx#page=1`
```
TEMPLATE: {authors}, {title}, {container}[[, br. {issue}]][[, sv. {volume}]], str. {pages}, {year}.
QUOTE   : Prezime autora, inicijali imena, naslov rada, naziv časopisa, broj časopisa (br./No.), broj sveska (sv./Vol.), str. (pp.) od – do, mjesec i godina izdanja.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Shematski redak (opisna polja + objasnjenja etiketa u zagradama), ne konkretan citat, pa je kind rule-text i nema examplea. Predlozak pise 'br.', 'sv.' i 'str.' bez objasnjenja. Neuobicajeno: broj casopisa (issue) dolazi PRIJE broja sveska (volume), isto kao u FERIT uputama. Izvor trazi 'mjesec i godina izdanja', alat ima samo polje year.
```

## mrezni  [str. 1] (rule-text)
Otvori PDF: `data/sources/grafos/grafos-smjernice-2022.docx#page=1`
```
TEMPLATE: {authors}, {title}, {url}, {accessed}.
QUOTE   : Prezime autora, inicijali imena, naslov članka, poveznica na izvor, datum pristupanja mrežnom izvoru.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Shematski redak, ne konkretan citat, pa je kind rule-text i nema examplea. Izvor trazi datum pristupanja mreznom izvoru kao obvezan element, ali BEZ verbalne oznake (nema 'pristupljeno' ni 'dostupno na'), pa predlozak pise goli datum iza poveznice.
```

## zavrsni  [str. 1] (derived)
Otvori PDF: `data/sources/grafos/grafos-smjernice-2022.docx#page=1`
```
TEMPLATE: {authors}, {title}, {institution}, {place}, {year}.
QUOTE   : Prezime autora, inicijali imena, naslov knjige, izdavač, mjesto, godina izdanja.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Smjernice ne obraduju citiranje zavrsnih i diplomskih radova; predlozak je izveden iz oblika za knjigu (izdavac -> ustanova). Oznaka vrste rada nije dodana jer je izvor ne potvrduje. Potvrditi pri verifikaciji.
```

## propis  [str. 1] (derived)
Otvori PDF: `data/sources/grafos/grafos-smjernice-2022.docx#page=1`
```
TEMPLATE: {title} ({container} {issue}).
QUOTE   : Pri pisanju rada nužno je koristiti jedinice Međunarodni sustav mjernih jedinica (SI) i one koje su u skladu sa Zakonom o mjernim jedinicama (NN 58/1993).   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Sekcija o citiranju (t. 3.4) ne propisuje oblik za propise; predlozak je izveden iz nacina na koji same smjernice usput navode zakon u t. 3.3: naziv propisa pa u zagradi glasilo i broj (NN 58/1993 -> container 'NN', issue '58/1993'). To je uporabna instanca, ne propisani primjer. Potvrditi pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Prior profila predlaze ieee, ali smjernice ne imenuju nijedan standardni stil; propisuju vlastiti brojcani oblik slican IEEE-u s razlikama (autor kao 'Prezime, I.' umjesto IEEE 'I. Prezime', broj casopisa prije broja sveska, izdavac prije mjesta kod knjige), pa je izraden custom-spec umjesto style-pin ieee.
- Primjeri u izvoru su shematski (opisna polja s doslovnom interpunkcijom), ne konkretni citati; example.expected je doslovni shematski redak iz izvora, ukljucujuci objasnjenja etiketa (br./No., sv./Vol., pp.) koja predlozak ne reproducira.
- Autorski oblik 'Prezime autora, inicijali imena' potvrduje family-first red, ali ne pokazuje tockanje i razmake inicijala ni odvajanje vise autora; pretpostavljeno 'Prezime, I. I.' (dotted-spaced) i ', ' separator, potvrditi pri verifikaciji. Red je OBRNUT od FERIT-ovih uputa (tamo inicijali ispred prezimena).
- Za clanak izvor trazi 'mjesec i godina izdanja'; alat ima samo polje year pa se mjesec gubi ili ga korisnik upisuje uz godinu.
- Ekstrakcijski tagovi SVIH isjecaka nose 'str. 1', dok sadrzaj dokumenta (TOC) smjesta sekciju 3.4 Citiranje na str. 5; sourcePage je preuzet iz taga po pravilu, stvarna stranica PDF-a vjerojatno je drukcija.
- Poglavlje u knjizi, zavrsni radovi i propisi nisu obradeni u t. 3.4; predlosci su izvedeni (derived) iz najblizih oblika u izvoru (zbornik konferencije, knjiga, uporabna instanca 'NN 58/1993').
- Raspon stranica u shematskim recima pisan je s en crticom ('od – do'); quoteRaw i expected zadrzani doslovno.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `6916e4f1620c...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs grafos "Daniel Risavi"`.
