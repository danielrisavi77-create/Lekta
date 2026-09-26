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

## T18 A/B fixture set

- Kreirana su dva odvojena sintetska Auth korisnika, A `t18-staging-a@invalid.lektahr.net` i B `t18-staging-b@invalid.lektahr.net`; oba se mogu prijaviti kroz password flow (HTTP 200). Nisu korišteni stvarni osobni podaci.
- Kreirana su dva staging proizvoda `t18_staging_test_a` i `t18_staging_test_b`. Tablica `products` nema zaseban `test_mode` stupac, pa su proizvodi sigurno označeni s `active=false`, `price_eur=0.00` i `mor_product_id` koji završava s `_test_mode`. Nije pozvan checkout i nije diran produkcijski katalog.
- Kreiran je privatni bucket `t18-private-fixtures` (DOCX MIME, 20 MiB). U njega je prenesen autorski fixture `t18/fer-diplomski-prazni-odlomci.docx` veličine 100090 bajtova.
- Signed URL preuzima fixture s HTTP 200 i 100090 bajtova; izravni neautorizirani object GET vraća HTTP 400. Service role ključ nije zapisan na disk.

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

## Migracijski identitet i okruženja

- Read-only `npm run migration-identity` s trenutnog repozitorijskog HEAD-a uspješno je usporedio oba projekta po imenu migracije. Produkcija ima 107 zapisa: 103 poklopljena, tri repozitorijske migracije 0200-0202 nedostaju, a četiri zapisa postoje samo u bazi. Staging ima 117 zapisa: svih 106 repozitorijskih migracija je prisutno, uz 11 dodatnih migracija druge cjeline 0104-0114. Nema dvostrukih identiteta.
- Staging secret manifest je pregledan bez čitanja vrijednosti. Service role, DB URL i ostale tajne nisu iznesene u klijentski bundle. Staging build i dalje zahtijeva eksplicitne `VITE_LEKTA_SUPABASE_URL` i `VITE_LEKTA_SUPABASE_ANON_KEY`; bez njih razvojni fallback je lokalni Supabase, a ne produkcija. Produkcijski Netlify origin je zaseban.
- Kanonski staging frontend je `https://lekta-staging.netlify.app` (Netlify projekt `lekta-staging`). Javni deployment bundle ima `mode=staging` i odabrani Supabase origin `https://bnyemcnsphlitjradrst.supabase.co`; produkcijski origin nije odabran.
- Staging `ALLOWED_ORIGIN` postavljen je preko `supabase secrets set` na `https://lekta-staging.netlify.app`. Nakon toga OPTIONS za `repair-docx`, `source-check` i `profile-rules` vraća 200 i točan `Access-Control-Allow-Origin` samo za staging frontend; produkcijski origin i localhost ostaju bez tog headera.
- `LEKTA_STAGING_ORIGIN` u lokalnom `.env` ostaje Supabase staging origin, jer `extraction-probe` izravno gađa `/functions/v1/profile-rules`. Probe je uspješno izveo 40 zahtjeva, dobio sedam distinct profila, bez evidence markera i ispod praga 25.
- Auth settings staginga potvrđuju email prijavu, uključenu registraciju i isključene Google/GitHub providere. Supabase Auth javni settings endpoint ne izlaže redirect allow-listu.
- Auth redirect allow-lista nije izložena kroz javni settings endpoint; zato je provjerena dostupna frontend konfiguracija i CORS, dok se točan dashboard-only redirect popis ne tvrdi kao neovisno potvrđen.

## Ograničenje

Produkcijsko čitanje funkcija i migracijskog identiteta sada je uspjelo read-only putem prijavljenog CLI-ja. Produkcijska usporedba nije zelena: tri repozitorijske migracije 0200-0202 nisu nađene, a četiri produkcijska zapisa nisu u repozitoriju. Nema nikakve produkcijske promjene; usklađivanje traži zasebnu odluku i migracijski plan.
