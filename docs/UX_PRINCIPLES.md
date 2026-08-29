# Lekta · UX principi i pravila po ekranu

Vodič za gradnju UI-a. Cilj: aplikacija koju student u panici noć prije predaje koristi jednom rukom, bez uputa.

Definicija jednostavnosti: manje odluka, vrijednost prije obveze, i uvijek očit sljedeći korak.

Veže se na VISION.md (što gradimo), CLAUDE.md (kako se radi), MONETIZATION_AND_ANTI_ABUSE.md (naplata po dokumentu). Mobitel je primaran.

## Tri načela (sve podređeno ovome)

1. **Manje odluka.** Svaki ekran ima jednu glavnu akciju. Sve sporedno se otvara na zahtjev. Defaulti rade posao umjesto korisnika.
2. **Vrijednost prije obveze.** Score se vidi prije logina i prije plaćanja. Korist prvo, račun kasnije.
3. **Uvijek očit sljedeći potez.** Na svakom ekranu je jasno što sad. Nema mrtvih krajeva ni "i sad što".

## Kičma: 6 koraka

Landing → Kontekst (potvrda) → Teaser rezultat → Paywall (po vrsti rada) → Puna lista popravaka → Spreman. Re-check petlja vraća iz "Puna lista" natrag na rezultat. Sve ostalo je detalj oko ovih šest.

## Pravila po ekranu

### 1. Landing
- Cilj: korisnik ubaci rad u par sekundi, bez prepreka.
- Hero: jedna rečenica plus velik "Ubaci rad" (tap ili drag-drop).
- Primarna akcija: upload. Jedina akcija na ekranu.
- Sakrij: login, postavke, cijene, sve sekundarno.
- Pravila: bez registracije prije vrijednosti. Drag-drop na desktopu, veliki tap target na mobitelu. Prazno stanje je poziv na akciju, ne ukras.

### 2. Kontekst (potvrda, ne formular)
- Cilj: točan profil uz minimum trenja. Ovo je i najveće usko grlo i najveći rizik za točnost.
- Hero: jedan redak s popunjenim defaultom, npr. "Provjeravam kao: FPZG · Diplomski · promijeni".
- Primarna akcija: "Potvrdi". Promjena je sekundarna, skrivena iza "promijeni".
- Pravila: pokušaj autodetekciju vrste rada iz dokumenta. Pamti zadnji odabir. Cilj je nula do jedan tap. Ako dokument očito ne odgovara odabranom profilu (npr. broj riječi divlje odstupa), upozori prije nego korisnik ide dalje.

### 3. Teaser rezultat (vrijednost, besplatno, lokalno)
- Cilj: dokazati vrijednost u jednom pogledu, prije plaćanja.
- Hero: velik score plus trake po kategorijama.
- Sadržaj: "X kritičnih, Y upozorenja", prva 1 do 2 popravka u potpunosti, ostatak zamućen s brojačem ("još 12 popravaka").
- Primarna akcija: "Otključaj sve popravke".
- Pravila: čisto klijentski, bez mreže. Vodi s jednim brojem i jednim "popravi prvo ovo", ne sa zidom od 19 provjera. Zamućena lista plus brojač su glavni motor konverzije.

### 4. Paywall (u trenutku namjere)
- Cilj: brza odluka, bez izbornika.
- Hero: jedna kartica, jedna cijena vezana uz korisnikovu vrstu rada (seminarski 3, završni 5, diplomski 10).
- Primarna akcija: "Plati".
- Pravila: bez liste tierova na ekranu (manje opcija, brža odluka). Jasno reci što kupnja daje: puni popravci plus neograničeni re-checkovi tog rada 7 dana. Pristanak na trenutnu isporuku i odricanje od prava na odustanak uzmi ovdje (vidi checklist). Plaćanje ne prekida razumijevanje, vrati korisnika točno na punu listu.

### 5. Puna lista popravaka (zid postaje lista zadataka)
- Cilj: pretvoriti dijagnozu u izvediv plan koji smanjuje tjeskobu.
- Hero: problemi poredani po prioritetu (P0 do P3), svaki je konkretan zadatak.
- Svaki problem: što, gdje, i kako popraviti u Wordu. Primjer: "Desna margina 2,0 cm, treba oko 2,5 cm. Izgled stranice → Margine."
- Primarna akcija: "Ponovno provjeri" (sticky, uvijek vidljiv).
- Pravila: progresivno otkrivanje (score → kategorije → pojedini problem). Severity oznaka po stavci. Lista mora djelovati kao popravljiv niz zadataka, ne kao osuda.

