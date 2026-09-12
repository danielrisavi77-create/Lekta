/**
 * POHRANJENA REVIZIJA: tip i sanitizacija (T12), BEZ UVOZA. `local-document-session.ts` zivi u pocetnom grafu rute
 * `/` (intake), koji po gardu `intake-entry-boundary` ne smije vuci analizator, profile ni otisak; zato ovdje nema
 * `stableCheckId` ni `computeFingerprint`. Gradnja snimke iz rezultata je u `src/history/revision-snapshot.ts` (ruta `/rad/`); ovaj modul je u `session/` jer gard odbija i samu rijec `history` u stazi.
 */
export type RevisionOutcome = 'pass' | 'fail' | 'unmeasurable';

export interface RevisionFinding {
  ruleId: string;
  scopeKey: string | null;
  outcome: RevisionOutcome;
}

export interface RevisionSnapshot {
  id: string;
  documentGroupId: string;
  profileId: string;
  rulesFingerprint: string;
  analysisContractVersion: string;
  findings: RevisionFinding[];
}

/** Isti oblik kao `DocumentFingerprint` u `src/fingerprint/fingerprint.ts`; ponovljen da se otisak ne uvozi u `/`. */
export interface StoredFingerprint {
  titleNorm: string;
  authorNorm: string;
  headings: string[];
  sectionCount: number;
}

export interface StoredRevision {
  schemaVersion: 1;
  createdAt: number;
  fingerprint: StoredFingerprint;
  snapshot: RevisionSnapshot;
  /** Naslovi provjera po `ruleId`, za citljiv prikaz razlike; naslovi provjera su nasi, ne autorovi. */
  checkTitles: Record<string, string>;
}

const OUTCOMES = new Set(['pass', 'fail', 'unmeasurable']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeSnapshot(value: unknown): RevisionSnapshot | null {
  if (!isRecord(value)) return null;
  const strings = ['id', 'documentGroupId', 'profileId', 'rulesFingerprint', 'analysisContractVersion'] as const;
  for (const k of strings) if (typeof value[k] !== 'string') return null;
  if (!Array.isArray(value.findings)) return null;
  const findings: RevisionFinding[] = [];
  for (const f of value.findings) {
    if (!isRecord(f) || typeof f.ruleId !== 'string' || !OUTCOMES.has(String(f.outcome))) return null;
    if (!(f.scopeKey === null || typeof f.scopeKey === 'string')) return null;
    findings.push({ ruleId: f.ruleId, scopeKey: f.scopeKey as string | null, outcome: f.outcome as RevisionOutcome });
  }
  return {
    id: value.id as string,
    documentGroupId: value.documentGroupId as string,
    profileId: value.profileId as string,
    rulesFingerprint: value.rulesFingerprint as string,
    analysisContractVersion: value.analysisContractVersion as string,
    findings,
  };
}

function sanitizeFingerprint(value: unknown): StoredFingerprint | null {
  if (!isRecord(value)) return null;
  if (typeof value.titleNorm !== 'string' || typeof value.authorNorm !== 'string') return null;
  if (!Array.isArray(value.headings) || !value.headings.every((h) => typeof h === 'string')) return null;
  if (typeof value.sectionCount !== 'number') return null;
  return { titleNorm: value.titleNorm, authorNorm: value.authorNorm, headings: [...(value.headings as string[])], sectionCount: value.sectionCount };
}

/** Zapis iz pohrane bez sheme: sve sto ne prodje vraca `null`, nikad djelomican objekt. */
export function sanitizeStoredRevision(value: unknown): StoredRevision | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) return null;
  const fingerprint = sanitizeFingerprint(value.fingerprint);
  const snapshot = sanitizeSnapshot(value.snapshot);
  if (!fingerprint || !snapshot) return null;
  const checkTitles: Record<string, string> = {};
  if (isRecord(value.checkTitles)) {
    for (const [k, v] of Object.entries(value.checkTitles)) if (typeof v === 'string') checkTitles[k] = v;
  }
  return { schemaVersion: 1, createdAt: value.createdAt, fingerprint, snapshot, checkTitles };
}
