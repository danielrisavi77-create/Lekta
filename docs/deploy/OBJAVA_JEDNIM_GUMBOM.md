# Objava jednim gumbom

Workflow `.github/workflows/release.yml` objavljuje klijent (Netlify) i Edge funkcije
`repair-docx` i `create-checkout` iz istog commita mastera, zajedno, prvo na staging, a na
produkciju tek kad vlasnik odobri u GitHub environmentu `production`. Odluka vlasnika 2026-10-08.

## Zasto

Klijent i te dvije funkcije dijele ugovor o privoli (`termsVersion`). Klijent objavljen bez njih
dobiva `400 consent_required` na popravku i kupnji (`docs/GO_LIVE_REPAIR.md`). Rucna objava je to
drzala samo disciplinom.

## Redoslijed (u svakoj okolini)

0. Prije ijednog koda iz checkouta, samo git i ljuska: SHA je 40 znakova malim slovima, upravo
   checkoutan i predak `origin/master`. Commit s grane tako ne moze zamijeniti ni samu provjeru.
1. `scripts/release-inputs.mjs`: commit je 40-znamenkasti SHA, upravo checkoutan i na
   `origin/master`; svaka funkcija postoji u `supabase/functions`; svaka migracija postoji u
   `supabase/migrations`; obje funkcije ugovora o privoli (`repair-docx`, `create-checkout`) su u
   popisu; migracije koje funkcija trazi (`repair-docx` 0209, `create-checkout` 0207) ne smiju
   ispasti iz popisa; `SUPABASE_PROJECT_REF`, `NETLIFY_SITE_ID` i `SITE_ORIGIN` moraju biti tocno
   kanonske vrijednosti cilja (`TARGETS` u skripti), a produkcijski ref i onaj iz
   `src/config/deployment.ts`; anon kljuc (staging iz vars, produkcija iz izvora) nosi `ref`
   cilja i `role` anon, a ciljni projekt ga prihvaca (`GET /auth/v1/settings` vraca 200); SHA je
   malim slovima, jer ga smoke usporedjuje doslovno.
2. Netlify CLI (`netlify-cli@27.10.2`) se instalira u koraku bez ikakvih tajni.
3. `node scripts/build-production.mjs`: isti lanac kao `netlify.toml`. Build ide PRIJE ikakvog
   deploya, pa pad builda ne ostavlja nista napola objavljeno. Produkcija trazi tvrdi dokaz izdanja
   (`LEKTA_REQUIRE_RELEASE_PROOF=1`); staging ne, jer se dokaz (Tier 2) pece upravo nad stagingom.
4. Samo staging: `scripts/release-staging-history.mjs` za Katedrine verzije 0104 do 0199 koje
   postoje samo u bazi pise privremene placeholdere u checkout runnera (isti put kao
   `docs/deploy/KANAL_A_UKLJUCIVANJE.md`), a svaku drugu neuskladenost (verzija samo u bazi izvan
   tog raspona, ista migracija pod drugom verzijom) obara. Zatim `supabase link` pa
   `supabase db push --linked --include-all`, prvo suhi prolaz u log (odluka
   vlasnika 2026-10-08: staging bez njegovog racunala). Produkcijske migracije i dalje primjenjuje
   vlasnik rucno, a gard obara `db push` u produkcijskom jobu. Zatim
   `scripts/release-migration-check.mjs`: trazene migracije su u dnevniku ciljnog projekta, po
   imenu. Samo citanje kroz Management API. Bez 0209 `repair-docx` vraca 503 na svaki popravak
   (`docs/deploy/EDGE_DEPLOY_T20.md`, val 0). Nepoznato stanje je pad.
5. Klijent se ucita na Netlify kao neobjavljeni deploy (`deploy` bez `--prod`). Pad uploada
   zaustavlja objavu prije nego se Edge funkcije promijene.
