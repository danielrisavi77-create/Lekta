# T18 staging dokaz, 2026-09-21

## CLI i kljucevi

- npx --no-install supabase --version: 2.109.1.
- supabase login: uspjesno, CLI je vratio potvrdu prijave.
- supabase projects list: staging bnyemcnsphlitjradrst i produkcija zrrjttizjyfcxmcpgzml su ACTIVE_HEALTHY.
- Staging legacy anon kljuc zapisan je lokalno u .env kao SUPABASE_STAGING_ANON_KEY. Datoteka je gitignorirana; vrijednost nije u repozitoriju i nije postavljena u VITE_* varijablu.
- Service role kljuc nije zapisan na disk. Koristen je samo u memoriji za kratki staging smoke i odmah odbacen.

## Staging baza i Storage

- PostgreSQL 17.6, auth.users, storage.objects i repair_jobs postoje.
- Migracijski identitet staginga: lokalne migracije 0001 do 0103, dodatne 0104 do 0114 koje pripadaju Katedri, zatim zajednicke 0200 do 0202; lokalni parovi 0200 do 0202 odgovaraju stagingu.
- RLS provjera: entitlements i document_slots imaju auth select, sedam restrictive trajnih politika postoji, anon nema execute nad helper funkcijama, authenticated ima execute.
- Svi provjereni bucketi su privatni: academic-project-files, corpus, guarantee-evidence, katedra-temporary-materials i repair.

## Staging closed loop

Koristen je sintetski fixture tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx.

1. Kreiran je privremeni sinteticki korisnik.
2. Prijava preko Auth password flowa uspjesna je.
3. Kreiran je privremeni entitlement za diplomski.
4. repair-docx je vratio HTTP 200 i jednu stvarnu promjenu.
5. Privatni objekt repair/<user>/<job>/fixed.docx preuzet je s HTTP 200 i tocno 3350 bajtova.
6. delete-repair-job vratio je HTTP 200.
7. Sinteticki korisnik obrisan je kroz Admin Auth API.

Nije koristen stvarni studentski rad ni osobni podatak.

## Dodatni javni endpointi

- Staging health vraca HTTP 200 s DB dependency statusom ok.
- extraction-probe: 40 zahtjeva, sedam profila, bez dokaza i bez rate limita.
- Bez autha: Auth health vraca 401, repair-docx 401, delete-repair-job 401, client-error GET 405.
- Staging ima 28 aktivnih Edge funkcija; repair-docx je v5, source-check v5, delete-repair-job v4.

## Ogranicenje

Management API dopusta popis projekata i staging kljuceve, ali produkcijski migracijski i function endpoint za zrrjttizjyfcxmcpgzml vraca 401. Produkcijska DB lozinka nije dostupna u lokalnom okruzenju, pa se identitet produkcijskih migracija ne prikazuje kao zelen. Nema nikakve produkcijske promjene.
