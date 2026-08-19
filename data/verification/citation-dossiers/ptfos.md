# Citatni spec: ptfos (outcome: custom-spec, status: verified)

Stil: **PTFOS autor-godina (službene upute za diplomski rad)** (token `ptfos-autor-godina`)
Izvor: Upute za pisanje, ocjenu i obranu diplomskih radova (PTFOS) (`ptfos-upute-diplomski-2020`)
Snapshot: `data/sources/ptfos/ptfos-upute-diplomski-2020.pdf` (hash `7f31be75164c...`)

## knjiga  [str. 10] (rule-text)
Otvori PDF: `data/sources/ptfos/ptfos-upute-diplomski-2020.pdf#page=10`
```
TEMPLATE: {authors}: {title}. {publisher}[[, {place}]], {year}.
QUOTE   : Prezime I: Naslov knjige ili skripte. Nakladnik, mjesto izdanja, godina izdanja.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Shematski obrazac s doslovnom interpunkcijom (dvotocka iza autora, godina na kraju). Konkretan worked example knjige je u ekstrakciji odsjecen (na str. 11 ostao samo rep 'education. Palgrave Macmillan, 2004.'), pa examplea nema. Rep potvrduje pravilo sa str. 10 da mjesto izdanja nije nuzno kod velikih medunarodnih izdavackih kuca, zato je place opcionalan.
```

## poglavlje  [str. 11] (worked-example)
Otvori PDF: `data/sources/ptfos/ptfos-upute-diplomski-2020.pdf#page=11`
```
TEMPLATE: {authors}: {title}. U {container}[[, str. {pages}]]. {publisher}[[, {place}]], {year}.
QUOTE   : Pilizota V: Prerada voa i povra. U Hrvatska poljoprivreda na raskrizju, str. 156-160. Ministarstvo   [grep: OK]
IZVOR   : Pilizota V: Prerada voa i povra. U Hrvatska poljoprivreda na raskrizju, str. 156-160. Ministarstvo poljoprivrede i sumarstva RH, Zagreb, 1997.
RENDER  : Pilizota V: Prerada voa i povra. U Hrvatska poljoprivreda na raskrizju, str. 156-160. Ministarstvo poljoprivrede i sumarstva RH, Zagreb, 1997.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Puni primjer (prelomljen u ekstrakciji): 'Pilizota V: Prerada voa i povra. U Hrvatska poljoprivreda na raskrizju, str. 156-160. Ministarstvo poljoprivrede i sumarstva RH, Zagreb, 1997.' Obrazac: 'Prezime I: Naslov poglavlja ili natuknice. U Naslov knjige ili enciklopedije, raspon stranica (str. od-do). Nakladnik, mjesto izdanja, godina izdanja.' Obrazac NEMA urednika, pa ga ni predlozak nema. Isti oblik vrijedi i za rad u zborniku skupa ('Jug D, Jug I, Ugarci-Hardi Z, Sabo M: Effect of reduced tillage...', str. 11).
```

## clanak  [str. 11] (worked-example)
Otvori PDF: `data/sources/ptfos/ptfos-upute-diplomski-2020.pdf#page=11`
```
TEMPLATE: {authors}: {title}. {container} {volume}:{pages}, {year}.
QUOTE   : Mandi ML, Kenjeri D, Perl Piricki A: Intake of some minerals in healthy adult volunteers from eastern   [grep: OK]
IZVOR   : Mandi ML, Kenjeri D, Perl Piricki A: Intake of some minerals in healthy adult volunteers from eastern Croatia. International Journal of Food Sciences and Nutrition 60:77-87, 2009.
RENDER  : Mandi ML, Kenjeri D, Perl Piricki A: Intake of some minerals in healthy adult volunteers from eastern Croatia. International Journal of Food Sciences and Nutrition 60:77-87, 2009.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Puni primjer (prelomljen u ekstrakciji): 'Mandi ML, Kenjeri D, Perl Piricki A: Intake of some minerals in healthy adult volunteers from eastern Croatia. International Journal of Food Sciences and Nutrition 60:77-87, 2009.' Obrazac: 'Prezime I: Naslov rada. Puni Naslov Casopisa volumen:raspon stranica, godina izdanja.' Puni naziv casopisa (ne kratica), bez broja sveska (issue). Elektronicki casopisi imaju istu formu s brojem clanka umjesto raspona stranica: 'Traka M, Gasper AV, Melchini A: ... PLoS ONE 3:e2568, 2008.' (str. 11), broj clanka ide u polje pages.
```

## mrezni  [str. 6] (derived)
Otvori PDF: `data/sources/ptfos/ptfos-upute-diplomski-2020.pdf#page=6`
```
TEMPLATE: {authors}: {title}. {url}[[ ({accessed})]], {year}.
QUOTE   : Pri upotrebi mreznih izvora preporuca se pohraniti URL adresu ili citavu stranicu s koje   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Ekstrakcija NE sadrzi obrazac za opce mrezne stranice u popisu literature (pokriva samo elektronicke casopise, koji idu pod clanak). Predlozak je izveden iz opceg reda podataka 'Prezime I: Naslov. Izvor, godina.' uz URL, jer izvor izrijekom trazi pohranu URL adrese mreznog izvora (str. 6), a in-text pravila kazu da se i publikacije s mreznog izvora citiraju autor-godina (str. 9). Opcionalni datum pristupa je dodana konvencija, izvor ga u ekstrakciji ne propisuje (zato accessDate false). Potvrditi ili oboriti pri verifikaciji.
```

