/**
 * LEKTA x Laya v2: ugovor savjetodavnog semantickog procjenitelja nalaza.
 *
 * Laya odgovara samo na pitanje je li konkretan nalaz koji je deterministicka Lekta vec
 * proizvela vjerojatno stvaran, moguc false positive ili bez dovoljno dokaza. Ovaj modul nema
 * mrezu, model, zapis datoteka ni ovlast nad score, checks, issues, fixability ili repairom.
 * Svaki kvar zavrsava kao `no_adjudication`, nikad kao `pass` ni `finding_supported`.
 *
 * Preuzeto iz PR-a #102 (v1): strogi validator podskupa JSON Scheme, odbijanje accessora i
 * naslijedjenih polja, caseId iz neosobnih ID-jeva, inputDigest i greske bez vrijednosti.
 */
import { createHash } from 'node:crypto';
import schemaDocument from '../../schemas/laya/finding-v2.schema.json' with { type: 'json' };
import type { LayaEligibleCheckId } from './eligibility.ts';

export const SCHEMA_VERSION = 2 as const;
export const TASK_ID = 'reference.completeness/finding-v2' as const;
export const VERDICTS = ['finding_supported', 'possible_false_positive', 'extraction_uncertain', 'insufficient_evidence'] as const;
export type LayaVerdict = typeof VERDICTS[number];
export type LayaLanguage = 'hr' | 'en' | 'mixed';
/** Laya zaokruzuje svaku od 4 vjerojatnosti; zbroj smije odstupati samo za zaokruzivanje. */
export const DISTRIBUTION_TOLERANCE = 0.0005;

export interface LayaIdentity {
  documentRevisionId: string; profileId: string; profileRevision: string;
  checkId: LayaEligibleCheckId; paragraphIndex: number; recordIndex: number;
}
export interface LayaProvenance {
  origin: 'owned_synthetic' | 'explicitly_permitted'; permissionRef: string;
  localInferenceAllowed: boolean; trainingAllowed: boolean; externalInferenceAllowed: boolean;
  documentGroupId: string; sourceGroupId: string; templateFamilyId: string;
}
export interface LayaEngine { revision: string; checkStatus: 'warn' | 'fail'; linkage: 'explicit' }
export interface LayaRuleEvidence { ruleId: string; sourceId: string; locator: string; excerpt: string; snapshotHash: string }
export interface LayaModelInput { text: string; language: LayaLanguage; ruleEvidence: LayaRuleEvidence | null }
export interface LayaDecisionCaseV2 {
  schemaVersion: 2; caseId: string; inputDigest: string; identity: LayaIdentity;
  provenance: LayaProvenance; engine: LayaEngine; modelInput: LayaModelInput;
}
export interface LayaRuntime {
  backend: 'laya-python' | 'laya-onnx'; modelId: string; modelRevision: string;
  weightsSha256: string; vocabularySha256: string; calibrationRevision: string;
  runtimeVersion: string; precision: 'fp32' | 'fp16' | 'bf16' | 'int8' | 'int4';
}
export interface LayaDecisionResultV2 {
  schemaVersion: 2; caseId: string; inputDigest: string; verdict: LayaVerdict;
  probabilities: Record<LayaVerdict, number>; answerConfidence: number; runtime: LayaRuntime;
}
/** Prag pripada modelDigest + calibrationRevision + taskId, nikad globalnoj Layi ni upstream defaultu. */
export interface LayaCalibrationPolicy {
  taskId: typeof TASK_ID; modelDigest: string; calibrationRevision: string; minAnswerConfidence: number;
}

export type NoAdjudicationReason =
  | 'case_invalid' | 'runtime_unavailable' | 'manifest_invalid' | 'unknown_schema' | 'invalid_result'
  | 'unknown_label' | 'input_not_bound' | 'weights_mismatch' | 'vocabulary_mismatch' | 'runtime_mismatch'
  | 'invalid_distribution' | 'calibration_missing' | 'calibration_mismatch' | 'below_threshold';

/** Savjetodavni zapis za buduci `details.semanticAdjudication`. Nikad ne sadrzi score ni status checka. */
export type SemanticAdjudication =
  | { schemaVersion: 2; status: 'adjudicated'; caseId: string; inputDigest: string; modelDigest: string;
      cacheKey: string; verdict: LayaVerdict; answerConfidence: number; calibrationRevision: string }
  | { schemaVersion: 2; status: 'no_adjudication'; caseId: string | null; inputDigest: string | null;
      reason: NoAdjudicationReason };

