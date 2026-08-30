# Citatni spec: pmfst (outcome: custom-spec, status: verified)

Stil: **PMFST autor-godina (upute Odjela za biologiju i kemiju)** (token `pmfst`)
Izvor: Upute za pisanje završnog rada (PMFST, odjel bio/kem) (`pmfst-upute-zavrsni`)
Snapshot: `data/sources/pmfst/pmfst-upute-zavrsni.pdf` (hash `cb10791e4870...`)

## knjiga  [str. 4] (worked-example)
Otvori PDF: `data/sources/pmfst/pmfst-upute-zavrsni.pdf#page=4`
```
TEMPLATE: {authors} ({year}). {title}. {publisher}[[, {place}]].
QUOTE   : Stearns, S. C. (1992). The evolution of life histories. Oxford University Press, Oxford.   [grep: OK]
IZVOR   : Stearns, S. C. (1992). The evolution of life histories. Oxford University Press, Oxford.
RENDER  : Stearns, S. C. (1992). The evolution of life histories. Oxford University Press, Oxford.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Redoslijed izdavac pa mjesto (obratno od poglavlja, gdje je mjesto pa izdavac); tocka iza zagrade s godinom. Inicijali s razmakom ('S. C.'), vidi kontradikciju o nekonzistentnim inicijalima.
```

## poglavlje  [str. 5] (worked-example)
Otvori PDF: `data/sources/pmfst/pmfst-upute-zavrsni.pdf#page=5`
```
TEMPLATE: {authors} ({year}). {title}. U: {editor} (ur.) {container}. {place}, {publisher}[[, str. {pages}]].
QUOTE   : Gaines, G., Elbrächter, M. (1987). Heterotrophic nutrition. U: Taylor, F. J. R. (ur.) The biology of   [grep: OK]
IZVOR   : Gaines, G., Elbr�chter, M. (1987). Heterotrophic nutrition. U: Taylor, F. J. R. (ur.) The biology of the dinoflagellates. Oxford, Blackwell Scientific Publications, str. 224-268.
RENDER  : Gaines, G., Elbr�chter, M. (1987). Heterotrophic nutrition. U: Taylor, F. J. R. (ur.) The biology of the dinoflagellates. Oxford, Blackwell Scientific Publications, str. 224-268.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Urednik u obliku 'Prezime, I.' pa '(ur.)' S tockom, bez zareza iza '(ur.)'; kod poglavlja mjesto ide PRIJE izdavaca ('Oxford, Blackwell Scientific Publications'), obratno od knjige; stranice 'str. 224-268'. Znak � u prezimenu urednika je pdftotext artefakt (u PDF-u dijakritika).
```

## clanak  [str. 4] (worked-example)
Otvori PDF: `data/sources/pmfst/pmfst-upute-zavrsni.pdf#page=4`
```
TEMPLATE: {authors} ({year}). {title}. {container}[[ {volume}]][[: {pages}]].
QUOTE   : McGinnis, W., Krumlauf, R. (1992). Homeobox genes and axial pattering. Cell 68: 283-302.   [grep: OK]
IZVOR   : McGinnis, W., Krumlauf, R. (1992). Homeobox genes and axial pattering. Cell 68: 283-302.
RENDER  : McGinnis, W., Krumlauf, R. (1992). Homeobox genes and axial pattering. Cell 68: 283-302.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Casopis (moze i kraticom, npr. 'Dev. Biol.') pa volumen golim brojem, dvotocka, raspon stranica; bez broja sveska u primjerima. Drugi primjer (Teillet i sur., 3 autora) potvrdjuje da se u popisu navode SVI autori odvojeni zarezom, bez veznika prije zadnjeg.
```