6. `supabase functions deploy <funkcije> --project-ref <ref> --use-api`.
7. Tek tada se ucitani deploy objavi (`api restoreSiteDeploy`), pa klijent i funkcije stizu
   zajedno.
8. `post-deploy-smoke --require-build-info --expect-commit <sha> --strict-commit`: posluzeno je
   bas ovo izdanje, a `repair-docx` i `create-checkout` bez tokena vracaju 401 (funkcija postoji).
9. Samo nakon pada ili prekida izmedju Edge deploya i objave klijenta: `scripts/release-edge-rollback.mjs`
   procita commit zivog klijenta (`build-info.json`) i vrati funkcije na taj commit, jer deploy
   vise funkcija nije transakcija. Necitljiv commit je NE ZNAM i povrat ide rucno.

Oba joba smije pokrenuti samo vlasnik (`github.actor` i `github.triggering_actor`), jer staging
nema odobravatelja. Produkcijski job pocinje tek kad je staging job zelen i kad vlasnik klikne
Approve.

Workflow namjerno NE primjenjuje migracije na produkciju, ne
mijenja tajne i ne dira Supabase ni Netlify postavke. Gard: `tests/release-workflow.test.ts`,
mutacije u `tests/gate-mutations-release.test.ts`.

Preostali rizik: `netlify-cli` i `supabase` se izvrsavaju uz token, kao i u rucnoj objavi
(`docs/quality/dependency-decisions.md`). Verzije su prikovane.

## Postavke (postavljene 2026-10-08)

Vlasnik je postavio environmente, varijable i tajne. Imena su ista u oba environmenta.

| Environment | Postavka | Vrijednost |
| --- | --- | --- |
| `staging` | Deployment branches | samo `master`, bez odobravatelja |
| `production` | Required reviewers | `danielrisavi77-create`, self-review dopusten |
| `production` | Deployment branches | samo `master` |

| Ime | staging | production |
| --- | --- | --- |
| secret `SUPABASE_ACCESS_TOKEN` | postavljen | postavljen |
| secret `NETLIFY_AUTH_TOKEN` | postavljen | postavljen |
| secret `SUPABASE_DB_PASSWORD` | postavljen (staging baza) | namjerno ne postoji |
| var `SUPABASE_PROJECT_REF` | `bnyemcnsphlitjradrst` | `zrrjttizjyfcxmcpgzml` |
| var `SUPABASE_ANON_KEY` | anon kljuc staginga | ne treba (kanonski u `src/config/deployment.ts`) |
| var `NETLIFY_SITE_ID` | `f432ae00-c4f6-4ded-8c22-d4b71c7b8687` (lekta-staging) | `1e7526f5-7f0a-480e-8589-d79ee91ff7b0` |
| var `SITE_ORIGIN` | `https://lekta-staging.netlify.app` | `https://lekta.hr` |
| var `TURNSTILE_SITE_KEY` | prazno dok captcha nije ukljucena (T89) | isto |

Ako je staging site zakljucan lozinkom ili SSO-om, smoke nad stagingom dobiva 401 i job pada;
to je ispravno, ne zaobilazi se.

## Pokretanje

Actions, `release`, Run workflow: upisi SHA mastera. Popis funkcija i migracija ima zadane
vrijednosti. Staging job ide odmah; produkcijski ceka odobrenje.

## Povrat

Klijent: Netlify, Deploys, prethodni deploy, Publish deploy. Funkcije: isti workflow s prethodnim
SHA mastera radi samo ako taj SHA vec sadrzi `release.yml` i `scripts/release-*.mjs` i ako od
njega na staging nije primijenjena nijedna nova migracija (staging job tada namjerno pada na
neuskladenoj povijesti). Inace povrat ide rucno prema `docs/deploy/EDGE_DEPLOY_T20.md`, odjeljak
Povrat. Migracije 0207 i
0209 su aditivne, pa povrat koda ne trazi povrat baze.
