# Citatni spec: vuv (outcome: custom-spec, status: verified)

Stil: **Autor-godina (sluzbene upute VUV)** (token `vuv`)
Izvor: Upute za izradu zavrsnog/diplomskog rada (Veleuciliste u Virovitici) (`vuv-upute-radovi-2025`)
Snapshot: `data/sources/vuv/vuv.pdf` (hash `82e65a3cb997...`)

## knjiga  [str. 16] (worked-example)
Otvori PDF: `data/sources/vuv/vuv.pdf#page=16`
```
TEMPLATE: {authors} ({year}). {title}. {place}, {publisher}.
QUOTE   : Milardovi, A. (2004). Pod globalnim sesirom. Drustva i drzave u tranziciji i globalizaciji. Zagreb, CPI   [grep: OK]
IZVOR   : Milardovi, A. (2004). Pod globalnim sesirom. Drustva i drzave u tranziciji i globalizaciji. Zagreb, CPI.
RENDER  : Milardovi, A. (2004). Pod globalnim sesirom. Drustva i drzave u tranziciji i globalizaciji. Zagreb, CPI.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Oblik iz primjera fusnote 2: 'Prezime, I. (godina). Naslov. Mjesto, Izdavac'. Autor u obliku prezime + inicijal s tockom. Varijanta sa stranicom (fusnota 3, str. 16): 'Sria, V. (1993). Upravljanje kreativnosu, Zagreb, Skolska knjiga, str. 43' koristi zarez iza naslova umjesto tocke; ovdje je odabran oblik bez stranice (cijela knjiga). NAPOMENA: izvor ove primjere naziva dokumentarnim fusnotama i tvrdi da ih 'NE KORISTIMO', ali daje ih kao primjere formata; format popisa literature izveden je iz njih.
```

## poglavlje  [str. 2] (derived)
Otvori PDF: `data/sources/vuv/vuv.pdf#page=2`
```
TEMPLATE: {authors} ({year}). {title}. U: {editor} (ur.), {container}[[ (str. {pages})]]. {place}, {publisher}.
QUOTE   : zbornika i s konferencija.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor spominje zbornike i radove s konferencija kao izvore, ali NE daje formatirani primjer poglavlja u zborniku. Predlozak izveden iz oblika za knjigu (autor-godina) uz dodatak 'U: urednik (ur.), naziv zbornika (str.)' po standardnoj autor-godina konvenciji. Potvrditi ili oboriti pri verifikaciji.
```

## clanak  [str. 2] (derived)
Otvori PDF: `data/sources/vuv/vuv.pdf#page=2`
```
TEMPLATE: {authors} ({year}). {title}. {container}, {volume}[[({issue})]][[, str. {pages}]].
QUOTE   : koristenje radova iz strucnih i znanstvenih casopisa   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor preporucuje koristenje radova iz strucnih i znanstvenih casopisa, ali NE daje formatirani primjer clanka. Predlozak izveden iz oblika za knjigu (autor-godina) uz dodatak casopisa, godista, broja i raspona stranica po standardnoj autor-godina konvenciji. Potvrditi ili oboriti pri verifikaciji.
```

## mrezni  [str. 13] (derived)
Otvori PDF: `data/sources/vuv/vuv.pdf#page=13`
```
TEMPLATE: {authors} ({year}). {title}. Dostupno na: {url} ({accessed}).
QUOTE   : pise se naziv stranice, link na kojem je dostupan (ne duzi od tri reda) i datum   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor za online izvore trazi naziv stranice, link (ne duzi od tri reda) i datum posjeenosti, ali samo za izvore ispod tablica/grafickih prikaza, bez formatiranog primjera bibliografske jedinice u popisu literature. Predlozak izveden iz tih komponenti (naziv/autor, godina, link, datum pristupa). Za izvore bez autora izvor navodi naziv stranice/clanka i godinu (str. 15). Potvrditi ili oboriti pri verifikaciji.
```

