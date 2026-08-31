import type { IntakeOk } from '../docx/intake-gate';

export const LOCAL_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const LOCAL_DOCUMENT_TTL_MS = 24 * 60 * 60 * 1_000;
export const STORED_ANALYSIS_SCHEMA_VERSION = 1 as const;

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const WORKSPACE_STAGES = new Set<LocalWorkspaceSnapshot['stage']>([
  'profile',
  'results',
  'repairPlan',
  'comparison',
  'submission',
]);

export interface ConfirmedProfileSnapshot {
  profileDefinitionId: string;
  selectionIds: Record<string, string>;
  confirmedAt: number;
}

export interface StoredAnalysisSnapshot {
  schemaVersion: typeof STORED_ANALYSIS_SCHEMA_VERSION;
  createdAt: number;
  payload: unknown;
}

export interface LocalWorkspaceSnapshot {
  stage: 'profile' | 'results' | 'repairPlan' | 'comparison' | 'submission';
  selectedFindingId?: string;
  analysis?: StoredAnalysisSnapshot;
}

export interface LocalDocumentSessionV1 {
  schemaVersion: typeof LOCAL_DOCUMENT_SCHEMA_VERSION;
  id: string;
  createdAt: number;
  expiresAt: number;
  document: {
    name: string;
    type: string;
    lastModified: number;
    bytes: ArrayBuffer;
  };
  intake: IntakeOk;
  profile?: ConfirmedProfileSnapshot;
  workspace?: LocalWorkspaceSnapshot;
}

export interface LocalDocumentSessionUpdate {
  profile?: ConfirmedProfileSnapshot | null;
  workspace?: LocalWorkspaceSnapshot | null;
}

export interface LocalDocumentSessionSummary {
  id: string;
  name: string;
  createdAt: number;
  expiresAt: number;
  stage: LocalWorkspaceSnapshot['stage'] | 'profile';
}

export interface LocalDocumentSessionStore {
  put(session: LocalDocumentSessionV1): Promise<void>;
  get(id: string, now?: number): Promise<LocalDocumentSessionV1 | null>;
  update(id: string, update: LocalDocumentSessionUpdate): Promise<LocalDocumentSessionV1>;
  list(now?: number): Promise<LocalDocumentSessionSummary[]>;
  delete(id: string): Promise<void>;
  deleteExpired(now?: number): Promise<number>;
}

export interface LocalDocumentSessionCreationOptions {
  now?: number;
  crypto?: { randomUUID(): string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNullablePositiveNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value > 0);
}
/**
 * Provjeri procjenu iz intakea prije nego ude u pohranu (ili se iz nje vrati).
 *
 * OPSEG: provjeravaju se tip, tocan skup kljuceva i UNAKRSNI invarijanti izmedu zastavica
 * (`canRepair` mora odgovarati postojanju blockera; popravak bez analize je nemoguc).
 *
 * STO SE NE PROVJERAVA, i to je svjesno: blocker se NIKAD ne usporeduje s brojkama koje bi ga
 * opravdale. Podmetnut zapis smije reci `too-many-entries` uz `entryCount` od 5, ili
 * `canAnalyze: true` uz `upload-too-large`. Sanitizator je u tom smjeru SIRI od svog jedinog
 * proizvodaca (`docxCapability`). Steta je ogranicena: takav zapis moze sucelje uciniti samo
 * pesimisticnijim ili krivo imenovati razlog, nikad dopustiti popravak koji server odbija, jer
 * ciljanu vrijednost i granice pakiranja server ionako izvodi sam. Ne citaj ovu funkciju kao
 * dokaz da je procjena tocna, nego samo da nije proturjecna.
 *
 * GRANICE BROJKI su namjerno labave (`>= 0`): `docxCapability` je jedini proizvodac i sam
 * dopusta nulu, a deklarirane velicine iz central directoryja smiju lagati (lazljivca hvataju
 * streaming capovi u `data()` i zip-codecu). Validator uzi od svog proizvodaca bacio bi CIJELU
 * sesiju, dakle bajtove dokumenta i potvrdeni profil, zbog kozmeticke brojke.
 */
