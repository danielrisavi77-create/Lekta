import { describe, it, expect } from 'vitest';

import {
  pendingRules,
  confirmVerification,
  makeAdvisory,
  retireRule,
  willScore,
  approveFromAi,
  type AiEvidence,
} from '../src/verification/verification-actions';
import { runVerificationGate } from '../src/verification/verification-gate';
import { SOURCE_REGISTRY, findSource } from '../src/verification/verification-registry';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import type { ThesisProfile, RuleEntry, SourceEntry } from '../src/profiles/profile-schema';

const NOW = '2026-06-30';
const UPUTE = 'pravo-upute-oblikovanje-2024';
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

function draftEntry(over: Partial<RuleEntry> = {}): RuleEntry {
  return {
    ruleId: 'r-font',
    checkId: 'font',
    value: ['Times New Roman'],
    machineCheckable: true,
    authority: 'general',
    sourceId: UPUTE,
    sourcePage: null,
    quote: null,
    status: 'draft',
    ...over,
  };
}

describe('pendingRules', () => {
  it('hvata draft i needs-recheck iz zivih staging profila', () => {
    const profiles = [
      ...VERIFIED_PROFILES_WITH_DRAFTS,
      ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
    ] as unknown as ThesisProfile[];
    const pend = pendingRules(profiles);
    expect(pend.length).toBeGreaterThan(0);
    for (const p of pend) {
      expect(p.entry.status === 'draft' || p.entry.status === 'needs-recheck').toBe(true);
    }
  });
});

describe('confirmVerification: covjek proglasava verified', () => {
  const source = findSource(UPUTE);

  it('potvrda postavlja polja i stampa verifiedHash', () => {
    const res = confirmVerification('p1', draftEntry(), source, {
      sourcePage: 'odjeljak 4',
      quote: 'font: Times New Roman',
      verifiedBy: 'daniel',
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entry.status).toBe('verified');
    expect(res.entry.sourcePage).toBe('odjeljak 4');
    expect(res.entry.verifiedHash).toBe(source!.snapshotHash);
    expect(res.entry.lastVerified).toBe(NOW);
    expect(willScore(res.entry)).toBe(true);
    expect(res.ledger.action).toBe('verified');
    expect(res.ledger.ruleId).toBe('r-font');
  });

  it('potvrdeno pravilo prolazi CI vrata bez gresaka', () => {
    const res = confirmVerification('p1', draftEntry(), source, {
      sourcePage: 'odjeljak 4',
      quote: 'font: Times New Roman',
      verifiedBy: 'daniel',
      now: NOW,
    });
    if (!res.ok) throw new Error('ocekivao ok');
    const profiles: ThesisProfile[] = [{ id: 'p1', rules: {}, ruleEntries: [res.entry] }];
    expect(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW })).toEqual([]);
  });

  it('odbija bez sourcePage i quote', () => {
    const res = confirmVerification('p1', draftEntry(), source, {
      sourcePage: '',
      quote: '',
      verifiedBy: 'daniel',
      now: NOW,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.includes('sourcePage'))).toBe(true);
    expect(res.errors.some((e) => e.includes('quote'))).toBe(true);
  });

  it('odbija mentorski autoritet (nije sluzbeni)', () => {
    const res = confirmVerification('p1', draftEntry({ authority: 'mentor-or-course' }), source, {
      sourcePage: 'odjeljak 4',
      quote: 'x',
      verifiedBy: 'daniel',
      now: NOW,
    });
    expect(res.ok).toBe(false);
  });

  it('odbija izvor bez snapshota', () => {
    const noSnap = NO_SNAPSHOT_SOURCE;
    const res = confirmVerification('p1', draftEntry({ sourceId: NO_SNAPSHOT_SOURCE_ID }), noSnap, {
      sourcePage: 'cl. 5',
      quote: 'x',
      verifiedBy: 'daniel',
      now: NOW,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.includes('snapshot'))).toBe(true);
  });

  it('binding trazi drugi par ociju razlicit od verifiedBy', () => {
    const bad = confirmVerification('p1', draftEntry({ authority: 'binding' }), source, {
      sourcePage: 'cl. 5',
      quote: 'x',
      verifiedBy: 'daniel',
      reviewedBy: 'daniel',
      now: NOW,
    });
    expect(bad.ok).toBe(false);

    const good = confirmVerification('p1', draftEntry({ authority: 'binding' }), source, {
      sourcePage: 'cl. 5',
      quote: 'x',
      verifiedBy: 'daniel',
      reviewedBy: 'mentor',
      now: NOW,
    });
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    expect(good.entry.reviewedBy).toBe('mentor');
    const profiles: ThesisProfile[] = [{ id: 'p1', rules: {}, ruleEntries: [good.entry] }];
    expect(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW })).toEqual([]);
  });
});

