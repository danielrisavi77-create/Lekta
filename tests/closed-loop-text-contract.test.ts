import { describe, expect, it } from 'vitest';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { applyFixers } from '../src/repair/apply-fixers';
import { buildDefaultRepairRequests } from '../src/repair/default-selection';
import { documentText } from '../src/repair/docx-visible-text';
import { draftRuleEntriesFor } from '../src/profiles/drafts-runtime';
import { buildAllRepairableItems } from '../src/ui/repair-item-assembly';
import { textContractPreserved } from '../scripts/closed-loop-text-contract';
import { buildViolatingDocx } from './helpers/violating-docx';

describe('closed-loop ugovor vidljivog teksta', () => {
  it.each([
    'adu-dramaturgija-diplomski',
    'adu-montaza-diplomski',
    'gradri-diplomski',
    'vuka-poslovni-diplomski',
    'pravo-integrirani-diplomski',
  ])(
    '%s: prihvaca samo tekst koji objasnjavaju dopusteni fixeri', async (profileId) => {
      const profile = resolveProfile(profileId);
      const { bytes } = await buildViolatingDocx(profile, { structural: true });
      const before = await analyzeFixture(
        new File([bytes], `${profileId}.docx`, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
        { profileId, profile },
      );
      const items = buildAllRepairableItems({ result: before, profile, entries: draftRuleEntriesFor(profileId) } as never);
      const requests = buildDefaultRepairRequests(items as never);
      const applied = await applyFixers(bytes, requests);
      expect(applied.integrityFailure).toBeUndefined();
      const beforeText = await documentText(bytes);
      const afterText = await documentText(applied.docxBytes);
      expect(afterText).not.toBe(beforeText);
      expect(requests.some((request) => request.fixerId === 'croatian-typography-fixer')).toBe(true);
      expect(await textContractPreserved(bytes, beforeText, afterText, requests)).toBe(true);
      expect(await textContractPreserved(bytes, beforeText, `${afterText}neovlastena promjena`, requests)).toBe(false);
    },
  );
});
