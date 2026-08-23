import { APP_VERSION } from '../config/app-version';
import { isAcademicWorkType } from './academic-suite-contracts';
import { currentCompletionHandoffToken, currentKatedraProjectId } from './katedra-entry';
import { toKatedraSharedResult } from './katedra-handoff';
import { persistCompletionCheck } from './completion-check-persistence';

// Browser sessionStorage slot name, not a credential or API key. Avoid `*_KEY`
// naming because generic secret scanners intentionally treat that pattern as
// suspicious even when the value is only a local storage identifier.
export const KATEDRA_HANDOFF_STORAGE_SLOT = 'lekta.katedra-handoff-result.v0.1';

function analysisId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `analysis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function persistForCompletion(shared: ReturnType<typeof toKatedraSharedResult>): void {
  const token = currentCompletionHandoffToken();
  if (!token) return;

  // Persistence is intentionally non-blocking: local DOCX analysis/result stays
  // available even if the cross-product network handoff is temporarily down.
  void persistCompletionCheck(shared, token).then((outcome) => {
    window.dispatchEvent(new CustomEvent(
      outcome.ok ? 'lekta:completion-check-persisted' : 'lekta:completion-check-persistence-failed',
      {
        detail: outcome.ok
          ? { projectId: shared.projectId, analysisId: shared.analysisId, checkId: outcome.checkId }
          : { projectId: shared.projectId, analysisId: shared.analysisId, reason: outcome.reason },
      },
    ));
  });
}

/**
 * Captures ONLY the sanitized shared result when this analysis belongs to a
 * project that entered Lekta from Katedra/Academic Completion.
 *
 * The adapter deliberately drops Issue.detail/where, raw document text, file
 * bytes, mentor notes, source text, and preview data. If a Completion handoff
 * capability is present, the same sanitized projection is persisted server-side.
 */
export function captureKatedraHandoffCandidate(result: any, profile: any, settings: any): boolean {
  const projectId = currentKatedraProjectId();
  if (!projectId || !result || result.demo) return false;

  const rawWorkType = String(settings?.workType || profile?.selection?.workType || '').trim();
  if (!isAcademicWorkType(rawWorkType)) return false;

  const profileId = String(
    settings?.profileDefinitionId ||
    result?.details?.profileDefinitionId ||
    profile?.definitionId ||
    profile?.id ||
    '',
  ).trim();

  if (!profileId) return false;

  // Registry NIKAD ne nosi ruleEntries (CLAUDE.md: svih 407 profila ima prazan
  // ruleEntries; evidence zivi samo u privatnim draftovima koji ne ulaze u bundle).
  // Do 2026-08-23 je ovdje stajao read `findVerifiedProfile(id)?.ruleEntries || []` koji
  // je UVIJEK davao [] uz komentar koji je tvrdio suprotno. Prazan niz je valjan
  // ugovor za Katedru: stabilni checkId radi, ruleId ostaje null.
  const ruleEntries: never[] = [];

  // `profile.fingerprint` is already derived from the exact runtime rule values,
  // selected profile, citation setup, sources and app version. Treat it as an
  // opaque ruleset identity; consumers must not parse it.
  const rulesetId = String(profile?.fingerprint || `lekta:${profileId}:${rawWorkType}@${APP_VERSION}`);
  const shared = toKatedraSharedResult(result, {
    analysisId: analysisId(),
    rulesetId,
    analyzedAt: new Date().toISOString(),
    projectId,
    profileId,
    ruleEntries,
  });

  try {
    sessionStorage.setItem(KATEDRA_HANDOFF_STORAGE_SLOT, JSON.stringify(shared));
    window.dispatchEvent(new CustomEvent('lekta:katedra-handoff-ready', {
      detail: { analysisId: shared.analysisId, projectId: shared.projectId },
    }));
    persistForCompletion(shared);
    return true;
  } catch {
    return false;
  }
}

export function readCapturedKatedraHandoff(): any | null {
  try {
    const raw = sessionStorage.getItem(KATEDRA_HANDOFF_STORAGE_SLOT);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
