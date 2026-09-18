# Verification Router Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Dodati fail-closed `npm run verify:change` koji iz stvarnog Git diffa odabire, izvrsava i dokumentira obvezne gateove za svaku promjenu.

**Architecture:** JSON mapa nosi domensku politiku, a cetiri mala ESM modula odvajaju Git detekciju, validaciju i odabir gateova, izvrsavanje te izvjestavanje. Ciste funkcije ostaju u izvoznim modulima radi izravnih Vitest testova, dok CLI orkestrira stvarni Git i procese. Nepoznata putanja, prazan diff, nerazrjesiv base i nedostupan obvezni alat uvijek zavrsavaju kao `needs_human`.

**Tech Stack:** Node.js ESM, JSON, Git CLI, Vitest, npm scripts, postojeci Lekta gateovi.

**Design:** `docs/superpowers/specs/2026-09-18-verification-router-design.md`

---

## Izvedbena pravila

- Raditi samo na izoliranoj grani `codex/verification-router`.
- Za svaki ugovor prvo napisati test i vidjeti ocekivani RED.
- Ne dodavati novu npm ovisnost za globove.
- Vanjske naredbe testirati preko uske injektirane granice; selekciju, parsing i presudu testirati stvarnim funkcijama.
- Ne koristiti shell interpolaciju za argumente iz konfiguracije.
- Ne dopustiti da `migration-identity` vrati lazno zeleno kad nedostaju Supabase varijable.
- Ne commitati dok fokusirani testovi, puni `npm run check` i `npm run orphan-scan` nemaju svjez dovrsen rezultat.
- Commit mora koristiti `git commit --only` s eksplicitnim putanjama.

### Task 1: Fail-closed model konfiguracije i odabira

**Files:**
- Create: `config/verification-map.json`
- Create: `scripts/verification/select-gates.mjs`
- Create: `tests/verification-router.test.ts`

**Step 1: Napisati RED test za validaciju i osnovne rute**

U `tests/verification-router.test.ts` dinamicno uvesti buduci modul i izraziti prvi korisnicki ugovor:

```ts
it('repair promjena bira high-risk repair gateove i tvrdi minimum', async () => {
  const { validateVerificationMap, selectGates } = await import('../scripts/verification/select-gates.mjs');
  const config = validateVerificationMap(MINIMAL_MAP);
  expect(selectGates([{ path: 'src/repair/apply-fixers.ts', sources: ['committed'] }], config)).toMatchObject({
    risk: 'high',
    unknownPaths: [],
    gateIds: ['check', 'orphan-scan', 'focused-repair-tests', 'strict-open', 'slow', 'word', 'adversarial-review'],
  });
});
```

Rucno izvedeni `MINIMAL_MAP` mora biti literal i ne smije koristiti funkciju koja se testira za ocekivani rezultat.

**Step 2: Pokrenuti test i potvrditi RED**

Run:

```bash
npx vitest run tests/verification-router.test.ts
```

Expected: FAIL jer `select-gates.mjs` jos ne postoji ili nema trazeni izvoz.

**Step 3: Implementirati minimalnu validaciju i glob matcher**

U `select-gates.mjs` dodati:

```js
export function validateVerificationMap(raw) { /* schema + reference checks */ }
export function matchesPattern(path, pattern) { /* samo literal, *, ** */ }
export function selectGates(changes, config) { /* union + max risk + stable dedupe */ }
```

Validacija mora odbiti:

- nepodrzanu verziju
- duple gate i route ID-jeve
- nepoznate gate reference
- prazne ili nepodrzane globove
- command gate bez argv
- manual gate s argv
- ciklus u `covers`

**Step 4: Dodati stvarnu mapu ruta**

`config/verification-map.json` mora definirati:

