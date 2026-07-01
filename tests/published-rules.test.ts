import { describe, it, expect } from 'vitest';

import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { VERIFIED_PROFILES_WITH_DRAFTS } from '../src/profiles/profile-registry';
import { computePublishedRules, scoredCoverage } from '../src/verification/published-rules';
import type { ThesisProfile, SourceEntry, RuleEntry } from '../src/profiles/profile-schema';

/** Potpuno verificirano i bodovano pravilo vezano na snapshotirani izvor. */
function verifiedEntry(over: Partial<RuleEntry> = {}): RuleEntry {
  return {
    ruleId: 'r-font',
    checkId: 'font',
    value: ['Times New Roman'],
    machineCheckable: true,
    authority: 'general',
    sourceId: 'pravo-upute-oblikovanje-2024', // ima snapshot + hash
    sourcePage: 'odjeljak 4',
    quote: 'font: Times New Roman',
    status: 'verified',
    lastVerified: '2026-06-29',
    ...over,
  };
}

const sources = SOURCE_REGISTRY as SourceEntry[];

describe('computePublishedRules: boduje se samo scored:true', () => {
  it('verificirano pravilo sa snapshotiranim izvorom je bodovano i ulazi u effectiveScored', () => {
    const profile: ThesisProfile = { id: 'p1', rules: {}, ruleEntries: [verifiedEntry()] };
    const r = computePublishedRules(profile, sources);
    expect(r.scored).toHaveLength(1);
    expect(r.advisory).toHaveLength(0);
    expect(r.effectiveScored).toEqual({ font: ['Times New Roman'] });
  });

  it('draft pravilo nije bodovano (advisory), effectiveScored je prazan', () => {
    const profile: ThesisProfile = { id: 'p1', rules: {}, ruleEntries: [verifiedEntry({ status: 'draft' })] };
    const r = computePublishedRules(profile, sources);
    expect(r.scored).toHaveLength(0);
    expect(r.advisory).toHaveLength(1);
    expect(r.effectiveScored).toEqual({});
  });

  it('verificirano pravilo s izvorom bez snapshota NIJE bodovano', () => {
    const profile: ThesisProfile = {
      id: 'p1',
      rules: {},
      ruleEntries: [verifiedEntry({ sourceId: 'pravo-pravilnik-studiji-2026' })], // nema snapshot
    };
    const r = computePublishedRules(profile, sources);
    expect(r.scored).toHaveLength(0);
    expect(r.advisory).toHaveLength(1);
  });

  it('advisory autoritet (mentor) nije bodovan', () => {
    const profile: ThesisProfile = {
      id: 'p1',
      rules: {},
      ruleEntries: [verifiedEntry({ authority: 'mentor-or-course' })],
    };
    expect(computePublishedRules(profile, sources).scored).toHaveLength(0);
  });
});

describe('zivi pravni profili: nista jos nije bodovano (aditivno, bez promjene)', () => {
  const lawProfiles = VERIFIED_PROFILES_WITH_DRAFTS.filter(
    (p) => (p as { unitId?: string }).unitId === 'pravo',
  ) as unknown as ThesisProfile[];

  it('celije s verificiranim pravilima su bodovane; bez verified nisu', () => {
    expect(lawProfiles.length).toBeGreaterThan(0);
    for (const p of lawProfiles) {
      const r = computePublishedRules(p, sources);
      const hasVerified = (p.ruleEntries ?? []).some((e) => e.status === 'verified');
      if (hasVerified) {
        expect(r.scored.length).toBeGreaterThan(0);
        expect(Object.keys(r.effectiveScored).length).toBeGreaterThan(0);
      } else {
        expect(r.scored).toHaveLength(0);
        expect(r.effectiveScored).toEqual({});
      }
      expect(r.advisory.length).toBeGreaterThan(0);
    }
  });

  it('scoredCoverage flagship celije odrazava verificirana pravila', () => {
    const integ = lawProfiles.find((p) => p.id === 'pravo-integrirani-diplomski')!;
    const c = scoredCoverage(integ, sources);
    expect(c.machineCheckable).toBeGreaterThan(0);
    expect(c.scored).toBeGreaterThan(0);
    expect(c.ratio).toBeGreaterThan(0);
  });
});
