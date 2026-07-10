# Citatni spec: unipu-harvard (outcome: custom-spec, status: draft)

Stil: **Harvard autor-godina (sluzbeni naputak FET, unipu)** (token `harvard`)
Izvor: Naputak za izradu i obranu zavrsnog i diplomskog rada (Fakultet ekonomije i turizma Dr. Mijo Mirkovic, Sveuciliste Jurja Dobrile u Puli) (`fet-naputak-radovi`)
Snapshot: `data/sources/unipu/fet-naputak-radovi.pdf` (hash `68059a4cab8c...`)

## knjiga  [str. 10] (worked-example)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=10`
```
TEMPLATE: {authors} ({year}.) {title}.[[ {volume}.]] {place}: {publisher}.
QUOTE   : NEVILLE, C. (2010.) The Complete Guide to Referencing and Avoiding Plagiarism.   [grep: OK]
IZVOR   : NEVILLE, C. (2010.) The Complete Guide to Referencing and Avoiding Plagiarism. 2nd edition. Maidenhead: Open University Press.
RENDER  : NEVILLE, C. (2010.) The Complete Guide to Referencing and Avoiding Plagiarism. 2nd edition. Maidenhead: Open University Press.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Popis literature, knjiga jedan autor (str. 10). Redoslijed: PREZIME (velikim slovima), inicijal imena, (godina izdanja.), naslov (kurziv), izdanje ako postoji, mjesto izdavanja: izdavac. Broj izdanja ide u polje volume ('2nd edition'). Dva autora (str. 10): 'MIDDLETON, V. T. C. i HAWKINS, R. (1998.) Sustainable Tourism: A Marketing Perspective. Oxford: Butterworth-Heinemann.' -> oba autora invertirana, spojnica ' i '. Prezime u izvorniku VELIKIM slovima (alat to ne reproducira, vidi contradictions).
```

## clanak  [str. 11] (worked-example)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=11`
```
TEMPLATE: {authors} ({year}.) {title}. {container}. {volume}[[ ({issue})]]. str. {pages}.
QUOTE   : TEFTS, K. i BLAKSEE, S. (2000.) Did you hear the one about Boolean operators?   [grep: OK]
IZVOR   : TEFTS, K. i BLAKSEE, S. (2000.) Did you hear the one about Boolean operators? Incorporating comedy into library instruction. Reference Services Review. 28 (4). str. 369-378.
RENDER  : TEFTS, K. i BLAKSEE, S. (2000.) Did you hear the one about Boolean operators? Incorporating comedy into library instruction. Reference Services Review. 28 (4). str. 369-378.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Clanak u tiskanome casopisu (str. 11). Redoslijed: PREZIME, inicijal, (godina publikacije.), naslov clanka, naziv casopisa (kurziv), broj volumena, (broj/mjesec u zagradi), str. Broj u zagradi je issue ('28 (4)'). Naziv casopisa kurzivom u izvorniku (alat radi plain text).
```

## mrezni  [str. 11] (worked-example)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=11`
```
TEMPLATE: {authors} ({year}.) {title}. {container}. [Online] {volume}[[ ({issue})]]. str. {pages}. Dostupno na: {url}. [Pristupljeno: {accessed}]
QUOTE   : WILSON, J. (1995.) Enter the cyberpunk librarian: future directions in cyberspace.   [grep: OK]
IZVOR   : WILSON, J. (1995.) Enter the cyberpunk librarian: future directions in cyberspace. Library Review. [Online] 44 (8). str.63-72. Dostupno na: http://www.emeraldinsight.com. [Pristupljeno: 30. sijecnja 2012.]
RENDER  : WILSON, J. (1995.) Enter the cyberpunk librarian: future directions in cyberspace. Library Review. [Online] 44 (8). str. 63-72. Dostupno na: http://www.emeraldinsight.com. [Pristupljeno: 30. sijecnja 2012.]
VERDIKT : DIFF (deklariran)  <-- USPOREDI ZNAK PO ZNAK
DEKLARIRANO: Izvor/ekstrakcija su izgubili razmak iza "str." ("str.63-72"); predlozak dosljedno pise "str. 63-72" s razmakom (ispravan hrvatski). Ostatak retka (velika prezimena, interpunkcija) tocno odgovara izvoru.
NAPOMENA: Clanak u online casopisu (str. 11). Redoslijed: PREZIME, inicijal, (godina.), naslov clanka, naziv casopisa (kurziv), [Online], broj volumena, (broj/mjesec), str., Dostupno na: URL, [Pristupljeno: datum]. U izvorniku 'str.63-72' (bez razmaka, OCR); expected zadrzava doslovan izvor, template koristi normalizirani 'str. {pages}'.
```

