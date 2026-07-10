# Citatni spec: unizd-fusnote (outcome: custom-spec, status: draft)

Stil: **Europski sustav fusnota (sluzbene upute Odjela za turizam UNIZD)** (token `unizd-fusnote`)
Izvor: Upute za izradu zavrsnoga i diplomskog rada (Odjel za turizam i komunikacijske znanosti, Sveuciliste u Zadru) (`unizd-turizam-upute`)
Snapshot: `data/sources/unizd/unizd-turizam-upute.pdf` (hash `96d4895ec69f...`)

## knjiga  [str. 9] (worked-example)
Otvori PDF: `data/sources/unizd/unizd-turizam-upute.pdf#page=9`
```
TEMPLATE: {authors}. {title}.[[ {volume}.]] {place}: {publisher}, {year}.[[, str. {pages}.]]
QUOTE   : Zelenika, R. Metodologija i tehnologija izrade znanstvenog i strucnog djela. Rijeka: Ekonomski fakultet   [grep: OK]
IZVOR   : Zelenika, R. Metodologija i tehnologija izrade znanstvenog i strucnog djela. Rijeka: Ekonomski fakultet Sveucilista u Rijeci, 2000., str. 485.
RENDER  : Zelenika, R. Metodologija i tehnologija izrade znanstvenog i strucnog djela. Rijeka: Ekonomski fakultet Sveucilista u Rijeci, 2000., str. 485.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Jedini gotovi primjer u izvoru (fusnota br. 1); fusnotni oblik ukljucuje broj stranice (str. 485). Za popis literature stranica se izostavlja pa je {pages} opcionalan. Format-spec knjige (str. 9): 'Prezime, inicijal(i) imena autora. Naslov: podnaslov. Podatak o izdanju. Mjesto izdavanja: Nakladnik, godina izdavanja.' Broj izdanja ide u {volume} (opcionalno).
```

## poglavlje  [str. 9] (derived)
Otvori PDF: `data/sources/unizd/unizd-turizam-upute.pdf#page=9`
```
TEMPLATE: {authors}. {title}. // {container}[[ / {editor}]].[[ {volume}.]] {place}: {publisher}, {year}. str. {pages}.
QUOTE   : Prezime, inicijal(i) imena autora. Naslov rada: podnaslov. // Naslov zbornika / podatak o   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Predlozak je doslovna transkripcija sluzbene format-specifikacije za RAD U ZBORNIKU/ESEJ (str. 9-10): '...Naslov rada: podnaslov. // Naslov zbornika / podatak o uredniku. Podatak o izdanju. Mjesto izdavanja: Nakladnik, godina izdavanja. str. pocetna-zavrsna.' Izvor NE daje gotovi primjer za ovaj tip; podatak o uredniku ({editor}) i broj izdanja ({volume}) su opcionalni.
```

## clanak  [str. 10] (derived)
Otvori PDF: `data/sources/unizd/unizd-turizam-upute.pdf#page=10`
```
TEMPLATE: {authors}. {title}. {container}.[[ {issue},]][[ {year},]] {pages}.
QUOTE   : Prezime, inicijali imena autora. Naslov i podnaslov clanka. Naslov novine. Broj pojedinacnog   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Jedini format-spec za clanak u izvoru je NOVINSKI CLANAK (str. 10): '...Naslov novine. Broj pojedinacnog izdanja novine, datum pojedinacnog izdanja novine, stranica.' {issue}=broj izdanja, {year} nosi datum pojedinacnog izdanja (nema zasebnog placeholdera za datum), {pages}=stranica (izvor nema prefiks 'str.'). Izvor NE daje zaseban format za clanak u znanstvenom casopisu (samo ga navodi u redoslijedu popisa literature); potvrditi pri verifikaciji.
```

## mrezni  [str. 10] (derived)
Otvori PDF: `data/sources/unizd/unizd-turizam-upute.pdf#page=10`
```
TEMPLATE: {authors}, {title}[[, {year}]][[, {container}]], {url}, {accessed}.
QUOTE   : Ime(na) autora (ako je/su poznata), naslov dokumenta, datum nastanka (ako se razlikuje od   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Format-spec JEDINICE S INTERNETA (str. 10), elementi odvojeni zarezom: 'Ime(na) autora, naslov dokumenta, datum nastanka (ako se razlikuje od datuma pristupa), naslov potpunog djela (italic), naziv stranice, potpuna http adresa, i datum pristupa dokumentu.' {year}=datum nastanka (opcionalno), {container}=naslov potpunog djela. Nema zasebnog placeholdera za 'naziv stranice' (izostavljeno); kurziv naslova nije reproduciran (plain text). Izvor bez gotovog primjera.
```

## zavrsni  [str. 9] (derived)
Otvori PDF: `data/sources/unizd/unizd-turizam-upute.pdf#page=9`
```
TEMPLATE: {authors}. {title}. {place}: {institution}, {year}.
QUOTE   : Prezime, inicijal(i) imena autora. Naslov: podnaslov. Podatak o izdanju. Mjesto izdavanja:   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor ne obraduje citiranje zavrsnih/diplomskih radova kao izvora; predlozak je izveden iz format-spec za knjigu (nakladnik -> ustanova). Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 8] (derived)
Otvori PDF: `data/sources/unizd/unizd-turizam-upute.pdf#page=8`
```
TEMPLATE: {title}, {container}[[, br. {issue}]].
QUOTE   : knjige, potom clanci u znanstvenim casopisima, clanci u zbornicima sa znanstvenih skupova   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor navodi propise (Narodne novine) samo kao kategoriju u redoslijedu popisa literature ('ostala literatura, npr. Narodne novine'), bez format-spec. Predlozak je izveden iz opce hrvatske konvencije za citiranje Narodnih novina (naslov, glasilo, broj). Potvrditi pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Izvor ima samo JEDAN gotovi primjer (Zelenika, knjiga, u fusnotnom obliku sa str. 485); poglavlje, clanak i mrezni su transkribirani iz eksplicitnih format-spec redaka bez ispunjenog primjera (kind derived), a zavrsni i propis nemaju format u izvoru (izvedeni).
- Visestruki autori: separator i razmak inicijala nisu izravno dokazani (izvor daje samo primjere s jednim autorom); separator postavljen na ', ' kao najizglednija pretpostavka, provjeriti.
- Tip 'clanak' koristi format za NOVINSKI CLANAK (jedini format clanka u izvoru); za clanke u znanstvenim casopisima izvor ne daje zaseban format, samo ih navodi u redoslijedu popisa literature.
- Novinski datum pojedinacnog izdanja preslikan je na {year} (nema zasebnog placeholdera za datum); internetska 'naziv stranice' nema placeholder pa je izostavljena.
- Predlozak za propis izveden je iz opce konvencije za Narodne novine jer izvor ne daje format (samo kategorija u popisu literature).
- Kurziv naslova (npr. 'naslov potpunog djela (italic)' za internet) alat ne reproducira; izlaz je plain text.
- Ovo su upute Odjela za turizam i komunikacijske znanosti; vrijede za taj odjel, ne nuzno za cijelo Sveuciliste u Zadru. Izvor nudi i alternativni americki/Harvardski sustav (zaseban style-pin draft).

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs unizd-fusnote "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
