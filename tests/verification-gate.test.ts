import { describe, it, expect } from 'vitest';

import rawSources from '../data/sources/source-registry.json';
import rawLedger from '../data/verification/ledger.json';
import manifest from '../data/manifest.json';

import { SOURCE_REGISTRY, VERIFICATION_LEDGER, findSource } from '../src/verification/verification-registry';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/profile-registry';
import {
  isRuleScored,
  runVerificationGate,
  type VerificationGateError,
} from '../src/verification/verification-gate';
import { planDegradations, changedSourceIds } from '../src/verification/source-change';
import { compileEffectiveRules } from '../src/profiles/rule-compiler';
import type { ThesisProfile, SourceEntry, RuleEntry } from '../src/profiles/profile-schema';

const NOW = '2026-06-30';

function codes(errors: VerificationGateError[]): string[] {
  return errors.map((e) => e.code).sort();
}

/** Potpuno valjano bodovano pravilo vezano na snapshotirani izvor. */
function scoredEntry(over: Partial<RuleEntry> = {}): RuleEntry {
  return {
    ruleId: 'r-font',
    checkId: 'font',
    value: ['Times New Roman'],
    authority: 'general',
    sourceId: 'pravo-upute-oblikovanje-2024',
    sourcePage: 'odjeljak 4',
    quote: 'font: Times New Roman',
    status: 'verified',
    lastVerified: '2026-06-29',
    ...over,
  };
}

describe('source registry i ledger: faithfulness', () => {
  it('SOURCE_REGISTRY = raw JSON', () => {
    expect(SOURCE_REGISTRY).toEqual(rawSources);
  });
  it('VERIFICATION_LEDGER = raw JSON', () => {
    expect(VERIFICATION_LEDGER).toEqual(rawLedger);
  });
  it('manifest broj izvora se slaze', () => {
    const row = manifest.find((m) => m.name === 'SOURCE_REGISTRY');
    expect(SOURCE_REGISTRY).toHaveLength(row!.entries);
  });
  it('primarni izvor ima snapshot i hash', () => {
    const src = findSource('pravo-upute-oblikovanje-2024');
    expect(src?.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(src?.snapshotPath).toContain('data/sources/pravo/');
  });
});

describe('isRuleScored: izvedeni scored (sekcija 2)', () => {
  it('potpuno pravilo je scored', () => {
    expect(isRuleScored(scoredEntry())).toBe(true);
  });
  it('draft nije scored', () => {
    expect(isRuleScored(scoredEntry({ status: 'draft' }))).toBe(false);
  });
  it('mentorski autoritet nije scored', () => {
    expect(isRuleScored(scoredEntry({ authority: 'mentor-or-course' }))).toBe(false);
  });
  it('bez sourcePage nije scored', () => {
    expect(isRuleScored(scoredEntry({ sourcePage: null }))).toBe(false);
  });
  it('bez quote nije scored', () => {
    expect(isRuleScored(scoredEntry({ quote: null }))).toBe(false);
  });
});

describe('runVerificationGate', () => {
  it('zivi pravni i FPZG profili prolaze vrata (sve draft/advisory)', () => {
    const profiles = [
      ...VERIFIED_PROFILES_WITH_DRAFTS,
      ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
    ] as unknown as ThesisProfile[];
    const errors = runVerificationGate(profiles, SOURCE_REGISTRY, { now: NOW });
    expect(errors).toEqual([]);
  });

  it('potpuno verificirano pravilo prolazi', () => {
    const profiles: ThesisProfile[] = [
      { id: 'p1', rules: {}, ruleEntries: [scoredEntry()] },
    ];
    expect(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW })).toEqual([]);
  });

  it('bodovano pravilo bez izvora, stranice, citata i autoriteta pada', () => {
    const bad = scoredEntry({
      authority: undefined,
      sourceId: null,
      sourcePage: null,
      quote: null,
      status: 'verified',
      scored: true,
    });
    const profiles: ThesisProfile[] = [{ id: 'p1', rules: {}, ruleEntries: [bad] }];
    const c = codes(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW }));
    expect(c).toContain('scored-authority');
    expect(c).toContain('scored-no-source');
    expect(c).toContain('scored-no-page');
    expect(c).toContain('scored-no-quote');
  });

  it('orphan sourceId pada', () => {
    const profiles: ThesisProfile[] = [
      { id: 'p1', rules: {}, ruleEntries: [scoredEntry({ sourceId: 'ne-postoji' })] },
    ];
    const c = codes(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW }));
    expect(c).toContain('orphan-source');
  });

  it('promijenjen snapshot izvora nakon verifikacije pada (source-hash-drift)', () => {
    const profiles: ThesisProfile[] = [
      { id: 'p1', rules: {}, ruleEntries: [scoredEntry({ verifiedHash: 'stari-hash' })] },
    ];
    const c = codes(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW }));
    expect(c).toContain('source-hash-drift');
  });

  it('podudaran verifiedHash prolazi', () => {
    const src = (SOURCE_REGISTRY as SourceEntry[]).find((s) => s.id === 'pravo-upute-oblikovanje-2024')!;
    const profiles: ThesisProfile[] = [
      { id: 'p1', rules: {}, ruleEntries: [scoredEntry({ verifiedHash: src.snapshotHash })] },
    ];
    expect(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW })).toEqual([]);
  });

  it('izvor bez snapshota ne moze potkrijepiti bodovano pravilo', () => {
    const profiles: ThesisProfile[] = [
      { id: 'p1', rules: {}, ruleEntries: [scoredEntry({ sourceId: 'pravo-pravilnik-studiji-2026' })] },
    ];
    const c = codes(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW }));
    expect(c).toContain('source-no-snapshot');
  });

  it('obvezujuce pravilo bez reviewedBy pada', () => {
    const profiles: ThesisProfile[] = [
      { id: 'p1', rules: {}, ruleEntries: [scoredEntry({ authority: 'binding' })] },
    ];
    const c = codes(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW }));
    expect(c).toContain('binding-no-review');
  });

  it('zastarjelo bodovano pravilo pada (freshness)', () => {
    const profiles: ThesisProfile[] = [
      { id: 'p1', rules: {}, ruleEntries: [scoredEntry({ lastVerified: '2023-01-01' })] },
    ];
    const c = codes(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW, freshnessMonths: 24 }));
    expect(c).toContain('stale');
  });

  it('scored:true koji se ne moze izvesti je greska', () => {
    const profiles: ThesisProfile[] = [
      { id: 'p1', rules: {}, ruleEntries: [scoredEntry({ status: 'draft', scored: true })] },
    ];
    const c = codes(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW }));
    expect(c).toContain('scored-not-derivable');
  });

  it('nemapiran checkId vraca compiler-diagnostic', () => {
    const profiles: ThesisProfile[] = [
      { id: 'p1', rules: {}, ruleEntries: [{ ruleId: 'r-x', checkId: 'nepoznato', value: 1, status: 'draft' }] },
    ];
    const c = codes(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW }));
    expect(c).toContain('compiler-diagnostic');
  });
});

