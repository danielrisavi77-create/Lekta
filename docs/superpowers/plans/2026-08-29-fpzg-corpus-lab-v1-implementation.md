# FPZG Corpus Lab v1 — provedbeni plan za Claude Code

> **Namjena dokumenta:** ovaj Markdown dokument predaje se Claude Codeu kao glavni provedbeni ugovor. Ne predstavlja samo backlog, nego redoslijed implementacije, TDD protokol, sigurnosne granice, vanjske preduvjete i kriterije završetka.

**Datum:** 29. kolovoza 2026.  
**Repozitorij:** `danielrisavi77-create/Lekta`  
**Polazni branch:** `design/fpzg-corpus-lab-v1`  
**Odobrena specifikacija:** `docs/superpowers/specs/2026-08-29-fpzg-corpus-lab-v1-design.md`  
**Cilj:** izgraditi deterministički FPZG validation sustav koji povezuje postojeći real-corpus harness, privatni Supabase corpus, originalne DOCX gold-fixture, kontrolirane OOXML mutacije, PDF→DOCX stresni korpus, neovisni OOXML oracle, pravi Microsoft Word, vizualnu provjeru i exact-SHA release gate.

---

## 0. Glavna naredba Claude Codeu

Implementiraj ovaj plan **fazno, test-first i bez paralelnog drugog validatora**. Postojeći `tests/real-corpus/harness.ts`, `scripts/repair-real-corpus.mts`, `src/repair/*`, `src/analysis/golden-entry.ts`, `scripts/verify-docx/strict-open.py` i `scripts/word-verify/*` ostaju jezgra. Smiješ ih izdvojiti u manje module kada je to potrebno za provider arhitekturu, ali ne smiješ kopirati njihovu poslovnu logiku u novi sustav.

Prije svake izmjene pročitaj:

```text
CLAUDE.md
AGENTS.md
docs/REAL_CORPUS_TESTING.md
docs/superpowers/specs/2026-08-29-fpzg-corpus-lab-v1-design.md
ovaj plan
```

### 0.1 Tvrda pravila

1. **Ne radi izravno na `master`.** Otvori izolirani worktree/branch.
2. **Ne mijenjaj produkcijski AutoFix u prvim infrastrukturnim fazama.** Corpus Lab prvo mjeri postojeće ponašanje.
3. **Ne commitaj stvarne PDF/DOCX radove, tekst rada, citate, imena autora ni naslove radova.** U Git idu samo kod, sintetički fixturei, hashirani manifesti i agregirani rezultati bez sadržaja.
4. **PDF→DOCX rekonstrukcija nije ground truth za izvorni Word.** Rekonstruirani dokument može blokirati release zbog korupcije, regresije, nedeterminističnosti, Word-open greške ili ne-idempotentnosti, ali ne zbog svojstva koje je možda izmislio konverter.
5. **Pravila FPZG-a ne uče se iz većine radova.** Autoritet su isključivo verificirana službena pravila i verzionirane rule ere.
6. **Nema OCR-a u v1.** Skenirani i mješoviti PDF-ovi se klasificiraju i stavljaju u quarantine.
7. **Migracije isključivo kao SQL datoteke u `supabase/migrations/` i primjena preko `supabase db push`.** Nikad MCP `apply_migration`.
8. **Svaka migracija mora biti idempotentna.** Na početku implementacije ponovno pronađi najveći broj migracije. U trenutku pisanja plana najveća je `0101_client_errors.sql`; `0102` je samo očekivani sljedeći broj, ne trajno rezerviran broj.
9. **Svaki novi guard mora imati negativnu kontrolu/mutaciju koja dokazuje da guard grize.**
10. **Nema tvrdnje da je Word oracle prošao ako pravi Word nije stvarno pokrenut.** Nedostupan Windows/Word runner znači `unavailable`, ne `pass`.
11. **Nema popuštanja pragova radi zelenog releasea.** Promjena policyja stvara novu verziju policyja i invalidira stare dokaze.
12. **`npm run check` mora biti zelen prije svakog commita.** Za spore/vanjske faze pokreni i dodatne naredbe navedene u zadatku.
13. **Ne prepravljaj rečenice, argumentaciju ni sadržaj rada.** Vrijedi test vidljivog teksta iz `CLAUDE.md`.
14. **Nijedan private corpus modul ne smije završiti u browser bundleu.** Corpus Lab kod primarno živi pod `tests/**`, `scripts/**`, `supabase/**` i `data/corpus-lab/**`, koji su već izvan javnog bundlea.
15. **Nijedan run nije release dokaz bez točnog commit SHA-a, tree SHA-a, profile fingerprinta, corpus manifest hasha, harness verzije i Word environment identiteta.**

### 0.2 Radna grana

Preporučeni početak:

```bash
git fetch origin
git worktree add ../Lekta-fpzg-corpus-lab -b feat/fpzg-corpus-lab-v1 origin/design/fpzg-corpus-lab-v1
cd ../Lekta-fpzg-corpus-lab
npm ci
npm run check
```

Ako `feat/fpzg-corpus-lab-v1` već postoji, koristi novi jasno imenovani branch po fazi, primjerice `feat/fpzg-corpus-lab-data-plane`.

### 0.3 Progress ledger

Vodi lokalni, necommitani ledger:

```text
.superpowers/fpzg-corpus-lab-progress.md
```

Za svaki task bilježi:

```text
status: not-started | red | green | blocked-external | complete
commit:
test evidence:
open risks:
external evidence:
```

Ne koristi ledger kao zamjenu za testove ili commitani release dokaz.

### 0.4 Vanjski preduvjeti koje kod ne smije lažirati

- Aktiviran zaseban Supabase staging/validation projekt ili izričita odluka vlasnika da se privatni `validation` sloj smije stvoriti u aktivnom projektu.
- Windows stroj ili self-hosted GitHub runner s legalno instaliranim Microsoft Wordom.
- Stabilan Office channel/build, Windows locale i font manifest.
- Eksplicitno pravo za svaki originalni gold DOCX.
- Potvrđen rights policy prije bulk preuzimanja i trajne transformacije Dabar datoteka.
- Za Class H fixere ljudski Word/visual pregled reprezentativnih izlaza.

Kada preduvjet nedostaje, dovrši sve što je moguće bez njega, ostavi automatski dokaz `unavailable` i precizan dokumentirani blocker. Ne označavaj fazu zelenom.

---

## 1. Poznato početno stanje koje se mora ponovno izmjeriti

Trenutačni dokumentirani baseline:

- aktivni Supabase `public.corpus_works` sadrži 1.442 FPZG Dabar zapisa za bachelor/master;
- rule-era pilot 2024.–2026. obuhvaća 790 zapisa;
- postojeći lokalni real corpus dokumentira 50 stvarnih radova, većinom FPZG;
- povijesno mjerenje je pronašlo 38/50 second-pass promjena prije kasnijih popravaka; to se mora ponovno izmjeriti, ne prepisati kao aktualna činjenica;
- postojeći commitani harness provjerava integritet, čitljivost, dropped parts, PASS→FAIL regresije, vidljivi tekst, integrity gate i drugi prolaz;
- aktualni npm ugovori već uključuju `repair-real-corpus`, `repair-real-corpus:review`, `verify:strict-open`, `verify:word`, `verify:word:worst`, `verify:word:toc`, `test:slow`, `check:edge`, `release:check` i `migration-identity`.

Prvi commit implementacije mora ponovno izmjeriti i zamrznuti zatečeno stanje prije promjene harnessa.

---

# Faza 0 — zamrzavanje baselinea i zaštita od lažno zelenog refaktora

## Task 0.1 — zabilježi točan početni commit i potpuni baseline

**Files**

- Create: `docs/generated/fpzg-corpus-lab-baseline.json`
- Create: `scripts/corpus-lab/capture-baseline.mts`
- Create: `tests/corpus-lab/baseline-contract.test.ts`
- Modify: `package.json`
- Modify: `.gitignore` samo ako novi privatni output nije već pokriven

**Korak 1 — napiši RED test**

Test mora očekivati schema-versionirani baseline objekt s najmanje:

```ts
{
  schemaVersion: 1,
  gitCommit: string,
  gitTree: string,
  generatedAt: string,
  committedCorpus: {...},
  localCorpus?: {...},
  fixerRegistryHash: string,
  profileFingerprintSetHash: string,
  harnessSourceHash: string
}
```

Test mora odbiti:

- prazan SHA;
- nepostojeći `integrityFailureCount`;
- izostavljen `secondPassNoOp` agregat;
- sadržaj rada ili apsolutne lokalne putanje;
- baseline koji tvrdi local corpus rezultate kada lokalni corpus nije dostupan.

Pokreni:

```bash
npx vitest run tests/corpus-lab/baseline-contract.test.ts
```

Očekivanje: pad jer skripta/artefakt ne postoje.

**Korak 2 — minimalna implementacija**

`capture-baseline.mts` treba:

1. pokrenuti/pozvati postojeći `runRealCorpus` za commitani corpus;
2. opcionalno uključiti lokalni corpus samo uz `--local`;
3. izračunati Git commit/tree;
4. izračunati hash relevantnog source koda i live fixer registra;
5. zapisati samo sigurne agregate;
6. pri local runu zapisati u gitignorirani `docs/generated/fpzg-corpus-lab-baseline.local.json`, ne u commitani artefakt.

Dodaj naredbe:

```json
"corpus-lab:baseline": "vite-node scripts/corpus-lab/capture-baseline.mts",
"corpus-lab:baseline:local": "vite-node scripts/corpus-lab/capture-baseline.mts --local"
```

**Korak 3 — potvrdi GREEN**

```bash
npm run corpus-lab:baseline
npx vitest run tests/corpus-lab/baseline-contract.test.ts
npm run repair-real-corpus
npm run check
```

