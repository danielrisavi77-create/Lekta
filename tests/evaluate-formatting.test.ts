/**
 * evaluateFormatting (faza D, sav 1): tri tvrdnje nad cistom evaluacijom oblikovanja.
 *  1. EKVIVALENCIJA: za stvarne fixture, evaluateFormatting(details.measurements,
 *     profil, strict) emitira TOCNO one checkove koje je puni pipeline stavio na
 *     pocetak result.checks (isti objekti po dubini, isti redoslijed). To dokazuje
 *     da je sav cist: evaluacija ovisi SAMO o mjerenjima i profilu.
 *  2. CISTOCA: duboko zamrznuti ulazi ne bacaju (evaluacija nista ne mutira).
 *  3. IDENTITET: svaki emitirani check ima registriran stabilan id (CHECK_ID_BY_TITLE
 *     ili dinamicki page.size.*); sav nikad ne smije emitirati neregistriran naslov
 *     jer repair wiring tada tiho pada na 'manual'.
 * Suite se sam preskace bez fixtura, kao golden.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { evaluateFormatting } from '../src/scoring/evaluate/formatting';
import { stableCheckId, isPaperSizeCheckId } from '../src/scoring/check-id-registry';

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

const sample = files
  .map((name) => ({ name, profileId: profileIdFor(name) }))
  .filter((f): f is { name: string; profileId: string } => !!f.profileId)
  .slice(0, 3);

describe.skipIf(!sample.length)('evaluateFormatting: ekvivalencija, cistoca, identitet', () => {
  for (const { name, profileId } of sample) {
    it(`${name}: cista evaluacija === pocetak result.checks`, async () => {
      const buf = readFileSync(resolve(FIXTURES, name));
      const result = (await analyzeFixture(new File([buf], name), { profileId })) as {
        checks: unknown[];
        details: { measurements: Parameters<typeof evaluateFormatting>[0] };
      };
      const measurements = deepFreeze(structuredClone(result.details.measurements));
      const profile = deepFreeze(resolveProfile(profileId));

      // strict=0.12 odgovara settings.strictness 'standard' u golden harnessu.
      const out = evaluateFormatting(measurements, profile, 0.12);
      expect(out.checks.length).toBeGreaterThan(0);
      expect(result.checks.slice(0, out.checks.length)).toEqual(out.checks);

      for (const check of out.checks as Array<{ title: string }>) {
        const id = stableCheckId(check.title);
        expect(id !== null || isPaperSizeCheckId(id), `neregistriran naslov: ${check.title}`).toBe(true);
      }
    }, 120000);
  }
});
