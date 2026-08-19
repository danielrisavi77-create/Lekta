# Citatni spec: erf (outcome: custom-spec, status: verified)

Stil: **APA 7 autor-godina (ERF upute preko časopisa HRRI)** (token `erf`)
Izvor: Upute autorima časopisa Hrvatska revija za rehabilitacijska istraživanja; ERF Upute za izradu diplomskog rada upućuju na propozicije tog časopisa (`erf-hrri-upute-autorima`)
Snapshot: `data/sources/erf/erf-hrri-upute-autorima.html` (hash `0fca0d605fc1...`)

## knjiga  [str. 1] (worked-example)
Otvori PDF: `data/sources/erf/erf-hrri-upute-autorima.html#page=1`
```
TEMPLATE: {authors} ({year}). {title}. {publisher}.
QUOTE   : Bašić, J., Ferić, M., & Kranželić, V. (2001). Od primarne prevencije do ranih intervencija. Edukacijsko-rehabilitacijski fakultet.   [grep: OK]
IZVOR   : Bašić, J., Ferić, M., & Kranželić, V. (2001). Od primarne prevencije do ranih intervencija. Edukacijsko-rehabilitacijski fakultet.
RENDER  : Bašić, J., Ferić, M., & Kranželić, V. (2001). Od primarne prevencije do ranih intervencija. Edukacijsko-rehabilitacijski fakultet.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: APA 7 oblik knjige BEZ mjesta izdanja (samo izdavac). Tri autora: separator ', ' i zavrsni ', & '. Autori u inputu ostavljeni doslovno u obliku iz primjera (puna imena nisu navedena u izvoru pa se ne izmisljaju). Naslov u izvorniku kurzivom, alat radi plain text.
```

## clanak  [str. 1] (worked-example)
Otvori PDF: `data/sources/erf/erf-hrri-upute-autorima.html#page=1`
```
TEMPLATE: {authors} ({year}). {title}. {container}, {volume}[[({issue})]], {pages}.[[ {doiUrl}]]
QUOTE   : Adani, S., & Cepanec, M. (2019). Sex differences in early communication development: behavioural and neurobiological indicators of more vulnerable communication system development in boys. Croatian Medical Journal, 60(2), 141–149. https://doi.org/10.3325/cmj.2019.60.141   [grep: OK]
IZVOR   : Adani, S., & Cepanec, M. (2019). Sex differences in early communication development: behavioural and neurobiological indicators of more vulnerable communication system development in boys. Croatian Medical Journal, 60(2), 141–149. https://doi.org/10.3325/cmj.2019.60.141
RENDER  : Adani, S., & Cepanec, M. (2019). Sex differences in early communication development: behavioural and neurobiological indicators of more vulnerable communication system development in boys. Croatian Medical Journal, 60(2), 141–149. https://doi.org/10.3325/cmj.2019.60.141
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: APA 7 clanak: casopis i godiste odvojeni zarezom, broj u zagradi uz godiste, stranice pa tocka, DOI kao puni https URL bez tocke na kraju. Izvor izrijekom: 'DOI must be included when available.' (str. 1). Naziv casopisa i godiste u izvorniku kurzivom, alat radi plain text.
```

## poglavlje  [str. 1] (worked-example)
Otvori PDF: `data/sources/erf/erf-hrri-upute-autorima.html#page=1`
```
TEMPLATE: {authors} ({year}). {title}. In {editor} (Eds.), {container}[[ (pp. {pages})]]. {publisher}.
QUOTE   : Arapović, D. (2003). Djeca s govorno-jezičnim teškoćama u osnovnoj školi. In D. Pavličević-Franić & M. Kovačević (Eds.), Komunikacijska kompetencija u višejezičnoj sredini II (pp. 87–93). Naklada Slap.   [grep: OK]
IZVOR   : Arapović, D. (2003). Djeca s govorno-jezičnim teškoćama u osnovnoj školi. In D. Pavličević-Franić & M. Kovačević (Eds.), Komunikacijska kompetencija u višejezičnoj sredini II (pp. 87–93). Naklada Slap.
RENDER  : Arapović, D. (2003). Djeca s govorno-jezičnim teškoćama u osnovnoj školi. In D. Pavličević-Franić & M. Kovačević (Eds.), Komunikacijska kompetencija u višejezičnoj sredini II (pp. 87–93). Naklada Slap.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Urednici u obliku inicijal pa prezime (given-first), povezani s ' & '; upisuju se doslovno u polje editor. Engleski konektori 'In', '(Eds.)', 'pp.' su iz izvora (casopis trazi rukopis na engleskom); hrvatska inacica (U:, ur., str.) nije evidentirana u izvoru. Jedan urednik bi po APA 7 bio '(Ed.)', u izvoru nije evidentirano.
```