**Korak 4 — pregled dokaza**

Ručno potvrdi da artefakt nema:

- tekst dokumenta;
- ime autora;
- naslov rada;
- lokalni filesystem username;
- signed URL;
- service key.

**Korak 5 — commit**

```bash
git add package.json scripts/corpus-lab/capture-baseline.mts tests/corpus-lab/baseline-contract.test.ts docs/generated/fpzg-corpus-lab-baseline.json .gitignore
git commit -m "test(corpus-lab): freeze pre-refactor validation baseline"
```

## Task 0.2 — mutacijski dokaz da baseline guard grize

**Files**

- Create: `tests/corpus-lab/baseline-mutations.test.ts`
- Modify: `tests/gate-mutations.test.ts` ako je prikladno dijeliti postojeći registry

**RED/GREEN ugovor**

Podmetni sintetički baseline u kojem je:

- `integrityFailureCount = 1`;
- `passRegressionCount = 1`;
- `secondPassNoOpCount < changedDocumentCount`;
- Git commit različit od očekivanog;
- sadržajni marker `w:t` ili poznati osobni podatak u outputu.

Guard mora svaki kvar imenovati. Nemoj samo testirati `false`; testiraj razumljiv failure reason.

Pokreni:

```bash
npx vitest run tests/corpus-lab/baseline-mutations.test.ts tests/gate-mutations.test.ts
npm run check
```

Commit:

```bash
git commit -am "test(corpus-lab): prove baseline gate detects unsafe evidence"
```

---

# Faza 1 — domenski ugovori bez baze i bez mreže

## Task 1.1 — uvedi tipove dokaza i stabilne identifikatore

**Files**

- Create: `tests/corpus-lab/contracts.ts`
- Create: `tests/corpus-lab/contracts.test.ts`
- Create: `tests/corpus-lab/hash.ts`
- Create: `tests/corpus-lab/hash.test.ts`

**Ugovori**

Definiraj najmanje:

```ts
type FixtureClass = 'gold-original' | 'mutation' | 'reconstructed';
type RightsClass = 'metadata-only' | 'index-only' | 'transform-allowed' | 'gold-authorized' | 'excluded';
type PdfClass = 'born-digital' | 'scan-with-text-layer' | 'scan-no-text-layer' | 'mixed' | 'unsupported-corrupt';
type RunMode = 'analysis-only' | 'isolated-fixer' | 'default-bundle';
type FinalVerdict = 'pass' | 'review' | 'fail' | 'not-applicable' | 'unavailable';
type FixerRiskClass = 'L' | 'M' | 'H';
```

`holdout` je boolean/partition svojstvo, ne fixture class.

Stabilni ID-jevi moraju nastati iz kanonskog JSON-a i SHA-256, bez vremena i poretka ključeva. Uvedi:

```ts
canonicalJson(value): string
sha256Hex(bytes|string): string
semanticManifestHash(manifest): string
sourceIdentityKey(source): string
fixtureIdentityKey(fixture): string
```

**RED testovi**

- različit poredak ključeva daje isti hash;
- promjena evidence classa mijenja hash;
- promjena source SHA-a mijenja fixture ID;
- holdout ne mijenja source identity;
- naslov/autor nisu dio javnog report identityja;
- `reconstructed` ne smije imati `groundTruth: true` za hidden Word strukturu.

**Naredbe**

```bash
npx vitest run tests/corpus-lab/contracts.test.ts tests/corpus-lab/hash.test.ts
npm run check
```

**Commit**

```bash
git add tests/corpus-lab
git commit -m "feat(corpus-lab): define deterministic evidence contracts"
```

## Task 1.2 — verzionirani result schema i fail-closed evaluator

**Files**

- Create: `tests/corpus-lab/result-schema.ts`
- Create: `tests/corpus-lab/release-evaluator.ts`
- Create: `tests/corpus-lab/release-evaluator.test.ts`

Evaluator mora vratiti strukturirano:

```ts
{
  verdict: 'pass' | 'fail' | 'unavailable',
  blockers: Array<{ code: string; fixtureId?: string; detail: string }>,
  warnings: ...,
  criteria: Record<string, { required: boolean; status: ... }>
}
```

Tvrdi kriteriji iz dizajna:

- 0 integrity failurea;
- 0 neobjašnjenih dropped/emptied dijelova;
- 0 neočekivanih promjena vidljivog teksta;
- 0 neobjašnjenih PASS→FAIL regresija;
- 100% second-pass no-op za automatske fixere i default bundle;
- deterministički semantic hash;
- 0 unknown fixera i 0 silent skipova;
- mutation closure;
- holdout prisutan i potpun;
- Word evidence za gold/holdout/Class H;
- 100% rights odluka;
- exact release provenance.

**Negativne kontrole** moraju dokazati da `unavailable` nikad nije `pass`.

```bash
npx vitest run tests/corpus-lab/release-evaluator.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): add fail-closed release evaluator"
```

---

# Faza 2 — privatni Supabase validation data plane

## Task 2.1 — foundation migracija

**Files**

- Create: sljedeća slobodna migracija, očekivano `supabase/migrations/0102_validation_corpus_lab.sql`
- Create: `tests/corpus-lab/validation-migration-contract.test.ts`
- Create: `scripts/corpus-lab-db-smoke.sql`
- Modify: `package.json`

**Prije izrade datoteke**

```bash
ls supabase/migrations | sort | tail -20
npm run migration-identity
```

Ako `0102` više nije slobodan, uzmi sljedeći broj i ažuriraj planirane reference.

**Shema**

Kreiraj privatnu shemu `validation` i najmanje tablice:

- `validation.sources`
- `validation.fixtures`
- `validation.mutations`
- `validation.expectations`
- `validation.snapshots`
- `validation.snapshot_items`
- `validation.runs`
- `validation.results`
- `validation.reviews`

Koristi `text + check` ugovore ili lookup tablice; ne uvodi Postgres enum bez jasne potrebe. Uključi:

- UUID primarne ključeve;
- unique ključeve za source/fixture identity;
- SHA-256 format check (`^[0-9a-f]{64}$`);
- append-only identitet izvora i fixturea;
- `created_at` server time;
- FK-ove koji ne dopuštaju orphan rezultate;
- `fixture_class` odvojen od `holdout`;
- `corpus_manifest_hash`, Git commit/tree i profile fingerprint na runu;
- `jsonb` samo za verzionirane dodatne metrike, ne kao zamjenu za kritične stupce;
- `content_stored = false`/redaction marker u run/report ugovoru;
- nema teksta rada, naslova, autora ni citata u results.

Kreiraj privatni bucket `validation-corpus` idempotentno u `storage.buckets`:

- `public = false`;
- razuman file-size limit koji pokriva corpus source, ali nije neograničen;
- dopušteni MIME: PDF i DOCX;
- bez anon/authenticated write/read policyja.

**RED test** mora parsirati SQL i dokazati:

- sve tablice postoje;
- nema `grant ... to anon` ni `authenticated`;
- bucket je private;
- hash/check constrainti postoje;
- migracija nema destructive drop postojećih production tablica;
- `validation` nije pomiješan s `repair_jobs` ili korisničkim tablicama.

**Primjena**

Najprije lokalna disposable baza ili reaktivirani staging projekt:

```bash
supabase db reset
# ili, nad odabranim staging projektom:
supabase link --project-ref "$LEKTA_VALIDATION_PROJECT_REF"
supabase db push
npm run migration-identity
```

Nikad prvo production.

Dodaj:

```json
"smoke:corpus-lab-db": "psql -v ON_ERROR_STOP=1 -f scripts/corpus-lab-db-smoke.sql"
```

**Provjera**

```bash
npx vitest run tests/corpus-lab/validation-migration-contract.test.ts
npm run smoke:corpus-lab-db
npm run check
```

**Commit**

```bash
git add supabase/migrations tests/corpus-lab/validation-migration-contract.test.ts scripts/corpus-lab-db-smoke.sql package.json
git commit -m "feat(corpus-lab): add private validation data plane"
```

## Task 2.2 — hardening migracija i cross-role test

**Files**

- Create: sljedeća migracija, očekivano `0103_validation_corpus_lab_hardening.sql`
- Create: `scripts/corpus-lab-db-security-smoke.sql`
- Create: `tests/corpus-lab/validation-security-contract.test.ts`
- Modify: `package.json`

Migracija mora:

- `revoke all on schema validation from public, anon, authenticated`;
- revoke sve tablice/sekvence/funkcije;
- grant samo nužno `service_role`/postgresu ili internom validator roleu;
- postaviti siguran `search_path` na svaku SECURITY DEFINER funkciju, ako ih uopće treba;
- spriječiti update identitetskih stupaca sourcea/fixturea/snapshota;
- spriječiti brisanje fixturea koji je dio release runa bez eksplicitnog quarantine/tombstone procesa;
- osigurati da bucket nema public policy;
- ostaviti produkcijske korisničke RLS politike nedirnute.

Security smoke mora pokušati čitanje i pisanje kao anon/authenticated i očekivati odbijanje, a zatim kao service role/interni validator očekivati dopuštenu operaciju.

```bash
npx vitest run tests/corpus-lab/validation-security-contract.test.ts
npm run smoke:corpus-lab-db-security
npm run check
```

Pokreni Supabase advisors nakon primjene. Svaki novi warning iz ove migracije je blocker.

Commit:

```bash
git commit -am "security(corpus-lab): lock validation schema and storage"
```

## Task 2.3 — konfiguracija bez tajni

**Files**

- Modify: `.env.example`
- Create: `scripts/corpus-lab/config.mts`
- Create: `tests/corpus-lab/config.test.ts`

Kanonske varijable:

