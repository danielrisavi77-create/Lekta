# Citatni spec: fbf (outcome: custom-spec, status: verified)

Stil: **Vancouver numeričko (službene upute FBF)** (token `fbf`)
Izvor: Uputa za prijavu teme i oblikovanje završnog specijalističkog rada (Farmaceutsko-biokemijski fakultet, 2014) (`fbf-upute-spec-2014`)
Snapshot: `data/sources/fbf/fbf-upute-spec-2014.pdf` (hash `f9442b886142...`)

## clanak  [str. 3] (worked-example)
Otvori PDF: `data/sources/fbf/fbf-upute-spec-2014.pdf#page=3`
```
TEMPLATE: {authors}. {title}. {container} {year};{volume}:{pages}.
QUOTE   : Marusteri M, Bacarea V.Comparing groups for statistical differences:How to chose the   [grep: OK]
IZVOR   : Marusteri M, Bacarea V. Comparing groups for statistical differences: How to chose the right statistical test. Biochem Med 2010;20:15-32.
RENDER  : Marusteri M, Bacarea V. Comparing groups for statistical differences: How to chose the right statistical test. Biochem Med 2010;20:15-32.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Puni redak (prelomljen u ekstrakciji): 'Marusteri M, Bacarea V.Comparing groups for statistical differences:How to chose the right statistical test. Biochem Med 2010;20:15-32.' Ekstrakcija je izgubila razmak iza 'V.' i iza ':' (pdftotext artefakt); expected je rekonstruiran s razmacima prema razmacima u primjeru poglavlja na istoj stranici. Kompaktan oblik 'godina;volumen:stranice' bez razmaka, skraceni naziv casopisa (Biochem Med), pravopisna gresska 'chose' je iz izvora.
```

## poglavlje  [str. 3] (worked-example)
Otvori PDF: `data/sources/fbf/fbf-upute-spec-2014.pdf#page=3`
```
TEMPLATE: {authors}. {title}. U: {editor}, ur. {container}. {publisher}, {year};{pages}.
QUOTE   : O Donnell VB. Eicosanoid-Based Signaling. U: Jacob K, Winyard PG, ur. Redox Signaling   [grep: OK]
IZVOR   : O Donnell VB. Eicosanoid-Based Signaling. U: Jacob K, Winyard PG, ur. Redox Signaling and Regulation in Biology and Medicine. Wiley-VCH Verlag GmbH and Co KgaA, 2009;229-44.
RENDER  : O Donnell VB. Eicosanoid-Based Signaling. U: Jacob K, Winyard PG, ur. Redox Signaling and Regulation in Biology and Medicine. Wiley-VCH Verlag GmbH and Co KgaA, 2009;229-44.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Puni redak (prelomljen u ekstrakciji): 'O Donnell VB. Eicosanoid-Based Signaling. U: Jacob K, Winyard PG, ur. Redox Signaling and Regulation in Biology and Medicine. Wiley-VCH Verlag GmbH and Co KgaA, 2009;229-44.' Primjer NEMA mjesto izdanja (odstupanje od tipicnog Vancouvera), predlozak slijedi primjer. 'O Donnell' je vjerojatno O'Donnell (apostrof izgubljen u ekstrakciji); 'and Co KgaA' ostavljeno kako pise. Urednici u istom obliku kao autori, oznaka 'ur.' s tockom.
```

## knjiga  [str. 3] (derived)
Otvori PDF: `data/sources/fbf/fbf-upute-spec-2014.pdf#page=3`
```
TEMPLATE: {authors}. {title}.[[ {place}:]] {publisher}, {year}.
QUOTE   : osmišljeno ispitivanje, i prijedlog teme rada. Literatura se navodi Vancouverskim stilom,   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor nema primjer za samostalnu knjigu; oblik je izveden iz primjera poglavlja u urednickoj knjizi na str. 3 (izdavac pa zarez pa godina, bez obveznog mjesta izdanja) uz opcionalno mjesto prema opcoj Vancouver konvenciji. Potvrditi ili oboriti pri verifikaciji.
```

