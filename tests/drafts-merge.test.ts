import { describe, it, expect } from 'vitest';

import { mergeDraftSources } from '../src/profiles/drafts-merge';
import {
  LAW_DRAFTS,
  IGNORED_FANOUT_PROFILES,
  draftRuleEntriesFor,
} from '../src/profiles/profile-registry';
import type { RuleEntry } from '../src/profiles/profile-schema';

const r = (ruleId: string, checkId: string): RuleEntry => ({
  ruleId,
  checkId,
  value: 1,
  status: 'draft',
});

describe('mergeDraftSources: gap-fill, ne override', () => {
  it('agregirani staging je autoritativan; fan-out za stageani profil se ignorira', () => {
    const res = mergeDraftSources(
      [{ profiles: { A: [r('A--font', 'font')] } }],
      [{ profileId: 'A', entries: [r('A-fanout', 'font-size')] }],
    );
    expect(res.profiles.A).toHaveLength(1);
    expect(res.profiles.A[0].ruleId).toBe('A--font');
    expect(res.ignored).toEqual(['A']);
  });

  it('fan-out za NOVI profil (bez staginga) ulazi', () => {
    const res = mergeDraftSources(
      [{ profiles: { A: [r('A--font', 'font')] } }],
      [{ profileId: 'B', entries: [r('B-font', 'font'), r('B-size', 'font-size')] }],
    );
    expect(res.profiles.B).toHaveLength(2);
    expect(res.ignored).toEqual([]);
  });

  it('vise fan-out datoteka za isti novi profil se nadovezuje i deduplicira po ruleId', () => {
    const res = mergeDraftSources(
      [],
      [
        { profileId: 'B', entries: [r('x', 'font')] },
        { profileId: 'B', entries: [r('y', 'toc'), r('x', 'page-numbers')] },
      ],
    );
    expect(res.profiles.B.map((e) => e.ruleId).sort()).toEqual(['x', 'y']);
    // zadnji 'x' pobjeduje (page-numbers)
    expect(res.profiles.B.find((e) => e.ruleId === 'x')?.checkId).toBe('page-numbers');
  });
});

describe('registry integracija: auto-discovery staginga', () => {
  it('seedani profil dolazi iz agregiranog law-drafts staginga', () => {
    const seeded = LAW_DRAFTS.profiles['pravo-integrirani-diplomski'];
    expect(draftRuleEntriesFor('pravo-integrirani-diplomski')).toEqual(seeded);
  });

  it('IGNORED_FANOUT_PROFILES je polje (prazno dok nema fan-out preklapanja)', () => {
    expect(Array.isArray(IGNORED_FANOUT_PROFILES)).toBe(true);
  });
});