```text
LEKTA_VALIDATION_PROJECT_REF=
LEKTA_VALIDATION_SUPABASE_URL=
LEKTA_VALIDATION_SUPABASE_SERVICE_ROLE_KEY=
LEKTA_VALIDATION_DATABASE_URL=
LEKTA_VALIDATION_BUCKET=validation-corpus
LEKTA_CORPUS_HOLDOUT_SEED=
LEKTA_CORPUS_LAB_MODE=development|release
LEKTA_DABAR_LIVE=0|1
LEKTA_WORD_RUNNER=0|1
```

Pravila:

- nijedna tajna nema fallback;
- production project ref ne smije se prihvatiti bez eksplicitnog `--allow-production-validation` i zasebne potvrde;
- standardni unit testovi ne trebaju mrežu ni tajne;
- config error imenuje nedostajuću varijablu;
- logovi redaktiraju ključeve i connection string.

```bash
npx vitest run tests/corpus-lab/config.test.ts
npm run check
```

Commit:

```bash
git commit -am "chore(corpus-lab): define protected validator configuration"
```

---

# Faza 3 — FPZG faculty pack, inventar i rights gate

## Task 3.1 — FPZG pack bez hardkodiranja u runner

**Files**

- Create: `data/corpus-lab/faculty-packs/fpzg.json`
- Create: `tests/corpus-lab/faculty-pack.ts`
- Create: `tests/corpus-lab/fpzg-pack.test.ts`
- Modify: `data/classification.json` samo ako treba eksplicitnija oznaka; `data/**` je već forbidden za browser

Pack mora sadržavati:

- `facultyId: "fpzg"`;
- sve izmjerene institucionalne alias-e i odjelne label-e;
- podržane vrste `bachelor`, `master`;
- pilot rule era `fpzg-2024-2026`;
- `validFromYear`, `validToYear`;
- mapiranje na postojeće profile/selection resolver, bez kopiranja pravila;
- stratification policy;
- release thresholds/risk-class policy;
- pack schema version.

Testovi:

- poznati glavni FPZG label i svaki odjelni label mapiraju se na `fpzg`;
- slični, ali ne-FPZG labeli se ne mapiraju;
- doctoral/article/other ne ulaze u v1 bachelor/master accuracy cohort;
- 2015–2023 master može biti `integrity-stress-only`, ali ne current-rule accuracy oracle;
- pack ne sadrži bodovane vrijednosti fonta/margina; one dolaze iz profile sustava.

```bash
npx vitest run tests/corpus-lab/fpzg-pack.test.ts
npm run check
```

Commit:

```bash
git add data/corpus-lab tests/corpus-lab/faculty-pack.ts tests/corpus-lab/fpzg-pack.test.ts
git commit -m "feat(corpus-lab): add versioned FPZG validation pack"
```

## Task 3.2 — deterministički inventory normalizer

**Files**

- Create: `scripts/corpus-lab/inventory-fpzg.mts`
- Create: `tests/corpus-lab/inventory-normalizer.ts`
- Create: `tests/corpus-lab/inventory-normalizer.test.ts`
- Create: `tests/fixtures/corpus-lab/corpus-works-sample.json`
- Modify: `package.json`

Normalizer ulaz je siguran podskup `corpus_works`, izlaz `SourceCandidate[]` bez sadržaja rada.

Mora:

- čuvati originalni `institution` label;
- mapirati canonical faculty;
- mapirati work type bez gubitka original `kind`;
- filtrirati `repo = dabar`;
- deduplicirati po stabilnom source identityju, ne naslovu;
- vezati rule era;
- označiti nepoznat program kao `null`, ne nagađati;
- sortirati deterministički;
- ne spremati URL s tajnim query parametrima;
- ispisati aggregate inventory bez autora/naslova.

Live upit mora biti iza eksplicitnog `LEKTA_DABAR_LIVE=1`; unit test koristi fixture.

Naredbe:

```json
"corpus-lab:inventory:fpzg": "vite-node scripts/corpus-lab/inventory-fpzg.mts"
```

Testiraj očekivani pilot count samo kao izmjereni snapshot artefakt s datumom, ne kao vječni hardcoded unit-test broj. Promjena broja zapisa nije automatski kvar; promjena mapiranja i duplikata jest.

```bash
npx vitest run tests/corpus-lab/inventory-normalizer.test.ts
npm run corpus-lab:inventory:fpzg -- --fixture tests/fixtures/corpus-lab/corpus-works-sample.json
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): normalize FPZG corpus inventory"
```

## Task 3.3 — rights policy engine

**Files**

- Create: `tests/corpus-lab/rights-policy.ts`
- Create: `tests/corpus-lab/rights-policy.test.ts`
- Create: `data/corpus-lab/rights-policy-v1.json`
- Create: `scripts/corpus-lab/apply-rights-policy.mts`

Policy output:

```ts
{
  rightsClass,
  policyVersion,
  reasonCode,
  sourceAccessStatus,
  licenseRaw,
  licenseClass,
  requiresManualReview
}
```

Tvrda pravila:

- nema download prije odluke;
- embargo/withdrawn/no-full-text → `metadata-only` ili `excluded`;
- nepoznata licenca → nikad automatski `transform-allowed`;
- `gold-authorized` zahtijeva zasebni permission record, ne Dabar status;
- access != license;
- policy je pure function s fixture testovima;
- manual override je append-only rights decision s reviewerom i razlogom;
- report ne objavljuje identitet reviewera javno.

Negativne kontrole trebaju podmetnuti `open_access=true` uz nepoznatu licencu i dokazati da se transformacija odbija.

```bash
npx vitest run tests/corpus-lab/rights-policy.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): enforce explicit source rights decisions"
```

---

# Faza 4 — provider refaktor postojećeg real-corpus harnessa

## Task 4.1 — izdvoji fixture provider ugovor bez promjene rezultata

**Files**

- Create: `tests/real-corpus/provider.ts`
- Create: `tests/real-corpus/providers/filesystem-provider.ts`
- Modify: `tests/real-corpus/harness.ts`
- Modify: `scripts/repair-real-corpus.mts`
- Create: `tests/real-corpus/provider-parity.test.ts`

Ugovor:

```ts
interface ValidationFixtureProvider {
  list(scope: ValidationScope): Promise<ValidationFixtureRef[]>;
  materialize(ref: ValidationFixtureRef): Promise<Uint8Array>;
  provenance(ref: ValidationFixtureRef): Promise<FixtureProvenance>;
}
```

**RED parity test**

Prije refaktora spremi normalizirani report postojećeg filesystem puta. Nakon refaktora isti commitani corpus mora dati isti report, osim eksplicitno dodanih schema/provenance polja koja su deterministička.

Ne mijenjaj u ovom tasku:

- odabir fixera;
- text fingerprint policy;
- PASS regression logiku;
- integrity gate;
- second pass logiku;
- scoring.

```bash
npx vitest run tests/real-corpus/provider-parity.test.ts tests/real-corpus.test.ts
npm run repair-real-corpus
npm run check
```

Diff `docs/generated/repair-real-corpus.json` mora biti objašnjiv. Neočekivana promjena ponašanja = vrati refaktor, ne updateaj snapshot naslijepo.

Commit:

```bash
git add tests/real-corpus scripts/repair-real-corpus.mts docs/generated/repair-real-corpus.json
git commit -m "refactor(corpus): run existing harness through fixture provider"
```

## Task 4.2 — jedan fixture runner i tri run moda

**Files**

- Create: `tests/real-corpus/run-fixture.ts`
- Modify: `tests/real-corpus/harness.ts`
- Create: `tests/real-corpus/run-modes.test.ts`

Podrži:

- `analysis-only`;
- `isolated-fixer`;
- `default-bundle`.

`isolated-fixer` mora primijeniti jedan efektivni fixer request, a `default-bundle` mora koristiti isti `buildDefaultRepairRequests(items)` kao UI/harness danas.

Svaki rezultat mora navesti:

- effective requests;
- skipped reasons;
- unknown fixers;
- param authority source gdje je primjenjivo;
- targeted check IDs, ne hrvatske naslove;
- semantic before/after hash;
- deterministic rerun hash.

RED test mora pokazati da izolirani fixer ne može biti “kriv” za izmjenu drugog fixera.

```bash
npx vitest run tests/real-corpus/run-modes.test.ts
npm run repair-real-corpus
npm run check
```

Commit:

```bash
git commit -am "feat(corpus): add analysis isolated and bundle validation modes"
```

## Task 4.3 — protected Supabase fixture provider

**Files**

- Create: `tests/real-corpus/providers/supabase-validation-provider.ts`
- Create: `tests/real-corpus/providers/supabase-validation-provider.test.ts`
- Create: `scripts/corpus-lab/run.mts`
- Modify: `package.json`

Provider mora:

- biti nedostupan bez protected configa;
- listati samo fixturee iz točnog snapshot manifest hasha;
- generirati kratkotrajni privatni download ili koristiti service role;
- provjeriti preuzeti binary SHA prije analize;
- odbiti path traversal i bucket mismatch;
- nikad logirati signed URL/key;
- ne pisati dokument u GitHub artifact;
- materijalizirati u memory ili gitignorirani temp direktorij;
- obrisati temp datoteku u `finally`.

Unit test koristi injektirani fake fetch/storage adapter, bez mreže.

Naredbe:

```json
"corpus-lab:run": "vite-node scripts/corpus-lab/run.mts",
"corpus-lab:run:fpzg": "vite-node scripts/corpus-lab/run.mts --faculty fpzg"
```

```bash
npx vitest run tests/real-corpus/providers/supabase-validation-provider.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): load private fixtures by immutable snapshot"
```

---

# Faza 5 — corpus snapshot i zaključani holdout

## Task 5.1 — immutable snapshot builder

**Files**

- Create: `tests/corpus-lab/snapshot.ts`
- Create: `tests/corpus-lab/snapshot.test.ts`
- Create: `scripts/corpus-lab/build-snapshot.mts`
- Create: `data/corpus-lab/snapshots/README.md`
- Modify: `package.json`

