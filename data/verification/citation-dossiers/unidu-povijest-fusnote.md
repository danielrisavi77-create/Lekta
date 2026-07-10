# Citatni spec: unidu-povijest-fusnote (outcome: custom-spec, status: verified)

Stil: **Fusnotni stil (sluzbene upute za zavrsni rad, Povijest Jadrana i Mediterana, unidu)** (token `unidu-povijest-fusnote`)
Izvor: Upute za izradu zavrsnog rada, preddiplomski studij Povijest Jadrana i Mediterana (Sveuciliste u Dubrovniku) (`unidu-povijest-upute`)
Snapshot: `data/sources/unidu/unidu-povijest-upute.pdf` (hash `be4bc778e16b...`)

## knjiga  [str. 7] (worked-example)
Otvori PDF: `data/sources/unidu/unidu-povijest-upute.pdf#page=7`
```
TEMPLATE: {authors}. {title}. {place}: {publisher}, {year}.
QUOTE   : Vekari, Nenad. Stanovnistvo poluotoka Peljesca. Svezak 1. Dubrovnik: Zavod za povijesne   [grep: OK]
IZVOR   : Vekari, Nenad. Stanovnistvo poluotoka Peljesca. Svezak 1. Dubrovnik: Zavod za povijesne znanosti HAZU u Dubrovniku, 1992.
RENDER  : Vekari, Nenad. Stanovnistvo poluotoka Peljesca. Svezak 1. Dubrovnik: Zavod za povijesne znanosti HAZU u Dubrovniku, 1992.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Polja iz izvora (str. 6): prezime i ime autora/koautora, naslov knjige (u kurzivu), mjesto izdanja, izdavac, godina izdanja. U popisu literature prezime pa ime; alat radi plain text (kurziv se ne reproducira). 'Svezak 1' je dio naslova u primjeru.
```

## clanak  [str. 7] (worked-example)
Otvori PDF: `data/sources/unidu/unidu-povijest-upute.pdf#page=7`
```
TEMPLATE: {authors}. „{title}.“ {container} {volume} ({year}): {pages}.
QUOTE   : Vekari, Nenad. �Sud Janjinske kapetanije.� Anali Zavoda za povijesne znanosti HAZU u   [grep: OK]
IZVOR   : Vekari, Nenad. „Sud Janjinske kapetanije.“ Anali Zavoda za povijesne znanosti HAZU u Dubrovniku 27 (1989): 133-147.
RENDER  : Vekari, Nenad. „Sud Janjinske kapetanije.“ Anali Zavoda za povijesne znanosti HAZU u Dubrovniku 27 (1989): 133-147.
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Polja iz izvora (str. 7): prezime i ime, naslov rada (u navodnicima), naslov casopisa (u kurzivu), godiste (volumen) + broj unutar godista (ako postoji), godina, pocetna i posljednja stranica. Navodnike (korumpirani glif '�' u ekstrakciji) rekonstruiram kao „ “. Broj unutar godista (issue) nije eksemplificiran pa nije u predlosku.
```

## poglavlje  [str. 7] (derived)
Otvori PDF: `data/sources/unidu/unidu-povijest-upute.pdf#page=7`
```
TEMPLATE: {authors}. „{title}.“ u: {container}, ur. {editor}. {place}: {publisher}, {year}[[: {pages}]].
QUOTE   : Zuljani iz XVI stoljea.�, u: Beritiev zbornik, ur. Vjekoslav Cvitanovi. Dubrovnik:   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Izvor daje eksplicitan popis polja (str. 7): prezime i ime, naslov rada (u navodnicima), naslov knjige/zbornika (u kurzivu), urednik, mjesto, izdavac, godina, pocetna i posljednja stranica. Primjer (Marinovi, Ante...) prelomljen je na granici str. 7/8 pa nedostaju izdavac, godina i stranice; expected se ne moze vjerno dovrsiti, zato derived. Urednik u primjeru je u obliku ime-prezime ('ur. Vjekoslav Cvitanovi'), ne invertiran. Predlozak izveden iz popisa polja + knjiga/clanak obrasca.
```