- default: `check`, `orphan-scan`
- repair: focused-repair-tests, strict-open, slow, word, adversarial-review
- docx/audits/analysis: docx-golden-tests, strict-open, word, adversarial-review
- citations: citation-tests, verify-claims, adversarial-review
- UI: ux, visual
- Supabase: check-edge, migration-identity, db-smoke, security-checks, adversarial-review
- profile data: verify-claims, scored-value-drift, projection-freshness, conformance, adversarial-review
- router self-route: verification-router-tests, adversarial-review
- jasne generalne rute za ostali `src/**`, `tests/**`, `scripts/**`, `docs/**`, root konfiguraciju i podatke

Router self-route mora ukljuciti `package.json`, mapu konfiguracije, sva cetiri modula, vlastiti test, mutation test, CLAUDE i AGENTS upute te ovu specifikaciju i plan.

Gate naredbe cuvati kao argv nizove. `check` deklarira `covers: ["check-edge"]`.

Za `migration-identity` dodati requirements:

```json
{
  "env": ["SUPABASE_ACCESS_TOKEN"],
  "anyEnv": ["LEKTA_PROD_REF", "LEKTA_STAGING_REF"]
}
```

Time se sprjecava postojeci izlaz 0 skripte kada joj okolina nije konfigurirana.

**Step 5: Prosiriti testove i gledati svaki RED prije implementacije**

Dodati zasebne testove za:

- citations, UI, Supabase i profile-data rute
- uniju dviju ruta, stabilan redoslijed i najveci rizik
- `check` pokriva `check-edge`, ali se zahtjev vidi u planu
- unknown dodaje neacknowledgeable `needs-human`
- prazne promjene daju `needs_human`
- self-route je high risk
- malformed putanja je unknown
- neispravna mapa i ciklus pokrivenosti padaju prije selekcije

Nakon svakog testa pokrenuti isti fokusirani Vitest i potvrditi da pada iz razloga koji test imenuje, zatim dodati minimalnu implementaciju.

**Step 6: Potvrditi GREEN za Task 1**

Run:

```bash
npx vitest run tests/verification-router.test.ts
```

Expected: svi dotadasnji testovi PASS.

### Task 2: Stvarna Git detekcija, ukljucujuci rename i radno stablo

**Files:**
- Create: `scripts/verification/detect-change.mjs`
- Modify: `tests/verification-router.test.ts`

**Step 1: Napisati RED test za NUL name-status parser**

Test mora predati literalni zapis za obicnu izmjenu, brisanje i rename te ocekivati obje rename putanje:

```ts
expect(parseNameStatusZ('R100\0src/repair/a.ts\0src/ui/a.ts\0', 'committed')).toEqual([
  { path: 'src/repair/a.ts', sources: ['rename_from'] },
  { path: 'src/ui/a.ts', sources: ['rename_to'] },
]);
```

**Step 2: Pokrenuti fokusirani test i potvrditi RED**

Run `npx vitest run tests/verification-router.test.ts`.

Expected: FAIL zbog nepostojece funkcije ili pogresnog rename rezultata.

**Step 3: Implementirati ciste parsere i spajanje**

U `detect-change.mjs` dodati:

```js
export function normalizeRepoPath(value) { /* slash + fail-closed validacija */ }
export function parseNameStatusZ(raw, source) { /* A/M/D + R/C old/new */ }
export function parseUntrackedZ(raw) { /* NUL popis */ }
export function mergeChanges(groups) { /* path + ordered source set */ }
```

**Step 4: Dodati RED integracijski test s privremenim Git repozitorijem**

Test stvara temp repo, commitira base, zatim radi:

- jedan commit na grani
- jednu unstaged izmjenu
- jednu netrackanu datoteku
- jedan rename

Poziva stvarni `detectChanges({ repoRoot, base })` i tvrdi literalni sortirani popis putanja i izvora. Temp repo se uvijek cisti u `finally`.

**Step 5: Implementirati stvarne Git pozive**

Koristiti `execFileSync` ili injektirani ekvivalent, bez shella:

```text
git rev-parse --verify <base>^{commit}
git merge-base <base> HEAD
git diff --name-status -z --find-renames <merge-base>...HEAD
git diff --name-status -z --find-renames HEAD
git ls-files --others --exclude-standard -z
```