Snapshot manifest sadrži samo:

- source/fixture ID;
- hash;
- evidence class;
- faculty/profile/rule era;
- work type/year/program band;
- holdout flag;
- quality-policy version;
- bez teksta/naslova/autora.

Manifest:

- kanonski se sortira;
- dobiva SHA-256;
- nakon `locked_at` se ne smije mijenjati;
- svaka promjena daje novi snapshot ID, primjerice `fpzg-2024-2026-v1` → `v2`;
- ne može referencirati fixture bez rights odluke;
- ne može miješati profile rule era bez eksplicitne oznake.

```json
"corpus-lab:snapshot": "vite-node scripts/corpus-lab/build-snapshot.mts"
```

```bash
npx vitest run tests/corpus-lab/snapshot.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): build immutable validation snapshots"
```

## Task 5.2 — deterministički 20% holdout po source identityju

**Files**

- Create: `tests/corpus-lab/holdout.ts`
- Create: `tests/corpus-lab/holdout.test.ts`

Algoritam:

- split po source identity, ne fixtureu;
- svi derivati istog izvora idu na istu stranu;
- fixed/versioned seed;
- stratifikacija redom: work type, year, program gdje veličina dopušta;
- cilj 20%, uz determinističko zaokruživanje;
- mutation combinations mogu imati dodatni holdout flag, ali nikad ne smiju otkriti source holdout kroz obični dev report;
- promjena seeda/policyja mijenja snapshot hash.

Negativni test mora pokušati staviti original u dev, a njegov reconstructed derivat u holdout; validator mora pasti.

```bash
npx vitest run tests/corpus-lab/holdout.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): lock leakage-safe source holdout"
```

## Task 5.3 — sakrij holdout od ordinary dev runa

**Files**

- Modify: `scripts/corpus-lab/run.mts`
- Create: `tests/corpus-lab/holdout-access.test.ts`

Pravila:

- development mode ne vraća per-fixture holdout rezultate;
- release mode zahtijeva posebno zaštićeni config/secret;
- aggregate “holdout available/unavailable” smije biti vidljiv;
- standardni developer ne može slučajno tuneati prema holdoutu;
- CI release job dobiva holdout results samo kao redaktirani aggregate + blocker IDs.

```bash
npx vitest run tests/corpus-lab/holdout-access.test.ts
npm run check
```

Commit:

```bash
git commit -am "security(corpus-lab): isolate locked holdout evidence"
```

---

# Faza 6 — originalni DOCX gold registry i expectation matrix

## Task 6.1 — registracija autoriziranog gold dokumenta

**Files**

- Create: `scripts/corpus-lab/register-gold.mts`
- Create: `tests/corpus-lab/gold-registration.test.ts`
- Create: `data/corpus-lab/gold-permission-schema.json`
- Modify: `package.json`

CLI ulaz mora biti lokalna datoteka + zaseban permission manifest. Bez `rightsClass = gold-authorized` nema uploada.

Registracija:

- čita file magic i MIME;
- računa binary SHA i semantic OOXML hash;
- uklanja iz reporta original filename;
- daje interni fixture ID;
- upload u private bucket;
- upisuje source/fixture provenance;
- ne prepisuje postojeći fixture; isti hash je idempotentni no-op;
- permission record sadrži opseg, datum, izvor dopuštenja i retention/revocation uvjete;
- ne sprema stvarni permission dokument u javni Git.

```json
"corpus-lab:register-gold": "vite-node scripts/corpus-lab/register-gold.mts"
```

Unit test koristi fake storage/DB. Integration test samo na validation projektu.

```bash
npx vitest run tests/corpus-lab/gold-registration.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): register authorized original DOCX gold fixtures"
```

## Task 6.2 — expectation importer i authority contract

**Files**

- Create: `scripts/corpus-lab/import-expectations.mts`
- Create: `tests/corpus-lab/expectations.test.ts`
- Create: `data/corpus-lab/expectation-schema.json`

Expectation mora koristiti stabilni `check_id` i imati:

- expected status/value;
- authority type;
- official rule/source ref ili mutation/oracle ref;
- annotation status;
- reviewer timestamp;
- optional expected fixer;
- `ambiguous/manual` za ono što nije deterministički označivo.

Tvrda pravila:

- reconstructed fixture ne prima hidden-OOXML ground truth iz samog PDF-a;
- title string nije identitet checka;
- expectation bez authorityja je nevaljan;
- current FPZG rule ne smije se automatski primijeniti na povijesni rule era;
- manual label se ne pretvara u official rule.

```bash
npx vitest run tests/corpus-lab/expectations.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): import traceable ground-truth expectations"
```

---

# Faza 7 — deterministički mutation engine

## Task 7.1 — mutation registry izveden iz live fixer registra

**Files**

- Create: `tests/corpus-lab/mutations/registry.ts`
- Create: `tests/corpus-lab/mutations/registry.test.ts`
- Create: `data/corpus-lab/fixer-risk-classes.json`
- Create: `scripts/corpus-lab/generate-mutation-coverage.mts`
- Modify: `package.json`

Ne hardkodiraj broj fixera. Uvezi live `FIXER_IDS`, repair-item assembly i check-fixer map gdje je potrebno.

Za svaki live automatic fixer registry mora znati:

- risk class L/M/H;
- postoji li mutation definition;
- minimalan broj positive/negative/idempotence slučajeva;
- independent oracle property;
- visible-text policy;
- Word/visual requirement;
- status `covered | blocked-by-data | manual-only | missing`.

Guard mora pasti kada se doda novi live fixer bez klasifikacije i mutation coverage odluke.

```bash
npx vitest run tests/corpus-lab/mutations/registry.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): bind live fixers to mutation evidence policy"
```

## Task 7.2 — OOXML mutation framework s jednom promjenom po fixturu

**Files**

- Create: `tests/corpus-lab/mutations/engine.ts`
- Create: `tests/corpus-lab/mutations/engine.test.ts`
- Create: `tests/corpus-lab/mutations/semantic-hash.ts`

Ugovor mutationa:

```ts
interface MutationDefinition {
  id: string;
  version: number;
  applicable(input): Promise<boolean>;
  mutate(entries): Promise<MutationOutput>;
  partsTouched: string[];
  expectedCheckId: string;
  expectedFixerId?: string;
  expectedBefore: ...;
  expectedAfter: ...;
  allowedCollateral: ...;
  visibleTextChangeAllowed: boolean;
}
```

Engine mora:

- provjeriti source hash;
- promijeniti samo deklarirane dijelove;
- zapisati before/after part hash;
- potvrditi da je mutacija stvarno promijenila cilj;
- pokrenuti package integrity nakon mutacije;
- odbiti mutaciju koja mijenja nedeklarirani visible text;
- generirati novi immutable fixture ID;
- ne pisati gold-derived bytes u Git.

Negativni test: mutation tvrdi da dira `styles.xml`, ali promijeni `document.xml`; engine mora pasti.

```bash
npx vitest run tests/corpus-lab/mutations/engine.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): add single-fault OOXML mutation engine"
```

## Task 7.3 — prvi Class L mutation paket

**Files**

- Create: `tests/corpus-lab/mutations/formatting.ts`
- Create: `tests/corpus-lab/mutations/formatting.test.ts`

Prvi paket:

- body font;
- body size;
- line spacing;
- paragraph spacing;
- alignment;
- margins;
- paper size.

Za svaki fixer minimalno:

- 3 positive slučaja;
- 2 negative controls;
- 1 second-pass no-op slučaj;
- independent low-level expectation placeholder koji će u Fazi 8 preuzeti Python oracle;
- default bundle interaction test.

TDD: prvo test mora dokazati da Lekta detektira injektirani kvar. Zatim popravi isključivo engine/mutation ako je fixture pogrešan; ne mijenjaj analyzer samo da test prođe bez dokaza.

```bash
npx vitest run tests/corpus-lab/mutations/formatting.test.ts
npm run repair-real-corpus
npm run check
```

Commit:

```bash
git commit -am "test(corpus-lab): cover low-risk formatting fixers with mutations"
```

## Task 7.4 — Class M i Class H mutacije u zasebnim commitima

**Files**

- Create: `tests/corpus-lab/mutations/headings-fields.ts`
- Create: `tests/corpus-lab/mutations/bibliography-links.ts`
- Create: `tests/corpus-lab/mutations/sections-pagination.ts`
- Create corresponding tests.

Redoslijed:

1. heading style/hierarchy/case;
2. TOC/field integrity;
3. bibliography/DOI/technical typography;
4. footnotes/captions;
5. sections + page numbering + footer linkage;
6. title-page/section interactions;
7. composite interactions.

Svaka skupina dobiva vlastiti RED→GREEN commit. Class H ne može postati release-pass samo preko Vitesta; Word i visual evidence ostaju `unavailable` do Fazе 13.

Obavezni compositei:

- heading style + TOC + field integrity;
- sections + page numbers + footer;
- title page + first body page numbering;
- bibliography + DOI + typography;
- table/figure + caption + fields;
- final document inspector + field integrity + heading style, jer je povijesno bila problematična interakcija.

Nakon svake skupine:

```bash
npm run check
npm run test:slow
npm run repair-real-corpus
```

Commit poruke neka budu specifične, ne jedan mega-commit.

---

# Faza 8 — neovisni OOXML oracle

## Task 8.1 — Python oracle contract bez uvoza Lekta koda

**Files**

- Create: `scripts/ooxml-oracle/oracle.py`
- Create: `scripts/ooxml-oracle/requirements.txt`
- Create: `scripts/ooxml-oracle/README.md`
- Create: `tests/fixtures/ooxml-oracle/`
- Create: `tests/corpus-lab/ooxml-oracle-contract.test.ts`
- Create: `scripts/corpus-lab/ooxml-oracle-client.mts`

