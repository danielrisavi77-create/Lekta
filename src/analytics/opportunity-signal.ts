/**
 * Anonimni signal za Opportunity Report.
 *
 * Sadrzi samo brojace i interne identifikatore profila/vrste rada koji su vec dopusteni
 * u Lektinoj telemetriji. Nikad ne nosi naslov, autora, naziv datoteke, tekst nalaza,
 * isjecak rada ili komentar.
 */
export interface OpportunityAnalysisLike {
  checks?: ReadonlyArray<{ status?: unknown }> | null;
  details?: {
    profileDefinitionId?: unknown;
    triage?: {
      counts?: {
        auto?: unknown;
        assisted?: unknown;
        manual?: unknown;
        total?: unknown;
      } | null;
    } | null;
    typographyStructure?: StructureGapSource | null;
    consistencyStructure?: StructureGapSource | null;
    linkDoiStructure?: StructureGapSource | null;
    legalFootnoteStructure?: StructureGapSource | null;
    requiredSectionsStructure?: StructureGapSource | null;
  } | null;
  settings?: { workType?: unknown } | null;
}

export interface OpportunitySignal extends Record<string, unknown> {
  profileId: string;
  profileStatus: string;
  workType: string;
  auto: number;
  assisted: number;
  manual: number;
  unknown: number;
  structureGaps: number;
  total: number;
  kind: 'manual' | 'unknown' | 'structure-gap' | 'assisted' | 'auto' | 'clear';
}

interface StructureGapSource {
  skipped?: ReadonlyArray<{ reason?: unknown }> | null;
}

export type OpportunityGapKind = 'unsupported-structure' | 'stale-anchor' | 'no-target' | 'other';

export interface OpportunityGapSignal extends Record<string, unknown> {
  category?: string;
  kind: OpportunityGapKind | 'already-ok' | 'invalid-params' | 'unclassified';
  count: number;
}

const STRUCTURE_SOURCES = [
  ['typography', 'typographyStructure'],
  ['consistency', 'consistencyStructure'],
  ['link-doi', 'linkDoiStructure'],
  ['legal-footnotes', 'legalFootnoteStructure'],
  ['required-sections', 'requiredSectionsStructure'],
] as const;

function structureReasonBucket(value: unknown): OpportunityGapKind {
  const reason = typeof value === 'string' ? value.toLocaleLowerCase('hr-HR') : '';
  // Postojeci analizatori vec opisuju ovu klasu na hrvatskom i engleskom. Bucket se temelji
  // samo na malom zatvorenom vokabularu; sirovi razlog se nikad ne salje u telemetriju.
  if (
    reason.includes('unsupported')
    || reason.includes('nije podrž')
    || reason.includes('nisu podrž')
    || reason.includes('složena word struktura')
    || reason.includes('tekstualne okvire')
    || reason.includes('customxml')
  ) return 'unsupported-structure';
  if (reason.includes('stale')) return 'stale-anchor';
  if (
    reason.includes('no-target')
    || reason.includes('not-found')
    || reason.includes('missing-target')
  ) return 'no-target';
  return 'other';
}

export function structureGapSignalsForEvent(
  result: OpportunityAnalysisLike | null | undefined,
): OpportunityGapSignal[] {
  const details = result?.details as Record<string, unknown> | null | undefined;
  if (!details) return [];
  const out: OpportunityGapSignal[] = [];
  for (const [category, key] of STRUCTURE_SOURCES) {
    const source = details[key] as StructureGapSource | null | undefined;
    const skipped = Array.isArray(source?.skipped) ? source!.skipped! : [];
    const counts = new Map<OpportunityGapKind, number>();
    for (const item of skipped) {
      const kind = structureReasonBucket(item?.reason);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    for (const [kind, n] of counts) if (n > 0) out.push({ category, kind, count: n });
  }
  return out;
}

const SAFE_NOOP_REASONS = new Set([
  'already-ok', 'no-target', 'invalid-params', 'unsupported-structure', 'stale-anchor',
]);

export function repairNoOpSignals(skippedReasons: unknown): OpportunityGapSignal[] {
  if (!skippedReasons || typeof skippedReasons !== 'object' || Array.isArray(skippedReasons)) return [];
  const counts = new Map<string, number>();
  for (const value of Object.values(skippedReasons as Record<string, unknown>)) {
    const raw = typeof value === 'string' ? value : '';
    const kind = SAFE_NOOP_REASONS.has(raw) ? raw : 'unclassified';
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts].map(([kind, n]) => ({
    kind: kind as OpportunityGapSignal['kind'],
    count: n,
  }));
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function opportunitySignalForEvent(
  result: OpportunityAnalysisLike | null | undefined,
  profileStatus: string,
): OpportunitySignal {
  const triage = result?.details?.triage?.counts;
  const auto = count(triage?.auto);
  const assisted = count(triage?.assisted);
  const manual = count(triage?.manual);
  const total = count(triage?.total);
  const unknown = Array.isArray(result?.checks)
    ? result!.checks!.filter((check) => check?.status === 'unmeasurable').length
    : 0;
  const structureGaps = structureGapSignalsForEvent(result).reduce((sum, signal) => sum + signal.count, 0);

  const profileId = typeof result?.details?.profileDefinitionId === 'string'
    ? result.details.profileDefinitionId
    : '';
  const workType = typeof result?.settings?.workType === 'string'
    ? result.settings.workType
    : '';

  const kind: OpportunitySignal['kind'] =
    manual > 0 ? 'manual'
      : unknown > 0 ? 'unknown'
        : structureGaps > 0 ? 'structure-gap'
          : assisted > 0 ? 'assisted'
            : auto > 0 ? 'auto'
              : 'clear';

  return {
    profileId,
    profileStatus: profileStatus || 'generic',
    workType,
    auto,
    assisted,
    manual,
    unknown,
    structureGaps,
    total,
    kind,
  };
}