## mrezni  [str. 8] (worked-example)
Otvori PDF: `data/sources/unidu/unidu-povijest-upute.pdf#page=8`
```
TEMPLATE: {authors}. „{title}.“ {container}[[ {year}]]. Dostupno na: {url} (pristup: {accessed}).
QUOTE   : Alfani, Guido. �I padrini: patroni o parenti? Tendenzedifondo nella selezione dei parent   [grep: OK]
IZVOR   : Alfani, Guido. „I padrini: patroni o parenti? Tendenzedifondo nella selezione dei parent ispirituali in Europa (XV-XX secolo).“ Nuevo Mundo Mundos Nuevos, Colloques 2008. Dostupno na: http://nuevomundo.revues.org/30172 (pristup: lipanj 2016).
RENDER  : Alfani, Guido. „I padrini: patroni o parenti? Tendenzedifondo nella selezione dei parent ispirituali in Europa (XV-XX secolo).“ Nuevo Mundo Mundos Nuevos, Colloques 2008. Dostupno na: http://nuevomundo.revues.org/30172 (pristup: lipanj 2016).
VERDIKT : MATCH (uz dijakriticku normalizaciju)
NAPOMENA: Za tekstove samo u elektronickom obliku izvor trazi bar ime autora, naslov rada, ime elektronicke publikacije s uputom na mreznu stranicu i datum (mjesec i godina) pristupa (str. 8). Prelomljene retke (171-173) spojio sam doslovno, zajedno s pdftotext lomovima rijeci ('Tendenzedifondo', 'parent ispirituali'). Navodnike '�' rekonstruiram kao „ “.
```

## zavrsni  [str. 6] (derived)
Otvori PDF: `data/sources/unidu/unidu-povijest-upute.pdf#page=6`
```
TEMPLATE: {authors}. {title}. {place}: {institution}, {year}.
QUOTE   : Knjiga (bibliografska jedinica treba sadrzavati):   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Ove upute ne propisuju format citiranja zavrsnih/diplomskih radova ni disertacija (spominju se samo u kontekstu plagijata, str. 3). Predlozak izveden iz obrasca za knjigu (str. 6): izdavac zamijenjen ustanovom. Potvrditi ili oboriti pri verifikaciji.
```

## propis  [str. 3] (derived)
Otvori PDF: `data/sources/unidu/unidu-povijest-upute.pdf#page=3`
```
TEMPLATE: {title}, {container} br. {issue}.
QUOTE   : Sukladno Zakonu o znanstvenoj djelatnosti i visokom obrazovanju (NN br. 94/2013), svi zavrsni   [grep: OK]
IZVOR   : (nema worked-examplea; provjeri template rucno protiv pravila u PDF-u)
NAPOMENA: Upute ne propisuju bibliografski format za propise/zakone u citatnom dijelu. Jedina opazena upotreba je unutartekstna 'Zakon o... (NN br. 94/2013)' (str. 3). Predlozak izveden iz te unutartekstne forme (kratica NN razrijesena u Narodne novine); potvrditi pri verifikaciji.
```

## Kontradikcije / otvorena pitanja
- Naslovi (knjige/casopisa u kurzivu, radova u navodnicima) u izvorniku su tipografski oznaceni; alat radi plain text pa kurziv otpada, a korumpirane navodnike '�' iz ekstrakcije rekonstruiram kao „ “.
- poglavlje: primjer je prelomljen na granici str. 7/8 (staje na 'Dubrovnik:') pa nedostaju izdavac, godina i stranice; predlozak je derived iz eksplicitnog popisa polja + knjiga/clanak obrasca, bez examplea.
- zavrsni/diplomski rad, disertacija i propis nemaju propisan citatni format u ovim uputama; predlosci su derived (zavrsni iz knjige, propis iz unutartekstne '(NN br. ...)' forme).
- Visestruko autorstvo u popisu literature nije eksemplificirano (primjer koautorstva 'Niko Kapetani i Nenad Vekari' / 'Nenad Vekari i dr.' je u fusnotnom, ime-prezime obliku, str. 10); redoslijed i razdvajanje 2-4 autora u popisu literature su pretpostavljeni (family-first, ' i ' za zadnjeg, 'i dr.' za vise od cetiri).
- Prior profila je [chicago-notes, harvard, ieee]. Fusnotni stil nalikuje Chicago notes-bibliography, ali je ovdje predstavljen kao custom-spec (vlastiti radni primjeri fakulteta), ne kao pin na standardni stil. 'ieee' nije potvrdjen ni u jednom isjecku.

## Verifikacija
VERIFICIRANO: Daniel Risavi (2026-07-10); verifiedHash `be4bc778e16b...` sidri na snapshot izvora.
Reverifikacija nakon drifta (izvor promijenjen): `node scripts/approve-citation-spec.mjs unidu-povijest-fusnote "Daniel Risavi"`.