## mrezni  [str. 5] (worked-example)
Otvori PDF: `data/sources/pmfst/pmfst-upute-zavrsni.pdf#page=5`
```
TEMPLATE: {authors}[[ ({year})]] {title}.[[ {container}.]] {url} Pristupljeno {accessed}.
QUOTE   : NIKOLIĆ, T. (ed.) (2012) Flora Croatica baza podataka / Flora Croatica Database. On-Line   [grep: OK]
IZVOR   : NIKOLI, T. (ed.) (2012) Flora Croatica baza podataka / Flora Croatica Database. On-Line URL: http://hirc.botanic.hr/fcd/ Botanicki zavod, Prirodoslovno-matematicki fakultet, Sveuciliste u Zagrebu. Pristupljeno 12. 7. 2012.
RENDER  : NIKOLI, T. (2012) Flora Croatica baza podataka / Flora Croatica Database. http://hirc.botanic.hr/fcd/ Pristupljeno 12. 7. 2012.
VERDIKT : DIFF (deklariran)  <-- USPOREDI ZNAK PO ZNAK
DEKLARIRANO: Jedini worked-example u izvoru je specijalni slucaj (mrezna baza podataka): sadrzi '(ed.)' iza autora, oznaku 'On-Line URL:' i ustanovu iza URL-a, sto propisani rule-text oblik (Naslov teksta. Naslov cijele stranice. Adresa stranice. Datum pristupa.) ne predvida. Predlozak slijedi rule-text oblik pa render namjerno ispusta te tri specificnosti.
NAPOMENA: Rule-text oblik (isti odlomak, str. 5): 'Prezime i inicijali imena autora stranice/institucije (ako nisu poznati staviti naziv Anonymus) (datum kreiranja ili azuriranja stranice) Naslov teksta. Naslov cijele stranice. Adresa stranice. Datum pristupa.' Container = naslov cijele stranice; ako autor nije poznat, upisuje se 'Anonymus'. Bez tocke iza zagrade s godinom (za razliku od ostalih vrsta izvora).
```

## zavrsni  [str. 4] (derived)
Otvori PDF: `data/sources/pmfst/pmfst-upute-zavrsni.pdf#page=4`
```
TEMPLATE: {authors} ({year}). {title}. {institution}[[, {place}]].
QUOTE   : Poglavlje LITERATURA sadrži popis svih izvornika tj. znanstvenih radova, monografija,   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju citiranje zavrsnih/diplomskih radova kao izvora. Predlozak je izveden iz oblika za knjigu (izdavac zamijenjen ustanovom). Oznaka vrste rada (npr. 'zavrsni rad') nije dodana jer je izvor ne potvrdjuje. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 1] (derived)
Otvori PDF: `data/sources/pmfst/pmfst-upute-zavrsni.pdf#page=1`
```
TEMPLATE: {title}[[ ({year})]]. {container}[[ {issue}]].
QUOTE   : naziva i kratica nalazi se u Narodnim novinama 107/2007.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju citiranje propisa. Predlozak je izveden iz nacina na koji same upute referiraju sluzbeno glasilo ('Narodnim novinama 107/2007': naziv glasila pa broj/godina, bez 'br.') i kucnog autor-godina oblika (opcionalna godina u zagradi radi citatnice u tekstu). Nepotvrdjeno izvorom, potvrditi pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: (nema)
RENDER   : (Lovric, 1988)   /  (Lovric, 1988)
QUOTE    : U tekstu rada navodi se prezime autora te godina u kojoj je rad objavljen, na primjer: (Holland,   [grep: OK]
NAPOMENA : Primjeri iz izvora: jedan autor '(Holland, 2000)', dva autora '(Hughes i Kaufman, 2002)', tri i vise prvi autor + 'i sur.' '(Graham i sur., 1993)'. Imena kao dio recenice: 'Hughes i Kaufman (2002) su utvrdili da ...'. Izvor nema primjer citata s brojem stranice pa withPagesTemplate namjerno nije postavljen.
```

## Kontradikcije / otvorena pitanja
- Inicijali u primjerima izvora nisu ujednaceni: 'Teillet, A.M.' i 'LeDurain, N.M.' su kompaktni, a 'Stearns, S. C.' i urednik 'Taylor, F. J. R.' s razmakom; sam izvor trazi da interpunkcija bude ujednacena. Odabrano dotted-spaced; potvrditi pri verifikaciji.
- Mrezni worked-example (Flora Croatica) odstupa od vlastitog rule-text oblika ('(ed.)', 'On-Line URL:', ustanova iza URL-a); predlozak slijedi rule-text, render namjerno odstupa od primjera (knownDiff deklariran).
- Zavrsni i propis nisu obradjeni u izvoru; oba predloska su derived i traze potvrdu ili obaranje pri verifikaciji.
- Identicni primjeri citiranja postoje i u pmfst-upute-diplomski (str. 3 i str. 4); spec je sidran na pmfst-upute-zavrsni, a diplomske upute ga neovisno potvrdjuju. Oba izvora vrijede za Odjel za biologiju i kemiju, ne nuzno za cijeli PMFST.
- Profil-prior je 'harvard'; izvor jest u harvardskoj obitelji (autor-godina), ali propisuje vlastiti format worked-exampleima (tocka iza zagrade s godinom, 'i sur.', 'U: Prezime, I. (ur.)', volumen: stranice), pa je izradjen custom-spec umjesto style-pina. Nije proturjecje, nego preciznije od priora.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `cb10791e4870...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs pmfst "Daniel Risavi"`.
