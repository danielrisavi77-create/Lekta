# T50: opseg lansiranja i datum go/no-go (PRIJEDLOG, ceka odluku vlasnika)

Status: prijedlog od 2026-09-27. Nista iz ovog dokumenta ne vrijedi dok vlasnik ne odabere
opciju i datum. Cinjenice su s `origin/master` `c41143a`; zivi produkcijski secreti nisu
provjereni (oznaceno gdje je bitno).

## 1. Zasto odluka treba sada

- Nijedan dokument ne definira MVP ni go/no-go. Plan do live cilja "dovrsiti sve postojece
  cjeline" i procjenjuje 35 do 65 radnih dana, izricito "procjena opsega, ne obecanje datuma"
  (`docs/agents/plan-do-live-2026-09-12.md:6`, `:144`).
- T44 (dokaz cijelih tokova) ima 26 izravnih ovisnosti; 29 zadataka u njegovom stablu nije
  gotovo. Najdulji lanac do objave (T47) ima 14 koraka (`docs/agents/tasks.json`).
- Plan kaze da skrivanje nedovrsene funkcije ne zatvara njezin zadatak (`plan:28`). Dakle bez
  odluke o opsegu nema kraceg puta: svaka funkcija mora biti dovrsena prije ikakvog lansiranja.

## 2. Sto je vec odluceno

| Odluka | Datum | Izvor |
|---|---|---|
| Naplata iskljucena tijekom bete | 2026-09-26 | `docs/GO_LIVE_NAPLATA.md:78`, `orchestrator-backlog.md:110` |
| Naplata ide preko Stripea | 2026-09-23 | `orchestrator-backlog.md:92` |
| Provjera izvora u beti ide besplatno uz popravak | nedatirano | `docs/GO_LIVE_REPAIR.md:21-23` |
| WordReplica zadnja, za lansiranje iskljucena | 2026-09-22 | `orchestrator-backlog.md:108`, T51 |
| Bez novih alata prije lansiranja; analitika i alarmi nakon T44 | 2026-09-26 | `tasks.json` statusNote |
| Program P-A do P-G tek nakon T47 | 2026-09-27 | `PRODUCTION_BACKLOG.md:943-962` |
| Javni tekst vec obecava: "Tijekom bete je sve besplatno" | | `landing_usporedba.html:383` |

## 3. Sto danas radi, a sto je iskljuceno

Radi (prema kodu i dokumentaciji): lokalna analiza .docx, serverski popravak u besplatnoj beti
(`REPAIR_FREE_MODE`, stvarna vrijednost nije provjerena), provjera izvora, lista cekanja,
preporuke, Katedra CTA, besplatni alati kao stranice, PDF preflight lokalno.

Iskljuceno u produkciji (`src/config/production-config.ts:19`): naplata i checkout, puni placeni
izvjestaj, field-render, zahtjev za garanciju, preflight i integrity (funkcije nisu deployane),
WordReplica, podsjetnici e-postom (cekaju domenu i Resend), prijava e-postom (samo anonimno).

Profili: 407 u registru, 36 `verified`, 371 `partial`; razina A 32 profila (19 nasljedno);
2.218 bodovanih pravila u 369 celija (`data/coverage/scored-coverage.json`).

## 4. Tri opcije

| | A: Besplatna beta | B: Placeno lansiranje | C: Puni plan |
|---|---|---|---|
| Sadrzaj | analiza, besplatni popravak, provjera izvora, besplatni alati, lista cekanja | A + Stripe naplata popravka, prijava e-postom, garancija i povrat | sve cjeline T19 do T43 |
| Nije ukljuceno | naplata, racun, podsjetnici, preflight, WordReplica | preflight, WordReplica, admin i dio alata | WordReplica i P-A do P-G |
| Blokira vlasnik | T49 (domena i support sanducic) | T48 (obrt, OIB, Stripe isplata), T49 | T48, T49 |
| Kodni preduvjeti | T26, T72, sigurnosni podskup T21 za zive endpointe, pilot | A + T22, T23, T24, T25, T37 | svih 29 otvorenih u stablu T44 |
| Procjena | 2 do 3 tjedna | 5 do 8 tjedana, ovisi o tome koliko traje T48 | 35 do 65 radnih dana (plan) |
| Rizik | beta bez prihoda; korisnici mogu naici na nedovrsene rubove | T48 je izvanjski rok (registracija, banka, Stripe provjera) | najdulje bez stvarnih korisnika i podataka |

