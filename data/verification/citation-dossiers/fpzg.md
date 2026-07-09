# Citatni spec: fpzg (outcome: custom-spec, status: draft)

Stil: **FPZG autor-godina (sluzbena Pravila navodenja)** (token `fpzg`)
Izvor: Pravila navodenja bibliografskih jedinica i citatnica na Fakultetu politickih znanosti (`fpzg-pravila-navodenja-citiranja`)
Snapshot: `data/sources/fpzg/fpzg-pravila-navodenja-citiranja-2026.pdf` (hash `56df35ca9ab1...`)

## knjiga  [str. 1] (worked-example)
Otvori PDF: `data/sources/fpzg/fpzg-pravila-navodenja-citiranja-2026.pdf#page=1`
```
TEMPLATE: {authors} ({year}) {title}. {place}: {publisher}.
QUOTE   : Buchberger, Iva (2012) Kriticko misljenje. Prirucnik kritickog misljenja, slusanja, citanja i pisanja.   [grep: OK]
IZVOR   : Buchberger, Iva (2012) Kriticko misljenje. Prirucnik kritickog misljenja, slusanja, citanja i pisanja. Rijeka: Udruga za razvoj visokog skolstva Universitas.
RENDER  : Buchberger, Iva (2012) Kriticko misljenje. Prirucnik kritickog misljenja, slusanja, citanja i pisanja. Rijeka: Udruga za razvoj visokog skolstva Universitas.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Puna imena (ne inicijali); bez tocke iza (godina); naslov kurzivom u izvorniku (alat radi plain text).
```

## poglavlje  [str. 1] (worked-example)
Otvori PDF: `data/sources/fpzg/fpzg-pravila-navodenja-citiranja-2026.pdf#page=1`
```
TEMPLATE: {authors} ({year}) {title}. U: {editor} (ur) {container}[[ (str. {pages})]]. {place}: {publisher}.
QUOTE   : poglavlje s 1 autorom /icom u zborniku s 1 urednikom/icom:   [grep: OK]
IZVOR   : Petak, Zdravko (2001) Proracunska politika Sabora. U: Kasapovi, Mirjana (ur) Hrvatska politika 1990.-2000. (str. 101-131). Zagreb: Fakultet politickih znanosti.
RENDER  : Petak, Zdravko (2001) Proracunska politika Sabora. U: Kasapovi, Mirjana (ur) Hrvatska politika 1990.-2000. (str. 101-131). Zagreb: Fakultet politickih znanosti.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer: Petak, Zdravko (2001) Proracunska politika Sabora. U: Kasapovi, Mirjana (ur) Hrvatska politika 1990.-2000. (str. 101-131). Zagreb: Fakultet politickih znanosti. Skracenica (ur) BEZ tocke. Urednik se upisuje u obliku Prezime, Ime.
```

## clanak  [str. 2] (worked-example)
Otvori PDF: `data/sources/fpzg/fpzg-pravila-navodenja-citiranja-2026.pdf#page=2`
```
TEMPLATE: {authors} ({year}) {title}. {container} {volume}[[({issue})]][[: {pages}]].[[ {url} Pristupljeno {accessed}.]]
QUOTE   : clanak u casopisu:   [grep: OK]
IZVOR   : Prpi, Ivan (2001) Napomena o shvaanju suverena u Ustavu Republike Hrvatske. Politicka misao 38(1): 5-11.
RENDER  : Prpi, Ivan (2001) Napomena o shvaanju suverena u Ustavu Republike Hrvatske. Politicka misao 38(1): 5-11.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer: Prpi, Ivan (2001) Napomena o shvaanju suverena u Ustavu Republike Hrvatske. Politicka misao 38(1): 5-11. Casopis BEZ zareza prije godista; dvotocka prije stranica. Online clanci dodaju URL + Pristupljeno datum (str. 2).
```

