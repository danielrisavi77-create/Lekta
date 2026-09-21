import type { RuleEntry } from '../profiles/profile-schema';
import { CLAIM_LADDER, type ClaimLevel, type LedgerRow } from './completion-ledger';

export type ProfileRegistryKind = 'registry' | 'legal-department';
export type ProfileCoverageBlocker =
  | 'complete'
  | 'real-corpus'
  | 'human-audit'
  | 'repair'
  | 'source';

export interface ProfileCoverageInput {
  profileId: string;
  registryKind: ProfileRegistryKind;
  unitId: string | null;
  workTypes: readonly string[];
  ruleEntries: readonly RuleEntry[];
}

export interface FacultyCoverageInput {
  unitId: string;
  facultyLabel: string;
}

export interface ProfileRuleEvidence {
  ruleId: string;
  checkId: string | null;
  label: string | null;
  sourceId: string | null;
  sourcePage: string | null;
  quote: string | null;
  status: RuleEntry['status'] | null;
  scored: boolean;
  verifiedBy: string | null;
  reviewedBy: string | null;
  autoFixable: boolean;
  fixerId: string | null;
}

export interface ProfileCoverageItem {
  profileId: string;
  registryKind: ProfileRegistryKind;
  unitId: string | null;
  workTypes: string[];
  claim: ClaimLevel;
  claimLabel: string;
  nextTarget: 'A' | 'B' | null;
  blocker: ProfileCoverageBlocker;
  blockedReasons: string[];
  ledgerRows: LedgerRow[];
  ruleEvidence: ProfileRuleEvidence[];
  incompleteEvidence: string[];
}

export interface FacultyCoverageItem {
  unitId: string;
  facultyLabel: string;
  profileCount: number;
  profileIds: string[];
  claimCounts: Record<ClaimLevel, number>;
  lowestClaim: ClaimLevel | null;
  profilesBelowB: string[];
}

export interface ProfileCoverageSummary {
  registryProfileCount: number;
  legalDepartmentProfileCount: number;
  facultyCount: number;
  nullProfileRowCount: number;
  registryProfilesBelowB: number;
  legalDepartmentProfilesBelowB: number;
  profilesBelowB: number;
  facultiesBelowB: number;
  blockerCounts: Record<ProfileCoverageBlocker, number>;
  registryClaimCounts: Record<ClaimLevel, number>;
  legalDepartmentClaimCounts: Record<ClaimLevel, number>;
}

export interface ProfileCoverageBacklog {
  schemaVersion: 1;
  summary: ProfileCoverageSummary;
  profiles: ProfileCoverageItem[];
  legalDepartments: ProfileCoverageItem[];
  faculties: FacultyCoverageItem[];
}

export interface ProfileCoverageBacklogInput {
  profiles: readonly ProfileCoverageInput[];
  ledgerRows: readonly LedgerRow[];
  faculties: readonly FacultyCoverageInput[];
}

const CLAIM_RANK: Record<ClaimLevel, number> = { E: 1, D: 2, C: 3, B: 4, A: 5 };
const CLAIMS: ClaimLevel[] = ['A', 'B', 'C', 'D', 'E'];
const BLOCKERS: ProfileCoverageBlocker[] = ['complete', 'real-corpus', 'human-audit', 'repair', 'source'];

function emptyClaimCounts(): Record<ClaimLevel, number> {
  return { A: 0, B: 0, C: 0, D: 0, E: 0 };
}

function sortedLedgerRows(rows: readonly LedgerRow[]): LedgerRow[] {
  return [...rows].sort((a, b) => {
    const workType = String(a.workType ?? '').localeCompare(String(b.workType ?? ''));
    if (workType !== 0) return workType;
    return JSON.stringify(a.programIds).localeCompare(JSON.stringify(b.programIds));
  });
}

function ruleEvidence(entry: RuleEntry): ProfileRuleEvidence {
  return {
    ruleId: entry.ruleId,
    checkId: entry.checkId ?? null,
    label: entry.label ?? null,
    sourceId: entry.sourceId ?? null,
    sourcePage: entry.sourcePage ?? null,
    quote: entry.quote ?? null,
    status: entry.status ?? null,
    scored: entry.scored === true,
    verifiedBy: entry.verifiedBy ?? null,
    reviewedBy: entry.reviewedBy ?? null,
    autoFixable: entry.autoFixable === true,
    fixerId: entry.fixerId ?? null,
  };
}

function incompleteEvidence(entry: ProfileRuleEvidence): string | null {
  const missing: string[] = [];
  if (entry.sourceId == null) missing.push('sourceId');
  if (entry.sourcePage == null) missing.push('sourcePage');
  if (entry.quote == null) missing.push('quote');
  if (entry.status == null) missing.push('status');
  if (entry.verifiedBy == null) missing.push('verifiedBy');
  if (entry.reviewedBy == null) missing.push('reviewedBy');
  if (entry.autoFixable && entry.fixerId == null) missing.push('fixerId');
  return missing.length ? `${entry.ruleId}: ${missing.join(', ')}` : null;
}

function blockerForClaim(claim: ClaimLevel): ProfileCoverageBlocker {
  if (claim === 'A') return 'complete';
  if (claim === 'B') return 'real-corpus';
  if (claim === 'C') return 'human-audit';
  if (claim === 'D') return 'repair';
  return 'source';
}

