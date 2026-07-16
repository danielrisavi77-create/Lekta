# Golden harness (regresija parsera)

Legal Citation Engine i OOXML parser su tezki regexi nad hrvatskim pravnim i
akademskim formama; lako se kvare. Pravilo iz CLAUDE.md: **ne mijenjaj parser,
audit ni citation engine bez golden testa koji PRVO dokazuje zateceno ponasanje.**

Harness: `tests/docx-golden.test.ts` + `tests/fixtures/docx/`.

## Stanje danas

- Pipeline (`analyzeDocx`) JE izlozen kao uvozljiva funkcija: `src/main.ts` ograduje
  trailing `init()` (`if (document.getElementById('analyzer')) init()`) i izvozi
  `analyzeDocx`; `src/analysis/golden-entry.ts` je DOM-free adapter (`analyzeFixture`).
- Golden net je AKTIVAN i trajno SINTETICKI: `tests/synthetic-golden.test.ts` gradi
  deterministicki korpus (FPZG zavrsni/diplomski/doktorski + Pravo integrirani) u
  memoriji preko `tests/helpers/docx-builder.ts`, provlaci ga kroz `analyzeFixture` i
  snima stabilan projekt rezultata (`tests/helpers/golden-normalize.ts`) kao snapshot.
- Zasto sinteticki, ne realni: projekt NEMA i nece imati prave studentske `.docx`.
  Korpus je zato izvor istine golden zastite. Realni harness `tests/docx-golden.test.ts`
  ostaje (cita `tests/fixtures/docx/`) ali se sam preskace jer fixtura nema; oba dijele
  `golden-normalize`.
- Granica: `docx-builder` zasad ne radi fusnote, pa Legal Citation Engine nije pokriven
  sintetickim korpusom. Taj golden (uz prosirenje buildera za fusnote) dolazi kao PRVI
  korak porta legal-citation enginea, baseline prije diranja.

## Aktivacija (kad ubacis prve .docx)

Redoslijed je vazan: prvo ucini pipeline pozivljivim, ODMAH snimi baseline, tek
onda diraj parser.

1. **Fixture**: 5-10 `.docx` u `tests/fixtures/docx/` (vidi tamosnji README).
2. **Izlozi pipeline** (prvi golden-zasticeni zahvat u `src/main.ts`):
   - na kraju `src/main.ts` ogradi auto-start:
     `if (typeof document !== 'undefined' && document.getElementById('analyzer')) init();`
     (u pregledniku se ponasa identicno; u testu se init ne pokrece);
   - izvezi jezgru: `export { analyzeDocx, currentProfile };` (ili minimalan skup).
3. **golden-entry.ts**: tanak, DOM-free adapter koji harness uvozi:
   ```ts
   // src/analysis/golden-entry.ts
   import { analyzeDocx } from '../main';
   // deterministicki odaberi profil (po opts.profileId ili fiksni default)
   export async function analyzeFixture(file: File, opts?: { profileId?: string }) {
     const profile = resolveProfile(opts?.profileId);   // bez DOM-a
     const settings = goldenSettings(opts?.profileId);   // fiksni, deterministicki
     return analyzeDocx(file, profile, settings, () => {});
   }
   ```
   Ugovor koji harness ocekuje: `analyzeFixture(file, { profileId? }) => Promise<Result>`.
4. **Baseline**: `npm test -- -u`, pregledaj snapshote, commitaj ih s fixturama.
5. **Tek sada** refaktoriraj parser/audite; `npm run check` mora ostati zelen i
   snapshoti se NE smiju mijenjati. Ako se promijene, to je regresija dok ne
   dokazes da je promjena namjerna (pa ponovno `-u`).

## Okruzenje

Pipeline koristi `DecompressionStream('deflate-raw')`, `DOMParser` (XML) i `window`.
Test radi pod `happy-dom` (vidi `vitest.config.ts`). Ako neka sposobnost nedostaje
u test okruzenju, golden-entry/adapter to mora premostiti (npr. Node global
`DecompressionStream`) ili harness mora jasno preskociti uz poruku, ne tiho.

## Sto se snima

`normalizeResult` u harnessu snima stabilan projekt: `score`, `profile`,
`profileStatus`, otisak profila, `stats`, te `checks` i `issues` (bez promjenjivih
polja: `generatedAt`, id-evi iz `Date.now()/Math.random()`, velicina datoteke).
Popis prosiri kad vidis prave rezultate, da snapshot pokrije ono sto stiti.