Oracle je zaseban proces:

```bash
python scripts/ooxml-oracle/oracle.py --input file.docx --request request.json --output result.json
```

Ne smije importati TypeScript/JS Lekta evaluator. Smije koristiti nezavisne, pinane Python pakete i standardni ZIP/XML stack.

Prvi property set:

- page size/margins;
- paragraph/run font i size;
- line/paragraph spacing;
- alignment;
- style ID/heading level;
- field instructions;
- numbering start/format;
- section/header/footer relacije;
- footnote/endnote objekti;
- content types i relationship targets.

Result uključuje:

- oracle schema/version;
- input SHA;
- measured value;
- pass/fail/unmeasurable;
- safe technical location, bez sadržajnog citata;
- dependency versions.

**RED test** prvo koristi sintetičke poznate dokumente i očekuje točno mjerenje.

```bash
python -m pip install -r scripts/ooxml-oracle/requirements.txt
npx vitest run tests/corpus-lab/ooxml-oracle-contract.test.ts
npm run check
```

Commit:

```bash
git add scripts/ooxml-oracle tests/fixtures/ooxml-oracle tests/corpus-lab/ooxml-oracle-contract.test.ts scripts/corpus-lab/ooxml-oracle-client.mts
git commit -m "feat(corpus-lab): add independent OOXML property oracle"
```

## Task 8.2 — spoji oracle s mutation closureom

**Files**

- Modify: `tests/real-corpus/run-fixture.ts`
- Modify: `tests/corpus-lab/mutations/*.test.ts`
- Create: `tests/corpus-lab/oracle-disagreement.test.ts`

Za mutation/gold fixture s expectationom:

1. oracle potvrđuje da ciljano odstupanje postoji prije;
2. Lekta ga detektira;
3. fixer se primijeni;
4. oracle potvrđuje ciljanu vrijednost poslije;
5. Lekta re-check potvrđuje ishod;
6. oracle i Lekta disagreement se ne skriva — rezultat je `oracle-disagreement`/fail ili review prema vrsti svojstva.

Negativna kontrola: podmetni fake oracle koji laže; cross-hash/provenance contract mora odbiti rezultat za krivi input SHA.

```bash
npx vitest run tests/corpus-lab/oracle-disagreement.test.ts tests/corpus-lab/mutations/*.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): require independent mutation closure evidence"
```

---

# Faza 9 — Dabar source acquisition adapter

## Task 9.1 — read-only resolver probe prije trajnog preuzimanja

**Files**

- Create: `scripts/corpus-lab/dabar/probe.mts`
- Create: `scripts/corpus-lab/dabar/resolver.ts`
- Create: `tests/corpus-lab/dabar-resolver.test.ts`
- Create: `tests/fixtures/corpus-lab/dabar-responses/`
- Create: `docs/adr/ADR-FPZG-CORPUS-DABAR-ACQUISITION.md`

Prvo implementiraj fixture-driven parser i throwaway live probe za mali broj URN-ova. Cilj je utvrditi stabilan službeni put od `urn.nsk.hr` identiteta do record/file metadata i rights metadata.

Pravila:

- preferiraj službeni OAI-PMH/API/repository metadata put;
- HTML scraping je dopušten samo kao izolirani adapter nakon ADR-a koji dokazuje da podržani strojni endpoint ne daje potreban podatak;
- host allowlist;
- redirect limit;
- HTTPS only;
- DNS/private-IP/localhost SSRF zaštita;
- timeout i byte limit;
- ne slijedi link iz korisničkog sadržaja bez validacije;
- probe ne sprema dokument;
- `.artifacts` output sadrži samo tehničke metapodatke, ne puni tekst.

Live probe iza:

```bash
LEKTA_DABAR_LIVE=1 npm run corpus-lab:dabar:probe
```

Ako se ne može dobiti eksplicitna access/license/file odluka, zaustavi acquisition implementaciju s ADR blockerom; ne pretpostavljaj.

```bash
npx vitest run tests/corpus-lab/dabar-resolver.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): resolve Dabar source metadata safely"
```

## Task 9.2 — downloader nakon rights gatea

**Files**

- Create: `scripts/corpus-lab/dabar/download-source.mts`
- Create: `tests/corpus-lab/source-acquisition.test.ts`

Downloader prima isključivo `RightsDecision` s dopuštenim processing modeom.

Mora:

- potvrditi final host;
- potvrditi PDF magic `%PDF-`;
- odbiti HTML/error body pod `application/pdf`;
- streamati uz tvrdi byte cap;
- računati SHA tijekom streama;
- deduplicirati po hashu;
- nikad overwriteati postojeći source version;
- evidentirati redirect chain i final media type;
- obrisati partial file na padu;
- uploadati u private validation bucket samo kada policy dopušta persistent transform;
- kod transient/index-only obrade zadržati bytes samo u ephemeral workspaceu;
- prekinuti ako se rights status promijenio između odluke i downloada.

Negativne kontrole: redirect na localhost, gigantski content-length, lažni PDF, hash mismatch, expired rights decision.

```bash
npx vitest run tests/corpus-lab/source-acquisition.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): acquire rights-approved PDF sources immutably"
```

---

# Faza 10 — PDF klasifikator, bez OCR-a

## Task 10.1 — born-digital/scan classifier

**Files**

- Create: `scripts/pdf-classifier/classify.py`
- Create: `scripts/pdf-classifier/requirements.txt`
- Create: `scripts/corpus-lab/pdf-classifier-client.mts`
- Create: `tests/corpus-lab/pdf-classifier.test.ts`
- Create: `tests/fixtures/pdf-classifier/` sa sintetičkim ili licencno sigurnim fixtureima

Metrike:

- page count;
- extractable char/word count;
- text density po stranici;
- image coverage/signali;
- encrypted/password state;
- PDF version;
- classifier version;
- result class.

V1 admission:

- `born-digital` može u conversion calibration;
- `scan-with-text-layer`, `scan-no-text-layer`, `mixed` idu u quarantine;
- corrupt/encrypted unsupported ide u quarantine;
- nema OCR fallbacka.

Testovi moraju imati barem jedan primjer svake klase. Ne koristiti OCR biblioteku “samo da prođe”.

```bash
python -m pip install -r scripts/pdf-classifier/requirements.txt
npx vitest run tests/corpus-lab/pdf-classifier.test.ts
npm run check
```

Commit:

```bash
git add scripts/pdf-classifier scripts/corpus-lab/pdf-classifier-client.mts tests/corpus-lab/pdf-classifier.test.ts tests/fixtures/pdf-classifier
git commit -m "feat(corpus-lab): classify PDFs before reconstruction"
```

---

# Faza 11 — kanonski Word PDF→DOCX runner

## Task 11.1 — environment manifest i dry-run contract

**Files**

- Create: `scripts/corpus-lab/word/Get-WordEnvironment.ps1`
- Create: `scripts/corpus-lab/word/Convert-PdfToDocx.ps1`
- Create: `scripts/corpus-lab/word/README.md`
- Create: `tests/corpus-lab/word-runner-contract.test.ts`
- Create: `scripts/corpus-lab/word-runner-client.mts`

Environment manifest mora imati:

- Windows build;
- Office product/version/build/channel gdje dostupan;
- locale;
- Word UI/proofing language;
- font manifest hash;
- PowerShell verziju;
- conversion script hash;
- timestamp;
- host identity pseudonimiziran, ne korisničko ime.

Dry-run bez Worda mora validirati ulaze i vratiti `unavailable`, ne `pass`.

```bash
npx vitest run tests/corpus-lab/word-runner-contract.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): define pinned Word conversion environment"
```

## Task 11.2 — stvarna Word reflow konverzija

**Files**

- Modify: `scripts/corpus-lab/word/Convert-PdfToDocx.ps1`
- Create: `scripts/corpus-lab/word/Open-Save-Reopen.ps1`
- Create: `scripts/corpus-lab/word/Export-DocxPdf.ps1`
- Create: `tests/corpus-lab/word-conversion-manifest.test.ts`

Pipeline:

1. izolirani temp direktorij;
2. otvori source PDF Wordom;
3. zabilježi sva upozorenja/COM iznimke;
4. SaveAs DOCX;
5. zatvori;
6. otvori DOCX s `OpenAndRepair = $false`;
7. spremi/zatvori;
8. ponovno otvori s `OpenAndRepair = $false`;
9. izvezi Word-rendered PDF;
10. zatvori Word i oslobodi COM objekte u `finally`;
11. vrati manifest + exit code.

Sigurnost:

- isključi makroe/automatizirane vanjske linkove gdje Word API dopušta;
- nikad execute embedded content;
- timeout/kill orphan WINWORD procesa koji pripada ovom jobu;
- ne diraj korisnikov globalni Normal.dotm;
- unique automation profile/temp;
- input/output hash.

Na Windows+Word runneru napravi sintetički smoke. Bez tog runnera status ostaje `blocked-external`.

Commit tek nakon stvarnog ili jasno označenog contract-level testa; ne tvrdi Word PASS ako Word nije pokrenut.

```bash
powershell -ExecutionPolicy Bypass -File scripts/corpus-lab/word/Convert-PdfToDocx.ps1 -SelfTest
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): convert born-digital PDFs through Word reflow"
```

## Task 11.3 — semantic DOCX hash koji ignorira samo dokazano volatilne dijelove

**Files**

- Create: `tests/corpus-lab/semantic-docx-hash.ts`
- Create: `tests/corpus-lab/semantic-docx-hash.test.ts`

Binary SHA uvijek ostaje provenance. Semantic hash smije normalizirati samo poznata volatilna polja, primjerice core-properties timestamps/revision gdje je dokazano da ih Word mijenja bez semantičke promjene.

Tvrda pravila:

