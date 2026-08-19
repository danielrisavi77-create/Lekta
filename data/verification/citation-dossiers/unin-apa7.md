# Citatni spec: unin-apa7 (outcome: custom-spec, status: verified)

Stil: **APA 7 autor-godina (službene upute UNIN, biomedicina)** (token `apa7`)
Izvor: Upute za izradu završnih i diplomskih radova (Sveučilište Sjever) (`unin-upute-radovi-2026`)
Snapshot: `data/sources/unin/unin-upute.docx` (hash `53d0ff0b8b18...`)

## knjiga  [str. 1] (worked-example)
Otvori PDF: `data/sources/unin/unin-upute.docx#page=1`
```
TEMPLATE: {authors} ({year}). {title}. {place}, {publisher}.
QUOTE   : Mirić, M. (2003). Naslov knjige. Mjesto izdavanja, Nakladnik.   [grep: OK]
IZVOR   : Mirić, M. (2003). Naslov knjige. Mjesto izdavanja, Nakladnik.
RENDER  : Mirić, M. (2003). Naslov knjige. Mjesto izdavanja, Nakladnik.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Redoslijed: prezime, inicijal(i), (godina), naslov, mjesto izdavanja, nakladnik. Mjesto i nakladnik odvojeni ZAREZOM (ne dvotockom). Knjiga s urednikom dodaje '(ur.).' iza inicijala (Gibbs, J. T. (ur.). (1991)...). Knjiga bez autora pocinje naslovom + (godina).
```

## poglavlje  [str. 1] (worked-example)
Otvori PDF: `data/sources/unin/unin-upute.docx#page=1`
```
TEMPLATE: {authors} ({year}). {title}. V {editor} (ur.), {container}[[ (str. {pages})]]. {publisher}.
QUOTE   : Filipčič, T. in Štemberger, V. (2017). Prilagoditve pri ocenjevanju učencev s posebnimi potrebami pri predmetu šport. V T. Devjak in I. Saksida (ur.), Kakovost in ocenjevanje znanja (str. 61-70). Univerza v Ljubljani, Pedagoška fakulteta.   [grep: OK]
IZVOR   : Filipčič, T. in Štemberger, V. (2017). Prilagoditve pri ocenjevanju učencev s posebnimi potrebami pri predmetu šport. V T. Devjak in I. Saksida (ur.), Kakovost in ocenjevanje znanja (str. 61-70). Univerza v Ljubljani, Pedagoška fakulteta.
RENDER  : Filipčič, T., Štemberger, V. (2017). Prilagoditve pri ocenjevanju učencev s posebnimi potrebami pri predmetu šport. V T. Devjak in I. Saksida (ur.), Kakovost in ocenjevanje znanja (str. 61-70). Univerza v Ljubljani, Pedagoška fakulteta.
VERDIKT : DIFF (deklariran)  <-- USPOREDI ZNAK PO ZNAK
DEKLARIRANO: Worked-example je slovenski izvor pa koristi slovenski veznik "in" (Filipcic, T. in Stemberger, V.); alat po hrvatskom pravilu stila daje zarez/"i". Ostatak retka tocno odgovara izvoru.
NAPOMENA: Jedini worked-example za poglavlje je SLOVENSKI (veznik 'V' = hrvatski 'U:', 'in' = 'i', urednik u obliku ime-prvo 'T. Devjak'). Predlozak i primjer zadrzani doslovno da template reproducira izvor; lokalizaciju na hrvatski ('U:', 'i', prezime-prvo urednika) rijesiti pri verifikaciji. Raspon stranica u '(str. 61-70)'; publisher moze biti ustanova + sastavnica.
```

## clanak  [str. 1] (worked-example)
Otvori PDF: `data/sources/unin/unin-upute.docx#page=1`
```
TEMPLATE: {authors} ({year}). {title}. {container}, {volume}[[({issue})]], {pages}.[[ doi: {doi}]]
QUOTE   : Boyd, G., Heaton, P.A., Wilkinson, R., Prosad Paul, S. (2017). Nursing management of childhood chickenpox infection. Emergency Nurse, 25(8), 32-39.   [grep: OK]
IZVOR   : Boyd, G., Heaton, P.A., Wilkinson, R., Prosad Paul, S. (2017). Nursing management of childhood chickenpox infection. Emergency Nurse, 25(8), 32-39.
RENDER  : Boyd, G., Heaton, P.A., Wilkinson, R., Prosad Paul, S. (2017). Nursing management of childhood chickenpox infection. Emergency Nurse, 25(8), 32-39.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Casopis, volumen(broj), raspon stranica. Vise autora odvaja se zarezom; do 3+ svi navedeni u popisu. DOI varijanta u izvoru dodaje 'doi: {doi}' iza stranica (primjer '...13(2), 1-9 doi: 10.4081/jphia.2022.1923'), tu bez tocke prije doi; ovdje ostavljena tocka iza stranica pa je ' doi: {doi}' opcionalan dodatak. Varijanta 'clanak s brojem clanka' koristi 'clanak {broj}' umjesto raspona stranica.
```

