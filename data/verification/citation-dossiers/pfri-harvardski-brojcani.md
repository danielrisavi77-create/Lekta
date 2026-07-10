# Citatni spec: pfri-harvardski-brojcani (outcome: custom-spec, status: verified)

Stil: **Harvardski brojcani sustav (sluzbene upute PFRI)** (token `harvardski-brojcani`)
Izvor: Upute za izradu zavrsnog rada (Sveuciliste u Rijeci, Pomorski fakultet, ozujak 2025) (`pfri-upute-zavrsni-2025`)
Snapshot: `data/sources/pfri/pfri-upute-zavrsni-2025.pdf` (hash `2b6ab8d65a52...`)

## knjiga  [str. 21] (worked-example)
Otvori PDF: `data/sources/pfri/pfri-upute-zavrsni-2025.pdf#page=21`
```
TEMPLATE: {authors} {year}, {title}[[, {volume}]], {publisher}, {place}.
QUOTE   : [4] Zelenika, R. 2000, Metodologija i tehnologija izrade znanstvenog i strucnog djela, 4.   [grep: OK]
IZVOR   : Zelenika, R. 2000, Metodologija i tehnologija izrade znanstvenog i strucnog djela, 4. izmijenjeno i dopunjeno izdanje, Ekonomski fakultet Sveucilista u Rijeci, Rijeka.
RENDER  : Zelenika, R. 2000, Metodologija i tehnologija izrade znanstvenog i strucnog djela, 4. izmijenjeno i dopunjeno izdanje, Ekonomski fakultet Sveucilista u Rijeci, Rijeka.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Popis literature numerira se arapskim brojevima u uglatim zagradama prema redoslijedu pojavljivanja u tekstu (str. 20); redni broj [n] je oznaka mjesta u popisu (referenceMarker), ne dio jedinice. Primjer [4] je u ekstrakciji prelomljen u dva retka, spojen u expected. Broj izdanja unosi se cijeli u polje volume ('4. izmijenjeno i dopunjeno izdanje'; kod [5] McTaggart '2nd ed'). Naslov je u izvorniku kurzivom, alat radi plain text. Korporativni autor se pise punim imenom (primjer [2] Australian Government Publishing Service, str. 20).
```

## clanak  [str. 22] (worked-example)
Otvori PDF: `data/sources/pfri/pfri-upute-zavrsni-2025.pdf#page=22`
```
TEMPLATE: {authors} {year}, '{title}', {container}[[, {publisher}]][[, vol. {volume}]][[, no. {issue}]][[, p. {pages}]][[, online: {url} ({accessed})]].
QUOTE   : - Huffman, L. M. 1996, 'Processing whey protein for use as a food ingredient', Food   [grep: OK]
IZVOR   : Huffman, L. M. 1996, 'Processing whey protein for use as a food ingredient', Food Technology, Food Institute, vol. 50, no. 2, p. 49-52.
RENDER  : Huffman, L. M. 1996, 'Processing whey protein for use as a food ingredient', Food Technology, Food Institute, vol. 50, no. 2, p. 49-52.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Redoslijed elemenata po popisu na str. 22: prezime autora i inicijal imena, godina izdanja, naslov clanka u jednostrukim navodnicima, naziv casopisa (kurziv), izdavac casopisa, broj casopisa, stranice. Primjer [1] na str. 20 je isti clanak bez izdavaca pa je {publisher} opcionalan. Clanak s interneta (Daniel, str. 22) dodaje 'online: URL (datum)' na kraju. Primjer je u ekstrakciji prelomljen, spojen u expected. Novinski clanak (Simpson, str. 22) i zbornik radova (Bohrer, str. 21 i 22) slijede isti obrazac s publikacijom kao containerom.
```

## poglavlje  [str. 22] (worked-example)
Otvori PDF: `data/sources/pfri/pfri-upute-zavrsni-2025.pdf#page=22`
```
TEMPLATE: {authors} {year}, {title} in {container}, ed. {editor}, {publisher}, {place}.
QUOTE   : - Bernstein, D. 1995, Transportation planning in The Civil Engineering Handbook, ed.   [grep: OK]
IZVOR   : Bernstein, D. 1995, Transportation planning in The Civil Engineering Handbook, ed. W.F.Chen, CRC Press, Boca Raton.
RENDER  : Bernstein, D. 1995, Transportation planning in The Civil Engineering Handbook, ed. W.F.Chen, CRC Press, Boca Raton.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Jedini primjer poglavlja u knjizi (str. 22); veznik 'in' i oznaka 'ed.' doslovno iz primjera (engleski uzorak iz AGPS prirucnika). Urednik se unosi doslovno (u primjeru 'W.F.Chen'). Stranice poglavlja primjer ne navodi. Primjer je u ekstrakciji prelomljen, spojen u expected. Naslov knjige je u izvorniku kurzivom, alat radi plain text.
```

