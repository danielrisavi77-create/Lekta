import { scoreMeta, type Issue } from '../scoring/checks';
import { categoryScores, type AnalysisResultLike } from '../report/report';
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
  documentFingerprint?: string;
  coverageTier?: number;
}

/**
 * Stable-enough v0.1 reconciliation key for today's legacy Issue shape.
 *
 * IMPORTANT:
 * - It intentionally excludes `detail` so changing explanatory prose or quoted
 *   document content does not churn the key.
 * - `where` is included because the same check may fail in multiple locations.
 * - This is a migration bridge. Long term, checks should emit an explicit
 *   stable checkId/ruleId/location identity from the engine itself.
 */
export function legacyIssueKey(issue: Pick<Issue, 'category' | 'title' | 'where'>): string {
  const raw = `${issue.category}\u001f${issue.title}\u001f${issue.where || ''}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `legacy:${(hash >>> 0).toString(36)}`;
}

/**
 * Privacy-safe issue projection for Katedra handoff.
 *
 * Today's Lekta `Issue.detail` and `Issue.where` are presentation fields and can
 * contain document-derived context. v0.1 therefore does NOT copy them into the
 * cross-product payload. Katedra receives the finding identity/category/summary
 * only. Richer location data must be added later from structured, explicitly
 * classified non-sensitive metadata.
 */
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
 * It adds no new verification claims: missing stable IDs/fixability stay null/
 * false until the underlying engine can supply them from verified rule data.
 */
export function toSharedLektaResult(
  result: AnalysisResultLike,
  context: LektaResultContext,
): LektaResult {
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
    issues: (result.issues ?? []).map(projectLegacyIssueForHandoff),
    analyzedAt: context.analyzedAt,
    documentFingerprint: context.documentFingerprint,
    coverageTier: context.coverageTier,
  };
}