## mrezni  [str. 3] (derived)
Otvori PDF: `data/sources/fbf/fbf-upute-spec-2014.pdf#page=3`
```
TEMPLATE: {authors}. {title}.[[ {container}.]] Dostupno na: {url} (pristupljeno {accessed}).
QUOTE   : osmišljeno ispitivanje, i prijedlog teme rada. Literatura se navodi Vancouverskim stilom,   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor ne obraduje mrezne izvore; oblik i datum pristupa izvedeni su iz Vancouver konvencije za elektronicke izvore s hrvatskom lokalizacijom (Dostupno na, pristupljeno). Izvor ga ne egzemplificira, potvrditi pri verifikaciji.
```

## zavrsni  [str. 3] (derived)
Otvori PDF: `data/sources/fbf/fbf-upute-spec-2014.pdf#page=3`
```
TEMPLATE: {authors}. {title} (diplomski rad).[[ {place}:]] {institution}, {year}.
QUOTE   : osmišljeno ispitivanje, i prijedlog teme rada. Literatura se navodi Vancouverskim stilom,   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor ne obraduje citiranje zavrsnih, diplomskih ni specijalistickih radova kao izvora; oblik je izveden iz izvedenog oblika za knjigu (ustanova umjesto izdavaca) po Vancouver konvenciji za teze. Oznaka vrste rada (diplomski, specijalisticki, doktorski) prilagodava se stvarnom radu. Potvrditi pri verifikaciji.
```

## propis  [str. 3] (derived)
Otvori PDF: `data/sources/fbf/fbf-upute-spec-2014.pdf#page=3`
```
TEMPLATE: {title}. {container}[[ {issue}]].
QUOTE   : osmišljeno ispitivanje, i prijedlog teme rada. Literatura se navodi Vancouverskim stilom,   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor ne obraduje propise ni pravne akte kao izvore; oblik (naslov, sluzbeno glasilo, broj) izveden je iz opce hrvatske prakse u Vancouver okruzenju, ne iz izvora. Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Prior ['vancouver'] je POTVRDJEN: izvor izrijekom imenuje Vancouverski stil na str. 2 i str. 3, nema proturjecja.
- Samo clanak u casopisu i poglavlje u urednickoj knjizi imaju worked-example (str. 3, 'Primjeri navoenja najcese rabljenih literaturnih izvora'); knjiga, mrezni, zavrsni i propis su DERIVED i izvor ih ne egzemplificira. Svaki derived predlozak zasebno potvrditi.
- Pravilo o autorima (str. 3): do sest autora navode se svi, sedam i vise navode se prva tri i 'i sur.' (etAlAfter 6, etAlKeep 3); etAlJoiner ', ' je pretpostavljen po Vancouver konvenciji jer izvor nema primjer sa sedam i vise autora.
- Ekstrakcija je u primjeru clanka izgubila razmake ('V.Comparing', 'differences:How', pdftotext artefakt); expected je rekonstruiran s razmacima prema primjeru poglavlja. 'O Donnell' je vjerojatno O'Donnell (izgubljen apostrof).
- Primjer poglavlja nema mjesto izdanja ('Wiley-VCH Verlag GmbH and Co KgaA, 2009;229-44.'), sto odstupa od tipicnog Vancouvera (Mjesto: Izdavac; godina); predlosci slijede primjer iz izvora.
- Izvor je Uputa za zavrsni SPECIJALISTICKI rad (poslijediplomski, 2014); za druge razine studija FBF-a stil nije ovim izvorom dokazan.
- Popis literature ogranicen na najvise 30 navoda sto novijeg datuma (str. 3); to je pravilo opsega, ne formata, generator ga ne provodi.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `f9442b886142...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs fbf "Daniel Risavi"`.
