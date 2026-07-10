# Citatni spec: grad (outcome: custom-spec, status: verified)

Stil: **Numericko navodenje u uglatim zagradama (sluzbeni predlozak GRAD)** (token `grad`)
Izvor: Sluzbeni predlozak zavrsnog/diplomskog rada Gradevinskog fakulteta u Zagrebu (2024) (`grad-predlozak-2024`)
Snapshot: `data/sources/grad/grad-predlozak-2024.docx` (hash `6a9db283e1b6...`)

## knjiga  [str. 1] (worked-example)
Otvori PDF: `data/sources/grad/grad-predlozak-2024.docx#page=1`
```
TEMPLATE: {authors}: {title}, {publisher}, {year}.
QUOTE   : [1]Cerić, A., Ivić, I: Upute za pisanje i obranu studentskih radova, Sveučilište u Zagrebu, Građevinski fakultet, 2023.   [grep: OK]
IZVOR   : Cerić, A., Ivić, I: Upute za pisanje i obranu studentskih radova, Sveučilište u Zagrebu, Građevinski fakultet, 2023.
RENDER  : Cerić, A., Ivić, I.: Upute za pisanje i obranu studentskih radova, Sveučilište u Zagrebu, Građevinski fakultet, 2023.
VERDIKT : DIFF (deklariran)  <-- USPOREDI ZNAK PO ZNAK
DEKLARIRANO: Doslovni tipfeler izvora: 'Ivić, I:' bez tocke iza inicijala (clanak na istoj stranici ima 'Hao, S.:' s tockom); renderer dosljedno pise tocku pa izlazi 'Ivić, I.:'. Covjek odlucuje je li tipfeler obvezujuci.
NAPOMENA: Jedini knjizni primjer u predlosku je institucijska publikacija: izdavac je ustanova (Sveuciliste u Zagrebu, Gradevinski fakultet), mjesto izdanja se ne navodi. Autorski blok zavrsava dvotockom prije naslova. U izvorniku 'Ivić, I:' bez tocke iza inicijala (vjerojatno tipfeler predloska); quoteRaw i expected zadrzani doslovno. Oznaku [n] ispred jedinice dodaje prikaz popisa, nije dio retka. OCEKIVANI DIFF u dosjeu: renderer pise 'Ivić, I.:' s tockom iza inicijala, a expected zadrzava doslovni tipfeler izvora 'Ivić, I:'; covjek odlucuje je li tipfeler obvezujuci.
```

## clanak  [str. 1] (worked-example)
Otvori PDF: `data/sources/grad/grad-predlozak-2024.docx#page=1`
```
TEMPLATE: {authors}: {title}, {container}[[, {publisher}]], Vol. {volume}[[, {issue}]], {pages}, {year}.
QUOTE   : [2]Hao, S.: I-35W Bridge Collapse, Journal of Bridge Engineering, ASCE, Vol. 15, 5, 608–614, 2010.   [grep: OK]
IZVOR   : Hao, S.: I-35W Bridge Collapse, Journal of Bridge Engineering, ASCE, Vol. 15, 5, 608–614, 2010.
RENDER  : Hao, S.: I-35W Bridge Collapse, Journal of Bridge Engineering, ASCE, Vol. 15, 5, 608–614, 2010.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: ASCE je izdavac casopisa i ulazi kao opcionalni publisher. Godiste s prefiksom 'Vol.', broj sveska goli broj bez oznake, zatim raspon stranica bez 'str.', godina na kraju. Raspon stranica u izvorniku sadrzi en crticu (608–614); zadrzano doslovno u expected.
```

## poglavlje  [str. 1] (derived)
Otvori PDF: `data/sources/grad/grad-predlozak-2024.docx#page=1`
```
TEMPLATE: {authors}: {title}, u: {editor} (ur.), {container}, {publisher}[[, {pages}]], {year}.
QUOTE   : Popis literature treba izraditi u skladu s odabranim stilom navođenja prema [1].   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Predlozak nema primjer poglavlja u zborniku. Red je izveden iz oblika za knjigu i clanak (autori pa dvotocka, naslov, podaci o izdanju, stranice bez 'str.', godina na kraju); veznik 'u:' i oznaka '(ur.)' su uobicajena hrvatska konvencija koju izvor ne potvrdjuje. Potvrditi ili oboriti pri verifikaciji prema Uputama [1].
```

