# Citatni spec: vef (outcome: custom-spec, status: verified)

Stil: **VEF autor-godina (sluzbeni Naputak za diplomski rad)** (token `vef`)
Izvor: Naputak za prijavu, pisanje i oblikovanje diplomskog rada (Veterinarski fakultet Sveucilista u Zagrebu) (`vef-naputak-diplomski-2024`)
Snapshot: `data/sources/vef/vef-naputak-diplomski-2024.pdf` (hash `de34916f3dda...`)

## knjiga  [str. 11] (worked-example)
Otvori PDF: `data/sources/vef/vef-naputak-diplomski-2024.pdf#page=11`
```
TEMPLATE: {authors} ({year}): {title}. [[{volume}. izd., ]]{publisher}, {place}[[, str. {pages}]].
QUOTE   : AITKEN, I. D. (2007): Diseases of Sheep. 4. izd., Blackwell Publishing, Oxford, str. 602- 603.   [grep: OK]
IZVOR   : AITKEN, I. D. (2007): Diseases of Sheep. 4. izd., Blackwell Publishing, Oxford, str. 602- 603.
RENDER  : AITKEN, I. D. (2007): Diseases of Sheep. 4. izd., Blackwell Publishing, Oxford, str. 602- 603.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Prezime autora VELIKIM slovima, inicijali s tockom i razmakom (I. D.); godina u zagradi iza koje ide dvotocka. Broj izdanja upisuje se u polje volume ('4' -> '4. izd.,'). Izdavac pa mjesto, odvojeni zarezom. Raspon stranica opcionalan ('str. 602- 603.', razmak oko crtice je pdftotext artefakt).
```

## poglavlje  [str. 11] (worked-example)
Otvori PDF: `data/sources/vef/vef-naputak-diplomski-2024.pdf#page=11`
```
TEMPLATE: {authors} ({year}): {title}. U: {container} ({editor}, Ur.), {publisher}, {place}[[, str. {pages}]].
QUOTE   : LAMMLER, C. H., G. HAHN (1994): Streptokokken. U: Hanbdbuch der bakteriellen Infektionen   [grep: OK]
IZVOR   : LAMMLER, C. H., G. HAHN (1994): Streptokokken. U: Hanbdbuch der bakteriellen Infektionen bei Tieren. Band II. Teil 2. (Blobel, H., T. Schliesser, Ur.), Gustav Fischer Verlag Jena, Stuttgart, str. 15-141.
RENDER  : LAMMLER, C. H., G. HAHN (1994): Streptokokken. U: Hanbdbuch der bakteriellen Infektionen bei Tieren. Band II. Teil 2. (Blobel, H., T. Schliesser, Ur.), Gustav Fischer Verlag Jena, Stuttgart, str. 15-141.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Prvi autor invertiran (Prezime, inicijali), sljedeci autor inicijali pa prezime ('G. HAHN'); autori odvojeni zarezom. 'U:' uvodi zbornik/knjigu. Urednici u zagradi s oznakom 'Ur.' (veliko U, s tockom, razlika od FPZG '(ur)' i pravo '(ur.)'). Naziv knjige (container) obuhvaca i oznaku sveska/dijela 'Band II. Teil 2.' kako stoji u izvoru; 'Hanbdbuch' je tipfeler izvora, prenesen doslovno. Izvor prelama u tri retka do 'str. 15 � 141.' (spojeno u expected, spacirana crtica normalizirana u '15-141').
```

## clanak  [str. 10] (derived)
Otvori PDF: `data/sources/vef/vef-naputak-diplomski-2024.pdf#page=10`
```
TEMPLATE: {authors} ({year}): {title}. {container} {volume}[[({issue})]], {pages}.
QUOTE   : - brojcane podatke: godina izdanja knjige ili casopisa, volumen, broj i stranica clanka   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvedeno. Ekstrakcija sadrzi naslov 'Rad u casopisu:' (str. 11), ali je konkretni primjer izrezan na kraju datoteke, pa nema worked-example retka. Predlozak je izveden iz opceg pravila o brojcanim podacima (godina, volumen, broj, stranica clanka; str. 10) i stila knjige (VELIKO prezime, godina u zagradi + dvotocka). Casopis se u tekstu navodi 'prema Uputstvu za pisanje clanka u Veterinarskom arhivu' (str. 7). Potvrditi tocnu interpunkciju pri verifikaciji iz punog izvora.
```

