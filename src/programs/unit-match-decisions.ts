/**
 * Ljudske odluke o uparivanju sastavnica Upisnika s nasim jedinicama (P1-6 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * `docs/generated/upisnik-unit-match.json` je PRIJEDLOG stroja i regenerira se; ovaj sloj je
 * ODLUKA covjeka i regeneracija ga NE SMIJE pregaziti. Zato odluke zive u `data/` (autorski
 * sloj), a ne u `docs/generated/`.
 *
 * Pouka iz P2-1 ugradjena unaprijed: masovno odobrenje ostaje VIDLJIVO kao masovno
 * (`bulk: true`). Verifikacijski worklist je zatekao 38 pravila koja su izgledala potvrdjeno, a
 * bila su odobrena skupno; ako se ta razlika ne zapise u trenutku odluke, kasnije se vise ne moze
 * rekonstruirati.
 */

/**
 * Zasto izvoditelj NEMA nasu jedinicu. Zatvoren skup: slobodan tekst bi dopustio da "nismo
 * stigli" izgleda kao odluka.
 */
export type NoUnitReason =
  | 'foreign-institution'
  | 'whole-institution'
  | 'unit-not-in-catalog'
  | 'ambiguous';

export const NO_UNIT_REASONS: readonly NoUnitReason[] = [
  'foreign-institution',
  'whole-institution',
  'unit-not-in-catalog',
  'ambiguous',
];

export interface UnitMatchDecision {
  /** Doslovan naziv izvoditelja iz Upisnika; kljuc odluke. */
  executor: string;
  /** Nasa jedinica, ili `null` uz obavezan `noUnitReason`. */
  unitId: string | null;
  noUnitReason: NoUnitReason | null;
  decidedBy: string;
  decidedAt: string;
  /** `true` kad je odluka donesena skupno (npr. "prihvati sve exact"), a ne pojedinacno. */
  bulk: boolean;
  /** Sto je stroj predlagao u trenutku odluke; cuva se da se kasnije vidi je li covjek mijenjao. */
  proposed: { unitId: string | null; confidence: string | null };
  note?: string;
}

export interface DecisionFile {
  schemaVersion: number;
  decisions: UnitMatchDecision[];
}

export interface DecisionValidationInput {
  knownUnitIds: Set<string>;
  knownExecutors: Set<string>;
}

/** Strukturne greske; prazno polje znaci ispravan skup odluka. */
export function validateDecisions(file: DecisionFile, input: DecisionValidationInput): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const decision of file.decisions) {
    const at = `odluka za "${decision.executor}"`;
    if (seen.has(decision.executor)) errors.push(`${at}: duplicirana`);
    seen.add(decision.executor);

    if (!input.knownExecutors.has(decision.executor)) {
      errors.push(`${at}: izvoditelj ne postoji u harvestu (preimenovan u Upisniku?)`);
    }
    if (decision.unitId != null && !input.knownUnitIds.has(decision.unitId)) {
      errors.push(`${at}: jedinica "${decision.unitId}" ne postoji u katalogu`);
    }
    if (decision.unitId == null && decision.noUnitReason == null) {
      errors.push(`${at}: bez jedinice, a bez razloga`);
    }
    if (decision.unitId != null && decision.noUnitReason != null) {
      errors.push(`${at}: ima jedinicu i razlog zasto je nema`);
    }
    if (decision.noUnitReason != null && !NO_UNIT_REASONS.includes(decision.noUnitReason)) {
      errors.push(`${at}: nepoznat razlog "${decision.noUnitReason}"`);
    }
    if (!decision.decidedBy?.trim()) errors.push(`${at}: nema potpis (decidedBy)`);
  }

  return errors;
}

export interface DecisionCoverage {
  total: number;
  decided: number;
  pending: number;
  bulkDecided: number;
  /** Odluke u kojima je covjek ODSTUPIO od prijedloga stroja; najzanimljivije za pregled. */
  overrides: number;
  pendingExecutors: string[];
}

/** Koliko je prijedloga odluceno, koliko ceka, i gdje je covjek odstupio od stroja. */
export function decisionCoverage(
  proposals: Array<{ executor: string; match: { unitId: string } | null }>,
  file: DecisionFile,
): DecisionCoverage {
  const byExecutor = new Map(file.decisions.map((d) => [d.executor, d]));
  const pendingExecutors: string[] = [];
  let overrides = 0;

  for (const proposal of proposals) {
    const decision = byExecutor.get(proposal.executor);
    if (!decision) {
      pendingExecutors.push(proposal.executor);
      continue;
    }
    if (decision.unitId !== (proposal.match?.unitId ?? null)) overrides += 1;
  }

  return {
    total: proposals.length,
    decided: proposals.length - pendingExecutors.length,
    pending: pendingExecutors.length,
    bulkDecided: file.decisions.filter((d) => d.bulk).length,
    overrides,
    pendingExecutors: pendingExecutors.sort(),
  };
}

/** Upisuje odluku, zamjenjujuci raniju za istog izvoditelja (odluka se smije promijeniti). */
export function upsertDecision(file: DecisionFile, decision: UnitMatchDecision): DecisionFile {
  const decisions = file.decisions.filter((d) => d.executor !== decision.executor);
  decisions.push(decision);
  decisions.sort((a, b) => a.executor.localeCompare(b.executor, 'hr'));
  return { ...file, decisions };
}
