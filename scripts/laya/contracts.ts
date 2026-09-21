/** Interni savjetodavni ugovor. Bez mreze, modela, zapisa datoteka i repair ovlasti. */
import schemaDocument from '../../schemas/laya/finding-v1.schema.json' with { type: 'json' };

export const CHECK_ID = 'reference.completeness' as const;
export const LABELS = ['finding_supported', 'possible_false_positive', 'extraction_uncertain', 'insufficient_evidence'] as const;
export type DecisionLabel = typeof LABELS[number];
export type Language = 'hr' | 'en' | 'mixed' | 'unsupported';
export type AbstentionReason = 'insufficient_evidence' | 'unsupported_language' | 'context_limit'
  | 'model_unavailable' | 'timeout' | 'invalid_output' | 'backend_error';
export interface DecisionIdentity {
  checkId: typeof CHECK_ID; documentRevisionId: string; profileId: string; profileRevision: string;
  paragraphIndex: number; recordIndex: number;
}
export interface DataPolicy {
  origin: 'owned_synthetic' | 'explicitly_permitted'; permissionRef: string;
  localReviewAllowed: boolean; trainingAllowed: boolean; externalTeacherAllowed: boolean;
  sourceGroupId: string; documentGroupId: string; templateFamilyId: string;
}
export interface RuleEvidence {
  ruleId: string; sourceId: string; sourceLocator: string; sourcePage: number | null;
  snapshotHash: string; verified: true; excerpt: string;
}
export interface ModelInput {
  referenceText: string; language: Language; extraction: 'complete' | 'uncertain'; rule: RuleEvidence | null;
}
export type EngineStatus = 'pass' | 'warn' | 'fail' | 'informational' | 'unmeasurable' | 'missing' | 'ambiguous' | 'unknown';
export interface DecisionAudit { engineRevision: string; engineCheckStatus: EngineStatus; linkage: 'explicit' | 'uncertain' }
export interface Readiness { status: 'ready' | 'abstain'; reason: 'insufficient_evidence' | 'unsupported_language' | null }
export interface DecisionCase {
  schemaVersion: 1; caseId: string; identity: DecisionIdentity; provenance: DataPolicy;
  audit: DecisionAudit; modelInput: ModelInput; readiness: Readiness;
}
export interface DecisionResult {
  schemaVersion: 1; caseId: string; checkId: typeof CHECK_ID; status: 'predicted' | 'abstained';
  label: DecisionLabel | null; probabilities: Record<DecisionLabel, number> | null;
  entropyConfidence: number | null; calibrationRevision: string | null;
  model: { backend: 'fixture' | 'laya'; id: string; revision: string; weightsSha256: string; tokenizerSha256: string } | null;
  language: Language; inputTokens: number; durationMs: number; abstentionReason: AbstentionReason | null;
}

export class DecisionContractError extends Error {
  readonly code: string;
  constructor(code: string, path = '$') {
    // Nikad ne ispisuje vrijednosti ili nepoznate kljuceve iz tudjeg dokumenta.
    super(`Laya contract: ${code} at ${path}`);
    this.name = 'DecisionContractError'; this.code = code;
  }
}

interface Schema {
  $ref?: string; type?: string | string[]; const?: unknown; enum?: unknown[];
  properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean;
  minLength?: number; maxLength?: number; pattern?: string; minimum?: number; maximum?: number;
}
const DEFINITIONS = schemaDocument.$defs as unknown as Record<string, Schema>;
const ASSERTION_KEYS = new Set(['$ref', 'type', 'const', 'enum', 'properties', 'required',
  'additionalProperties', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum']);

/** Podrzan je samo podskup koji koristi ovaj lokalni ugovor; novi keyword ne smije biti ignoriran. */
function checkSchema(schema: Schema): void {
  if (Object.keys(schema).some(key => !ASSERTION_KEYS.has(key))) throw new DecisionContractError('UNSUPPORTED_SCHEMA');
  const types = typeof schema.type === 'string' ? [schema.type] : (schema.type ?? []);
  if (types.some(type => !['object', 'string', 'number', 'integer', 'boolean', 'null'].includes(type))
    || (types.includes('object') && (schema.additionalProperties !== false || !schema.properties
      || Object.keys(schema.properties).some(key => !schema.required?.includes(key))))) {
    throw new DecisionContractError('UNSUPPORTED_SCHEMA');
  }
  if (schema.$ref && (!schema.$ref.startsWith('#/$defs/') || !DEFINITIONS[schema.$ref.slice(8)])) {
    throw new DecisionContractError('UNSUPPORTED_SCHEMA');
  }
  for (const child of Object.values(schema.properties ?? {})) checkSchema(child);
}
Object.values(DEFINITIONS).forEach(checkSchema);

function validateShape(value: unknown, schema: Schema, path: string, depth = 0): void {
  if (depth > 16) throw new DecisionContractError('INVALID_SHAPE', path);
  if (schema.$ref) { validateShape(value, DEFINITIONS[schema.$ref.slice(8)], path, depth + 1); return; }
  if ('const' in schema && value !== schema.const) throw new DecisionContractError('INVALID_VALUE', path);
  if (schema.enum && !schema.enum.includes(value)) throw new DecisionContractError('INVALID_VALUE', path);
  const types = typeof schema.type === 'string' ? [schema.type] : (schema.type ?? []);
  if (value === null && types.includes('null')) return;
  if (types.includes('object')) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new DecisionContractError('INVALID_SHAPE', path);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const properties = schema.properties ?? {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !Object.hasOwn(properties, key)) throw new DecisionContractError('UNKNOWN_FIELD', path);
      if (!('value' in descriptors[key]) || !descriptors[key].enumerable) throw new DecisionContractError('INVALID_SHAPE', path);
    }
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(descriptors, key)) throw new DecisionContractError('MISSING_FIELD', `${path}.${key}`);
    }
    for (const key of Object.keys(descriptors)) validateShape(descriptors[key].value, properties[key], `${path}.${key}`, depth + 1);
  } else if (types.includes('string')) {
    if (typeof value !== 'string') throw new DecisionContractError('INVALID_VALUE', path);
    const length = [...value].length; // JSON Schema minLength/maxLength broje Unicode code pointe.
    if (length < (schema.minLength ?? 0) || length > (schema.maxLength ?? Infinity)
      || (schema.pattern && !new RegExp(schema.pattern, 'u').test(value))) throw new DecisionContractError('INVALID_VALUE', path);
  } else if (types.includes('number') || types.includes('integer')) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (types.includes('integer') && !Number.isInteger(value))
      || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) throw new DecisionContractError('INVALID_VALUE', path);
  } else if (types.includes('boolean') && typeof value !== 'boolean') throw new DecisionContractError('INVALID_VALUE', path);
}

