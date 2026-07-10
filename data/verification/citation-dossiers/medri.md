# Citatni spec: medri (outcome: custom-spec, status: verified)

Stil: **Vancouver numericko (sluzbeni Naputak MEDRI)** (token `medri`)
Izvor: Naputak za prijavu, oblikovanje i izradu diplomskog rada - Farmacija (MEDRI, 2025) (`medri-naputak-diplomski-farmacija-2025`)
Snapshot: `data/sources/medri/medri-naputak-diplomski-farmacija-2025.docx` (hash `ea0173f92c1e...`)

## knjiga  [str. 1] (worked-example)
Otvori PDF: `data/sources/medri/medri-naputak-diplomski-farmacija-2025.docx#page=1`
```
TEMPLATE: {authors}. {title}.[[ {volume}. izd.]] {place}: {publisher}; {year}.
QUOTE   : Šolić F, Žauhar G. Fizika za medicinare. 2. izd. Rijeka: Medicinski fakultet Sveučilišta u Rijeci; 2013.   [grep: OK]
IZVOR   : Šolić F, Žauhar G. Fizika za medicinare. 2. izd. Rijeka: Medicinski fakultet Sveučilišta u Rijeci; 2013.
RENDER  : Šolić F, Žauhar G. Fizika za medicinare. 2. izd. Rijeka: Medicinski fakultet Sveučilišta u Rijeci; 2013.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Sekcija 'Pravila i primjeri navođenja najčešće korištenih djela: KNJIGA, tiskana'. Broj izdanja ide u polje volume (2 -> '2. izd.'). Drugi primjer (Krizan, viseszvescana knjiga s podnaslovom dijela) i elektronicka knjiga (Patrias, [Internet] + Dostupno na) imaju dodatne elemente koje ovaj predlozak ne izrazava. Isti primjeri i u Naputku za Medicinu 2025./2026. (str. 9).
```

## poglavlje  [str. 1] (worked-example)
Otvori PDF: `data/sources/medri/medri-naputak-diplomski-farmacija-2025.docx#page=1`
```
TEMPLATE: {authors}. {title}. U: {editor}, eds. {container}.[[ {volume}.]] {place}: {publisher}; {year}.[[ p. {pages}.]]
QUOTE   : Kone BC. Metabolic basis of solute transport. U: Brenner BM, Rector FC, eds. Brenner and Rector‘s the kidney. 8th ed. Vol. 1. Philadelphia: Saunders Elsevier; c2008. p. 130-55.   [grep: OK]
IZVOR   : Kone BC. Metabolic basis of solute transport. U: Brenner BM, Rector FC, eds. Brenner and Rector's the kidney. 8th ed. Vol. 1. Philadelphia: Saunders Elsevier; c2008. p. 130-55.
RENDER  : Kone BC. Metabolic basis of solute transport. U: Brenner BM, Rector FC, eds. Brenner and Rector's the kidney. 8th ed. Vol. 1. Philadelphia: Saunders Elsevier; c2008. p. 130-55.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Sekcija 'poglavlje / rad u zborniku'. Urednici u istom obliku kao autori (Prezime II), oznaka 'eds.' iz prvog primjera; drugi primjer (Christensen, zbornik konferencije) koristi 'editors', izvor je nekonzistentan. Broj izdanja i svezak idu zajedno u polje volume ('8th ed. Vol. 1'). Apostrof u 'Rector's' je u ekstrakciji ostecen (pdftotext), expected rekonstruiran s ASCII apostrofom.
```

## clanak  [str. 1] (worked-example)
Otvori PDF: `data/sources/medri/medri-naputak-diplomski-farmacija-2025.docx#page=1`
```
TEMPLATE: {authors}. {title}. {container}. {year}; {volume}[[({issue})]]: {pages}.
QUOTE   : Sigelman CK, Schoenrock CJ, Spanhel CL, Hromas SG, Winer JL, Budd EC, et al. Surveying mentally retarded persons: responsiveness and response validity in three samples. Am J Ment Defic. 1980; 84(5): 479-86.   [grep: OK]
IZVOR   : Sigelman CK, Schoenrock CJ, Spanhel CL, Hromas SG, Winer JL, Budd EC, et al. Surveying mentally retarded persons: responsiveness and response validity in three samples. Am J Ment Defic. 1980; 84(5): 479-86.
RENDER  : Sigelman CK, Schoenrock CJ, Spanhel CL, Hromas SG, Winer JL, Budd EC, et al. Surveying mentally retarded persons: responsiveness and response validity in three samples. Am J Ment Defic. 1980; 84(5): 479-86.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Sekcija 'ČLANAK, u tiskanom časopisu'. Skraceni naziv casopisa (Am J Ment Defic), oblik 'godina; volumen(broj): raspon stranica'. Primjer pokazuje prvih 6 autora + 'et al.'; izvor NE imenuje sedmog autora pa se u demo inputu daljnji autori oznacavaju kao 'et al.' (sedmi chunk samo okida kracenje, ne renderira se). Elektronicki clanak (Halpern) i clanak u bazi (Kuohung) dodaju [Internet], citirano i Dostupno na, sto ovaj predlozak ne pokriva.
```

