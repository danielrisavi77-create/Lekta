import { describe, expect, it } from 'vitest';
import { exportAcademicRuleSet, isKatedraExportableRule } from '../src/integration/academic-core-export';
import type { RuleEntry, VerifiedProfile } from '../src/profiles/profile-schema';

const verifiedRule: RuleEntry = {
  ruleId: 'fpzg-format-margin',
  checkId: 'margin-check',
  value: { leftCm: 3 },
  category: 'format',
  label: 'Lijeva margina',
  machineCheckable: true,
  authority: 'binding',
  sourceId: 'fpzg-upute-2026',
  sourcePage: '12',
  status: 'verified',
  lastVerified: '2026-08-01',
  academicYear: '2025./2026.',
  autoFixable: true,
  fixerId: 'margins-fixer',
};

const draftRule: RuleEntry = {
  ruleId: 'draft-only',
  checkId: null,
  value: 'not ready',
  status: 'draft',
};

const advisoryRule: RuleEntry = {
  ruleId: 'advisory-only',
  checkId: null,
  value: 'mentor may require more',
  status: 'advisory',
  sourceId: 'fpzg-upute-2026',
};

const profile: VerifiedProfile = {
  id: 'fpzg-diplomski',
  unitId: 'fpzg',
  programs: ['politologija'],
  workTypes: ['graduate'],
  status: 'verified',
  profileLabel: 'FPZG diplomski',
  verifiedAt: '2026-08-01',
  rules: {},
  ruleEntries: [verifiedRule, draftRule, advisoryRule],
  ruleAuthority: 'official-sources-only',
};

describe('Academic Core export', () => {
  it('exports verified/advisory rules but not unfinished rule states', () => {
    expect(isKatedraExportableRule(verifiedRule)).toBe(true);
    expect(isKatedraExportableRule(advisoryRule)).toBe(true);
    expect(isKatedraExportableRule(draftRule)).toBe(false);
  });

  it('preserves provenance, verification, machine-checkable and AutoFix metadata', () => {
    const exported = exportAcademicRuleSet(profile, {
      workType: 'graduate',
      sourceVersion: 'lekta-deee9fd',
      generatedAt: '2026-08-03T12:00:00.000Z',
      institutionId: 'unizg',
      programId: 'politologija',
      academicYear: '2025./2026.',
    });

    expect(exported.ref.profileId).toBe('fpzg-diplomski');
    expect(exported.ref.unitId).toBe('fpzg');
    expect(exported.ref.workType).toBe('graduate');
    expect(exported.ref.sourceVersion).toBe('lekta-deee9fd');
    expect(exported.ref.rulesetId).toContain('fpzg-diplomski:graduate@lekta-deee9fd');
    expect(exported.rules.map((r) => r.ruleId)).toEqual(['fpzg-format-margin', 'advisory-only']);

    const rule = exported.rules[0];
    expect(rule.sourceId).toBe('fpzg-upute-2026');
    expect(rule.sourcePage).toBe('12');
    expect(rule.status).toBe('verified');
    expect(rule.lastVerified).toBe('2026-08-01');
    expect(rule.academicYear).toBe('2025./2026.');
    expect(rule.machineCheckable).toBe(true);
    expect(rule.autoFixable).toBe(true);
    expect(rule.fixerId).toBe('margins-fixer');
  });

  it('rejects a profile/work-type combination the profile does not claim', () => {
    expect(() =>
      exportAcademicRuleSet(profile, {
        workType: 'final',
        sourceVersion: 'test',
        generatedAt: '2026-08-03T12:00:00.000Z',
      }),
    ).toThrow(/does not support work type final/);
  });
});