## poglavlje  [str. 10] (derived)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=10`
```
TEMPLATE: {authors} ({year}.) {title}. U: {editor} (ur.) {container}. {place}: {publisher}.
QUOTE   : PREZIME, Inicijal imena. (godina izdanja.) Naslov knjige italic slovima. Izdanje knjige   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Popis literature u Harvard dijelu ekstrakcije skace s knjige (str. 10, tocke 1-2) na clanak s konferencije (str. 11, tocka 7); primjeri za poglavlje u knjizi/zborniku (tocke 3-6) padaju na str. 10/11 koje nedostaju u ekstrakciji. Predlozak je izveden iz oblika za knjigu uz umetak 'U: urednik (ur.) naslov knjige'. Potvrditi ili oboriti pri verifikaciji.
```

## zavrsni  [str. 10] (derived)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=10`
```
TEMPLATE: {authors} ({year}.) {title}. Zavrsni rad. {place}: {institution}.
QUOTE   : NEVILLE, C. (2010.) The Complete Guide to Referencing and Avoiding Plagiarism.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Naputak ne obraduje citiranje zavrsnih/diplomskih radova u popisu literature. Predlozak je izveden iz oblika za knjigu (izdavac zamijenjen ustanovom, dodana oznaka vrste rada 'Zavrsni rad.'). Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 9] (derived)
Otvori PDF: `data/sources/unipu/fet-naputak-radovi.pdf#page=9`
```
TEMPLATE: {title} ({year}.) {container}[[, {issue}]].
QUOTE   : Ministarstvo zastite okolisa, prostornog ureenja i graditeljstva (2015.) ...   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Harvard dio naputka ne propisuje bibliografski format za propise/zakone. Jedini srodni oblik je organizacija kao autor u tekstu (str. 9, tocka 11). Predlozak je minimalno izveden iz autor-godina reda (nositelj/naslov, godina, glasilo, broj) radi potpunosti alata. Potvrditi pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year}.)   /  s pages: ({authorsShort}, {year}., str. {pages})
RENDER   : (Lovric, 1988.)   /  (Lovric, 1988., str. 45)
QUOTE    : dijagrama (Feynman, 1960.).   [grep: OK]
NAPOMENA : Parafraza na kraju recenice: '(Feynman, 1960.)' (godina s tockom). Narativni oblik kad je ime dio recenice: 'Minsky (1995.) tvrdi kako...' (str. 8). Dva autora: 'Minsky i Papert (1969.)'. Vise od dva autora: prezime prvog + 'et al.' -> 'Zadeh et al. (1975.)' (str. 8, tocka 6). Doslovni citat s brojem stranice: ',,Klasicna teorija..." (Penrose, 2007., str. 37).' (str. 9) -> withPagesTemplate. Organizacija kao autor: 'Ministarstvo zastite okolisa... (2015.)' (str. 9). Sekundarna referenca 'navedeno u' i vise radova iste godine (1990a, b) izvan su dosega generatora.
```

## Kontradikcije / otvorena pitanja
- PRIOR iz profila je []; naputak izricito prepusta izbor studentu: 'student moze koristiti Chicago ili Harvard stil' (str. 3 za zavrsni, str. 4 za diplomski, tocka 6). Oba stila su dokazana vlastitim primjerima pa postoje dva nacrta (unipu-chicago, unipu-harvard); outcome mixed.
- Prezimena u popisu literature pisana su VELIKIM slovima (NEVILLE, MIDDLETON, TEFTS, WILSON, FISH); authorFormat nema opciju velikih slova pa alat daje 'Neville, C.'. Odluciti pri verifikaciji hoce li se prezimena rucno unositi velikim slovima ili se caveat navodi na stranici alata.
- Naslovi knjiga i casopisa su u izvorniku kurzivom; alat radi plain text pa kurziv otpada (napomena na stranici alata).
- Poglavlje u knjizi, zavrsni rad i propis nemaju vlastiti radni primjer u Harvard dijelu ekstrakcije (primjeri tocaka 3-6 na str. 10/11 nedostaju); predlosci su derived.
- OCR/typografija: godina u zagradi ima tocku ('(2010.)'), a jedan primjer ima 'str.63-72' bez razmaka; expected zadrzava doslovan izvor, template koristi normalizirani 'str. {pages}'.

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs unipu-harvard "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