function sanitizeCapability(value: unknown): IntakeOk['capability'] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;

  const keys = Object.keys(value).sort();
  const expectedKeys = ['canAnalyze', 'canRepair', 'entryCount', 'repairBlocker', 'totalDeclaredBytes'];
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) return undefined;
  if (typeof value.canAnalyze !== 'boolean' || typeof value.canRepair !== 'boolean') return undefined;
  if (
    typeof value.totalDeclaredBytes !== 'number'
    || !Number.isSafeInteger(value.totalDeclaredBytes)
    || value.totalDeclaredBytes < 0
    || typeof value.entryCount !== 'number'
    || !Number.isSafeInteger(value.entryCount)
    || value.entryCount < 0
  ) return undefined;

  const blocker = value.repairBlocker;
  if (
    blocker !== null
    && blocker !== 'upload-too-large'
    && blocker !== 'too-many-entries'
    && blocker !== 'decompresses-too-large'
  ) return undefined;
  if (value.canRepair !== (blocker === null) || (!value.canAnalyze && value.canRepair)) return undefined;

  return {
    canAnalyze: value.canAnalyze,
    canRepair: value.canRepair,
    totalDeclaredBytes: value.totalDeclaredBytes,
    entryCount: value.entryCount,
    repairBlocker: blocker,
  };
}

function cloneBytes(bytes: ArrayBuffer): ArrayBuffer {
  return bytes.slice(0);
}

function cloneUnknown(value: unknown): unknown {
  return structuredClone(value);
}

function sanitizeIntake(value: unknown): IntakeOk | null {
  if (!isRecord(value) || value.kind !== 'ok' || typeof value.suspicious !== 'boolean') return null;
  if (!(value.suspicionReason === null || typeof value.suspicionReason === 'string')) return null;
  if (!Object.prototype.hasOwnProperty.call(value, 'capability')) return null;
  const capability = sanitizeCapability(value.capability);
  if (capability === undefined) return null;

  let quickStats: IntakeOk['quickStats'] = null;
  if (value.quickStats !== null) {
    if (!isRecord(value.quickStats)) return null;
    if (!isNullablePositiveNumber(value.quickStats.words) || !isNullablePositiveNumber(value.quickStats.pages)) return null;
    quickStats = { words: value.quickStats.words, pages: value.quickStats.pages };
  }

  return {
    kind: 'ok',
    quickStats,
    suspicious: value.suspicious,
    suspicionReason: value.suspicionReason,
    capability,
  };
}

function sanitizeProfile(value: unknown): ConfirmedProfileSnapshot | null {
  if (!isRecord(value)) return null;
  if (typeof value.profileDefinitionId !== 'string' || value.profileDefinitionId.length === 0) return null;
  if (!isFiniteTimestamp(value.confirmedAt) || !isRecord(value.selectionIds)) return null;

  const selectionIds: Record<string, string> = {};
  for (const [key, selectionId] of Object.entries(value.selectionIds)) {
    if (typeof selectionId !== 'string') return null;
    selectionIds[key] = selectionId;
  }

  return {
    profileDefinitionId: value.profileDefinitionId,
    selectionIds,
    confirmedAt: value.confirmedAt,
  };
}

function isMinimalAnalysisPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.version !== 'string' || value.version.length === 0) return false;
  if (typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))) return false;
  if (!isRecord(value.file) || typeof value.file.name !== 'string') return false;
  if (typeof value.file.size !== 'number' || !Number.isFinite(value.file.size) || value.file.size < 0) return false;
  if (typeof value.score !== 'number' || !Number.isFinite(value.score)) return false;
  return Array.isArray(value.checks) && Array.isArray(value.issues);
}

function sanitizeAnalysis(value: unknown): StoredAnalysisSnapshot | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== STORED_ANALYSIS_SCHEMA_VERSION || !isFiniteTimestamp(value.createdAt)) return null;
  if (!isMinimalAnalysisPayload(value.payload)) return null;

  try {
    return {
      schemaVersion: STORED_ANALYSIS_SCHEMA_VERSION,
      createdAt: value.createdAt,
      payload: cloneUnknown(value.payload),
    };
  } catch {
    return null;
  }
}

