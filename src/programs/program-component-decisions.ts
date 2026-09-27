import { NO_UNIT_REASONS, type NoUnitReason } from './unit-match-decisions';
import type { MatchProposal } from './unit-match';

export interface ProgramComponentEvidence {
  /** Kataloška sastavnica koju ovaj izvor podupire; `null` je dokaz za neriješenog izvođača. */
  unitId: string | null;
  sourceUrl: string;
  sourceLocator: string;
  quote: string;
  /** SHA-256 lokalnog snapshot-a koji sadrži navedeni citat. */
  snapshotHash: string;
}

export interface ProgramExecutorDecision {
  /** Točan naziv izvođača iz Upisnika; kod združenih studija svaki dio `$` ima vlastitu odluku. */
  executor: string;
  componentIds: string[];
  noUnitReason: NoUnitReason | null;
  evidence: ProgramComponentEvidence[];
}

export interface ProgramComponentDecision {
  /** Jedinstvena službena šifra `sifraUpisnik`. */
  programCode: string;
  executors: ProgramExecutorDecision[];
  decidedBy: string;
  decidedAt: string;
  bulk: boolean;
  note?: string;
}

export interface ProgramComponentDecisionFile {
  schemaVersion: 1;
  upisnikSnapshotHash: string;
  decisions: ProgramComponentDecision[];
}

export interface UpisnikProgramRow {
  sifraUpisnik: string;
  naziv: string;
  izvoditelj: string;
}

export interface ApprovedExecutorMatchDecision {
  executor: string;
  unitId: string | null;
  noUnitReason: NoUnitReason | null;
  decidedBy: string;
  decidedAt: string;
  bulk: boolean;
  proposed: { unitId: string | null; confidence: string | null };
  evidence?: ProgramComponentEvidence[];
}

export interface ProgramComponentOverride {
  /** Program-specifičan override za izvođača čiji zapis ne određuje sastavnicu. */
  programCode: string;
  executor: string;
  componentIds: string[];
  evidence: ProgramComponentEvidence[];
  decidedBy: string;
  decidedAt: string;
  bulk: boolean;
  note?: string;
}

export interface ProgramComponentDecisionValidationInput {
  rows: UpisnikProgramRow[];
  knownUnitIds: Set<string>;
  expectedSnapshotHash: string;
}

const SHA256 = /^[a-f0-9]{64}$/i;

function executorsFor(row: UpisnikProgramRow): string[] {
  return row.izvoditelj.split('$').map((executor) => executor.trim()).filter(Boolean);
}

/**
 * Veže službenu šifru programa na sastavnice samo preko već potpisanih exact odluka izvođača.
 * Slab prijedlog, ručni override bez zasebnog izvora ili neobrađen izvođač ostavlja program na čekanju.
 */
export function deriveProgramComponentDecisionsFromExactMatches(
  rows: UpisnikProgramRow[],
  matchDecisions: ApprovedExecutorMatchDecision[],
  upisnikSnapshotHash: string,
  overrides: ProgramComponentOverride[] = [],
): ProgramComponentDecisionFile {
  const byExecutor = new Map(matchDecisions.map((decision) => [decision.executor, decision]));
  const overridesByProgramExecutor = new Map<string, ProgramComponentOverride>();
  for (const override of overrides) {
    const key = `${override.programCode}\u0000${override.executor}`;
    if (overridesByProgramExecutor.has(key)) {
      throw new Error(`dupliciran program-specifičan override za ${override.programCode}, ${override.executor}`);
    }
    overridesByProgramExecutor.set(key, override);
  }
  const decisions: ProgramComponentDecision[] = [];

  for (const row of rows) {
    const executorDecisions: ProgramExecutorDecision[] = [];
    const approvals: Array<Pick<ApprovedExecutorMatchDecision, 'decidedBy' | 'decidedAt' | 'bulk'>> = [];
    let complete = true;

    for (const executor of executorsFor(row)) {
      const override = overridesByProgramExecutor.get(`${row.sifraUpisnik}\u0000${executor}`);
      if (override) {
        if (!override.decidedBy.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(override.decidedAt) || !override.componentIds.length) {
          complete = false;
          break;
        }
        approvals.push(override);
        executorDecisions.push({
          executor,
          componentIds: [...override.componentIds],
          noUnitReason: null,
          evidence: [...override.evidence],
        });
        continue;
      }

      const approval = byExecutor.get(executor);
      if (!approval?.decidedBy.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(approval.decidedAt)) {
        complete = false;
        break;
      }
      const requiresEvidence = approval.unitId != null &&
        (approval.proposed.confidence !== 'exact' || approval.proposed.unitId !== approval.unitId);
      if (requiresEvidence && !approval.evidence?.length) {
        complete = false;
        break;
      }
      if (approval.unitId == null && approval.noUnitReason == null) {
        complete = false;
        break;
      }

      approvals.push(approval);
      executorDecisions.push({
        executor,
        componentIds: approval.unitId == null ? [] : [approval.unitId],
        noUnitReason: approval.unitId == null ? approval.noUnitReason : null,
        evidence: [
          ...(approval.evidence ?? []),
          {
          unitId: approval.unitId,
          sourceUrl: 'https://hko.srce.hr/usp/index',
          sourceLocator: `šifra programa ${row.sifraUpisnik}`,
          quote: `Naziv: ${row.naziv}; izvođač: ${executor}.`,
          snapshotHash: upisnikSnapshotHash,
          },
        ],
      });
    }

    if (!complete || !executorDecisions.length) continue;
    const approverNames = [...new Set(approvals.map((approval) => approval.decidedBy))];
    const decidedAt = approvals.map((approval) => approval.decidedAt).sort().at(-1)!;
    decisions.push({
      programCode: row.sifraUpisnik,
      executors: executorDecisions,
      decidedBy: approverNames.join('; '),
      decidedAt,
      bulk: approvals.some((approval) => approval.bulk),
      note: 'Izvedeno iz eksplicitnih odluka za sve izvođače; slabiji prijedlog ostaje neriješen.',
    });
  }

  decisions.sort((a, b) => a.programCode.localeCompare(b.programCode, 'hr', { numeric: true }));
  return { schemaVersion: 1, upisnikSnapshotHash, decisions };
}