Vratiti base ref, base SHA, HEAD SHA, dirty oznaku, promjene i eventualni fail-closed razlog. Skripta ne radi `fetch`.

**Step 6: Potvrditi GREEN**

Run `npx vitest run tests/verification-router.test.ts`.

Expected: svi selector i Git detection testovi PASS.

### Task 3: Presuda, rucni gateovi i izvrsavanje bez shell interpolacije

**Files:**
- Create: `scripts/verification/run-gates.mjs`
- Modify: `tests/verification-router.test.ts`

**Step 1: Napisati RED testove za presudu**

Dodati testove koji preko injektiranog executora vracaju kontrolirane rezultate:

- svi command gateovi 0, manual bez ack, izlaz 2
- svi command gateovi 0, poznati manual s ack, izlaz 0
- unknown uz `--ack needs-human`, i dalje izlaz 2
- jedan command gate pada, izlaz 1 i ostali neovisni gateovi se ipak izvrsavaju
- missing env ili platforma daje `unavailable` i izlaz 2
- dry-run nepraznog plana daje `not_run` i izlaz 2

Testovi moraju asertirati stvarni rezultat plana i presudu, ne pozive fake executora.

**Step 2: Pokrenuti test i potvrditi RED**

Run `npx vitest run tests/verification-router.test.ts`.

**Step 3: Implementirati runner jezgru**

Dodati izvoze:

```js
export function parseArgs(argv) { /* --base, --dry-run, repeated --ack */ }
export function requirementStatus(gate, env, platform, executableLookup) { /* available/unavailable */ }
export function finalVerdict({ selection, results, detection }) { /* 0, 1, 2 */ }
export async function runSelectedGates(plan, options) { /* sequential, continue after command failure */ }
```

Poznati manual gate moze biti `acknowledged`. Sinteticki `needs-human` nikad nema ack put.

**Step 4: Implementirati sigurno razrjesavanje naredbi**

- `node` prevesti u `process.execPath`.
- `npm` pokretati kao `process.execPath + process.env.npm_execpath + ostatak argv`, jer je front door npm skripta i time se izbjegava Windows shell interpolacija.
- Ostale executable pozivati kao zaseban executable i argv niz.
- Ako npm runtime nije razrjesiv, gate je `unavailable`, ne pass.
- Ne zapisivati env vrijednosti u rezultat.

**Step 5: Spojiti CLI orkestraciju**

Kada se modul izvodi izravno:

1. ucitaj i validiraj JSON mapu
2. detektiraj promjene
3. odaberi gateove
4. provjeri ack argumente
5. izvrsi ili dry-run plan
6. predaj rezultat reporteru
7. postavi `process.exitCode`

Svaki izuzetak mora proizvesti eksplicitni `failed` rezultat, nikad prazan izlaz 0.

**Step 6: Potvrditi GREEN**

Run `npx vitest run tests/verification-router.test.ts`.

Expected: svi runner testovi PASS bez pokretanja stvarnog Worda, baze, mreze ili punog checka.

### Task 4: Konzolni i JSON izvjestaj bez tajni

**Files:**
- Create: `scripts/verification/report.mjs`
- Modify: `tests/verification-router.test.ts`

**Step 1: Napisati RED test za report ugovor**

Sastaviti literalni rezultat koji u `env` fixtureu ima sentinel `LEKTA_SECRET_CANARY`, pozvati reporter i tvrditi:

- JSON ima schemaVersion, base/head SHA, putanje, rute, rizik, gateove, ackove, status i exitCode
- command se zapisuje kao argv bez vrijednosti varijabli
- sentinel se ne pojavljuje u serializiranom JSON-u
- unknown putanja i `needs_human` vidljivi su u tekstualnom sazetku

**Step 2: Pokrenuti test i potvrditi RED**

Run `npx vitest run tests/verification-router.test.ts`.

**Step 3: Implementirati report modul**

Dodati:

```js
export function buildReport(input) { /* plain serializable object */ }
export function formatReport(report) { /* Croatian terminal summary */ }
export function writeReport(report, outputPath) { /* mkdir + atomic temp rename */ }
```

