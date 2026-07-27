import { describe, it, expect } from 'vitest';

import rawSources from '../data/sources/source-registry.json';
import rawLedger from '../data/verification/ledger.json';
import manifest from '../data/manifest.json';

import { SOURCE_REGISTRY, VERIFICATION_LEDGER, findSource } from '../src/verification/verification-registry';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import {
  isRuleScored,
  runVerificationGate,
  type VerificationGateError,
} from '../src/verification/verification-gate';
import { planDegradations, changedSourceIds } from '../src/verification/source-change';
import { compileEffectiveRules } from '../src/profiles/rule-compiler';
import type { ThesisProfile, SourceEntry, RuleEntry } from '../src/profiles/profile-schema';

const NOW = '2026-06-30';

/** Sinteticki izvor bez snapshota: testira politiku neovisno o stanju zivog registra. */
const NO_SNAPSHOT_SOURCE: SourceEntry = {
  id: 'test-no-snapshot',
  kind: 'guidelines',
  title: 'Test izvor bez snapshota',
  url: 'https://example.test/no-snapshot',
  fetchedAt: null,
  snapshotPath: null,
  snapshotHash: null,
  validityClass: 'stable',
  lastChecked: null,
};
const NO_SNAPSHOT_SOURCE_ID = NO_SNAPSHOT_SOURCE.id;
const SOURCES_WITH_NO_SNAP = [...(SOURCE_REGISTRY as SourceEntry[]), NO_SNAPSHOT_SOURCE];

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

  it('volatilni primarni izvor ne rusi na drift (ocekivano, kao freshness)', () => {
    const volatileSrc = (SOURCE_REGISTRY as SourceEntry[]).find((s) => s.validityClass === 'volatile' && s.snapshotHash);
    expect(volatileSrc).toBeTruthy();
    const profiles: ThesisProfile[] = [
      { id: 'p1', rules: {}, ruleEntries: [scoredEntry({ sourceId: volatileSrc!.id, verifiedHash: 'stari-hash' })] },
    ];
    const c = codes(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW }));
    expect(c).not.toContain('source-hash-drift');
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
      { id: 'p1', rules: {}, ruleEntries: [scoredEntry({ sourceId: NO_SNAPSHOT_SOURCE_ID })] },
    ];
    const c = codes(runVerificationGate(profiles, SOURCES_WITH_NO_SNAP, { now: NOW }));
    expect(c).toContain('source-no-snapshot');
  });

  it('valjan dopunski izvor (snapshotiran, sa stranicom i citatom) prolazi', () => {
    const profiles: ThesisProfile[] = [
      {
        id: 'p1',
        rules: {},
        ruleEntries: [
          scoredEntry({
            additionalSources: [
              { sourceId: 'pravo-studij-integrirani-pravo', sourcePage: 'odjeljak Izjava o izvornosti', quote: 'sastavni dio', covers: 'izjava' },
            ],
          }),
        ],
      },
    ];
    expect(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW })).toEqual([]);
  });

  it('dopunski izvor koji ne postoji pada (scored-addsrc-orphan)', () => {
    const profiles: ThesisProfile[] = [
      { id: 'p1', rules: {}, ruleEntries: [scoredEntry({ additionalSources: [{ sourceId: 'ne-postoji', sourcePage: 'x', quote: 'y' }] })] },
    ];
    const c = codes(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW }));
    expect(c).toContain('scored-addsrc-orphan');
  });

  it('dopunski izvor bez snapshota pada (scored-addsrc-no-snapshot)', () => {
    const profiles: ThesisProfile[] = [
      { id: 'p1', rules: {}, ruleEntries: [scoredEntry({ additionalSources: [{ sourceId: NO_SNAPSHOT_SOURCE_ID, sourcePage: 'x', quote: 'y' }] })] },
    ];
    const c = codes(runVerificationGate(profiles, SOURCES_WITH_NO_SNAP, { now: NOW }));
    expect(c).toContain('scored-addsrc-no-snapshot');
  });

  it('dopunski izvor bez stranice/citata pada', () => {
    const profiles: ThesisProfile[] = [
      { id: 'p1', rules: {}, ruleEntries: [scoredEntry({ additionalSources: [{ sourceId: 'pravo-studij-integrirani-pravo', sourcePage: null, quote: null }] })] },
    ];
    const c = codes(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW }));
    expect(c).toContain('scored-addsrc-no-page');
    expect(c).toContain('scored-addsrc-no-quote');
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

  it('effectiveRules ostaje deep-equal rules (nema promjene ponasanja), OSIM kljuceva namjerno migriranih 2026-07-27', () => {
    // margins/justify/footnote-*/page-numbers su tog datuma dobili ruleEntries izravno iz
    // sluzbenih izvora (data/sources/pravo/*), pa vise NISU "ponasanje-neutralni" naspram stare
    // rules baze: margins je za socijalni-rad/socijalna-politika ISPRAVLJEN s pogodenih 2,5cm na
    // izvorom potvrdjenih 3,5/3/3/3, a ostali kljucevi su posve novi (rules ih nikad nije imao).
    // CLAUDE.md migracijski koraci: kad kljuc postane ruleEntry-vodjen, faithfulness vise ne trazi
    // punu jednakost za taj kljuc (oslanjamo se na nula-diagnostics + golden umjesto). Ostali
    // kljucevi i dalje moraju ostati deep-equal, da ova provjera i dalje hvata nenamjerni drift.
    const MIGRATED_2026_07_27 = ['margins', 'justify', 'footnoteFont', 'footnoteSize', 'footnoteSpacing', 'requirePageNumbers'];
    const omit = (obj: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(obj).filter(([k]) => !MIGRATED_2026_07_27.includes(k)));
    for (const p of lawProfiles) {
      expect(omit(compileEffectiveRules(p) as Record<string, unknown>)).toEqual(omit(p.rules ?? {}));
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