## mrezni  [str. 11] (worked-example)
Otvori PDF: `data/sources/vef/vef-naputak-diplomski-2024.pdf#page=11`
```
TEMPLATE: {authors} ({year}): {title}. [[{publisher}, ]]{place}. {url} ({accessed})
QUOTE   : EUROPEAN EVALUATION NETWORK FOR RURAL DEVELOPMENT (2010): Working paper on   [grep: OK]
IZVOR   : EUROPEAN EVALUATION NETWORK FOR RURAL DEVELOPMENT (2010): Working paper on Approaches for assessing the impacts of the Rural Development Programmes in the context of multiple intervening factors. European Commission, Bruxselles, Belgium. https://enrd.ec.europa.eu/enrd-static/fms/pdf/EB43A527-C292-F36CFC51-9EA5B47CEDAE.pdf (17.7.2019.)
RENDER  : DEVELOPMENT, E. E. N. F. R. (2010): Working paper on Approaches for assessing the impacts of the Rural Development Programmes in the context of multiple intervening factors. European Commission, Bruxselles, Belgium. https://enrd.ec.europa.eu/enrd-static/fms/pdf/EB43A527-C292-F36CFC51-9EA5B47CEDAE.pdf (17.7.2019.)
VERDIKT : DIFF (deklariran)  <-- USPOREDI ZNAK PO ZNAK
DEKLARIRANO: Institucijski autor (EUROPEAN EVALUATION NETWORK FOR RURAL DEVELOPMENT); author-formatter ga tretira kao osobu jer org-detekcija ne hvata naziv. Za institucijske autore unos ostaje doslovan; ogranicenje alata.
NAPOMENA: Korporativni/organizacijski autor VELIKIM slovima, godina u zagradi + dvotocka, naslov s tockom, izdavac i mjesto, zatim URL i datum pristupa u zagradi. Izvor prelama primjer u pet redaka (317-321), spojeno u expected. Varijanta bez izdavaca u izvoru (EUROPSKA KOMISIJA, 2018) ima naslov koji zavrsava zarezom pa mjesto; zato je publisher opcionalan. Datum pristupa u obliku '(17.7.2019.)'.
```

## zavrsni  [str. 11] (derived)
Otvori PDF: `data/sources/vef/vef-naputak-diplomski-2024.pdf#page=11`
```
TEMPLATE: {authors} ({year}): {title} (diplomski rad). {institution}, {place}.
QUOTE   : AITKEN, I. D. (2007): Diseases of Sheep. 4. izd., Blackwell Publishing, Oxford, str. 602- 603.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvedeno. Naputak opisuje kako se pise diplomski rad, ali NE daje primjer citiranja zavrsnog/diplomskog rada u popisu literature. Predlozak je izveden iz oblika za knjigu (ustanova umjesto izdavaca, uz oznaku '(diplomski rad)'). Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 11] (worked-example)
Otvori PDF: `data/sources/vef/vef-naputak-diplomski-2024.pdf#page=11`
```
TEMPLATE: {title} ({container}, br. {issue}).
QUOTE   : Zakon o drzavnoj potpori u poljoprivredi, ribarstvu i sumarstvu (Narodne novine, br. 87/02).   [grep: OK]
IZVOR   : Zakon o drzavnoj potpori u poljoprivredi, ribarstvu i sumarstvu (Narodne novine, br. 87/02).
RENDER  : Zakon o drzavnoj potpori u poljoprivredi, ribarstvu i sumarstvu (Narodne novine, br. 87/02).
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Naslov propisa, zatim u zagradi glasilo i broj s oznakom 'br.'. U tekstu se propis navodi kraticom '(NN 87/2002.)', a u popisu literature punim oblikom '(Narodne novine, br. 87/02)'. Bez autora/donositelja u primjeru popisa (razlika od FPZG koji navodi donositelja).
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: (nema)
RENDER   : (Lovric, 1988)   /  (Lovric, 1988)
QUOTE    : BLACK (2021.) opazio je da s porastom tjelesne mase raste i rizik za pojavu bolesti krvozilnog   [grep: OK]
NAPOMENA : Autor-godina; prezime autora VELIKIM slovima. Narativni oblik 'BLACK (2021.)' i zagradni oblik 'Opazeno je ... (BLACK, 2021.).'; template koristi zagradni oblik. Dva autora 'BLACK i BROWN (2022.)' (twoJoiner ' i '); tri i vise 'BLACK i sur.' (etAlAfter 3, etAlText 'i sur.'). Vise izvora u zagradi odvaja se tockom sa zarezom kronoloskim redom (str. 11): '(BLACK, 2021.; BLACK i BROWN, 2022.; BLACK i sur., 2023.)'. Isti autor ista godina dobiva mala slova '2021.a; 2021.b'. Godina nosi tocku za rad na hrvatskom, bez tocke za rad na engleskom (str. 10).
```

## Kontradikcije / otvorena pitanja
- PRIOR hint je 'harvard': izvor JEST autor-godina (obitelj-godina, slicno Harvardu), ali propisuje vlastite worked-example oblike (VELIKA prezimena, 'i sur.', urednicka oznaka 'Ur.', dvotocka iza godine, tocka iza godine samo za hrvatske radove), pa je kodiran kao custom-spec, ne kao genericki harvard style-pin. Slijedjen IZVOR, ne prior.
- clanak: ekstrakcija ima naslov 'Rad u casopisu:' (str. 11) ali je primjer izrezan na kraju datoteke; predlozak je izveden (derived) iz opceg pravila o brojcanim podacima i stila knjige. Verificirati iz punog izvora.
- zavrsni: Naputak ne pokriva citiranje diplomskog/zavrsnog rada u popisu literature; predlozak izveden iz oblika za knjigu (derived).
- Prezimena autora se u izvoru pisu VELIKIM slovima (i u tekstu i u popisu literature), a naslovi knjiga/casopisa kurzivom; authorFormat nema zastavicu za velika slova, a alat radi plain-text izlaz, pa se ta dva svojstva ne reproduciraju automatski (napomena na stranici alata).
- In-text godina nosi tocku za rad na hrvatskom, a bez tocke za rad na engleskom (str. 10); jedan template ne moze uvjetovati po jeziku, pa polje year mora nositi tocku po potrebi.
- Raspon stranica u poglavlju ('str. 15 � 141.') ima spaciranu crticu ostecenu pdftotext-om; u expected je normaliziran u 'str. 15-141.'.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `de34916f3dda...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs vef "Daniel Risavi"`.
