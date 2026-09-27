/**
 * T64 korak 1: golden koji biljezi ZATECENO ponasanje izvora buduceg
 * `details.inspectionCoverage` (CLAUDE.md "Parser, audit ili citations: prvo golden").
 *
 * inspectionCoverage ce agregirati vec izracunate `skipped[]` nizove pet struktura i
 * zastavice `nested`/`unsupported` iz `tableFigureRescue`. Ovaj snapshot snima te izvore
 * nad stvarnim golden fixturama PRIJE uvodjenja agregacije, pa svaka kasnija promjena koja
 * bi usput pomaknula sam izvor (a ne samo njegovu agregaciju) rusi ovaj test.
 *
 * Snima samo brojeve i razloge (kratke oznake iz koda), nikad tekst rada.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { analyzeFixture } from '../src/analysis/golden-entry';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, 'fixtures', 'docx');

function fixtureProfileId(fileName: string): string | undefined {
  const sidecar = join(FIXTURE_DIR, fileName.replace(/\.docx$/i, '.json'));
  if (!existsSync(sidecar)) return undefined;
  const meta = JSON.parse(readFileSync(sidecar, 'utf8'));
  return typeof meta.profileId === 'string' ? meta.profileId : undefined;
}

type SkippedEntry = { paragraphIndex?: number; footnoteId?: number; reason?: string };

/** Sazetak jednog skipped[] niza: ukupno, broj razlicitih odlomaka i histogram razloga. */
function summarizeSkipped(structure: unknown): unknown {
  if (!structure || typeof structure !== 'object') return 'nema strukture';
  const skipped = (structure as { skipped?: unknown }).skipped;
  if (!Array.isArray(skipped)) return 'nema skipped niza';
  const entries = skipped as SkippedEntry[];
  const reasons: Record<string, number> = {};
  for (const entry of entries) {
    const key = String(entry.reason ?? '');
    reasons[key] = (reasons[key] ?? 0) + 1;
  }
  const paragraphIndexes = new Set(entries.map((e) => e.paragraphIndex).filter((i) => typeof i === 'number'));
  const withoutParagraph = entries.filter((e) => typeof e.paragraphIndex !== 'number').length;
  return { total: entries.length, distinctParagraphs: paragraphIndexes.size, withoutParagraph, reasons };
}

function summarizeTables(rescue: unknown): unknown {
  if (!rescue || typeof rescue !== 'object') return 'nema strukture';
  const tables = (rescue as { tables?: unknown }).tables;
  if (!Array.isArray(tables)) return 'nema tables niza';
  const list = tables as Array<{ nested?: boolean; unsupported?: boolean }>;
  return {
    tables: list.length,
    nested: list.filter((t) => t.nested === true).length,
    unsupported: list.filter((t) => t.unsupported === true).length,
  };
}

const fixtures = existsSync(FIXTURE_DIR)
  ? readdirSync(FIXTURE_DIR).filter((name) => name.toLowerCase().endsWith('.docx')).sort()
  : [];

describe('T64 izvori inspectionCoverage: zateceno ponasanje', () => {
  it('fixture su stvarno ucitane (suite nije vakuumski)', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  it('skipped nizovi i zastavice tablica nad golden fixturama', async () => {
    const out: Record<string, unknown> = {};
    for (const fileName of fixtures) {
      const bytes = readFileSync(join(FIXTURE_DIR, fileName));
      const file = new File([bytes], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const result = (await analyzeFixture(file, { profileId: fixtureProfileId(fileName) })) as { details?: Record<string, unknown> };
      const details = result.details ?? {};
      out[fileName] = {
        consistencyStructure: summarizeSkipped(details.consistencyStructure),
        linkDoiStructure: summarizeSkipped(details.linkDoiStructure),
        typographyStructure: summarizeSkipped(details.typographyStructure),
        requiredSectionsStructure: summarizeSkipped(details.requiredSectionsStructure),
        legalFootnoteStructure: details.legalFootnoteStructure == null ? null : summarizeSkipped(details.legalFootnoteStructure),
        tableFigureRescue: summarizeTables(details.tableFigureRescue),
      };
    }
    expect(out).toMatchSnapshot();
  }, 300000);
});