function nextTargetForClaim(claim: ClaimLevel): 'A' | 'B' | null {
  if (claim === 'A') return null;
  return claim === 'B' ? 'A' : 'B';
}

function profileItem(
  profile: ProfileCoverageInput,
  rows: readonly LedgerRow[],
): ProfileCoverageItem {
  if (rows.length === 0) throw new Error(`profil ${profile.profileId} nema redak u completion ledgeru`);
  const claims = new Set(rows.map((row) => row.claim));
  if (claims.size !== 1) {
    throw new Error(`profil ${profile.profileId} ima proturjecne razine: ${[...claims].sort().join(', ')}`);
  }
  const claim = rows[0].claim;
  for (const row of rows) {
    if (row.claimLabel !== CLAIM_LADDER[row.claim]) {
      throw new Error(`profil ${profile.profileId} ima pogresnu labelu razine ${row.claim}`);
    }
  }
  const evidence = profile.ruleEntries.map(ruleEvidence).sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  return {
    profileId: profile.profileId,
    registryKind: profile.registryKind,
    unitId: profile.unitId,
    workTypes: [...new Set(profile.workTypes)].sort(),
    claim,
    claimLabel: CLAIM_LADDER[claim],
    nextTarget: nextTargetForClaim(claim),
    blocker: blockerForClaim(claim),
    blockedReasons: [...new Set(rows.flatMap((row) => row.blockedReasons))].sort(),
    ledgerRows: sortedLedgerRows(rows),
    ruleEvidence: evidence,
    incompleteEvidence: evidence.map(incompleteEvidence).filter((value): value is string => value != null),
  };
}

function facultyItem(input: FacultyCoverageInput, profiles: readonly ProfileCoverageItem[]): FacultyCoverageItem {
  const facultyProfiles = profiles.filter((profile) => profile.unitId === input.unitId);
  const claimCounts = emptyClaimCounts();
  for (const profile of facultyProfiles) claimCounts[profile.claim] += 1;
  const lowestClaim = facultyProfiles.length
    ? [...facultyProfiles].sort((a, b) => CLAIM_RANK[a.claim] - CLAIM_RANK[b.claim])[0].claim
    : null;
  return {
    unitId: input.unitId,
    facultyLabel: input.facultyLabel,
    profileCount: facultyProfiles.length,
    profileIds: facultyProfiles.map((profile) => profile.profileId).sort(),
    claimCounts,
    lowestClaim,
    profilesBelowB: facultyProfiles.filter((profile) => CLAIM_RANK[profile.claim] < CLAIM_RANK.B).map((profile) => profile.profileId).sort(),
  };
}

export function buildProfileCoverageBacklog(input: ProfileCoverageBacklogInput): ProfileCoverageBacklog {
  const rowsByProfile = new Map<string, LedgerRow[]>();
  let nullProfileRowCount = 0;
  for (const row of input.ledgerRows) {
    if (row.profileId == null) {
      nullProfileRowCount += 1;
      continue;
    }
    const rows = rowsByProfile.get(row.profileId) ?? [];
    rows.push(row);
    rowsByProfile.set(row.profileId, rows);
  }

  const seen = new Set<string>();
  const profileItems = input.profiles
    .map((profile) => {
      if (seen.has(profile.profileId)) throw new Error(`profil ${profile.profileId} je naveden vise puta`);
      seen.add(profile.profileId);
      return profileItem(profile, rowsByProfile.get(profile.profileId) ?? []);
    })
    .sort((a, b) => a.profileId.localeCompare(b.profileId));

  const registered = profileItems.filter((profile) => profile.registryKind === 'registry');
  const legalDepartments = profileItems.filter((profile) => profile.registryKind === 'legal-department');
  const registryClaimCounts = emptyClaimCounts();
  const legalDepartmentClaimCounts = emptyClaimCounts();
  const blockerCounts = Object.fromEntries(BLOCKERS.map((blocker) => [blocker, 0])) as Record<ProfileCoverageBlocker, number>;
  for (const profile of profileItems) {
    blockerCounts[profile.blocker] += 1;
    const counts = profile.registryKind === 'registry' ? registryClaimCounts : legalDepartmentClaimCounts;
    counts[profile.claim] += 1;
  }

  const faculties = input.faculties
    .map((faculty) => facultyItem(faculty, registered))
    .sort((a, b) => a.unitId.localeCompare(b.unitId));

  return {
    schemaVersion: 1,
    summary: {
      registryProfileCount: registered.length,
      legalDepartmentProfileCount: legalDepartments.length,
      facultyCount: faculties.length,
      nullProfileRowCount,
      registryProfilesBelowB: registered.filter((profile) => CLAIM_RANK[profile.claim] < CLAIM_RANK.B).length,
      legalDepartmentProfilesBelowB: legalDepartments.filter((profile) => CLAIM_RANK[profile.claim] < CLAIM_RANK.B).length,
      profilesBelowB: profileItems.filter((profile) => CLAIM_RANK[profile.claim] < CLAIM_RANK.B).length,
      facultiesBelowB: faculties.filter((faculty) => faculty.profilesBelowB.length > 0).length,
      blockerCounts,
      registryClaimCounts,
      legalDepartmentClaimCounts,
    },
    profiles: registered,
    legalDepartments,
    faculties,
  };
}

export const profileCoverageClaimLevels = CLAIMS;
