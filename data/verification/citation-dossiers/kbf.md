# Citatni spec: kbf (outcome: custom-spec, status: verified)

Stil: **Fusnotni stil Bogoslovske smotre (sluzbene upute KBF)** (token `kbf-fusnote`)
Izvor: Upute za izradu zavrsnoga i diplomskoga rada (Katolicki bogoslovni fakultet Sveucilista u Zagrebu) (`kbf-upute-zavrsni-diplomski-2017`)
Snapshot: `data/sources/kbf/kbf-upute-zavrsni-diplomski-2017.pdf` (hash `be1213970cdb...`)

## knjiga  [str. 9] (worked-example)
Otvori PDF: `data/sources/kbf/kbf-upute-zavrsni-diplomski-2017.pdf#page=9`
```
TEMPLATE: {authors}, {title}, {place}, {year}.
QUOTE   : Zeljko MARDESI, Rascjep u svetome, Zagreb, 2007.   [grep: OK]
IZVOR   : Zeljko MARDESI, Rascjep u svetome, Zagreb, 2007.
RENDER  : Zeljko MARDESI, Rascjep u svetome, Zagreb, 2007.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Prvo navodenje u biljesci: Ime PREZIME (prezime verzalom), naslov, mjesto, godina; IZDAVAC SE NE NAVODI. Drugi primjer: 'Theodor SCHNITZLER, O znacenju sakramenata, Zagreb, 1998.' Vise autora: 'Angelo SCOLA � Gilfredo MARENGO � Javier P. L�PEZ, Covjek kao osoba. Teoloska antropologija, Zagreb, 2003.' (str. 9); znak izmedu autora ostecen u ekstrakciji. Prezime se unosi velikim slovima u polju autora jer authorFormat nema opciju verzala.
```

## poglavlje  [str. 9] (derived)
Otvori PDF: `data/sources/kbf/kbf-upute-zavrsni-diplomski-2017.pdf#page=9`
```
TEMPLATE: {authors}, {title}, u: {editor} (ur.), {container}, {place}, {year}.
QUOTE   : Knjige i zbornici radova:   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor ima kategoriju 'Knjige i zbornici radova', ali primjer za rad u zborniku nije uhvacen ekstrakcijom. Predlozak izveden iz oblika za knjigu (bez izdavaca) uz konektor 'u:' potvrdjen novinskim i elektronickim primjerima (str. 10); oznaka (ur.) je izvedena, nije potvrdjena. Potvrditi ili oboriti pri verifikaciji.
```

## clanak  [str. 10] (worked-example)
Otvori PDF: `data/sources/kbf/kbf-upute-zavrsni-diplomski-2017.pdf#page=10`
```
TEMPLATE: {authors}, {title}, u: {container}, {year}.
QUOTE   : Christoph SCH�NBORN, Finding design in nature, u: The New York Times, 7.   [grep: OK]
IZVOR   : Christoph SCH�NBORN, Finding design in nature, u: The New York Times, 7. VII. 2005.
RENDER  : Christoph SCH�NBORN, Finding design in nature, u: The New York Times, 7. VII. 2005.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer je novinski clanak, prelomljen u izvoru: '... The New York Times, 7. VII. 2005.' Puni datum ide u polje year (bez zavrsne tocke, dodaje je predlozak). Oblik za clanak u znanstvenom casopisu (godiste, broj, raspon stranica) NIJE uhvacen ekstrakcijom; pri verifikaciji dopuniti iz uputa Bogoslovske smotre.
```

