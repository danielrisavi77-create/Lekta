import { describe, expect, it } from 'vitest';
import { installLocalRulesProvider } from '../src/profiles/profile-rules-local';
import { ensureProfileRules, findVerifiedProfile, resetProfileRulesForTests } from '../src/profiles/profile-registry';
import { repairEntriesFor } from '../src/profiles/profile-runtime-maps';

describe('lokalni profile-rules provider', () => {
  it('ucitava postojeca pravila i popravke i bez AI-audita', async () => {
    resetProfileRulesForTests();
    installLocalRulesProvider();

    await ensureProfileRules('alu-slikarstvo-diplomski');

    expect(findVerifiedProfile('alu-slikarstvo-diplomski')?.rules).toMatchObject({
      checkSize: true,
      size: [12],
    });
    expect(repairEntriesFor('alu-slikarstvo-diplomski').length).toBeGreaterThan(0);
  });
});
