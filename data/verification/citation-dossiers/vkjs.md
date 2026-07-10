# Citatni spec: vkjs (outcome: custom-spec, status: draft)

Stil: **APA autor-godina (sluzbene upute VKJS)** (token `apa7`)
Izvor: Upute za izradu zavrsnog i diplomskog rada (Veleuciliste kriminalistike i javne sigurnosti) (`vkjs-upute-zavrsni-diplomski-2024`)
Snapshot: `data/sources/vkjs/vkjs-upute-zavrsni-diplomski-2024.pdf` (hash `630384c031cc...`)

## knjiga  [str. 11] (derived)
Otvori PDF: `data/sources/vkjs/vkjs-upute-zavrsni-diplomski-2024.pdf#page=11`
```
TEMPLATE: {authors} ({year}). {title}. {place}: {publisher}.
QUOTE   : Kod koristenja knjiga kao izvora za zavrsne i diplomske radove za knjigu je osim autora   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvedeno iz opisnog pravila za knjige (str. 11): osim autora (ili urednika ako autor nije poznat), naslova i godine objave potrebno je navesti i mjesto izdavanja te izdavaca; za knjige izdane u Hrvatskoj dovoljno je mjesto. Worked-example za knjigu je u ekstrakciji odsjecen (str. 11 zavrsava na 'Knjiga s jednim autorom Primjer'). Predlozak slijedi standardni APA oblik 'Prezime, I. (godina). Naslov. Mjesto: Izdavac.'; elementi odvojeni tockom (pravilo 6, str. 7); naslov knjige u izvorniku kurzivom. Potvrditi mjesto:izdavac interpunkciju pri verifikaciji.
```

## poglavlje  [str. 9] (derived)
Otvori PDF: `data/sources/vkjs/vkjs-upute-zavrsni-diplomski-2024.pdf#page=9`
```
TEMPLATE: {authors} ({year}). {title}. U: {editor} (ur.), {container}[[ (str. {pages})]]. {place}: {publisher}.
QUOTE   : navoenjem imena autora (ili urednika) i godinom publikacije.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor spominje urednika kao nositelja natuknice (str. 9) ali NEMA worked-example za poglavlje u zborniku/knjizi. Predlozak 'U: {editor} (ur.), {container} (str. {pages}). {place}: {publisher}.' izveden je iz standardne APA konvencije i iz knjiznog oblika ovog izvora; potvrditi veznik ('U:'), oblik urednika (Prezime, I.) i skracenicu '(ur.)' pri verifikaciji.
```

## clanak  [str. 9] (worked-example)
Otvori PDF: `data/sources/vkjs/vkjs-upute-zavrsni-diplomski-2024.pdf#page=9`
```
TEMPLATE: {authors} ({year}). {title}. {container}, {volume}[[({issue})]], {pages}.
QUOTE   : Slanger, W. D., Berg, E. A., Fisk, P. S., & Hanson, M. G. (2015). A Longitudinal Cohort Study of   [grep: OK]
IZVOR   : Slanger, W. D., Berg, E. A., Fisk, P. S., & Hanson, M. G. (2015). A Longitudinal Cohort Study of Student Motivational Factors Related to Academic Success and Retention Using the College Student Inventory. Journal of College Student Retention: Research, Theory & Practice, 17(3), 278-302.
RENDER  : Slanger, W. D., Berg, E. A., Fisk, P. S., & Hanson, M. G. (2015). A Longitudinal Cohort Study of Student Motivational Factors Related to Academic Success and Retention Using the College Student Inventory. Journal of College Student Retention: Research, Theory & Practice, 17(3), 278-302.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: APA clanak: autori (Prezime, I. I.), (godina). Naslov clanka. Naziv casopisa, volumen(broj), raspon stranica. Vise autora: zarez izmedu, ', & ' prije zadnjeg (Slanger, str. 9; isto Graunke str. 9, Gorr/Hardgrave str. 10). Naziv casopisa i volumen u izvorniku kurzivom (alat plain text). Broj sveska (issue) opcionalan.
```

## mrezni  [str. 11] (worked-example)
Otvori PDF: `data/sources/vkjs/vkjs-upute-zavrsni-diplomski-2024.pdf#page=11`
```
TEMPLATE: {authors}. ({year}). {title}. Preuzeto s {url}
QUOTE   : Ministarstvo znanosti i obrazovanja [MZO]. (2017). Strategija obrazovanja, znanosti i   [grep: OK]
IZVOR   : Ministarstvo znanosti i obrazovanja [MZO]. (2017). Strategija obrazovanja, znanosti i tehnologije. Preuzeto s http://narodne-novine.nn.hr/clanci/sluzbeni/2014_10_124_2364.html
RENDER  : Ministarstvo znanosti i obrazovanja [MZO]. (2017). Strategija obrazovanja, znanosti i tehnologije. Preuzeto s http://narodne-novine.nn.hr/clanci/sluzbeni/2014_10_124_2364.html
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Mrezni/organizacijski izvor: Autor. (godina). Naslov. Preuzeto s URL (primjer korporativnog autora Ministarstvo znanosti i obrazovanja [MZO], str. 11). Autor moze biti tijelo/ustanova (bez inicijala) uz kraticu u uglatoj zagradi. Izvor ne navodi datum pristupa za web pa je izostavljen. Naslov dokumenta u izvorniku kurzivom (alat plain text).
```

