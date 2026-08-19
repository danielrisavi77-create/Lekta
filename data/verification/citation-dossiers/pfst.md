# Citatni spec: pfst (outcome: custom-spec, status: verified)

Stil: **Numeričko navođenje u kutnim zagradama (službene upute PFST)** (token `pfst`)
Izvor: Upute za izradu diplomskih i drugih ocjenskih radova, Pomorski fakultet u Splitu (2022) (`pfst-upute-ocjenski-2022`)
Snapshot: `data/sources/pfst/pfst-upute-ocjenski-2022.pdf` (hash `a0cff8bd6cc0...`)

## knjiga  [str. 25] (worked-example)
Otvori PDF: `data/sources/pfst/pfst-upute-ocjenski-2022.pdf#page=25`
```
TEMPLATE: {authors}: {title}[[, {volume}]], {publisher}, {place}, {year}.
QUOTE   : [1] Bosnjak, I.: Telekomunikacijski promet I, Fakultet prometnih znanosti, Zagreb, 2001.   [grep: OK]
IZVOR   : Bosnjak, I.: Telekomunikacijski promet I, Fakultet prometnih znanosti, Zagreb, 2001.
RENDER  : Bosnjak, I.: Telekomunikacijski promet I, Fakultet prometnih znanosti, Zagreb, 2001.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Pravilo (str. 11): najprije prezime pa inicijali imena odvojeni zarezom, naslov knjige kurzivom, ime izdavacke kuce, sjediste/mjesto izdanja, godina; vise autora odvaja se tocka-zarezom i navode se SVI redom s djela (bez et al.), npr. reference [2] i [8]. Opcionalni {volume} nosi izdanje doslovno kako ga student upise, po uzoru na referencu [2] 'Understanding poetry, 3rd ed, Holt, Rinehart and Winston, New York, 1960.'. Oznaku [n] ispred jedinice dodaje prikaz popisa (referenceMarker), nije dio retka.
```

## clanak  [str. 25] (worked-example)
Otvori PDF: `data/sources/pfst/pfst-upute-ocjenski-2022.pdf#page=25`
```
TEMPLATE: {authors}: {title}, {container}[[, {place}]], {volume}[[, {issue}]], {year}[[, str. {pages}]].
QUOTE   : [7] Lucky, R. W.: Automatic equalization for digital communication, Bell Syst. Tech. J.,   [grep: OK]
IZVOR   : Lucky, R. W.: Automatic equalization for digital communication, Bell Syst. Tech. J., 44, 4, 1965, str. 547-588.
RENDER  : Lucky, R. W.: Automatic equalization for digital communication, Bell Syst. Tech. J., 44, 4, 1965, str. 547-588.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Pravilo (str. 11): prezime, inicijali imena, naslov rada (italic), naslov casopisa, mjesto izdanja, volumen/godiste, redni broj, godina izdanja broja, od-do stranice. Primjeri [7] i [8] ne navode mjesto pa je {place} opcionalan. Template slijedi referencu [7]; referenca [8] ('Strojarstvo 31, 1989, 1, str. 37-43') interno odstupa (volumen uz naslov casopisa, godina prije broja).
```

## poglavlje  [str. 12] (derived)
Otvori PDF: `data/sources/pfst/pfst-upute-ocjenski-2022.pdf#page=12`
```
TEMPLATE: {authors}: {title}, u: {editor} (ur.), {container}, {publisher}, {place}, {year}[[, str. {pages}]].
QUOTE   : Za ostale izvore na odgovarajui nacin se primjenjuje nacin navoenja kao za knjige.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor nema primjer poglavlja u zborniku. Red je izveden iz oblika za knjigu po navedenom pravilu (autori pa dvotocka, naslov, izdavac, mjesto, godina); veznik 'u:' i oznaka '(ur.)' su uobicajena hrvatska konvencija koju izvor ne potvrdjuje. Potvrditi ili oboriti pri verifikaciji.
```

## mrezni  [str. 25] (worked-example)
Otvori PDF: `data/sources/pfst/pfst-upute-ocjenski-2022.pdf#page=25`
```
TEMPLATE: [[{authors}: ]][[{title}. ]][[{year}. ]]{url}, (pristupljeno {accessed}).
QUOTE   : [3] Bruckman, A.: Approaches to managing deviant behavior in virtual communities. Apr.   [grep: OK]
IZVOR   : Bruckman, A.: Approaches to managing deviant behavior in virtual communities. Apr. 1994. ftp://ftp.media.mit.edu/pub/asb/paper/deviance-chi94.txt, (pristupljeno 4.12.1994.).
RENDER  : Bruckman, A.: Approaches to managing deviant behavior in virtual communities. Apr. 1994. ftp://ftp.media.mit.edu/pub/asb/paper/deviance-chi94.txt, (pristupljeno 4.12.1994.).
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Pravilo (str. 11): prezime(na) i inicijali autora ako su poznati, naslov potpunog djela (italic), datum nastanka ako se razlikuje od datuma pristupa, potpuna http/ftp adresa i datum pristupa. Polje {year} nosi datum nastanka doslovno ('Apr. 1994'). Anonimni oblik je samo adresa s datumom, referenca [12] u Prilogu 7: 'http://ic.ims.hr/faq/office2007/word2007/sadrzaj-word2007.html, (pristupljeno 22.5.2015.).'.
```