function sanitizeWorkspaceMetadata(value: unknown): Omit<LocalWorkspaceSnapshot, 'analysis'> | null {
  if (!isRecord(value) || typeof value.stage !== 'string') return null;
  if (!WORKSPACE_STAGES.has(value.stage as LocalWorkspaceSnapshot['stage'])) return null;
  if (!(value.selectedFindingId === undefined || typeof value.selectedFindingId === 'string')) return null;

  const workspace: LocalWorkspaceSnapshot = { stage: value.stage as LocalWorkspaceSnapshot['stage'] };
  if (typeof value.selectedFindingId === 'string') workspace.selectedFindingId = value.selectedFindingId;
  return workspace;
}

function sanitizeWorkspace(value: unknown): LocalWorkspaceSnapshot | null {
  const metadata = sanitizeWorkspaceMetadata(value);
  if (!metadata) return null;
  const workspace: LocalWorkspaceSnapshot = { ...metadata };
  const analysis = sanitizeAnalysis((value as Record<string, unknown>).analysis);
  if (analysis) workspace.analysis = analysis;
  return workspace;
}

function sanitizeDocumentMetadata(value: unknown): LocalDocumentSessionV1['document'] | null {
  if (!isRecord(value)) return null;
  if (typeof value.name !== 'string' || value.name.length === 0) return null;
  if (typeof value.type !== 'string' || !isFiniteTimestamp(value.lastModified)) return null;
  if (!(value.bytes instanceof ArrayBuffer) || value.bytes.byteLength === 0) return null;

  return {
    name: value.name,
    type: value.type,
    lastModified: value.lastModified,
    bytes: value.bytes,
  };
}

function sanitizeDocument(value: unknown): LocalDocumentSessionV1['document'] | null {
  const document = sanitizeDocumentMetadata(value);
  if (!document) return null;
  return { ...document, bytes: cloneBytes(document.bytes) };
}

type ValidLocalDocumentSessionRecord = Record<string, unknown> & {
  id: string;
  createdAt: number;
  expiresAt: number;
};

function validLocalDocumentSessionRecord(
  value: unknown,
  now: number,
): ValidLocalDocumentSessionRecord | null {
  if (!isRecord(value) || value.schemaVersion !== LOCAL_DOCUMENT_SCHEMA_VERSION) return null;
  if (!isLocalDocumentSessionId(value.id)) return null;
  if (!isFiniteTimestamp(value.createdAt) || !isFiniteTimestamp(value.expiresAt)) return null;
  if (value.expiresAt <= value.createdAt || value.expiresAt > value.createdAt + LOCAL_DOCUMENT_TTL_MS) return null;
  if (!isFiniteTimestamp(now) || value.expiresAt <= now) return null;
  return value as ValidLocalDocumentSessionRecord;
}

export function isLocalDocumentSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value);
}

export function sessionFragment(id: string): string {
  if (!isLocalDocumentSessionId(id)) throw new TypeError('ID lokalne dokumentne sesije nije valjani nasumični UUID.');
  return `#session=${id}`;
}

export function parseSessionFragment(fragment: string): string | null {
  const match = /^#session=([0-9a-f-]+)$/.exec(fragment);
  if (!match || !isLocalDocumentSessionId(match[1])) return null;
  return match[1];
}

