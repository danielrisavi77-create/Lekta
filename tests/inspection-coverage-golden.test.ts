/**
 * T64: `details.inspectionCoverage` nad stvarnim golden fixturama.
 *
 * Postojeci DOCX golden (`tests/docx-golden.test.ts`) namjerno NE ukljucuje ovo polje (isti
 * obrazac kao `details.measurements`), pa njegovi snapshoti ostaju bajt-identicni. Ovaj zaseban
 * snapshot je regresijska mreza nad samim poljem: biljezi samo brojeve i vrste, bez teksta rada,
 * i provjerava invarijante koje vrijede za svaki dokument.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { allCheckIds } from '../src/scoring/check-id-registry';
import type { InspectionCoverage } from '../src/analysis/inspection-coverage';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, 'fixtures', 'docx');

function fixtureProfileId(fileName: string): string | undefined {
  const sidecar = join(FIXTURE_DIR, fileName.replace(/\.docx$/i, '.json'));
  if (!existsSync(sidecar)) return undefined;
  const meta = JSON.parse(readFileSync(sidecar, 'utf8'));
  return typeof meta.profileId === 'string' ? meta.profileId : undefined;
}

const fixtures = existsSync(FIXTURE_DIR)
  ? readdirSync(FIXTURE_DIR).filter((name) => name.toLowerCase().endsWith('.docx')).sort()
  : [];

describe('T64 inspectionCoverage nad golden fixturama', () => {
  it('fixture su stvarno ucitane (suite nije vakuumski)', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  it('oblik, invarijante i snapshot po fixturi', async () => {
    const known = new Set(allCheckIds());
    const out: Record<string, unknown> = {};
    for (const fileName of fixtures) {
      const bytes = readFileSync(join(FIXTURE_DIR, fileName));
      const file = new File([bytes], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const result = (await analyzeFixture(file, { profileId: fixtureProfileId(fileName) })) as { details?: { inspectionCoverage?: InspectionCoverage } };
      const coverage = result.details?.inspectionCoverage;
      expect(coverage, fileName).toBeDefined();
      if (!coverage) continue;
      expect(coverage.skippedParagraphs, fileName).toBeLessThanOrEqual(coverage.totalParagraphs);
      expect(coverage.totalParagraphs, fileName).toBeGreaterThan(0);
      expect(coverage.status === 'fullyChecked', fileName).toBe(coverage.skippedParts.length === 0);
      // Stvarni dokumenti prolaze kroz sve izvore; nepoznato stanje ovdje bi bilo kvar spoja.
      expect(coverage.skippedParts.some((p) => p.kind === 'analysisUnavailable'), fileName).toBe(false);
      for (const part of coverage.skippedParts) {
        expect(part.count, fileName).toBeGreaterThan(0);
        for (const id of part.affectedCheckIds) expect(known.has(id), `${fileName}: ${id}`).toBe(true);
      }
      out[fileName] = coverage;
    }
    expect(out).toMatchSnapshot();
  }, 300000);
});