## mrezni  [str. 3] (worked-example)
Otvori PDF: `data/sources/fpzg/fpzg-pravila-navodenja-citiranja-2026.pdf#page=3`
```
TEMPLATE: {authors} ({year}) {title}. {url} Pristupljeno {accessed}.
QUOTE   : individualni autori/ce:   [grep: OK]
IZVOR   : Kgz.hr (2013) Knjiznice Grada Zagreba. http://www.kgz.hr/ Pristupljeno 5. veljace 2013.
RENDER  : Kgz.hr (2013) Knjiznice Grada Zagreba. http://www.kgz.hr/ Pristupljeno 5. veljace 2013.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer: Aastrup, Jesper (2005) Change in Networks... http://www.impgroup.org/uploads/papers/27.pdf. Pristupljeno 30. rujna 2010. Korporativni autori: KRATICA (Puni naziv) (godina) - unosi se doslovno u polje autora, org-detekcija cuva doslovni oblik.
```

## zavrsni  [str. 5] (worked-example)
Otvori PDF: `data/sources/fpzg/fpzg-pravila-navodenja-citiranja-2026.pdf#page=5`
```
TEMPLATE: {authors} ({year}) {title} (neobjavljen diplomski rad). {place}: {institution}.
QUOTE   : diplomski i magistarski radovi:   [grep: OK]
IZVOR   : Zguri, Borna (2009) Diplomacija nedrzavnih aktera: studija slucaja Carter Centra (neobjavljen diplomski rad). Zagreb: Fakultet politickih znanosti.
RENDER  : Zguri, Borna (2009) Diplomacija nedrzavnih aktera: studija slucaja Carter Centra (neobjavljen diplomski rad). Zagreb: Fakultet politickih znanosti.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer: Zguri, Borna (2009) Diplomacija nedrzavnih aktera: studija slucaja Carter Centra (neobjavljen diplomski rad). Zagreb: Fakultet politickih znanosti. Za disertacije izvor koristi '(neobjavljena doktorska disertacija)'; alat koristi diplomsku varijantu kao default.
```

## propis  [str. 3] (worked-example)
Otvori PDF: `data/sources/fpzg/fpzg-pravila-navodenja-citiranja-2026.pdf#page=3`
```
TEMPLATE: {authors} ({year}) {title}. {container}[[ {issue}]].[[ {url} Pristupljeno {accessed}.]]
QUOTE   : iz sluzbenog glasila:   [grep: OK]
IZVOR   : Hrvatski sabor (2011) Zakon o Vladi Republike Hrvatske. Narodne novine 150.
RENDER  : Hrvatski sabor (2011) Zakon o Vladi Republike Hrvatske. Narodne novine 150.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer: Hrvatski sabor (2011) Zakon o Vladi Republike Hrvatske. Narodne novine 150. FPZG navodi i DONOSITELJA kao autora pravnog akta (Hrvatski sabor); broj glasila bez 'br.'.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: ({authorsShort}, {year}: {pages})
RENDER   : (Lovric, 1988)   /  (Lovric, 1988: 45)
QUOTE    : article.1 Chicago i London: The University of Chicago Press.  (Becker, 2007)   [grep: OK]
NAPOMENA : Citatnica iza strelice u svakom primjeru; 2 autora '(Ani i Sili, 2001)', 3+ '(Babi i dr, 2008)' (i dr bez tocke prije zareza, pravilo ekonomicnosti, fusnota 2 u izvoru). withPagesTemplate ({authorsShort}, {year}: {pages}) je IZVEDEN iz sekcije Citatnice u fpzg-upute-akademski-radovi (str. 21), potvrditi pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- withPagesTemplate za citatnicu sa stranicama je izveden (nije u ekstrakciji Pravila navodenja); potvrditi protiv sekcije Citatnice u fpzg-upute-akademski-radovi (sadrzaj pokazuje str. 21).
- Kurziv naslova (knjige, casopisi, novine; fusnota 8 u izvoru) alat ne reproducira - plain text izlaz; navesti kao napomenu na stranici alata.

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs fpzg "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
