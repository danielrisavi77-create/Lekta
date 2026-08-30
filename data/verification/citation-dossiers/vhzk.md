# Citatni spec: vhzk (outcome: custom-spec, status: verified)

Stil: **Harvard (službene upute VHZK)** (token `vhzk-harvard`)
Izvor: Pravilnik o završnom radu, Prilog 7: Upute za tehničko oblikovanje i citiranje literature (Veleučilište Hrvatsko zagorje Krapina) (`vhzk-pravilnik-zavrsni-2022`)
Snapshot: `data/sources/vhzk/vhzk.pdf` (hash `2c3b183451b7...`)

## knjiga  [str. 18] (worked-example)
Otvori PDF: `data/sources/vhzk/vhzk.pdf#page=18`
```
TEMPLATE: {authors}, ({year}), {title}[[, {volume}]], {place}: {publisher}.
QUOTE   : Balić, A., (2000), Istraživanja, Zagreb: Najbolja štamparija.   [grep: OK]
IZVOR   : Bali, A., (2000), Istrazivanja, Zagreb: Najbolja stamparija.
RENDER  : Bali, A., (2000), Istrazivanja, Zagreb: Najbolja stamparija.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Format iz izvora: 'Autor, Inicijal imena, (godina), Naslov knjige, Izdanje (samo ako nije prvo), Mjesto izdavanja knjige: Izdavac.' Zarez iza inicijala i iza (godine); dvotocka prije izdavaca; zavrsna tocka. Volume = broj izdanja, opcionalno (samo ako nije prvo). Dva autora se spajaju s ' i ' (Poli, D. i Soli, K.); vise autora 'Zoli, J. i ost.'; urednici 'Zoli, M. i Roli, N. urednici'.
```

## poglavlje  [str. 18] (derived)
Otvori PDF: `data/sources/vhzk/vhzk.pdf#page=18`
```
TEMPLATE: {authors}, ({year}), {title}, u: {editor} (ur.), {container}[[, {volume}]], {place}: {publisher}.
QUOTE   : Žolić, M. i Rolić, N. urednici, (2011), Zbornik radova, Krapina: Izdavač d.o.o   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvedeno iz oblika za knjigu. Ekstrakcija je odrezana na primjerima knjiga pa nema primjera poglavlja u zborniku; izvor prikazuje samo cijeli uredeni zbornik s oznakom 'urednici' iza imena urednika. Predlozak koristi kompaktni '(ur.)' i raspored 'naslov poglavlja, u: urednik, naslov zbornika' izveden iz Harvardske konvencije; uskladiti s oblikom 'urednici' pri verifikaciji.
```

## clanak  [str. 17] (derived)
Otvori PDF: `data/sources/vhzk/vhzk.pdf#page=17`
```
TEMPLATE: {authors}, ({year}), {title}, {container}, {volume}[[({issue})]][[, str. {pages}]].
QUOTE   : Radove u završnom radu treba citirati i referencirati Harvardskim stilom (Panjkota, 2010). Osnovna je   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor izrijekom propisuje Harvardski stil, ali u odrezanoj ekstrakciji nema primjera clanka u casopisu. Predlozak (autor, (godina), naslov, casopis, godiste(broj), stranice) izveden je iz Harvardske konvencije uz interpunkciju iz oblika za knjigu; potvrditi pri verifikaciji.
```

## mrezni  [str. 17] (derived)
Otvori PDF: `data/sources/vhzk/vhzk.pdf#page=17`
```
TEMPLATE: {authors}, ({year}), {title}, dostupno na: {url} (pristupljeno: {accessed}).
QUOTE   : mogu se naći na: http://lib.irb.hr/web/en/how-to-cite-literature.html (pristupljeno: 9. svibnja 2022.).   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Format datuma pristupa '(pristupljeno: DATUM)' evidentiran je u ovoj recenici (upucivanje na mrezni izvor). Nema punog bibliografskog primjera mreznog izvora u ekstrakciji; predlozak izveden iz oblika za knjigu + ove konvencije pristupa. Uvod 'dostupno na:' je izveden, potvrditi pri verifikaciji.
```

## zavrsni  [str. 18] (derived)
Otvori PDF: `data/sources/vhzk/vhzk.pdf#page=18`
```
TEMPLATE: {authors}, ({year}), {title} (zavrsni rad), {place}: {institution}.
QUOTE   : Osnovna karakteristika da se abecednim redom navode svi izvori prema prezimenu prvog autora ili   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor ne obraduje citiranje zavrsnih/diplomskih radova kao izvora. Predlozak izveden iz oblika za knjigu (ustanova umjesto izdavaca, oznaka '(zavrsni rad)'); potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 17] (derived)
Otvori PDF: `data/sources/vhzk/vhzk.pdf#page=17`
```
TEMPLATE: {title}, {container}[[, br. {issue}]].
QUOTE   : Zakonom o autorskom pravu i srodnim pravima (2021) i Zakonom o znanstvenoj djelatnosti i visokom   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Zakoni se u izvoru pojavljuju samo kao navodi u tekstu (naziv zakona + godina u zagradi). Nema bibliografskog primjera propisa; predlozak (naziv, glasilo, broj) izveden je iz opce hrvatske prakse, potvrditi pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: (nema)
RENDER   : (Lovric, 1988)   /  (Lovric, 1988)
QUOTE    : Uočeno je da su pomoćna sredstva neophodna za uspješni rad (Polić, 2001).   [grep: OK]
NAPOMENA : Harvardski stil, autor-godina: 'u tekstu se navodi u okruglim zagradama prezime (prvog) autora i godina izdavanja'. Narativni oblik 'Mali (1999) izvjestava'; parafraza/referenca na kraju recenice '(Poli, 2001)'. Doslovni navod ide unutar navodnih znakova ('Doli (2005) definira: ,,...'); izvor NE prikazuje broj stranice u tekstu pa withPagesTemplate nije postavljen.
```

## Kontradikcije / otvorena pitanja
- Ekstrakcija je odrezana na primjerima za knjigu (str. 18); samo sourceType 'knjiga' ima worked-example, dok su poglavlje/clanak/mrezni/zavrsni/propis izvedeni (derived) i cekaju potvrdu iz punih Uputa (Prilog 7, poglavlje 3.2.2).
- Prag za 'i ost.' (etAlAfter) i konfiguracija authorsShort nisu brojcano propisani u izvoru; oblik 'Zoli, J. i ost.' je evidentiran (etAlKeep 1), a prag 3 je Harvardska pretpostavka.
- Izvor u primjerima doslovnih navoda ne prikazuje broj stranice u tekstu (npr. 'Doli (2005) definira...'), pa withPagesTemplate nije postavljen iako standardni Harvard koristi stranice za doslovne navode.
- Uredeni zbornik u izvoru koristi rijec 'urednici' iza imena ('Zoli, M. i Roli, N. urednici'); predlozak za poglavlje koristi kompaktni '(ur.)' i treba ga uskladiti pri verifikaciji.
- Prior hint ['harvard'] potvrden je izvorom (Harvardski stil izrijekom imenovan, str. 17); nema proturjecja s priorom.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `2c3b183451b7...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs vhzk "Daniel Risavi"`.