## zavrsni  [str. 11] (worked-example)
Otvori PDF: `data/sources/ptfos/ptfos-upute-diplomski-2020.pdf#page=11`
```
TEMPLATE: {authors}: {title}. Diplomski rad. {institution}[[, {place}]], {year}.
QUOTE   : Mari I: Utjecaj temperature na kinetiku halogenog susenja tjestenine. Diplomski rad. Prehrambeno-   [grep: OK]
IZVOR   : Mari I: Utjecaj temperature na kinetiku halogenog susenja tjestenine. Diplomski rad. Prehrambeno-tehnoloski fakultet, Osijek, 2005.
RENDER  : Mari I: Utjecaj temperature na kinetiku halogenog susenja tjestenine. Diplomski rad. Prehrambeno-tehnoloski fakultet, Osijek, 2005.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Puni primjer (prelomljen u ekstrakciji na spojnici): 'Mari I: Utjecaj temperature na kinetiku halogenog susenja tjestenine. Diplomski rad. Prehrambeno-tehnoloski fakultet, Osijek, 2005.' Obrazac: 'Prezime I: Naslov rada. Vrsta rada. Naziv institucije, mjesto izdanja, godina izdanja.' Vrsta rada varira (diplomski rad, magistarski rad, disertacija); alat koristi 'Diplomski rad.' kao default, za druge vrste korisnik rucno mijenja.
```

## propis  [str. 11] (derived)
Otvori PDF: `data/sources/ptfos/ptfos-upute-diplomski-2020.pdf#page=11`
```
TEMPLATE: {authors}: {title}. [[{container} {issue}, ]]{year}.
QUOTE   : Djela u izdanju organizacija (zakoni, pravilnici, norme, prirucnici, izvjesa, i dr.)   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Ekstrakcija iz sekcije o djelima organizacija sadrzi samo podnaslov IZVJESA s pravilom 'Izvjesa i slicni dokumenti citiraju se poput knjiga.' (str. 11); obrazac za zakone, pravilnike i norme je odsjecen. Predlozak je izveden iz oblika za knjigu s organizacijom (kraticom donositelja) kao autorom, kako to rade in-text primjeri '(MZSS, 2008)' i '(HZN, 2004)' (str. 10); glasilo (npr. Narodne novine) i broj idu u container/issue. Potvrditi ili oboriti pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: (nema)
RENDER   : (Lovric, 1988)   /  (Lovric, 1988)
QUOTE    : Rezultati navedenog rada su ukazali na niske razine aflatoksina (Sarkanj, 2010).   [grep: OK]
NAPOMENA : Autor-godina u zagradi na kraju recenice. Dva autora veznikom i: '(Budzaki i Seruga, 2005)' (str. 9); vise od dva autora prvi + 'i sur.': '(Tisma i sur., 2009)' (str. 9); vise radova odvaja tocka-zarez '(Primorac, 2008; Kopjar i sur., 2009)'; isti autor ista godina dobiva slova a, b: '(Klapec, 2007a; 2007b)' (str. 10); organizacije kraticom '(WHO, 2008)', '(MZSS, 2008)' (str. 10). U tekstu bez zagrade oblik je 'Nedi-Tiban (2009)'. Izvor ne pokazuje in-text citat s brojem stranice, pa withPagesTemplate nije postavljen.
```

## Kontradikcije / otvorena pitanja
- Prior profila predlaze harvard, ali upute ne imenuju nijedan standardni stil: u tekstu je autor-godina nalik Harvardu, no popis literature ima vlastiti PTFOS red (Prezime II: Naslov. Nakladnik, mjesto, godina.) s dvotockom iza autora, inicijalima bez tocaka i godinom na KRAJU, pa je izraden custom-spec umjesto style-pin harvard.
- Knjiga: konkretan primjer je u ekstrakciji odsjecen (ostao samo rep 'education. Palgrave Macmillan, 2004.' na str. 11), predlozak je uzet iz shematskog retka (rule-text) na str. 10.
- Poglavlje u knjizi po obrascu NEMA urednika (neuobicajeno), pa ga predlozak nema; isti oblik pokriva i radove u zborniku skupa.
- Mrezne stranice i propisi nisu pokriveni ekstrakcijom (odsjeceni dijelovi dokumenta); predlosci su derived i traze potvrdu nad punim PDF-om.
- Et-al prag u popisu literature nije prikazan: primjeri ispisuju sva imena do 4 autora ('Jug D, Jug I, Ugarci-Hardi Z, Sabo M'), pa je etAlAfter null; u tekstu se 3 i vise autora krati na prvi + 'i sur.'.
- Elektronicki casopisi koriste broj clanka umjesto raspona stranica (PLoS ONE 3:e2568); alat ima jedan clanak predlozak pa broj clanka ide u polje pages.
- Datum pristupa mreznom izvoru nije propisan u ekstrakciji (samo preporuka o pohrani URL-a), accessed je opcionalna dodana konvencija.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `7f31be75164c...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs ptfos "Daniel Risavi"`.
