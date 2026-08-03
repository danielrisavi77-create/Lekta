import { scoreMeta, type Issue } from '../scoring/checks';
import { categoryScores, type AnalysisResultLike } from '../report/report';
import type { RuleEntry } from '../profiles/profile-schema';
import { identifyFindings } from './finding-identity';
import {
  ACADEMIC_SUITE_CONTRACT_VERSION,
  normalizeLektaIssueSeverity,
  type LektaIssueRef,
  type LektaResult,
} from './academic-suite-contracts';

export interface LektaResultContext {
  analysisId: string;
  rulesetId: string;
  analyzedAt: string;
  projectId?: string;
  userId?: string;
  profileId?: string;
  ruleEntries?: RuleEntry[];
  documentFingerprint?: string;
  coverageTier?: number;
}

/** Legacy migration key retained for backwards compatibility/tests only. */
export function legacyIssueKey(issue: Pick<Issue, 'category' | 'title' | 'where'>): string {
  const raw = `${issue.category}\u001f${issue.title}\u001f${issue.where || ''}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `legacy:${(hash >>> 0).toString(36)}`;
}

/** Legacy privacy-safe projection retained for old callers. New shared results use identifyFindings(). */
export function projectLegacyIssueForHandoff(issue: Issue): LektaIssueRef {
  return {
    issueKey: legacyIssueKey(issue),
    checkId: null,
    ruleId: null,
    category: issue.category || 'other',
    severity: normalizeLektaIssueSeverity(issue.severity),
    summary: issue.title || 'Nalaz',
    fixable: false,
    fixerId: null,
    status: 'OPEN',
  };
}

/**
 * Adapter from the current Lekta analysis result to the shared v0.1 transport.
 *
 * Identity is now stable across re-checks:
 * - known engine checks use canonical checkId values;
 * - verified profile ruleEntries contribute their authored ruleId;
 * - issueKey is rule/check based, with a private location hash only when one
 *   logical check emits multiple simultaneous occurrences.
 *
 * Privacy boundary is unchanged: Issue.detail/where and raw document content do
 * not cross into the Katedra payload.
 */
export function toSharedLektaResult(
  result: AnalysisResultLike,
  context: LektaResultContext,
): LektaResult {
  const identified = identifyFindings(result.checks ?? [], result.issues ?? [], context.ruleEntries ?? []);
  const issues: LektaIssueRef[] = identified.map((item, index) => ({
    issueKey: item.issueKey,
    issueInstanceId: `${context.analysisId}:${index + 1}`,
    checkId: item.checkId,
    ruleId: item.ruleId,
    category: item.issue.category || 'other',
    severity: normalizeLektaIssueSeverity(item.issue.severity),
    summary: item.issue.title || 'Nalaz',
    fixable: item.fixable,
    fixerId: item.fixerId,
    status: 'OPEN',
  }));

  return {
    schemaVersion: ACADEMIC_SUITE_CONTRACT_VERSION,
    analysisId: context.analysisId,
    projectId: context.projectId,
    userId: context.userId,
    rulesetId: context.rulesetId,
    profileId: context.profileId || result.details?.profileDefinitionId || result.profile,
    score: result.score,
    scoreLabel: scoreMeta(result.score).label,
    profileStatus: result.profileStatus,
    categoryScores: categoryScores(result.checks),
    issues,
    analyzedAt: context.analyzedAt,
    documentFingerprint: context.documentFingerprint,
    coverageTier: context.coverageTier,
  };
}