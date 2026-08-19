# Citatni spec: unipu-harvard (outcome: custom-spec, status: verified)

Stil: **Harvard autor-godina (službene upute FET Pula)** (token `harvard`)
Izvor: Naputak za izradu završnih i diplomskih radova (Fakultet ekonomije i turizma, Sveučilište Jurja Dobrile u Puli) (`fet-naputak-radovi`)
Snapshot: `data/sources/unipu/fet-naputak-radovi.pdf` (hash `68059a4cab8c...`)

## knjiga  [str. 10] (worked-example)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=10`
```
TEMPLATE: {authors} ({year}.) {title}.[[ {volume}.]] {place}: {publisher}.
QUOTE   : NEVILLE, C. (2010.) The Complete Guide to Referencing and Avoiding Plagiarism.   [grep: NEMA EKSTRAKCIJE]
IZVOR   : NEVILLE, C. (2010.) The Complete Guide to Referencing and Avoiding Plagiarism. 2nd edition. Maidenhead: Open University Press.
RENDER  : NEVILLE, C. (2010.) The Complete Guide to Referencing and Avoiding Plagiarism. 2nd edition. Maidenhead: Open University Press.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Popis literature, knjiga jedan autor (str. 10). Obrazac: 'PREZIME, Inicijal imena. (godina izdanja.) Naslov. Izdanje ako postoji. Mjesto: Izdavac.'. Broj/naziv izdanja ide u polje volume ('2nd edition'). Dva autora oba invertirana, spojnica ' i ' (str. 10: 'MIDDLETON, V. T. C. i HAWKINS, R. (1998.) Sustainable Tourism: A Marketing Perspective. Oxford: Butterworth-Heinemann.'). Prezime je u izvorniku VELIKIM slovima; input.authors upisan velikim slovima jer authorFormat nema auto-velika-slova. Naslov kurzivom u izvorniku (alat plain text).
```

## clanak  [str. 11] (worked-example)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=11`
```
TEMPLATE: {authors} ({year}.) {title}. {container}. {volume}[[ ({issue})]]. str. {pages}.
QUOTE   : TEFTS, K. i BLAKSEE, S. (2000.) Did you hear the one about Boolean operators?   [grep: NEMA EKSTRAKCIJE]
IZVOR   : TEFTS, K. i BLAKSEE, S. (2000.) Did you hear the one about Boolean operators? Incorporating comedy into library instruction. Reference Services Review. 28 (4). str. 369-378.
RENDER  : TEFTS, K. i BLAKSEE, S. (2000.) Did you hear the one about Boolean operators? Incorporating comedy into library instruction. Reference Services Review. 28 (4). str. 369-378.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Clanak u tiskanome casopisu (str. 11). Obrazac: 'PREZIME, Inicijal imena. (godina publikacije.) Naslov clanka. Naziv casopisa. Broj volumena (broj/mjesec u zagradi). str.'. Broj u zagradi je issue ('28 (4)'); str. + prva-zadnja stranica. Naslov clanka ukljucuje podnaslov do naziva casopisa. Naziv casopisa kurzivom u izvorniku.
```

## mrezni  [str. 11] (worked-example)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=11`
```
TEMPLATE: {authors} ({year}.) {title}.[[ {container}. [Online] {volume} ({issue}). str.{pages}.]] Dostupno na: {url}. [Pristupljeno: {accessed}]
QUOTE   : WILSON, J. (1995.) Enter the cyberpunk librarian: future directions in cyberspace.   [grep: NEMA EKSTRAKCIJE]
IZVOR   : WILSON, J. (1995.) Enter the cyberpunk librarian: future directions in cyberspace. Library Review. [Online] 44 (8). str.63-72. Dostupno na: http://www.emeraldinsight.com. [Pristupljeno: 30. sijecnja 2012.]
RENDER  : WILSON, J. (1995.) Enter the cyberpunk librarian: future directions in cyberspace. Library Review. [Online] 44 (8). str.63-72. Dostupno na: http://www.emeraldinsight.com. [Pristupljeno: 30. sijecnja 2012.]
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Clanak u online casopisu (str. 11). Obrazac: '... Naziv casopisa. [Online] Broj volumena (broj). str. Dostupno na - URL [Pristupljeno: datum]'. Puni primjer u expected. Kod cistog web izvora bez casopisa opcionalna casopisna grupa ispada pa ostaje autor/godina/naslov + 'Dostupno na:' + URL + '[Pristupljeno:]'. U izvorniku je 'str.63-72' bez razmaka (vidi contradictions).
```