Zadana meta je `.artifacts/verification-router/latest.json`. Upis mora biti atomski i direktorij je vec gitignoriran.

**Step 4: Potvrditi GREEN**

Run `npx vitest run tests/verification-router.test.ts`.

Expected: report testovi PASS i sentinel nije prisutan.

### Task 5: Front door i self-routing

**Files:**
- Modify: `package.json`
- Modify: `config/verification-map.json`
- Modify: `tests/verification-router.test.ts`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

**Step 1: Napisati RED CLI contract test**

Test poziva CLI nad kontroliranim temp repoom i konfiguracijom te provjerava:

- `--dry-run` vraca 2 za neprazan plan
- `--base` se stvarno koristi
- nepoznat `--ack` vraca 1
- report nastaje na zadanoj testnoj putanji

Ako treba testabilnost, CLI smije dobiti interni `--config` i `--report` samo ako su dokumentirani i validirani; produkcijski defaulti ostaju fiksni.

**Step 2: Pokrenuti test i potvrditi RED**

Run `npx vitest run tests/verification-router.test.ts`.

**Step 3: Dodati npm skriptu**

U `package.json`:

```json
"verify:change": "node scripts/verification/run-gates.mjs"
```

**Step 4: Azurirati upute bez povecanja root konteksta iznad 200 redaka**

U `CLAUDE.md` tvrdi gate prikazati kroz front door:

```bash
npm run verify:change -- --base origin/master
```

Objasniti da router uvijek ukljucuje `check` i `orphan-scan`, a domenski gateovi dolaze iz promjena. `UNKNOWN`, manual i unavailable nikad nisu zeleni.

U `AGENTS.md` dodati kratku kompatibilnu uputu uz postojeci tvrdi gate, bez kopiranja cijele mape.

**Step 5: Potvrditi focused GREEN i kontekst limit**

Run:

```bash
npx vitest run tests/verification-router.test.ts tests/npm-script-targets.test.ts
npm run check:claude-context
```

Expected: oba testna modula PASS, root CLAUDE ostaje ispod 200 redaka.

### Task 6: Mutation dokaz da unknown stvarno zatvara prolaz

**Files:**
- Modify: `tests/gate-mutations.test.ts`
- Modify: `tests/verification-router.test.ts`

**Step 1: Napisati mutation zapis**

Uvesti `selectGates` i validiranu stvarnu mapu. Dodati mutaciju:

```ts
{
  id: 'verification-router/poznata-putanja-bez-rute',
  imitates: 'router kojem je iz konfiguracije ispala osjetljiva repair ruta pa nepoznatu promjenu pusta bez ljudske odluke',
  cleanBefore: () => selectGates([{ path: 'src/repair/apply-fixers.ts', sources: ['committed'] }], realMap).risk === 'high',
  caught: () => selectGates([{ path: 'src/repair/apply-fixers.ts', sources: ['committed'] }], mapWithoutRepairAndGeneralSrc).status === 'needs_human',
}
```

Mutirana mapa mora ukloniti i specificnu i generalnu rutu koje bi inace klasificirale putanju. Ne dira se datoteka na disku.

**Step 2: Pokrenuti mutation test i potvrditi RED**

Run:

```bash
npx vitest run tests/gate-mutations.test.ts
```

Expected: nova mutacija pada dok selector ne izlozi dovoljan fail-closed signal ili test nije pravilno spojen.

**Step 3: Dodati minimalnu selector podrsku potrebnu mutaciji**

Ako selector vec vraca `risk: unknown`, `unknownPaths` i `status: needs_human`, produkcijska izmjena nije potrebna; tada RED mora nastati prije dodavanja mutation zapisa kroz zaseban verification-router test koji dokazuje nedostajuci signal. Ne dodavati tautoloski test koji nikad nije vidjen crven.

**Step 4: Potvrditi GREEN**

Run:

```bash
npx vitest run tests/verification-router.test.ts tests/gate-mutations.test.ts
```