## mrezni  [str. 1] (derived)
Otvori PDF: `data/sources/grad/grad-predlozak-2024.docx#page=1`
```
TEMPLATE: {authors}: {title}[[, {container}]], {url}[[ (pristupljeno {accessed})]].
QUOTE   : Popis literature treba izraditi u skladu s odabranim stilom navođenja prema [1].   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Predlozak nema primjer mreznog izvora. Red je izveden iz opceg reda predloska (autori pa dvotocka, naslov, podaci); formulacija '(pristupljeno ...)' i sam datum pristupa nisu potvrdjeni izvorom, pa je accessed opcionalan. Potvrditi prema Uputama [1].
```

## zavrsni  [str. 1] (derived)
Otvori PDF: `data/sources/grad/grad-predlozak-2024.docx#page=1`
```
TEMPLATE: {authors}: {title}, {institution}, {year}.
QUOTE   : Popis literature treba izraditi u skladu s odabranim stilom navođenja prema [1].   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Predlozak ne obraduje citiranje zavrsnih/diplomskih radova. Red je izveden iz oblika za knjigu, s ustanovom umjesto izdavaca (po uzoru na primjer [1] gdje je izdavac fakultet). Oznaka vrste rada nije dodana jer je izvor ne potvrdjuje.
```

## propis  [str. 1] (derived)
Otvori PDF: `data/sources/grad/grad-predlozak-2024.docx#page=1`
```
TEMPLATE: {title}, {container}[[, {issue}]].
QUOTE   : Popis literature treba izraditi u skladu s odabranim stilom navođenja prema [1].   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Predlozak ne obraduje pravne propise. Red je minimalno izveden (naziv propisa, glasilo, broj glasila u opcionalnom issue) i nije potvrdjen izvorom; za gradevinsku struku propisi su rijedak tip izvora. Potvrditi prema Uputama [1].
```

## Kontradikcije / otvorena pitanja
- Profil-prior je ieee, ali izvor nigdje ne imenuje IEEE: in-text uglate zagrade jesu nalik IEEE, no bibliografski red predloska (Prezime, I.: Naslov, casopis, Vol. X, br, str-str, godina.) ne odgovara IEEE obliku (I. Prezime, "Naslov," ... vol. X, no. Y, pp. ...), pa je izradjen custom-spec prema primjerima iz predloska umjesto style-pina.
- Predlozak izrijekom upucuje da se popis literature izraduje 'u skladu s odabranim stilom navodjenja prema [1]' (Ceric, Ivic: Upute za pisanje i obranu studentskih radova, 2023), a te Upute NISU u ekstrakciji; spec je izveden iskljucivo iz vlastitog popisa literature predloska i moguce je da Upute dopustaju vise stilova.
- Samo 2 worked-example retka (institucijska publikacija kao knjiga i clanak u casopisu); poglavlje, mrezni, zavrsni i propis su derived i nepotvrdjeni.
- bibliography.sort=appearance je zakljucen iz numerickog stila uglatih zagrada, nije izrijekom propisan (popis u predlosku je ujedno i abecedan pa ne razlikuje hipoteze).
- U izvorniku 'Ivić, I:' bez tocke iza inicijala, dok clanak ima 'Hao, S.:'; nekonzistentno u samom izvoru, quoteRaw i expected zadrzani doslovno.
- Svaka jedinica popisa nosi oznaku [n] neposredno uz red ('[1]Cerić...', '[2]Hao...'); numbering polje ostavljeno null jer schema mapiranje oznake nije poznato, oznaku treba dodavati prikaz popisa.
- Razmak izmedu visestrukih inicijala (dotted-spaced) nije dokaziv iz primjera s jednim inicijalom; pretpostavljen razmak.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `6a9db283e1b6...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs grad "Daniel Risavi"`.