export class DecisionContractError extends Error {
  readonly code: string;
  readonly path: string;
  constructor(code: string, path = '$') {
    // Nikad ne ispisuje vrijednosti ili nepoznate kljuceve iz tudjeg dokumenta.
    super(`Laya v2 contract: ${code} at ${path}`);
    this.name = 'DecisionContractError'; this.code = code; this.path = path;
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

/** Podrzan je samo podskup koji koristi ovaj ugovor; novi keyword ne smije biti tiho ignoriran. */
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
    const maxLength = schema.maxLength ?? Infinity;
    // UTF-16 ima najvise dvije kodne jedinice po code pointu: ocito predug tekst odbija se
    // prije alokacije iteratora nad cijelim ulazom.
    if (Number.isFinite(maxLength) && value.length > maxLength * 2) throw new DecisionContractError('INVALID_VALUE', path);
    const length = [...value].length; // JSON Schema minLength/maxLength broje Unicode code pointe.
    if (length < (schema.minLength ?? 0) || length > maxLength
      || (schema.pattern && !new RegExp(schema.pattern, 'u').test(value))) throw new DecisionContractError('INVALID_VALUE', path);
  } else if (types.includes('number') || types.includes('integer')) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (types.includes('integer') && !Number.isInteger(value))
      || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) throw new DecisionContractError('INVALID_VALUE', path);
  } else if (types.includes('boolean') && typeof value !== 'boolean') throw new DecisionContractError('INVALID_VALUE', path);
}

/** Validira i vraca odvojenu kopiju; accessori i ne-JSON vrijednosti su vec odbijeni. */
function validated<T>(value: unknown, definition: string, path: string): T {
  validateShape(value, DEFINITIONS[definition], path);
  return JSON.parse(JSON.stringify(value)) as T;
}

export const validateIdentity = (v: unknown) => validated<LayaIdentity>(v, 'identity', '$.identity');
export const validateEngine = (v: unknown) => validated<LayaEngine>(v, 'engine', '$.engine');
export const validateModelInput = (v: unknown) => validated<LayaModelInput>(v, 'modelInput', '$.modelInput');
export const validateRuntime = (v: unknown) => validated<LayaRuntime>(v, 'runtime', '$.runtime');

