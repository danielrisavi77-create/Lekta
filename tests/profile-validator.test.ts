import { describe, it, expect } from 'vitest';
import { validateProfiles } from '../src/profiles/profile-validator';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import type { RuleEntry } from '../src/profiles/profile-schema';

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
