# Citatni spec: mef (outcome: custom-spec, status: verified)

Stil: **MEF autor-godina (sluzbeni Pravilnik o diplomskom radu)** (token `mef`)
Izvor: Pravilnik o diplomskom radu Medicinskog fakulteta u Zagrebu (upute za citiranje literature) (`mef-pravilnik-diplomski-2023`)
Snapshot: `data/sources/mef/mef-pravilnik-diplomski-2023.pdf` (hash `2f1e177187c7...`)

## knjiga  [str. 27] (derived)
Otvori PDF: `data/sources/mef/mef-pravilnik-diplomski-2023.pdf#page=27`
```
TEMPLATE: {authors} ({year}) {title}. {place}: {publisher}.
QUOTE   : Autor (2010a, b, c). Ako je rijec o knjizi, navodi se autor (godina) Naslov knjige, mjesto   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Pravilo prozom (str. 27): 'autor (godina) Naslov knjige, mjesto izdanja, izdavac'. Bez potpunog worked-examplea za knjigu u ekstrakciji. Interpunkcija '{place}: {publisher}' izvedena iz primjera poglavlja na str. 28 ('Springfield: Thomas'); prozna varijanta sa zarezom ('{place}, {publisher}') je druga moguca interpretacija, potvrditi pri verifikaciji.
```

## poglavlje  [str. 28] (derived)
Otvori PDF: `data/sources/mef/mef-pravilnik-diplomski-2023.pdf#page=28`
```
TEMPLATE: {authors} ({year}) {title}. U: {editor} (Ur.) {container}. {place}: {publisher}[[, str. {pages}]].
QUOTE   : Haymaker W, Adams RD (Ur.) Histology and Histopathology of the Nervous System.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Worked-example za poglavlje je u ekstrakciji ODSJECEN: vidljiv je samo dio s urednicima i knjigom 'Haymaker W, Adams RD (Ur.) Histology and Histopathology of the Nervous System. Springfield: Thomas, str. 3-145.' (str. 28). Redoslijed autor, godina, naslov poglavlja, urednici, naslov knjige, mjesto, izdavac dolazi iz pravila prozom (str. 27). Spojnica 'U:' NIJE vidljiva u ekstrakciji, izvedena je iz domacega obicaja; oznaka urednika '(Ur.)' s velikim U i tockom je iz primjera. Urednici se upisuju u obliku 'Prezime, I.' odvojeni tockom sa zarezom. Potvrditi pocetak primjera protiv PDF-a pri verifikaciji.
```

## clanak  [str. 28] (worked-example)
Otvori PDF: `data/sources/mef/mef-pravilnik-diplomski-2023.pdf#page=28`
```
TEMPLATE: {authors} ({year}) {title}. {container}[[ {volume}:{pages}]][[ doi:{doi}]]
QUOTE   : Slifka MK, Whitton JL (2000) Clinical implications of dysregulated cytokine production. J   [grep: OK]
IZVOR   : Slifka MK, Whitton JL (2000) Clinical implications of dysregulated cytokine production. J Mol Med doi:10.1007/s001090000086
RENDER  : Slifka MK, Whitton JL (2000) Clinical implications of dysregulated cytokine production. J Mol Med doi:10.1007/s001090000086
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Jedini potpuni worked-example je clanak u tisku (advanced online access) s doi, bez volumena i stranica; u ekstrakciji prelomljen u dva retka (nastavak: 'Mol Med doi:10.1007/s001090000086'). Za obican clanak pravilo prozom (str. 27) trazi uobicajenu skracenicu casopisa, volumen te pocetnu i zavrsnu stranicu; separator '{volume}:{pages}' je IZVEDEN (nije vidljiv potpun primjer s volumenom), potvrditi pri verifikaciji. Autori: svi, prezime pa inicijali bez tocaka ('Slifka MK, Whitton JL').
```