## zavrsni  [str. 7] (derived)
Otvori PDF: `data/sources/vkjs/vkjs-upute-zavrsni-diplomski-2024.pdf#page=7`
```
TEMPLATE: {authors} ({year}). {title} (zavrsni rad). {place}: {institution}.
QUOTE   : zavrsnih/diplomskih radova na Veleucilistu kriminalistike i javne sigurnosti koristi se APA stil.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor NE daje worked-example za citiranje zavrsnog/diplomskog rada. Cijeli dokument propisuje APA stil (str. 7). Predlozak izveden iz standardnog APA oblika za neobjavljene radove 'Prezime, I. (godina). Naslov (zavrsni rad). Mjesto: Ustanova.'; potvrditi tocan naziv vrste rada i interpunkciju pri verifikaciji.
```

## propis  [str. 11] (worked-example)
Otvori PDF: `data/sources/vkjs/vkjs-upute-zavrsni-diplomski-2024.pdf#page=11`
```
TEMPLATE: {title}, {container} {issue}
QUOTE   : Zakon o kaznenom postupku, NN 152/08, 76/09, 80/11, 121/11, 91/12, 143/12, 56/13, 145/13,   [grep: OK]
IZVOR   : Zakon o kaznenom postupku, NN 152/08, 76/09, 80/11, 121/11, 91/12, 143/12, 56/13, 145/13, 152/14, 70/17, 126/19, 126/19, 130/20, 80/22
RENDER  : Zakon o kaznenom postupku, NN 152/08, 76/09, 80/11, 121/11, 91/12, 143/12, 56/13, 145/13, 152/14, 70/17, 126/19, 126/19, 130/20, 80/22
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Pravni izvor u popisu literature: 'Naziv zakona, NN brojevi' (primjer Zakon o kaznenom postupku, str. 11). Bez donositelja kao autora i bez clanka/stavka (kratica u uglatoj zagradi te cl./st. idu samo u tekst, str. 11). 'NN' je kratica sluzbenog glasila; svi brojevi izmjena i dopuna idu u {issue}. U izvoru bibliografski redak nema zavrsnu tocku.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: ({authorsShort}, {year}, {pages})
RENDER   : (Lovric, 1988)   /  (Lovric, 1988, 45)
QUOTE    : domeni obrazovanja (Gorr, Nagin i Szczypula, 1994; Hardgrave, Wilson i Walstrom, 1994).   [grep: OK]
NAPOMENA : APA autor-godina u zagradama (prezime autora, godina); izvor se navodi u tekstu, ne u fusnotama (str. 7). S brojem stranice broj se uvodi kao ', {pages}' bez 'str.' i bez dvotocke, npr. '(Zeki-Susac, Frajman-Jaksi, Drvenkar, 2009, 315)' (str. 8). Vise izvora odvaja se tocka-zarezom, po abecednom redu (str. 10). Za 3, 4 ili 5 autora prvi navod nabraja sve, dalje prvi autor + 'i ostali'; za vise od sest autora uvijek prvi + 'i ostali' (str. 9); generator daje jedinstveni oblik (do 5 nabrojeno, od 6 skraceno na 'i ostali').
```

## Kontradikcije / otvorena pitanja
- Izvor izricito imenuje APA stil i upucuje na apastyle.apa.org (str. 7), sto se slaze s PRIOR-om ['apa7']; buduci da izvor daje i VLASTITE worked-example primjere, nacrt je custom-spec izgraden iz tih primjera, ne goli style-pin.
- Spojnica prije zadnjeg autora nekonzistentna u izvoru: vecina primjera koristi ', & ' (Graunke str. 9, Slanger str. 9, Gorr i Hardgrave str. 10), ali dva primjera koriste samo zarez bez '&' (Zeki-Susac str. 8, Simeunovic str. 10); odabran ', & ' (APA standard) i worked-example s ampersandom.
- In-text spojnica za vise autora nekonzistentna: vecina koristi ' i ' prije zadnjeg (Gorr/Szczypula str. 10, Slanger str. 9), ali parenteticki Zeki-Susac koristi samo zareze (str. 8); odabran ' i '.
- In-text et al prag: izvor razlikuje prvi navod (3-5 autora svi) od kasnijih ('i ostali'), a 6+ uvijek 'i ostali' (str. 9); staticki generator daje jedinstveni oblik (nabraja do 5, od 6 skracuje) i ne moze razlikovati prvi od kasnijih navoda.
- Worked-example za knjigu je u ekstrakciji odsjecen (str. 11 zavrsava na 'Knjiga s jednim autorom Primjer'); knjiga je izvedena iz opisnog pravila (str. 11). Poglavlje i zavrsni rad nemaju worked-example pa su izvedeni iz standardnog APA oblika (kind derived).
- Naslovi knjiga, casopisa i web dokumenata su u APA izvorniku kurzivom (str. 7, pravilo 5); alat radi plain text pa je kurziv izostavljen (napomena na stranici alata).
- sourcePage je preuzet iz tagova isjecaka (str. N); propis i knjiga padaju pod tag 'str. 11' iako sekcija pravnih izvora u PDF-u prelazi na sljedecu stranicu.

## Odluka
- [ ] approve sve
- [ ] --flag <sourceTypes> (pojedini predlosci u needs-recheck)
- [ ] odbaci / prekvalificiraj outcome

Naredba: `node scripts/approve-citation-spec.mjs vkjs "Daniel Risavi" [--flag clanak,mrezni] [--dry]`
