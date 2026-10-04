# Plan: preostali audit i dokaz produkcijske verzije

> **Za agente:** plan se izvodi zadatak po zadatak, uz jednog pisca u izoliranom worktreeu.

**Cilj:** zatvoriti zabilježene kvarove navigacije i preostale izvedive provjere audita, zatim
objaviti i dokazati testiranu produkcijsku verziju.

**Arhitektura:** postojeća Vite aplikacija i deterministička obrada dokumenta ostaju iste.
Adrese se popravljaju u izvoru koji ih posjeduje, a regeneriraju se samo pogođene projekcije.
Vjerodajnice i detaljni dokazi izvođenja ostaju izvan praćenih datoteka.

**Tehnologije:** TypeScript, Vite, Vitest, Playwright, Deno, Supabase, Netlify, Word na Windowsu.

**Zahtjev:** korisnički zahtjev u ovoj niti, 30. 9. 2026.: provjeriti preostale stavke i dati
dokaz produkcijske isporuke. Postojeći dokazi su
`output/playwright/complete-audit-2026-09-30/AUDIT.md` i
`output/playwright/audit-followup-2026-09-30/FOLLOWUP.md`. Ta mapa nije u repozitoriju, pa se
tvrdnje koje upućuju na nju iz repozitorija ne mogu ponoviti.

## Opća ograničenja

- Jedan pisac, grana od `fe0d1b0159dba6d53847b47214561d9ff6857ac9`.
- Samo sintetički dokumenti i računi; autorski tekst ostaje netaknut. Produkcijska naplata se ne
  uključuje.
- Nedostajuće vjerodajnice ili nedostupni vanjski servisi ostaju izričito neprovjereni.
- Teške naredbe idu kroz `scripts/with-gate-lock.mjs`, uz `VITEST_MAX_THREADS=1`.
- Prije commita: puni `npm run check`, `orphan-scan` i pregled drugog providera (samo čitanje).
- Izdanje: čist kandidat, puni `release:check`, commit samo s dokazom, strogi produkcijski build,
  identificiran Netlify artefakt i strogi smoke test nad živom stranicom.

## Fokus pregleda

- Poveznice na alate iz `/rad/` vode na ispravnu adresu i zadržavaju parametre fakulteta i razine.
- Poveznice na izvore identificiraju stvarni postojeći dokument, ne pogođenu adresu ni drugo
  izdanje.
- Javni bundle ne sadrži privatni registar izvora, vjerodajnice ni studentski tekst.
- Preuzete datoteke sadrže očekivani sintetički sadržaj i ispravno se otvaraju; nije dovoljno da je
  gumb za preuzimanje aktivan.
- Identitet produkcijskog builda, hashevi resursa i opažene rute odgovaraju testiranom izdanju.

## Zadaci

- [x] Popisati prijašnje praznine audita, obitelji ruta, preskočene testove i ograde izdanja;
  zapisati matricu pokrivenosti u `output/playwright/production-proof-2026-09-30`.
- [x] Dodati testove razrješavanja adresa koji padaju u `tests/tool-suggestions.test.ts`; popraviti
  `src/ui/tool-suggestions.ts` i pokrenuti ciljane testove.
- [ ] Popraviti neispravne poveznice na izvore fakulteta (23 zapisa registra, potvrđena prema
  snimkama) preko službenih stranica izdavača i identiteta snimke. Ispraviti
  `data/sources/source-registry.json` i pogođene metapodatke profila gdje je identitet potvrđen;
  dodati regresijsko pokrivanje i dvaput regenerirati pogođene split i serverske projekcije. Gdje se
  identitet ne može potvrditi, poveznicu izričito prikazati kao nedostupnu, ne izmišljati je.
- [ ] Provjeriti generirane rute i interne poveznice, valjanost poveznica na izvore, stvarne DOCX i
  PDF izvoze, analizu i povijest u svježoj sesiji, pretragu izvora, mobilnu pristupačnost i tokove
  prijavljenog korisnika. Koristiti snimke zaslona i sintetičke podatke. Preduvjete za SMTP i Stripe
  zapisati zasebno.
