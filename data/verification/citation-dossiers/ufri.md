# Citatni spec: ufri (outcome: custom-spec, status: draft)

Stil: **Autor-godina (sluzbene upute UFRI, diplomski rad)** (token `ufri`)
Izvor: Upute za izradu diplomskog rada (Uciteljski fakultet u Rijeci) (`ufri-upute-diplomski-2024`)
Snapshot: `data/sources/ufri/ufri.pdf` (hash `197d276efb3a...`)

## knjiga  [str. 3] (worked-example)
Otvori PDF: `data/sources/ufri/ufri.pdf#page=3`
```
TEMPLATE: {authors} ({year}). {title}. {place}: {publisher}.
QUOTE   : Rauni, R. (2005). Pretpostavke liberalnog razumijevanja covjeka. Zagreb: Hrvatsko   [grep: OK]
IZVOR   : Rauni, R. (2005). Pretpostavke liberalnog razumijevanja covjeka. Zagreb: Hrvatsko filozofsko drustvo.
RENDER  : Rauni, R. (2005). Pretpostavke liberalnog razumijevanja covjeka. Zagreb: Hrvatsko filozofsko drustvo.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Shema 1 autor: 'Prezime, I. (godina). Naslov: podnaslov. Mjesto izdavaca: Izdavac.' Inicijali s tockom, tocka iza (godina). Vise autora (str. 4, primjer 'Matijevi, M., Muzi, V. i Joki, M. (2003)...'): separator ', ' i zadnji spoj ' i '. Naslovi knjiga u izvorniku su kurzivom (str. 4, 'kosi tekst'); alat radi plain text.
```

## poglavlje  [str. 4] (worked-example)
Otvori PDF: `data/sources/ufri/ufri.pdf#page=4`
```
TEMPLATE: {authors} ({year}). {title}. U {editor} (ur.), {container}[[ (str. {pages})]]. {place}: {publisher}.
QUOTE   : Dweck, C.S. (1989). Motivacijski procesi kao determinante ucenja. U M. Kovacevi i N.N.   [grep: OK]
IZVOR   : Dweck, C.S. (1989). Motivacijski procesi kao determinante ucenja. U M. Kovacevi i N.N. Soljan (ur.), Psihologijska znanost i edukacija (str. 43-63). Zagreb: Skolske novine.
RENDER  : Dweck, C.S. (1989). Motivacijski procesi kao determinante ucenja. U M. Kovacevi i N.N. Soljan (ur.), Psihologijska znanost i edukacija (str. 43-63). Zagreb: Skolske novine.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Shema (str. 4): 'Prezimeautora, I. (godina). Naslov poglavlja: podnaslov. U I. Prezimeurednika1 i I. Prezimeurednika2 (ur.), Naslov knjige: podnaslov (str. prva-zadnja). Mjesto izdavaca: Izdavac.' Kod urednika inicijali idu PRIJE prezimena (given-first) pa se editor upisuje kao 'I. Prezime i I. Prezime'; skracenica (ur.) S tockom. Puni primjer: '...U M. Kovacevi i N.N. Soljan (ur.), Psihologijska znanost i edukacija (str. 43-63). Zagreb: Skolske novine.'
```

## clanak  [str. 5] (worked-example)
Otvori PDF: `data/sources/ufri/ufri.pdf#page=5`
```
TEMPLATE: {authors} ({year}). {title}. {container}.[[ Pribavljeno {accessed}, sa {url}]]
QUOTE   : Loncari, D. (2006). Suocavanje ucenika s akademskim i interpersonalnim stresnim   [grep: OK]
IZVOR   : Loncari, D. (2006). Suocavanje ucenika s akademskim i interpersonalnim stresnim situacijama: provjera me usituacijske stabilnosti strategija suocavanja. Psihologijske teme. Pribavljeno 01.10.2008., sa http://hrcak.srce.hr/index.php?show=clanak&id_clanak_jezik=18189
RENDER  : Loncari, D. (2006). Suocavanje ucenika s akademskim i interpersonalnim stresnim situacijama: provjera me usituacijske stabilnosti strategija suocavanja. Psihologijske teme. Pribavljeno 01.10.2008., sa http://hrcak.srce.hr/index.php?show=clanak&id_clanak_jezik=18189
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Jedini primjer clanka u ekstrakciji je online clanak s Hrcka; shema (str. 5): 'Prezime, I. (godina...). Naslov: podnaslov clanka. Naslov casopisa ili knjige. Pribavljeno DATUM, sa URL'. U ekstrakciji NEMA volumena/broja/stranica za clanak (moguce da je offline oblik izostavljen iz pdftotext izvlacenja). Grupa Pribavljeno/URL je opcionalna za tiskani clanak.
```

