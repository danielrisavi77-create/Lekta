import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RuleEntry } from '../src/profiles/profile-schema';
import { auditDProfile, type DProfileAuditInput } from '../src/verification/d-profile-audit';

function entry(overrides: Partial<RuleEntry> = {}): RuleEntry {
  return {
    ruleId: 'demo--rule',
    checkId: 'font',
    value: ['Times New Roman'],
    sourceId: 'demo-source',
    sourcePage: 'str. 1',
    quote: 'sluzbeni citat',
    status: 'verified',
    scored: true,
    ...overrides,
  };
}

function profile(ruleEntries: readonly RuleEntry[]): DProfileAuditInput {
  return { profileId: 'demo-profile', ruleEntries };
}

describe('D profile audit', () => {
  it('ne racuna advisory preporuku kao put do B', () => {
    const audit = auditDProfile(profile([
      entry({ status: 'advisory', scored: false, autoFixable: false, fixerId: null, recommendedFixerId: 'font-fixer' }),
    ]));

    expect(audit.disposition).toBe('needs-scored-rule');
    expect(audit.rules[0]).toMatchObject({ disposition: 'advisory-only', fixerId: 'font-fixer' });
  });

  it('prepoznaje verified scored auto fixer kao kandidata za D repair', () => {
    const audit = auditDProfile(profile([
      entry({ autoFixable: true, fixerId: 'font-fixer' }),
    ]));

    expect(audit.disposition).toBe('repair-candidate');
    expect(audit.rules[0]).toMatchObject({ disposition: 'auto-candidate', fixerId: 'font-fixer' });
  });

  it('ne proglasava staru required-sections shemu sigurnim fixerom', () => {
    const audit = auditDProfile(profile([
      entry({ checkId: 'required-sections', value: ['Uvod'], autoFixable: false, fixerId: null }),
    ]));

    expect(audit.disposition).toBe('manual-content-blocked');
    expect(audit.rules[0]).toMatchObject({ disposition: 'unsupported', fixerId: null });
  });

  it('prepoznaje samo novu, explicitno ozicenu required-section shemu', () => {
    const audit = auditDProfile(profile([
      entry({ checkId: 'required-section-rules', value: { order: ['summary-hr'], labels: { 'summary-hr': 'Sazetak' } } }),
    ]));

    expect(audit.disposition).toBe('repair-candidate');
    expect(audit.rules[0]).toMatchObject({ disposition: 'assisted-candidate', fixerId: 'required-section-fixer' });
  });

  it('blokira profil čije pravilo mijenja sadrzaj, poput opsega rada', () => {
    const audit = auditDProfile(profile([
      entry({ checkId: 'page-count', value: { min: 40, max: 50 } }),
    ]));

    expect(audit.disposition).toBe('manual-content-blocked');
    expect(audit.rules[0]).toMatchObject({ disposition: 'manual-content', fixerId: null });
  });

  it('ne klasificira nepoznati verified check kao popravljiv', () => {
    const audit = auditDProfile(profile([
      entry({ checkId: 'citation-style', value: 'custom' }),
    ]));

    expect(audit.disposition).toBe('manual-content-blocked');
    expect(audit.rules[0]).toMatchObject({ disposition: 'unsupported', fixerId: null });
  });

  it('generirani audit ima zasebno svih 37 D profila', () => {
    const artifact = JSON.parse(
      readFileSync(resolve(process.cwd(), 'docs/generated/d-profile-audit.json'), 'utf8'),
    ) as {
      schemaVersion: number;
      summary: { profileCount: number; dispositionCounts: Record<string, number> };
      profiles: Array<{ profileId: string }>;
    };

    expect(artifact.schemaVersion).toBe(1);
    expect(artifact.summary.profileCount).toBe(37);
    expect(artifact.summary.dispositionCounts).toEqual({
      'manual-content-blocked': 31,
      'needs-scored-rule': 3,
      'repair-candidate': 3,
    });
    expect(new Set(artifact.profiles.map((profile) => profile.profileId)).size).toBe(37);
  });
});
