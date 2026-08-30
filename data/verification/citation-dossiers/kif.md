# Citatni spec: kif (outcome: custom-spec, status: verified)

Stil: **APA autor-godina, hrvatska prilagodba (službene upute KIF)** (token `kif`)
Izvor: Upute za izradu diplomskog/specijalističkog diplomskog rada (Kineziološki fakultet Sveučilišta u Zagrebu) (`kif-upute-diplomski-2023`)
Snapshot: `data/sources/kif/kif-upute-diplomski-zavrsni.pdf` (hash `aa87190f7f1f...`)

## knjiga  [str. 16] (worked-example)
Otvori PDF: `data/sources/kif/kif-upute-diplomski-zavrsni.pdf#page=16`
```
TEMPLATE: {authors} ({year}). {title}. {place}: {publisher}.
QUOTE   : Kessler, M. (2003). Epidemiološke studije. Zagreb: Školska knjiga.   [grep: OK]
IZVOR   : Kessler, M. (2003). Epidemioloske studije. Zagreb: Skolska knjiga.
RENDER  : Kessler, M. (2003). Epidemioloske studije. Zagreb: Skolska knjiga.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Knjiga s dva autora: 'Babi, V. i Snajder, V. (2000). Atletika. Zagreb: Kinezioloski fakultet.' (str. 16), autori povezani s ' i ' bez zareza. Urednicka knjiga dodaje '(ur.).' iza imena: 'Leonard, W. R. i Crawford, M. H. (ur.). (2002). ...' (str. 16); inicijali s tockom i razmakom (W. R.). Puna imena autora nisu u izvoru pa se u inputu ne izmisljaju. Naslov u izvorniku kurzivom, alat radi plain text.
```

## poglavlje  [str. 17] (worked-example)
Otvori PDF: `data/sources/kif/kif-upute-diplomski-zavrsni.pdf#page=17`
```
TEMPLATE: {authors} ({year}). {title}. U {editor} (ur.), {container}[[ (str. {pages})]]. {place}: {publisher}.
QUOTE   : Tokić, M. (2014). Platonova gimnastika. U I. Zagorac (ur.), O sportu drugačije   [grep: OK]
IZVOR   : Toki, M. (2014). Platonova gimnastika. U I. Zagorac (ur.), O sportu drugacije (str. 25-34). Zagreb: Hrvatsko filozofsko drustvo.
RENDER  : Toki, M. (2014). Platonova gimnastika. U I. Zagorac (ur.), O sportu drugacije (str. 25-34). Zagreb: Hrvatsko filozofsko drustvo.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Nastavak primjera u izvoru: '(str. 25-34). Zagreb: Hrvatsko filozofsko drustvo.' Urednik se pise u obliku inicijal pa prezime (I. Zagorac) i upisuje doslovno u polje editor; 'U' bez dvotocke, '(ur.)' s tockom. Rad u zborniku skupa slijedi isti obrazac: Swalgin i sur. primjer s dva urednika 'U D. Milanovi i G. Sporis (ur.), Integrative Power of Kinesiology (str. 753-754). Zagreb: Kinezioloski fakultet Sveucilista u Zagrebu.' (str. 17).
```

## clanak  [str. 17] (worked-example)
Otvori PDF: `data/sources/kif/kif-upute-diplomski-zavrsni.pdf#page=17`
```
TEMPLATE: {authors} ({year}). {title}. {container}, {volume}[[({issue})]], {pages}.[[ {doiUrl}]]
QUOTE   : Bezjak, R. i Cecić Erpič, S. (2021). The relationship between actual and self-per-   [grep: OK]
IZVOR   : Bezjak, R. i Ceci Erpic, S. (2021). The relationship between actual and self-perceived physical fitness in adolescence. Kinesiology, 53(1), 37-46. https://doi.org/10.26582/k.53.1.5
RENDER  : Bezjak, R. i Ceci Erpic, S. (2021). The relationship between actual and self-perceived physical fitness in adolescence. Kinesiology, 53(1), 37-46. https://doi.org/10.26582/k.53.1.5
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Primjer prelomljen u izvoru; cjelina: '... self-perceived physical fitness in adolescence. Kinesiology, 53(1), 37-46. https://doi.org/10.26582/k.53.1.5'. Izvor izrijekom: 'naslov casopisa i volumen se pisu u kurzivu' (alat radi plain text) i 'ako ne postoji DOI, iza broja stranice ne pise se nista' (str. 17), pa je DOI opcionalna grupa bez tocke na kraju. Popis literature za 3+ autora nije primjerom pokazan (u tekstu ide prvi autor + 'i suradnici').
```

