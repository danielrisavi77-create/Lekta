/**
 * buildLayaCandidates: read-only projekcija deterministickog rezultata u Laya v2 caseove.
 *
 * Ulaz je eksplicitan snapshot pouzdanog in-process pozivatelja: stabilni ID-jevi, `checks`
 * (samo id i status) i pojedinacni bibliografski zapisi s eksplicitnom vezom na check. Adapter
 * ne cita score, issues, details.triage, recipe ni originalne bajtove; getteri na tim poljima se
 * ne izvrsavaju. Model-ready case nastaje samo kad prode redom: eligibility, status nalaza,
 * eksplicitna veza, jezik, potpunost dokaza i limit konteksta. Sve ostalo je `skipped` s razlogom
 * i bez teksta zapisa.
 *
 * Nasljedstvo PR-a #102: descriptor gard (bez gettera i naslijedjenih polja) i gusti nizovi.
 * Ovo nije sandbox za izvrsivi Proxy ili izmijenjene JS intrinsics.
 */
import {
  DecisionContractError, assertLocalInferenceAllowed, decisionCaseId, decisionInputDigest,
  validateDecisionCase, validateEngine, validateIdentity, validateModelInput,
} from './contracts-v2.ts';
import type { LayaDecisionCaseV2, LayaProvenance, LayaRuleEvidence } from './contracts-v2.ts';
import { isLayaEligibleCheck } from './eligibility.ts';

export const MAX_RECORDS = 1000;
/** Laya dobiva samo pojedinacni zapis; dulji tekst nije jedan bibliografski zapis. */
export const MAX_TEXT_CODE_POINTS = 2000;

export interface CandidateRecord {
  checkId: string | null;
  linkage: 'explicit' | 'uncertain';
  paragraphIndex: number;
  recordIndex: number;
  text: string;
  language: 'hr' | 'en' | 'mixed' | 'unsupported';
  ruleEvidence: LayaRuleEvidence | null;
}
export interface CandidateSnapshot {
  readonly documentRevisionId: string;
  readonly profile: Readonly<{ id: string; revision: string }>;
  readonly engineRevision: string;
  readonly provenance: Readonly<LayaProvenance>;
  /** Ostatak kanonskog rezultata (score, issues, triage, recipe) se uopce ne cita. */
  readonly result: { readonly checks: readonly Readonly<{ id?: string | null; status: string }>[] };
  readonly records: readonly Readonly<CandidateRecord>[];
}

export type SkipReason =
  | 'check_not_eligible' | 'check_missing' | 'check_ambiguous' | 'check_not_finding'
  | 'linkage_not_explicit' | 'unsupported_language' | 'evidence_incomplete' | 'context_limit';
export interface SkippedCandidate { paragraphIndex: number; recordIndex: number; reason: SkipReason }
export interface CandidateBatch { cases: LayaDecisionCaseV2[]; skipped: SkippedCandidate[] }

/** Cita samo vlastiti enumerable data-descriptor obicnog objekta. */
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

/** Sparse niz nije prazan niz. Ne pozivaju se ulazne map/filter metode ni iterator. */
function denseValues<T>(value: readonly T[], maximum = Number.MAX_SAFE_INTEGER): T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new DecisionContractError('INVALID_SNAPSHOT');
  }
  const length: number = Object.getOwnPropertyDescriptor(value, 'length')!.value;
  if (length > maximum || Reflect.ownKeys(value).length !== length + 1) throw new DecisionContractError('INVALID_SNAPSHOT');
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

function isIndex(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= 1_000_000;
}

export function buildLayaCandidates(input: CandidateSnapshot): CandidateBatch {
  const provenance = assertLocalInferenceAllowed(ownValue(input, 'provenance'));
  const documentRevisionId = ownValue(input, 'documentRevisionId');
  const engineRevision = ownValue(input, 'engineRevision');
  const profile = ownValue(input, 'profile');
  const profileId = ownValue(profile, 'id');
  const profileRevision = ownValue(profile, 'revision');
  // Metapodaci se provjeravaju i za prazan batch.
  validateIdentity({ documentRevisionId, profileId, profileRevision, checkId: 'reference.completeness', paragraphIndex: 1, recordIndex: 0 });
  validateEngine({ revision: engineRevision, checkStatus: 'warn', linkage: 'explicit' });

  const records = denseValues(ownValue(input, 'records'), MAX_RECORDS);
  const statuses = new Map<string, string[]>();
  for (const check of denseValues(ownValue(ownValue(input, 'result'), 'checks'))) {
    const id = ownValue(check, 'id', true);
    const status = ownValue(check, 'status');
    if (typeof id !== 'string') continue; // provjera bez stabilnog id-ja ne moze biti eksplicitna veza
    if (typeof status !== 'string') throw new DecisionContractError('INVALID_SNAPSHOT');
    statuses.set(id, [...(statuses.get(id) ?? []), status]);
  }

  const cases: LayaDecisionCaseV2[] = [];
  const skipped: SkippedCandidate[] = [];
  const seen = new Set<string>();
  for (const source of records) {
    const checkId = ownValue(source, 'checkId');
    const linkage = ownValue(source, 'linkage');
    const paragraphIndex = ownValue(source, 'paragraphIndex');
    const recordIndex = ownValue(source, 'recordIndex');
    const text = ownValue(source, 'text');
    const language = ownValue(source, 'language');
    const ruleEvidence = ownValue(source, 'ruleEvidence');
    if ((checkId !== null && typeof checkId !== 'string') || !['explicit', 'uncertain'].includes(linkage)
      || !isIndex(paragraphIndex, 1) || !isIndex(recordIndex, 0) || typeof text !== 'string'
      || !['hr', 'en', 'mixed', 'unsupported'].includes(language)) {
      throw new DecisionContractError('INVALID_SNAPSHOT');
    }
    const locator = `${paragraphIndex}|${recordIndex}`;
    if (seen.has(locator)) throw new DecisionContractError('DUPLICATE_IDENTITY');
    seen.add(locator);

    const skip = (reason: SkipReason) => { skipped.push({ paragraphIndex, recordIndex, reason }); };
    if (!isLayaEligibleCheck(checkId)) { skip('check_not_eligible'); continue; }
    const found = statuses.get(checkId) ?? [];
    if (found.length === 0) { skip('check_missing'); continue; }
    if (found.length > 1) { skip('check_ambiguous'); continue; }
    const checkStatus = found[0];
    if (checkStatus !== 'warn' && checkStatus !== 'fail') { skip('check_not_finding'); continue; }
    if (linkage !== 'explicit') { skip('linkage_not_explicit'); continue; }
    if (language === 'unsupported') { skip('unsupported_language'); continue; }
    if (!text.trim()) { skip('evidence_incomplete'); continue; }
    if (text.length > MAX_TEXT_CODE_POINTS * 2 || [...text].length > MAX_TEXT_CODE_POINTS) { skip('context_limit'); continue; }

    const identity = validateIdentity({ documentRevisionId, profileId, profileRevision, checkId, paragraphIndex, recordIndex });
    const engine = validateEngine({ revision: engineRevision, checkStatus, linkage });
    const modelInput = validateModelInput({ text, language, ruleEvidence });
    cases.push(validateDecisionCase({ schemaVersion: 2, caseId: decisionCaseId(identity),
      inputDigest: decisionInputDigest(identity, engine, modelInput), identity, provenance, engine, modelInput }));
  }
  return { cases, skipped };
}
