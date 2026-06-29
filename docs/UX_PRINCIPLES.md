# Lekta Â· UX principi i pravila po ekranu

VodiÄ za gradnju UI-a. Cilj: aplikacija koju student u panici noÄ prije predaje koristi jednom rukom, bez uputa.

Definicija jednostavnosti: manje odluka, vrijednost prije obveze, i uvijek oÄit sljedeÄi korak.

VeÅ¾e se na VISION.md (Å¡to gradimo), CLAUDE.md (kako se radi), MONETIZATION_AND_ANTI_ABUSE.md (naplata po dokumentu). Mobitel je primaran.

## Tri naÄela (sve podreÄeno ovome)

1. **Manje odluka.** Svaki ekran ima jednu glavnu akciju. Sve sporedno se otvara na zahtjev. Defaulti rade posao umjesto korisnika.
2. **Vrijednost prije obveze.** Score se vidi prije logina i prije plaÄanja. Korist prvo, raÄun kasnije.
3. **Uvijek oÄit sljedeÄi potez.** Na svakom ekranu je jasno Å¡to sad. Nema mrtvih krajeva ni "i sad Å¡to".

## KiÄma: 6 koraka

Landing â Kontekst (potvrda) â Teaser rezultat â Paywall (po vrsti rada) â Puna lista popravaka â Spreman. Re-check petlja vraÄa iz "Puna lista" natrag na rezultat. Sve ostalo je detalj oko ovih Å¡est.

## Pravila po ekranu

### 1. Landing
- Cilj: korisnik ubaci rad u par sekundi, bez prepreka.
- Hero: jedna reÄenica plus velik "Ubaci rad" (tap ili drag-drop).
- Primarna akcija: upload. Jedina akcija na ekranu.
- Sakrij: login, postavke, cijene, sve sekundarno.
- Pravila: bez registracije prije vrijednosti. Drag-drop na desktopu, veliki tap target na mobitelu. Prazno stanje je poziv na akciju, ne ukras.

### 2. Kontekst (potvrda, ne formular)
- Cilj: toÄan profil uz minimum trenja. Ovo je i najveÄe usko grlo i najveÄi rizik za toÄnost.
- Hero: jedan redak s popunjenim defaultom, npr. "Provjeravam kao: FPZG Â· Diplomski Â· promijeni".
- Primarna akcija: "Potvrdi". Promjena je sekundarna, skrivena iza "promijeni".
- Pravila: pokuÅ¡aj autodetekciju vrste rada iz dokumenta. Pamti zadnji odabir. Cilj je nula do jedan tap. Ako dokument oÄito ne odgovara odabranom profilu (npr. broj rijeÄi divlje odstupa), upozori prije nego korisnik ide dalje.

### 3. Teaser rezultat (vrijednost, besplatno, lokalno)
- Cilj: dokazati vrijednost u jednom pogledu, prije plaÄanja.
- Hero: velik score plus trake po kategorijama.
- SadrÅ¾aj: "X kritiÄnih, Y upozorenja", prva 1 do 2 popravka u potpunosti, ostatak zamuÄen s brojaÄem ("joÅ¡ 12 popravaka").
- Primarna akcija: "OtkljuÄaj sve popravke".
- Pravila: Äisto klijentski, bez mreÅ¾e. Vodi s jednim brojem i jednim "popravi prvo ovo", ne sa zidom od 19 provjera. ZamuÄena lista plus brojaÄ su glavni motor konverzije.

### 4. Paywall (u trenutku namjere)
- Cilj: brza odluka, bez izbornika.
- Hero: jedna kartica, jedna cijena vezana uz korisnikovu vrstu rada (seminarski 3, zavrÅ¡ni 5, diplomski 10).
- Primarna akcija: "Plati".
- Pravila: bez liste tierova na ekranu (manje opcija, brÅ¾a odluka). Jasno reci Å¡to kupnja daje: puni popravci plus neograniÄeni re-checkovi tog rada 7 dana. Pristanak na trenutnu isporuku i odricanje od prava na odustanak uzmi ovdje (vidi checklist). PlaÄanje ne prekida razumijevanje, vrati korisnika toÄno na punu listu.

### 5. Puna lista popravaka (zid postaje lista zadataka)
- Cilj: pretvoriti dijagnozu u izvediv plan koji smanjuje tjeskobu.
- Hero: problemi poredani po prioritetu (P0 do P3), svaki je konkretan zadatak.
- Svaki problem: Å¡to, gdje, i kako popraviti u Wordu. Primjer: "Desna margina 2,0 cm, treba oko 2,5 cm. Izgled stranice â Margine."
- Primarna akcija: "Ponovno provjeri" (sticky, uvijek vidljiv).
- Pravila: progresivno otkrivanje (score â kategorije â pojedini problem). Severity oznaka po stavci. Lista mora djelovati kao popravljiv niz zadataka, ne kao osuda.

