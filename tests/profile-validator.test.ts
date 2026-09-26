import { describe, it, expect } from 'vitest';
import { validateProfiles } from '../src/profiles/profile-validator';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import type { RuleEntry } from '../src/profiles/profile-schema';
import { createAiEvidenceAuditFixture } from './helpers/ai-evidence-audit-fixture';

// Ovaj test je jedini pozivatelj validateProfiles u `npm run check`: bez njega su
// autoFixable pravila validatora mrtvi kod (nalaz adversarijalne verifikacije).
// Vrata: NIJEDNO autoFixable pravilo u stvarnim podacima ne smije biti bez fixerId-a,
// s nepoznatim fixerId-om, ili na pravilu koje nije status:"verified".

describe('validateProfiles nad stvarnim podacima (vrata u check)', () => {
  it('verificirani profili sa staging draftovima prolaze bez gresaka', () => {
    expect(validateProfiles(VERIFIED_PROFILES_WITH_DRAFTS as any)).toEqual([]);
  });

  it('pravne katedre sa staging draftovima prolaze bez gresaka', () => {
    expect(validateProfiles(LEGAL_DEPARTMENTS_WITH_DRAFTS as any)).toEqual([]);
  });
});

describe('validateProfiles autoFixable pravila (jedinicno)', () => {
  const profileWith = (entry: Partial<RuleEntry>) =>
    [{ id: 'p1', ruleEntries: [{ ruleId: 'r1', ...entry } as RuleEntry] }] as any;

  it('autoFixable:true bez fixerId-a je greska', () => {
    const errors = validateProfiles(profileWith({ autoFixable: true, status: 'verified' }));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('bez fixerId-a');
  });

  it('autoFixable:true s nepoznatim fixerId-om (tipfeler) je greska', () => {
    const errors = validateProfiles(
      profileWith({ autoFixable: true, status: 'verified', fixerId: 'margin-fixer' }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('nepoznat fixerId "margin-fixer"');
  });

  it('autoFixable:true na pravilu koje nije verified je greska', () => {
    const errors = validateProfiles(
      profileWith({ autoFixable: true, status: 'advisory', fixerId: 'margins-fixer' }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('nije status:"verified"');
  });

  it('ispravno autoFixable pravilo prolazi', () => {
    const errors = validateProfiles(
      profileWith({ autoFixable: true, status: 'verified', fixerId: 'margins-fixer' }),
    );
    expect(errors).toEqual([]);
  });

  it('pravilo bez autoFixable se ne provjerava (default false)', () => {
    const errors = validateProfiles(profileWith({ status: 'draft' }));
    expect(errors).toEqual([]);
  });
});

describe('validateProfiles AI-evidence potvrda', () => {
  const profileWith = (profileId: string, ruleId: string, entry: Partial<RuleEntry>) =>
    [{ id: profileId, ruleEntries: [{ ruleId, ...entry } as RuleEntry] }] as any;

  it('odbija ai-evidence status bez strukturiranog dokaznog paketa', () => {
    const errors = validateProfiles(profileWith('p1', 'r1', { status: 'verified', confirmedVia: 'ai-evidence-audit' }));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('bez strukturiranog aiEvidence paketa');
  });

  it('zahtijeva verified status kad je potvrda AI-audit', () => {
    const fixture = createAiEvidenceAuditFixture();
    const errors = validateProfiles(
      profileWith(fixture.profileId, fixture.rule.ruleId, {
        ...fixture.rule,
        status: 'draft', confirmedVia: 'ai-evidence-audit', aiEvidence: fixture.evidence,
      }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('zahtijeva status:"verified"');
  });

  it('valjan AI dokaz dopušta auto-fixable verified pravilo bez reviewedBy', () => {
    const fixture = createAiEvidenceAuditFixture();
    const errors = validateProfiles(
      profileWith(fixture.profileId, fixture.rule.ruleId, {
        ...fixture.rule,
        status: 'verified',
        confirmedVia: 'ai-evidence-audit',
        aiEvidence: fixture.evidence,
        autoFixable: true,
        fixerId: 'font-fixer',
        reviewedBy: null,
      }),
    );
    expect(errors).toEqual([]);
  });

  it('odbija AI dokaz s pogresnim profilnim identitetom i bez ljudskog fallbacka', () => {
    const fixture = createAiEvidenceAuditFixture();
    const errors = validateProfiles(profileWith('other-profile', fixture.rule.ruleId, {
      status: 'verified',
      confirmedVia: 'ai-evidence-audit',
      aiEvidence: fixture.evidence,
      autoFixable: true,
      fixerId: 'font-fixer',
      reviewedBy: 'optional-human-does-not-repair-invalid-proof',
    }));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('nevaljan schema version, identitet ili snapshot hash');
  });

  it('ne dopušta pohranjen AI-evidence paket bez odgovarajuće metode potvrde', () => {
    const fixture = createAiEvidenceAuditFixture();
    const errors = validateProfiles(profileWith(fixture.profileId, fixture.rule.ruleId, {
      status: 'draft',
      aiEvidence: fixture.evidence,
    }));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('zahtijeva confirmedVia');
  });
});

describe('validateProfiles recommendedFixerId pravila (jedinicno)', () => {
  const profileWith = (entry: Partial<RuleEntry>) =>
    [{ id: 'p1', ruleEntries: [{ ruleId: 'r1', ...entry } as RuleEntry] }] as any;

  it('recommendedFixerId s nepoznatim fixerId-om (tipfeler) je greska', () => {
    const errors = validateProfiles(profileWith({ status: 'advisory', recommendedFixerId: 'margin-fixer' }));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('nepoznat recommendedFixerId "margin-fixer"');
  });

  it('recommendedFixerId zajedno s autoFixable:true na istom zapisu je greska', () => {
    const errors = validateProfiles(
      profileWith({ status: 'verified', autoFixable: true, fixerId: 'margins-fixer', recommendedFixerId: 'margins-fixer' }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('odaberi jedno');
  });

  it('ispravno recommendedFixerId na advisory pravilu prolazi', () => {
    const errors = validateProfiles(profileWith({ status: 'advisory', recommendedFixerId: 'margins-fixer' }));
    expect(errors).toEqual([]);
  });

  it('pravilo bez recommendedFixerId se ne provjerava (default null)', () => {
    const errors = validateProfiles(profileWith({ status: 'advisory' }));
    expect(errors).toEqual([]);
  });
});
