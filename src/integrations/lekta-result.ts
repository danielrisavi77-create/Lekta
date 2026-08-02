/**
 * LektaResult v1 (Milestone 1, Task 2 iz MASTER-PLAN.md "Katedra x Lekta ekosustav").
 * Jednosmjeran, informativan izvoz JEDNOG rezultata analize prema Katedri: profileId,
 * projectId (Katedra Project Manifest ID, neprozirno proslijeden), score, rulesetVersion
 * (hash stvarno primijenjenih pravila) i po nalazu issueId + severity + category + fixable
 * + kratak label. NIKAD ijedan znak iz samog dokumenta (PRODUCT_CONSTITUTION.md #6).
 *
 * issueId dolazi izravno iz FindingViewModel.id (buildFindingViewModels u
 * src/ui/finding-view-model.ts): vec je oblika `finding:{category-slug}:{title-slug}`
 * s deduplikacijskim sufiksom za istoimene nalaze u istom rezultatu. Naslovi nalaza
 * (issue.title) su u analizatoru vec stabilni, fiksni stringovi (dinamicki brojevi/
 * detalji idu u issue.detail, ne u title), pa je ovo dovoljno stabilan identitet za
 * Task 3 (CTA handoff) i buducu Fazu F (re-check korelacija po projectId+issueId).
 */
import { buildFindingViewModels, type FindingResultInput, type FindingSessionState } from '../ui/finding-view-model';

export interface LektaResultIssue {
  issueId: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  fixable: boolean;
  label: string;
}

export interface LektaResult {
  v: 1;
  projectId: string | null;
  profileId: string | null;
  rulesetVersion: string | null;
  score: number | null;
  checkedAt: string;
  issues: LektaResultIssue[];
}

export interface LektaResultSourceResult extends FindingResultInput {
  score?: number | null;
  generatedAt?: string;
}

export interface LektaResultContext {
  projectId: string | null;
  profileId: string | null;
}

/** Cista funkcija: iz vec postojeceg rezultata analize gradi LektaResult v1. Ne mijenja
 * engine niti javni rezultat analize (isti ugovor kao buildFindingViewModels). `states`
 * je ISTA sesijska mapa (app.ts findingStates) koju koristi ziva triage-view: bez nje bi
 * korisnikovo rucno zanemarivanje nalaza bilo nevidljivo Katedri (uvijek default 'open'). */
export function buildLektaResult(
  result: LektaResultSourceResult,
  context: LektaResultContext,
  states: ReadonlyMap<string, FindingSessionState> = new Map(),
): LektaResult {
  const issues = buildFindingViewModels(result, states)
    .filter((finding) => finding.kind === 'document' && finding.status !== 'ignored')
    .map((finding) => ({
      issueId: finding.id,
      severity: finding.severity,
      category: finding.category,
      fixable: finding.fixability !== 'manual',
      label: finding.title,
    }));

  return {
    v: 1,
    projectId: context.projectId,
    profileId: context.profileId,
    rulesetVersion: result.details?.profileFingerprint ?? null,
    score: result.score ?? null,
    checkedAt: result.generatedAt ?? new Date().toISOString(),
    issues,
  };
}
