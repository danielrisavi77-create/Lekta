# Citatni spec: pbf (outcome: custom-spec, status: verified)

Stil: **PBF harvardski sustav (službene upute za diplomski rad)** (token `pbf`)
Izvor: Upute za izradu diplomskog rada (Prehrambeno-biotehnološki fakultet Sveučilišta u Zagrebu) (`pbf-upute-diplomski-2018`)
Snapshot: `data/sources/pbf/pbf-upute-diplomski-2018.pdf` (hash `86cfde9d825c...`)

## knjiga  [str. 7] (worked-example)
Otvori PDF: `data/sources/pbf/pbf-upute-diplomski-2018.pdf#page=7`
```
TEMPLATE: {authors} ({year}) {title},[[ {volume}. izd.,]] {publisher}, {place}.
QUOTE   : Timbrell, J. A. (1995) Introduction to toxicology, 2. izd., Taylor & Francis, London.   [grep: OK]
IZVOR   : Timbrell, J. A. (1995) Introduction to toxicology, 2. izd., Taylor & Francis, London.
RENDER  : Timbrell, J. A. (1995) Introduction to toxicology, 2. izd., Taylor & Francis, London.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer za knjigu (sekcija 5.7). Broj izdanja ide u polje volume (2 -> '2. izd.,'). Isti oblik bez izdanja potvrdjuje referenca na str. 2: 'Kniewald, J. (1993) Metodika znanstvenog rada, Multigraf, Zagreb.'
```

## poglavlje  [str. 7] (derived)
Otvori PDF: `data/sources/pbf/pbf-upute-diplomski-2018.pdf#page=7`
```
TEMPLATE: {authors} ({year}) {title}. U:[[ {editor} (ur.)]] {container},[[ {volume}. izd.,]] {publisher}, {place}[[, str. {pages}]].
QUOTE   : Primjer za stranicu u knjizi:   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor IMA primjer za stranicu u knjizi (najavljen na str. 7), ali je izgubljen prelomom stranice u ekstrakciji (isjecak str. 8 pocinje usred teksta 'metoda).'). Predlozak izveden iz oblika za knjigu i clanak: tocka iza naslova rada kao kod clanka, zarezi izmedju izdavaca i mjesta kao kod knjige; oznaka 'U:', polozaj urednika '(ur.)' i 'str.' ispred raspona su pretpostavke. Obavezno usporediti s primjerom u PDF-u pri verifikaciji.
```

## clanak  [str. 7] (worked-example)
Otvori PDF: `data/sources/pbf/pbf-upute-diplomski-2018.pdf#page=7`
```
TEMPLATE: {authors} ({year}) {title}. {container} {volume}, {pages}.[[ doi:{doi}]]
QUOTE   : Renner, G., Pongratz, K., Braunegg, G. (1996) Production of poly(3-hydroxybutyrate-co-4-   [grep: OK]
IZVOR   : Renner, G., Pongratz, K., Braunegg, G. (1996) Production of poly(3-hydroxybutyrate-co-4-hydroxybutyrate) by Comamonas testosteronii A3. Food Technol. Biotechnol. 34, 91-95.
RENDER  : Renner, G., Pongratz, K., Braunegg, G. (1996) Production of poly(3-hydroxybutyrate-co-4-hydroxybutyrate) by Comamonas testosteronii A3. Food Technol. Biotechnol. 34, 91-95.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer za rad u periodickom casopisu: 'Renner, G., Pongratz, K., Braunegg, G. (1996) Production of ... Food Technol. Biotechnol. 34, 91-95.' Naziv casopisa u SKRACENOM obliku po WoS Journal Title Abbreviations (korisnik unosi skraceni naziv, alat ne skracuje). Volumen bez godista u zagradi, zarez pa stranice. Doi varijanta iz primjera Guler (str. 8): '... Int. J. Food Sci. Technol.42, 235-245. doi:10.1111/j.1365-2621.2006.01505.x'.
```

## mrezni  [str. 8] (worked-example)
Otvori PDF: `data/sources/pbf/pbf-upute-diplomski-2018.pdf#page=8`
```
TEMPLATE: {authors} ({year}) {title}[[. {container}]], <{url}>. Pristupljeno {accessed}.
QUOTE   : Anonymous (2002) Sirovine i sastojci energetskih pločica, <http://www.vitamini.hr>.   [grep: OK]
IZVOR   : Anonymous (2002) Sirovine i sastojci energetskih plocica, <http://www.vitamini.hr>. Pristupljeno 11 prosinca 2007.
RENDER  : Anonymous (2002) Sirovine i sastojci energetskih plocica, <http://www.vitamini.hr>. Pristupljeno 11 prosinca 2007.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer web stranice nepoznatog autora; URL u siljastim zagradama, iza 'Pristupljeno' datum. Izvorni primjer ima '11 prosinca' bez tocke iza broja (tipfeler u izvoru), zadrzano doslovno u expected. Varijanta s organizacijom (IFIS, str. 8) dodaje naziv organizacije iza naslova s tockom, pokriveno opcionalnim {container}. Nepoznat autor se navodi kao Anonymous.
```

