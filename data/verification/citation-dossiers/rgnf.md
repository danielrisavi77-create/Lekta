# Citatni spec: rgnf (outcome: custom-spec, status: verified)

Stil: **Harvard autor-godina (službene upute RGNF)** (token `rgnf-harvard`)
Izvor: Predlozak za izradu završnog i diplomskog rada (Rudarsko-geološko-naftni fakultet) (`rgnf-predlozak-2022`)
Snapshot: `data/sources/rgnf/rgnf-predlozak-2022.docx` (hash `1773255a260c...`)

## knjiga  [str. 1] (worked-example)
Otvori PDF: `data/sources/rgnf/rgnf-predlozak-2022.docx#page=1`
```
TEMPLATE: {authors} {year}. {title}.[[ {volume}. izdanje.]] {place}: {publisher}.
QUOTE   : JOVIČIĆ, V., MILJKOVIĆ, M., NUIĆ, J., ULJIĆ, H., VUKIĆ, M. 1987. Sigurnost i tehnička zaštita u   rudarstvu. Tuzla: Univerzitetska knjiga.   [grep: OK]
IZVOR   : JOVIČIĆ, V., MILJKOVIĆ, M., NUIĆ, J., ULJIĆ, H., VUKIĆ, M. 1987. Sigurnost i tehnička zaštita u rudarstvu. Tuzla: Univerzitetska knjiga.
RENDER  : JOVIČIĆ, V., MILJKOVIĆ, M., NUIĆ, J., ULJIĆ, H., VUKIĆ, M. 1987. Sigurnost i tehnička zaštita u rudarstvu. Tuzla: Univerzitetska knjiga.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Struktura: PREZIME, INICIJAL(I) AUTORA. GODINA. Naziv rada. Izdanje (ako nije prvo). Mjesto izdavanja: Nakladnik. Prezimena velikim slovima; godina iza autora s tockom; svi autori odvojeni zarezom bez veznika prije zadnjeg. Izdanje je opcionalno (izveden [[{volume}. izdanje.]], nije u primjeru).
```

## poglavlje  [str. 1] (derived)
Otvori PDF: `data/sources/rgnf/rgnf-predlozak-2022.docx#page=1`
```
TEMPLATE: {authors} {year}. {title}. U: {editor} (ur.) {container}. {place}: {publisher}[[, str. {pages}]].
QUOTE   : PREZIME, INICIJAL(I) AUTORA. GODINA. Naziv rada. Izdanje (ako nije prvo). Mjesto izdavanja: Nakladnik.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor NEMA vlastiti primjer poglavlja u knjizi/zborniku. Template izveden iz strukture za knjige (family-first, godina iza autora, Mjesto: Nakladnik) uz standardnu konstrukciju 'U: urednik (ur.)'. Potvrditi ili oboriti pri verifikaciji.
```

## clanak  [str. 1] (worked-example)
Otvori PDF: `data/sources/rgnf/rgnf-predlozak-2022.docx#page=1`
```
TEMPLATE: {authors} {year}. {title}. {container}, {volume}[[({issue})]], str. {pages}.
QUOTE   : MATIĆ, M., PERIĆ, P. 1999. Slijeganje površine terena uzrokovan podzemnom eksploatacijom. Građevinar, 43(6), str. 5-17.   [grep: OK]
IZVOR   : MATIĆ, M., PERIĆ, P. 1999. Slijeganje površine terena uzrokovan podzemnom eksploatacijom. Građevinar, 43(6), str. 5-17.
RENDER  : MATIĆ, M., PERIĆ, P. 1999. Slijeganje površine terena uzrokovan podzemnom eksploatacijom. Građevinar, 43(6), str. 5-17.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Struktura: PREZIME, INICIJAL(I) AUTORA. GODINA. Naslov clanka. Naslov casopisa. Volumen (broj), pocetna-zavrsna stranica. Casopis odvojen zarezom, godiste bez razmaka do (broj), raspon stranica uz 'str.'.
```

## mrezni  [str. 1] (worked-example)
Otvori PDF: `data/sources/rgnf/rgnf-predlozak-2022.docx#page=1`
```
TEMPLATE: {authors} {year}. {title}. URL: {url} ({accessed})
QUOTE   : VIADUKT d.d. 2006. Tunel Sleme. URL: http://www.viadukt.hr/ tunel-sleme-desna-cijev  (3.9.2006.)   [grep: OK]
IZVOR   : VIADUKT d.d. 2006. Tunel Sleme. URL: http://www.viadukt.hr/tunel-sleme-desna-cijev (3.9.2006.)
RENDER  : d.d., V. 2006. Tunel Sleme. URL: http://www.viadukt.hr/tunel-sleme-desna-cijev (3.9.2006.)
VERDIKT : DIFF (deklariran)  <-- USPOREDI ZNAK PO ZNAK
DEKLARIRANO: Institucijski autor (VIADUKT d.d.); author-formatter ga tretira kao osobu jer org-detekcija ne hvata naziv s d.d. sufiksom, pa render daje "d.d., V." umjesto "VIADUKT d.d.". Za institucijske autore u ovom stilu unos ostaje doslovan; ogranicenje alata, ne izvora.
NAPOMENA: Struktura: PREZIME, INICIJAL(I) AUTORA. GODINA. Naziv teksta/web stranice. URL adresa (datum pristupa). Prefiks 'URL:' doslovan; datum pristupa u zagradi. Razmaci u URL-u u ekstrakciji su artefakt pdftotext-a (spojeni u polju url). Organizacija kao autor: puni ili skraceni naziv (npr. VIADUKT d.d.).
```