- [ ] Izvesti izvedive dosad preskočene provjere: testove vezane uz operacijski sustav na
  podržanoj platformi, DB tok Academic Suitea, provjeru sadržaja projekcija i probu ekstrakcije na
  stagingu.
- [ ] Pokrenuti puni lokalni check, `orphan-scan` i ograničeni neovisni pregled; popraviti uvedene
  nalaze; commitati, pushati i spojiti nakon aktualnog CI-ja.
- [ ] Pokrenuti čist puni `release:check` uključujući Word razine. Commitati samo dobiveni dokaz i
  potvrditi strogi gate dokaza. Izgraditi produkciju s točnim SHA kandidata i ispravnim
  produkcijskim postavkama.
- [ ] Objaviti potvrđeni artefakt na postojeću produkcijsku stranicu. Provjeriti identitet
  objavljenog Netlify deploya, javni `build-info`, podudarnost hasheva resursa, strogi
  `post-deploy-smoke` te svježe snimke zaslona i interakcije u pregledniku.
- [ ] Isporučiti sažet izvještaj s dokazima: točni commitovi, ID deploya, provjere, snimke zaslona i
  preostale vanjske blokade. Ne tvrditi da su testirana sva moguća stanja.

## Nalazi potvrđeni tijekom izvođenja

- Devet stvarnih DOCX preuzimanja prošlo je u Chromiumu, Firefoxu i WebKitu. Dva PDF-a za ispis
  zadržavaju sintetički tekst koji se može izvući; ukrasne sjene i 3D papir su uklonjeni, a
  regresijski testovi preglednika su prošli.
- Pristupačnost učitavanja na mobilnom `/rad/` i pristup tipkovnicom tablici benchmarka ispravljeni
  su nakon opaženih axe padova.
- Stvarna CrossRef pretraga prošla je u sučelju za postojeći i nepostojeći DOI. Proba ekstrakcije
  na stagingu je prošla; DB run Academic Suitea 36767139225 prošao je na bazi `fe0d1b01`.
- Popravak izvora proširen je s početnih osam zapisa na sva 23 neispravna zapisa registra koja
  koriste javne adrese profila. Bajtovi svih preuzetih PDF, DOC i DOCX datoteka (uključujući dva
  člana ZIP arhive) odgovaraju arhiviranim hashevima. Nijedna vrijednost akademskog pravila nije
  promijenjena.
- Vanjski preduvjeti ostaju: Stripe ključevi za staging i ovlašteni primatelj e-pošte. Lokalni
  upravljački token vraća HTTP 403 za produkciju, ali povezani Supabase dodatak ima provjeren
  pristup. Javni `profile-rules` u produkciji javlja stariju verziju skupa podataka, a produkcijski
  `admin-stats` nema prikaz prilika koji je već na stagingu. Prije deploya treba napraviti sigurnosnu
  kopiju obiju objavljenih funkcija, provjeriti spremnost migracija i RPC-ova i pregledati točne
  razlike deploya, pa tek nakon gateova objaviti testirane verzije.
- Puni gate otkrio je drift ovisnih metapodataka u generiranom receptu popravka i Katedra izvozu te
  jedno staro očekivanje relativne poveznice. Te projekcije treba dvaput regenerirati, potvrditi da
  su semantičke razlike samo u adresama i da su parametri popravka nepromijenjeni, pa ponovno
  pokrenuti puni gate. Neuspjeli run ostaje kao dokaz (9115 prošlo, 3 palo, 10 preskočeno).
- Ovisna regeneracija je stabilna: recept mijenja 105 pojava adrese, Katedra izvoz 22; autoritet
  parametara popravka je nepromijenjen. Svih 27 ciljanih regresijskih testova i 15 slučajeva u
  Firefoxu, WebKitu i mobilnom WebKitu je prošlo; novi testovi preglednika uključeni su u trajnu
  matricu.
- Produkcijski SQL smoke (samo čitanje) vratio je valjane objekte za svih sedam admin RPC-ova;
  metapodaci potvrđuju da ih `anon` i `authenticated` ne mogu izvršiti, a `service_role` može. To je
  dokaz baze, ne prijavljene sesije u produkcijskom pregledniku.
