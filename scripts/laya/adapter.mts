/** Read-only projekcija eksplicitnog snapshot konteksta, bez povezivanja na javnu aplikaciju. */
import { CHECK_ID, DecisionContractError, assertLocalReviewAllowed, decisionCaseId, decisionInputDigest,
  deriveReadiness, validateDecisionAudit, validateDecisionCase, validateDecisionIdentity, validateModelInput } from './contracts.ts';
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

/** Cita samo vlastiti podatkovni descriptor, nikad getter ili naslijedjenu vrijednost.
 * Provjera tipa VRIJEDNOSTI ostaje u postojecem ugovoru. Proxy nije dopusten ulaz
 * pouzdanog in-process pozivatelja; ovaj adapter nije sandbox za izvrsivi JS.
 */
function ownValue<T extends object, K extends keyof T>(value: T, key: K, optional = false): T[K] {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new DecisionContractError('INVALID_SNAPSHOT');
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor && optional) return undefined as T[K];
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
    throw new DecisionContractError('INVALID_SNAPSHOT');
  }
  return descriptor.value as T[K];
}

/** Sparse batch nije prazan batch. Kopija koristi samo vlastite data-indekse.
 * Broj kljuceva odbija i ogromne sparse nizove prije petlje te vlastite map/filter
 * metode. Nad ulazom se ne pozivaju njegove metode ni iterator.
 */
function denseValues<T>(value: readonly T[], maximum = Number.MAX_SAFE_INTEGER): T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new DecisionContractError('INVALID_SNAPSHOT');
  }
  const length: number = Object.getOwnPropertyDescriptor(value, 'length')!.value;
  if (length > maximum || Reflect.ownKeys(value).length !== length + 1) {
    throw new DecisionContractError('INVALID_SNAPSHOT');
  }
  const items: T[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      throw new DecisionContractError('INVALID_SNAPSHOT');
    }
    items.push(descriptor.value as T);
  }
  return items;
}

export function buildDecisionCases(input: DecisionSnapshot): DecisionCase[] {
  const provenance = ownValue(input, 'provenance');
  assertLocalReviewAllowed(provenance);
  const documentRevisionId = ownValue(input, 'documentRevisionId');
  const engineRevision = ownValue(input, 'engineRevision');
  const profile = ownValue(input, 'profile');
  const profileId = ownValue(profile, 'id');
  const profileRevision = ownValue(profile, 'revision');
  validateDecisionIdentity({ checkId: CHECK_ID, documentRevisionId, profileId, profileRevision, paragraphIndex: 1, recordIndex: 0 });
  const result = ownValue(input, 'result');
  const records = denseValues(ownValue(input, 'records'), 1000);
  const checks = denseValues(ownValue(result, 'checks')).map(check => ({
    id: ownValue(check, 'id', true), status: ownValue(check, 'status'),
  })).filter(check => check.id === CHECK_ID);
  const rawStatus = checks.length === 1 ? checks[0].status : null;
  const engineCheckStatus: EngineStatus = checks.length === 0 ? 'missing' : checks.length > 1 ? 'ambiguous'
    : STATUSES.has(rawStatus as EngineStatus) ? rawStatus as EngineStatus : 'unknown';
  validateDecisionAudit({ engineRevision, engineCheckStatus, linkage: 'uncertain' });
  const seen = new Set<string>();
  return records.map(source => {
    const record: DecisionRecord = {
      checkId: ownValue(source, 'checkId'), linkage: ownValue(source, 'linkage'),
      paragraphIndex: ownValue(source, 'paragraphIndex'), recordIndex: ownValue(source, 'recordIndex'),
      referenceText: ownValue(source, 'referenceText'), language: ownValue(source, 'language'),
      extraction: ownValue(source, 'extraction'), rule: ownValue(source, 'rule'),
    };
    if (![null, CHECK_ID].includes(record.checkId)
      || !['explicit', 'uncertain'].includes(record.linkage)) throw new DecisionContractError('INVALID_SNAPSHOT');
    const identity = validateDecisionIdentity({ checkId: CHECK_ID, documentRevisionId, profileId, profileRevision,
      paragraphIndex: record.paragraphIndex, recordIndex: record.recordIndex });
    const caseId = decisionCaseId(identity);
    if (seen.has(caseId)) throw new DecisionContractError('DUPLICATE_IDENTITY');
    seen.add(caseId);
    const audit: DecisionAudit = validateDecisionAudit({ engineRevision, engineCheckStatus,
      linkage: record.checkId === CHECK_ID && checks.length === 1 ? record.linkage : 'uncertain' });
    const modelInput = validateModelInput({ referenceText: record.referenceText, language: record.language,
      extraction: record.extraction, rule: record.rule });
    const inputDigest = decisionInputDigest(identity, audit, modelInput);
    // Kandidat je zaseban objekt. validateDecisionCase nakon provjere odvaja i ugnijezdene objekte.
    const candidate: DecisionCase = { schemaVersion: 1, caseId, inputDigest, identity, provenance,
      audit, modelInput, readiness: deriveReadiness(audit, modelInput) };
    return validateDecisionCase(candidate);
  });
}