### 6. Spreman za predaju
- Cilj: zatvoriti petlju i dati zadnji korak.
- Hero: jasno "Spreman" stanje kad je sve zeleno.
- SadrÅ¾aj: rok i postupak predaje za taj fakultet (linkaj na sluÅ¾beni izvor, ne tvrdi sam rok), plus izvoz izvjeÅ¡taja.
- Primarna akcija: "Izvezi izvjeÅ¡taj".
- Pravila: ovo je trenutak za upsell izvoza i checkliste, prirodno, bez pritiska.

## Globalna UI pravila

- **Jedan ekran, jedan broj, jedna akcija.** Vodi sa scoreom i jednom primarnom radnjom. Detalji na zahtjev.
- **Progresivno otkrivanje.** Nikad ne sipaj sve provjere odjednom. Score, pa kategorije, pa pojedini problem.
- **Prioritizacija P0 do P3.** Redoslijed je vrijednost, ne abeceda. "Å to prvo" mora biti oÄito.
- **Dijagnoza je odmah zadatak.** Svaka greÅ¡ka nosi konkretan popravak, ne samo konstataciju.
- **Bez Å¾argona sustava.** Imenuj kako student zna: "SadrÅ¾aj" ne "TOC detection", "Brojevi stranica" ne "page number scheme", "Citati i literatura" ne "citation cross-check". GreÅ¡ka govori kako popraviti, ne kako je sustav graÄen.
- **Admin je skriven.** Setup, production config, payment linkovi nisu u korisnikovom putu. Student vidi samo upload, rezultat, popravke, kupnju.
- **PDF iskreno.** Reci da docx daje punu provjeru, PDF ograniÄenu. LaÅ¾na sigurnost je gora od poznate granice.

## Mobitel (primaran)

- Jedan stupac, bez horizontalnog skrola za Äitanje rezultata.
- Primarni gumb u zoni palca i sticky.
- Veliki tap targeti, sve izvedivo jednom rukom.
- Upload kao tap ili drop. Rezultat Äitljiv u jednom pogledu.

## Mikrokopija

- **Ime akcije drÅ¾i isto kroz tijek.** Gumb "Provjeri" â stanje "Provjeravam" â rezultat "Gotovo". "Plati" â "PlaÄeno".
- **Prazna stanja su poziv na akciju.** "Ubaci svoj rad i vidi je li spreman", ne dekorativna poruka.
- **GreÅ¡ke usmjeravaju.** KaÅ¾u Å¡to je poÅ¡lo po zlu i kako dalje, u glasu suÄelja, bez isprika i bez maglovitosti.
- **Bez filera.** Brojevi i prioriteti Äitljivi odmah. Aktivni glagoli, reÄenice u sentence caseu.
- Hrvatski je default, bez em i en crtica (zarez, dvotoÄka, zagrade ili zasebne reÄenice).

## Re-check petlja je najlakÅ¡a radnja u aplikaciji

Rad se piÅ¡e iterativno, pa je ponovna provjera srce proizvoda. Ponovni upload je jedan tap i po defaultu nova verzija istog rada, ne novi dokument. PrikaÅ¾i razliku od proÅ¡log puta i napredak ("popravio 3, ostala 2"). Ako je iÅ¡ta lako, ovo mora biti.

## Anti-patterns (ruÅ¡e jednostavnost, ne raditi)

1. Login ili postavke prije nego korisnik vidi vrijednost.
2. Formular za kontekst umjesto jednog retka s defaultom.
3. Svih 19 provjera na ekranu odjednom.
4. Å½argon sustava u korisniÄkim stringovima.
5. Admin (setup, payment config) vidljiv studentu.
6. Izbornik tierova na paywallu umjesto jedne cijene.
7. Naplata po provjeri koja kaÅ¾njava re-check.
8. PDF bez upozorenja na ograniÄenje.

## Acceptance (kako znati da je jednostavno)

- [ ] Od landinga do score-a u par sekundi, bez logina i bez postavki.
- [ ] Kontekst se potvrÄuje u nula do jedan tap (default plus autodetekcija).
- [ ] Novi korisnik bez ikakvih uputa sam stigne do re-checka.
- [ ] Svaki ekran ima jednu oÄitu primarnu akciju.
- [ ] Nula sistemskog Å¾argona u korisniÄkim stringovima (provjera UI copyja).
- [ ] Re-check je jedan tap i prikazuje napredak.
- [ ] Cijeli tijek (upload, rezultat, kupnja, izvjeÅ¡taj, re-check) prolazi jednom rukom na mobitelu.
- [ ] Paywall prikazuje jednu cijenu za korisnikovu vrstu rada, bez izbornika.
