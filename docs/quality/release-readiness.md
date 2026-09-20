# Spremnost izdanja (T15)

Zavrsni pregled obveznih provjera na TOCNOM kandidatu objave, povezan s manifestom i dokazom izdanja. Ovo nije
popis kucica koje se oznace po sjecanju: svaki redak imenuje ARTEFAKT koji dokazuje tvrdnju i naredbu kojom se
ponovno proizvodi. Bez artefakta redak nije zelen.

## Kandidat

| stavka | vrijednost | odakle |
| --- | --- | --- |
| commit kandidata | `docs/generated/RELEASE_PROOF.json` -> `commit` | `npm run release:check` |
| otisak stabla | `RELEASE_PROOF.json` -> `treeDigest` | isti; gate `verify-deploy-dist.mjs` uz `LEKTA_REQUIRE_RELEASE_PROOF=1` |
| identitet artefakta | `dist/build-info.json` -> `commit` | `node scripts/build-production.mjs` |
| identitet pravila | `data/generated/profile-rules-server.json` (sha256 u artefaktu) | `npm run repair-recipe`; drift `tests/profile-rules-server.test.ts` |
| deploy manifest (Edge) | `docs/generated/deploy-manifest.json` | `npm run deploy-manifest`, drift `npm run deploy-drift` |

## Obvezne provjere po razini

| razina | naredba | dokaz | blokira izdanje kad |
| --- | --- | --- | --- |
| Tier 0 gate | `npm run check` (izolirani worktree) | `Test Files` redak, exit 0 | ijedna datoteka crvena |
| Tier 0 UX | `npm run test:ux` (chromium + mobile-chromium) | Playwright izvjestaj, 0 failed, 0 flaky | ijedan test crven; flaky se broji kao pad (`failOnFlakyTests`) |
| Tier 0 dist | `npx playwright test -c playwright.dist.config.ts` | isti, nad `dist/` | isto; tok od `/` do plana popravka mora proci |
| Tier 1 | `npm run verify:strict-open:repaired` | lxml nad POPRAVLJENIM paketima; prazan skup je crveno | ijedan paket ne prolazi |
| Tier 2 | `npm run verify:word`, `verify:word:worst` (Windows, Word COM) | ispis skripte, verzija Worda | ijedan paket Word odbija; preskocena razina NIJE prolaz |
| dokaz izdanja | `npm run release:check` | `RELEASE_PROOF.json`, `complete: true`, `dirtyWorkingTree: false` | `complete: false` ili dokaz stariji od izvora (`treeDigest` razlicit) |
| stvarni korpus | `LEKTA_LOCAL_CORPUS=1 ... repair-real-corpus.mts` | `repair-real-corpus.local.json` (izvan repozitorija) | `integrityFailureCount > 0` ili neobjasnjena `passRegressionCount > 0` u release skupu |
| ovisnosti | `node scripts/npm-audit-ratchet.mjs` | ratchet `data/security/npm-audit-ratchet.json` | broj high/critical iznad stropa |
| objava | `node scripts/post-deploy-smoke.mjs --require-build-info --expect-commit <sha> --strict-commit` | izlaz smokea, exit 0 | build-info nedostaje, identitet objave se ne da procitati, ili objavljeni sha nije kandidat |

`--strict-commit` nije ukras: BEZ njega je neslaganje sha-a samo `::warning::` uz izlaz 0, jer je ta
zastavica (bez stroge) periodicki nadzor nad namjerno zakljucanom objavom. Zavrsna potvrda izdanja
mora biti stroga. Cijeli postupak ovjere i proof-only commita stoji u
`docs/deploy/RELEASE_PROOF_WORKFLOW.md`; oba dokumenta opisuju isti korak i drzi ih usaglasenima
`tests/release-gate-wiring.test.ts`.

`dirtyWorkingTree: false` u dokazu govori o trenutku PECENJA dokaza, ne o trenutku gradnje. Cistocu
stabla iz kojeg se STVARNO gradi mjeri deploy gate (poruka `NECOMMITANE izmjene pracenih datoteka`),
jer se otisak stabla racuna iz commitanog stabla pa necommitanu izmjenu po konstrukciji ne vidi.

## Kriteriji koje pilot dodaje (T15)

- Nema otvorene prepreke koja onemogucuje osnovni tok (zadaci 1 do 3 protokola). Otvorena prepreka ide u tablicu
  ispod s izricitom odlukom vlasnika: popraviti prije izdanja, ili isporuciti uz smanjen opseg.
- Sudionici mogu objasniti rezultat bez zakljucka da tehnicka ocjena jamci prihvacanje rada.

| prepreka | korak | odluka | tko / kada |
| --- | --- | --- | --- |
| (pilot nije proveden; vidi `usability-protocol.md`) | | | |

## Stanje kandidata 2026-09-12

Zadnji potpun dokaz izdanja: master `e9dcc52a` (dokaz `59adbc8c`, svih 8 obaveznih razina PROLAZ, extraction mjerena,
projections screening). Grana s T02 do T15 (`plan/t02-t06-2026-09-10`) ima zelene ciljane testove; puni `npm run
check` i novi dokaz izdanja idu nakon spajanja, jer dokaz vrijedi za JEDAN otisak stabla.

Sto nije strojno: pilot s korisnicima, potpis ovjere korpusa nad 321 dokumentom (`real-corpus-protocol.md`, odjeljak
4), i odluka o `holdout` potvrdi. Sve tri su vlasnikove radnje i ovdje se ne prikazuju kao gotove.

## Velicina bundlea `/rad/` nakon radnog prostora tri faze (korak D, 2026-09-13)

Izmjereno iz `node scripts/build-production.mjs` (isti lanac kao netlify.toml, `DEPLOY=1`), na grani
`feat/radni-prostor-tri-faze` nakon C7:

| artefakt | sirovo | gzip (vite) | budzet (`bundleSizeGuard`, vite.config.ts) |
| --- | --- | --- | --- |
| `dist/assets/rad-*.js` | 761,1 kB (761 106 B) | 204,5 kB | 960 KB (983 040 B), iskoristeno 77 % |
| `dist/assets/rad-*.css` | 49,6 kB | 9,8 kB | (nema zasebnog budzeta) |
| `dist/rad/index.html` | 50,4 kB | 14,0 kB | |

Usporedna tocka PRIJE ovog rada nije izmjerena istim postupkom u istoj sesiji: biljeska uz `bundleSizeGuard` u
`vite.config.ts` navodi "app chunk 687 KB raw" iz vremena reza naslovnice, sto je jedini zapisan broj. Razlika
(oko 74 kB sirovo) nije razlucena po koraku i ne tvrdi se da je cijela iz radnog prostora tri faze. Gard od 960 KB
nije diran; hero inicijalizacije nisu uklanjane, jer nije dokazano da nisu potrebne.
