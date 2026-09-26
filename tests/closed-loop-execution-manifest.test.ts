import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createClosedLoopExecutionManifest } from '../scripts/closed-loop-execution-manifest';

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
      manifestId: `closed-loop:${base.profileId}:${base.ruleId}:${sha256(inputBytes)}:${sha256(outputBytes)}`,
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
