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

## Krug 2026-09-10 do 2026-09-12: T02 do T15 (grana `plan/t02-t06-2026-09-10`)

Vlasnikova rijec "Napravi sve iz plana T00 do T15" (2026-09-10) ukljucila je i datoteke redizajna `/rad/`. Sve
promjene u `src/ui/app.ts` su unutar ratcheta (`ui-module-budget`): prostor je napravljen seljenjem dupliciranog koda
(graditelj liste stavki, preklopnik dubinskog ciscenja, recenica ishoda) iz `app.ts` u `repair-panel.ts` i
`repair-outcome-view.ts`.

| zadatak | sto je izvedeno | dokaz |
| --- | --- | --- |
| T02 | `data-testid` na stvarnim elementima (`repair-entry` je UVIJEK omogucen gumb: sigurne stavke ili simulacija), tri ulaza u popravak | `tests/ux/repair-entry-visible.spec.ts`, 4 testa x 2 projekta zeleno |
| T03 | dovrsetak: oznake `document-profile` (kartica profila na koraku 2) i `analysis-results`, `production-journey` do `repair-workflow` | `tests/ux-dist/production-journey.spec.ts` |
| T05 | ista projekcija na kartici i u rezultatu, recenica po osnovi dokaza | `tests/profile-claim-ui.test.ts` (+5) |
| T06 | holdout, provenijencija ocekivanja, verzija Worda u ovjeri, `mapLimited` (OOM nad 315 dokumenata), prvo mjerenje 321 dokumenta | `real-corpus-protocol.md` odjeljak 4, `tests/real-corpus-holdout.test.ts` |
| T08 | kontroler vezan na lokalni i serverski panel; ledger emitira `change` | `tests/repair-workflow-binding.test.ts` |
| T09 | pravi checkboxovi u planu, sazetak, odabir u kontroler; NALAZ USPUT: podnozje plana na mobilnom guralo gumb izvan ekrana (scrollWidth 393 -> 877), popravljeno gridom | `tests/ux/repair-plan-selection.spec.ts`, `tests/desk-mount.test.ts` (+4) |
| T10 | provjereni ishod na oba puta, politika oporavka, `check-existing-job` prije ponavljanja | `tests/repair-recovery.test.ts`, `tests/ux/repair-recovery.spec.ts` (4 zeleno na chromiumu) |
| T12 | nova verzija rada, snimke u sesiji, pitanje o povezivanju, sazetak razlike | `tests/document-revisions.test.ts` (15), `tests/ux/document-revisions.spec.ts` |
| T13 | mentorovi komentari kao zadaci u ruti `/rad/`, fixture s komentarima generirana skriptom | `tests/mentor-tasks-ui.test.ts` (7), `tests/ux/mentor-tasks.spec.ts` |
| T14 | registar dogadjaja toka, gard da se svaki emitira | `tests/product-journey-telemetry.test.ts`, `docs/quality/product-metrics.md` |
| T15 | protokol pilota i spremnost izdanja | `usability-protocol.md`, `release-readiness.md`; pilot NIJE proveden (vlasnik) |

Sto ostaje vlasniku: potpis ovjere korpusa nad 321 dokumentom (i odluka o `holdout` potvrdi), pilot s korisnicima,
objava kandidata nakon novog dokaza izdanja nad spojenim masterom.

## Krug 2026-09-12: unos programa T16 do T47 (grana `wf/t16-plan-do-live`)

Program do javnog lansiranja iz vlasnikova plana unesen je u postojeci sustav. Ovo je DOKUMENTACIJSKI
unos: nijedna datoteka izvan `docs/` nije dirana, nijedan artefakt u `docs/generated` ili
`data/generated` nije regeneriran, i nijedan novi statusni sustav nije uveden.

