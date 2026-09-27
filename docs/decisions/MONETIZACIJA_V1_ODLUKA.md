# Monetizacija V1: odluka vlasnika 2026-09-27

Odnosi se na `docs/decisions/MONETIZACIJA_V1.md` (vlasnikov dokument, 1180 redaka, commit 5665969b).
Taj dokument ostaje nepromijenjen; ova datoteka biljezi sto je iz njega odluceno i kako se
izvodi. Vlasnik je odluku potvrdio osobno 2026-09-27 (koordinator lekta-32, izvrsitelj lekta-00).

## 1. Odluka

1. Arhitektura iz `MONETIZACIJA_V1.md` je prihvacena: Free, Repair, Final Pass, Expert, uz
   Semester Pass za seminarske radove i pet vrsta rada (seminarski, zavrsni, diplomski,
   specijalisticki, doktorski).
2. Cijene i prozori vrijede tocno kako su u dokumentu (odjeljci 3, 5, 6, 7, 11 i 25):

| Paket | Seminarski | Zavrsni | Diplomski | Specijalisticki | Doktorski |
| --- | ---: | ---: | ---: | ---: | ---: |
| Repair (`slot_*`) | 3,99 EUR / 7 dana | 5,99 EUR / 7 dana | 9,99 EUR / 14 dana | 16,99 EUR / 21 dan | 24,99 EUR / 30 dana |
| Final Pass (`pass_*`) | nema | 12,99 EUR / 180 dana | 19,99 EUR / 180 dana | 29,99 EUR / 240 dana | 39,99 EUR / 365 dana |
| Expert | nema | od 29,99 EUR | od 39,99 EUR | od 49,99 EUR | individualno, od 69,99 EUR |

   Semester Pass (`pass_semestralni`): 14,99 EUR, do 6 seminarskih radova, 180 dana.

3. Ove cijene i prozori ZAMJENJUJU raniju vlasnikovu odluku o cijenama po vrsti rada zapisanu u
   redu F2 u `docs/agents/orchestrator-backlog.md` (4,99 / 9,99 / 14,99 / 19,99 / 24,99 EUR,
   specijalisticki prozor 14 dana). Z24 (ALIGNMENT) se izvodi po V1.
4. SKU-ovi `slot_zavrsni_do_obrane` i `slot_diplomski_do_obrane` se deaktiviraju; ne uvode se
   `slot_specijalisticki_do_obrane` ni `slot_doktorski_do_obrane` (odjeljak 10).

## 2. Podjela na M1 do M6

| oznaka | opseg | izvrsitelj | razred | zasticeno | zadatak |
| --- | --- | --- | --- | --- | --- |
| M1 | ova odluka, biljeske i zadaci u `docs/agents/tasks.json` | cloud (lekta-00) | light | ne | ovaj PR |
| M2 | naplatna infrastruktura (vidi 2.1) | c4 | full | `supabase` | T77 |
| M3 | vrsta rada u klijentu (vidi 2.2) | c4 | standard | ne | T77 |
| M4 | specijalisticki u profilima i validatorima (vidi 2.3) | Upisnik | full | `data/profiles` | T78 |
| M5 | Final Pass funkcije: revizije (T31), Submission Ready, Citation Audit Pro paket, Final Submission Gate | nakon lansiranja | nije odredeno | nije odredeno | nema, uz P-A |
| M6 | Expert SKU-ovi i operativni tok | nakon lansiranja | nije odredeno | nije odredeno | nema, uz T37 i T48 |

### 2.1 M2: naplatna infrastruktura

- Migracija s prefiksom od `0205` navise, iskljucivo kroz `supabase db push`, idempotentna:
  - `specijalisticki` u `products.work_type` CHECK;
  - novi `slot_specijalisticki`, `pass_specijalisticki`, `pass_semestralni`, te `pass_doktorski`
    ako ne postoji;
  - deaktivacija `slot_zavrsni_do_obrane` i `slot_diplomski_do_obrane`;
  - `offer_code` (`repair_v1`, `final_pass_v1`, `semester_pass_v1`, `expert_v1`) i snapshot prava
    uz entitlement pri kupnji (odjeljak 13).
- Serverski upgrade Repair u Final Pass: naplacuje se ciljna cijena minus vec placeni iznos za isti
  rad (odjeljak 14).
- Stripe proizvodi za nove SKU-ove; iznos naplate dolazi samo iz serverskog `products.price_eur`.
- Povrat zatvara entitlement i sve vezane referral i bonus posljedice (F21).

### 2.2 M3: vrsta rada u klijentu

- `ReportWorkType` i `WORK_TYPE_ORDER` dobivaju `specijalisticki`; picker, checkout i analitika
  dobivaju zaseban segment.
- Klijentski kod NE sadrzi cijene. Polje `priceEur` iz primjera u odjeljku 12 dokumenta se ne
  prenosi; cijena se prikazuje samo iz `products.price_eur` (odjeljak 29).

### 2.3 M4: specijalisticki u profilima

- `specijalisticki` postaje vrsta rada u profilima i validatorima. Profil bez potvrdenih pravila za
  specijalisticki rad oznacava se kao `limited coverage`; nema tihog fallbacka na diplomski ili
  doktorski profil.
- Postupak slijedi recept iz T76 (izvor s lokatorom i citatom ili degradacija).

## 3. Ogranicenja (napomene koordinatora, prihvacene)

1. Final Pass u V1 obecava samo ono sto vec postoji u proizvodu, uz vidljiv popis "nije provjereno".
   Funkcije iz M5 se ne oglasavaju prije nego sto postoje.
2. Laya je samo savjetodavna i nikad nije SKU ni placeni dodatak (odjeljak 20).
3. Expert ne dira sadrzaj rada: ne pise, ne prepravlja i ne ocjenjuje recenice ni argumentaciju
   (granica proizvoda iz `CLAUDE.md`, odjeljak 8 dokumenta).
4. Nijedan proizvod ne tvrdi da je fakultet sluzbeno odobrio rad.

## 4. Prihvatni kriteriji V1 (prijepis odjeljka 29)

V1 nije spreman dok nije dokazano:

1. Free analiza radi bez naplate.
2. `specijalisticki` prolazi kroz cijeli pricing, catalog, checkout i entitlement tok.
3. Svaki Repair SKU daje tocno jedan slot odgovarajuce vrste rada.
4. Final Pass se ne moze primijeniti na drugi rad.
5. Final Pass prihvaca novu verziju istog rada.
6. Upgrade ne naplacuje ponovno vec placeni Repair iznos.
7. `offer_code` se snapshotira pri kupnji.
8. Promjena buduceg kataloga ne oduzima staro pravo.
9. Deaktivirani `*_do_obrane` proizvodi vise se ne nude.
10. Stripe iznos dolazi samo iz serverskog `products.price_eur`.
11. Povrat zatvara entitlement i sve vezane referral i bonus posljedice.
12. `specijalisticki` ima zaseban analytics segment.
13. Nijedan proizvod ne tvrdi da je fakultet sluzbeno odobrio rad.
14. Expert pregled ne obecava akademsko pisanje ni izmjenu sadrzaja.

## 5. Sto ova odluka ne radi

- Ne mijenja kod, bazu ni Stripe; to su M2 i M3 (T77) i M4 (T78).
- Ne otvara zadatke za M5 i M6; oni idu uz P-A u `docs/roadmap/PRODUCTION_BACKLOG.md`.
- Ne mijenja `MONETIZACIJA_V1.md`.