## mrezni  [str. 1] (derived)
Otvori PDF: `data/sources/erf/erf-hrri-upute-autorima.html#page=1`
```
TEMPLATE: {authors} ({year}). {title}.[[ {container}.]] {url}
QUOTE   : The journal uses the APA 7th edition referencing style (see  http://www.apastyle.org/)   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor nema primjer mrezne stranice; predlozak izveden iz APA 7 stila koji izvor izrijekom imenuje i iz nacina navodenja URL-a u primjeru clanka (URL na kraju, bez tocke iza). {container} je naziv stranice ili organizacije. APA 7 datum pristupa trazi samo za promjenjiv sadrzaj pa accessed nije ukljucen. Potvrditi pri verifikaciji.
```

## zavrsni  [str. 1] (derived)
Otvori PDF: `data/sources/erf/erf-hrri-upute-autorima.html#page=1`
```
TEMPLATE: {authors} ({year}). {title} [Diplomski rad, {institution}].[[ {url}]]
QUOTE   : The journal uses the APA 7th edition referencing style (see  http://www.apastyle.org/)   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor ne obraduje citiranje zavrsnih/diplomskih radova; predlozak izveden iz APA 7 obrasca za tezu (naslov pa uglata zagrada s vrstom rada i ustanovom), stil imenovan u izvoru. Za rad objavljen u repozitoriju APA 7 dodaje naziv repozitorija i URL. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 1] (derived)
Otvori PDF: `data/sources/erf/erf-hrri-upute-autorima.html#page=1`
```
TEMPLATE: {title} ({year}). {container}[[, {issue}]].[[ {url}]]
QUOTE   : The journal uses the APA 7th edition referencing style (see  http://www.apastyle.org/)   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor uopce ne obraduje citiranje propisa; predlozak izveden iz opceg APA 7 obrasca (naslov na mjestu autora, godina, glasilo s brojem, npr. Narodne novine u polju container). Hrvatska prilagodba APA 7 za propise nije evidentirana u izvoru. Potvrditi ili oboriti pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: (nema)
RENDER   : (Lovric, 1988)   /  (Lovric, 1988)
QUOTE    : (Author, year): (Jandrić Nišević, 2010).   [grep: OK]
NAPOMENA : Izvor daje i narativni oblik 'Author (year): Jandrić Nišević (2010)'. Pravila iz izvora: 1-2 autora oba prezimena kroz cijeli tekst, 3+ autora prvi autor + 'et al.' (etAlAfter 3 prema tom pravilu). twoJoiner ' & ' je IZVEDEN iz APA 7 koji izvor imenuje, primjer za dva autora u tekstu nije naveden; potvrditi pri verifikaciji. Oblik s brojem stranice nije naveden u izvoru pa withPagesTemplate nije definiran.
```

## Kontradikcije / otvorena pitanja
- ERF Upute za diplomski rad (erf-upute-diplomski, str. 3) ne propisuju stil izravno nego citiranje 'po propozicijama casopisa Hrvatska revija za rehabilitacijska istrazivanja ili casopisa Kriminologija i socijalna integracija'; nacrt je izgraden iz HRRI uputa autorima (APA 7). Propozicije casopisa Kriminologija i socijalna integracija nisu u ekstrakciji pa druga dopustena varijanta nije obradena.
- HRRI upute pisane su za rukopise na engleskom pa primjeri koriste engleske konektore (In, Eds., pp.); hrvatska inacica konektora za diplomske radove pisane hrvatskim nije evidentirana u izvoru.
- Mrezni, zavrsni i propis nemaju primjer u izvoru; predlosci su izvedeni (derived) iz APA 7 stila koji izvor izrijekom imenuje i cekaju potvrdu.
- Rasponi stranica u primjerima izvora pisani su en crticom; u quoteRaw, inputu i expected zadrzani doslovno radi vjernosti izvoru.
- Svi inicijali u primjerima su jednoslovni pa razmak kod visestrukih inicijala (dotted-spaced) slijedi APA 7 standard i nije potvrden primjerom iz izvora.
- Oblik citata u tekstu s brojem stranice nije naveden u izvoru pa withPagesTemplate nije definiran; potvrditi pri verifikaciji.
- Pravilo o skracivanju dugih popisa autora u literaturi (APA 7 dopusta do 20 autora) nije evidentirano u izvoru pa etAl polja u authorFormat nisu postavljena.
- Kurziv naslova (knjiga, casopis, zbornik) alat ne reproducira, izlaz je plain text.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `0fca0d605fc1...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs erf "Daniel Risavi"`.