## mrezni  [str. 23] (worked-example)
Otvori PDF: `data/sources/pfri/pfri-upute-zavrsni-2025.pdf#page=23`
```
TEMPLATE: [[{authors} ]]{title}, {year}, online: {url} ({accessed})
QUOTE   : - Proizvodnja kemikalija, kemijskih proizvoda i proizvoda od gume, 2007, online:   [grep: OK]
IZVOR   : Proizvodnja kemikalija, kemijskih proizvoda i proizvoda od gume, 2007, online: http://hgk.biznet.hr/hgk/ileovi/10677.pdf (24.3.2007.)
RENDER  : Proizvodnja kemikalija, kemijskih proizvoda i proizvoda od gume, 2007, online: http://hgk.biznet.hr/hgk/ileovi/10677.pdf (24.3.2007.)
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Worked example bez autora: naslov je prvi element citiranja kad autor nije naveden (str. 23). Mrezni izvor S autorom u izvoru slijedi opci red autor, godina, naslov (Daniel, str. 22), sto ovaj predlozak ne reproducira; potvrditi ili podijeliti pri verifikaciji. Jedinica u izvoru zavrsava bez tocke iza zagrade s datumom pristupa. Primjer je u ekstrakciji prelomljen, spojen u expected.
```

## zavrsni  [str. 21] (derived)
Otvori PDF: `data/sources/pfri/pfri-upute-zavrsni-2025.pdf#page=21`
```
TEMPLATE: {authors} {year}, {title}, {institution}, {place}.
QUOTE   : Prilikom koristenja vazno je postivati redoslijed unosenja podataka, paziti na velika i   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju citiranje zavrsnih/diplomskih radova; predlozak izveden iz oblika za knjigu ([4] Zelenika, str. 21) uz izdavaca zamijenjenog ustanovom. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 20] (derived)
Otvori PDF: `data/sources/pfri/pfri-upute-zavrsni-2025.pdf#page=20`
```
TEMPLATE: {title}, {year}, {container}[[, {issue}]].
QUOTE   : bibliografskih jedinica (knjiga, clanaka, pravilnika, rjecnika...).   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute spominju pravilnike kao dopustene bibliografske jedinice, ali ne daju format za propise; predlozak izveden iz pravila da je bez autora naslov prvi element citiranja i iz reda naslov-godina-izvor u primjeru The CCH Macquarie dictionary of business (str. 22). Broj sluzbenog glasila u {issue}. Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Prior profila je chicago-notes; izvor ne imenuje Chicago nego dopusta izbor izmedju Europskog i Harvardskog sustava (str. 19: 'Pri izradi zavrsnog rada moze se koristiti Europski sustav ili Harvardski sustav pozitivnih biljeski', uz obveznu dosljednost jednog nacina kroz cijeli rad). Ovaj spec pokriva Harvardski; Europski je u pfri-europski-fusnote.
- PFRI 'Harvardski sustav' nije klasicni autor-godina Harvard: u tekstu su brojcane uglate zagrade sa stranicom ([1. p. 9], str. 19), a popis literature se numerira po redoslijedu pojavljivanja (str. 20); jedinice su autor-godina oblika po australskom AGPS prirucniku (primjer [2] Style Manual for Authors, Editors and Printers, str. 20). Zato custom-spec, ne style-pin na harvard.
- Spojnica prije zadnjeg autora je u izvoru nekonzistentna: 'and' ([3] Bohrer, str. 21) i '&' ([5] McTaggart, str. 21; Bohrer ponovljen s '&' na str. 22); odabran ' & ' kao cesci, potvrditi pri verifikaciji.
- Naslovi knjiga i casopisa u izvorniku su kurzivom, naslov clanka u jednostrukim navodnicima (u ekstrakciji mjesavina ` i '); alat radi plain text s ravnim apostrofima.
- Online jedinice u izvoru zavrsavaju bez tocke iza zagrade s datumom pristupa (Daniel, str. 22; Proizvodnja kemikalija, str. 23); predlozak clanka dodaje zavrsnu tocku pa se online varijanta clanka razlikuje u zavrsnoj interpunkciji.
- Zavrsni radovi i propisi nisu obradeni u izvoru (derived); zbornik radova, novinski clanak i digitalni mediji (CD, video) izvor pokazuje kao zasebne kategorije koje alat pokriva predloscima clanka odnosno knjige.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `2b6ab8d65a52...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs pfri-harvardski-brojcani "Daniel Risavi"`.