- ne ignoriraj `document.xml`, styles, numbering, rels, content types;
- svaka ignored XPath/property je u verzioniranoj allowlisti s razlogom;
- mutation test mora dokazati da promjena fonta/margine mijenja semantic hash;
- promjena samo save timestampa ne mijenja semantic hash;
- allowlista je dio hash policy verzije.

```bash
npx vitest run tests/corpus-lab/semantic-docx-hash.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): hash reconstructed DOCX semantics deterministically"
```

---

# Faza 12 — conversion fidelity gate i reconstructed cohort

## Task 12.1 — normalized text fidelity bez lažnog ground trutha

**Files**

- Create: `tests/corpus-lab/conversion-fidelity.ts`
- Create: `tests/corpus-lab/conversion-fidelity.test.ts`
- Create: `data/corpus-lab/conversion-quality-policy-v1.json`

Metrike:

- normalized text coverage nakon jasno dokumentirane dehyphenation/ligature normalizacije;
- word-count ratio;
- first/last content block prisutnost;
- duplication signal;
- source page count vs Word-rendered page count;
- image/table/header/footer indikatori;
- Word open/save/reopen rezultat;
- OPC validity.

Početni policy kandidat:

- text coverage ≥ 0.99;
- word ratio 0.98–1.02;
- page-count razlika diagnostic, ne automatski fail;
- hard fail na empty/severe loss/duplication/Word repair/invalid OPC.

Prag se **ne zaključava** dok 30-document calibration nije pregledan. Prije toga policy status je `draft`, pa release evaluator mora vratiti `unavailable` za reconstructed release evidence.

```bash
npx vitest run tests/corpus-lab/conversion-fidelity.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): gate reconstructed fixture fidelity"
```

## Task 12.2 — 30-document calibration workflow

**Files**

- Create: `scripts/corpus-lab/build-reconstructed-cohort.mts`
- Create: `scripts/corpus-lab/calibrate-conversion-policy.mts`
- Create: `tests/corpus-lab/cohort-selection.test.ts`
- Modify: `package.json`

Cohort selection je determinističan i stratificiran po work type/year/program, zatim raznolikosti duljine/footnotes/tables/figures kada su signali dostupni.

Workflow mora:

- uzeti samo rights-approved + born-digital;
- rezervirati holdout prije tuninga;
- conversion output označiti `fixtureClass = reconstructed`;
- ground truth capability ostaviti ograničenom;
- spremiti quality metrics i environment hash;
- quarantine low-fidelity;
- omogućiti owneru pregled agregata prije promjene policy statusa `draft → locked`;
- svaka lock odluka stvara novu policy verziju i commitani redaktirani decision manifest.

Naredbe:

```json
"corpus-lab:reconstruct": "vite-node scripts/corpus-lab/build-reconstructed-cohort.mts",
"corpus-lab:calibrate": "vite-node scripts/corpus-lab/calibrate-conversion-policy.mts"
```

```bash
npx vitest run tests/corpus-lab/cohort-selection.test.ts
npm run check
```

External run na Word runneru:

```bash
npm run corpus-lab:reconstruct -- --faculty fpzg --count 30 --calibration
npm run corpus-lab:calibrate -- --run <RUN_ID>
```

Commit koda prije private data runa je dopušten. Policy lock commit dolazi tek nakon stvarnog calibration evidencea.

## Task 12.3 — 200-source stress cohort

Nakon zaključanog policyja:

- odaberi 200 prava-eligible source identityja ili sve ako ih je manje;
- 20% zaključani holdout;
- ordinary dev set ne vidi holdout detalje;
- svaki fixture nosi converter environment hash;
- rerun istog sourcea u istom environmentu mora dati isti semantic hash ili biti označen nondeterministic;
- binary hash razlika sama nije kvar ako semantic hash i oracle dokazuju isto.

Ovo je data execution task, ne razlog za novi engine fork.

---

# Faza 13 — Word oracle i vizualni oracle

## Task 13.1 — generaliziraj postojeći Word oracle, ne gradi ga ispočetka

**Files**

- Modify: `scripts/word-verify/check.ps1` samo kroz zajednički helper, bez regresije postojećih naredbi
- Modify: `scripts/word-verify/check-worst-case.ps1` po potrebi
- Create: `scripts/word-verify/corpus-lab-check.ps1`
- Create: `scripts/word-verify/lib/WordOracle.ps1`
- Create: `tests/corpus-lab/word-oracle-manifest.test.ts`

Zadrži postojeće:

```bash
npm run verify:word
npm run verify:word:worst
npm run verify:word:toc
```

Corpus oracle za svaki relevantni changed output radi:

1. open `OpenAndRepair = false`;
2. evidence da nema repair/recovery događaja;
3. izmjeri odabrane Word-level properties;
4. snimi visible text prije `Fields.Update()`;
5. update fields;
6. snimi visible text poslije;
7. save/close/reopen `OpenAndRepair = false`;
8. export PDF;
9. zapiši Office build i input/output SHA;
10. sigurno zatvori COM.

Manifest nikad ne sprema puni vidljivi tekst; sprema hash + agregate + dopuštene technical excerpts samo za sintetičke fixturee.

```bash
npx vitest run tests/corpus-lab/word-oracle-manifest.test.ts
npm run verify:word
npm run verify:word:worst
npm run verify:word:toc
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): run corpus outputs through real Word oracle"
```

## Task 13.2 — visual diff s allowed scopeom

**Files**

- Create: `scripts/visual-oracle/diff.py`
- Create: `scripts/visual-oracle/requirements.txt`
- Create: `tests/corpus-lab/visual-oracle.test.ts`
- Create: `tests/fixtures/visual-oracle/`
- Create: `data/corpus-lab/visual-scope-policy-v1.json`

V1 visual oracle:

- renderira before/after Word PDF u image pages s pinanim rendererom;
- bilježi page count, blank pages, image/table disappearance signals i changed-pixel/block ratio;
- dopušta mutation/fixer-specific `allowed_visual_scope`;
- promjene izvan scopea daju fail/review ovisno o risk classu;
- Class H uvijek zahtijeva manual review čak i kada automatic diff prolazi, dok se ne prikupi dovoljan dokaz;
- ne uploadati screenshots stranica s tuđim radom kao javni CI artifact;
- private review pack koristi internal fixture ID.

Negativne kontrole:

- nestala slika;
- nova prazna stranica;
- pomaknuta naslovnica izvan dopuštenog scopea;
- legitimna promjena margine unutar očekivanog scopea.

```bash
python -m pip install -r scripts/visual-oracle/requirements.txt
npx vitest run tests/corpus-lab/visual-oracle.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): detect out-of-scope visual repair changes"
```

## Task 13.3 — manual review queue za Class H

**Files**

- Create: `scripts/corpus-lab/build-review-pack.mts`
- Create: `tests/corpus-lab/review-queue.test.ts`

Review item sadrži:

- internal fixture ID;
- fixer IDs;
- before/after hashes;
- safe metrics;
- private paths/signed refs generirane tek na zahtjev;
- checklistu: title page, sections, pagination, TOC, headers/footers, tables/figures, footnotes;
- reviewer verdict + reason;
- bez javnog source URL-a i bez osobnih podataka u reportu.

Class H public AutoFix kriterij: najmanje tri reprezentativna ručno pregledana slučaja uz mutation/composite/Word dokaz. Ovaj broj je floor, ne zamjena za holdout.

```bash
npx vitest run tests/corpus-lab/review-queue.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): require structured review for high-risk fixers"
```

---

# Faza 14 — reports, exact-SHA proof i release evaluator integracija

## Task 14.1 — machine JSON report bez sadržaja

**Files**

- Create: `tests/corpus-lab/report.ts`
- Create: `tests/corpus-lab/report.test.ts`
- Create: `scripts/corpus-lab/generate-report.mts`
- Create: `data/corpus-lab/report-schema-v1.json`

Report uključuje:

- exact Git commit/tree;
- dirty state;
- harness/schema version;
- faculty/profile/profile fingerprint;
- snapshot ID/hash;
- holdout completeness;
- environment manifests;
- per-check confusion matrix samo gdje ground truth postoji;
- per-fixer offered/applied/resolved/unresolved/regression/idempotence/determinism/oracle/Word/visual metrike;
- risk class status;
- release criterion status;
- safe blocker IDs.

Redaction guard mora odbiti:

- `title`, `authors`, `raw`, `quote`, `documentText` polja;
- apsolutne pathove;
- storage signed URL;
- email/service key;
- izvornik filename kada nosi osobne podatke.

```bash
npx vitest run tests/corpus-lab/report.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): emit content-free machine validation report"
```

## Task 14.2 — human Markdown/HTML dashboard

**Files**

- Create: `scripts/corpus-lab/generate-dashboard.mts`
- Create: `tests/corpus-lab/dashboard.test.ts`
- Create: `docs/generated/corpus-lab/README.md`

Dashboard prikazuje:

- overall verdict;
- bachelor/master/rule-era coverage;
- evidence class split;
- fixer matrix L/M/H;
- detection precision/recall samo za labelirane fixturee;
- converter-artifact/unknown-ground-truth count;
- Word/visual queue;
- failure cluster codes;
- release criteria;
- internal fixture IDs bez sadržaja.

Generated HTML ne ide nužno u javni site. Klasificiraj ga private i provjeri da ne ulazi u dist.

```bash
npx vitest run tests/corpus-lab/dashboard.test.ts tests/classification.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): generate private FPZG release dashboard"
```

## Task 14.3 — exact release proof

**Files**

- Create: `scripts/corpus-lab/write-release-proof.mts`
- Create: `scripts/corpus-lab/verify-release-proof.mts`
- Create: `tests/corpus-lab/release-proof.test.ts`
- Modify: `scripts/release-check.mjs`
- Modify: `package.json`