export function validateModelInput(value: unknown): ModelInput {
  validateShape(value, DEFINITIONS.modelInput, '$.modelInput');
  return JSON.parse(JSON.stringify(value)) as ModelInput;
}

export function assertLocalReviewAllowed(value: unknown): asserts value is DataPolicy {
  validateShape(value, DEFINITIONS.provenance, '$.provenance');
  if (!(value as DataPolicy).localReviewAllowed) throw new DecisionContractError('DATA_NOT_PERMITTED');
}

/** Identitet koristi samo neosobne ID-jeve i lokator, nikad naslov, tekst ili gold oznaku. */
export function decisionCaseId(identity: DecisionIdentity): string {
  validateShape(identity, DEFINITIONS.identity, '$.identity');
  return ['laya:v1', identity.checkId, identity.documentRevisionId, identity.profileId,
    identity.profileRevision, identity.paragraphIndex, identity.recordIndex].join('|');
}

export function deriveReadiness(audit: DecisionAudit, input: ModelInput): Readiness {
  if (audit.linkage !== 'explicit' || !['warn', 'fail', 'informational'].includes(audit.engineCheckStatus)
    || !input.rule || !input.referenceText.trim() || !input.rule.excerpt.trim() || !input.rule.sourceLocator.trim()) {
    return { status: 'abstain', reason: 'insufficient_evidence' };
  }
  if (input.language === 'unsupported') return { status: 'abstain', reason: 'unsupported_language' };
  return { status: 'ready', reason: null };
}

export function validateDecisionCase(value: unknown): DecisionCase {
  validateShape(value, DEFINITIONS.decisionCase, '$');
  const result = value as DecisionCase;
  assertLocalReviewAllowed(result.provenance);
  if (result.caseId !== decisionCaseId(result.identity)) throw new DecisionContractError('IDENTITY_MISMATCH');
  const readiness = deriveReadiness(result.audit, result.modelInput);
  if (result.readiness.status !== readiness.status || result.readiness.reason !== readiness.reason) {
    throw new DecisionContractError('READINESS_MISMATCH');
  }
  // Validacija je vec odbila accessore, ne-JSON vrijednosti i nepoznata polja.
  return JSON.parse(JSON.stringify(result)) as DecisionCase;
}

/** expected je obvezan: samostalna validacija izlaznog ID-ja ne veze odgovor uz poslani slucaj. */
export function validateDecisionResult(value: unknown, expected: unknown): DecisionResult {
  const expectedCase = validateDecisionCase(expected);
  validateShape(value, DEFINITIONS.decisionResult, '$');
  const result = value as DecisionResult;
  if (result.caseId !== expectedCase.caseId || result.checkId !== expectedCase.identity.checkId
    || result.language !== expectedCase.modelInput.language) throw new DecisionContractError('IDENTITY_MISMATCH');
  if (result.status === 'abstained') {
    if (result.label !== null || result.probabilities !== null || result.entropyConfidence !== null
      || result.calibrationRevision !== null || result.abstentionReason === null) throw new DecisionContractError('INVALID_STATUS');
  } else {
    if (expectedCase.readiness.status !== 'ready' || result.label === null || !result.probabilities
      || result.entropyConfidence === null || result.model === null || result.abstentionReason !== null) {
      throw new DecisionContractError('INVALID_STATUS');
    }
    const probabilities = LABELS.map(label => result.probabilities![label]);
    const sum = probabilities.reduce((total, p) => total + p, 0);
    // Laya zaokruzuje svaku od 4 vrijednosti na 4 decimale; ne prepravljamo izlaz.
    if (Math.abs(sum - 1) > 0.00021 || result.probabilities[result.label] !== Math.max(...probabilities)) {
      throw new DecisionContractError('INVALID_DISTRIBUTION');
    }
    const entropy = -probabilities.reduce((total, p) => total + (p > 0 ? p * Math.log(p) : 0), 0);
    if (Math.abs(result.entropyConfidence - (1 - entropy / Math.log(LABELS.length))) > 0.002) {
      throw new DecisionContractError('INVALID_CONFIDENCE');
    }
  }
  return JSON.parse(JSON.stringify(result)) as DecisionResult;
}