describe('seedani pravni nacrti su ponasanje-neutralni', () => {
  const lawProfiles = [
    ...VERIFIED_PROFILES_WITH_DRAFTS.filter((p) => (p as { unitId?: string }).unitId === 'pravo'),
    ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
  ] as unknown as ThesisProfile[];

  it('svaki pravni profil ima ruleEntries', () => {
    expect(lawProfiles.length).toBeGreaterThan(0);
    for (const p of lawProfiles) expect((p.ruleEntries ?? []).length).toBeGreaterThan(0);
  });

  it('effectiveRules ostaje deep-equal rules (nema promjene ponasanja)', () => {
    for (const p of lawProfiles) {
      expect(compileEffectiveRules(p)).toEqual(p.rules ?? {});
    }
  });

  it('samo verificirana pravila su bodovana; ostala (draft/advisory/needs-recheck) nisu', () => {
    for (const p of lawProfiles) {
      for (const e of p.ruleEntries ?? []) {
        expect(isRuleScored(e)).toBe(e.status === 'verified');
      }
    }
  });
});

describe('source-change: degradacija na promjenu hasha (sekcija 5)', () => {
  it('changedSourceIds prepoznaje promjenu', () => {
    const changed = changedSourceIds([
      { sourceId: 'a', knownHash: 'x', freshHash: 'x' },
      { sourceId: 'b', knownHash: 'x', freshHash: 'y' },
    ]);
    expect([...changed]).toEqual(['b']);
  });

  it('promjena hasha degradira samo doprinosna pravila', () => {
    const profiles: ThesisProfile[] = [
      {
        id: 'p1',
        rules: {},
        ruleEntries: [
          scoredEntry({ ruleId: 'r-verified' }),
          scoredEntry({ ruleId: 'r-draft', status: 'draft' }),
        ],
      },
    ];
    const registry = SOURCE_REGISTRY as SourceEntry[];
    const fresh = new Map<string, string | null>([['pravo-upute-oblikovanje-2024', 'promijenjeni-hash']]);
    const plan = planDegradations(profiles, registry, fresh);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.ruleId).toBe('r-verified');
    expect(plan[0]?.reason).toBe('source-hash-changed');
  });
});
