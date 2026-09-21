import { describe, expect, it } from 'vitest';
import { resolveProfile } from '../src/analysis/golden-entry';
import { ensureRepairMapHeavy, repairEntriesFor } from '../src/profiles/profile-runtime-maps';
import { buildAllRepairableItems } from '../src/ui/repair-item-assembly';

await ensureRepairMapHeavy();

describe('D profil: heading-rules repair wiring', () => {
  it.each(['gradri-zavrsni', 'gradri-diplomski'])('vezuje %s na verificirani izvorni ruleId', (profileId) => {
    const entries = repairEntriesFor(profileId);
    const profile = resolveProfile(profileId);
    const items = buildAllRepairableItems({
      result: { checks: [], issues: [], details: {} },
      profile,
      entries,
      includeNonViolated: true,
    });

    const item = items.find((candidate) => candidate.fixerId === 'heading-format-fixer');
    expect(item).toMatchObject({
      ruleId: `${profileId}--heading-rules`,
      fixerId: 'heading-format-fixer',
      authority: 'faculty-rule',
      violated: false,
      provenance: {
        sourcePage: 'Odjeljak 3.1 "Tekst opcenito", str. 7',
        lastVerified: '2026-07-27',
      },
    });
  });
});