## mrezni  [str. 5] (worked-example)
Otvori PDF: `data/sources/ufri/ufri.pdf#page=5`
```
TEMPLATE: [[{authors} ({year}). ]]{title}. Pribavljeno {accessed}, sa {url}
QUOTE   : Teorija izbora u skoli. Pribavljeno 01.09.2008., sa   [grep: OK]
IZVOR   : Teorija izbora u skoli. Pribavljeno 01.09.2008., sa http://www.multilink.hr/ri-kvas/teorija.html
RENDER  : Teorija izbora u skoli. Pribavljeno 01.09.2008., sa http://www.multilink.hr/ri-kvas/teorija.html
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Shema bez autora/datuma (str. 5): 'Naslov: podnaslov. Pribavljeno DATUM, sa URL'. Autorska varijanta (str. 5): 'Vuceti-Skrbi, A. (2008., 30. rujna). ...! Pribavljeno 01.10.2008., sa http://...' (godina moze nositi i datum objave). Napomena izvora: ostali izvori s interneta i radovi bez jasnog autorstva biljeze se kao FUSNOTE u podnozju stranice, ne u popisu literature.
```

## zavrsni  [str. 3] (derived)
Otvori PDF: `data/sources/ufri/ufri.pdf#page=3`
```
TEMPLATE: {authors} ({year}). {title}. {place}: {institution}.
QUOTE   : Prezime, I. (godina). Naslov: podnaslov. Mjesto izdavaca: Izdavac.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor (ekstrakcija) NE obraduje citiranje diplomskih/zavrsnih radova kao izvora. Predlozak je izveden iz sheme za knjigu (str. 3): izdavac zamijenjen ustanovom. Bez izmisljene oznake vrste rada. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 3] (derived)
Otvori PDF: `data/sources/ufri/ufri.pdf#page=3`
```
TEMPLATE: {title} ({year}). {container}[[, {issue}]].
QUOTE   : Prezime, I. (godina). Naslov: podnaslov. Mjesto izdavaca: Izdavac.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor (ekstrakcija) NE obraduje pravne izvore/propise. Predlozak je izveden po analogiji s opcim autor-godina bibliografskim oblikom (naslov propisa, godina, sluzbeno glasilo, broj). Cijeli oblik je pretpostavka; potvrditi ili oboriti pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: ({authorsShort}, {year}: {pages})
RENDER   : (Lovric, 1988)   /  (Lovric, 1988: 45)
QUOTE    : Shema: parafraze (Prezime, 1999) citata (Prezime, 1999: 13-15)   [grep: OK]
NAPOMENA : Autor-godina u zagradama (str. 2: 'navodeci u zagradama prezime autora i godinu izdanja'). Jedan autor '(Prezime, 1999)', dva '(Prezime1 i Prezime2, 1999)', vise od dva '(Prezime1 i sur., 1999:12)' (str. 3). Broj stranice se dodaje samo kod citata/preuzimanja slike ili tablice (str. 2). Posredno navodenje '(Calfee, 1985, prema Milas, 2005)' je izvan dosega generatora (poseban oblik).
```

## Kontradikcije / otvorena pitanja
- Prag za skracenje autora u tekstu: str. 2 kaze 'vise od tri autora -> prezime prvog + i suradnici', a shema na str. 3 kaze 'vise od dva autora -> (Prezime1 i sur.)'. Draft slijedi shemu sa str. 3 (3+ autora -> 'i sur.', etAlAfter 3, etAlText 'i sur.').
- Razmak iza dvotocke kod stranica u citatu je nekonzistentan: '(Prezime, 1999: 13-15)' (s razmakom, headline shema str. 3) vs '(Prezime1 i sur., 1999:12)' i '(Calfee, 1985, prema Milas, 2005:79)' (bez razmaka). Draft koristi ': ' po headline shemi.
- Format clanka u ekstrakciji (str. 5) navodi samo autor (godina), naslov, naziv casopisa i 'Pribavljeno DATUM, sa URL', bez volumena/broja/stranica; moguce je da je tiskani oblik clanka izostavljen iz pdftotext izvlacenja. Predlozak je vjeran ekstrakciji.
- Zavrsni/diplomski rad kao izvor nije pokriven u ekstrakciji; predlozak je izveden iz sheme za knjigu (derived).
- Propisi/pravni izvori nisu obradeni u ekstrakciji; predlozak je izveden po analogiji (derived).
- Popis literature 'mora biti numeriran' (str. 1), ali su reference poredane abecedno po prezimenu prvog autora i in-text stil je autor-godina; numeracija je vizualna oznaka popisa, ne identitet citata (bibliography.sort=alphabetical, numbering=null).
- Kurziv naslova knjiga i naziva casopisa (str. 4 'kosi tekst') alat ne reproducira (plain text izlaz).
- PRIOR hint iz profila je 'harvard'; izvor ne imenuje standardni stil nego daje vlastite worked-example primjere, pa je ishod custom-spec (autor-godina, APA/Harvard-slicno) a ne style-pin.

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs ufri "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
