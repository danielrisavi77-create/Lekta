# Citatni spec: mev-vancouver (outcome: custom-spec, status: draft)

Stil: **Vancouver numericki (sluzbene upute MEV)** (token `vancouver`)
Izvor: Upute za izradu zavrsnog rada na Medimurskom veleucilistu u Cakovcu (`mev-upute-zavrsni`)
Snapshot: `data/sources/mev/mev.pdf` (hash `422c25447635...`)

## knjiga  [str. 7] (worked-example)
Otvori PDF: `data/sources/mev/mev.pdf#page=7`
```
TEMPLATE: {authors} ({year}). {title}.[[ {volume}. izd.]] {place}, {publisher}.
QUOTE   : Silobrci, V. (2003). Kako sastaviti, objaviti i ocijeniti znanstveno djelo. 5. izd. Zagreb,   [grep: OK]
IZVOR   : Silobrci, V. (2003). Kako sastaviti, objaviti i ocijeniti znanstveno djelo. 5. izd. Zagreb, Medicinska naklada.
RENDER  : Silobrci, V. (2003). Kako sastaviti, objaviti i ocijeniti znanstveno djelo. 5. izd. Zagreb, Medicinska naklada.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Cijeli Primjer 1 (spojeni redci): Silobrci, V. (2003). Kako sastaviti, objaviti i ocijeniti znanstveno djelo. 5. izd. Zagreb, Medicinska naklada. Redoslijed propisan popisom u Dodatku 1.D: prezime i inicijali, (godina), naslov i podnaslov, broj izdanja (ako nije prvo), mjesto izdavanja, ime izdavaca. Broj izdanja ide u polje volume (5 -> '5. izd.'). Mjesto i izdavac odvojeni su ZAREZOM, ne dvotockom. Dodatak 1.D je jedini oblik popisa u izvoru pa vrijedi i za VanCouverski odabir, uz redoslijed pojavljivanja umjesto abecede.
```

## poglavlje  [str. 7] (derived)
Otvori PDF: `data/sources/mev/mev.pdf#page=7`
```
TEMPLATE: {authors} ({year}). {title}. U: {editor} (ur.), {container}. {place}, {publisher}.[[ {pages}.]]
QUOTE   : Knjiga, odnosno monografija:   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Ekstrahirani dijelovi Dodatka 1.D pokrivaju knjigu, clanak u casopisu i internetske izvore; poglavlje u knjizi ili zborniku nije prikazano (Primjer 2 i 3 nedostaju u ekstrakciji). Predlozak je izveden iz oblika za knjigu uz umetak 'U: urednik (ur.), naslov knjige'. Potvrditi ili oboriti pri verifikaciji.
```

## clanak  [str. 8] (worked-example)
Otvori PDF: `data/sources/mev/mev.pdf#page=8`
```
TEMPLATE: {authors} ({year}). "{title}", {container}, vol. {volume}[[({issue})]], {pages}.
QUOTE   : Davies, E. (1997). ,,Learn by wire: managing network access to learning materials", The   [grep: OK]
IZVOR   : Davies, E. (1997). "Learn by wire: managing network access to learning materials", The electronic library, vol. 15(3), 658-693.
RENDER  : Davies, E. (1997). "Learn by wire: managing network access to learning materials", The electronic library, vol. 15(3), 658-693.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Cijeli Primjer 4 (spojeni redci): Davies, E. (1997). ,,Learn by wire: managing network access to learning materials", The electronic library, vol. 15(3), 658-693. Propisani redoslijed (str. 8): godina objave, naslov rada (navodnici!), naslov casopisa (kurziv!), broj sveska (volumena), broj pojedinacnog broja, raspon stranica. Hrvatski donji navodnik iz PDF-a (u ekstrakciji ,,) zamijenjen je ASCII navodnikom, kurziv casopisa alat ne reproducira.
```

## mrezni  [str. 8] (worked-example)
Otvori PDF: `data/sources/mev/mev.pdf#page=8`
```
TEMPLATE: [[{authors} ]]{title}. {url} ({accessed})
QUOTE   : Toki, M.; Proklin, M. Znacajke racunovodstvenoga informacijskog sustava poduzetnika.   [grep: OK]
IZVOR   : Toki, M.; Proklin, M. Znacajke racunovodstvenoga informacijskog sustava poduzetnika. http://hrcak.srce.hr/index.php?show=clanak&id_clanak_jezik=112975 (01.09.2012.)
RENDER  : Toki, M.; Proklin, M. Znacajke racunovodstvenoga informacijskog sustava poduzetnika. http://hrcak.srce.hr/index.php?show=clanak&id_clanak_jezik=112975 (01.09.2012.)
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Cijeli Primjer 5 (spojeni redci): Toki, M.; Proklin, M. Znacajke racunovodstvenoga informacijskog sustava poduzetnika. http://hrcak.srce.hr/index.php?show=clanak&id_clanak_jezik=112975 (01.09.2012.). Primjer 6 bez autora: IEEE- Advancing Technology for Humanity. http://www.ieee.org/index.html (05.09.2012.), pa je autor opcionalan ('ako je poznat'). Godina objave se ne navodi; datum preuzimanja s interneta u zagradi na kraju. Vise autora odvaja se tockom sa zarezom.
```

## zavrsni  [str. 7] (derived)
Otvori PDF: `data/sources/mev/mev.pdf#page=7`
```
TEMPLATE: {authors} ({year}). {title}. Zavrsni rad. {place}, {institution}.
QUOTE   : Dodatak 1.D Navoenje popisa literature   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju citiranje zavrsnih ili diplomskih radova. Predlozak je izveden iz oblika za knjigu: izdavac zamijenjen ustanovom, dodana oznaka vrste rada 'Zavrsni rad.'. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 7] (derived)
Otvori PDF: `data/sources/mev/mev.pdf#page=7`
```
TEMPLATE: {title} ({year}). {container}[[, {issue}]].
QUOTE   : Dodatak 1.D Navoenje popisa literature   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju citiranje propisa. Predlozak je minimalno izveden iz opceg reda natuknice Dodatka 1.D (nositelj natuknice, godina u zagradi, glasilo, broj), samo radi potpunosti alata. Potvrditi pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- PRIOR iz profila je 'vancouver' i izvor VanCouverski stil doista opisuje, ali izbor stila izricito prepusta studentu i mentoru ('Student u dogovoru sa svojim mentorom odabire koji e nacin citiranja koristiti', str. 7) i ravnopravno opisuje i Harvardski stil; oba su dokazana pa postoje dva nacrta (mev-harvard, mev-vancouver).
- Izvor VanCouverski stil opisuje samo oznakama u tekstu ([1], [2, 3]) i redoslijedom popisa; oblik natuknica preuzet je iz Dodatka 1.D koji je autor-godina formatiran (godina u zagradi iza autora), sto odstupa od klasicnog Vancouvera. Slijedjen je izvor; potvrditi pri verifikaciji.
- Naslov casopisa je u izvorniku kurzivom, a naslov clanka u hrvatskim navodnicima; alat radi plain text pa je kurziv izostavljen, navodnici zamijenjeni ASCII navodnicima.
- Primjer 2 i 3 iz Dodatka 1.D nedostaju u ekstrakciji (blok str. 8 pocinje usred popisa za casopis); poglavlje, zavrsni i propis su zato izvedeni (derived).
- Svi primjeri autora imaju jedan inicijal pa se razmak izmedu vise inicijala ne moze potvrditi; odabrano dotted-spaced, potvrditi pri verifikaciji.

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs mev-vancouver "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