## mrezni  [str. 1] (worked-example)
Otvori PDF: `data/sources/unin/unin-upute.docx#page=1`
```
TEMPLATE: {authors} ({year}). {title}. Dostupno: {url}[[ Pristupljeno: {accessed}.]]
QUOTE   : World Health Organization (2019). Child maltreatment. Dostupno: https://www.who.int/multi-media/details/child-maltreatment-infographic   [grep: OK]
IZVOR   : World Health Organization (2019). Child maltreatment. Dostupno: https://www.who.int/multi-media/details/child-maltreatment-infographic
RENDER  : Organization, W.H. (2019). Child maltreatment. Dostupno: https://www.who.int/multi-media/details/child-maltreatment-infographic
VERDIKT : DIFF (deklariran)  <-- USPOREDI ZNAK PO ZNAK
DEKLARIRANO: Institucijski autor (World Health Organization); author-formatter ga tretira kao osobu ("Organization, W.H.") jer org-detekcija ne hvata ovaj naziv. Za institucijske autore unos ostaje doslovan; ogranicenje alata, ne izvora.
NAPOMENA: Predlozak izveden iz primjera organizacije (grupni/korporativni autor bez inicijala). Web primjeri u izvoru su nedosljedni: neki koriste 'Dostupno:' + URL, poznati autor daje URL izravno iza naslova s datumom u zagradi, a uvodni primjer dodaje ', Pristupljeno: {datum}'. 'Pristupljeno: {accessed}.' postavljen kao opcionalan. Za nepoznatu godinu izvor koristi '(b.d.)'.
```

## zavrsni  [str. 1] (worked-example)
Otvori PDF: `data/sources/unin/unin-upute.docx#page=1`
```
TEMPLATE: {authors} ({year}). {title} [Diplomski rad, {institution}]
QUOTE   : Marić, M. (2018). Naslov rada [Diplomski rad, Sveučilište u Zagrebu, Medicinski fakultet]   [grep: OK]
IZVOR   : Marić, M. (2018). Naslov rada [Diplomski rad, Sveučilište u Zagrebu, Medicinski fakultet]
RENDER  : Marić, M. (2018). Naslov rada [Diplomski rad, Sveučilište u Zagrebu, Medicinski fakultet]
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Vrsta rada i ustanova u uglatoj zagradi iza naslova: '[Diplomski rad, {institution}]'. Institucija se upisuje kao 'Sveuciliste, sastavnica'. Sekcija pokriva zavrsne/diplomske radove i doktorske disertacije zajedno; primjer je diplomski rad.
```

## propis  [str. 1] (worked-example)
Otvori PDF: `data/sources/unin/unin-upute.docx#page=1`
```
TEMPLATE: {title}. ({year}). {container} {issue}.[[ {url}]]
QUOTE   : Kazneni zakon. (2024). NN 135/24. https://www.zakon.hr/z/98/Kazneni-zakon   [grep: OK]
IZVOR   : Kazneni zakon. (2024). NN 135/24. https://www.zakon.hr/z/98/Kazneni-zakon
RENDER  : Kazneni zakon. (2024). NN 135/24. https://www.zakon.hr/z/98/Kazneni-zakon
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Zakoni, pravilnici i uredbe iz Narodnih novina: naslov propisa je nositelj natuknice (bez autora), 'NN' je kratica glasila, '{issue}' je broj glasila (135/24). URL je opcionalan. Naslovi iz NN citiraju se u obliku 'Naslov. (godina). NN broj. URL'.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: ({authorsShort}, {year}, str. {pages})
RENDER   : (Lovric, 1988)   /  (Lovric, 1988, str. 45)
QUOTE    : (Mirić, 2003, str. 15)   [grep: OK]
NAPOMENA : APA sekcija: 1 autor '(Mirić, 2003, str. 15)', 2 autora '(Mirić i Ivić, 2003, str. 15)', 3+ '(Mirić i dr., 2003, str. 5)'. Bez stranica: '(Kazneni zakon, 2024)', '(World Health Organization, 2019)', '(Lam i Silver, 2023)'. Broj stranice se u tekstu uvodi kao ', str. N'.
```

## Kontradikcije / otvorena pitanja
- Svi tagovi isjecaka u ekstrakciji nose 'str. 1' iako se APA/Harvard/Vancouver sekcije protezu kroz dokument; stvarni brojevi stranica nisu obnovljivi iz ove ekstrakcije pa je sourcePage svugdje 'str. 1'.
- PRIOR iz profila je ['vancouver','apa7','harvard'], ali izvor izricito propisuje RAZLICIT stil po znanstvenom podrucju/odjelu: APA u biomedicini, Harvard u drustvenim, Vancouver u tehnickim znanostima; zato tri nacrta (unin-apa7 custom-spec, unin-harvard i unin-vancouver style-pin).
- Inicijali su pretezno dotted-compact ('P.A.', 'S.A.', 'M.M.'), ali primjer s urednikom 'Gibbs, J. T.' koristi razmaknute inicijale; odabrano dotted-compact, potvrditi pri verifikaciji.
- Za 2 autora popis koristi zavrsni ' i ' ('Mirić, M. i Ivić, I.'), a za 3+ autora primjeri su odvojeni samo zarezom bez zavrsnog ' i ' (npr. 7 autora); vjerojatno tipografska nedosljednost izvora; finalJoiner postavljen na ' i ', potvrditi.
- APA 7 standardno izostavlja mjesto izdavanja, ali UNIN primjeri za knjigu zadrzavaju 'Mjesto izdavanja, Nakladnik'; slijedjen je izvor.
- Jedini worked-example za poglavlje je na slovenskom ('V ... in ... (ur.)', urednik ime-prvo); predlozak zadrzava izvorne veznike 'V'/'in' da reproducira primjer, lokalizaciju na hrvatski 'U:'/'i' i prezime-prvo urednika rijesiti pri verifikaciji.
- Web primjeri su nedosljedni ('Dostupno:' vs izravan URL vs ', Pristupljeno:'); mrezni predlozak izveden iz primjera organizacije (WHO), datum pristupa opcionalan.
- Naslovi knjiga i casopisa su u APA izvorniku kurzivom; alat radi plain text pa je kurziv izostavljen (napomena na stranici alata).

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `53d0ff0b8b18...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs unin-apa7 "Daniel Risavi"`.