| stavka | vrijednost |
| --- | --- |
| novi `baselineCommit` | `afccbdd78af4d09f7ff9097adc45e05e3fc41287` (`origin/master` u trenutku unosa) |
| prethodni `baselineCommit` | `7bdd70853392b092dfa271aef077118df4b18325` |
| polaziste plana | master `7e52bc66551d7d920ab83810f87f0c52a10f8c16` |
| razlika mastera od tog polazista | SAMO PR #74 i #75, oba "workflow bez Fablea" (`.claude/workflows/lekta-no-fable-coding.js`, `docs/agents/no-fable-workflow.md`); bez izmjene aplikacijskog koda, pa nalazi plana vrijede nepromijenjeni |
| kanonski tekst programa | `docs/agents/plan-do-live-2026-09-12.md` (doslovna kopija, sha256 `1b2af479a68609df1571bc98f040a93ff896a27e1940c6d1b11ef012564ece46`) |
| red zadataka | `docs/agents/tasks.json`, 48 zapisa (T00 do T47) |
| opisi zadataka | `docs/agents/development-plan.md`, "Podplan F" |
| nalazi i vlasnici | `docs/AUDIT_MASTER.md`, odjeljak 17 |

### Sto je promijenjeno u redu zadataka

- **T00 do T14:** nedirnuti. Provjereno usporedbom sa `HEAD:docs/agents/tasks.json`, 0 izmijenjenih zapisa.
- **T15:** `ready` -> `blocked`, `dependsOn` `["T14"]` -> `["T14","T46"]`. Spremnost ovjerenog kandidata
  (T46) je novi preduvjet pilota; stara biljeska je sacuvana i samo dopunjena.
- **T16 do T47:** 32 nova zapisa. `id`, `title` i `dependsOn` su STROJNO preuzeti iz JSON bloka odjeljka
  11 vendoranog plana i provjereni polje po polje (0 razlika). Svaki nosi `note` s prioritetom P0 ili P1
  iz odjeljka 6 i jednom recenicom sto je dokaz zatvaranja.
- **Svi T17 do T47 su NEZAPOCETI** (`blocked`, kako ih plan i postavlja). T16 je `in_review`, ne `done`:
  ovaj commit ga izvodi, a `done` postavlja koordinator nakon prihvacenog dokaza. `implementationAgent`
  je postojece polje sheme (`scripts/agents/core.mjs`, review faza), ne novo.

### Dokaz ovog kruga

| provjera | ishod |
| --- | --- |
| `npm run agents -- list` | prolazi, ispisuje svih 48 zadataka; validator (`validateQueue`) bez duplikata, ciklusa i nepoznatih statusa |
| gard-mutacija nad prosirenim redom | baseline prolazi; odbijeno svih sest podmetnutih kvarova: duplikat `T20`, ciklus `T20` -> `T21` -> `T20`, samoovisnost `T47`, nepostojeca ovisnost `T99`, status `needs_verification`, ID `T100` |
| usporedba s planom | `T16` do `T47`: 0 razlika u `id`, `title` i `dependsOn`; prioriteti u `note` i u Podplanu F poklapaju se s odjeljkom 6 (0 razlika) |
| vendorani plan | bajt jednak izvoru (sha256 iznad); 991 redak, UTF-8 bez BOM-a, LF |
| citaci prave datoteke | `scripts/agents/cli.mjs` (validator iznad) i `scripts/autonomy/policy.py` (samo popis kontrolnih putanja, bez ogranicenja broja zapisa). Nijedan test ne tvrdi broj zadataka ni `baselineCommit`, pa nijedan test nije mijenjan |

Sto NIJE dokazano ovim krugom: `tests/agent-workflow-cli.test.ts` je na Windowsu preskocen po dizajnu
(`describe.skipIf(process.platform === 'win32')`, POSIX shebang u testnom izvrsnom programu), pa 4 od 4
testa nisu izvedena. Taj test ionako gradi VLASTITI privremeni `tasks.json` s jednim zapisom i ne cita
pravu datoteku, ali njegov prolaz nad ovom promjenom nije izmjeren lokalno; mjerodavan je CI.

Sljedeci korak nije najnizi broj nego kritican put: `T18` -> `T20` -> `T22`/`T24` -> `T25`/`T27` -> `T30`
-> `T44` -> `T46` -> `T15` -> `T47`. Koordinator postavlja zadatak u `ready` kad su mu ovisnosti `done`.
