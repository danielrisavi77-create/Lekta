# Citatni spec: efos (outcome: custom-spec, status: verified)

Stil: **Harvardski stil autor-godina (sluzbene upute EFOS)** (token `efos`)
Izvor: Upute za izradu studentskih radova na Ekonomskom fakultetu u Osijeku (`efos-upute-studentski-2023`)
Snapshot: `data/sources/efos/efos-upute-studentski-2023.docx` (hash `1f107aa41b7a...`)

## knjiga  [str. 1] (worked-example)
Otvori PDF: `data/sources/efos/efos-upute-studentski-2023.docx#page=1`
```
TEMPLATE: {authors} ({year}). {title}. {place}: {publisher}.
QUOTE   : Milas, G. (2009). Istraživačke metode u psihologiji. Zagreb: Naklada Slap.   [grep: OK]
IZVOR   : Milas, G. (2009). Istraživačke metode u psihologiji. Zagreb: Naklada Slap.
RENDER  : Milas, G. (2009). Istraživačke metode u psihologiji. Zagreb: Naklada Slap.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Pravilo: Prezime, Prvo slovo imena. (godina). Naslov (ukosenim slovima). Mjesto: Izdavac. Dva autora veze 'and' (Granovetter, M. and Swedberg, R.), tri autora zarez pa 'and' (Zekic-Susac, Sarlija and Bensic); hrvatski veznik 'i' nije evidentiran u ekstrakciji. Online knjiga u izvoru (Sadler) koristi engleski 'Available from' obrazac, nije reproduciran. Kurziv naslova alat ne reproducira.
```

## poglavlje  [str. 1] (derived)
Otvori PDF: `data/sources/efos/efos-upute-studentski-2023.docx#page=1`
```
TEMPLATE: {authors} ({year}). {title}. {container}.[[ {editor} (ur.).]] {place}: {publisher}.[[ str. {pages}.]]
QUOTE   : Naslov publikacije (zbornika) i broj (ako postoji). Prezime i prvo slovo imena urednika (ur.). Mjesto održavanja konferencije ili skupa. Vrijeme održavanja konferencije ili skupa. Mjesto izdavanja: Izdavač. str. od-do   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor pokriva samo rad u zborniku s konferencije (worked example Zekic-Susac, Sarlija and Bensic 2008) s poljima mjesto i vrijeme odrzavanja skupa koja alat nema; predlozak je pojednostavljen na rad/poglavlje u zborniku bez podataka o skupu, pa je izveden i bez examplea (izvorni primjer se ne moze reproducirati bez polja skupa). 'str.' prema pravilu za hrvatski, engleski primjeri koriste 'pp.'.
```

## clanak  [str. 1] (worked-example)
Otvori PDF: `data/sources/efos/efos-upute-studentski-2023.docx#page=1`
```
TEMPLATE: {authors} ({year}). {title}. {container}. {volume}[[({issue})]]. str. {pages}.[[ doi:{doi}.]][[ Raspoloživo na: {url}.]][[ [pristupljeno: {accessed}].]]
QUOTE   : Ku, G. (2008). Learning to de-escalate: The effects of regret in escalation of commitment. Organizational Behavior and Human Decision Processes. 105(2). str. 221-232. doi:10.1016/j.obhdp.2007.08.002. [pristupljeno: 24. veljače 2014].   [grep: OK]
IZVOR   : Ku, G. (2008). Learning to de-escalate: The effects of regret in escalation of commitment. Organizational Behavior and Human Decision Processes. 105(2). str. 221-232. doi:10.1016/j.obhdp.2007.08.002. [pristupljeno: 24. veljače 2014].
RENDER  : Ku, G. (2008). Learning to de-escalate: The effects of regret in escalation of commitment. Organizational Behavior and Human Decision Processes. 105(2). str. 221-232. doi:10.1016/j.obhdp.2007.08.002. [pristupljeno: 24. veljače 2014].
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Tiskani primjer (Pajunen) koristi '39(4), pp. 652-669.' (zarez i pp.), online s doi (Ku) koristi '105(2). str. 221-232.'; predlozak slijedi Ku primjer i hrvatsko 'str.' iz pravila ('str.' ili na engleskom 'p'/'pp'). Online bez doi dodaje 'Raspoloživo na: URL' (Wilson primjer); oznaka [Online] i naziv baze nisu reproducirani.
```

