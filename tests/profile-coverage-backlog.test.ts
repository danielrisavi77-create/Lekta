import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLAIM_LADDER, type LedgerRow } from '../src/verification/completion-ledger';
import {
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
  VERIFIED_PROFILES_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import type { RuleEntry, ThesisProfile } from '../src/profiles/profile-schema';
import {
  buildProfileCoverageBacklog,
  type ProfileCoverageBacklog,
} from '../src/verification/profile-coverage-backlog';

const row = (profileId: string | null, claim: LedgerRow['claim'], unitId: string | null): LedgerRow => ({
  profileId,
  unitId,
  workType: 'graduate',
  programIds: [],
  program: 'missing',
  rules: claim === 'E' ? 'none' : claim === 'C' ? 'bulk-pending' : 'verified',
  repair: claim === 'D' ? 'universal-hygiene' : claim === 'E' ? 'manual-only' : 'faculty-specific',
  proof: claim === 'A' ? 'real-docx-pass' : claim === 'E' ? 'not-run' : 'synthetic-pass',
  proofSource: claim === 'A' ? 'profile' : null,
  assets: 'generic',
  claim,
  claimLabel: CLAIM_LADDER[claim],
  assetDetail: { titlePage: 'generic', citation: 'generic', declaration: 'generic' },
  evidence: {
    scoredMachineCheckable: claim === 'E' ? 0 : 1,
    scoredTotal: claim === 'E' ? 0 : 1,
    bulkPending: claim === 'C' ? 1 : 0,
    offeredRepairOptions: claim === 'E' ? 0 : 1,
    facultySpecificRepairOptions: claim === 'D' || claim === 'E' ? 0 : 1,
    realDocxSamples: claim === 'A' ? 1 : 0,
  },
  blockedReasons: claim === 'A' ? [] : [`blocked-${claim}`],
});

const rule = (profileId: string, complete = true): RuleEntry => ({
  ruleId: `${profileId}--font`,
  checkId: 'font',
  value: ['Times New Roman'],
  label: 'Font',
  sourceId: complete ? 'source-1' : null,
  sourcePage: complete ? 'str. 4' : null,
  quote: complete ? 'Tekst izvora.' : null,
  status: complete ? 'verified' : 'draft',
  scored: complete,
  verifiedBy: complete ? 'Reviewer' : null,
  reviewedBy: complete ? 'Reviewer 2' : null,
  autoFixable: complete,
  fixerId: complete ? 'font-fixer' : null,
});

describe('profile coverage backlog', () => {
  it('aggregates duplicate ledger rows without losing work-type evidence', () => {
    const result = buildProfileCoverageBacklog({
      profiles: [
        { profileId: 'alpha', registryKind: 'registry', unitId: 'unit-1', workTypes: ['graduate'], ruleEntries: [rule('alpha')] },
      ],
      ledgerRows: [row('alpha', 'B', 'unit-1'), { ...row('alpha', 'B', 'unit-1'), workType: 'final' }, row(null, 'E', 'unit-1')],
      faculties: [{ unitId: 'unit-1', facultyLabel: 'Fakultet 1' }],
    });

    expect(result.summary).toMatchObject({ registryProfileCount: 1, nullProfileRowCount: 1 });
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0]).toMatchObject({ profileId: 'alpha', claim: 'B', blocker: 'real-corpus', nextTarget: 'A' });
    expect(result.profiles[0].ledgerRows.map((entry) => entry.workType)).toEqual(['final', 'graduate']);
  });

  it('keeps legal departments separate and excludes program gaps from profile counts', () => {
    const result = buildProfileCoverageBacklog({
      profiles: [
        { profileId: 'alpha', registryKind: 'registry', unitId: 'unit-1', workTypes: ['graduate'], ruleEntries: [rule('alpha')] },
        { profileId: 'legal-alpha', registryKind: 'legal-department', unitId: null, workTypes: ['seminar'], ruleEntries: [rule('legal-alpha')] },
      ],
      ledgerRows: [row('alpha', 'A', 'unit-1'), row('legal-alpha', 'D', null), row(null, 'E', 'unit-1')],
      faculties: [{ unitId: 'unit-1', facultyLabel: 'Fakultet 1' }],
    });

    expect(result.summary).toMatchObject({ registryProfileCount: 1, legalDepartmentProfileCount: 1, nullProfileRowCount: 1 });
    expect(result.legalDepartments.map((entry) => entry.profileId)).toEqual(['legal-alpha']);
    expect(result.faculties[0]).toMatchObject({ unitId: 'unit-1', profileCount: 1, lowestClaim: 'A' });
  });

  it('classifies C, D and E work without promoting incomplete evidence', () => {
    const result = buildProfileCoverageBacklog({
      profiles: [
        { profileId: 'c-profile', registryKind: 'registry', unitId: 'unit-c', workTypes: ['graduate'], ruleEntries: [rule('c-profile')] },
        { profileId: 'd-profile', registryKind: 'registry', unitId: 'unit-d', workTypes: ['graduate'], ruleEntries: [rule('d-profile')] },
        { profileId: 'e-profile', registryKind: 'registry', unitId: 'unit-e', workTypes: ['graduate'], ruleEntries: [rule('e-profile', false)] },
      ],
      ledgerRows: [row('c-profile', 'C', 'unit-c'), row('d-profile', 'D', 'unit-d'), row('e-profile', 'E', 'unit-e')],
      faculties: [
        { unitId: 'unit-c', facultyLabel: 'C' },
        { unitId: 'unit-d', facultyLabel: 'D' },
        { unitId: 'unit-e', facultyLabel: 'E' },
      ],
    });

    expect(result.profiles.map((entry) => [entry.profileId, entry.blocker, entry.nextTarget])).toEqual([
      ['c-profile', 'human-audit', 'B'],
      ['d-profile', 'repair', 'B'],
      ['e-profile', 'source', 'B'],
    ]);
    expect(result.profiles[2].incompleteEvidence).toEqual(['e-profile--font: sourceId, sourcePage, quote, verifiedBy, reviewedBy']);
    expect(result.summary.blockerCounts).toMatchObject({ 'human-audit': 1, repair: 1, source: 1 });
  });
});

