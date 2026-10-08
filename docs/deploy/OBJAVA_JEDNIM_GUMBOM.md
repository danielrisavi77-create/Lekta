# Objava jednim gumbom

Workflow `.github/workflows/release.yml` objavljuje klijent (Netlify) i Edge funkcije
`repair-docx` i `create-checkout` iz istog commita mastera, zajedno, prvo na staging, a na
produkciju tek kad vlasnik odobri u GitHub environmentu `production`. Odluka vlasnika 2026-10-08.

## Zasto

Klijent i te dvije funkcije dijele ugovor o privoli (`termsVersion`). Klijent objavljen bez njih
dobiva `400 consent_required` na popravku i kupnji (`docs/GO_LIVE_REPAIR.md`). Rucna objava je to
drzala samo disciplinom.

## Redoslijed (u svakoj okolini)

1. `scripts/release-inputs.mjs`: commit je 40-znamenkasti SHA, upravo checkoutan i na
   `origin/master`; svaka funkcija postoji u `supabase/functions`; svaka migracija postoji u
   `supabase/migrations`; `SUPABASE_PROJECT_REF` i `SITE_ORIGIN` su postavljeni.
2. `node scripts/build-production.mjs`: isti lanac kao `netlify.toml`. Build ide PRIJE ikakvog
   deploya, pa pad builda ne ostavlja nista napola objavljeno. Produkcija trazi tvrdi dokaz izdanja
   (`LEKTA_REQUIRE_RELEASE_PROOF=1`); staging ne, jer se dokaz (Tier 2) pece upravo nad stagingom.
3. Samo staging: `supabase link` pa `supabase db push --linked`, prvo suhi prolaz u log (odluka
   vlasnika 2026-10-08: staging bez njegovog racunala). Produkcijske migracije i dalje primjenjuje
   vlasnik rucno, a gard obara `db push` u produkcijskom jobu. Zatim
   `scripts/release-migration-check.mjs`: trazene migracije (zadano 0207 i 0209) su u dnevniku
   ciljnog projekta, po imenu. Samo citanje kroz Management API. Bez 0209 `repair-docx` vraca 503
   na svaki popravak (`docs/deploy/EDGE_DEPLOY_T20.md`, val 0). Nepoznato stanje je pad.
4. `supabase functions deploy <funkcije> --project-ref <ref> --use-api`, pa odmah
   `netlify-cli@27.10.2 deploy --prod --dir dist --no-build`.
5. `post-deploy-smoke --require-build-info --expect-commit <sha> --strict-commit`: posluzeno je
   bas ovo izdanje.

Produkcijski job pocinje tek kad je staging job zelen i kad vlasnik klikne Approve.

Workflow namjerno NE primjenjuje migracije na produkciju, ne
mijenja tajne i ne dira Supabase ni Netlify postavke. Gard: `tests/release-workflow.test.ts`,
mutacije u `tests/gate-mutations-release.test.ts`.

## Sto vlasnik treba postaviti (jednom)

Nista od ovoga nije postavljeno. Imena su ista u oba environmenta, vrijednosti razlicite.

GitHub, Settings, Environments:

| Environment | Postavka | Vrijednost |
| --- | --- | --- |
| `staging` | Deployment branches | samo `master` |
| `production` | Required reviewers | `danielrisavi77-create` |
| `production` | Prevent self-review | iskljuceno (vlasnik je i pokretac i odobravatelj) |
| `production` | Deployment branches | samo `master` |

Po environmentu, Secrets:

| Ime | staging | production |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | osobni token za Management API (moze isti) | isti ili zaseban token |
| `NETLIFY_AUTH_TOKEN` | Netlify personal access token | isti |
| `SUPABASE_DB_PASSWORD` | lozinka staging baze (za `db push`) | NE postavljati |

Po environmentu, Variables (javne vrijednosti, nisu tajne):

| Ime | staging | production |
| --- | --- | --- |
| `SUPABASE_PROJECT_REF` | `bnyemcnsphlitjradrst` | `zrrjttizjyfcxmcpgzml` |
| `SUPABASE_ANON_KEY` | anon kljuc staginga | ne treba (kanonski u `src/config/deployment.ts`) |
| `NETLIFY_SITE_ID` | ID staging Netlify sitea | ID produkcijskog sitea |
| `SITE_ORIGIN` | origin staging sitea, bez zavrsne `/` | `https://lekta.hr` |
| `TURNSTILE_SITE_KEY` | prazno dok captcha nije ukljucena (T89) | isto |

Otvoreno pitanje: postoji li zaseban Netlify site za staging. Ako ne, treba ga napraviti
(rucna objava, bez Git povezivanja), inace staging job nema kamo objaviti klijent.

## Pokretanje

Actions, `release`, Run workflow: upisi SHA mastera. Popis funkcija i migracija ima zadane
vrijednosti. Staging job ide odmah; produkcijski ceka odobrenje.

## Povrat

Klijent: Netlify, Deploys, prethodni deploy, Publish deploy. Funkcije: isti workflow s prethodnim
SHA mastera, ili rucno prema `docs/deploy/EDGE_DEPLOY_T20.md`, odjeljak Povrat. Migracije 0207 i 0209
su aditivne, pa povrat koda ne trazi povrat baze.
