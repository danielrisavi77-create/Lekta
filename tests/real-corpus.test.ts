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
    expect(report.results.every((result) => result.droppedEntryCount === 0)).toBe(true);
    expect(report.results.every((result) => result.passRegressionCount === 0)).toBe(true);
    expect(report.results.every((result) => result.error === null)).toBe(true);
  }, 180000);
});
