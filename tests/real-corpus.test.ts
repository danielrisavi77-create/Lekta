import { describe, expect, it } from 'vitest';
import generatedReport from '../docs/generated/repair-real-corpus.json';
import { discoverRealCorpus, runRealCorpus } from './real-corpus/harness';

describe('Repair Engine real DOCX corpus', () => {
  it('izvodi deterministički closed-loop nad nesintetičkim fixtureima', async () => {
    const manifest = discoverRealCorpus();
    expect(manifest.length).toBeGreaterThan(0);
    expect(manifest.every((entry) => entry.profileId && !entry.fileName.startsWith('synthetic-'))).toBe(true);

    const report = await runRealCorpus();
    expect(report).toEqual(generatedReport);
    expect(report.summary.failCount).toBe(0);
    expect(report.results.every((result) => result.outputReadable && result.secondPassNoOp)).toBe(true);
    // Faza A2: `outputReadable` gleda samo word/document.xml, pa neispravan settings.xml ili
    // footer1.xml prolazi. Poruka nabraja bas pale dijelove umjesto golog "false".
    expect(report.results.flatMap((result) => result.malformedParts)).toEqual([]);
    expect(report.results.every((result) => result.droppedEntryCount === 0)).toBe(true);
    expect(report.results.every((result) => result.passRegressionCount === 0)).toBe(true);
    expect(report.results.every((result) => result.error === null)).toBe(true);
    // Vrata integriteta: odbijen popravak vraca ULAZNE bajtove, pa bi bez ove tvrdnje sve
    // gornje provjere prosle vakuumski nad neizmijenjenim originalom ("0 fail" bez pokrica).
    expect(report.summary.integrityFailureCount).toBe(0);
    expect(report.results.every((result) => result.integrityFailure === null)).toBe(true);
  }, 180000);
});