export async function createLocalDocumentSession(
  file: File,
  intake: IntakeOk,
  options: LocalDocumentSessionCreationOptions = {},
): Promise<LocalDocumentSessionV1> {
  const createdAt = options.now ?? Date.now();
  if (!isFiniteTimestamp(createdAt)) throw new TypeError('Vrijeme nastanka lokalne sesije nije valjano.');

  const cryptoProvider = options.crypto ?? globalThis.crypto;
  if (!cryptoProvider || typeof cryptoProvider.randomUUID !== 'function') {
    throw new TypeError('Sigurno generiranje ID-a lokalne sesije nije dostupno.');
  }
  const id = cryptoProvider.randomUUID();
  if (!isLocalDocumentSessionId(id)) throw new TypeError('Generator nije vratio valjani nasumični UUID.');

  const sanitizedIntake = sanitizeIntake(intake);
  if (!sanitizedIntake) throw new TypeError('Intake rezultat lokalne sesije nije valjan.');

  const bytes = await file.arrayBuffer();
  if (bytes.byteLength === 0) throw new TypeError('Dokument lokalne sesije nema bajtove.');

  return {
    schemaVersion: LOCAL_DOCUMENT_SCHEMA_VERSION,
    id,
    createdAt,
    expiresAt: createdAt + LOCAL_DOCUMENT_TTL_MS,
    document: {
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      bytes: cloneBytes(bytes),
    },
    intake: sanitizedIntake,
  };
}

export function fileFromLocalDocumentSession(session: LocalDocumentSessionV1): File {
  return new File([cloneBytes(session.document.bytes)], session.document.name, {
    type: session.document.type,
    lastModified: session.document.lastModified,
  });
}

export function sanitizeLocalDocumentSession(
  value: unknown,
  now = Date.now(),
): LocalDocumentSessionV1 | null {
  const record = validLocalDocumentSessionRecord(value, now);
  if (!record) return null;
  const document = sanitizeDocument(record.document);
  const sanitizedIntake = sanitizeIntake(record.intake);
  if (!document || !sanitizedIntake) return null;

  const session: LocalDocumentSessionV1 = {
    schemaVersion: LOCAL_DOCUMENT_SCHEMA_VERSION,
    id: record.id,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    document,
    intake: sanitizedIntake,
  };

  if (record.profile !== undefined) {
    const profile = sanitizeProfile(record.profile);
    if (!profile) return null;
    session.profile = profile;
  }

  if (record.workspace !== undefined) {
    const workspace = sanitizeWorkspace(record.workspace);
    if (!workspace) return null;
    session.workspace = workspace;
  }

  return session;
}

export function summarizeStoredLocalDocumentSession(
  value: unknown,
  now = Date.now(),
): LocalDocumentSessionSummary | null {
  const record = validLocalDocumentSessionRecord(value, now);
  if (!record) return null;

  const document = sanitizeDocumentMetadata(record.document);
  const sanitizedIntake = sanitizeIntake(record.intake);
  if (!document || !sanitizedIntake) return null;

  if (record.profile !== undefined && !sanitizeProfile(record.profile)) return null;

  let stage: LocalDocumentSessionSummary['stage'] = 'profile';
  if (record.workspace !== undefined) {
    const workspace = sanitizeWorkspaceMetadata(record.workspace);
    if (!workspace) return null;
    stage = workspace.stage;
  }

  return {
    id: record.id,
    name: document.name,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    stage,
  };
}

export function applyLocalDocumentSessionUpdate(
  current: LocalDocumentSessionV1,
  update: LocalDocumentSessionUpdate,
  now = Date.now(),
): LocalDocumentSessionV1 {
  const session = sanitizeLocalDocumentSession(current, now);
  if (!session) throw new TypeError('Lokalna dokumentna sesija više nije valjana.');

  const candidate: LocalDocumentSessionV1 = { ...session };
  if (update.profile === null) delete candidate.profile;
  else if (update.profile !== undefined) candidate.profile = update.profile;
  if (update.workspace === null) delete candidate.workspace;
  else if (update.workspace !== undefined) candidate.workspace = update.workspace;

  const sanitized = sanitizeLocalDocumentSession(candidate, now);
  if (!sanitized) throw new TypeError('Ažuriranje lokalne dokumentne sesije nije valjano.');
  return sanitized;
}

export function summarizeLocalDocumentSession(session: LocalDocumentSessionV1): LocalDocumentSessionSummary {
  return {
    id: session.id,
    name: session.document.name,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    stage: session.workspace?.stage ?? 'profile',
  };
}