## poglavlje  [str. 10] (derived)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=10`
```
TEMPLATE: {authors} ({year}.) {title}. U: {editor} (ur.) {container}[[ (str. {pages})]]. {place}: {publisher}.
QUOTE   : PREZIME, Inicijal imena. (godina izdanja.) Naslov knjige italic slovima. Izdanje knjige   [grep: NEMA EKSTRAKCIJE]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Harvard dio ekstrakcije preskace stavke 3-6 popisa literature (str. 10-11 idu od 'knjiga, dva autora' na 'clanak s konferencije'), pa poglavlje u knjizi/zborniku s urednikom NIJE u ekstrakciji. Predlozak je izveden iz oblika za knjigu uz umetak 'U: urednik (ur.) naslov knjige'. Potvrditi ili oboriti pri verifikaciji.
```

## zavrsni  [str. 10] (derived)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=10`
```
TEMPLATE: {authors} ({year}.) {title}. Zavrsni rad. {place}: {institution}.
QUOTE   : PREZIME, Inicijal imena. (godina izdanja.) Naslov knjige italic slovima. Izdanje knjige   [grep: NEMA EKSTRAKCIJE]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Naputak ne obraduje citiranje zavrsnih/diplomskih radova u popisu literature. Predlozak je izveden iz oblika za knjigu (izdavac zamijenjen ustanovom, dodana oznaka vrste rada 'Zavrsni rad.'). Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 10] (derived)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=10`
```
TEMPLATE: {title} ({year}.) {container}[[ {issue}]].
QUOTE   : PREZIME, Inicijal imena. (godina izdanja.) Naslov knjige italic slovima. Izdanje knjige   [grep: NEMA EKSTRAKCIJE]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Harvard dio naputka ne propisuje bibliografski format za propise/zakone (jedini srodan oblik je organizacija kao autor u tekstu, str. 9, tocka 11). Predlozak je minimalno izveden iz autor-godina reda (nositelj/naslov, godina, glasilo, broj) radi potpunosti alata. Potvrditi ili oboriti pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year}.)   /  s pages: ({authorsShort}, {year}., str. {pages})
RENDER   : (Lovric, 1988.)   /  (Lovric, 1988., str. 45)
QUOTE    : dijagrama (Feynman, 1960.).   [grep: NEMA EKSTRAKCIJE]
NAPOMENA : Autor-godina u zagradi na kraju recenice: '(Feynman, 1960.)' (godina s tockom). Narativni oblik kad je ime u tekstu: 'Minsky (1995.) tvrdi kako...'. Dva autora: 'Minsky i Papert (1969.)'. Vise od dva autora: prezime prvog + 'et al.' -> 'Zadeh et al. (1975.)' / '(Zadeh et al.,1975.)' (str. 8, tocka 6). Doslovni citat s brojem stranice (str. 9, tocka 8): '(Penrose, 2007., str. 37)' -> withPagesTemplate. Organizacija kao autor: 'Ministarstvo zastite okolisa... (2015.)' (str. 9). Sekundarne reference ('navedeno u') i vise radova iste godine (1990a, b) su izvan dosega generatora.
```

## Kontradikcije / otvorena pitanja
- Naputak izricito prepusta izbor studentu: 'student moze koristiti Chicago ili Harvard stil' (str. 3 za zavrsni, str. 4 za diplomski, tocka 6). Oba stila su dokazana vlastitim primjerima pa postoje dva nacrta (unipu-harvard, unipu-chicago-notes); outcome mixed.
- Prezimena u popisu literature pisana su VELIKIM slovima (NEVILLE, MIDDLETON, TEFTS, WILSON, FISH); authorFormat nema opciju velikih slova. input.authors je zato upisan velikim slovima; pri verifikaciji odluciti hoce li se prezimena unositi velikim slovima ili se caveat navodi na stranici alata.
- Nekonzistentan razmak iza 'str.' u izvoru: tiskani clanak 'str. 369-378' (s razmakom), online clanak 'str.63-72' (bez razmaka); svaki predlozak vjerno reproducira svoj primjer.
- Naslovi knjiga i casopisa su u izvorniku kurzivom; alat radi plain text (napomena na stranici alata).
- bibliography.sort 'alphabetical' je izveden iz invertiranog (prezime-prvo) oblika popisa literature; izvor to ne navodi izrijekom.
- Prag za 'et al.' u POPISU literature nije dokazan (jedini viseautorski biblio primjer ima 2 autora i oba se ispisuju); authorFormat.etAlAfter je izostavljen dok se ne potvrdi. U tekstu vrijedi >2 autora -> et al. (inText.authorsShort.etAlAfter = 2).
- poglavlje, zavrsni i propis nemaju Harvard worked-example u ekstrakciji (stavke 3-6 popisa preskocene); ti su predlosci derived. Konferencijski clanak (str. 11) postoji u izvoru ali nije jedan od 6 obveznih tipova.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `68059a4cab8c...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs unipu-harvard "Daniel Risavi"`.
