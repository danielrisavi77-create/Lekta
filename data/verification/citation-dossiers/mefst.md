# Citatni spec: mefst (outcome: custom-spec, status: draft)

Stil: **Vancouver numericko (sluzbena Uputa MEFST)** (token `mefst`)
Izvor: Uputa za oblikovanje diplomskoga rada (MEFST, 2021) (`mefst-uputa-diplomski-2021`)
Snapshot: `data/sources/mefst/mefst-uputa-diplomski-2021.pdf` (hash `cf9fae26b635...`)

## knjiga  [str. 16] (derived)
Otvori PDF: `data/sources/mefst/mefst-uputa-diplomski-2021.pdf#page=16`
```
TEMPLATE: {authors}. {title}.[[ {volume} izdanje.]] {place}: {publisher}; {year}.
QUOTE   : Prezime1 I1, Prezime2 I2. Naslov poglavlja. U: Autorknjigeprezime1 I1, Autorknjigeprezime2   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Uputa IMA zasebnu sekciju Knjiga (sadrzaj, str. 15 dokumenta), ali ta stranica NIJE u ekstrakciji. Predlozak izveden iz verbalnog predloska za poglavlje knjige na str. 16 (isti rep: 'Naslov knjige. Izdanje. Mjesto: Izdavac; godina.') ispustanjem dijela o poglavlju i urednicima, u skladu s Vancouver stilom. Broj izdanja upisuje se u polje volume onako kako se zeli ispisati ('Drugo' ili '2.'), jer primjer poglavlja izdanje pise rijecju. Potvrditi protiv PDF-a pri verifikaciji.
```

## poglavlje  [str. 16] (worked-example)
Otvori PDF: `data/sources/mefst/mefst-uputa-diplomski-2021.pdf#page=16`
```
TEMPLATE: {authors}. {title}. U: {editor}, urednici. {container}.[[ {volume} izdanje.]] {place}: {publisher}; {year}.[[ str. {pages}.]]
QUOTE   : Blaxter PS, Farnsworth TP. Social health and class inequalities. U: Carter C, Peel JR, urednici.   [grep: OK]
IZVOR   : Blaxter PS, Farnsworth TP. Social health and class inequalities. U: Carter C, Peel JR, urednici. Equalities and inequalities in health. Drugo izdanje. London: Academic Press; 1976. str. 165-78.
RENDER  : Blaxter PS, Farnsworth TP. Social health and class inequalities. U: Carter C, Peel JR, urednici. Equalities and inequalities in health. Drugo izdanje. London: Academic Press; 1976. str. 165-78.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Sekcija 'Poglavlje knjige', 'Primjer u konacnom formatu'. Verbalni predlozak na istoj stranici: 'Prezime1 I1, Prezime2 I2. Naslov poglavlja. U: Autorknjigeprezime1 I1, Autorknjigeprezime2 I2, urednici. Naslov knjige. Izdanje. Mjesto: Izdavac; godina. str. kratka paginacija.' Urednici se upisuju doslovno u polje editor u obliku 'Prezime I' odvojeni zarezom ('Carter C, Peel JR'). Izdanje se u primjeru pise rijecju ('Drugo izdanje'), pa polje volume prima doslovan oblik. Paginacija kracena (165-78).
```

## clanak  [str. 13] (worked-example)
Otvori PDF: `data/sources/mefst/mefst-uputa-diplomski-2021.pdf#page=13`
```
TEMPLATE: {authors}. {title}. {container}. {year};{volume}:{pages}.
QUOTE   : Primjer (Pubmed): Zivkovic PM, Matetic A, Tadin Hadjina I, Rusic D, Vilovic M, Supe-   [grep: OK]
IZVOR   : Zivkovic PM, Matetic A, Tadin Hadjina I, Rusic D, Vilovic M, Supe-Domic D i sur. Serum Catestatin Levels and Arterial Stiffness Parameters Are Increased in Patients with Inflammatory Bowel Disease. J Clin Med. 2020;9:628.
RENDER  : Zivkovic PM, Matetic A, Tadin Hadjina I, Rusic D, Vilovic M, Supe-Domic D. Serum Catestatin Levels and Arterial Stiffness Parameters Are Increased in Patients with Inflammatory Bowel Disease. J Clin Med. 2020;9:628.
VERDIKT : DIFF (deklariran)  <-- USPOREDI ZNAK PO ZNAK
DEKLARIRANO: Izvorni primjer iza sestog autora ima 'i sur.' jer clanak ima vise od 6 autora, a ekstrakcija imena preostalih autora ne sadrzi; input zato navodi samo 6 vidljivih autora pa render (etAlAfter 6) ispravno NE dodaje 'i sur.'. Razlika je iskljucivo taj dodatak.
NAPOMENA: Sekcija 'Publikacije' propisuje redoslijed prozom: prezime + inicijal bez tocke, zarez izmedju autora, naslov u Sentence case, skraceni naziv casopisa bez tocaka, godina;svezak:kracena paginacija. Broj (issue) u zagradi pored sveska se NE navodi. Paginacija se krati (175-185 -> 175-85), a kada stranice nisu dostupne zamjenjuje je broj rada (npr. 120456 ili e3440). Uputa uz Pubmed primjer trazi da se Title Case naslova ispravi prema hrvatskom pisanju; alat naslov ne mijenja.
```

