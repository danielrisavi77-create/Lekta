# Citatni spec: vvg (outcome: custom-spec, status: verified)

Stil: **Numericko citiranje u uglatim zagradama (sluzbene upute VVG)** (token `vvg`)
Izvor: Upute za izradu diplomskog (zavrsnog) rada (Veleuciliste Velika Gorica) (`vvg-upute-radovi-2013`)
Snapshot: `data/sources/vvg/vvg.pdf` (hash `5d7e28333d8c...`)

## knjiga  [str. 10] (worked-example)
Otvori PDF: `data/sources/vvg/vvg.pdf#page=10`
```
TEMPLATE: {authors}: {title}, {publisher}, {year}.
QUOTE   : [1] Markovi, Marko; Ivi, Ivan: Programiranje u C jeziku, Profil d.o.o, 2008.   [grep: OK]
IZVOR   : Markovi, Marko; Ivi, Ivan: Programiranje u C jeziku, Profil d.o.o, 2008.
RENDER  : Markovi, Marko; Ivi, Ivan: Programiranje u C jeziku, Profil d.o.o, 2008.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Opci format str. 10: '[<redni broj>] <autor(i)>: <Naslov rada>, <izdavac>, <godina izdanja>'. Autori family-first ('Prezime, Ime'), vise autora odvojeno '; ', dvotocka iza autora, bez mjesta izdavanja (u primjeru [3] 'Skolska knjiga Zagreb' cijelo ide u polje izdavaca). Redni broj [1] je oznaka popisa (referenceMarker), ne dio bibliografskog retka. Vise od tri autora: prvi autor + ', i dr.' (str. 10, primjer [3] 'Grgi, Marko, i dr.: Komunikacijski sustavi, Skolska knjiga Zagreb, 2012.'; 'et al' za literaturu na stranom jeziku). Izvor dopusta i inicijale imena (primjer [2] 'Markovi, M; Ivi, I').
```

## clanak  [str. 10] (worked-example)
Otvori PDF: `data/sources/vvg/vvg.pdf#page=10`
```
TEMPLATE: {authors}: {title}. {container} {year};{volume}[[({issue})]]:{pages}.
QUOTE   : [3] Rothbaum, BO; Hodges, L: Virtual reality exposure therapy for PTSD Vietnam   [grep: OK]
IZVOR   : Rothbaum, BO; Hodges, L: Virtual reality exposure therapy for PTSD Vietnam veterans: a case study. Journal of Traumatic Stress 1999;12(2):263-71.
RENDER  : Rothbaum, BO; Hodges, L: Virtual reality exposure therapy for PTSD Vietnam veterans: a case study. Journal of Traumatic Stress 1999;12(2):263-71.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Izvor formalno navodi jedan opci format za knjige i clanke, ali primjer [3] za clanak u casopisu pokazuje zaseban vankuverski oblik: 'autori: naslov. Naziv casopisa godina;godiste(broj):stranice.' Primjer je u ekstrakciji prelomljen u dva retka (redak s 'veterans: a case study. Journal of Traumatic Stress 1999;12(2):263-71.'), spojen u expected. Inicijali imena bez tocaka ('Rothbaum, BO') doslovni su iz primjera, alat ih prenosi verbatim.
```

## mrezni  [str. 10] (rule-text)
Otvori PDF: `data/sources/vvg/vvg.pdf#page=10`
```
TEMPLATE: URL: {url}, {accessed}
QUOTE   : [<redni broj>] URL: <potpuna putanja do stranice koja je koristena u radu>, <datum   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Format za internetske sadrzaje za koje se ne zna autor(i) (str. 10-11): '[<redni broj>] URL: <potpuna putanja do stranice koja je koristena u radu>, <datum zadnjeg pristupa toj stranici>'. Oznaka 'URL:' pise se doslovno; redni broj je oznaka popisa. Izvor pod 'Primjer:' ne daje popunjen primjer u ekstrakciji pa je oblik prenesen iz formata bez izmisljanja (example: null). Mrezni izvor s poznatim autorom izvor formalno ne pokriva.
```

## poglavlje  [str. 10] (derived)
Otvori PDF: `data/sources/vvg/vvg.pdf#page=10`
```
TEMPLATE: {authors}: {title}, U: {editor} (ur.), {container}, {publisher}, {year}.
QUOTE   : [<redni broj>] <autor(i)>: <Naslov rada>, <izdavac>, <godina izdanja>   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor ne daje zaseban oblik za poglavlje u uredjenoj knjizi/zborniku. Predlozak je izveden iz opceg oblika za knjigu (str. 10) ubacivanjem urednika 'U: {editor} (ur.),' i naziva zbornika kao containera. Potvrditi ili oboriti pri verifikaciji.
```

## zavrsni  [str. 10] (derived)
Otvori PDF: `data/sources/vvg/vvg.pdf#page=10`
```
TEMPLATE: {authors}: {title}, {institution}, {year}.
QUOTE   : [<redni broj>] <autor(i)>: <Naslov rada>, <izdavac>, <godina izdanja>   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor ne obradjuje citiranje zavrsnih/diplomskih radova. Predlozak je izveden iz opceg oblika za knjigu (str. 10) zamjenom izdavaca ustanovom u kojoj je rad izradjen. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 9] (derived)
Otvori PDF: `data/sources/vvg/vvg.pdf#page=9`
```
TEMPLATE: {title}, {container}[[, br. {issue}]], {year}.
QUOTE   : ona koja je posredno utjecala na rad (npr. prirucnici, standardi).   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor spominje standarde i prirucnike kao ostalu koristenu literaturu (str. 9) ali ne daje format za propise/pravne akte. Predlozak je izveden iz uobicajenog hrvatskog oblika (naslov, glasilo, broj, godina); broj sluzbenog glasila u {issue}. Potvrditi ili oboriti pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Prior hint je 'ieee'. Izvor jest numericki stil u uglatim zagradama (srodan IEEE-u), ali propisuje vlastiti oblik jedinice: autori family-first ('Prezime, Ime' ili 'Prezime, inicijali'), dvotocka iza autora i vankuverski oblik clanka (godina;godiste(broj):stranice, primjer [3]). Zato custom-spec, ne style-pin na ieee.
- Izvor dopusta DVA oblika autora: puna imena (primjer [1] 'Markovi, Marko; Ivi, Ivan') ILI inicijale (primjer [2] 'Markovi, M; Ivi, I'; primjer [3] 'Rothbaum, BO'). Alat koristi verbatim family-first (initials:none) pa prenosi onaj oblik koji korisnik upise; oba primjera se reproduciraju.
- clanak: izvor formalno navodi jedan opci format za knjige i clanke, no primjer [3] pokazuje zaseban vankuverski oblik casopisnog clanka. Predlozak clanka je gradjen iz primjera [3].
- poglavlje, zavrsni i propis izvor ne obradjuje (derived): poglavlje izvedeno iz oblika za knjigu uz urednika i zbornik, zavrsni iz oblika za knjigu uz ustanovu, propis iz uobicajenog hrvatskog oblika za pravni akt.
- etAlText: izvor propisuje ', i dr.' za literaturu na hrvatskom i ', et al' za literaturu na stranom jeziku (str. 10); alat koristi jedan default ', i dr.'.
- mrezni: izvor daje samo oblik za internetske izvore bez poznatog autora ('URL: ...') i u ekstrakciji nema popunjen primjer (example: null); izvor s poznatim web-autorom nije formalno pokriven.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `5d7e28333d8c...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs vvg "Daniel Risavi"`.
