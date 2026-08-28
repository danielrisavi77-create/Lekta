import {
  applyLocalDocumentSessionUpdate,
  LOCAL_DOCUMENT_TTL_MS,
  isLocalDocumentSessionId,
  sanitizeLocalDocumentSession,
  summarizeLocalDocumentSession,
  summarizeStoredLocalDocumentSession,
  type LocalDocumentSessionStore,
  type LocalDocumentSessionSummary,
  type LocalDocumentSessionUpdate,
  type LocalDocumentSessionV1,
} from './local-document-session';

export const LOCAL_DOCUMENT_DB_NAME = 'lekta-local-documents';
export const LOCAL_DOCUMENT_DB_VERSION = 2;
export const LOCAL_DOCUMENT_STORE_NAME = 'sessions';
export const LOCAL_DOCUMENT_EXPIRY_INDEX = 'expiresAt';
export const LOCAL_DOCUMENT_SUMMARY_STORE_NAME = 'session-summaries';
export const LOCAL_DOCUMENT_SUMMARY_EXPIRY_INDEX = 'expiresAt';

export type LocalDocumentSessionStoreErrorCode =
  | 'unavailable'
  | 'blocked'
  | 'quota'
  | 'request'
  | 'transaction'
  | 'not-found'
  | 'invalid-record';

export interface LocalDocumentSessionStorageInfo {
  kind: 'indexeddb' | 'memory';
  persistent: boolean;
  scope: 'browser' | 'tab';
}

export class LocalDocumentSessionStoreError extends Error {
  readonly code: LocalDocumentSessionStoreErrorCode;

  constructor(code: LocalDocumentSessionStoreErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'LocalDocumentSessionStoreError';
    this.code = code;
  }
}

function messageFor(code: LocalDocumentSessionStoreErrorCode): string {
  switch (code) {
    case 'unavailable': return 'Lokalna pohrana dokumenta nije dostupna u ovom pregledniku.';
    case 'blocked': return 'Otvaranje lokalne pohrane blokirano je drugom otvorenom verzijom aplikacije.';
    case 'quota': return 'Nema dovoljno prostora za privremenu lokalnu pohranu dokumenta.';
    case 'request': return 'Zahtjev prema lokalnoj pohrani dokumenta nije uspio.';
    case 'transaction': return 'Transakcija lokalne pohrane dokumenta nije uspjela.';
    case 'not-found': return 'Lokalna dokumentna sesija više ne postoji ili je istekla.';
    case 'invalid-record': return 'Lokalna dokumentna sesija nije valjana.';
  }
}

function storeError(
  code: LocalDocumentSessionStoreErrorCode,
  cause?: unknown,
): LocalDocumentSessionStoreError {
  if (cause instanceof LocalDocumentSessionStoreError) return cause;
  const resolvedCode = cause instanceof DOMException && cause.name === 'QuotaExceededError' ? 'quota' : code;
  return new LocalDocumentSessionStoreError(resolvedCode, messageFor(resolvedCode), cause);
}

function nowIsValid(now: number): boolean {
  return Number.isFinite(now) && now >= 0;
}