export function assertLocalInferenceAllowed(value: unknown): LayaProvenance {
  const provenance = validated<LayaProvenance>(value, 'provenance', '$.provenance');
  if (!provenance.localInferenceAllowed) throw new DecisionContractError('DATA_NOT_PERMITTED', '$.provenance');
  return provenance;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Identitet koristi samo neosobne ID-jeve i lokator, nikad naslov, tekst ili gold oznaku. */
export function decisionCaseId(identity: LayaIdentity): string {
  const v = validateIdentity(identity);
  return ['laya:v2', v.checkId, v.documentRevisionId, v.profileId, v.profileRevision, v.paragraphIndex, v.recordIndex].join('|');
}

/** SHA-256 veze izmedju casea i tocno onog ulaza koji je procijenjen. Redoslijed polja je fiksan. */
export function decisionInputDigest(identity: LayaIdentity, engine: LayaEngine, input: LayaModelInput): string {
  const i = validateIdentity(identity);
  const e = validateEngine(engine);
  const m = validateModelInput(input);
  const rule = m.ruleEvidence
    ? [m.ruleEvidence.ruleId, m.ruleEvidence.sourceId, m.ruleEvidence.locator, m.ruleEvidence.excerpt, m.ruleEvidence.snapshotHash]
    : null;
  return sha256Hex(JSON.stringify(['laya:v2', i.checkId, i.documentRevisionId, i.profileId, i.profileRevision,
    i.paragraphIndex, i.recordIndex, e.revision, e.checkStatus, e.linkage, m.text, m.language, rule]));
}

/**
 * Isti checkpoint nije dovoljan identitet predikcije: preciznost i runtime mijenjaju vjerojatnosti,
 * a kalibracija mijenja znacenje praga. Zato se sve to veze u jedan digest.
 */
export function modelDigest(runtime: LayaRuntime): string {
  const r = validateRuntime(runtime);
  return sha256Hex(JSON.stringify(['laya:v2:model', r.backend, r.modelId, r.modelRevision, r.weightsSha256,
    r.vocabularySha256, r.runtimeVersion, r.precision, r.calibrationRevision]));
}

export function validateDecisionCase(value: unknown): LayaDecisionCaseV2 {
  validateShape(value, DEFINITIONS.decisionCase, '$');
  const c = value as LayaDecisionCaseV2;
  assertLocalInferenceAllowed(c.provenance);
  if (c.caseId !== decisionCaseId(c.identity)) throw new DecisionContractError('IDENTITY_MISMATCH', '$.caseId');
  if (c.inputDigest !== decisionInputDigest(c.identity, c.engine, c.modelInput)) {
    throw new DecisionContractError('INPUT_DIGEST_MISMATCH', '$.inputDigest');
  }
  return JSON.parse(JSON.stringify(c)) as LayaDecisionCaseV2;
}

/** Jedino sto model smije vidjeti. Identitet, provenance, engine i sve ostalo ostaju izvan. */
export function modelView(value: unknown): LayaModelInput {
  return validateDecisionCase(value).modelInput;
}

function noAdjudication(reason: NoAdjudicationReason, c: LayaDecisionCaseV2 | null): SemanticAdjudication {
  return { schemaVersion: 2, status: 'no_adjudication', caseId: c?.caseId ?? null, inputDigest: c?.inputDigest ?? null, reason };
}

function resultShapeReason(error: unknown): NoAdjudicationReason {
  if (!(error instanceof DecisionContractError)) return 'invalid_result';
  if (error.path === '$.schemaVersion') return 'unknown_schema';
  if (error.path === '$.verdict') return 'unknown_label';
  if (error.path.startsWith('$.probabilities')) return 'invalid_distribution';
  return 'invalid_result';
}

/**
 * Fail-closed validacija odgovora runtimea. Ne baca: svaki kvar je `no_adjudication` s razlogom.
 * `manifest` je pinani runtime (tezine, tokenizer, preciznost, kalibracija), `policy` je izmjereni
 * prag za tocno taj modelDigest. Bez policyja nema presude, bez obzira na answerConfidence.
 *
 * Ugovor dokazuje VEZU deklariranih vrijednosti, ne njihovo podrijetlo: ako pozivatelj preda
 * manifest i prag koje je sam runtime vratio, provjera prolazi. Runner (V2.1) zato manifest i
 * politiku ucitava iz pouzdanog registra odvojeno od odgovora runtimea (LAYA_V2_SPEC.md, odj. 10).
 */
export function adjudicate(result: unknown, expectedCase: unknown, manifest: unknown, policy: unknown): SemanticAdjudication {
  // Neocekivana iznimka (npr. Proxy trap na odgovoru) je takoder no_adjudication, nikad bacanje
  // prema pozivatelju. Neispravna shema ruši vec import modula: runner tada nema Layu (runtime_unavailable).
  try {
    return adjudicateChecked(result, expectedCase, manifest, policy);
  } catch {
    return noAdjudication('invalid_result', null);
  }
}

function adjudicateChecked(result: unknown, expectedCase: unknown, manifest: unknown, policy: unknown): SemanticAdjudication {
  let c: LayaDecisionCaseV2;
  try { c = validateDecisionCase(expectedCase); } catch { return noAdjudication('case_invalid', null); }
  if (result === null || result === undefined) return noAdjudication('runtime_unavailable', c);

  let pinned: LayaRuntime; let digest: string;
  try { pinned = validateRuntime(manifest); digest = modelDigest(pinned); } catch { return noAdjudication('manifest_invalid', c); }

  // Verzija se provjerava prije oblika, da nepoznata shema ne bude prijavljena kao drugi kvar.
  const version = typeof result === 'object' ? Object.getOwnPropertyDescriptor(result, 'schemaVersion') : undefined;
  if (!version || !('value' in version) || version.value !== SCHEMA_VERSION) return noAdjudication('unknown_schema', c);

  let r: LayaDecisionResultV2;
  try { r = validated<LayaDecisionResultV2>(result, 'decisionResult', '$'); } catch (error) { return noAdjudication(resultShapeReason(error), c); }

  if (r.caseId !== c.caseId || r.inputDigest !== c.inputDigest) return noAdjudication('input_not_bound', c);
  if (r.runtime.weightsSha256 !== pinned.weightsSha256) return noAdjudication('weights_mismatch', c);
  if (r.runtime.vocabularySha256 !== pinned.vocabularySha256) return noAdjudication('vocabulary_mismatch', c);
  if (modelDigest(r.runtime) !== digest) return noAdjudication('runtime_mismatch', c);

  // Vjerojatnosti su zapis po oznaci, pa redoslijed opcija u odgovoru ne mijenja tumacenje.
  const probabilities = VERDICTS.map(label => r.probabilities[label]);
  const sum = probabilities.reduce((total, p) => total + p, 0);
  const top = Math.max(...probabilities);
  if (Math.abs(sum - 1) > DISTRIBUTION_TOLERANCE || r.probabilities[r.verdict] !== top
    || probabilities.filter(p => p === top).length !== 1) return noAdjudication('invalid_distribution', c);

  // Nedostajuca ili nevaljana politika (null, undefined, bez praga) je isti ishod: nema izmjerenog praga.
  let p: LayaCalibrationPolicy;
  try { p = validated<LayaCalibrationPolicy>(policy, 'policy', '$.policy'); } catch { return noAdjudication('calibration_missing', c); }
  if (p.taskId !== TASK_ID || p.modelDigest !== digest || p.calibrationRevision !== r.runtime.calibrationRevision) {
    return noAdjudication('calibration_mismatch', c);
  }
  // answerConfidence se sprema, ali nije tocnost; usporeduje se samo s izmjerenim pragom.
  if (r.answerConfidence < p.minAnswerConfidence) return noAdjudication('below_threshold', c);

  return { schemaVersion: 2, status: 'adjudicated', caseId: c.caseId, inputDigest: c.inputDigest, modelDigest: digest,
    cacheKey: `${c.inputDigest}:${digest}`, verdict: r.verdict, answerConfidence: r.answerConfidence,
    calibrationRevision: r.runtime.calibrationRevision };
}
