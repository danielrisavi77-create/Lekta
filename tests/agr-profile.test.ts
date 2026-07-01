import { describe, it, expect } from 'vitest';

import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { VERIFIED_PROFILES_WITH_DRAFTS } from '../src/profiles/profile-registry';
import { runVerificationGate } from '../src/verification/verification-gate';
import { computePublishedRules } from '../src/verification/published-rules';
import { computeCoverageCell } from '../src/verification/coverage-report';
import type { ThesisProfile, SourceEntry } from '../src/profiles/profile-schema';

const NOW = '2026-07-02';

const agr = VERIFIED_PROFILES_WITH_DRAFTS.find(
  (p) => p.id === 'agr-diplomski',
) as unknown as ThesisProfile | undefined;

describe('AGR (Agronomski fakultet, diplomski): produkcijski profil', () => {
  it('profil je registriran i ima 9 ruleEntries iz fan-out drafta', () => {
    expect(agr).toBeDefined();
    expect(agr!.ruleEntries).toHaveLength(9);
  });

  it('izvor je snapshotiran (moze potkrijepiti bodovano pravilo)', () => {
    const src = (SOURCE_REGISTRY as SourceEntry[]).find((s) => s.id === 'agr-upute-diplomski-2019');
    expect(src?.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(src?.snapshotPath).toContain('data/sources/agr/');
  });

  it('prolazi verifikacijski gate bez gresaka', () => {
    expect(runVerificationGate([agr!], SOURCE_REGISTRY as SourceEntry[], { now: NOW })).toEqual([]);
  });

  it('boduje se samo imperativno: numeracija stranica i sadrzaj (2 scored, 7 advisory)', () => {
    const { scored, advisory } = computePublishedRules(agr!, SOURCE_REGISTRY as SourceEntry[]);
    expect(scored.map((e) => e.checkId).sort()).toEqual(['page-numbers', 'toc']);
    expect(advisory).toHaveLength(7);
    // Preporuke ostaju advisory iako imaju sluzbeni izvor i citat.
    expect(advisory.map((e) => e.checkId)).toContain('font-size');
    expect(advisory.map((e) => e.checkId)).toContain('margins');
  });

  it('coverage celija: 2/7 strojno provjerljivih bodovano', () => {
    const cell = computeCoverageCell(agr!, SOURCE_REGISTRY as SourceEntry[]);
    expect(cell.scored).toBe(2);
    expect(cell.machineCheckable).toBe(7);
    expect(cell.lastVerified).toBe('2026-06-30');
  });
});
