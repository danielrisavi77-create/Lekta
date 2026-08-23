/**
 * evaluatePageNumbers/ScopePages/EmptyParagraphs (faza D, sav 2): tri tvrdnje nad
 * cistim strukturnim evaluacijama koje NE trebaju tekst.
 *  1. EKVIVALENCIJA: za stvarne fixture, ciste funkcije nad details.measurements
 *     emitiraju TOCNO one checkove (po dubini i redoslijedu) koje je puni pipeline
 *     stavio u result.checks pod istim naslovima. Za razliku od sava 1 (kontinuiran
 *     blok na pocetku), ovi su checkovi RAZASUTI pa se usporeduje po skupu naslova.
 *  2. CISTOCA: duboko zamrznuti ulazi ne bacaju (evaluacija nista ne mutira).
 *  3. IDENTITET: svaki emitirani check ima registriran stabilan id.
 * Suite se sam preskace bez fixtura, kao golden.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { evaluatePageNumbers, evaluateScopePages, evaluateEmptyParagraphs, evaluateHeadingHierarchy, evaluateHeadingDepth } from '../src/scoring/evaluate/structure';
import type { StructureEvalMeasurements } from '../src/scoring/evaluate/measurements';
import { stableCheckId } from '../src/scoring/check-id-registry';

const FIXTURES = resolve(__dirname, 'fixtures', 'docx');
const files = existsSync(FIXTURES) ? readdirSync(FIXTURES).filter((f) => f.endsWith('.docx')) : [];

function profileIdFor(name: string): string | null {
  const metaPath = resolve(FIXTURES, name.replace(/\.docx$/, '.json'));
  if (!existsSync(metaPath)) return null;
  return (JSON.parse(readFileSync(metaPath, 'utf8')) as { profileId?: string }).profileId ?? null;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/** Podskup mjerenja koji ciste strukturne evaluacije trose. */
function evalInput(measurements: any): StructureEvalMeasurements {
  return {
    sections: measurements.sections,
    structure: measurements.structure,
    counts: { storedPages: measurements.counts.storedPages, paragraphs: measurements.counts.paragraphs },
  };
}

const sample = files
  .map((name) => ({ name, profileId: profileIdFor(name) }))
  .filter((f): f is { name: string; profileId: string } => !!f.profileId);

describe.skipIf(!sample.length)('evaluate structure (sav 2): ekvivalencija, cistoca, identitet', () => {
  let anyEmitted = 0;

  for (const { name, profileId } of sample) {
    it(`${name}: ciste strukturne evaluacije === odgovarajuci result.checks`, async () => {
      const buf = readFileSync(resolve(FIXTURES, name));
      const result = (await analyzeFixture(new File([buf], name), { profileId })) as {
        checks: Array<{ category: string; title: string }>;
        details: { measurements: any };
      };
      const m = deepFreeze(structuredClone(evalInput(result.details.measurements)));
      const profile = deepFreeze(resolveProfile(profileId));

      const pure = [
        ...evaluateHeadingHierarchy(m, profile),
        ...evaluateHeadingDepth(m, profile),
        ...evaluatePageNumbers(m, profile),
        ...evaluateScopePages(m, profile),
        ...evaluateEmptyParagraphs(m),
      ] as Array<{ title: string }>;
      anyEmitted += pure.length;

      // Skup naslova koje ciste funkcije emitiraju; filtriraj result.checks na te
      // naslove (cuvajuci redoslijed) i usporedi po dubini.
      const titles = new Set(pure.map((c) => c.title));
      const fromPipeline = result.checks.filter((c) => titles.has(c.title));
      expect(fromPipeline).toEqual(pure);

      for (const check of pure) {
        expect(stableCheckId(check.title), `neregistriran naslov: ${check.title}`).not.toBeNull();
      }
    }, 120000);
  }

  it('barem jedna fixtura je emitirala strukturni check (inace test nista ne dokazuje)', () => {
    expect(anyEmitted).toBeGreaterThan(0);
  });
});