## mrezni  [str. 1] (worked-example)
Otvori PDF: `data/sources/medri/medri-naputak-diplomski-farmacija-2025.docx#page=1`
```
TEMPLATE: [[{authors}. ]]{title} [Internet].[[ {place}: {publisher};]] {year}[[ [ažurirano {volume}; citirano {accessed}] ]].[[ Dostupno na: {url}]]
QUOTE   : Cancer-Pain.org [Internet]. New York: Association of Cancer Online Resources, Inc.; c2000- 01 [ažurirano 16.5.2002.; citirano 9.7.2002.].  Dostupno na:  http://www.cancer- pain.org   [grep: OK]
IZVOR   : Cancer-Pain.org [Internet]. New York: Association of Cancer Online Resources, Inc.; c2000-01 [ažurirano 16.5.2002.; citirano 9.7.2002.]. Dostupno na: http://www.cancer-pain.org
RENDER  : Cancer-Pain.org [Internet]. New York: Association of Cancer Online Resources, Inc.; c2000-01 [ažurirano 16.5.2002.; citirano 9.7.2002.]. Dostupno na: http://www.cancer-pain.org
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Sekcija 'MREŽNA STRANICA'. Primjer nema autora (naslov na prvom mjestu); opcionalna grupa s autorima dodana je mimo primjera po NLM konvenciji. Datum azuriranja nema namjenski placeholder pa ga nosi polje volume. 'c2000- 01' i 'cancer- pain.org' u ekstrakciji su pdftotext prelomi, expected je spojen (c2000-01, cancer-pain.org).
```

## zavrsni  [str. 1] (derived)
Otvori PDF: `data/sources/medri/medri-naputak-diplomski-farmacija-2025.docx#page=1`
```
TEMPLATE: {authors}. {title} [diplomski rad].[[ {place}:]] {institution}; {year}.
QUOTE   : Više primjera za navođenje literature možete potražiti u knjizi Citing Medicine, na poveznici   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor ne egzemplificira citiranje zavrsnih/diplomskih radova; oblik je izveden iz NLM Citing Medicine konvencije za teze (Autor. Naslov [vrsta rada]. Mjesto: Ustanova; godina), na koju izvor izrijekom upucuje. Oznaka vrste rada (diplomski, zavrsni, doktorski) prilagodava se stvarnom radu. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 1] (derived)
Otvori PDF: `data/sources/medri/medri-naputak-diplomski-farmacija-2025.docx#page=1`
```
TEMPLATE: {title}. {container}[[ {issue}]].
QUOTE   : Prilikom pisanja rada koriste se različiti izvori znanja (članci, knjige, mrežne stranice, pravni propisi, …)koji se nazivaju literatura (reference, referencije).   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor pravne propise navodi kao vrstu literature, ali ih ne egzemplificira; oblik (naslov, sluzbeno glasilo, broj) izveden je iz opce hrvatske prakse u Vancouver okruzenju, ne iz izvora. Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Prior ['vancouver'] je POTVRDJEN: izvor izrijekom imenuje Vancouverski stil (Farmacija naputak, str. 1; Naputak za Medicinu 2025./2026., str. 8), nema proturjecja.
- Formulacija imenovanja je deskriptivna ('najcesci je Vancouverski stil koji se koristi i na Medicinskom fakultetu Sveucilista u Rijeci'), ne izricita zapovijed; upute ipak donose vlastita 'Pravila i primjeri navodenja' pa je custom-spec izgradjen iz tih primjera.
- et-al prag (prvih 6 autora + 'et al.') izveden je iz Sigelman primjera; izvor nema prozno pravilo o broju autora (ICMJE konvencija je 7+ -> prvih 6 + et al.). Potvrditi.
- Poglavlje: izvor je nekonzistentan u oznaci urednika ('eds.' u prvom primjeru, 'editors' u drugom); predlozak slijedi prvi primjer. Za jednog urednika 'eds.' je vjerojatno 'ed.', izvor to ne pokazuje.
- Knjiga i clanak: predlosci pokrivaju tiskane oblike; elektronicke varijante (Patrias, Halpern, Kuohung) dodaju [Internet], citirano i Dostupno na, koje predlosci ne pokrivaju.
- Mrezni: datum azuriranja nema namjenski placeholder pa ga nosi polje volume; opcionalna grupa s autorima dodana je mimo primjera (primjer nema autora).
- Zavrsni i propis nisu egzemplificirani u izvoru: zavrsni je izveden iz Citing Medicine konvencije na koju izvor upucuje, propis iz opce hrvatske prakse. Oba potvrditi ili oboriti pri verifikaciji.
- Oba izvora dijele isti knjiznicni tekst: spec je vezan na farmacijski naputak (2025, DOCX pa su svi lokatori 'str. 1') jer njegova ekstrakcija sadrzi sve primjere (ukljucivo clanak i mreznu stranicu), a Naputak za Medicinu 2025./2026. (str. 8-9) potvrdjuje ista pravila i iste primjere knjige i poglavlja, dakle stil vrijedi fakultetski, ne samo za Farmaciju.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `ea0173f92c1e...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs medri "Daniel Risavi"`.