Proof mora biti fail-closed i vezan uz:

- exact commit i tree;
- clean working tree;
- exact profile fingerprint;
- exact corpus snapshot hash;
- exact harness/report schema;
- exact Word environment hash;
- complete holdout;
- policy versions;
- machine report hash;
- evaluator verdict `pass`.

Verifier mora pasti na:

- plitkom cloneu kada ne može dokazati SHA, a ne nastaviti fail-open;
- stale proofu;
- novom obveznom tieru kojeg stari proof ne poznaje;
- `unavailable` Wordu;
- missing holdoutu;
- različitom profile fingerprintu;
- dirty treeju;
- promjeni policyja;
- promjeni samo jednog fixture hasha.

Dodaj:

```json
"corpus-lab:proof": "vite-node scripts/corpus-lab/write-release-proof.mts",
"corpus-lab:proof:verify": "vite-node scripts/corpus-lab/verify-release-proof.mts"
```

U `release-check.mjs` dodaj novi required tier `fpzg-corpus-lab`, ali **tek kada infrastruktura može stvarno proizvesti proof**. Prije toga tier postoji kao `unavailable` i release proof nije complete.

```bash
npx vitest run tests/corpus-lab/release-proof.test.ts
npm run release:check -- --dry-run
npm run check
```

Commit:

```bash
git commit -am "feat(release): require exact FPZG Corpus Lab proof"
```

---

# Faza 15 — CI i deployment gate

## Task 15.1 — Linux public-code gate bez privatnog corpusa

**Files**

- Create: `.github/workflows/corpus-lab-contracts.yml`
- Modify: `.github/workflows/check.yml` samo ako agregira novi stabilan job

Job smije raditi bez tajni i pokriva:

- contracts;
- snapshot/holdout algorithms;
- rights policy pure tests;
- provider fake tests;
- mutation synthetic tests;
- OOXML oracle fixture tests;
- PDF classifier fixture tests;
- report/redaction/release-proof mutation tests;
- classification scan.

Ne pokušava preuzeti privatni corpus niti pokrenuti Word.

```bash
npm ci
python -m pip install -r scripts/ooxml-oracle/requirements.txt -r scripts/pdf-classifier/requirements.txt -r scripts/visual-oracle/requirements.txt
npx vitest run tests/corpus-lab tests/real-corpus/provider-parity.test.ts
npm run check
```

Workflow actions pinaj na SHA kao postojeći CI.

Commit:

```bash
git commit -am "ci(corpus-lab): gate public contracts and synthetic evidence"
```

## Task 15.2 — protected private-corpus job

**Files**

- Create: `.github/workflows/fpzg-corpus-lab.yml`
- Create: `docs/deploy/FPZG_CORPUS_LAB_RUNNER.md`

Workflow:

- `workflow_dispatch` i release trigger;
- protected environment `fpzg-corpus-lab`;
- najmanje privilegije;
- Supabase validation secrets samo u jobu;
- Linux job za inventory/provider/analysis/strict-open;
- Windows self-hosted job za Word conversion/oracle/visual export;
- holdout secret samo u release jobu;
- private artifacts nikad kao unrestricted GitHub upload;
- javno/standardno se objavljuje samo redaktirani machine report/proof;
- cleanup temp materijala uvijek;
- concurrency kontrola da dva release runa ne mijenjaju isti snapshot;
- timeout;
- `unavailable` je failure za release mode.

Ne dodaj job u required branch checks dok ne postigne stabilan niz i dok runner nije stvarno dostupan; zatim ga dodaj kroz branch protection kao agregirani `fpzg-corpus-lab-release`.

Commit:

```bash
git commit -am "ci(corpus-lab): run protected FPZG holdout and Word evidence"
```

## Task 15.3 — release gate mutation test

**Files**

- Modify: `tests/gate-mutations.test.ts`
- Create: `tests/corpus-lab/ci-contract.test.ts`

Podmetni:

- missing Windows result;
- leaked private artifact path;
- holdout disabled;
- stale snapshot;
- report s title/author poljem;
- workflow koji uploaduje `validation-corpus/**`;
- proof bez exact tree SHA-a.

Svaka mutacija mora biti uhvaćena.

```bash
npx vitest run tests/gate-mutations.test.ts tests/corpus-lab/ci-contract.test.ts
npm run check
```

Commit:

```bash
git commit -am "test(release): prove Corpus Lab CI fails closed"
```

---

# Faza 16 — FPZG calibration, development corpus i holdout release run

Ova faza kombinira kod i privatne execution podatke. Svaki korak mora proizvesti run ID, snapshot hash i redaktirani report.

## Task 16.1 — Stage A inventory svih 790 recentnih metapodataka

```bash
LEKTA_DABAR_LIVE=1 npm run corpus-lab:inventory:fpzg -- --years 2024:2026
npm run corpus-lab:snapshot -- --inventory-only --id fpzg-2024-2026-inventory-v1
```

Provjeri:

- canonical mapping;
- duplikate;
- bachelor/master/year distribuciju;
- rights unresolved count;
- nema source file downloada prije rights odluke.

Broj 790 je početno mjerenje, ne razlog da run padne ako corpus legitimno naraste. Razlika se mora objasniti diffom.

## Task 16.2 — gold target

Cilj najmanje 30 autoriziranih original DOCX-ova. Sustav se može graditi s manjim brojem, ali FPZG release evaluator mora ostati `unavailable` za full gold criterion dok cilj nije ispunjen.

Stratifikacija:

- bachelor/master;
- politologija/novinarstvo/aktualni programi;
- hrvatski/engleski;
- simple/complex;
- TOC;
- fusnote;
- tablice/slike;
- multi-section;
- front matter pagination;
- bibliography/links.

Svaki gold dobiva expectation review. Ne koristiti objavljenost rada kao oznaku “ispravan”.

## Task 16.3 — mutation closure

Pokreni:

```bash
npm run corpus-lab:run:fpzg -- --class mutation --mode isolated-fixer
npm run corpus-lab:run:fpzg -- --class mutation --mode default-bundle
```

Kriterij:

- svaki live automatic fixer ima registry odluku;
- minimalni positive/negative/idempotence set;
- 0 integrity failure;
- 0 PASS regression;
- 100% second-pass no-op;
- independent oracle closure;
- Class H Word+visual evidence ili fixer ostaje disabled/manual.

## Task 16.4 — 30 PDF calibration i policy lock

```bash
npm run corpus-lab:reconstruct -- --faculty fpzg --count 30 --calibration
npm run corpus-lab:calibrate -- --run <RUN_ID>
```

Owner pregledava redaktirani report i privatni review queue. Policy lock stvara novu verziju i commit. Ne mijenjaj prag bez novog policy ID-a.

## Task 16.5 — 200-source stress development set

```bash
npm run corpus-lab:reconstruct -- --faculty fpzg --count 200 --snapshot fpzg-2024-2026-v1
npm run corpus-lab:run:fpzg -- --snapshot fpzg-2024-2026-v1 --partition development
```

Reconstructed output se koristi za:

- crash/integrity/performance;
- unknown structure;
- fixer interaction;
- Word-open;
- determinism/idempotence;
- ne za dokaz hidden original Word propertyja.

## Task 16.6 — zaključani holdout release run

```bash
LEKTA_CORPUS_LAB_MODE=release npm run corpus-lab:run:fpzg -- --snapshot fpzg-2024-2026-v1 --partition holdout
npm run corpus-lab:proof
npm run corpus-lab:proof:verify
```

Hard kriteriji su oni iz Taska 1.2 i odobrenog dizajna. Nijedan failing fixture se ne smije ukloniti iz snapshota tijekom release runa. Ide u quarantine samo kroz zasebnu dokumentiranu novu snapshot verziju, uz razlog koji nije “ruši test”.

---

# Faza 17 — fixer enablement matrix

## Task 17.1 — automatska politika enable/advisory/manual/disabled

**Files**

- Create: `data/corpus-lab/fpzg-fixer-evidence.json`
- Create: `scripts/corpus-lab/generate-fixer-evidence.mts`
- Create: `tests/corpus-lab/fixer-enablement.test.ts`

Za svaki fixer output:

```text
fixerId
riskClass
evidenceCounts
mutationStatus
oracleStatus
WordStatus
visualStatus
holdoutStatus
finalMode: automatic | confirmation | advisory | disabled
reasonCodes
proofHash
```

Ovo u prvoj iteraciji **ne mijenja produkcijski fixer switch automatski**. Generira prijedlog i evidence. Svako uključivanje Class H fixera je zaseban review/commit s regresijskim testom.

Guard mora pasti ako javni automatic fixer nema odgovarajući evidence mode.

```bash
npx vitest run tests/corpus-lab/fixer-enablement.test.ts
npm run check
```

Commit:

```bash
git commit -am "feat(corpus-lab): derive FPZG fixer enablement from evidence"
```

## Task 17.2 — tek nakon dokaza poveži enablement s proizvodom

Za svaki fixer koji mijenja produkcijski mode:

1. napiši test koji pokazuje aktualni mode;
2. veži promjenu uz proof hash;
3. uključi samo taj fixer/risk group;
4. pokreni relevantne mutation, real corpus, strict-open i Word testove;
5. provjeri UI copy — ne tvrdi “spremno za predaju” kada manual review ostaje;
6. zaseban commit.

Obavezno:

```bash
npm run check
npm run test:slow
npm run repair-real-corpus:review
npm run verify:strict-open
npm run verify:word
npm run verify:word:worst
npm run verify:word:toc
npm run corpus-lab:proof:verify
```

Naredbe s Wordom moraju biti stvarno izvršene na odgovarajućem runneru.

---

# Faza 18 — skaliranje na sve rights-eligible FPZG 2024.–2026.

Nakon zelenog 200-source development + holdout:

```bash
npm run corpus-lab:reconstruct -- --faculty fpzg --all-eligible --years 2024:2026
npm run corpus-lab:run:fpzg -- --all-eligible --years 2024:2026
```

Izlaz klasificira:

- pass;
- review;
- quarantine;
- converter-artifact/unknown-ground-truth;
- source-unavailable;
- rights-unresolved;
- Word/open failure;
- idempotence failure;
- integrity/regression failure.

Ne pretvaraj source-unavailable ili rights-unresolved u prolaz. Ne računaj ih u denominator tehničke uspješnosti kao da su obrađeni.

Historical FPZG 2015.–2023. može ući samo u rule-neutral integrity stress dok nema verificiranih historical rule era profila. Ne boduj ga po 2024.–2026. pravilima.

---

# Faza 19 — dokaz da arhitektura nije FPZG hardcode

## Task 19.1 — synthetic second faculty pack contract

**Files**

- Create: `data/corpus-lab/faculty-packs/synthetic-test.json`
- Create: `tests/corpus-lab/faculty-pack-portability.test.ts`

Synthetic pack postoji samo u testovima i dokazuje da shared runner ne očekuje `fpzg` literale.

Test mora zamijeniti:

- faculty ID;
- aliases;
- work types;
- rule era;
- profile resolver;
- thresholds;
- stratification.

Nijedan shared module ne smije importati `fpzg.json` izravno; pack dolazi kroz registry/argument.

```bash
npx vitest run tests/corpus-lab/faculty-pack-portability.test.ts
npm run check
```

Commit:

```bash
git commit -am "test(corpus-lab): prove faculty-pack portability"
```

Tek nakon ovog testa i zelenog FPZG release proofa kreni na EFZG/Pravo/FFZG/FER packove.

---

# 20. Obvezni završni testovi prije tvrdnje da je implementacija gotova

## 20.1 Svaki commit

```bash
npm run check
```

## 20.2 Nakon DB/migration promjena

```bash
npm run migration-identity
npm run smoke:corpus-lab-db
npm run smoke:corpus-lab-db-security
npm run check:edge
npm run check
```

## 20.3 Nakon harness/repair/mutation promjena

```bash
npm run repair-real-corpus
npm run test:slow
npm run verify:strict-open
npm run check
```

## 20.4 Nakon Word/field/section promjena

```bash
npm run verify:word
npm run verify:word:worst
npm run verify:word:toc
```

Uz svaku naredbu sačuvaj stvarni exit code, Office build i proof manifest. “Skripta postoji” nije dokaz.

## 20.5 Release candidate

```bash
npm run check
npm run check:edge
npm run conformance
npm run test:slow
npm run verify:strict-open
npm run verify:word
npm run verify:word:worst
npm run verify:word:toc
npm run corpus-lab:run:fpzg -- --mode release --snapshot <LOCKED_SNAPSHOT>
npm run corpus-lab:proof
npm run corpus-lab:proof:verify
npm run release:check
```

Release je zelen samo ako:

- svi command exit codeovi su 0;
- Word tier je stvarno izveden;
- holdout je complete;
- machine report i proof hash se slažu;
- nema dirty treeja;
- exact source commit/tree odgovara onome što se deploya;
- nema unresolved hard criteriona.

---

# 21. Kriteriji prihvaćanja po isporučivoj cjelini

| Cjelina | Minimalni acceptance kriterij |
| --- | --- |
| Baseline | zatečeno ponašanje reproducibilno, bez sadržaja, guard ima mutacije |
| Data plane | privatna shema/bucket, anon/auth blokirani, migration identity zelen |
| FPZG inventory | svi aliasi mapirani deterministički, historical era odvojena |
| Rights gate | nijedan download prije eksplicitne odluke |
| Provider refactor | filesystem report parity, bez promjene repair semantike |
| Snapshot | immutable manifest hash, source-level 20% holdout, bez leakagea |
| Gold | samo autorizirani original DOCX, hash/provenance, expectation authority |
| Mutation | svi live fixeri klasificirani, single-fault + negative + idempotence |
| OOXML oracle | neovisni proces, input hash binding, cilj prije/poslije izmjeren |
| Acquisition | host/MIME/magic/hash/size/rights zaštite, bez brittle implicit scrapinga |
| PDF classifier | born-digital admission, scan/mixed quarantine, bez OCR-a |
| Word converter | open/save/reopen bez repaira, pinned environment manifest |
| Fidelity | locked versioned policy, reconstructed ostaje non-ground-truth |
| Word/visual | Class H ima Word + visual + manual representative evidence |
| Report | bez sadržaja/PII, exact provenance, per-fixer/check matrica |
| Release proof | exact-SHA/tree/profile/corpus/harness/Word, fail-closed |
| CI | public contracts bez tajni; private holdout/Word u protected environmentu |
| FPZG release | 0 integrity/regression/silent damage, 100% idempotence/Word za obvezni skup |
| Portability | synthetic second pack prolazi bez FPZG literala u shared runneru |

---

# 22. Stvari koje Claude Code ne smije napraviti

- Ne koristi PDF-reconstructed dokument kao dokaz izvornog Heading stila, section breaka, footnote objekta ili TOC fielda.
- Ne procjenjuje formalno pravilo prema najčešćem obrascu u corpusu.
- Ne preuzima sve URN-ove prije rights klasifikacije.
- Ne sprema stvarne dokumente u `tests/fixtures/docx/`, `docs/`, Git LFS ili GitHub artifact.
- Ne dodaje OCR u v1.
- Ne radi novi repair engine za corpus.
- Ne kopira `buildAllRepairableItems`/`buildDefaultRepairRequests` logiku.
- Ne mapira checkove po hrvatskom naslovu kada postoji `check.id`.
- Ne relaksira second-pass assertion da bi corpus bio zelen.
- Ne tretira integrity gate koji vrati originalne bytes kao no-op success.
- Ne označava `unavailable` kao pass.
- Ne pretpostavlja da Windows runner ima Word; provjerava i bilježi build.
- Ne pokreće Supabase migracije kroz MCP `apply_migration`.
- Ne deploya prvo na production.
- Ne stavlja service role u browser, Vite env ili javni bundle.
- Ne objavljuje private dashboard na produkcijskom siteu.
- Ne uključuje Class H fixer samo zato što unit test prolazi.
- Ne briše failing holdout fixture tijekom release runa.
- Ne mijenja conversion thresholds bez nove policy verzije.
- Ne tvrdi “FPZG potpuno pokriven” dok gold, holdout, Word i rights kriteriji nisu stvarno ispunjeni.

---

# 23. Preporučena podjela na PR-ove

Nemoj isporučiti cijeli sustav kao jedan mega-PR. Preporučeni PR-ovi:

1. `corpus-lab-baseline-contracts`
2. `corpus-lab-validation-data-plane`
3. `corpus-lab-fpzg-inventory-rights`
4. `corpus-lab-provider-refactor-snapshot`
5. `corpus-lab-gold-expectations`
6. `corpus-lab-mutation-engine-class-l`
7. `corpus-lab-mutations-class-m-h`
8. `corpus-lab-independent-ooxml-oracle`
9. `corpus-lab-dabar-acquisition-pdf-classifier`
10. `corpus-lab-word-conversion-fidelity`
11. `corpus-lab-word-visual-oracles`
12. `corpus-lab-reports-release-proof`
13. `corpus-lab-ci-holdout`
14. `fpzg-fixer-enablement`

Svaki PR mora imati:

- scope;
- RED test evidence;
- GREEN command output;
- sigurnosni/privacy impact;
- migration status gdje postoji;
- private-data statement;
- rollback plan;
- otvorene external blockere;
- bez lažne completion tvrdnje.

---

# 24. Završna definicija uspjeha

FPZG Corpus Lab v1 je implementiran tek kada za **točan release commit** može proizvesti provjerljiv dokaz koji odgovara na sljedeće:

1. Koji su izvori i fixture classovi testirani?
2. Koja službena FPZG rule era/profile verzija je korištena?
3. Za koje checkove postoji stvarni ground truth, a za koje samo stresni dokaz?
4. Koji je kvar kontrolirano injektiran u mutation fixture?
5. Je li Lekta kvar detektirala bez false-positivea na negativnoj kontroli?
6. Je li fixer riješio cilj prema neovisnom oracleu?
7. Je li output ostao valjan OPC/DOCX paket?
8. Je li Word otvorio, spremio i ponovno otvorio dokument bez repaira?
9. Je li vidljivi tekst ostao dopušteno netaknut prije i poslije `Fields.Update()`?
10. Je li nastala vizualna promjena samo u dopuštenom scopeu?
11. Je li drugi isti repair prolaz potpuni no-op?
12. Je li isti input/profile/recipe dao isti semantic output hash?
13. Je li uvedena ijedna PASS→FAIL regresija?
14. Je li svaki source imao rights odluku?
15. Je li zaključani holdout prošao iste tvrde kriterije?
16. Je li proof vezan uz exact commit/tree/profile/corpus/harness/Word environment?
17. Zašto je svaki fixer `automatic`, `confirmation`, `advisory` ili `disabled`?

Dok bilo koji tvrdi odgovor nedostaje, sustav mora reći `unavailable` ili `fail`, a ne “spreman”.

---

## 25. Prva naredba nakon što Claude Code primi ovaj dokument

```bash
cat CLAUDE.md
cat AGENTS.md
cat docs/REAL_CORPUS_TESTING.md
cat docs/superpowers/specs/2026-08-29-fpzg-corpus-lab-v1-design.md
cat docs/superpowers/plans/2026-08-29-fpzg-corpus-lab-v1-implementation.md
git status --short
git rev-parse HEAD
git rev-parse HEAD^{tree}
npm ci
npm run check
```

Zatim započni **Task 0.1**, ne kasniju fazu. Ne preskači baseline radi bržeg dolaska do PDF konverzije.