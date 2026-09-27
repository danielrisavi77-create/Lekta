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
  } | null;
  settings?: { workType?: unknown } | null;
}

export interface OpportunitySignal {
  profileId: string;
  profileStatus: string;
  workType: string;
  auto: number;
  assisted: number;
  manual: number;
  unknown: number;
  total: number;
  kind: 'manual' | 'unknown' | 'assisted' | 'auto' | 'clear';
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

  const profileId = typeof result?.details?.profileDefinitionId === 'string'
    ? result.details.profileDefinitionId
    : '';
  const workType = typeof result?.settings?.workType === 'string'
    ? result.settings.workType
    : '';

  const kind: OpportunitySignal['kind'] =
    manual > 0 ? 'manual'
      : unknown > 0 ? 'unknown'
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
    total,
    kind,
  };
}