describe('generated profile coverage backlog', () => {
  it('matches a fresh build from the current registry, drafts and ledger', () => {
    const readJson = <T,>(relativePath: string): T =>
      JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as T;
    const registry = VERIFIED_PROFILES_WITH_DRAFTS as unknown as ThesisProfile[];
    const legal = LEGAL_DEPARTMENTS_WITH_DRAFTS as unknown as ThesisProfile[];
    const profiles = [
      ...registry.map((profile) => ({
        profileId: profile.id,
        registryKind: 'registry' as const,
        unitId: (profile as unknown as { unitId?: string }).unitId ?? null,
        workTypes: (profile as unknown as { workTypes?: string[] }).workTypes ?? [],
        ruleEntries: profile.ruleEntries ?? [],
      })),
      ...legal.map((profile) => ({
        profileId: profile.id,
        registryKind: 'legal-department' as const,
        unitId: (profile as unknown as { unitId?: string }).unitId ?? null,
        workTypes: (profile as unknown as { workTypes?: string[] }).workTypes ?? [],
        ruleEntries: profile.ruleEntries ?? [],
      })),
    ];
    const matrix = readJson<{ faculties: Array<{ unitId: string; facultyLabel: string }> }>(
      'docs/generated/faculty-matrix.json',
    );
    const ledger = readJson<{ rows: LedgerRow[] }>('docs/generated/completion-ledger.json');
    const fresh = buildProfileCoverageBacklog({ profiles, ledgerRows: ledger.rows, faculties: matrix.faculties });
    const baked = readJson<ProfileCoverageBacklog>('docs/generated/profile-coverage-backlog.json');

    expect(fresh).toEqual(baked);
    expect(fresh.summary).toMatchObject({
      registryProfileCount: 407,
      legalDepartmentProfileCount: 3,
      facultyCount: 131,
      registryProfilesBelowB: 81,
      legalDepartmentProfilesBelowB: 3,
    });
  });
});