Procjene za A i B su moje, izvedene iz grafa ovisnosti; nisu izmjerene.

## 5. Preporuka

**Opcija A sada, opcija B kao drugi gate.** Razlozi:

1. Beta je vec odlucena kao besplatna i javni tekst to vec obecava; A samo daje imenovanu granicu
   i mjerljive kriterije onome sto vec postoji.
2. T48 ovisi o vanjskim rokovima (registracija, banka, Stripe provjera) i ne bi smio drzati
   stvarne korisnike i podatke o kvaliteti analize.
3. Najveci rizik proizvoda je tocnost analize (T26), ne naplata. Beta daje stvarne radove na
   kojima se to mjeri.

Posljedica za red zadataka: uvesti novi zadatak "Beta go/no-go" s uzim skupom ovisnosti (ispod).
T44 ostaje gate za placeno i puno lansiranje, pa se pravilo iz `plan:28` ne krsi: nista se ne
proglasava gotovim skrivanjem, beta je zaseban, imenovani opseg.

## 6. Go/no-go kriteriji za opciju A

Svaki kriterij ima dokaz; nepoznato je NO-GO, ne GO.

1. T26 zatvoren: conformance matrica prolazi, nalazi #14, #16 i #17 ispravljeni, nema sustavnog
   laznog nalaza na poznato ispravnim dokumentima.
2. T72: svjez `RELEASE_PROOF` nad tocnim commitom kandidata.
3. Word oracle zelen na Windowsu za popravljene dokumente (`npm run verify:word`).
4. Sigurnosni podskup T21 za zive endpointe (repair-docx, source-check, faculty-request,
   preporuke): nema otvorenog P0.
5. Prekidaci provjereni na produkciji: `REPAIR_DISABLED` stvarno gasi popravak; stvarna
   vrijednost `REPAIR_FREE_MODE` procitana (danas nije provjerena).
6. Pravni tekstovi bete objavljeni (privatnost, uvjeti, "tijekom besplatne bete").
7. T49: domena i support sanducic rade, SPF/DKIM/DMARC postavljeni.
8. Mini pilot: najmanje pet korisnika prolazi glavni tok bez P0 i blokirajuceg P1 (kriterij T15).
9. Nijedan `*_DISABLED` ili prazan endpoint ne vodi korisnika u slijepu ulicu: iskljucene
   funkcije su skrivene ili jasno oznacene kao "uskoro".

## 7. Sto vlasnik treba odluciti

- [ ] Opcija: A, B ili C.
- [ ] Datum go/no-go za prvi gate. Prijedlog za A: **ponedjeljak 19. 10. 2026.**, uz pravilo da
      se datum pomice samo zbog kriterija iz odjeljka 6, ne zbog novih funkcija.
- [ ] Ime domene (T49), moze paralelno s kodom.
- [ ] Tko su pilot korisnici (5 do 8 osoba) i tko ih kontaktira.
- [ ] Smije li beta biti javno oglasavana ili samo pozivna (utjece na opterecenje popravka).

## 8. Sto nije provjereno

- Zive vrijednosti `REPAIR_FREE_MODE`, `REPAIR_DISABLED`, `PROFILE_RULES_DISABLED` i
  `CORPUS_CONTRIBUTION_ENABLED` (za zadnji su kod i dokumentacija u proturjecju).
- Odgovara li zadnji Netlify build masteru.
- Tekst vlasnikovog audita od 22. 9. (nalaz 5); u repozitoriju je samo parafraziran.