describe('approveFromAi: batch odobrenje 3-prolazne AI provjere (opcija C)', () => {
  const source = findSource(UPUTE);
  const agreeEvidence: AiEvidence = {
    ruleId: 'r-font',
    agree: true,
    summary: 'extract confirm, quote-check confirm, refute nije nasao protudokaz',
    passes: [
      { pass: 'extract', verdict: 'confirm', note: 'neovisno izvuceno Times New Roman' },
      { pass: 'quote-check', verdict: 'confirm', note: 'citat postoji doslovno' },
      { pass: 'refute', verdict: 'confirm', note: 'nema protudokaza' },
    ],
  };
  const ready = draftEntry({ sourcePage: 'odjeljak 4', quote: 'font: Times New Roman' });

  it('slozni AI prolazi + ljudski odobravatelj -> verified, confirmedVia ai-3pass-batch, scored', () => {
    const res = approveFromAi('p1', ready, source, { approver: 'daniel', now: NOW }, agreeEvidence);
    expect(res.ok).toBe(true);
    expect(res.entry?.status).toBe('verified');
    expect(res.entry?.confirmedVia).toBe('ai-3pass-batch');
    expect(res.entry?.verifiedBy).toBe('daniel');
    expect(willScore(res.entry!)).toBe(true);
  });

  it('dva ledger zapisa: ai-confirmed (actor ai-3pass) i verified (actor covjek)', () => {
    const res = approveFromAi('p1', ready, source, { approver: 'daniel', now: NOW }, agreeEvidence);
    const actions = (res.ledger ?? []).map((l) => `${l.action}:${l.actor}`);
    expect(actions).toContain('ai-confirmed:ai-3pass');
    expect(actions).toContain('verified:daniel');
  });

  it('odobreno pravilo prolazi CI vrata', () => {
    const res = approveFromAi('p1', ready, source, { approver: 'daniel', now: NOW }, agreeEvidence);
    const profiles: ThesisProfile[] = [{ id: 'p1', rules: {}, ruleEntries: [res.entry!] }];
    expect(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW })).toEqual([]);
  });

  it('neslozni AI prolazi -> odbijeno (ide na rucnu provjeru, ne batch)', () => {
    const res = approveFromAi('p1', ready, source, { approver: 'daniel', now: NOW }, { ...agreeEvidence, agree: false });
    expect(res.ok).toBe(false);
    expect(res.errors?.some((e) => e.includes('rucnu provjeru'))).toBe(true);
  });
});

describe('makeAdvisory i retireRule', () => {
  it('advisory ne boduje', () => {
    const res = makeAdvisory('p1', draftEntry(), { actor: 'daniel', now: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entry.status).toBe('advisory');
    expect(willScore(res.entry)).toBe(false);
    expect(res.ledger.action).toBe('advisory');
  });

  it('retire povlaci pravilo', () => {
    const res = retireRule('p1', draftEntry(), { actor: 'daniel', now: NOW });
    if (!res.ok) throw new Error('ocekivao ok');
    expect(res.entry.status).toBe('retired');
    expect(res.ledger.action).toBe('retired');
  });
});
