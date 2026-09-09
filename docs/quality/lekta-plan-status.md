# Status plana "pouzdana provjera, popravak i revizije rada" (T00)

Karta vec rijesenih nalaza prema planu u `docs/agents/development-plan.md` (audit 8. rujna 2026 nad
`3c1af21b`). Izmjereno 2026-09-09 nad masterom `48c1fc9e` (merge PR #61) i granom `autonomy-2026-09-09`.
Status "vec rijeseno" ima dokaz PONASANJA (test ili mjerenje), ne samo komentar u kodu.

## Polaziste

| stavka | vrijednost |
| --- | --- |
| HEAD | master `48c1fc9e`; radna grana `autonomy-2026-09-09` (`d7b94731` = master + PR #60) |
| radno stablo | izolirani worktree, cisto pri pocetku; dijeljeno stablo (`docx-truthful-status`) pripada drugoj sesiji i nije dirano |
| alati | Node 24.14.1, npm 11.11.0, Python 3.12.10, Deno 2.9.3, Playwright 1.61.1, Word 14.0 (COM), Codex 0.153.4, Claude Code 2.1.266 (detalji: `docs/agents/autonomy-baseline.md`) |
| gdje se izvrsavaju obvezne provjere | `npm run check` lokalno i CI (Node 20 i 24, Deno); Playwright lokalno (1 radnik, 0 ponavljanja) i CI `ux-gate`; Word Tier 2 SAMO lokalno (Windows, COM); Deno provjere lokalno i CI |

## Nalazi 1.3 i zadaci T01 do T07

| zadatak | nalaz | status | dokaz / commit | preostalo |
| --- | --- | --- | --- | --- |
| T01 | gate dokaza prihvaca nepoznatu git usporedbu | **vec rijeseno** (PR #61, D3, `c2ee6e1f`) | `scripts/release-proof-core.mjs`: `treeDigest` iz `git ls-tree -r`, presude fresh/stale/unknown; `tests/release-proof-staleness.test.ts`; mutacija `dokaz/zastarjelost-nepoznata-prolazi-kao-svjeza`; izmjereno: identican otisak u punom (1613 commita) i plitkom (1) klonu, gate nad danasnjim dokazom kaze `NE ZNAM` | Predlozeni `classifyProofChanges(changedFiles)` NIJE implementiran jer je zamijenjen jacim ugovorom (otisak stabla umjesto popisa promjena); kriterij prihvacanja (dubina klona ne mijenja presudu, `unknown` ima poruku i ne-nulti kod) je ispunjen. Ekvivalent u Pythonu: `scripts/autonomy/gate.py` (`proof_staleness`), otisak izmjereno identican JS-u |
| T02 | CTA popravka ostavlja nadredjeni prikaz skriven | **djelomicno** (PR #61, D5, `7c902075`) | `scrollToRepairPanel` otvara napredni blok; `tests/ux/repair-cta-opens-panel.spec.ts` (4 od 4 pada bez retka, prolazi s njim; chromium i mobile-chromium) | testne oznake `repair-entry` i `repair-workflow` ne postoje; pokrivena je opca akcija i `[data-repair-plan-go]`, ne "akcija konkretnog nalaza" ni tipkovnica; objasnjenje za nalaz bez zahvata nije provjereno. Podrucje `/rad/` redizajna (odluka vlasnika 2026-09-09: ne dirati), pa ostatak ceka tu sesiju |
| T03 | javni ulazak nije master; test nad produkcijskim artefaktom | **djelomicno** (PR #61, D6, `9565ffe1`) | `playwright.dist.config.ts` + `tests/ux-dist/critical-path.spec.ts` nad `dist/` kroz `vite preview` (CI job `dist-gate`); `dist/build-info.json` s commitom; smoke tvrdi oblik i uz `--expect-commit` upozorava | nema `scripts/build-production.mjs` ni `LEKTA_UX_MODE=production`; E2E ne pocinje na `/` nego na `/rad/`; manifest identiteta pravila nije prosiren. Uzrok raskoraka javne stranice je POZNAT: objava zakljucana na `4d7c6f6e` (2026-09-06), dokaz izdanja `unknown`; vlasnik odlucio "ostavi kako jest". Nalaz usput 2026-09-09: periodicki smoke crven zbog `build-info.json` 404 na staroj objavi, popravljeno u ovoj grani (`unknown` ishod) |
| T04 | 23 high/critical u punom auditu | **djelomicno** (PR #61, D2, `25a158b3`) | ratchet `data/security/npm-audit-ratchet.json` (23), `scripts/npm-audit-ratchet.mjs --selftest`, workflow bez `continue-on-error`; mutacija `supply-chain/porast-nalaza-nevidljiv` | sanacija nije izvedena; `docs/quality/dependency-decisions.md` (ova grana) imenuje tri grupe: 14 pod `netlify-cli` (major), 2 pod `vitest` (major, critical), 7 popravljivih bez majora (`npm audit fix`, zaseban PR); iznimke s vlasnikom i istekom 2026-10-09; zabrana `npm audit fix --force` vrijedi |
| T05 | dokazi profila razlicite snage | **djelomicno** (PR #61, D4, `2168d925`) | `proofSource` po retku ledgera ('profile' / 'unit-work-type'), `attestedProfileWorkTypes`, `proofNotes` u artefaktu, UI prepisuje napomenu; izmjereno 12 izravnih / 19 naslijedjenih A profila; mutacija `ledger/naslijedjeni-dokaz-bez-izvora` | predlozeni `evidenceBasis` ('direct' / 'inherited' / 'synthetic' / 'not-demonstrated') i `testedProfileIds` u `evidence-projection.ts` nisu uvedeni; kartica profila i rezultat ne prikazuju istu projekciju |
| T06 | stvarni ucinak popravka na korpusu | **neprovjereno** | harness postoji (`tests/real-corpus/harness.ts`, `scripts/repair-real-corpus.mts`); korpus je lokalan i sidecari mijenjaju nazivnik (CLAUDE.md) | protokol `docs/quality/real-corpus-protocol.md`, `targetedCheckCount` kontrola i izdvojeni skup nisu napravljeni; trazi stroj bez opterecenja i vlasnikov odabir 5 do 10 profila |
| T07 | multipart parsiran prije granice velicine | **vec rijeseno** (PR #61, D1, `38c41656`) | `readBytesBounded` / `readFormDataBounded` / `metaWithinBudget` u `_shared/read-body.ts`; `repair-docx`, `field-render`, `unsubscribe-reminder`; staticki gard `tests/edge-formdata-bounded.test.ts`; mutacije `edge/multipart-bez-granice`, `edge/meta-dio-bez-granice`; tijelo 4x iznad granice bez Content-Length daje `too_large` i citac je otkazan | ime `readLimitedBytes` iz plana nije koristeno (ekvivalent `readBytesBounded`); ogranicenje BROJA multipart dijelova nije uvedeno; Deno endpoint test s `curl` chunked tijelom rucno nije ponovljen |

## T08 do T15

Nisu zapoceti. T08 do T10 diraju `repair-panel.ts`, `repair-plan-view.ts` i `desk-mount.ts`, koje sesija
redizajna `/rad/` upravo mijenja (odluka vlasnika 2026-09-09: "nemoj to dirati"); kriteriji prihvacanja za
plan popravka s pravim kontrolama su zapisani kao D7 u planu audita. T11 do T15 ovise o njima.

## Ovaj krug (grana `autonomy-2026-09-09`)

| stavka | status |
| --- | --- |
| Autonomni kontroler, Zadaci 0 do 7 iz plana autonomije | kod, 91 Python test, CI workflow, runbook; `observe` nacin, izdavac iskljucen (vidi `docs/agents/autonomy-runbook.md`) |
| `scripts/agents/core.mjs`: pretplatnicki nacin | `--subscription`: bez budzeta, bez Fablea, odbija API kljuc u okolini; rucni `--budget-usd` nacin nepromijenjen |
| post-deploy-smoke: `build-info` 404 | `unknown` ishod: `--expect-commit` (cron, usporedba s masterom) upozorava, novi `--require-build-info` (konkretna objava) pada; klasifikacija ne moze biti `ok` bez ijednog prolaza; izlaz preko `process.exitCode` (`process.exit()` uz zivu fetch uticnicu na Windowsu vraca 0xC0000409); test `tests/post-deploy-smoke-build-info-cli.test.ts` s pravim lokalnim posluziteljem; izmjereno nad zivom stranicom: 27 ok + 1 unknown, exit 0 odnosno 1 |
| `npm run check` nad granom | ZELEN 2026-09-09 (izolirani worktree, `VITEST_MAX_THREADS=2`): oxlint, tsc, Deno 25 funkcija, vitest 516 datoteka / 5975 testova (1 datoteka i 4 testa preskoceni po dizajnu), vite build; `orphan-scan` cist. Smoke paket (3 datoteke, 23 testa) i 91 Python test pokrenuti odvojeno nakon zadnje izmjene smoke skripte, zeleni |

## Dokaz izdanja 2026-09-10 (grana `release/2026-09-10`, commit `f9e0f310`)

| stavka | izmjereno |
| --- | --- |
| Osnova | master `e9dcc52a` (PR #68: `scripts/build-production.mjs`, E2E s `/`, popravak zamrzavanja nakon primopredaje) |
| Zasto nov dokaz | prvi dokaz `de18daa8` (grana `release/2026-09-09`, na `27f0ae1f`) nosi kvar: cross-document View Transition (`@view-transition { navigation: auto }` u `src/shared/motion.css`) zamrzavao je `/rad/` nakon navigacije s `/` (rAF 0 okvira), maskirano duplikatom `view-transition-name` do `76ed4492`. Nijedan od 219 UX testova to nije vidio jer nijedan nije polazio s `/`. Popravak: `navigation: none`; gard: `tests/ux-dist/production-journey.spec.ts` |
| Razine | check 6026 testova, conformance 536, slow 399, UX 219, ux-dist 6, strict-open, word, word-worst: sve `pass`; projections `fail` (screening redoslijeda commita, nije obvezan); extraction `unavailable` (bez `LEKTA_STAGING_ORIGIN`). `complete: true` |
| Produkcijski build | `DEPLOY=1 LEKTA_REQUIRE_RELEASE_PROOF=1 node scripts/build-production.mjs` nad `f9e0f310`: gate "otisak stabla jednak", `dist/build-info.json` nosi `f9e0f310` |
| Proba nakon builda | `/` pa `location.assign('/rad/')` nad `dist/` kroz `vite preview`, 3 mjerenja: rAF 1, 0, 0 ms (prije popravka 0 okvira u 3 s) |
| Objava | rucno, na rijec vlasnika: `netlify deploy --prod --no-build --dir dist`, pa `node scripts/post-deploy-smoke.mjs --require-build-info --expect-commit f9e0f310` |
