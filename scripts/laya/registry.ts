/**
 * Pouzdani registar pinanih Laya manifesta i izmjerenih pragova (V2.1, Codex A1 na #149).
 *
 * `adjudicate()` dokazuje samo VEZU deklariranih vrijednosti. Da runtime ne bi sam sebi predao
 * manifest i prag, runner ih uzima iskljucivo odavde: iz commitanog JSON-a s hashovima tezina i
 * tokenizera i kalibracijskom revizijom (bez tezina). Odabir ide po kljucu koji zadaje pozivatelj,
 * nikad po onome sto runtime prijavi.
 *
 * Politika bez izmjerenog praga ne postoji: unos bez politike znaci da nema presude
 * (`calibration_missing`), bez obzira na answerConfidence.
 */
import { DecisionContractError, TASK_ID, modelDigest, validateRuntime } from './contracts-v2.ts';
import type { LayaCalibrationPolicy, LayaRuntime } from './contracts-v2.ts';

const REGISTRY_SCHEMA_VERSION = 1 as const;

export interface LayaRegistryEntry {
  /**
   * Stabilan identifikator unosa koji pozivatelj zadaje (npr. "laya-base-fp32-2026-10"). Polje se
   * namjerno ne zove `key`: gitleaks `generic-api-key` bi svaki takav redak u registry.json citao kao tajnu.
   */
  entryId: string;
  manifest: LayaRuntime;
  /** null dok prag nije izmjeren na zamrznutom kalibracijskom skupu. */
  policy: LayaCalibrationPolicy | null;
  /** Gdje je mjerenje praga zapisano (izvjestaj, commit); obvezno kad policy postoji. */
  calibrationEvidence: string | null;
}
export interface LayaRegistry { schemaVersion: typeof REGISTRY_SCHEMA_VERSION; entries: LayaRegistryEntry[] }
export interface PinnedModel { manifest: LayaRuntime; policy: LayaCalibrationPolicy | null; modelDigest: string }

const ENTRY_ID = /^[a-z0-9][a-z0-9._-]{2,79}$/;
const REVISION = /^[A-Za-z0-9._:-]{1,80}$/;

function plainObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new DecisionContractError('INVALID_REGISTRY');
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || !keys.every((k) => own.includes(k))) throw new DecisionContractError('INVALID_REGISTRY');
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(value, k);
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) throw new DecisionContractError('INVALID_REGISTRY');
  }
  return value as Record<string, unknown>;
}

function validatePolicy(value: unknown, digest: string, manifest: LayaRuntime): LayaCalibrationPolicy {
  const p = plainObject(value, ['taskId', 'modelDigest', 'calibrationRevision', 'minAnswerConfidence']);
  const threshold = p.minAnswerConfidence;
  if (p.taskId !== TASK_ID || p.modelDigest !== digest || p.calibrationRevision !== manifest.calibrationRevision
    || typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new DecisionContractError('INVALID_REGISTRY');
  }
  return { taskId: TASK_ID, modelDigest: digest, calibrationRevision: manifest.calibrationRevision, minAnswerConfidence: threshold };
}

/** Strogo ucitava registar. Svaka nepravilnost baca bez ispisa vrijednosti. */
export function loadRegistry(value: unknown): LayaRegistry {
  const root = plainObject(value, ['schemaVersion', 'entries']);
  if (root.schemaVersion !== REGISTRY_SCHEMA_VERSION || !Array.isArray(root.entries)) throw new DecisionContractError('INVALID_REGISTRY');
  const entries: LayaRegistryEntry[] = [];
  const ids = new Set<string>();
  const digests = new Set<string>();
  for (const raw of root.entries as unknown[]) {
    const e = plainObject(raw, ['entryId', 'manifest', 'policy', 'calibrationEvidence']);
    if (typeof e.entryId !== 'string' || !ENTRY_ID.test(e.entryId) || ids.has(e.entryId)) throw new DecisionContractError('INVALID_REGISTRY');
    const manifest = validateRuntime(e.manifest);
    if (!REVISION.test(manifest.calibrationRevision)) throw new DecisionContractError('INVALID_REGISTRY');
    const digest = modelDigest(manifest);
    if (digests.has(digest)) throw new DecisionContractError('INVALID_REGISTRY');
    const policy = e.policy === null ? null : validatePolicy(e.policy, digest, manifest);
    const evidence = e.calibrationEvidence;
    if (policy ? typeof evidence !== 'string' || !evidence.trim() : evidence !== null) throw new DecisionContractError('INVALID_REGISTRY');
    ids.add(e.entryId); digests.add(digest);
    entries.push({ entryId: e.entryId, manifest, policy, calibrationEvidence: evidence as string | null });
  }
  return { schemaVersion: REGISTRY_SCHEMA_VERSION, entries };
}

/** Pinani model za kljuc koji zadaje pozivatelj. Nepoznat kljuc je null (runner tada nema Layu). */
export function pinnedModel(registry: LayaRegistry, entryId: string): PinnedModel | null {
  const entry = registry.entries.find((e) => e.entryId === entryId);
  return entry ? { manifest: entry.manifest, policy: entry.policy, modelDigest: modelDigest(entry.manifest) } : null;
}