## zavrsni  [str. 1] (worked-example)
Otvori PDF: `data/sources/rgnf/rgnf-predlozak-2022.docx#page=1`
```
TEMPLATE: {authors} {year}. {title}.[[ {container}.]] {place}: {institution}[[, {issue}]].
QUOTE   : MIKO, S., PEH, Z., ŠPARICA, M. 2001. Geokemijski atlas zapadne Hrvatske. Izvještaj. Zagreb: Institut za geološka istraživanja, 36/2001.   [grep: OK]
IZVOR   : MIKO, S., PEH, Z., ŠPARICA, M. 2001. Geokemijski atlas zapadne Hrvatske. Izvještaj. Zagreb: Institut za geološka istraživanja, 36/2001.
RENDER  : MIKO, S., PEH, Z., ŠPARICA, M. 2001. Geokemijski atlas zapadne Hrvatske. Izvještaj. Zagreb: Institut za geološka istraživanja, 36/2001.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Ista struktura pokriva projekte, studije, elaborate, disertacije te diplomske i zavrsne radove: PREZIME, INICIJALI AUTORA. GODINA. Naziv dokumenta. Vrsta rada (opcionalno, ako nije vidljivo iz naslova). Mjesto institucije: Naziv institucije, broj projekta/studije (opcionalno). Vrsta rada mapirana na container (u primjeru 'Izvještaj'; za diplomski rad upisati 'diplomski rad'), broj projekta na issue. Primjer u izvoru je izvjestaj.
```

## propis  [str. 1] (worked-example)
Otvori PDF: `data/sources/rgnf/rgnf-predlozak-2022.docx#page=1`
```
TEMPLATE: {container} br. {issue}. {title}. {place}: {publisher}
QUOTE   : NARODNE NOVINE br. 142/13. Pravilnik o istraživanju i eksploataciji mineralnih sirovina. Zagreb: Narodne novine d.d.   [grep: OK]
IZVOR   : NARODNE NOVINE br. 142/13. Pravilnik o istraživanju i eksploataciji mineralnih sirovina. Zagreb: Narodne novine d.d.
RENDER  : NARODNE NOVINE br. 142/13. Pravilnik o istraživanju i eksploataciji mineralnih sirovina. Zagreb: Narodne novine d.d.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Struktura: NAZIV I BROJ IZDANJA. Naziv zakona/pravilnika. Mjesto: Naziv izdavaca. Naziv glasila mapiran na container, broj izdanja na issue (uz doslovno 'br.'). Zavrsna tocka je vec u kratici izdavaca (d.d.) pa je template ne dodaje.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: ({authorsShort}, {year}, p. {pages})
RENDER   : (Lovric, 1988)   /  (Lovric, 1988, p. 45)
QUOTE    : "Students often had difficulty using APA style, especially when it was their first time" (Jones, 1998, p. 199).   [grep: OK]
NAPOMENA : Autor i godina u zagradi; jedan autor '(Jones, 1998)', dva '(Dalglish i Rush, 1983)', tri i vise '(Dalglish i dr., 1983)' (moguce i 'et al.'). Doslovni navod dobiva broj stranice: p. {pages}. Prirodni slijed u recenici: autor izvan zagrade, godina u zagradi.
```

## Kontradikcije / otvorena pitanja
- Izvor imenuje harvardski sustav citiranja (str. 1: 'treba slijediti harvardski sustav citiranja') i istodobno daje vlastite formatirane primjere; draft je gradjen iz primjera (custom-spec), sto je u skladu s priorom harvard.
- Prezimena autora u popisu literature pisu se VELIKIM slovima (npr. JOVIČIĆ, V.); authorFormat ne moze automatski proizvesti velika slova iz sirovih polja pa se autorski niz upisuje vec formatiran.
- Poglavlje u knjizi/zborniku nema vlastiti primjer u izvoru; template je izveden iz strukture za knjige (derived, example: null).
- Norme (ORGANIZACIJA/AUTOR. GODINA. BROJ NORME...) i osobna komunikacija imaju vlastite strukture u izvoru, ali ne pripadaju u 6 obveznih sourceTypes pa nisu ukljucene.
- Razmak izmedju viseznakovnih inicijala (initials: dotted-spaced) nije potvrdjen jer svi primjeri imaju jednoslovne inicijale.
- Zavrsni primjer u izvoru je zapravo izvjestaj (Izvještaj); ista struktura pokriva projekte, studije, elaborate, disertacije te diplomske i zavrsne radove.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `1773255a260c...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs rgnf "Daniel Risavi"`.
