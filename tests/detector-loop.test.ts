import { describe, expect, it } from 'vitest';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import type { RuleEntry } from '../src/profiles/profile-schema';
import { buildDetectorDocxPair } from '../scripts/detector-docx-pair';
import { createDetectorExecutionManifest } from '../scripts/closed-loop-execution-manifest';

const profileId = 'fpzg-politologija-diplomski';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('detector loop on generated DOCX', () => {
  const analyze = (bytes: Uint8Array, profile: Record<string, unknown>) =>
    analyzeFixture(new File([bytes], 'boundary.docx', { type: DOCX_MIME }), { profileId, profile });
  it('TOC detector reports the violating document and clears the correct control', async () => {
    const profile = { ...resolveProfile(profileId), requireToc: true };
    const entry = { ruleId: `${profileId}--toc`, checkId: 'toc', value: true,
      autoFixable: false } as RuleEntry;
    const pair = buildDetectorDocxPair(entry, profile);
    expect(pair).not.toBeNull();
    if (!pair) return;
    const violating = await analyzeFixture(new File([pair.violatingBytes], 'violating.docx', { type: DOCX_MIME }), { profileId, profile });
    const correct = await analyzeFixture(new File([pair.correctBytes], 'correct.docx', { type: DOCX_MIME }), { profileId, profile });
    const manifest = createDetectorExecutionManifest({
      profileId, ruleId: entry.ruleId, ruleCheckId: entry.checkId!, checkId: 'toc.present',
      ruleValue: entry.value, analysisSourceHash: 'a'.repeat(64),
      testId: 'detector:test', command: 'test', ranAt: '2026-09-27T10:00:00.000Z',
      violatingInputBytes: pair.violatingBytes, violatingOutputBytes: pair.violatingBytes,
      correctInputBytes: pair.correctBytes, correctOutputBytes: pair.correctBytes,
      violatingCheck: violating.checks.find((check) => check.id === 'toc.present'),
      correctCheck: correct.checks.find((check) => check.id === 'toc.present'),
    });
    expect(manifest).toMatchObject({ kind: 'detector', outcome: 'pass' });
  });

  it('word-count pokriva obje granice s tolerancijom iz vrijednosti pravila', async () => {
    const profile = { ...resolveProfile(profileId), wordMin: 100, wordMax: 120 };
    const entry = { ruleId: `${profileId}--word-count`, checkId: 'word-count', value: { min: 100, max: 120 } } as RuleEntry;
    const low = buildDetectorDocxPair(entry, profile, 'min');
    const high = buildDetectorDocxPair(entry, profile, 'max');
    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
    if (!low || !high) return;
    const lowCheck = (await analyze(low.violatingBytes, profile)).checks.find((check) => check.id === 'scope.words')!;
    const highCheck = (await analyze(high.violatingBytes, profile)).checks.find((check) => check.id === 'scope.words')!;
    const cleanCheck = (await analyze(low.correctBytes, profile)).checks.find((check) => check.id === 'scope.words')!;
    expect(lowCheck.detail).toContain('89 riječi');
    expect(highCheck.detail).toContain('133 riječi');
    expect(lowCheck.earned).toBeLessThan(lowCheck.max);
    expect(highCheck.earned).toBeLessThan(highCheck.max);
    expect(cleanCheck.earned).toBe(cleanCheck.max);
    const fixedThresholdCheck = (await analyze(low.violatingBytes, { ...profile, wordMin: 50 })).checks
      .find((check) => check.id === 'scope.words')!;
    expect(fixedThresholdCheck.earned).toBe(fixedThresholdCheck.max);
  });

  it('reference-count krši točno min-1, pa bi fiksni niži prag propustio kvar', async () => {
    const profile = { ...resolveProfile(profileId), minReferences: 5 };
    const entry = { ruleId: `${profileId}--reference-count`, checkId: 'reference-count', value: 5 } as RuleEntry;
    const pair = buildDetectorDocxPair(entry, profile);
    expect(pair).not.toBeNull();
    if (!pair) return;
    const bad = (await analyze(pair.violatingBytes, profile)).checks.find((check) => check.id === 'reference.min-count')!;
    const good = (await analyze(pair.correctBytes, profile)).checks.find((check) => check.id === 'reference.min-count')!;
    expect(bad.detail).toContain('4 prepoznatih zapisa');
    expect(good.detail).toContain('5 prepoznatih zapisa');
    expect(bad.earned).toBeLessThan(bad.max);
    expect(good.earned).toBe(good.max);
    const fixedThreshold = (await analyze(pair.violatingBytes, { ...profile, minReferences: 4 })).checks
      .find((check) => check.id === 'reference.min-count')!;
    expect(fixedThreshold.earned).toBe(fixedThreshold.max);
  });
});