## zavrsni  [str. 6] (derived)
Otvori PDF: `data/sources/pbf/pbf-upute-diplomski-2018.pdf#page=6`
```
TEMPLATE: {authors} ({year}) {title}, diplomski rad, {institution}[[, {place}]].
QUOTE   : Literaturni navodi u poglavlju Literatura pišu se prema pravilu za pisanje referenci na kraju rada kao   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju citiranje zavrsnih/diplomskih radova kao bibliografske jedinice; predlozak izveden iz oblika za knjigu (izdavac zamijenjen ustanovom, dodana oznaka vrste rada 'diplomski rad' po analogiji s '2. izd.' umetkom). Za detalje izvor upucuje na Kniewald (1993) Metodika znanstvenog rada. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 7] (derived)
Otvori PDF: `data/sources/pbf/pbf-upute-diplomski-2018.pdf#page=7`
```
TEMPLATE: {title} ({year}) {container}[[ {issue}]].
QUOTE   : npr. Pravilnika objavljenih u službenom glasilu u istoj godini (Pravilnik, 2004a; Pravilnik 2004b). Kod   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor propisuje samo citatnicu propisa u tekstu (Pravilnik, 2004a), bez primjera bibliografske jedinice. Predlozak izveden iz worked-examplea za djelo u izdanju institucije (str. 8): 'Guidelines for the preparation of bibliographies (1983) United States Department of Agriculture, Washington.' - naslov (godina) izvor, uz broj glasila u issue. Potvrditi ili oboriti pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: (nema)
RENDER   : (Lovric, 1988)   /  (Lovric, 1988)
QUOTE    : 1998); ako su dva autora na radu: samo prezimena oba autora i godina, npr. (Taylor i Walker, 1996); a   [grep: OK]
NAPOMENA : Sekcija 5.7: 1 autor '(Walker, 1998)', 2 autora '(Taylor i Walker, 1996)', 3+ prvi autor + 'i sur.' '(Lansen i sur., 1997)'. Vise radova iste godine dobiva slovne oznake (Walker, 1998a; Walker, 1998b) sto motor ne generira. Norme se citiraju brojem norme s godinom (ISO 520, 1997), nepoznat autor weba kao Anonymous i godina; izvor ne opisuje citatnicu s brojem stranice pa withPagesTemplate nije postavljen.
```

## Kontradikcije / otvorena pitanja
- Izvor uz harvardski sustav izricito dopusta i alternativni numericki sustav: 'Osim harvardskog sustava moze se primijeniti i tzv. numericki sustav citiranja gdje referenca dobiva' broj prema redoslijedu pojavljivanja, u tekstu broj u zagradi, npr. (5) (str. 8). Spec pokriva samo harvardski sustav jer numericki u izvoru nema vlastite primjere oblikovanja referenci; prior 'harvard' time je potvrdjen kao primarni.
- Worked-example za poglavlje (stranicu u knjizi) u izvoru postoji, ali je u ekstrakciji izgubljen prelomom stranice 7 na 8; poglavlje je derived i trazi provjeru u PDF snapshotu.
- Zavrsni rad i propis nisu obradjeni kao bibliografske jedinice u uputama; oba su derived (propis iz primjera djela u izdanju institucije).
- Nazive casopisa treba pisati skraceno po WoS Journal Title Abbreviations (str. 7); alat ne skracuje automatski, korisnik mora unijeti skraceni naziv.
- Clanak u elektronickom casopisu ima u izvoru dvije varijante (str. 8): '[online]' s URL-om i 'Pristupljeno' datumom, ili doi na kraju; template pokriva doi varijantu, [online] varijanta nije izrazena.
- Vise radova istog autora u istoj godini oznacava se slovima uz godinu (1998a, 1998b), a vise Anonymous citata rednim brojem (Anonymous 3, 2008); to je izvan dosega generatora, provjerava se ljudski.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `86cfde9d825c...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs pbf "Daniel Risavi"`.
