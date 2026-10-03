import { describe, expect, it } from 'vitest';
import type { ThesisProfile } from '../src/profiles/profile-schema';
import { publishAiAuditedRules } from '../src/profiles/publish-ai-rules';

const baseProfile = {
  id: 'profile-a',
  rules: { requireA4: true, headingRules: { levels: { '1': { size: 12 } } } },
};

const aiRule = {
  ruleId: 'profile-a--heading-rules',
  checkId: 'heading-rules',
  value: { levels: { '1': { size: 14 } } },
  authority: 'general' as const,
  sourceId: 'official-source',
  sourcePage: 'page 7',
  quote: 'Chapter headings are 14 pt.',
  status: 'verified' as const,
  scored: true,
  modality: 'obligation' as const,
  scope: 'heading' as const,
  confirmedVia: 'ai-evidence-audit' as const,
};

const profileWithAiRule = {
  ...baseProfile,
  ruleEntries: [aiRule],
} as unknown as ThesisProfile;

describe('publishAiAuditedRules', () => {
  it('publishes compiled values only for rules whose resolved AI audit is valid', () => {
    const published = publishAiAuditedRules(
      [baseProfile],
      [profileWithAiRule],
      { '["profile-a","profile-a--heading-rules"]': { valid: true, reasons: [] } },
    );

    expect(published[0].rules).toEqual({
      requireA4: true,
      headingRules: { levels: { '1': { size: 14 } } },
    });
    expect('ruleEntries' in published[0]).toBe(false);
  });

  it('fails closed when an AI-confirmed entry has no resolver result', () => {
    expect(() => publishAiAuditedRules([baseProfile], [profileWithAiRule], {}))
      .toThrow(/Nedostaje valjan AI-evidence rezultat/);
  });

  it('fails closed when the resolved AI audit is invalid', () => {
    expect(() => publishAiAuditedRules(
      [baseProfile],
      [profileWithAiRule],
      { '["profile-a","profile-a--heading-rules"]': {
        valid: false,
        reasons: [{ code: 'snapshot-hash-mismatch', message: 'stale' }],
      } },
    )).toThrow(/snapshot-hash-mismatch/);
  });

  it.each([
    ['ordinary draft', { ...aiRule, confirmedVia: null, status: 'draft' }],
    ['legacy AI batch', { ...aiRule, confirmedVia: 'ai-1pass-batch', status: 'verified' }],
  ])('preserves published rules when %s has no valid AI audit', (_label, entry) => {
    const untrustedProfile = {
      ...baseProfile,
      ruleEntries: [entry],
    } as unknown as ThesisProfile;
    const published = publishAiAuditedRules([baseProfile], [untrustedProfile], {});

    expect(published[0].rules).toEqual(baseProfile.rules);
  });

  it('preserves legacy profile-specific rules when no evidence profile is available', () => {
    const published = publishAiAuditedRules([baseProfile], [], {});

    expect(published[0].rules).toEqual(baseProfile.rules);
  });
});