## zavrsni  [str. 13] (worked-example)
Otvori PDF: `data/sources/vuv/vuv.pdf#page=13`
```
TEMPLATE: {authors} ({year}). {title}, {institution}, neobjavljeni zavrsni rad[[, str. {pages}]].
QUOTE   : Ravli, Z. (2010). Polozaj zena u rukovodeim strukturama sluzbi jedinica lokalne i podrucne   [grep: OK]
IZVOR   : Ravli, Z. (2010). Polozaj zena u rukovodeim strukturama sluzbi jedinica lokalne i podrucne (regionalne) samouprave na primjeru Viroviticko podravske zupanije, visoka skola za menadzment u turizmu i informatici u Virovitici, neobjavljeni zavrsni rad, str. 34.
RENDER  : Ravli, Z. (2010). Polozaj zena u rukovodeim strukturama sluzbi jedinica lokalne i podrucne (regionalne) samouprave na primjeru Viroviticko podravske zupanije, visoka skola za menadzment u turizmu i informatici u Virovitici, neobjavljeni zavrsni rad, str. 34.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer izvora ispod tablice (str. 13, prelomljen preko tri retka): 'Ravli, Z. (2010). Polozaj zena ... na primjeru Viroviticko podravske zupanije, visoka skola za menadzment u turizmu i informatici u Virovitici, neobjavljeni zavrsni rad, str. 34'. Ustanova ide u polje institution; oznaka 'neobjavljeni zavrsni rad' je doslovni tekst. str. je opcionalna (koristi se za konkretan lokator, npr. u izvoru tablice).
```

## propis  [str. 15] (derived)
Otvori PDF: `data/sources/vuv/vuv.pdf#page=15`
```
TEMPLATE: {title}, {container} {issue}.
QUOTE   : (cl. 83. st. 1. Zakona o radu, NN 149/09.)   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor propise navodi SAMO u tekstu: puni naziv propisa kod prvog citiranja, skracenica poslije, uz clanak/stavak u zagradi '(cl. 83. st. 1. Zakona o radu, NN 149/09.)'. Nema formatirane bibliografske jedinice propisa u popisu literature. Predlozak izveden iz in-text oblika: naziv propisa, sluzbeno glasilo (Narodne novine) i broj. Potvrditi ili oboriti pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: ({authorsShort}, {year}:{pages})
RENDER   : (Lovric, 1988)   /  (Lovric, 1988:45)
QUOTE    : (Kotler i Lee, 2009:15).   [grep: OK]
NAPOMENA : Autor-godina s dvotockom prije stranice, bez razmaka (godina:stranica). Jedan autor '(Markovi, 1971:272)'; dva autora spojnica ' i ' '(Kotler i Lee, 2009:15)'; TRI autora svi navedeni zarezom '(Andrijani, Gregurek, Merkas, 2016:161)' (str. 14); cetiri i vise 'i sur.' '(Solomon i sur., 2015:10)' (str. 15); bez autora org u obliku '(Hrvatska gospodarska komora, 2010)' (str. 15). Parafraza bez stranice, vise izvora odvojeno tockazarezom '(Mejovsek, 2008; Belak, 2005; ...)'.
```

## Kontradikcije / otvorena pitanja
- PRIOR 'apa7' je oboren: VUV koristi vlastiti autor-godina (Harvard-slicno), NE APA7. Razlike: dvotocka prije stranice bez razmaka '(Prezime, godina:stranica)'; spojnica ' i ' (ne '&'); TRI autora se svi navode ('Andrijani, Gregurek, Merkas'), a 'i sur.' tek za cetiri i vise autora.
- In-text renderer ne moze reproducirati oblik za TRI autora doslovno: izvor daje cisti zarez '(Andrijani, Gregurek, Merkas, 2016:161)', a authorsShort dodaje ' i ' prije zadnjeg ('Andrijani, Gregurek i Merkas'). Za dva autora ' i ' je tocno. Razrijesiti pri verifikaciji.
- Stvarne worked-example jedinice postoje samo za knjigu (fusnote 2 i 3, str. 16) i neobjavljeni zavrsni rad (izvor tablice, str. 13); clanak, poglavlje, mrezni i propis su IZVEDENI (izvor nema formatirane primjere tih vrsta).
- Izvor je interno proturjecan oko fusnota: kaze da dokumentarne fusnote (upucuju na literaturu) 'NE KORISTIMO', a onda daje 'Primjere dokumentarnih fusnota'. Bibliografski oblik knjige izveden je iz tih primjera fusnota i izvora tablice, ne iz zasebne sekcije 'Popis literature' (koje u ekstrakciji nema).
- Interpunkcija knjige nekonzistentna u izvoru: fusnota 2 koristi '. Naslov. Mjesto, Izdavac', fusnota 3 '. Naslov, Mjesto, Izdavac, str.'; odabran je oblik bez stranice. authorFormat.separator/finalJoiner/etAl prag za popis literature (vise autora) te bibliography.sort 'alphabetical' izvedeni su (izvor ih eksplicitno ne propisuje).

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `82e65a3cb997...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs vuv "Daniel Risavi"`.
