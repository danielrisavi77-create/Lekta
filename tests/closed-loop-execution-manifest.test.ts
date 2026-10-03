import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createClosedLoopExecutionManifest, createDetectorExecutionManifest } from '../scripts/closed-loop-execution-manifest';

const inputBytes = Buffer.from('generated-before-repair');
const outputBytes = Buffer.from('generated-after-repair');
const base = {
  profileId: 'ffos-diplomski',
  ruleId: 'ffos-diplomski--font-size',
  ruleValue: { size: 12 },
  repairSourceHash: 'a'.repeat(64),
  testId: 'closed-loop:ffos-diplomski:ffos-diplomski--font-size',
  command: 'npm run closed-loop -- --profile ffos-diplomski',
  inputBytes,
  outputBytes,
  before: { earned: 2, max: 4 },
  after: { earned: 4, max: 4 },
  textPreserved: true,
  integrityFailure: null,
  idempotent: true,
  regressions: 0,
  ranAt: '2026-09-24T10:00:00.000Z',
};

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('closed-loop execution manifest', () => {
  it('veže uspješan bodovani popravak na stvarne ulazne i izlazne bajtove', () => {
    expect(createClosedLoopExecutionManifest(base)).toEqual({
      manifestId: `closed-loop:${base.profileId}:${base.ruleId}:${sha256(inputBytes)}:${sha256(outputBytes)}:pass`,
      profileId: base.profileId,
      ruleId: base.ruleId,
      testId: base.testId,
      command: base.command,
      outcome: 'pass',
      inputHash: sha256(inputBytes),
      outputHash: sha256(outputBytes),
      repairSourceHash: base.repairSourceHash,
      ruleValueHash: sha256(Buffer.from('{"size":12}')),
      ranAt: base.ranAt,
    });
  });

  it('hash vrijednosti pravila ne ovisi o poretku kljuceva', () => {
    const first = createClosedLoopExecutionManifest({ ...base, ruleValue: { size: 12, family: 'TNR' } });
    const same = createClosedLoopExecutionManifest({ ...base, ruleValue: { family: 'TNR', size: 12 } });
    const changed = createClosedLoopExecutionManifest({ ...base, ruleValue: { family: 'TNR', size: 11 } });
    expect(first.ruleValueHash).toBe(same.ruleValueHash);
    expect(first.ruleValueHash).not.toBe(changed.ruleValueHash);
  });

  it.each([
    ['input had no scored violation', { before: { earned: 4, max: 4 } }],
    ['repair left the scored violation', { after: { earned: 2, max: 4 } }],
    ['visible text changed', { textPreserved: false }],
    ['package integrity failed', { integrityFailure: 'invalid-package' }],
    ['second repair pass was not a no-op', { idempotent: false }],
    ['a regression was detected', { regressions: 1 }],
    ['the check was not scored', { before: { earned: 0, max: 0 }, after: { earned: 0, max: 0 } }],
  ] as const)('does not issue a passing manifest when %s', (_reason, override) => {
    expect(createClosedLoopExecutionManifest({ ...base, ...override })).toMatchObject({ outcome: 'fail' });
  });
});

describe('detector execution manifest', () => {
  const detector = {
    profileId: 'p', ruleId: 'p--toc', ruleCheckId: 'toc', checkId: 'toc.present', ruleValue: true,
    analysisSourceHash: 'b'.repeat(64), testId: 'detector:p:p--toc',
    command: 'npm run detector-loop -- --profile p', ranAt: '2026-09-27T10:00:00.000Z',
    violatingInputBytes: Buffer.from('violating docx'), violatingOutputBytes: Buffer.from('violating docx'),
    correctInputBytes: Buffer.from('correct docx'), correctOutputBytes: Buffer.from('correct docx'),
    violatingCheck: { id: 'toc.present', earned: 0, max: 5 },
    correctCheck: { id: 'toc.present', earned: 5, max: 5 },
  };

  it('veže oba generirana dokumenta i stvarni prolaz detektora', () => {
    const manifest = createDetectorExecutionManifest(detector);
    expect(manifest).toMatchObject({ kind: 'detector', outcome: 'pass', checkId: 'toc.present',
      inputHash: sha256(detector.violatingInputBytes), outputHash: sha256(detector.correctOutputBytes),
      violatingOutputHash: sha256(detector.violatingOutputBytes),
      correctInputHash: sha256(detector.correctInputBytes), analysisSourceHash: detector.analysisSourceHash });
    expect(manifest.manifestId).toContain(manifest.ruleValueHash);
    expect(manifest.manifestId).toContain(detector.analysisSourceHash);
    expect(manifest.manifestId).toMatch(/:pass$/);
  });

  it('ne prolazi kad detektor ne prijavi kršenje ili nema bodovanog check.id', () => {
    expect(createDetectorExecutionManifest({ ...detector, violatingCheck: { id: 'toc.present', earned: 5, max: 5 } }).outcome).toBe('fail');
    expect(createDetectorExecutionManifest({ ...detector, checkId: '', violatingCheck: undefined, correctCheck: undefined }))
      .toMatchObject({ outcome: 'fail', failureReason: 'nema detektora' });
    expect(createDetectorExecutionManifest({ ...detector, violatingCheck: { id: 'toc.present', earned: 0, max: 0 } }).outcome).toBe('fail');
    expect(createDetectorExecutionManifest({ ...detector, violatingOutputBytes: Buffer.from('mutated') }).outcome).toBe('fail');
  });

  it('detector outcome is bound to its ID', () => {
    const passed = createDetectorExecutionManifest(detector);
    const failed = createDetectorExecutionManifest({ ...detector, violatingCheck: { id: 'toc.present', earned: 5, max: 5 } });
    expect(passed.manifestId).toMatch(/:pass$/);
    expect(failed.manifestId).toMatch(/:fail$/);
    expect(failed.manifestId).not.toBe(passed.manifestId);
  });

  it('ispravan dokument na kojem detektor uvijek prijavljuje krsenje daje fail', () => {
    const failed = createDetectorExecutionManifest({
      ...detector,
      correctCheck: { ...detector.correctCheck, earned: 0 },
    });
    expect(failed).toMatchObject({
      outcome: 'fail',
      failureReason: 'detektor ne razlikuje kršeći i ispravan dokument',
    });
  });
});

it('closed-loop outcome is bound to its ID', () => {
  const passed = createClosedLoopExecutionManifest(base);
  const failed = createClosedLoopExecutionManifest({ ...base, before: { earned: 4, max: 4 } });
  expect(passed.manifestId).toMatch(/:pass$/);
  expect(failed.manifestId).toMatch(/:fail$/);
  expect(failed.manifestId).not.toBe(passed.manifestId);
});