## mrezni  [str. 10] (worked-example)
Otvori PDF: `data/sources/kbf/kbf-upute-zavrsni-diplomski-2017.pdf#page=10`
```
TEMPLATE: {authors}, {title}[[ ({year})]], u: {url} ({accessed}).
QUOTE   : Walter KASPER, Informazioni, riflessioni e valutazioni del momento   [grep: OK]
IZVOR   : Walter KASPER, Informazioni, riflessioni e valutazioni del momento attuale del dialogo ecumenico (23. XI. 2007.), u: http://www.vatican.va/roman_curia/pontifical_councils/chrstuni/card-kasper-docs/rc_pc_chrstuni_doc_20071123_dialogo-ecumenico_it.html (15. I. 2008.).
RENDER  : Walter KASPER, Informazioni, riflessioni e valutazioni del momento attuale del dialogo ecumenico (23. XI. 2007.), u: http://www.vatican.va/roman_curia/pontifical_councils/chrstuni/card-kasper-docs/rc_pc_chrstuni_doc_20071123_dialogo-ecumenico_it.html (15. I. 2008.).
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Pravilo iz izvora: 'Dokumenti i materijali u elektronickom obliku (u zagradama treba navesti datum nastanka [iza naslova] i datum vienja dokumenta [na kraju])' (str. 10). Datum nastanka ide u polje year (npr. '23. XI. 2007.'), datum vidjenja u accessed (npr. '15. I. 2008.'). Primjer je u izvoru prelomljen kroz cetiri retka; URL spojen preko prijeloma.
```

## zavrsni  [str. 9] (derived)
Otvori PDF: `data/sources/kbf/kbf-upute-zavrsni-diplomski-2017.pdf#page=9`
```
TEMPLATE: {authors}, {title}, {institution}, {place}, {year}.
QUOTE   : Zeljko MARDESI, Rascjep u svetome, Zagreb, 2007.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute NE obraduju citiranje zavrsnih/diplomskih radova; predlozak izveden iz oblika za knjigu (koji nema izdavaca) uz dodanu ustanovu prije mjesta. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 8] (derived)
Otvori PDF: `data/sources/kbf/kbf-upute-zavrsni-diplomski-2017.pdf#page=8`
```
TEMPLATE: {title}, u: {container}[[, br. {issue}]][[, {year}]].
QUOTE   : Prilikom navoenje literature potrebno je dosljedno se pridrzavati pravila o navoenju   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Ni ekstrakcija ni vidljivi dio uputa Bogoslovske smotre ne donose primjer za pravne propise ni crkvene dokumente; minimalni predlozak izveden iz reda za clanak bez autora (naslov, u: publikacija, broj, godina). Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- PRIOR iz profila je chicago-notes, a izvor ne imenuje Chicago: propisuje pravila casopisa Bogoslovska smotra (vlastiti fusnotni stil s primjerima), pa custom-spec zamjenjuje prior; smjer (fusnote) je isti, stil nije Chicago.
- Radovi iz podrucja povijesti moraju slijediti upute casopisa Croatica christiana periodica (str. 8); te upute nisu donesene u ekstrakciji i NISU pokrivene ovim nacrtom.
- Separator izmedu vise autora je u ekstrakciji ostecen znak (' � ', vjerojatno crtica); ostavljen doslovno, utvrditi stvarni glif iz PDF-a pri verifikaciji.
- Primjeri su oblik PRVOG navodenja u biljesci (Ime PREZIME); popis Literatura je numeriran i abecedan po prezimenu autora (str. 6), ali oblik retka u popisu nije prikazan u ekstrakciji, potvrditi pri verifikaciji sortira li se i preslaguje li se ime.
- Prezime se u izvoru pise verzalom (velikim slovima); authorFormat nema opciju verzala pa se prezime unosi velikim slovima u polju autora.
- Ponovljeno navodenje ('2. Pri ponovnome navoenju nekoga djela...', str. 10) postoji u izvoru ali je sadrzaj odrezan u ekstrakciji; izvan dosega generatora.
- Oblik za clanak u znanstvenom casopisu (godiste, broj, stranice) nije uhvacen ekstrakcijom; clanak je izgraden iz novinskog primjera s punim datumom u polju year.
- Kurziv naslova nije vidljiv u tekstualnoj ekstrakciji; alat radi plain text.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `be1213970cdb...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs kbf "Daniel Risavi"`.
