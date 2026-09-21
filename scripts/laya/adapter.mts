/** Read-only projekcija eksplicitnog snapshot konteksta, bez povezivanja na javnu aplikaciju. */
import { CHECK_ID, DecisionContractError, assertLocalReviewAllowed, decisionCaseId,
  deriveReadiness, validateDecisionCase, validateModelInput } from './contracts.ts';
import type { DataPolicy, DecisionCase, EngineStatus, ModelInput, DecisionAudit } from './contracts.ts';

export interface DecisionRecord extends ModelInput {
  checkId: typeof CHECK_ID | null;
  linkage: 'explicit' | 'uncertain';
  paragraphIndex: number;
  recordIndex: number;
}
export interface DecisionSnapshot {
  readonly documentRevisionId: string;
  readonly profile: Readonly<{ id: string; revision: string }>;
  readonly engineRevision: string;
  readonly provenance: Readonly<DataPolicy>;
  /** Ostatak kanonskog rezultata (score, issues, triage, recipe) se uopce ne cita. */
  readonly result: { readonly checks: readonly Readonly<{ id?: string | null; status: string }>[] };
  readonly records: readonly Readonly<DecisionRecord>[];
}
const STATUSES = new Set<EngineStatus>(['pass', 'warn', 'fail', 'informational', 'unmeasurable']);

export function buildDecisionCases(input: DecisionSnapshot): DecisionCase[] {
  assertLocalReviewAllowed(input?.provenance);
  if (!Array.isArray(input.records) || input.records.length > 1000 || !Array.isArray(input.result?.checks)) {
    throw new DecisionContractError('INVALID_SNAPSHOT');
  }
  const checks = input.result.checks.filter(check => check?.id === CHECK_ID);
  const rawStatus = checks.length === 1 ? checks[0].status : null;
  const engineCheckStatus: EngineStatus = checks.length === 0 ? 'missing' : checks.length > 1 ? 'ambiguous'
    : STATUSES.has(rawStatus as EngineStatus) ? rawStatus as EngineStatus : 'unknown';
  const seen = new Set<string>();
  return input.records.map(record => {
    if (!record || ![null, CHECK_ID].includes(record.checkId)
      || !['explicit', 'uncertain'].includes(record.linkage)) throw new DecisionContractError('INVALID_SNAPSHOT');
    const identity = { checkId: CHECK_ID, documentRevisionId: input.documentRevisionId,
      profileId: input.profile?.id, profileRevision: input.profile?.revision,
      paragraphIndex: record.paragraphIndex, recordIndex: record.recordIndex };
    const caseId = decisionCaseId(identity);
    if (seen.has(caseId)) throw new DecisionContractError('DUPLICATE_IDENTITY');
    seen.add(caseId);
    const audit: DecisionAudit = { engineRevision: input.engineRevision, engineCheckStatus,
      linkage: record.checkId === CHECK_ID && checks.length === 1 ? record.linkage : 'uncertain' };
    const modelInput = validateModelInput({ referenceText: record.referenceText, language: record.language,
      extraction: record.extraction, rule: record.rule });
    // Kandidat je zaseban objekt. validateDecisionCase nakon provjere odvaja i ugnijezdene objekte.
    const candidate: DecisionCase = { schemaVersion: 1, caseId, identity, provenance: input.provenance,
      audit, modelInput, readiness: deriveReadiness(audit, modelInput) };
    return validateDecisionCase(candidate);
  });
}