### 6. Spreman za predaju
- Cilj: zatvoriti petlju i dati zadnji korak.
- Hero: jasno "Spreman" stanje kad je sve zeleno.
- Sadržaj: rok i postupak predaje za taj fakultet (linkaj na službeni izvor, ne tvrdi sam rok), plus izvoz izvještaja.
- Primarna akcija: "Izvezi izvještaj".
- Pravila: ovo je trenutak za upsell izvoza i checkliste, prirodno, bez pritiska.

## Globalna UI pravila

- **Jedan ekran, jedan broj, jedna akcija.** Vodi sa scoreom i jednom primarnom radnjom. Detalji na zahtjev.
- **Progresivno otkrivanje.** Nikad ne sipaj sve provjere odjednom. Score, pa kategorije, pa pojedini problem.
- **Prioritizacija P0 do P3.** Redoslijed je vrijednost, ne abeceda. "Što prvo" mora biti očito.
- **Dijagnoza je odmah zadatak.** Svaka greška nosi konkretan popravak, ne samo konstataciju.
- **Bez žargona sustava.** Imenuj kako student zna: "Sadržaj" ne "TOC detection", "Brojevi stranica" ne "page number scheme", "Citati i literatura" ne "citation cross-check". Greška govori kako popraviti, ne kako je sustav građen.
- **Admin je skriven.** Setup, production config, payment linkovi nisu u korisnikovom putu. Student vidi samo upload, rezultat, popravke, kupnju.
- **PDF iskreno.** Reci da docx daje punu provjeru, PDF ograničenu. Lažna sigurnost je gora od poznate granice.

## Mobitel (primaran)

- Jedan stupac, bez horizontalnog skrola za čitanje rezultata.
- Primarni gumb u zoni palca i sticky.
- Veliki tap targeti, sve izvedivo jednom rukom.
- Upload kao tap ili drop. Rezultat čitljiv u jednom pogledu.

## Mikrokopija

- **Ime akcije drži isto kroz tijek.** Gumb "Provjeri" → stanje "Provjeravam" → rezultat "Gotovo". "Plati" → "Plaćeno".
- **Prazna stanja su poziv na akciju.** "Ubaci svoj rad i vidi je li spreman", ne dekorativna poruka.
- **Greške usmjeravaju.** Kažu što je pošlo po zlu i kako dalje, u glasu sučelja, bez isprika i bez maglovitosti.
- **Bez filera.** Brojevi i prioriteti čitljivi odmah. Aktivni glagoli, rečenice u sentence caseu.
- Hrvatski je default, bez em i en crtica (zarez, dvotočka, zagrade ili zasebne rečenice).

## Re-check petlja je najlakša radnja u aplikaciji

Rad se piše iterativno, pa je ponovna provjera srce proizvoda. Ponovni upload je jedan tap i po defaultu nova verzija istog rada, ne novi dokument. Prikaži razliku od prošlog puta i napredak ("popravio 3, ostala 2"). Ako je išta lako, ovo mora biti.

## Anti-patterns (ruše jednostavnost, ne raditi)

1. Login ili postavke prije nego korisnik vidi vrijednost.
2. Formular za kontekst umjesto jednog retka s defaultom.
3. Svih 19 provjera na ekranu odjednom.
4. Žargon sustava u korisničkim stringovima.
5. Admin (setup, payment config) vidljiv studentu.
6. Izbornik tierova na paywallu umjesto jedne cijene.
7. Naplata po provjeri koja kažnjava re-check.
8. PDF bez upozorenja na ograničenje.

## Acceptance (kako znati da je jednostavno)

- [ ] Od landinga do score-a u par sekundi, bez logina i bez postavki.
- [ ] Kontekst se potvrđuje u nula do jedan tap (default plus autodetekcija).
- [ ] Novi korisnik bez ikakvih uputa sam stigne do re-checka.
- [ ] Svaki ekran ima jednu očitu primarnu akciju.
- [ ] Nula sistemskog žargona u korisničkim stringovima (provjera UI copyja).
- [ ] Re-check je jedan tap i prikazuje napredak.
- [ ] Cijeli tijek (upload, rezultat, kupnja, izvještaj, re-check) prolazi jednom rukom na mobitelu.
- [ ] Paywall prikazuje jednu cijenu za korisnikovu vrstu rada, bez izbornika.
