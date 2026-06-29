# Golden harness (regresija parsera)

Legal Citation Engine i OOXML parser su tezki regexi nad hrvatskim pravnim i
akademskim formama; lako se kvare. Pravilo iz CLAUDE.md: **ne mijenjaj parser,
audit ni citation engine bez golden testa koji PRVO dokazuje zatecено ponasanje.**

Harness: `tests/docx-golden.test.ts` + `tests/fixtures/docx/`.

## Stanje danas

- Fixtura nema -> suite se sam preskace (`describe.skip`), `npm run check` zelen.
- Pipeline (`analyzeDocx` u `src/main.ts`) jos NIJE izlozen kao uvozljiva funkcija
  jer `src/main.ts` na dnu poziva `init()` koji dira DOM. Zato harness pipeline
  ucitava lijeno iz `src/analysis/golden-entry.ts` (taj modul jos ne postoji).

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