## mrezni  [str. 1] (derived)
Otvori PDF: `data/sources/efos/efos-upute-studentski-2023.docx#page=1`
```
TEMPLATE: {authors} ({year}). {title}. [Online] Raspoloživo na: {url}. [pristupljeno: {accessed}].
QUOTE   : Wilson, J. (1995). Enter the Cyberpunk librarian: future directions in cyberspace. Library Review. [Online] Emerald Database 44 (8). str.63-72. Raspoloživo na: http://www.emeraldinsight.com. [pristupljeno: 30. siječnja 2012].   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor nema primjer za samostalnu mreznu stranicu; obrazac '[Online] Raspoloživo na: URL. [pristupljeno: datum].' izveden iz online clanka (Wilson) i online knjige (Sadler, engleski 'Available from'). Potvrditi pri verifikaciji.
```

## zavrsni  [str. 1] (derived)
Otvori PDF: `data/sources/efos/efos-upute-studentski-2023.docx#page=1`
```
TEMPLATE: {authors} ({year}). {title}. Diplomski rad. {place}: {institution}.
QUOTE   : Prezime autora ili urednika, Prvo slovo imena autora ili urednika. (godinu izdavanja). Naslov djela (ukošenim slovima). Mjesto izdavanja: Naziv izdavača.   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne obraduju citiranje zavrsnih/diplomskih radova; predlozak izveden iz opceg oblika za knjigu (izdavac -> ustanova, dodana oznaka vrste rada 'Diplomski rad'). Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 1] (derived)
Otvori PDF: `data/sources/efos/efos-upute-studentski-2023.docx#page=1`
```
TEMPLATE: {authors} ({year}). {title}. {container}[[ {issue}]].
QUOTE   : Prema Pravilniku o stegovnoj odgovornosti studenata (Senat Sveučilišta Josipa Jurja Strossmayera u Osijeku, 2010.) plagiranje tuđih radova predstavlja tešku povredu studentskih obveza   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute nemaju primjer za citiranje propisa; predlozak izveden iz harvardskog autor-godina obrasca, s donositeljem kao autorom prema uporabi u samim Uputama (Senat Sveucilista..., 2010.). Interpunkcija oko broja glasila nije evidentirana; potvrditi pri verifikaciji.
```

## Citatnica (u tekstu)
```
TEMPLATE : ({authorsShort}, {year})   /  s pages: ({authorsShort}, {year}:{pages})
RENDER   : (Lovric, 1988)   /  (Lovric, 1988:45)
QUOTE    : npr. (Milas, 2009:563). Potpunu informaciju o djelu iz kojega se uzima citat autor daje u dijelu Literatura pa će tamo biti ovako navedeno djelo:   [grep: OK]
NAPOMENA : Propisani primjeri (Milas, 2009:563) i (Smith, 2010:28) su bez razmaka iza dvotocke; dokument u vlastitom tekstu koristi i '(Badurina i dr., 2007: 313)' s razmakom, slijedimo propisane primjere. twoJoiner ', ' izveden iz uporabe 'Šundalić, Pavić (2013:237-253)' u samom izvoru; etAlText 'i dr.' iz '(Badurina i dr., 2007: 313)'; etAlAfter 3 je IZVEDEN (nema izricitog pravila), potvrditi pri verifikaciji. Stranica je 'po mogućnosti', pa osnovni oblik bez stranica postoji.
```

## Kontradikcije / otvorena pitanja
- Stil je preporucen ('preporučujemo američki (harvardski) stil'), ne izricito propisan kao obvezan; vrijedi za sve kategorije studentskih radova EFOS-a.
- Primjeri clanka su nedosljedni: tiskani (Pajunen) koristi '39(4), pp. 652-669.' a online s doi (Ku) '105(2). str. 221-232.'; predlozak slijedi Ku primjer i hrvatsko 'str.'.
- In-text: propisani primjeri (Milas, 2009:563) i (Smith, 2010:28) su bez razmaka iza dvotocke, ali dokument u vlastitom tekstu koristi '(Badurina i dr., 2007: 313)' s razmakom; predlozak slijedi propisane primjere.
- Veznik 'and' izmedu autora evidentiran je samo na engleskim primjerima; hrvatski oblik ('i') nije evidentiran u ekstrakciji.
- Oznake stranica u PDF ekstrakciji su za sve isjecke 'str. 1' (pdftotext artefakt), pa sourcePage ne razlikuje stvarne stranice dokumenta.
- Kurziv naslova (ukosenim slovima) alat ne reproducira, izlaz je plain text.
- Poglavlje, mrezni, zavrsni i propis nemaju reproducibilan primjer u izvoru; predlosci su izvedeni (derived) i cekaju potvrdu.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `1f107aa41b7a...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs efos "Daniel Risavi"`.