## mrezni  [str. 27] (derived)
Otvori PDF: `data/sources/mef/mef-pravilnik-diplomski-2023.pdf#page=27`
```
TEMPLATE: {authors} ({year}) {title}. {url}
QUOTE   : mreznoj stranici, navodi se toc na adresa mrezne stranice.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor izrijekom trazi samo tocnu adresu mrezne stranice; oblik 'autor (godina) naslov' izveden iz opceg autor-godina obrasca popisa literature. Datum pristupa se u izvoru NE spominje, pa accessDate ostaje iskljucen. Potvrditi pri verifikaciji.
```

## zavrsni  [str. 27] (derived)
Otvori PDF: `data/sources/mef/mef-pravilnik-diplomski-2023.pdf#page=27`
```
TEMPLATE: {authors} ({year}) {title}. {place}: {institution}.
QUOTE   : Autor (2010a, b, c). Ako je rijec o knjizi, navodi se autor (godina) Naslov knjige, mjesto   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Pravilnik NE obraduje citiranje zavrsnih/diplomskih radova; predlozak izveden iz oblika za knjigu (ustanova umjesto izdavaca). Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 27] (derived)
Otvori PDF: `data/sources/mef/mef-pravilnik-diplomski-2023.pdf#page=27`
```
TEMPLATE: {authors} ({year}) {title}. {container}[[ {issue}]].
QUOTE   : Kako se toc no pisu literaturni navodi u popisu literature? Prvo, navode se abecednim   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Pravilnik NE obraduje citiranje propisa (medicinski izvori); predlozak izveden iz opceg autor-godina obrasca popisa literature (donositelj kao autor, sluzbeno glasilo kao container, broj glasila u issue). Potvrditi ili oboriti pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort} {year})   /  s pages: (nema)
RENDER   : (Lovric 1988)   /  (Lovric 1988)
QUOTE    : autora). Primjer: ,,Na vaznost ovog procesa prvi je ukazao Veliki Uc itelj (Uc itelj 1956),   [grep: OK]
NAPOMENA : Autor-godina BEZ zareza: '(Uc itelj 1956)'. Dva autora s '&': '(Sumnjalo & Kritic ar 1960)' (str. 26). Tri i vise autora 'et al.': 'Suradnik et al. 1970' (str. 27). Vise navoda u istoj zagradi odvaja se tockom sa zarezom: '(Uc enik 1965; Uc enik & Suradnik 1966; ...)'. Vise radova istog autora iz iste godine pise se 'Autor (2010a, b, c)' (str. 27); a/b/c sufiks je izvan dosega generatora.
```

## Kontradikcije / otvorena pitanja
- Proza na str. 27 nabraja elemente zarezima ('Naslov knjige, mjesto izdanja, izdavac'), a primjer poglavlja na str. 28 pokazuje 'Mjesto: Izdavac'; predlosci slijede primjer (dvotocka), proznu varijantu treba oboriti ili potvrditi pri verifikaciji.
- Primjer poglavlja na str. 28 je u ekstrakciji odsjecen (nedostaje pocetak s autorom, godinom i naslovom poglavlja); spojnica 'U:' i tocan oblik prvog dijela NISU dokazani ekstrakcijom.
- Separator volumen:stranice za obican clanak nije vidljiv u ekstrakciji (jedini potpuni primjer je clanak u tisku s doi); '{volume}:{pages}' je izvedeno.
- Doktorska razina: mef-naputci-tehnicka-obrada-doktorski-2022 (str. 1) upucuje 'Popis literature (prema naputcima Liječničkog vjesnika)'. To nije imenovani standardni stil s dopustenog popisa tokena (Lijecnicki vjesnik slijedi ICMJE/Vancouver obitelj, ali izvor to ne imenuje), pa NIJE pinano; ovaj spec pokriva diplomski rad.
- Prior profila je bio ['harvard','vancouver']: diplomski izvor propisuje vlastitu autor-godina varijantu (harvardska obitelj, ali citatnica bez zareza i s '&', inicijali bez tocaka), a vancouver trag postoji samo posredno preko Lijecnickog vjesnika za doktorski.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `2f1e177187c7...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs mef "Daniel Risavi"`.