## mrezni  [str. 16] (worked-example)
Otvori PDF: `data/sources/mefst/mefst-uputa-diplomski-2021.pdf#page=16`
```
TEMPLATE: {authors}. {title} [Internet]. {place}: {publisher}; {year} [citirano {accessed}]. Dostupno na: {url}
QUOTE   : Diabetes Australia. Diabetes globally [Internet]. Canberra ACT: Diabetes Australia; 2012   [grep: OK]
IZVOR   : Diabetes Australia. Diabetes globally [Internet]. Canberra ACT: Diabetes Australia; 2012 [citirano 5. studenog 2012.]. Dostupno na: http://www.diabetesaustralia.com.au/en/Understanding-Diabetes/DiabetesGlobally/
RENDER  : Diabetes Australia. Diabetes globally [Internet]. Canberra ACT: Diabetes Australia; 2012 [citirano 5. studenog 2012.]. Dostupno na: http://www.diabetesaustralia.com.au/en/Understanding-Diabetes/DiabetesGlobally/
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Sekcija 'Pocetna stanica, Homepage', 'Primjer u konacnom formatu'. Verbalni predlozak na istoj stranici: 'Autor/naziv organizacije. Naslov stranice [Internet]. Mjesto izdavanja: Izdavac; godina publiciranja [citirano DD mjesec GGGG]. Dostupno na: url bez hyperlinka'. Organizacijski autor bez prepoznate kljucne rijeci upisuje se sa zavrsnim zarezom ('Diabetes Australia,') da ostane doslovan. Postoji i varijanta 'Dio web stranice' (AMA primjer, ista stranica) s drugacijim redoslijedom koju ovaj predlozak ne izrazava.
```

## zavrsni  [str. 1] (derived)
Otvori PDF: `data/sources/mefst/mefst-uputa-diplomski-2021.pdf#page=1`
```
TEMPLATE: {authors}. {title} [diplomski rad]. {place}: {institution}; {year}.
QUOTE   : Disertacije............................................................................................................................. 16   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Uputa IMA sekciju Disertacije (sadrzaj, str. 16 dokumenta), ali njezin tekst NIJE u ekstrakciji. Predlozak izveden iz opceg Vancouver (NLM) obrasca za disertacije i teze (oznaka vrste rada u uglatoj zagradi) uz interpunkcijski rep 'Mjesto: Ustanova; godina.' preuzet iz ostalih MEFST predlozaka; alat koristi oznaku [diplomski rad] kao default. Potvrditi protiv PDF-a pri verifikaciji.
```

## propis  [str. 13] (derived)
Otvori PDF: `data/sources/mefst/mefst-uputa-diplomski-2021.pdf#page=13`
```
TEMPLATE: {title}. {container}[[ {issue}]].
QUOTE   : Literatura se navodi Vancouver stilom kako je prikazano. Literatura bi trebala poglavito biti   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Uputa NE obraduje citiranje pravnih propisa (biomedicinski diplomski rad); predlozak izveden iz domace prakse navodenja propisa unutar numerickog popisa (naslov propisa, sluzbeno glasilo kao container, broj glasila u issue). Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Prag kracenja autora nije izrijekom naveden u ekstrakciji; Pubmed primjer pokazuje 6 autora + 'i sur.', pa su etAlAfter/etAlKeep 6 preuzeti iz Vancouver konvencije (prvih 6 pa 'i sur.'). Potvrditi prag protiv PDF-a.
- Clanak worked-example ima deklarirani knownDiff: ekstrakcija ne sadrzi imena autora nakon sestog, pa render s 6 autora nema zavrsni 'i sur.' iz izvornog primjera.
- Sekcije Knjiga i Disertacije postoje u sadrzaju uputa (str. 15 i 16 dokumenta), ali te stranice nisu u ekstrakciji; predlosci za knjigu i zavrsni rad su izvedeni (derived), ne dokazani primjerom.
- Oblik broja u samom popisu literature nije prikazan u ekstrakciji (vidljiva je samo geometrija: brojka na 0 cm, uvlaka 0,8 cm); referenceMarker '({n})' je preslikan iz okruglih zagrada in-text navoda.
- Mrezni izvori imaju dvije varijante ('Pocetna stanica, Homepage' i 'Dio web stranice' s drugacijim redoslijedom); jedan predlozak izrazava samo homepage oblik, AMA primjer dijela stranice ostaje nepokriven.
- Uputa trazi ispravljanje Title Case naslova clanaka prema hrvatskom pisanju (Sentence case); alat unos naslova ne mijenja, a Pubmed primjer u izvoru namjerno pokazuje neispravljeni oblik.
- Prior profila ['vancouver'] je POTVRDJEN: izvor izrijekom kaze 'Literatura se navodi Vancouver stilom kako je prikazano.' uz vlastite primjere, pa je umjesto style-pina izgraden custom-spec po tim primjerima.

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs mefst "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
