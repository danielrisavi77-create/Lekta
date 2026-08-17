<!--
Audit 2026-08-17 (CODE-20): promjena nije morala navesti sigurnosni utjecaj, migracije, rollback,
nove env varijable ni testni dokaz. Ovaj predlozak trazi upravo ono sto se u ovom projektu vec
pokazalo skupim kad je izostalo. Sekcije koje ne vrijede oznaci s "ne dira", ne brisi ih:
prazna sekcija je odgovor, izbrisana sekcija je propust koji se ne vidi.
-->

## Sto i zasto

<!-- Sto se mijenja i koji problem rjesava. Ako postoji nalaz iz AUDIT_MASTER.md, navedi ID. -->

## Dokaz da radi

- [ ] `npm run check` zelen (tsc + vitest + build)
- [ ] Ako dira `src/repair/**`, `src/docx/**` ili `src/analysis/**`: golden testovi zeleni i
      snapshot promjena je OBRAZLOZENA (sto se tocno promijenilo i zasto je to namjeravano)
- [ ] Ako dira repair motor: `npm run verify:strict-open` i `npm run verify:word` na Windowsu
      (`npm run check` je samo Tier 0 i ne otvara dokument nijednim stvarnim uredivacem)

<!-- Zalijepi relevantan ispis, ne samo "prolazi". -->

## Baza

- [ ] Ne dira bazu
- [ ] Dodaje migraciju: `supabase/migrations/____`
- [ ] Migracija je idempotentna (`if not exists` / `drop ... if exists` prije `create`)
- [ ] Provjereno `npm run migration-identity` (bez novog drifta)

Migracije se primjenjuju ISKLJUCIVO kroz `supabase db push`. MCP `apply_migration` nad Lektinim
bazama se ne koristi: stvara drugi identitet za isti zahvat (vidi `docs/deploy/MIGRATION_IDENTITY.md`).

## Sigurnost i privatnost

- [ ] Ne mijenja ono sto se salje na posluzitelj
- [ ] Mijenja: <!-- sto tocno, i je li pravni tekst uskladjen -->
- [ ] Ne slabi nijedan gate (CORS, CSP, rate limit, RLS, grantovi, provjera potpisa)
- [ ] Ako uvodi fail-open ponasanje: obrazlozeno je zasto je propustanje sigurnije od odbijanja

## Nove environment varijable

- [ ] Nema novih
- [ ] Dodane u `.env.example` s objasnjenjem i oznakom `[klijent]` / `[server]` / `[build]`

Podsjetnik: sve `VITE_*` zavrsava u javnom bundleu. Nikad tajna.

## Povrat

<!-- Kako se ovo ponistava ako se pokaze losim. Za migracije: postoji li obrnuti zahvat.
     Za deploy: je li dovoljan revert commita ili treba i radnja nad bazom/Edge funkcijama. -->

## Utjecaj na obecanja korisniku

- [ ] Ne dira copy ni pravne tekstove
- [ ] Dira: <!-- provjereno da tvrdnja i dalje odgovara stvarnosti -->

Tvrdo pravilo (CLAUDE.md): Lekta mjeri i deterministicki popravlja FORMU. Nikad ne pise, ne
prepravlja i ne ocjenjuje recenice ni argumentaciju. Ako promjena dira vidljivi tekst dokumenta,
mora proci test vidljivog teksta i traziti izricitu potvrdu korisnika.