Expected: oba modula PASS, mutation broj raste i baseline je cist.

### Task 7: Dogfood router, puna verifikacija i siguran commit

**Files:**
- Verify all paths above

**Step 1: Pregledati diff prije skupih gateova**

Run:

```bash
git status --short
git diff --stat -- config/verification-map.json scripts/verification tests/verification-router.test.ts tests/gate-mutations.test.ts package.json CLAUDE.md AGENTS.md docs/superpowers/specs/2026-09-18-verification-router-design.md docs/superpowers/plans/2026-09-18-verification-router.md
git diff --cached --stat -- config/verification-map.json scripts/verification tests/verification-router.test.ts tests/gate-mutations.test.ts package.json CLAUDE.md AGENTS.md docs/superpowers/specs/2026-09-18-verification-router-design.md docs/superpowers/plans/2026-09-18-verification-router.md
git diff --check
```

Expected: samo navedene putanje, prazan cached diff, bez whitespace gresaka.

**Step 2: Pokrenuti fokusirane provjere**

Run:

```bash
npx vitest run tests/verification-router.test.ts tests/gate-mutations.test.ts tests/npm-script-targets.test.ts
npm run check:claude-context
npm run orphan-scan
```

Expected: svi fokusirani testovi PASS, kontekst ispod limita, orphan-scan cist.

**Step 3: Dokazati fail-closed dry-run**

Run:

```bash
npm run verify:change -- --base github/master --dry-run
```

Expected: tocno klasificira sve promijenjene putanje, prikazuje self-route i manual adversarial gate te zavrsava kodom 2 zato sto dry-run nije dokaz.

Run i negativna kontrola nad namjerno nepoznatom netrackanom putanjom u temp repou kroz test, ne stvaranjem otpada u radnom stablu.

**Step 4: Napraviti zaseban adversarijalni prolaz nad diffom**

Rucno traziti najmanje:

- unknown koji se moze ackati
- rename koji gubi staru putanju
- `migration-identity` bez env koji izgleda zeleno
- command injection kroz argv ili base
- config route koja ne pokriva vlastite datoteke
- `check-edge` dvostruko izvrsavanje
- prazni diff koji prolazi
- report koji zapisuje env vrijednost

Svaki stvarni nalaz prvo pretvoriti u failing test, zatim popraviti. Tek nakon zavrsenog prolaza dopusten je `--ack adversarial-review`.

**Step 5: Pokrenuti stvarni front door**

Run:

```bash
npm run verify:change -- --base github/master --ack adversarial-review
```

Expected: router sam bira self-route, izvrsava focused router tests, puni `check` i `orphan-scan`; svi rezultati PASS i `.artifacts/verification-router/latest.json` zavrsava statusom `passed`, kod 0.

Ako stroj nema dovoljno resursa ili obvezan alat nije dostupan, rezultat ostaje `needs_human` ili neprovjeren. Ne pretvarati ga u zeleno niti commitati dok se puni gate ne dovrsi lokalno ili na vjerodostojnom CI gateu.

**Step 6: Ponovno pregledati tocne putanje prije commita**

Run iste `git diff --stat` i `git diff --cached --stat` naredbe iz Step 1, zatim:

```bash
git status --short
```

Expected: nema tudih ni generiranih datoteka. `.artifacts/verification-router/latest.json` je ignoriran.

**Step 7: Commitati samo ciljane putanje**

Run:

```bash
git commit --only config/verification-map.json scripts/verification/detect-change.mjs scripts/verification/select-gates.mjs scripts/verification/run-gates.mjs scripts/verification/report.mjs tests/verification-router.test.ts tests/gate-mutations.test.ts package.json CLAUDE.md AGENTS.md docs/superpowers/specs/2026-09-18-verification-router-design.md docs/superpowers/plans/2026-09-18-verification-router.md -m "feat: add fail-closed verification router"
```

**Step 8: Provjeriti commit i granu**

Run:

```bash
git status --short --branch
git show --stat --oneline HEAD
```

Expected: cista grana i commit s iskljucivo ciljanim datotekama.
