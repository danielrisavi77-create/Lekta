import type { ThesisProfile, SourceEntry } from '../profiles/profile-schema';
import {
  auditAiEvidence,
  type AiEvidenceAuditResult,
  type AiEvidenceExecutionManifest,
} from './ai-evidence-audit';
import { ruleEvidenceKey } from './worklist';

export interface AiEvidenceSnapshot {
  bytes: Uint8Array;
  text: string;
  sha256?: string;
}

export interface AiEvidenceManifestFile {
  profileId: string;
  manifests: unknown[];
}

export interface AiEvidenceContextInput {
  snapshotsBySourceId: Readonly<Record<string, AiEvidenceSnapshot>>;
  manifestFilesByProfileId: Readonly<Record<string, AiEvidenceManifestFile | undefined>>;
  currentRepairSourceHash?: string;
  currentAnalysisSourceHash?: string;
  ruleValueHashesByRule?: Readonly<Record<string, string>>;
}

export interface ResolvedAiEvidenceContext {
  gateContext: {
    snapshotBytesBySourceId: Readonly<Record<string, Uint8Array>>;
    snapshotTextsBySourceId: Readonly<Record<string, string>>;
    snapshotHashesBySourceId: Readonly<Record<string, string>>;
    currentRepairSourceHash?: string;
    currentAnalysisSourceHash?: string;
    ruleValueHashesByRule: Readonly<Record<string, string>>;
    manifestsById: Readonly<Record<string, AiEvidenceExecutionManifest>>;
  };
  resultsByRule: Readonly<Record<string, AiEvidenceAuditResult>>;
}

function isManifest(value: unknown): value is AiEvidenceExecutionManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const manifest = value as Record<string, unknown>;
  return [
    manifest.manifestId,
    manifest.profileId,
    manifest.ruleId,
    manifest.testId,
    manifest.command,
    manifest.inputHash,
    manifest.outputHash,
    manifest.ruleValueHash,
    manifest.ranAt,
  ].every((field) => typeof field === 'string')
    && (manifest.kind == null || manifest.kind === 'repair' || manifest.kind === 'detector')
    && (manifest.kind === 'detector'
      ? [manifest.analysisSourceHash, manifest.ruleCheckId, manifest.checkId,
        manifest.violatingOutputHash, manifest.correctInputHash].every((field) => typeof field === 'string')
      : typeof manifest.repairSourceHash === 'string')
    && ['pass', 'fail', 'skipped'].includes(String(manifest.outcome));
}

/**
 * Veže privatne snapshotove i manifeste učitane iz pouzdanog adaptera uz svako AI-potvrđeno
 * pravilo. Datoteka manifesta prihvaća se samo pod vlastitim profileId-jem; dupli manifestId
 * uklanja se umjesto da redoslijed učitavanja odlučuje koji dokaz pobjeđuje.
 */
export function resolveAiEvidenceContext(
  profiles: readonly ThesisProfile[],
  sources: readonly SourceEntry[],
  input: AiEvidenceContextInput,
): ResolvedAiEvidenceContext {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const candidatesById = new Map<string, AiEvidenceExecutionManifest[]>();

  for (const profile of profiles) {
    const manifestFile = input.manifestFilesByProfileId[profile.id];
    if (!manifestFile || manifestFile.profileId !== profile.id || !Array.isArray(manifestFile.manifests)) continue;
    for (const value of manifestFile.manifests) {
      if (!isManifest(value)) continue;
      const candidates = candidatesById.get(value.manifestId) ?? [];
      candidates.push(value);
      candidatesById.set(value.manifestId, candidates);
    }
  }

  const manifestsById: Record<string, AiEvidenceExecutionManifest> = {};
  for (const [manifestId, candidates] of candidatesById) {
    if (candidates.length === 1) manifestsById[manifestId] = candidates[0];
  }

  const snapshotBytesBySourceId: Record<string, Uint8Array> = {};
  const snapshotTextsBySourceId: Record<string, string> = {};
  const snapshotHashesBySourceId: Record<string, string> = {};
  for (const [sourceId, snapshot] of Object.entries(input.snapshotsBySourceId)) {
    snapshotBytesBySourceId[sourceId] = snapshot.bytes;
    snapshotTextsBySourceId[sourceId] = snapshot.text;
    if (snapshot.sha256) snapshotHashesBySourceId[sourceId] = snapshot.sha256;
  }

  const resultsByRule: Record<string, AiEvidenceAuditResult> = {};
  for (const profile of profiles) {
    for (const entry of profile.ruleEntries ?? []) {
      if (entry.confirmedVia !== 'ai-evidence-audit') continue;
      const sourceId = entry.sourceId ?? '';
      const snapshot = input.snapshotsBySourceId[sourceId];
      const execution = (entry.aiEvidence as { execution?: { manifestId?: unknown } } | null | undefined)?.execution;
      const manifestId = typeof execution?.manifestId === 'string' ? execution.manifestId : '';
      resultsByRule[ruleEvidenceKey(profile.id, entry.ruleId)] = auditAiEvidence({
        profileId: profile.id,
        rule: entry,
        source: sourceById.get(sourceId),
        snapshotBytes: snapshot?.bytes ?? new Uint8Array(),
        snapshotSha256: snapshot?.sha256,
        currentRepairSourceHash: input.currentRepairSourceHash,
        currentAnalysisSourceHash: input.currentAnalysisSourceHash,
        ruleValueSha256: input.ruleValueHashesByRule?.[ruleEvidenceKey(profile.id, entry.ruleId)],
        snapshotText: snapshot?.text ?? '',
        evidence: entry.aiEvidence ?? undefined,
        manifest: manifestId ? manifestsById[manifestId] : undefined,
      });
    }
  }

  return {
    gateContext: { snapshotBytesBySourceId, snapshotTextsBySourceId, snapshotHashesBySourceId,
      currentRepairSourceHash: input.currentRepairSourceHash, currentAnalysisSourceHash: input.currentAnalysisSourceHash,
      ruleValueHashesByRule: input.ruleValueHashesByRule ?? {}, manifestsById },
    resultsByRule,
  };
}
