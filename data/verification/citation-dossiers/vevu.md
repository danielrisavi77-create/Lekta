# Citatni spec: vevu (outcome: custom-spec, status: verified)

Stil: **Autor-godina (službene upute VEVU za završni rad)** (token `vevu`)
Izvor: Upute za izradu završnog rada (VEVU) (`vevu-upute-zavrsni`)
Snapshot: `data/sources/vevu/vevu.pdf` (hash `66d1e460151a...`)

## knjiga  [str. 11] (derived)
Otvori PDF: `data/sources/vevu/vevu.pdf#page=11`
```
TEMPLATE: {authors} ({year}) {title}. {place}: {publisher}.
QUOTE   : Prezime, inicijal(i) autora. (godina izdavanja) Naslov: podnaslov. Podatak o izdanju.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Oblik uzet izravno iz sematskog oblika za knjigu u izvoru (sekcija '*Knjiga:', str. 11): 'Prezime, inicijal(i) autora. (godina izdavanja) Naslov: podnaslov. Podatak o izdanju.' Nastavak 'Mjesto: nakladnik' dovrsen iz odsjecenog retka 107 ('Mjesto') jer je ekstrakcija tu prekinuta. Podatak o izdanju izostavljen jer nema dopusteni placeholder. Nema stvarnog popunjenog primjera u izvoru pa example ostaje null.
```

## poglavlje  [str. 11] (derived)
Otvori PDF: `data/sources/vevu/vevu.pdf#page=11`
```
TEMPLATE: {authors} ({year}) {title}. U: {editor} (ur.) {container}[[ (str. {pages})]]. {place}: {publisher}.
QUOTE   : Prezime, inicijal(i) autora. (godina izdavanja) Naslov: podnaslov. Podatak o izdanju.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor (u isjecku) NE navodi zaseban oblik za poglavlje u zborniku; ekstrakcija je prekinuta odmah nakon oblika za knjigu. Predlozak izveden iz oblika za knjigu + uobicajena autor-godina konvencija (U: urednik (ur.) naziv zbornika). Potvrditi protiv punog dokumenta.
```

## clanak  [str. 11] (derived)
Otvori PDF: `data/sources/vevu/vevu.pdf#page=11`
```
TEMPLATE: {authors} ({year}) {title}. {container} {volume}[[({issue})]][[: {pages}]].
QUOTE   : Prezime, inicijal(i) autora. (godina izdavanja) Naslov: podnaslov. Podatak o izdanju.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor (u isjecku) NE navodi zaseban oblik za clanak u casopisu; ekstrakcija je prekinuta nakon oblika za knjigu. Predlozak izveden iz oblika za knjigu + uobicajena autor-godina konvencija (naziv casopisa, godiste(broj): stranice). Interpunkcija je pretpostavka, potvrditi.
```

## mrezni  [str. 11] (derived)
Otvori PDF: `data/sources/vevu/vevu.pdf#page=11`
```
TEMPLATE: {authors} ({year}) {title}. {url} Pristupljeno {accessed}.
QUOTE   : Prezime, inicijal(i) autora. (godina izdavanja) Naslov: podnaslov. Podatak o izdanju.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor (u isjecku) NE navodi zaseban oblik za mrezni izvor niti pristupni datum; ekstrakcija je prekinuta nakon oblika za knjigu. Predlozak i pristupni datum izvedeni iz oblika za knjigu + uobicajena autor-godina konvencija. accessDate je pretpostavka, potvrditi.
```

## zavrsni  [str. 11] (derived)
Otvori PDF: `data/sources/vevu/vevu.pdf#page=11`
```
TEMPLATE: {authors} ({year}) {title} (zavrsni rad). {place}: {institution}.
QUOTE   : Prezime, inicijal(i) autora. (godina izdavanja) Naslov: podnaslov. Podatak o izdanju.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor (u isjecku) NE navodi oblik za citiranje zavrsnih/diplomskih radova iako je sam izvor 'Upute za zavrsni rad'. Predlozak izveden iz oblika za knjigu (nakladnik -> ustanova) + oznaka vrste rada '(zavrsni rad)'. Potvrditi protiv punog dokumenta.
```

## propis  [str. 11] (derived)
Otvori PDF: `data/sources/vevu/vevu.pdf#page=11`
```
TEMPLATE: {title}. {container}[[ {issue}]].
QUOTE   : Prezime, inicijal(i) autora. (godina izdavanja) Naslov: podnaslov. Podatak o izdanju.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor (u isjecku) NE navodi oblik za citiranje propisa; ekstrakcija je prekinuta nakon oblika za knjigu. Predlozak izveden iz uobicajene hrvatske prakse (naziv akta, glasilo, broj). Cijeli oblik je pretpostavka, potvrditi.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: (nema)
RENDER   : (Lovric, 1988)   /  (Lovric, 1988)
QUOTE    : U tekstu rada nakon citiranog dijela u zagradi se upisuje prezime autora, godina izdanja   [grep: OK]
NAPOMENA : In-text je autor-godina: u zagradi prezime autora i godina izdanja. Za vise autora izvor propisuje prvi autor + oznaka et al (redak: 'Ako ima vise autora pise se prvi autor i oznaka ,,et al".', str. 11). Zato je etAlAfter postavljen na 1. 'et al' bez tocke kako pise u izvoru.
```

## Kontradikcije / otvorena pitanja
- Ekstrakcija je odsjecena na 'Mjesto' (str. 11, redak 107): potpun oblik za knjigu (Mjesto: nakladnik) i oblici za ostale vrste izvora nisu u isjecku. Dovrsiti i potvrditi protiv punog dokumenta prije verifikacije.
- Samo in-text pravilo (prezime, godina; prvi autor + et al) i sematski oblik za knjigu su izravno iz izvora. Poglavlje, clanak, mrezni, zavrsni i propis su IZVEDENI (derived) iz oblika za knjigu i uobicajene autor-godina konvencije, nisu propisani u isjecku; njihova interpunkcija je pretpostavka.
- Izvor NE imenuje standardni stil (nema 'Harvard'/'APA'); prior 'harvard' je samo priblizno tocan. Oblik knjige (Prezime, inicijal(i). (godina) Naslov. Mjesto: nakladnik) je harvardu slican, ali je kodiran kao custom-spec jer izvor daje vlastiti oblik i ne imenuje standard.
- Prag za 'et al' je nejasan: 'ako ima vise autora' doslovno znaci vise od 1 autora, pa je etAlAfter postavljen na 1. Provjeriti primjenjuje li se et al vec kod 2 autora ili tek kod 3+.
- Razdvajac vise autora u popisu literature (postavljeno '; '), ponasanje et al u bibliografiji, in-text oblik sa stranicom i pristupni datum za mrezne izvore nisu u isjecku; postavljene su razumne pretpostavke koje treba potvrditi.
- Izvor numerira jedinice popisa literature arapskim brojevima (str. 11); to je detalj prikaza popisa pa numbering ostaje null, a sortiranje je alphabetical (poredani abecednim redom).

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `66d1e460151a...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs vevu "Daniel Risavi"`.