## mrezni  [str. 16] (derived)
Otvori PDF: `data/sources/kif/kif-upute-diplomski-zavrsni.pdf#page=16`
```
TEMPLATE: {authors} ({year}). {title}.[[ {container}.]] {url}
QUOTE   : le izvore možete konzultirati ovu stranicu ili priručnik Publication Manual of the   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor nema primjer mrezne stranice; za ostale izvore upucuje na APA stranicu i prirucnik Publication Manual of the American Psychological Association prema kojem su upute radene. Predlozak izveden iz tog APA obrasca i iz nacina navodenja URL-a u primjeru clanka (URL na kraju, bez tocke iza). {container} je naziv stranice ili organizacije. Datum pristupa nije evidentiran u izvoru pa accessed nije ukljucen. Potvrditi pri verifikaciji.
```

## zavrsni  [str. 17] (worked-example)
Otvori PDF: `data/sources/kif/kif-upute-diplomski-zavrsni.pdf#page=17`
```
TEMPLATE: {authors} ({year}). {title} ({container}). {institution}, {place}.
QUOTE   : izvedbe u futsalu (doktorska disertacija). Kineziološki fakultet, Zagreb.   [grep: OK]
IZVOR   : Nemci, T. (2019). Oblikovanje i vrednovanje notacijskog sustava za analizu izvedbe u futsalu (doktorska disertacija). Kinezioloski fakultet, Zagreb.
RENDER  : Nemci, T. (2019). Oblikovanje i vrednovanje notacijskog sustava za analizu izvedbe u futsalu (doktorska disertacija). Kinezioloski fakultet, Zagreb.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Sekcija izvora: 'KAKO NAVODITI DOKTORSKE, MAGISTARSKE I DIPLOMSKE RADNJE'. Polje container nosi vrstu rada iz primjera ('doktorska disertacija'); za diplomski rad upisuje se 'diplomski rad', sto je izvedeno iz naslova sekcije jer je jedini worked-example doktorska disertacija. Izvor daje i varijantu kroz bazu Dabar: umjesto '{institution}, {place}' ide naziv repozitorija ('Repozitorij Kinezioloskog fakulteta Sveucilista u Zagrebu KIFoREP.', str. 17); nacrt koristi osnovnu varijantu.
```

## propis  [str. 15] (derived)
Otvori PDF: `data/sources/kif/kif-upute-diplomski-zavrsni.pdf#page=15`
```
TEMPLATE: {title} ({year}). {container}[[, {issue}]].
QUOTE   : Kineziološkom fakultetu koristi se American Psychological Association APA stil ci-   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor uopce ne obraduje citiranje propisa; predlozak izveden iz opceg APA obrasca (naslov na mjestu autora, godina, sluzbeno glasilo u polju container, broj u issue, npr. Narodne novine). Hrvatska prilagodba APA za propise nije evidentirana u izvoru. Potvrditi ili oboriti pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: ({authorsShort}, {year}, str. {pages})
RENDER   : (Lovric, 1988)   /  (Lovric, 1988, str. 45)
QUOTE    : Različiti epidemiološki uzorci pokazuju da... (Kessler, 2003).   [grep: OK]
NAPOMENA : Izvor daje i narativni oblik 'Kessler (2003) je otkrio da...'. Dva autora: '(Babi i Snajder, 2000)' (str. 16). Tri i vise autora: '(Cigrovski i suradnici, 2020)' (str. 17); pravilo u izvoru kaze 'navodi se prvi autor i et al', ali primjeri koriste 'i suradnici' pa nacrt slijedi primjer. withPagesTemplate je IZVEDEN: izvor pokazuje samo narativni oblik doslovnog citata s '(str. 129)' iza navodnika (str. 15, Milanovi 2013), kombinirani parenteticki oblik nije evidentiran; potvrditi pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Prior iz profila je apa7/harvard; izvor izrijekom propisuje APA stil ali bez izdanja, a primjeri su hrvatska prilagodba starijeg APA oblika (knjiga s 'Mjesto: Izdavac', veznik 'i' umjesto '&', 'U ... (ur.),' i 'str.'), pa je nacrt custom-spec iz primjera, ne cisti apa7 pin. Harvard nije evidentiran u izvoru.
- Pravilo za clanke s tri i vise autora glasi 'u tekstu: navodi se prvi autor i et al' (str. 17), ali oba worked-example primjera koriste 'i suradnici' ('(Cigrovski i suradnici, 2020).'); nacrt slijedi primjer, etAlText je 'i suradnici'.
- Mrezni izvori i propisi nemaju primjer u ekstrakciji; predlosci su izvedeni (derived) iz APA obrasca koji izvor imenuje i cekaju potvrdu.
- withPagesTemplate je izveden: izvor pokazuje samo narativni oblik doslovnog citata s '(str. 129)' iza navodnika, kombinirani parenteticki oblik s godinom i stranicom nije evidentiran.
- Skracivanje popisa autora u literaturi nije evidentirano (primjer zbornika navodi sva 4 autora bez kracenja) pa etAl polja u authorFormat nisu postavljena.
- Kurziv (naslov casopisa i volumen, izvor izrijekom str. 17; naslovi knjiga u primjerima) alat ne reproducira, izlaz je plain text; viseca uvlaka popisa literature (str. 16) je formatiranje izvan dosega generatora.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `aa87190f7f1f...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs kif "Daniel Risavi"`.
