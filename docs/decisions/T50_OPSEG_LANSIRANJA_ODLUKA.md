# T50: opseg lansiranja i go/no-go, odluka vlasnika 2026-09-27

Odluka se odnosi na prijedlog `docs/decisions/T50_OPSEG_LANSIRANJA_PRIJEDLOG.md` (PR #168,
grana `claude/laya-v2-specification-9z0pkb`, commit 9f1a6c91; u trenutku ove odluke jos nije
spojen). Vlasnik je odluku potvrdio osobno 2026-09-27 (koordinator lekta-32, izvrsitelj lekta-00).

## 1. Odluka (2026-09-27)

1. **Opseg:** SADA opseg A (besplatna beta: analiza, besplatni popravak, provjera izvora,
   besplatni alati, lista cekanja). Cilj je opseg C (puni plan), a opseg B (placeno lansiranje)
   je medjukorak.
2. **Go/no-go za opseg A: ponedjeljak 19. 10. 2026.** Datum se pomice SAMO ako nije ispunjen neki
   kriterij iz odjeljka 2 ove odluke (odjeljak 6 prijedloga), nikad zbog novih funkcija.
3. **Domena (T49)** uzima se pocetkom listopada 2026.
4. **Pilot:** 5 do 8 osoba; vlasnik sam salje pozive i sam testira.
5. **Beta se javno oglasava.**

## 2. Go/no-go kriteriji za opseg A (prijepis odjeljka 6 prijedloga)

Svaki kriterij ima dokaz; nepoznato je NO-GO, ne GO. Kriteriji su dosje zadatka T81.

1. T26 zatvoren: conformance matrica prolazi, nalazi #14, #16 i #17 ispravljeni, nema sustavnog
   laznog nalaza na poznato ispravnim dokumentima.
2. T72: svjez `RELEASE_PROOF` nad tocnim commitom kandidata.
3. Word oracle zelen na Windowsu za popravljene dokumente (`npm run verify:word`).
4. Sigurnosni podskup T21 za zive endpointe (repair-docx, source-check, faculty-request,
   preporuke): nema otvorenog P0.
5. Prekidaci provjereni na produkciji: `REPAIR_DISABLED` stvarno gasi popravak; stvarna
   vrijednost `REPAIR_FREE_MODE` procitana.
6. Pravni tekstovi bete objavljeni (privatnost, uvjeti, "tijekom besplatne bete").
7. T49: domena i support sanducic rade, SPF/DKIM/DMARC postavljeni.
8. Mini pilot: najmanje pet korisnika prolazi glavni tok bez P0 i blokirajuceg P1 (kriterij T15).
9. Nijedan `*_DISABLED` ili prazan endpoint ne vodi korisnika u slijepu ulicu: iskljucene
   funkcije su skrivene ili jasno oznacene kao "uskoro".

## 3. Posljedice

- **Javna beta** znaci neograniceni ulaz stvarnih korisnika bez naplate. Prije 19. 10. zato treba
  provjeriti troskovne granice i rate-limit besplatnog popravka te procitati zive vrijednosti na
  produkciji (kriterij 5). U `supabase/functions/repair-docx/index.ts` to su `REPAIR_FREE_MODE`,
  `REPAIR_DISABLED`, `REPAIR_FREE_DAILY_CAP` (zadano 10 po korisniku dnevno),
  `REPAIR_FREE_IP_DAILY_CAP` (zadano 40 po IP-u), `DAILY_CAP` (zadano 30) i
  `REPAIR_STORAGE_DAILY_CAP` (zadano 500 novih poslova dnevno). Zadane vrijednosti su iz koda;
  zive vrijednosti na produkciji nisu procitane. Nepoznata vrijednost je NO-GO.
- **T81** "Beta go/no-go (opseg A), 19. 10. 2026." je novi gate za opseg A; ovisi o T26, T72 i
  T49, a sigurnosni podskup T21 za zive endpointe je kriterij 4 (T21 nema zaseban podzadatak).
- **T44** ostaje gate za placeno i puno lansiranje (opsezi B i C); beta je zaseban, imenovani
  opseg i nista se ne proglasava gotovim skrivanjem.
- **T15:** pilot provodi vlasnik (pozivi i testiranje); beta je javna.
- **T50** je zatvoren ovom odlukom.

## 4. Sto ova odluka ne radi

- Ne mijenja kod, bazu, Edge funkcije ni prekidace.
- Ne spaja PR #168 niti mijenja prijedlog; ova datoteka je samostalan zapis odluke.
- Ne tvrdi da je ijedan kriterij iz odjeljka 2 danas ispunjen.
