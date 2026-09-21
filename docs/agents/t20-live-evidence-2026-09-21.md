# T20 live dokaz, 2026-09-21

## Opseg i okolina

- Worktree: `agent/t20-edge-config`, baziran na T18 grani `04b96f77`.
- Staging: `bnyemcnsphlitjradrst`.
- Produkcija nije mijenjana. Produkcijski deploy drift ostaje zaseban promotion plan.

## Read-only inventar prije deploya

- `npm run deploy-drift` uspješno je pročitao oba projekta.
- Prije deploya staging je imao starije verzije četiri ciljne funkcije i dodatnu staging-only funkciju `cleanup-agent-payloads` iz druge cjeline.
- Produkcija ima osam funkcija koje postoje u repozitoriju, ali nisu deployane. Nijedna od njih nije promovirana ovim zahvatom.
- `npm run deploy-manifest` potvrđuje 27 funkcija, svih 27 s deklariranim `verify_jwt` i vlasnikom.

## Staging deploy

Deployano je isključivo:

- `repair-docx`, sada staging verzija 7, `verify_jwt=true`
- `delete-repair-job`, sada staging verzija 6, `verify_jwt=true`
- `profile-rules`, sada staging verzija 4, `verify_jwt=false`
- `client-error`, sada staging verzija 3, `verify_jwt=false`

Nije korišten `--prune`, nije brisana `cleanup-agent-payloads` i nije dirana produkcija.

## Dokaz sadržaja i pravila

- Supabase `functions download --use-api` potvrđuje jednak SHA-256 za live i lokalne ulazne datoteke svih četiriju funkcija.
- Jednaki su i zajednički moduli `cors.ts`, `hash-ip.ts` i `read-body.ts`.
- `npm run repair-recipe` je uspješno ponovljen. `data/generated/profile-rules-server.json` ostao je sadržajno isti.
- Live `profile-rules?v=1&profileId=adu-montaza-diplomski` vraća `datasetVersion` `8ce3bee1c654e7f063ff1b1bd7bb29906e9e7ad65bae22ed692048345d02e94f`, jednak lokalnom artefaktu.
- Live ETag za isti profil odgovara lokalnom ETagu `fc0fcdc04902d6f027bfad2424c8f0cb7f0e29c94ee42bf5cf353ba5f96794a1`.

## Live smoke

- `node scripts/post-deploy-smoke.mjs --site https://lekta-staging.netlify.app --functions https://bnyemcnsphlitjradrst.supabase.co/functions/v1`
- Rezultat: 24 operativne provjere prolaze, uključujući HTML, sigurnosna zaglavlja, sve assete, pravne stranice, health i odbijanje neautoriziranog `repair-docx` poziva.
- Početno mjerenje je pokazalo da `build-info.json` nedostaje na staroj staging objavi. Uzrok je bio zaseban staging build lanac koji je preskakao `npm run build-info`.

## Staging build identity, naknadna provjera

- `netlify.staging.toml` sada poziva `node scripts/build-production.mjs`, isti lanac kao produkcija i CI; guard u `tests/deploy-runtime-parity.test.ts` sprječava povratak na prepisani lanac.
- Commit promjene: `6908c4ac2770f4b1855d3d44b6f0ec06614ebbec`.
- Staging je ponovno izgrađen i objavljen na `https://lekta-staging.netlify.app`.
- Strogi smoke s `--require-build-info --expect-commit 6908c4ac2770f4b1855d3d44b6f0ec06614ebbec --strict-commit` prolazi: 29/29 provjera, uključujući `build-info.json` i točan SHA.
- Produkcijska objava nije mijenjana; njezin identitet i dalje se provjerava zasebnim release postupkom.

## Konfiguracijski inventar

- Staging tajne su popisane bez čitanja vrijednosti. Postoji 13 tajni, uključujući `ALLOWED_ORIGIN`, Supabase identitet i repair/source capove.
- Manifest navodi i tajne za naplatu, workere, integritet, podsjetnike, Katedru i preflight koje nisu prisutne na stagingu. To se tretira kao namjerno neaktivna ili nedovršena funkcionalnost, ne kao razlog za izmišljanje vrijednosti.
- Svaka takva aktivacija ostaje zaseban vlasnički paket: payment/provider, field-render worker, integrity provider, Katedra worker, preflight servis ili reminder mailer.
- Poznati staging-only `cleanup-agent-payloads` ostaje sačuvan; prije njegove sljedeće objave treba dodati deklaraciju u `config.toml` ili eksplicitno dokumentirati da pripada drugoj cjelini.

## Artefakti

- `docs/generated/DEPLOY_DRIFT.md` regeneriran nakon staging deploya.
- `supabase/deploy-manifest.json` regeneriran na commit `04b96f77a0f26e69cf1f09e6b06f54a1023a389c`.
