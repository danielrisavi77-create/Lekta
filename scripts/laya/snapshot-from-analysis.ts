/**
 * Iz stvarnog rezultata `analyzeDocx` gradi CandidateSnapshot za Layu (V2.1).
 *
 * Cita SAMO:
 *  - `checks[].id` i `checks[].status`;
 *  - `details.incompleteReferences[]`: puni tekst zapisa (`text`) i prvi odlomak (`p`), jer upravo
 *    ti zapisi hrane `reference.completeness` (analyze-docx: `incomplete`), pa je veza eksplicitna;
 *  - `details.references[]`: samo `p`, da recordIndex bude stabilan polozaj zapisa u popisu.
 *
 * Score, issues, triage, recipe, typoLint i ostalo se ne cita. Metapodatke identiteta
 * (revizija dokumenta, profila i enginea) i provenance zadaje pozivatelj; adapter ih ne izmislja.
 */
import type { CandidateRecord, CandidateSnapshot } from './candidate-builder.ts';
import type { LayaProvenance } from './contracts-v2.ts';

export interface AnalysisSnapshotMeta {
  documentRevisionId: string;
  profile: { id: string; revision: string };
  engineRevision: string;
  provenance: LayaProvenance;
  /** Jezik popisa literature; 'unsupported' preskace sve zapise. */
  language: CandidateRecord['language'];
}

interface AnalysisLike {
  checks?: unknown;
  details?: { incompleteReferences?: unknown; references?: unknown } | null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Stabilna kopija: builder dobiva samo obicne objekte bez gettera iz rezultata analize. */
export function snapshotFromAnalysis(result: AnalysisLike, meta: AnalysisSnapshotMeta): CandidateSnapshot {
  const checks = Array.isArray(result.checks)
    ? (result.checks as unknown[]).filter(isObject).map((c) => ({ id: typeof c.id === 'string' ? c.id : null, status: String(c.status) }))
    : [];
  const details = isObject(result.details) ? result.details : {};
  const all = Array.isArray(details.references) ? (details.references as unknown[]).filter(isObject) : [];
  const incomplete = Array.isArray(details.incompleteReferences) ? (details.incompleteReferences as unknown[]).filter(isObject) : [];

  const records: CandidateRecord[] = [];
  const used = new Set<string>();
  for (const r of incomplete) {
    const p = r.p;
    const text = r.text;
    if (typeof text !== 'string' || typeof p !== 'number' || !Number.isInteger(p) || p < 1) continue;
    const recordIndex = all.findIndex((x) => x.p === p);
    // Bez pouzdanog polozaja u popisu veza nije eksplicitna; builder takav zapis preskace.
    const found = recordIndex >= 0 && !used.has(`${p}|${recordIndex}`);
    const index = found ? recordIndex : all.length + records.length;
    used.add(`${p}|${index}`);
    records.push({
      checkId: 'reference.completeness', linkage: found ? 'explicit' : 'uncertain',
      paragraphIndex: p, recordIndex: index, text, language: meta.language, ruleEvidence: null,
    });
  }
  return {
    documentRevisionId: meta.documentRevisionId,
    profile: { id: meta.profile.id, revision: meta.profile.revision },
    engineRevision: meta.engineRevision,
    provenance: { ...meta.provenance },
    result: { checks },
    records,
  };
}
