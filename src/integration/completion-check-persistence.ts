import type { LektaResult } from './academic-suite-contracts';

export const COMPLETION_CHECK_PERSISTED_SLOT = 'lekta.completion-check-persisted.v0.1';
const DEFAULT_ENDPOINT = 'https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/record-completion-check';
const TOKEN_RE = /^[A-Za-z0-9_-]{43,128}$/;

export type CompletionCheckPersistenceResult =
  | { ok: true; checkId: string | null }
  | { ok: false; reason: string };

function endpoint(): string {
  const configured = String(import.meta.env.VITE_COMPLETION_CHECK_ENDPOINT || '').trim();
  return configured || DEFAULT_ENDPOINT;
}

function safeResult(result: LektaResult): LektaResult {
  // Re-project even though the upstream adapter is already sanitized. This
  // prevents a future accidental extension of LektaResult from silently sending
  // document-derived detail/location fields across the network.
  return {
    schemaVersion: result.schemaVersion,
    analysisId: result.analysisId,
    projectId: result.projectId,
    userId: result.userId,
    rulesetId: result.rulesetId,
    profileId: result.profileId,
    score: result.score,
    scoreLabel: result.scoreLabel,
    profileStatus: result.profileStatus,
    categoryScores: (result.categoryScores || []).map((item) => ({
      category: item.category,
      earned: item.earned,
      max: item.max,
    })),
    issues: (result.issues || []).map((issue) => ({
      issueKey: issue.issueKey,
      issueInstanceId: issue.issueInstanceId,
      checkId: issue.checkId,
      ruleId: issue.ruleId,
      category: issue.category,
      severity: issue.severity,
      summary: issue.summary,
      fixable: issue.fixable,
      fixerId: issue.fixerId,
      status: 'OPEN',
    })),
    analyzedAt: result.analyzedAt,
    documentFingerprint: result.documentFingerprint,
    coverageTier: result.coverageTier,
  };
}

function rememberPersisted(result: LektaResult, checkId: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(COMPLETION_CHECK_PERSISTED_SLOT, JSON.stringify({
      projectId: result.projectId,
      analysisId: result.analysisId,
      checkId,
      persistedAt: new Date().toISOString(),
    }));
  } catch {}
}

export function wasCompletionCheckPersisted(result: Pick<LektaResult, 'projectId' | 'analysisId'>): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const raw = sessionStorage.getItem(COMPLETION_CHECK_PERSISTED_SLOT);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { projectId?: unknown; analysisId?: unknown };
    return parsed.projectId === result.projectId && parsed.analysisId === result.analysisId;
  } catch {
    return false;
  }
}

export async function persistCompletionCheck(
  result: LektaResult,
  handoffToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CompletionCheckPersistenceResult> {
  if (!result.projectId || !TOKEN_RE.test(handoffToken)) {
    return { ok: false, reason: 'invalid-handoff' };
  }

  let response: Response;
  try {
    response = await fetchImpl(endpoint(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-completion-handoff': handoffToken,
      },
      body: JSON.stringify(safeResult(result)),
    });
  } catch {
    return { ok: false, reason: 'network-error' };
  }

  let body: any = null;
  try { body = await response.json(); } catch {}
  if (!response.ok || !body?.ok) {
    return {
      ok: false,
      reason: typeof body?.reason === 'string' ? body.reason : `http-${response.status}`,
    };
  }

  const checkId = typeof body.checkId === 'string' ? body.checkId : null;
  rememberPersisted(result, checkId);
  return { ok: true, checkId };
}