const LOCAL_DOCUMENT_SUMMARY_STAGES = new Set<LocalDocumentSessionSummary['stage']>([
  'profile',
  'results',
  'repairPlan',
  'comparison',
  'submission',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeStoredSummary(
  value: unknown,
  now: number,
  expectedKey?: IDBValidKey,
): LocalDocumentSessionSummary | null {
  if (!nowIsValid(now) || !isRecord(value) || !isLocalDocumentSessionId(value.id)) return null;
  if (expectedKey !== undefined && expectedKey !== value.id) return null;
  if (typeof value.name !== 'string' || value.name.length === 0) return null;
  if (typeof value.createdAt !== 'number' || !nowIsValid(value.createdAt)) return null;
  if (typeof value.expiresAt !== 'number' || !nowIsValid(value.expiresAt)) return null;
  if (value.expiresAt <= value.createdAt) return null;
  if (value.expiresAt > value.createdAt + LOCAL_DOCUMENT_TTL_MS || value.expiresAt <= now) return null;
  if (typeof value.stage !== 'string'
    || !LOCAL_DOCUMENT_SUMMARY_STAGES.has(value.stage as LocalDocumentSessionSummary['stage'])) return null;
  return {
    id: value.id,
    name: value.name,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    stage: value.stage as LocalDocumentSessionSummary['stage'],
  };
}

function rawHasAnalysis(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const workspace = (value as { workspace?: unknown }).workspace;
  return typeof workspace === 'object'
    && workspace !== null
    && Object.prototype.hasOwnProperty.call(workspace, 'analysis');
}

export interface MemoryDocumentSessionStoreOptions {
  now?: () => number;
}

export class MemoryDocumentSessionStore implements LocalDocumentSessionStore {
  readonly storageInfo: LocalDocumentSessionStorageInfo = {
    kind: 'memory',
    persistent: false,
    scope: 'tab',
  };

  private readonly records = new Map<string, unknown>();
  private readonly currentTime: () => number;

  constructor(options: MemoryDocumentSessionStoreOptions = {}) {
    this.currentTime = options.now ?? Date.now;
  }

  async put(session: LocalDocumentSessionV1): Promise<void> {
    const sanitized = sanitizeLocalDocumentSession(session, this.currentTime());
    if (!sanitized) throw storeError('invalid-record');
    this.records.set(sanitized.id, sanitized);
  }

  async get(id: string, now = this.currentTime()): Promise<LocalDocumentSessionV1 | null> {
    const raw = this.records.get(id);
    if (raw === undefined) return null;

    const sanitized = sanitizeLocalDocumentSession(raw, now);
    if (!sanitized) {
      this.records.delete(id);
      return null;
    }
    this.records.set(id, sanitized);
    return sanitizeLocalDocumentSession(sanitized, now);
  }

  async update(id: string, update: LocalDocumentSessionUpdate): Promise<LocalDocumentSessionV1> {
    const now = this.currentTime();
    const current = await this.get(id, now);
    if (!current) throw storeError('not-found');

    let updated: LocalDocumentSessionV1;
    try {
      updated = applyLocalDocumentSessionUpdate(current, update, now);
    } catch (error) {
      throw storeError('invalid-record', error);
    }
    this.records.set(id, updated);
    return sanitizeLocalDocumentSession(updated, now)!;
  }

  async list(now = this.currentTime()): Promise<LocalDocumentSessionSummary[]> {
    const summaries: LocalDocumentSessionSummary[] = [];
    for (const [id, raw] of this.records) {
      const sanitized = sanitizeLocalDocumentSession(raw, now);
      if (!sanitized) {
        this.records.delete(id);
        continue;
      }
      this.records.set(id, sanitized);
      summaries.push(summarizeLocalDocumentSession(sanitized));
    }
    return summaries.sort((left, right) => right.createdAt - left.createdAt);
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  async deleteExpired(now = this.currentTime()): Promise<number> {
    if (!nowIsValid(now)) throw storeError('invalid-record');
    let deleted = 0;
    for (const [id, raw] of this.records) {
      const expiresAt = typeof raw === 'object' && raw !== null
        ? (raw as { expiresAt?: unknown }).expiresAt
        : undefined;
      if (typeof expiresAt !== 'number'
        || !Number.isFinite(expiresAt)
        || expiresAt < 0
        || expiresAt <= now) {
        this.records.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }
}

export interface IndexedDbDocumentSessionStoreOptions {
  indexedDB?: IDBFactory;
  keyRange?: Pick<typeof IDBKeyRange, 'upperBound'>;
  now?: () => number;
}

export class IndexedDbDocumentSessionStore implements LocalDocumentSessionStore {
  readonly storageInfo: LocalDocumentSessionStorageInfo = {
    kind: 'indexeddb',
    persistent: true,
    scope: 'browser',
  };

  private readonly factory: IDBFactory | undefined;
  private readonly keyRange: Pick<typeof IDBKeyRange, 'upperBound'> | undefined;
  private readonly currentTime: () => number;
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDbDocumentSessionStoreOptions = {}) {
    const hasFactoryOverride = Object.prototype.hasOwnProperty.call(options, 'indexedDB');
    const hasKeyRangeOverride = Object.prototype.hasOwnProperty.call(options, 'keyRange');
    this.factory = hasFactoryOverride ? options.indexedDB : globalThis.indexedDB;
    this.keyRange = hasKeyRangeOverride
      ? options.keyRange
      : (typeof IDBKeyRange === 'undefined' ? undefined : IDBKeyRange);
    this.currentTime = options.now ?? Date.now;
  }

  async put(session: LocalDocumentSessionV1): Promise<void> {
    await this.putAt(session, this.currentTime());
  }

  private async putAt(session: LocalDocumentSessionV1, now: number): Promise<void> {
    const sanitized = sanitizeLocalDocumentSession(session, now);
    if (!sanitized) throw storeError('invalid-record');
    const summary = summarizeLocalDocumentSession(sanitized);
    await this.runAtomicSessionAndSummary((sessions, summaries) => [
      sessions.put(sanitized),
      summaries.put(summary),
    ]);
  }

  async get(id: string, now = this.currentTime()): Promise<LocalDocumentSessionV1 | null> {
    const raw = await this.runRequest('readonly', (store) => store.get(id));
    if (raw === undefined) return null;

    const sanitized = sanitizeLocalDocumentSession(raw, now);
    if (!sanitized) {
      await this.delete(id);
      return null;
    }
    if (rawHasAnalysis(raw) && !sanitized.workspace?.analysis) await this.putAt(sanitized, now);
    return sanitized;
  }

  async update(id: string, update: LocalDocumentSessionUpdate): Promise<LocalDocumentSessionV1> {
    const now = this.currentTime();
    const current = await this.get(id, now);
    if (!current) throw storeError('not-found');

    let updated: LocalDocumentSessionV1;
    try {
      updated = applyLocalDocumentSessionUpdate(current, update, now);
    } catch (error) {
      throw storeError('invalid-record', error);
    }
    await this.put(updated);
    return updated;
  }

  async list(now = this.currentTime()): Promise<LocalDocumentSessionSummary[]> {
    const { summaries } = await this.reconcileSummaries(now);
    return summaries.sort((left, right) => right.createdAt - left.createdAt);
  }

  async delete(id: string): Promise<void> {
    await this.deleteKey(id);
  }

  private async deleteKey(key: IDBValidKey): Promise<void> {
    await this.runAtomicSessionAndSummary((sessions, summaries) => [
      sessions.delete(key),
      summaries.delete(key),
    ]);
  }

  async deleteExpired(now = this.currentTime()): Promise<number> {
    if (!nowIsValid(now)) throw storeError('invalid-record');
    if (!this.keyRange) throw storeError('unavailable');

    try {
      this.keyRange.upperBound(now);
    } catch (error) {
      throw storeError('request', error);
    }

    return (await this.reconcileSummaries(now)).deleted;
  }

  private async reconcileSummaries(now: number): Promise<{
    summaries: LocalDocumentSessionSummary[];
    deleted: number;
  }> {
    if (!nowIsValid(now)) throw storeError('invalid-record');
    const database = await this.database();

    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(
          [LOCAL_DOCUMENT_STORE_NAME, LOCAL_DOCUMENT_SUMMARY_STORE_NAME],
          'readwrite',
        );
      } catch (error) {
        reject(storeError('transaction', error));
        return;
      }

      const summariesByKey = new Map<IDBValidKey, LocalDocumentSessionSummary>();
      const invalidSummaryKeys = new Set<IDBValidKey>();
      let sessionKeys: IDBValidKey[] | null = null;
      let summaryCursorDone = false;
      let reconciled = false;
      let deleted = 0;
      let resultSummaries: LocalDocumentSessionSummary[] = [];
      let settled = false;

      const fail = (code: 'request' | 'transaction', cause?: unknown) => {
        if (settled) return;
        settled = true;
        reject(storeError(code, cause));
      };
      const abortAndFail = (cause: unknown) => {
        try {
          transaction.abort();
        } catch {
          // The transaction may already be inactive.
        }
        fail('request', cause);
      };
      const track = (request: IDBRequest) => {
        request.onerror = () => fail('request', request.error);
      };
      const reconcile = () => {
        if (reconciled || !summaryCursorDone || sessionKeys === null) return;
        reconciled = true;

        const sessionKeySet = new Set<IDBValidKey>(sessionKeys);
        const sessionDeletes = new Set<IDBValidKey>();
        const summaryDeletes = new Set<IDBValidKey>(invalidSummaryKeys);

        for (const [key] of summariesByKey) {
          if (sessionKeySet.has(key)) continue;
          summariesByKey.delete(key);
          summaryDeletes.add(key);
        }
        for (const key of sessionKeys) {
          if (!summariesByKey.has(key)) sessionDeletes.add(key);
        }

        deleted = sessionDeletes.size;
        resultSummaries = [...summariesByKey.values()];
        try {
          const sessions = transaction.objectStore(LOCAL_DOCUMENT_STORE_NAME);
          const summaries = transaction.objectStore(LOCAL_DOCUMENT_SUMMARY_STORE_NAME);
          for (const key of sessionDeletes) track(sessions.delete(key));
          for (const key of summaryDeletes) track(summaries.delete(key));
        } catch (error) {
          abortAndFail(error);
        }
      };

      transaction.onerror = () => fail('transaction', transaction.error);
      transaction.onabort = () => fail('transaction', transaction.error);
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve({ summaries: resultSummaries, deleted });
      };

      let keysRequest: IDBRequest<IDBValidKey[]>;
      let cursorRequest: IDBRequest<IDBCursorWithValue | null>;
      try {
        keysRequest = transaction.objectStore(LOCAL_DOCUMENT_STORE_NAME).getAllKeys();
        cursorRequest = transaction.objectStore(LOCAL_DOCUMENT_SUMMARY_STORE_NAME).openCursor();
      } catch (error) {
        abortAndFail(error);
        return;
      }

      track(keysRequest);
      keysRequest.onsuccess = () => {
        sessionKeys = keysRequest.result;
        reconcile();
      };

      track(cursorRequest);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          summaryCursorDone = true;
          reconcile();
          return;
        }
        const summary = sanitizeStoredSummary(cursor.value, now, cursor.primaryKey);
        if (summary) summariesByKey.set(cursor.primaryKey, summary);
        else invalidSummaryKeys.add(cursor.primaryKey);
        try {
          cursor.continue();
        } catch (error) {
          abortAndFail(error);
        }
      };
    });
  }

  private async database(): Promise<IDBDatabase> {
    if (!this.factory) throw storeError('unavailable');
    if (!this.databasePromise) {
      this.databasePromise = this.openDatabase().catch((error: unknown) => {
        this.databasePromise = null;
        throw error;
      });
    }
    return this.databasePromise;
  }

  private async openDatabase(): Promise<IDBDatabase> {
    const factory = this.factory;
    if (!factory) throw storeError('unavailable');

    return new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(LOCAL_DOCUMENT_DB_NAME, LOCAL_DOCUMENT_DB_VERSION);
      } catch (error) {
        reject(storeError('request', error));
        return;
      }

      let settled = false;
      const fail = (error: LocalDocumentSessionStoreError) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      request.onblocked = () => fail(storeError('blocked'));
      request.onerror = () => fail(storeError('request', request.error));
      request.onupgradeneeded = (event) => {
        const transaction = request.transaction;
        if (!transaction) {
          fail(storeError('transaction'));
          return;
        }
        const abortUpgrade = (cause: unknown) => {
          try {
            transaction.abort();
          } catch {
            // The versionchange transaction may already be inactive.
          }
          fail(storeError('transaction', cause));
        };

        try {
          const database = request.result;
          const sessions = database.objectStoreNames.contains(LOCAL_DOCUMENT_STORE_NAME)
            ? transaction.objectStore(LOCAL_DOCUMENT_STORE_NAME)
            : database.createObjectStore(LOCAL_DOCUMENT_STORE_NAME, { keyPath: 'id' });
          if (!sessions.indexNames.contains(LOCAL_DOCUMENT_EXPIRY_INDEX)) {
            sessions.createIndex(LOCAL_DOCUMENT_EXPIRY_INDEX, 'expiresAt');
          }

          const summaries = database.objectStoreNames.contains(LOCAL_DOCUMENT_SUMMARY_STORE_NAME)
            ? transaction.objectStore(LOCAL_DOCUMENT_SUMMARY_STORE_NAME)
            : database.createObjectStore(LOCAL_DOCUMENT_SUMMARY_STORE_NAME, { keyPath: 'id' });
          if (!summaries.indexNames.contains(LOCAL_DOCUMENT_SUMMARY_EXPIRY_INDEX)) {
            summaries.createIndex(LOCAL_DOCUMENT_SUMMARY_EXPIRY_INDEX, 'expiresAt');
          }
          if (event.oldVersion >= 2) return;

          const migrationNow = this.currentTime();
          if (!nowIsValid(migrationNow)) {
            abortUpgrade(storeError('invalid-record'));
            return;
          }

          const cursorRequest = sessions.openCursor();
          cursorRequest.onerror = () => abortUpgrade(cursorRequest.error);
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;

            const raw = cursor.value;
            const summary = summarizeStoredLocalDocumentSession(raw, migrationNow);
            if (summary && cursor.primaryKey === summary.id) {
              const summaryPut = summaries.put(summary);
              summaryPut.onerror = () => abortUpgrade(summaryPut.error);
            } else {
              const deletion = cursor.delete();
              deletion.onerror = () => abortUpgrade(deletion.error);
            }
            try {
              cursor.continue();
            } catch (error) {
              abortUpgrade(error);
            }
          };
        } catch (error) {
          abortUpgrade(error);
        }
      };
      request.onsuccess = () => {
        if (settled) {
          request.result.close();
          return;
        }
        settled = true;
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
    });
  }

  private async runAtomicSessionAndSummary(
    operation: (
      sessions: IDBObjectStore,
      summaries: IDBObjectStore,
    ) => readonly IDBRequest[],
  ): Promise<void> {
    const database = await this.database();

    return new Promise<void>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(
          [LOCAL_DOCUMENT_STORE_NAME, LOCAL_DOCUMENT_SUMMARY_STORE_NAME],
          'readwrite',
        );
      } catch (error) {
        reject(storeError('transaction', error));
        return;
      }

      let settled = false;
      const fail = (code: 'request' | 'transaction', cause?: unknown) => {
        if (settled) return;
        settled = true;
        reject(storeError(code, cause));
      };

      transaction.onerror = () => fail('transaction', transaction.error);
      transaction.onabort = () => fail('transaction', transaction.error);
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      let requests: readonly IDBRequest[];
      try {
        requests = operation(
          transaction.objectStore(LOCAL_DOCUMENT_STORE_NAME),
          transaction.objectStore(LOCAL_DOCUMENT_SUMMARY_STORE_NAME),
        );
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already be inactive.
        }
        fail('request', error);
        return;
      }
      for (const request of requests) {
        request.onerror = () => fail('request', request.error);
      }
    });
  }

  private async runRequest<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const database = await this.database();

    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(LOCAL_DOCUMENT_STORE_NAME, mode);
      } catch (error) {
        reject(storeError('transaction', error));
        return;
      }

      let settled = false;
      let result: T;
      const fail = (code: 'request' | 'transaction', cause?: unknown) => {
        if (settled) return;
        settled = true;
        reject(storeError(code, cause));
      };

      transaction.onerror = () => fail('transaction', transaction.error);
      transaction.onabort = () => fail('transaction', transaction.error);
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      let request: IDBRequest<T>;
      try {
        request = operation(transaction.objectStore(LOCAL_DOCUMENT_STORE_NAME));
      } catch (error) {
        fail('request', error);
        return;
      }
      request.onerror = () => fail('request', request.error);
      request.onsuccess = () => {
        result = request.result;
      };
    });
  }
}