/** Provjerava odluke bez dopunjavanja nepoznatih podataka ili zaključivanja iz naziva. */
export function validateProgramComponentDecisions(
  file: ProgramComponentDecisionFile,
  input: ProgramComponentDecisionValidationInput,
): string[] {
  const errors: string[] = [];
  const rowsByCode = new Map<string, UpisnikProgramRow>();
  for (const row of input.rows) {
    if (rowsByCode.has(row.sifraUpisnik)) {
      errors.push(`Upisnik šifra "${row.sifraUpisnik}": duplicirana u ulaznom snapshot-u`);
    }
    rowsByCode.set(row.sifraUpisnik, row);
    if (executorsFor(row).length === 0) {
      errors.push(`Upisnik šifra "${row.sifraUpisnik}": nema izvođača`);
    }
  }

  if (file.schemaVersion !== 1) errors.push(`nepoznata schemaVersion ${String(file.schemaVersion)}`);
  if (!SHA256.test(file.upisnikSnapshotHash)) errors.push('snapshot Upisnika nema valjani SHA-256');
  if (file.upisnikSnapshotHash !== input.expectedSnapshotHash) {
    errors.push('snapshot odluka ne odgovara snapshot-u Upisnika');
  }

  const seenPrograms = new Set<string>();
  for (const decision of file.decisions) {
    const at = `program Upisnika "${decision.programCode}"`;
    if (seenPrograms.has(decision.programCode)) errors.push(`${at}: odluka duplicirana`);
    seenPrograms.add(decision.programCode);

    const row = rowsByCode.get(decision.programCode);
    if (!row) {
      errors.push(`${at}: šifra ne postoji u Upisniku`);
      continue;
    }
    if (!decision.decidedBy?.trim()) errors.push(`${at}: nema potpis (decidedBy)`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(decision.decidedAt)) errors.push(`${at}: decidedAt nije datum YYYY-MM-DD`);

    const expectedExecutors = new Set(executorsFor(row));
    const seenExecutors = new Set<string>();
    for (const executorDecision of decision.executors) {
      const executorAt = `${at}, izvođač "${executorDecision.executor}"`;
      if (seenExecutors.has(executorDecision.executor)) errors.push(`${executorAt}: odluka duplicirana`);
      seenExecutors.add(executorDecision.executor);
      if (!expectedExecutors.has(executorDecision.executor)) errors.push(`${executorAt}: izvođač nije u Upisniku`);

      const componentIds = new Set(executorDecision.componentIds);
      if (componentIds.size !== executorDecision.componentIds.length) errors.push(`${executorAt}: sastavnica duplicirana`);
      for (const unitId of componentIds) {
        if (!input.knownUnitIds.has(unitId)) errors.push(`${executorAt}: sastavnica "${unitId}" ne postoji u katalogu`);
      }

      if (componentIds.size === 0 && executorDecision.noUnitReason == null) {
        errors.push(`${executorAt}: bez sastavnice i bez razloga`);
      }
      if (componentIds.size > 0 && executorDecision.noUnitReason != null) {
        errors.push(`${executorAt}: ima sastavnicu i razlog da je nema`);
      }
      if (executorDecision.noUnitReason != null && !NO_UNIT_REASONS.includes(executorDecision.noUnitReason)) {
        errors.push(`${executorAt}: nepoznat razlog "${executorDecision.noUnitReason}"`);
      }

      if (!executorDecision.evidence.length) errors.push(`${executorAt}: nema službenog izvora`);
      const evidencedUnits = new Set<string>();
      for (const source of executorDecision.evidence) {
        if (!/^https:\/\//i.test(source.sourceUrl)) errors.push(`${executorAt}: izvor mora koristiti HTTPS`);
        if (!source.sourceLocator.trim()) errors.push(`${executorAt}: izvor nema lokator`);
        if (!source.quote.trim()) errors.push(`${executorAt}: izvor nema citat`);
        if (!SHA256.test(source.snapshotHash)) errors.push(`${executorAt}: snapshot izvora nema valjani SHA-256`);
        if (source.unitId != null) {
          if (!componentIds.has(source.unitId)) errors.push(`${executorAt}: dokaz za nepovezanu sastavnicu "${source.unitId}"`);
          evidencedUnits.add(source.unitId);
        }
      }
      for (const unitId of componentIds) {
        if (!evidencedUnits.has(unitId)) errors.push(`${executorAt}: nema dokaz za sastavnicu "${unitId}"`);
      }
      if (componentIds.size === 0 && !executorDecision.evidence.some((source) => source.unitId == null)) {
        errors.push(`${executorAt}: neriješeni izvođač mora imati izvor s unitId=null`);
      }
    }
    for (const executor of expectedExecutors) {
      if (!seenExecutors.has(executor)) errors.push(`${at}: nedostaje odluka za izvođača "${executor}"`);
    }
  }

  return errors;
}

export interface ProgramComponentCoverage {
  total: number;
  fullyMapped: number;
  partiallyMapped: number;
  unresolved: number;
  pending: number;
  fullyMappedProgramCodes: string[];
  partiallyMappedProgramCodes: string[];
  unresolvedProgramCodes: string[];
  pendingProgramCodes: string[];
}

export type ProgramComponentBlockerStatus =
  | 'exact-awaiting-approval'
  | 'strong-awaiting-approval'
  | 'weak-awaiting-approval'
  | 'no-proposal'
  | 'manual-override-needs-program-evidence'
  | 'whole-institution-needs-research'
  | 'unit-not-in-catalog'
  | 'ambiguous-unit';

export interface ProgramComponentBlocker {
  programCode: string;
  programName: string;
  executor: string;
  status: ProgramComponentBlockerStatus;
  proposedUnitId: string | null;
  alternatives: string[];
  reason: string;
}

export interface ProgramComponentBlockerReport {
  summary: {
    programCount: number;
    programsWithBlockers: number;
    blockerCount: number;
    exactAwaitingApproval: number;
    strongAwaitingApproval: number;
    weakAwaitingApproval: number;
    noProposal: number;
    manualOverrideNeedsProgramEvidence: number;
    wholeInstitutionNeedsResearch: number;
    unitNotInCatalog: number;
    ambiguousUnit: number;
    outsideScopeExecutorCount: number;
  };
  blockers: ProgramComponentBlocker[];
  outsideScope: Array<{ programCode: string; programName: string; executor: string }>;
}

/** Imenuje svaku neriješenu vezu po službenoj šifri umjesto da sažme neizvjesnost u jednu brojku. */
export function buildProgramComponentBlockerReport(
  rows: UpisnikProgramRow[],
  proposals: MatchProposal[],
  matchDecisions: ApprovedExecutorMatchDecision[],
  programDecisions: ProgramComponentDecisionFile,
): ProgramComponentBlockerReport {
  const proposalsByExecutor = new Map(proposals.map((proposal) => [proposal.executor, proposal]));
  const decisionsByExecutor = new Map(matchDecisions.map((decision) => [decision.executor, decision]));
  const programDecisionsByCode = new Map(programDecisions.decisions.map((decision) => [decision.programCode, decision]));
  const blockers: ProgramComponentBlocker[] = [];
  const outsideScope: ProgramComponentBlockerReport['outsideScope'] = [];

  for (const row of rows) {
    const programDecision = programDecisionsByCode.get(row.sifraUpisnik);
    for (const executor of executorsFor(row)) {
      const linked = programDecision?.executors.find((item) => item.executor === executor);
      if (linked?.componentIds.length) continue;

      const approved = decisionsByExecutor.get(executor);
      if (approved?.unitId != null && approved.proposed.confidence === 'exact' && approved.proposed.unitId === approved.unitId) {
        continue;
      }
      if (approved?.unitId == null && approved?.noUnitReason === 'foreign-institution') {
        outsideScope.push({ programCode: row.sifraUpisnik, programName: row.naziv, executor });
        continue;
      }

      const proposal = proposalsByExecutor.get(executor);
      let status: ProgramComponentBlockerStatus;
      let reason: string;
      if (approved?.unitId != null) {
        status = 'manual-override-needs-program-evidence';
        reason = `odobrena sastavnica ${approved.unitId} odstupa od spremljenog prijedloga; treba dokaz za ovaj program`;
      } else if (approved?.noUnitReason === 'whole-institution') {
        status = 'whole-institution-needs-research';
        reason = 'Upisnik navodi cijelo sveučilište; treba službeni izvor koji određuje sastavnicu programa';
      } else if (approved?.noUnitReason === 'unit-not-in-catalog') {
        status = 'unit-not-in-catalog';
        reason = 'izvođač nije pronađen u katalogu sastavnica';
      } else if (approved?.noUnitReason === 'ambiguous') {
        status = 'ambiguous-unit';
        reason = 'zabilježena odluka potvrđuje da je sastavnica dvosmislena';
      } else if (!proposal?.match) {
        status = 'no-proposal';
        reason = 'nema kandidata u katalogu; potrebna je ručna provjera službenog izvora';
      } else {
        status = `${proposal.match.confidence}-awaiting-approval`;
        reason = proposal.match.reason;
      }

      blockers.push({
        programCode: row.sifraUpisnik,
        programName: row.naziv,
        executor,
        status,
        proposedUnitId: proposal?.match?.unitId ?? approved?.proposed.unitId ?? null,
        alternatives: proposal?.alternatives ?? [],
        reason,
      });
    }
  }

  blockers.sort((a, b) => a.programCode.localeCompare(b.programCode, 'hr', { numeric: true }) || a.executor.localeCompare(b.executor, 'hr'));
  outsideScope.sort((a, b) => a.programCode.localeCompare(b.programCode, 'hr', { numeric: true }) || a.executor.localeCompare(b.executor, 'hr'));
  const count = (status: ProgramComponentBlockerStatus): number => blockers.filter((item) => item.status === status).length;
  return {
    summary: {
      programCount: rows.length,
      programsWithBlockers: new Set(blockers.map((item) => item.programCode)).size,
      blockerCount: blockers.length,
      exactAwaitingApproval: count('exact-awaiting-approval'),
      strongAwaitingApproval: count('strong-awaiting-approval'),
      weakAwaitingApproval: count('weak-awaiting-approval'),
      noProposal: count('no-proposal'),
      manualOverrideNeedsProgramEvidence: count('manual-override-needs-program-evidence'),
      wholeInstitutionNeedsResearch: count('whole-institution-needs-research'),
      unitNotInCatalog: count('unit-not-in-catalog'),
      ambiguousUnit: count('ambiguous-unit'),
      outsideScopeExecutorCount: outsideScope.length,
    },
    blockers,
    outsideScope,
  };
}

/** Izvještava o svim izvođačima svakog službenog programa, ne samo o postojećim odlukama. */
export function summarizeProgramComponentCoverage(
  rows: UpisnikProgramRow[],
  file: ProgramComponentDecisionFile,
): ProgramComponentCoverage {
  const byCode = new Map(file.decisions.map((decision) => [decision.programCode, decision]));
  const fullyMappedProgramCodes: string[] = [];
  const partiallyMappedProgramCodes: string[] = [];
  const unresolvedProgramCodes: string[] = [];
  const pendingProgramCodes: string[] = [];

  for (const row of rows) {
    const expectedExecutors = executorsFor(row);
    const decision = byCode.get(row.sifraUpisnik);
    if (expectedExecutors.length === 0 || !decision || expectedExecutors.some((executor) =>
      !decision.executors.some((item) => item.executor === executor && (item.componentIds.length > 0 || item.noUnitReason != null)))) {
      pendingProgramCodes.push(row.sifraUpisnik);
      continue;
    }

    const mappedCount = expectedExecutors.filter((executor) =>
      decision.executors.some((item) => item.executor === executor && item.componentIds.length > 0)).length;
    if (mappedCount === expectedExecutors.length) fullyMappedProgramCodes.push(row.sifraUpisnik);
    else if (mappedCount > 0) partiallyMappedProgramCodes.push(row.sifraUpisnik);
    else unresolvedProgramCodes.push(row.sifraUpisnik);
  }

  const sortCodes = (codes: string[]): string[] => codes.sort((a, b) => a.localeCompare(b, 'hr', { numeric: true }));
  sortCodes(fullyMappedProgramCodes);
  sortCodes(partiallyMappedProgramCodes);
  sortCodes(unresolvedProgramCodes);
  sortCodes(pendingProgramCodes);
  return {
    total: rows.length,
    fullyMapped: fullyMappedProgramCodes.length,
    partiallyMapped: partiallyMappedProgramCodes.length,
    unresolved: unresolvedProgramCodes.length,
    pending: pendingProgramCodes.length,
    fullyMappedProgramCodes,
    partiallyMappedProgramCodes,
    unresolvedProgramCodes,
    pendingProgramCodes,
  };
}