## zavrsni  [str. 25] (worked-example)
Otvori PDF: `data/sources/pfst/pfst-upute-ocjenski-2022.pdf#page=25`
```
TEMPLATE: {authors}: {title}, {container}, {institution}, {place}, {year}.
QUOTE   : [11] Williams, J: Narrow-band analyzer, doktorska disertacija, Dept. Elect. Eng., Harvard   [grep: OK]
IZVOR   : Williams, J: Narrow-band analyzer, doktorska disertacija, Dept. Elect. Eng., Harvard Univ., Cambridge, MA, 1993.
RENDER  : Williams, J.: Narrow-band analyzer, doktorska disertacija, Dept. Elect. Eng., Harvard Univ., Cambridge, MA, 1993.
VERDIKT : DIFF (deklariran)  <-- USPOREDI ZNAK PO ZNAK
DEKLARIRANO: Doslovni tipfeler izvora: 'Williams, J:' bez tocke iza inicijala, dok svi ostali primjeri Priloga 7 imaju tocku ('Bosnjak, I.:', 'Bruckman, A.:'); renderer dosljedno pise 'Williams, J.:'. Covjek odlucuje je li tipfeler obvezujuci.
NAPOMENA: Pravilo (str. 11) izjednacava disertacije i magistarske radove s knjigama; referenca [11] dodaje vrstu rada iza naslova. Polje {container} nosi vrstu rada ('doktorska disertacija', 'diplomski rad'), {institution} ustanovu (u primjeru i odjel), {place} mjesto.
```

## propis  [str. 11] (worked-example)
Otvori PDF: `data/sources/pfst/pfst-upute-ocjenski-2022.pdf#page=11`
```
TEMPLATE: {title} ({container}, br. {issue}).
QUOTE   : Primjer: Pruzanje usluga informacijskog drustva u Hrvatskoj je ureeno Zakonom o   [grep: OK]
IZVOR   : Zakonom o elektronickoj trgovini (Narodne novine, br. 173/2003, 67/2008, 36/2009 i 130/2011).
RENDER  : Zakonom o elektronickoj trgovini (Narodne novine, br. 173/2003, 67/2008, 36/2009 i 130/2011).
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer je recenica u tekstu pa je naziv u instrumentalu ('Zakonom o elektronickoj trgovini'); expected zadrzava doslovan oblik iz izvora, u nominativu bi bilo 'Zakon o elektronickoj trgovini'. Pravilo trazi puni naziv iza kojeg se u zagradi navodi kratica naziva te brojevi i godine sluzbenog glasila; Primjer kraticu ne pokazuje pa je template bez nje. Propisi citirani u tekstu u pravilu se NE navode u popisu literature; ako se navedu, idu na kraj popisa malo odvojeno.
```

## Kontradikcije / otvorena pitanja
- Profil-prior je ieee, ali izvor nigdje ne imenuje IEEE: kutne zagrade s brojevima jesu nalik IEEE, no bibliografski red (Prezime, I.: Naslov, izdavac, mjesto, godina.) ne odgovara IEEE obliku (I. Prezime, "Naslov," ...), pa je izradjen custom-spec prema primjerima iz Priloga 7 umjesto style-pina.
- bibliography.sort=alphabetical je izrijekom propisan ('abecednim redoslijedom prema uputama za navoenje literature', str. 11) i Prilog 7 je dosljedno abecedan, sto je neuobicajeno za numericki stil: brojevi prate abecedni popis, ne redoslijed pojavljivanja.
- Clanak: primjeri [7] i [8] su medjusobno nekonzistentni ([8] stavlja volumen uz naslov casopisa i godinu prije rednog broja); template slijedi [7] koji odgovara i tekstu pravila. Pravilo spominje i mjesto izdanja casopisa koje primjeri ne pokazuju, pa je place opcionalan.
- Knjiga: referenca [9] 'Radosevi, D.: Osnove teorije sustava. Nakladni zavod Matice Hrvatske, Zagreb, 2001.' koristi tocku iza naslova, dok [1], [2] i [10] koriste zarez; template slijedi vecinski zarez.
- Mrezni: anonimni primjer na str. 12 '[12] www.skladisna-logistika.hr, (26. sijecnja, 2020.)' nema rijec 'pristupljeno' u zagradi, dok reference [3] i [12] u Prilogu 7 imaju '(pristupljeno ...)'; template slijedi Prilog 7.
- Poglavlje u zborniku nije obradjeno u izvoru; izvedeno iz pravila 'kao za knjige' (str. 12), veznik 'u:' i '(ur.)' su nepotvrdjena konvencija.
- Propis: pravilo trazi kraticu naziva u zagradi, ali Primjer je ne pokazuje; template slijedi Primjer bez kratice. Naziv u expected je doslovno u instrumentalu jer je Primjer recenica u tekstu.
- Naslovi knjiga i radova su u izvorniku kurzivom (italic); alat radi plain text.
- Zavrsni: 'Williams, J:' bez tocke iza inicijala je tipfeler izvora; knownDiff deklariran, renderer pise tocku.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `a0cff8bd6cc0...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs pfst "Daniel Risavi"`.
