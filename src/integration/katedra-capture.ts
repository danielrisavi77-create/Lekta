import { APP_VERSION } from '../config/app-version';
import { findVerifiedProfile } from '../profiles/profile-registry';
import { isAcademicWorkType } from './academic-suite-contracts';
import { currentKatedraProjectId } from './katedra-entry';
import { toKatedraSharedResult } from './katedra-handoff';

// Browser sessionStorage slot name, not a credential or API key. Avoid `*_KEY`
// naming because generic secret scanners intentionally treat that pattern as
// suspicious even when the value is only a local storage identifier.
export const KATEDRA_HANDOFF_STORAGE_SLOT = 'lekta.katedra-handoff-result.v0.1';

function analysisId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `analysis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Captures ONLY the sanitized shared result when this analysis belongs to a
 * project that entered Lekta from Katedra.
 *
 * The adapter deliberately drops Issue.detail/where, raw document text, file
 * bytes, mentor notes, source text, and preview data.
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

  // Analysis is started only after ensureProfileRules(), so a verified profile
  // found here already carries its authored ruleEntries. Missing entries are a
  // valid fallback: stable checkId still works and ruleId remains null.
  const ruleEntries = findVerifiedProfile(profileId)?.ruleEntries || [];

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