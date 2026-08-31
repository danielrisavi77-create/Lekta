import { describe, expect, it, vi } from 'vitest';
import type { IntakeOk } from '../src/docx/intake-gate';
import { docxCapability } from '../src/repair/docx-budget';
import {
  LOCAL_DOCUMENT_SCHEMA_VERSION,
  LOCAL_DOCUMENT_TTL_MS,
  createLocalDocumentSession,
  fileFromLocalDocumentSession,
  isLocalDocumentSessionId,
  parseSessionFragment,
  sanitizeLocalDocumentSession,
  sessionFragment,
  type LocalDocumentSessionUpdate,
  type LocalDocumentSessionV1,
} from '../src/session/local-document-session';
import {
  LOCAL_DOCUMENT_DB_NAME,
  LOCAL_DOCUMENT_DB_VERSION,
  LOCAL_DOCUMENT_EXPIRY_INDEX,
  LOCAL_DOCUMENT_STORE_NAME,
  IndexedDbDocumentSessionStore,
  LocalDocumentSessionStoreError,
  MemoryDocumentSessionStore,
} from '../src/session/indexeddb-document-session-store';

const SESSION_ID = '8f55d977-3b42-4f00-98b5-9bb4e58db314';
const SECOND_SESSION_ID = 'e35ddf1d-8162-4c0d-a18a-81ed3dc12163';
const THIRD_SESSION_ID = '393a774e-8670-4463-a8d2-e8a68247d22c';
const CREATED_AT = Date.UTC(2026, 7, 24, 9, 0, 0);
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SUMMARY_STORE_NAME = 'session-summaries';
const SUMMARY_EXPIRY_INDEX = 'expiresAt';

const intake: IntakeOk = {
  kind: 'ok',
  quickStats: { words: 1_234, pages: 8 },
  suspicious: false,
  suspicionReason: null,
  capability: {
    canAnalyze: true,
    canRepair: true,
    totalDeclaredBytes: 32_768,
    entryCount: 12,
    repairBlocker: null,
  },
};

function validAnalysisPayload() {
  return {
    version: '2.2.1-fpzg-full-submission',
    generatedAt: '2026-08-24T09:01:00.000Z',
    file: { name: 'rad.docx', size: 4 },
    score: 87,
    checks: [],
    issues: [],
  };
}

function makeSession(
  id = SESSION_ID,
  overrides: Partial<LocalDocumentSessionV1> = {},
): LocalDocumentSessionV1 {
  return {
    schemaVersion: LOCAL_DOCUMENT_SCHEMA_VERSION,
    id,
    createdAt: CREATED_AT,
    expiresAt: CREATED_AT + LOCAL_DOCUMENT_TTL_MS,
    document: {
      name: 'rad.docx',
      type: DOCX_TYPE,
      lastModified: CREATED_AT - 1_000,
      bytes: new Uint8Array([1, 2, 3, 4]).buffer,
    },
    intake,
    ...overrides,
  };
}

describe('model lokalne dokumentne sesije', () => {
  it('stvara V1 zapis preko randomUUID i rekonstruira ekvivalentan File', async () => {
    const randomUUID = vi.fn(() => SESSION_ID);
    const original = new File([new Uint8Array([7, 8, 9])], 'Moj rad.docx', {
      type: DOCX_TYPE,
      lastModified: CREATED_AT - 500,
    });

    const session = await createLocalDocumentSession(original, intake, {
      now: CREATED_AT,
      crypto: { randomUUID },
    });

    expect(randomUUID).toHaveBeenCalledOnce();
    expect(session).toMatchObject({
      schemaVersion: 1,
      id: SESSION_ID,
      createdAt: CREATED_AT,
      expiresAt: CREATED_AT + LOCAL_DOCUMENT_TTL_MS,
      document: {
        name: original.name,
        type: original.type,
        lastModified: original.lastModified,
      },
    });
    expect(session.intake.capability).toEqual(intake.capability);

    const restored = fileFromLocalDocumentSession(session);
    expect(restored).toBeInstanceOf(File);
    expect(restored.name).toBe(original.name);
    expect(restored.type).toBe(original.type);
    expect(restored.lastModified).toBe(original.lastModified);
    expect([...new Uint8Array(await restored.arrayBuffer())]).toEqual([7, 8, 9]);

    const exposed = new Uint8Array(session.document.bytes);
    exposed[0] = 99;
    expect([...new Uint8Array(await restored.arrayBuffer())]).toEqual([7, 8, 9]);
  });

  it('prihvaća samo kanonski nasumični UUID i točan fragment bez dodatnih podataka', () => {
    expect(isLocalDocumentSessionId(SESSION_ID)).toBe(true);
    expect(isLocalDocumentSessionId(SESSION_ID.toUpperCase())).toBe(false);
    expect(isLocalDocumentSessionId('8f55d977-3b42-1f00-98b5-9bb4e58db314')).toBe(false);
    expect(isLocalDocumentSessionId('8f55d977-3b42-4f00-78b5-9bb4e58db314')).toBe(false);
    expect(isLocalDocumentSessionId(`${SESSION_ID}\n`)).toBe(false);
    expect(isLocalDocumentSessionId('../rad.docx')).toBe(false);

    expect(sessionFragment(SESSION_ID)).toBe(`#session=${SESSION_ID}`);
    expect(parseSessionFragment(`#session=${SESSION_ID}`)).toBe(SESSION_ID);
    expect(parseSessionFragment(`session=${SESSION_ID}`)).toBeNull();
    expect(parseSessionFragment(`?session=${SESSION_ID}`)).toBeNull();
    expect(parseSessionFragment(`#session=${SESSION_ID}&profile=fpzg`)).toBeNull();
    expect(parseSessionFragment(`#profile=fpzg&session=${SESSION_ID}`)).toBeNull();
    expect(parseSessionFragment(`#session=${SESSION_ID}&session=${SECOND_SESSION_ID}`)).toBeNull();
    expect(parseSessionFragment(`#session=${SESSION_ID.toUpperCase()}`)).toBeNull();
    expect(parseSessionFragment(`#session=${SESSION_ID}\n`)).toBeNull();
    expect(() => sessionFragment('rad.docx')).toThrow(TypeError);

    const fragment = sessionFragment(SESSION_ID);
    expect(fragment).not.toContain('rad.docx');
    expect(fragment).not.toContain('fpzg');
    expect(fragment).not.toContain('87');
    expect([...new URLSearchParams(fragment.slice(1)).keys()]).toEqual(['session']);
  });

  it('odbija nepoznatu shemu, oštećen zapis i istek', () => {
    expect(sanitizeLocalDocumentSession({ ...makeSession(), schemaVersion: 2 }, CREATED_AT)).toBeNull();
    expect(sanitizeLocalDocumentSession({ ...makeSession(), document: { name: 'bez-bajtova' } }, CREATED_AT)).toBeNull();
    expect(sanitizeLocalDocumentSession(makeSession(SESSION_ID, { expiresAt: CREATED_AT }), CREATED_AT)).toBeNull();
    expect(sanitizeLocalDocumentSession(makeSession(), CREATED_AT + LOCAL_DOCUMENT_TTL_MS)).toBeNull();
    expect(sanitizeLocalDocumentSession(makeSession(SESSION_ID, {
      expiresAt: CREATED_AT + LOCAL_DOCUMENT_TTL_MS + 1,
    }), CREATED_AT)).toBeNull();
  });

  it('čuva eksplicitni fail-open capability null, a odbija nevaljan blocker', () => {
    const failOpen = makeSession(SESSION_ID, {
      intake: { ...intake, capability: null },
    });
    expect(sanitizeLocalDocumentSession(failOpen, CREATED_AT)?.intake.capability).toBeNull();

    const malformed = makeSession(SESSION_ID, {
      intake: {
        ...intake,
        capability: {
          ...intake.capability!,
          repairBlocker: 'nepoznat-blocker',
        } as IntakeOk['capability'],
      },
    });
    expect(sanitizeLocalDocumentSession(malformed, CREATED_AT)).toBeNull();

    // Unakrsni invarijanti: capability koji sam sebi protuslovi NIKAD ne smije preživjeti
    // pohranu, inače bi sučelje ponudilo popravak koji server odbija (i obrnuto).
    const contradictory: Array<Partial<NonNullable<IntakeOk['capability']>>> = [
      { canRepair: true, repairBlocker: 'decompresses-too-large' },
      { canRepair: false, repairBlocker: null },
      { canAnalyze: false, canRepair: true, repairBlocker: null },
    ];
    for (const override of contradictory) {
      const session = makeSession(SESSION_ID, {
        intake: { ...intake, capability: { ...intake.capability!, ...override } },
      });
      expect(sanitizeLocalDocumentSession(session, CREATED_AT)).toBeNull();
    }
  });

  it('prihvaća svaku procjenu koju docxCapability stvarno proizvede, uključujući nulirani central directory', () => {
    // Neispravan ili ručno složen paket može u central directoryju deklarirati nulu (pravi
    // pisci to ne rade, ni kad koriste data descriptore: tada je nulirano samo LOKALNO
    // zaglavlje, a central directory nosi točne veličine). Validator uži od svog JEDINOG
    // proizvođača bacio bi cijelu sesiju, dakle i bajtove dokumenta, zbog kozmetičke brojke.
    const nulirani = docxCapability({ fileBytes: 5_000, entryCount: 5, totalDeclaredBytes: 0 });
    expect(nulirani).toMatchObject({ canAnalyze: true, canRepair: true, repairBlocker: null, totalDeclaredBytes: 0 });

    for (const proizvedena of [
      nulirani,
      docxCapability({ fileBytes: 5_000, entryCount: 0, totalDeclaredBytes: 0 }),
      docxCapability({ fileBytes: 5_000, entryCount: 12, totalDeclaredBytes: 32_768 }),
      docxCapability({ fileBytes: 21 * 1024 * 1024, entryCount: 12, totalDeclaredBytes: 32_768 }),
      docxCapability({ fileBytes: 5_000, entryCount: 9_999, totalDeclaredBytes: 32_768 }),
      docxCapability({ fileBytes: 5_000, entryCount: 12, totalDeclaredBytes: 65 * 1024 * 1024 }),
    ]) {
      const session = makeSession(SESSION_ID, { intake: { ...intake, capability: proizvedena } });
      expect(sanitizeLocalDocumentSession(session, CREATED_AT)?.intake.capability).toEqual(proizvedena);
    }

    // Popuštanje ide do nule, ne dalje: negativno i necjelobrojno i dalje pada.
    for (const override of [
      { totalDeclaredBytes: -1 },
      { entryCount: -1 },
      { totalDeclaredBytes: 1.5 },
      { entryCount: Number.NaN },
    ]) {
      const session = makeSession(SESSION_ID, {
        intake: { ...intake, capability: { ...intake.capability!, ...override } },
      });
      expect(sanitizeLocalDocumentSession(session, CREATED_AT)).toBeNull();
    }
  });

  it('uklanja samo nevaljan analysis snapshot, a čuva dokument i potvrđeni profil', () => {
    const profile = {
      profileDefinitionId: 'fpzg-politologija-diplomski',
      selectionIds: { unit: 'fpzg', workType: 'graduate' },
      confirmedAt: CREATED_AT + 100,
    };
    const base = makeSession(SESSION_ID, {
      profile,
      workspace: {
        stage: 'results',
        selectedFindingId: 'finding-1',
        analysis: {
          schemaVersion: 2 as 1,
          createdAt: CREATED_AT + 200,
          payload: { score: 87 },
        },
      },
    });

    const sanitized = sanitizeLocalDocumentSession(base, CREATED_AT + 500);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.profile).toEqual(profile);
    expect(sanitized?.workspace).toEqual({
      stage: 'results',
      selectedFindingId: 'finding-1',
    });
    expect([...new Uint8Array(sanitized!.document.bytes)]).toEqual([1, 2, 3, 4]);

    const minimallyInvalid = makeSession(SESSION_ID, {
      profile,
      workspace: {
        stage: 'results',
        analysis: { schemaVersion: 1, createdAt: CREATED_AT + 200, payload: { score: 87 } },
      },
    });
    expect(sanitizeLocalDocumentSession(minimallyInvalid, CREATED_AT + 500)?.workspace).toEqual({ stage: 'results' });

    const valid = makeSession(SESSION_ID, {
      profile,
      workspace: {
        stage: 'results',
        analysis: { schemaVersion: 1, createdAt: CREATED_AT + 200, payload: validAnalysisPayload() },
      },
    });
    expect(sanitizeLocalDocumentSession(valid, CREATED_AT + 500)?.workspace?.analysis?.payload).toEqual(validAnalysisPayload());
  });
});

describe('MemoryDocumentSessionStore', () => {
  it('ima isti store ugovor, ali izričito je tab-only i nije trajna pohrana', async () => {
    let now = CREATED_AT;
    const store = new MemoryDocumentSessionStore({ now: () => now });

    expect(store.storageInfo).toEqual({ kind: 'memory', persistent: false, scope: 'tab' });
    await store.put(makeSession());
    const restored = await store.get(SESSION_ID);
    expect(restored?.id).toBe(SESSION_ID);

    new Uint8Array(restored!.document.bytes)[0] = 99;
    expect([...new Uint8Array((await store.get(SESSION_ID))!.document.bytes)]).toEqual([1, 2, 3, 4]);

    now += 1;
    await store.delete(SESSION_ID);
    expect(await store.get(SESSION_ID)).toBeNull();
  });

  it('get briše istekli zapis, deleteExpired je idempotentan, a list vraća samo sažetke', async () => {
    let now = CREATED_AT;
    const store = new MemoryDocumentSessionStore({ now: () => now });
    await store.put(makeSession());
    await store.put(makeSession(SECOND_SESSION_ID, { createdAt: CREATED_AT + 1_000, expiresAt: CREATED_AT + 2_000 }));

    const summaries = await store.list(CREATED_AT + 1_500);
    expect(summaries).toHaveLength(2);
    expect(Object.keys(summaries[0]!).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'name', 'stage']);
    expect(JSON.stringify(summaries)).not.toContain('quickStats');
    expect(JSON.stringify(summaries)).not.toContain('selectionIds');
    expect(JSON.stringify(summaries)).not.toContain('analysis');
    expect(JSON.stringify(summaries)).not.toContain('bytes');

    now = CREATED_AT + 2_000;
    expect(await store.get(SECOND_SESSION_ID)).toBeNull();
    expect((await store.list()).map((item) => item.id)).toEqual([SESSION_ID]);

    now = CREATED_AT + LOCAL_DOCUMENT_TTL_MS;
    expect(await store.deleteExpired()).toBe(1);
    expect(await store.deleteExpired()).toBe(0);
    expect(await store.list()).toEqual([]);
  });

  it('deleteExpired uklanja corrupt expiresAt i u memory fallbacku', async () => {
    const store = new MemoryDocumentSessionStore({ now: () => CREATED_AT + 1_000 });
    const records = (store as unknown as { records: Map<string, unknown> }).records;
    records.set(SESSION_ID, {
      ...makeSession(),
      expiresAt: 'sutra',
    });

    await expect(store.deleteExpired()).resolves.toBe(1);
    expect(records.size).toBe(0);
  });

  it('update ne mijenja identitet, dokument ni createdAt i ne produljuje apsolutni rok', async () => {
    const store = new MemoryDocumentSessionStore({ now: () => CREATED_AT + 10_000 });
    const original = makeSession();
    await store.put(original);

    const maliciousUpdate = {
      id: SECOND_SESSION_ID,
      createdAt: CREATED_AT + 500_000,
      expiresAt: CREATED_AT + LOCAL_DOCUMENT_TTL_MS * 2,
      document: {
        name: 'zamijenjen.docx',
        type: 'text/plain',
        lastModified: 0,
        bytes: new Uint8Array([9, 9, 9]).buffer,
      },
      profile: {
        profileDefinitionId: 'fpzg',
        selectionIds: { unit: 'fpzg' },
        confirmedAt: CREATED_AT + 10_000,
      },
      workspace: { stage: 'results' },
    } as unknown as LocalDocumentSessionUpdate;

    const updated = await store.update(SESSION_ID, maliciousUpdate);
    expect(updated.id).toBe(SESSION_ID);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.expiresAt).toBe(original.createdAt + LOCAL_DOCUMENT_TTL_MS);
    expect(updated.document.name).toBe('rad.docx');
    expect([...new Uint8Array(updated.document.bytes)]).toEqual([1, 2, 3, 4]);
    expect(updated.profile?.profileDefinitionId).toBe('fpzg');
    expect(updated.workspace?.stage).toBe('results');
  });

  it('na store granici čuva sesiju kada je nevaljan samo analysis snapshot', async () => {
    const store = new MemoryDocumentSessionStore({ now: () => CREATED_AT + 1_000 });
    const session = makeSession(SESSION_ID, {
      profile: {
        profileDefinitionId: 'fpzg',
        selectionIds: { unit: 'fpzg' },
        confirmedAt: CREATED_AT + 100,
      },
      workspace: {
        stage: 'results',
        analysis: { schemaVersion: 9 as 1, createdAt: CREATED_AT + 200, payload: null },
      },
    });

    await store.put(session);
    const restored = await store.get(SESSION_ID);
    expect(restored?.document.name).toBe('rad.docx');
    expect(restored?.profile?.profileDefinitionId).toBe('fpzg');
    expect(restored?.workspace).toEqual({ stage: 'results' });
  });
});

type FakeFailure =
  | 'open'
  | 'blocked'
  | 'quota'
  | 'request'
  | 'transaction'
  | 'transaction-error'
  | 'transaction-abort';

class FakeRequest<T> {
  result!: T;
  error: DOMException | null = null;
  onsuccess: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
}

class FakeOpenRequest extends FakeRequest<FakeDatabase> {
  onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null = null;
  onblocked: ((event: Event) => void) | null = null;
  transaction: FakeTransaction | null = null;
}

type FakeStoreName = typeof LOCAL_DOCUMENT_STORE_NAME | typeof SUMMARY_STORE_NAME;

function cloneRecordMap(records: Map<IDBValidKey, unknown>): Map<IDBValidKey, unknown> {
  return new Map(
    [...records.entries()].map(([key, value]) => [structuredClone(key), structuredClone(value)]),
  );
}

interface FakeDatabaseSnapshot {
  readonly version: number;
  readonly stores: Set<FakeStoreName>;
  readonly indexes: Map<FakeStoreName, Map<string, string>>;
  readonly records: Map<IDBValidKey, unknown>;
  readonly summaries: Map<IDBValidKey, unknown>;
}

class FakeTransaction {
  error: DOMException | null = null;
  oncomplete: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onabort: ((event: Event) => void) | null = null;
  private readonly stagedRecords = new Map<FakeStoreName, Map<IDBValidKey, unknown>>();
  private readonly completionListeners: Array<() => void> = [];
  private readonly abortListeners: Array<() => void> = [];
  private pendingRequests = 0;
  private completionQueued = false;
  private finished = false;

  constructor(
    private readonly database: FakeDatabase,
    readonly mode: IDBTransactionMode,
    private readonly scope: FakeStoreName[],
  ) {
    this.scheduleCompletion();
  }

  objectStore(name: string): FakeObjectStore {
    if (!this.database.hasStore(name)) throw new DOMException('Store ne postoji', 'NotFoundError');
    if (this.mode !== 'versionchange' && !this.scope.includes(name as FakeStoreName)) {
      throw new DOMException('Store nije u opsegu transakcije', 'NotFoundError');
    }
    return new FakeObjectStore(this.database, this, name as FakeStoreName);
  }

  records(name: FakeStoreName): Map<IDBValidKey, unknown> {
    if (this.mode === 'readonly') return this.database.recordsFor(name);
    const existing = this.stagedRecords.get(name);
    if (existing) return existing;
    const staged = cloneRecordMap(this.database.recordsFor(name));
    this.stagedRecords.set(name, staged);
    return staged;
  }

  beginRequest(): void {
    if (this.finished) throw new DOMException('Transakcija je zavrsena', 'TransactionInactiveError');
    this.pendingRequests += 1;
  }

  finishRequest(): void {
    this.pendingRequests -= 1;
    this.scheduleCompletion();
  }

  failRequest(error: DOMException): void {
    if (this.finished) return;
    this.pendingRequests = Math.max(0, this.pendingRequests - 1);
    this.error = error;
    this.finished = true;
    queueMicrotask(() => {
      this.onerror?.(new Event('error'));
      this.onabort?.(new Event('abort'));
      for (const listener of this.abortListeners) listener();
    });
  }

  abort(): void {
    if (this.finished) throw new DOMException('Transakcija je zavrsena', 'InvalidStateError');
    this.error = new DOMException('Transakcija je prekinuta', 'AbortError');
    this.finished = true;
    queueMicrotask(() => {
      this.onabort?.(new Event('abort'));
      for (const listener of this.abortListeners) listener();
    });
  }

  addCompletionListener(listener: () => void): void {
    this.completionListeners.push(listener);
  }

  addAbortListener(listener: () => void): void {
    this.abortListeners.push(listener);
  }

  complete(): void {
    this.scheduleCompletion();
  }

  private scheduleCompletion(): void {
    if (this.finished || this.completionQueued) return;
    this.completionQueued = true;
    queueMicrotask(() => {
      this.completionQueued = false;
      if (this.finished || this.pendingRequests > 0) return;
      if (this.mode !== 'versionchange' && this.database.failure === 'transaction-error') {
        this.error = new DOMException('Transakcijska greska', 'UnknownError');
        this.finished = true;
        this.onerror?.(new Event('error'));
        for (const listener of this.abortListeners) listener();
        return;
      }
      if (this.mode !== 'versionchange' && this.database.failure === 'transaction-abort') {
        this.error = new DOMException('Transakcija je prekinuta', 'AbortError');
        this.finished = true;
        this.onabort?.(new Event('abort'));
        for (const listener of this.abortListeners) listener();
        return;
      }
      for (const [name, records] of this.stagedRecords) {
        this.database.replaceRecords(name, records);
      }
      this.finished = true;
      this.oncomplete?.(new Event('complete'));
      for (const listener of this.completionListeners) listener();
    });
  }
}

class FakeIndex {
  constructor(
    private readonly database: FakeDatabase,
    private readonly transaction: FakeTransaction,
    private readonly storeName: FakeStoreName,
  ) {}

  getAllKeys(range: IDBKeyRange): FakeRequest<IDBValidKey[]> {
    const request = new FakeRequest<IDBValidKey[]>();
    this.transaction.beginRequest();
    const upper = (range as unknown as { upper: number }).upper;
    queueMicrotask(() => {
      request.result = [...this.transaction.records(this.storeName).entries()]
        .filter(([, record]) => Number((record as { expiresAt?: unknown }).expiresAt) <= upper)
        .map(([key]) => key);
      request.onsuccess?.(new Event('success'));
      this.transaction.finishRequest();
    });
    return request;
  }
}

class FakeObjectStore {
  readonly indexNames = {
    contains: (name: string) => this.database.hasIndex(this.storeName, name),
  };

  constructor(
    private readonly database: FakeDatabase,
    private readonly transaction: FakeTransaction,
    private readonly storeName: FakeStoreName,
  ) {}

  createIndex(name: string, keyPath: string): FakeIndex {
    this.database.addIndex(this.storeName, name, keyPath);
    return new FakeIndex(this.database, this.transaction, this.storeName);
  }

  index(name: string): FakeIndex {
    if (!this.database.hasIndex(this.storeName, name)) {
      throw new DOMException('Indeks ne postoji', 'NotFoundError');
    }
    return new FakeIndex(this.database, this.transaction, this.storeName);
  }

  put(value: unknown): FakeRequest<IDBValidKey> {
    const request = new FakeRequest<IDBValidKey>();
    this.transaction.beginRequest();
    queueMicrotask(() => {
      if (this.database.failure === 'quota' || this.database.failPutStore === this.storeName) {
        request.error = new DOMException('Nema prostora', 'QuotaExceededError');
        request.onerror?.(new Event('error'));
        this.transaction.failRequest(request.error);
        return;
      }
      const cloned = structuredClone(value) as { id: IDBValidKey };
      this.transaction.records(this.storeName).set(cloned.id, cloned);
      request.result = cloned.id;
      request.onsuccess?.(new Event('success'));
      this.transaction.finishRequest();
    });
    return request;
  }

  get(key: IDBValidKey): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>();
    this.transaction.beginRequest();
    if (this.storeName === LOCAL_DOCUMENT_STORE_NAME) {
      this.database.sessionGetReads += 1;
    }
    queueMicrotask(() => {
      if (this.database.failure === 'request') {
        request.error = new DOMException('Citanje nije uspjelo', 'UnknownError');
        request.onerror?.(new Event('error'));
        this.transaction.failRequest(request.error);
        return;
      }
      request.result = structuredClone(this.transaction.records(this.storeName).get(key));
      request.onsuccess?.(new Event('success'));
      this.transaction.finishRequest();
    });
    return request;
  }

  getAll(): FakeRequest<unknown[]> {
    const request = new FakeRequest<unknown[]>();
    this.transaction.beginRequest();
    if (this.storeName === LOCAL_DOCUMENT_STORE_NAME) {
      this.database.sessionGetAllReads += 1;
    }
    queueMicrotask(() => {
      request.result = [...this.transaction.records(this.storeName).values()]
        .map((record) => structuredClone(record));
      request.onsuccess?.(new Event('success'));
      this.transaction.finishRequest();
    });
    return request;
  }

  getAllKeys(): FakeRequest<IDBValidKey[]> {
    const request = new FakeRequest<IDBValidKey[]>();
    this.transaction.beginRequest();
    queueMicrotask(() => {
      request.result = [...this.transaction.records(this.storeName).keys()]
        .map((key) => structuredClone(key));
      request.onsuccess?.(new Event('success'));
      this.transaction.finishRequest();
    });
    return request;
  }

  openCursor(): FakeRequest<IDBCursorWithValue | null> {
    const request = new FakeRequest<IDBCursorWithValue | null>();
    const entries = [...this.transaction.records(this.storeName).entries()];
    let index = 0;
    this.transaction.beginRequest();
    const emit = () => {
      queueMicrotask(() => {
        if (index >= entries.length) {
          request.result = null;
          request.onsuccess?.(new Event('success'));
          this.transaction.finishRequest();
          return;
        }
        const [key, value] = entries[index]!;
        let cursorValueIsCurrent = true;
        const cursor = {
          key,
          primaryKey: key,
          delete: () => {
            const deletion = new FakeRequest<undefined>();
            this.transaction.beginRequest();
            queueMicrotask(() => {
              this.transaction.records(this.storeName).delete(key);
              deletion.result = undefined;
              deletion.onsuccess?.(new Event('success'));
              this.transaction.finishRequest();
            });
            return deletion;
          },
          continue: () => {
            cursorValueIsCurrent = false;
            index += 1;
            emit();
          },
        } as unknown as IDBCursorWithValue;
        Object.defineProperty(cursor, 'value', {
          configurable: true,
          enumerable: true,
          get: () => {
            if (this.storeName === LOCAL_DOCUMENT_STORE_NAME) {
              this.database.sessionCursorValueReads += 1;
            }
            const clonedValue = structuredClone(value);
            return this.database.ephemeralCursorValues
              && typeof clonedValue === 'object'
              && clonedValue !== null
              ? new Proxy(clonedValue, {
                  get(target, property, receiver) {
                    if (!cursorValueIsCurrent) throw new Error('Cursor value retained after continue().');
                    return Reflect.get(target, property, receiver);
                  },
                })
              : clonedValue;
          },
        });
        request.result = cursor;
        request.onsuccess?.(new Event('success'));
      });
    };
    emit();
    return request;
  }

  delete(key: IDBValidKey): FakeRequest<undefined> {
    const request = new FakeRequest<undefined>();
    this.transaction.beginRequest();
    queueMicrotask(() => {
      this.transaction.records(this.storeName).delete(key);
      request.result = undefined;
      request.onsuccess?.(new Event('success'));
      this.transaction.finishRequest();
    });
    return request;
  }
}

class FakeDatabase {
  readonly objectStoreNames = { contains: (name: string) => this.hasStore(name) };
  readonly records = new Map<IDBValidKey, unknown>();
  readonly summaries = new Map<IDBValidKey, unknown>();
  readonly transactionModes: IDBTransactionMode[] = [];
  readonly transactionScopes: FakeStoreName[][] = [];
  ephemeralCursorValues = false;
  failPutStore: FakeStoreName | null = null;
  sessionCursorValueReads = 0;
  sessionGetReads = 0;
  sessionGetAllReads = 0;
  version: number;
  onversionchange: ((event: Event) => void) | null = null;
  private readonly stores = new Set<FakeStoreName>();
  private readonly indexes = new Map<FakeStoreName, Map<string, string>>();
  private upgradeTransaction: FakeTransaction | null = null;

  constructor(readonly failure?: FakeFailure, initialVersion = 0) {
    this.version = initialVersion;
    if (initialVersion >= 1) this.installV1Schema();
  }

  get storeCreated(): boolean {
    return this.hasStore(LOCAL_DOCUMENT_STORE_NAME);
  }

  get summaryStoreCreated(): boolean {
    return this.hasStore(SUMMARY_STORE_NAME);
  }

  get indexCreated(): boolean {
    return this.hasIndex(LOCAL_DOCUMENT_STORE_NAME, LOCAL_DOCUMENT_EXPIRY_INDEX);
  }

  get summaryIndexCreated(): boolean {
    return this.hasIndex(SUMMARY_STORE_NAME, SUMMARY_EXPIRY_INDEX);
  }

  hasStore(name: string): boolean {
    return this.stores.has(name as FakeStoreName);
  }

  hasIndex(storeName: FakeStoreName, name: string): boolean {
    return this.indexes.get(storeName)?.has(name) ?? false;
  }

  addIndex(storeName: FakeStoreName, name: string, keyPath: string): void {
    if (!this.hasStore(storeName)) throw new DOMException('Store ne postoji', 'NotFoundError');
    const indexes = this.indexes.get(storeName) ?? new Map<string, string>();
    indexes.set(name, keyPath);
    this.indexes.set(storeName, indexes);
  }

  recordsFor(name: FakeStoreName): Map<IDBValidKey, unknown> {
    return name === LOCAL_DOCUMENT_STORE_NAME ? this.records : this.summaries;
  }

  replaceRecords(name: FakeStoreName, records: Map<IDBValidKey, unknown>): void {
    const target = this.recordsFor(name);
    target.clear();
    for (const [key, value] of records) target.set(key, value);
  }

  snapshot(): FakeDatabaseSnapshot {
    return {
      version: this.version,
      stores: new Set(this.stores),
      indexes: new Map(
        [...this.indexes.entries()].map(([storeName, indexes]) => [
          storeName,
          new Map(indexes),
        ]),
      ),
      records: cloneRecordMap(this.records),
      summaries: cloneRecordMap(this.summaries),
    };
  }

  restore(snapshot: FakeDatabaseSnapshot): void {
    this.version = snapshot.version;
    this.stores.clear();
    for (const storeName of snapshot.stores) this.stores.add(storeName);
    this.indexes.clear();
    for (const [storeName, indexes] of snapshot.indexes) {
      this.indexes.set(storeName, new Map(indexes));
    }
    this.replaceRecords(LOCAL_DOCUMENT_STORE_NAME, snapshot.records);
    this.replaceRecords(SUMMARY_STORE_NAME, snapshot.summaries);
  }

  beginUpgrade(transaction: FakeTransaction): void {
    this.upgradeTransaction = transaction;
  }

  endUpgrade(): void {
    this.upgradeTransaction = null;
  }

  createObjectStore(name: string, options?: IDBObjectStoreParameters): FakeObjectStore {
    if (!this.upgradeTransaction) throw new DOMException('Nema upgrade transakcije', 'InvalidStateError');
    if (name !== LOCAL_DOCUMENT_STORE_NAME && name !== SUMMARY_STORE_NAME) {
      throw new DOMException('Nepoznat store', 'NotSupportedError');
    }
    if (options?.keyPath !== 'id') throw new DOMException('Pogresan keyPath', 'DataError');
    const storeName = name as FakeStoreName;
    this.stores.add(storeName);
    this.indexes.set(storeName, new Map());
    return new FakeObjectStore(this, this.upgradeTransaction, storeName);
  }

  transaction(name: string | string[], mode: IDBTransactionMode): FakeTransaction {
    if (this.failure === 'transaction') throw new DOMException('Transakcija nije dostupna', 'InvalidStateError');
    const scope = (Array.isArray(name) ? name : [name]) as FakeStoreName[];
    for (const storeName of scope) {
      if (!this.hasStore(storeName)) throw new DOMException('Store ne postoji', 'NotFoundError');
    }
    this.transactionModes.push(mode);
    this.transactionScopes.push([...scope]);
    return new FakeTransaction(this, mode, scope);
  }

  close(): void {}

  private installV1Schema(): void {
    this.stores.add(LOCAL_DOCUMENT_STORE_NAME);
    this.indexes.set(
      LOCAL_DOCUMENT_STORE_NAME,
      new Map([[LOCAL_DOCUMENT_EXPIRY_INDEX, 'expiresAt']]),
    );
  }
}

class FakeIndexedDbFactory {
  readonly database: FakeDatabase;
  openedWith: { name: string; version: number } | null = null;

  constructor(private readonly failure?: FakeFailure, initialVersion = 0) {
    this.database = new FakeDatabase(failure, initialVersion);
  }

  open(name: string, version?: number): FakeOpenRequest {
    const requestedVersion = version ?? Math.max(1, this.database.version);
    this.openedWith = { name, version: requestedVersion };
    const request = new FakeOpenRequest();
    queueMicrotask(() => {
      if (this.failure === 'blocked') {
        request.onblocked?.(new Event('blocked'));
        return;
      }
      if (this.failure === 'open') {
        request.error = new DOMException('Otvaranje nije uspjelo', 'UnknownError');
        request.onerror?.(new Event('error'));
        return;
      }
      if (requestedVersion < this.database.version) {
        request.error = new DOMException('Verzija je prestara', 'VersionError');
        request.onerror?.(new Event('error'));
        return;
      }
      request.result = this.database;
      if (requestedVersion === this.database.version) {
        request.onsuccess?.(new Event('success'));
        return;
      }

      const oldVersion = this.database.version;
      const upgradeSnapshot = this.database.snapshot();
      const transaction = new FakeTransaction(this.database, 'versionchange', []);
      request.transaction = transaction;
      this.database.beginUpgrade(transaction);
      transaction.addCompletionListener(() => {
        this.database.version = requestedVersion;
        this.database.endUpgrade();
        request.transaction = null;
        request.onsuccess?.(new Event('success'));
      });
      transaction.addAbortListener(() => {
        this.database.restore(upgradeSnapshot);
        this.database.endUpgrade();
        request.error = transaction.error;
        request.onerror?.(new Event('error'));
      });
      request.onupgradeneeded?.({
        oldVersion,
        newVersion: requestedVersion,
      } as IDBVersionChangeEvent);
      transaction.complete();
    });
    return request;
  }
}

function fakeKeyRange() {
  return {
    upperBound: (upper: IDBValidKey) => ({ upper }) as IDBKeyRange,
  };
}

describe('IndexedDbDocumentSessionStore', () => {
  it('otvara vlastitu V1 bazu, stvara sessions/expiresAt i koristi eksplicitne transakcije', async () => {
    const fake = new FakeIndexedDbFactory();
    const store = new IndexedDbDocumentSessionStore({
      indexedDB: fake as unknown as IDBFactory,
      keyRange: fakeKeyRange(),
      now: () => CREATED_AT + 1_000,
    });

    expect(store.storageInfo).toEqual({ kind: 'indexeddb', persistent: true, scope: 'browser' });
    await store.put(makeSession());
    expect((await store.get(SESSION_ID))?.id).toBe(SESSION_ID);
    expect((await store.list()).map((item) => item.id)).toEqual([SESSION_ID]);
    await store.update(SESSION_ID, { workspace: { stage: 'results' } });
    expect((await store.get(SESSION_ID))?.workspace?.stage).toBe('results');
    await store.deleteExpired(CREATED_AT + 500);
    await store.delete(SESSION_ID);

    expect(fake.openedWith).toEqual({ name: LOCAL_DOCUMENT_DB_NAME, version: LOCAL_DOCUMENT_DB_VERSION });
    expect(fake.database.storeCreated).toBe(true);
    expect(fake.database.indexCreated).toBe(true);
    expect(fake.database.transactionModes).toContain('readonly');
    expect(fake.database.transactionModes).toContain('readwrite');
  });

  it('na read granici briše cijeli oštećen zapis, ali popravlja samo oštećen analysis', async () => {
    const fake = new FakeIndexedDbFactory();
    const store = new IndexedDbDocumentSessionStore({
      indexedDB: fake as unknown as IDBFactory,
      keyRange: fakeKeyRange(),
      now: () => CREATED_AT + 1_000,
    });

    await store.put(makeSession());
    fake.database.records.set(SECOND_SESSION_ID, { ...makeSession(SECOND_SESSION_ID), schemaVersion: 99 });
    fake.database.records.set(SESSION_ID, makeSession(SESSION_ID, {
      profile: {
        profileDefinitionId: 'fpzg',
        selectionIds: { unit: 'fpzg' },
        confirmedAt: CREATED_AT + 100,
      },
      workspace: {
        stage: 'results',
        analysis: { schemaVersion: 5 as 1, createdAt: CREATED_AT + 200, payload: null },
      },
    }));

    expect(await store.get(SECOND_SESSION_ID)).toBeNull();
    expect(fake.database.records.has(SECOND_SESSION_ID)).toBe(false);
    const repaired = await store.get(SESSION_ID);
    expect(repaired?.profile?.profileDefinitionId).toBe('fpzg');
    expect(repaired?.workspace).toEqual({ stage: 'results' });
    expect((fake.database.records.get(SESSION_ID) as LocalDocumentSessionV1).workspace?.analysis).toBeUndefined();
  });

  it('list briše oštećene zapise po stvarnom primary keyju i kad vrijednost nema valjan UUID', async () => {
    const fake = new FakeIndexedDbFactory();
    const store = new IndexedDbDocumentSessionStore({
      indexedDB: fake as unknown as IDBFactory,
      keyRange: fakeKeyRange(),
      now: () => CREATED_AT + 1_000,
    });

    await store.put(makeSession());
    fake.database.records.set('malformed-key', { ...makeSession(), id: 'nije-uuid' });
    fake.database.records.set(42, { ...makeSession(), id: 42 });
    fake.database.records.set('missing-id-key', { ...makeSession(), id: undefined });

    expect((await store.list()).map((summary) => summary.id)).toEqual([SESSION_ID]);
    expect([...fake.database.records.keys()]).toEqual([SESSION_ID]);
  });

  it('list sazima svaki cursor zapis prije prelaska na sljedeci i cuva sesiju s nevaljanim analysisom', async () => {
    const fake = new FakeIndexedDbFactory();
    fake.database.ephemeralCursorValues = true;
    fake.database.records.set(SESSION_ID, makeSession(SESSION_ID, {
      workspace: {
        stage: 'results',
        analysis: { schemaVersion: 9 as 1, createdAt: CREATED_AT + 200, payload: null },
      },
    }));
    fake.database.records.set(SECOND_SESSION_ID, makeSession(SECOND_SESSION_ID, {
      createdAt: CREATED_AT + 1_000,
      expiresAt: CREATED_AT + LOCAL_DOCUMENT_TTL_MS,
      document: {
        ...makeSession().document,
        name: 'drugi.docx',
      },
    }));
    const store = new IndexedDbDocumentSessionStore({
      indexedDB: fake as unknown as IDBFactory,
      keyRange: fakeKeyRange(),
      now: () => CREATED_AT + 2_000,
    });

    await expect(store.list()).resolves.toEqual([
      {
        id: SECOND_SESSION_ID,
        name: 'drugi.docx',
        createdAt: CREATED_AT + 1_000,
        expiresAt: CREATED_AT + LOCAL_DOCUMENT_TTL_MS,
        stage: 'profile',
      },
      {
        id: SESSION_ID,
        name: 'rad.docx',
        createdAt: CREATED_AT,
        expiresAt: CREATED_AT + LOCAL_DOCUMENT_TTL_MS,
        stage: 'results',
      },
    ]);
    expect(fake.database.records.has(SESSION_ID)).toBe(true);
  });

  it('list ne klonira document.bytes dok proizvodi sazetak', async () => {
    const fake = new FakeIndexedDbFactory();
    fake.database.records.set(SESSION_ID, makeSession());
    const store = new IndexedDbDocumentSessionStore({
      indexedDB: fake as unknown as IDBFactory,
      keyRange: fakeKeyRange(),
      now: () => CREATED_AT + 1_000,
    });
    const slice = vi.spyOn(ArrayBuffer.prototype, 'slice');

    try {
      await expect(store.list()).resolves.toHaveLength(1);
      expect(slice).not.toHaveBeenCalled();
    } finally {
      slice.mockRestore();
    }
  });

  it('deleteExpired brise istekle i zapise bez valjanog expiresAt, a cuva buducu sesiju', async () => {
    const fake = new FakeIndexedDbFactory();
    const store = new IndexedDbDocumentSessionStore({
      indexedDB: fake as unknown as IDBFactory,
      keyRange: fakeKeyRange(),
      now: () => CREATED_AT + 1_000,
    });
    await store.list();

    const future = makeSession();
    const expired = makeSession(SECOND_SESSION_ID, { expiresAt: CREATED_AT + 500 });
    const missingExpiry = {
      ...makeSession(),
      id: 'missing-expiry',
      expiresAt: undefined,
    };
    const invalidExpiry = {
      ...makeSession(),
      id: 'invalid-expiry',
      expiresAt: 'sutra',
    };
    fake.database.records.set(SESSION_ID, future);
    fake.database.records.set(SECOND_SESSION_ID, expired);
    fake.database.records.set('missing-expiry', missingExpiry);
    fake.database.records.set('invalid-expiry', invalidExpiry);
    fake.database.summaries.set(SESSION_ID, {
      id: SESSION_ID,
      name: future.document.name,
      createdAt: future.createdAt,
      expiresAt: future.expiresAt,
      stage: 'profile',
    });
    fake.database.summaries.set(SECOND_SESSION_ID, {
      id: SECOND_SESSION_ID,
      name: expired.document.name,
      createdAt: expired.createdAt,
      expiresAt: expired.expiresAt,
      stage: 'profile',
    });
    fake.database.summaries.set('missing-expiry', {
      id: 'missing-expiry',
      name: 'rad.docx',
      createdAt: CREATED_AT,
      expiresAt: undefined,
      stage: 'profile',
    });
    fake.database.summaries.set('invalid-expiry', {
      id: 'invalid-expiry',
      name: 'rad.docx',
      createdAt: CREATED_AT,
      expiresAt: 'sutra',
      stage: 'profile',
    });

    await expect(store.deleteExpired()).resolves.toBe(3);
    expect([...fake.database.records.keys()]).toEqual([SESSION_ID]);
    expect([...fake.database.summaries.keys()]).toEqual([SESSION_ID]);
  });

  it('sanitizaciju ne pretvara u invalid-record grešku ako sat prijeđe istek nakon read validacije', async () => {
    let currentTime = CREATED_AT + 1_000;
    const fake = new FakeIndexedDbFactory();
    const store = new IndexedDbDocumentSessionStore({
      indexedDB: fake as unknown as IDBFactory,
      keyRange: fakeKeyRange(),
      now: () => currentTime,
    });
    await store.put(makeSession());
    fake.database.records.set(SESSION_ID, makeSession(SESSION_ID, {
      workspace: {
        stage: 'results',
        analysis: { schemaVersion: 8 as 1, createdAt: CREATED_AT + 100, payload: null },
      },
    }));
    currentTime = CREATED_AT + LOCAL_DOCUMENT_TTL_MS;

    await expect(store.get(SESSION_ID, CREATED_AT + 2_000)).resolves.toMatchObject({
      id: SESSION_ID,
      workspace: { stage: 'results' },
    });
    expect((fake.database.records.get(SESSION_ID) as LocalDocumentSessionV1).workspace?.analysis).toBeUndefined();
  });

  it('testni fake registrira svaki sessions.getAll bulk value read', async () => {
    const fake = new FakeIndexedDbFactory();
    const store = new IndexedDbDocumentSessionStore({
      indexedDB: fake as unknown as IDBFactory,
      keyRange: fakeKeyRange(),
      now: () => CREATED_AT + 1_000,
    });
    await store.put(makeSession());
    fake.database.sessionGetAllReads = 0;

    const transaction = fake.database.transaction(LOCAL_DOCUMENT_STORE_NAME, 'readonly');
    const values = await new Promise<unknown[]>((resolve, reject) => {
      let result: unknown[] = [];
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(result);
      const request = transaction.objectStore(LOCAL_DOCUMENT_STORE_NAME).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        result = request.result;
      };
    });

    expect(values).toHaveLength(1);
    expect(fake.database.sessionGetAllReads).toBe(1);
  });

  it('list koristi metadata sidecar bez citanja vrijednosti dokumentnih sesija', async () => {
    const fake = new FakeIndexedDbFactory();
    const store = new IndexedDbDocumentSessionStore({
      indexedDB: fake as unknown as IDBFactory,
      keyRange: fakeKeyRange(),
      now: () => CREATED_AT + 1_000,
    });

    await store.put(makeSession());
    fake.database.sessionCursorValueReads = 0;
    fake.database.sessionGetReads = 0;
    fake.database.sessionGetAllReads = 0;

    await expect(store.list()).resolves.toEqual([{
      id: SESSION_ID,
      name: 'rad.docx',
      createdAt: CREATED_AT,
      expiresAt: CREATED_AT + LOCAL_DOCUMENT_TTL_MS,
      stage: 'profile',
    }]);
    expect(fake.database.sessionCursorValueReads).toBe(0);
    expect(fake.database.sessionGetReads).toBe(0);
    expect(fake.database.sessionGetAllReads).toBe(0);
    expect(fake.database.summaries.has(SESSION_ID)).toBe(true);

    await expect(store.get(SESSION_ID)).resolves.toMatchObject({ id: SESSION_ID });
    expect(fake.database.sessionGetReads).toBe(1);

    await store.delete(SESSION_ID);
    expect(fake.database.records.has(SESSION_ID)).toBe(false);
    expect(fake.database.summaries.has(SESSION_ID)).toBe(false);
  });

  it('deleteExpired cita samo male sidecar zapise i atomski brise obje kopije', async () => {
    let currentTime = CREATED_AT + 100;
    const fake = new FakeIndexedDbFactory();
    const store = new IndexedDbDocumentSessionStore({
      indexedDB: fake as unknown as IDBFactory,
      keyRange: fakeKeyRange(),
      now: () => currentTime,
    });

    await store.put(makeSession());
    await store.put(makeSession(SECOND_SESSION_ID, {
      createdAt: CREATED_AT + 10,
      expiresAt: CREATED_AT + 500,
    }));
    await store.put(makeSession(THIRD_SESSION_ID, {
      createdAt: CREATED_AT + 20,
    }));
    fake.database.summaries.set(THIRD_SESSION_ID, {
      id: THIRD_SESSION_ID,
      name: 'rad.docx',
      createdAt: CREATED_AT + 20,
      expiresAt: 'sutra',
      stage: 'profile',
    });
    currentTime = CREATED_AT + 1_000;
    fake.database.sessionCursorValueReads = 0;
    fake.database.sessionGetReads = 0;
    fake.database.sessionGetAllReads = 0;

    await expect(store.deleteExpired()).resolves.toBe(2);
    expect(fake.database.sessionCursorValueReads).toBe(0);
    expect(fake.database.sessionGetReads).toBe(0);
    expect(fake.database.sessionGetAllReads).toBe(0);
    expect([...fake.database.records.keys()]).toEqual([SESSION_ID]);
    expect([...fake.database.summaries.keys()]).toEqual([SESSION_ID]);
  });

  it('V1 u V2 migracija cita svaki legacy dokument jednom i poslije koristi samo sidecar', async () => {
    const fake = new FakeIndexedDbFactory(undefined, 1);
    fake.database.records.set(SESSION_ID, makeSession());
    fake.database.records.set(SECOND_SESSION_ID, makeSession(SECOND_SESSION_ID, {
      expiresAt: 'sutra' as unknown as number,
    }));
    const store = new IndexedDbDocumentSessionStore({
      indexedDB: fake as unknown as IDBFactory,
      keyRange: fakeKeyRange(),
      now: () => CREATED_AT + 1_000,
    });

    await expect(store.list()).resolves.toEqual([{
      id: SESSION_ID,
      name: 'rad.docx',
      createdAt: CREATED_AT,
      expiresAt: CREATED_AT + LOCAL_DOCUMENT_TTL_MS,
      stage: 'profile',
    }]);
    expect(fake.openedWith).toEqual({ name: LOCAL_DOCUMENT_DB_NAME, version: 2 });
    expect(fake.database.summaryStoreCreated).toBe(true);
    expect(fake.database.summaryIndexCreated).toBe(true);
    expect(fake.database.sessionCursorValueReads).toBe(2);
    expect([...fake.database.records.keys()]).toEqual([SESSION_ID]);
    expect([...fake.database.summaries.keys()]).toEqual([SESSION_ID]);

    fake.database.sessionCursorValueReads = 0;
    fake.database.sessionGetReads = 0;
    fake.database.sessionGetAllReads = 0;
    await expect(store.list()).resolves.toHaveLength(1);
    expect(fake.database.sessionCursorValueReads).toBe(0);
    expect(fake.database.sessionGetReads).toBe(0);
    expect(fake.database.sessionGetAllReads).toBe(0);
  });

  it('neuspjela V1 u V2 migracija rollbacka shemu i uspijeva pri ponovnom otvaranju', async () => {
    const fake = new FakeIndexedDbFactory(undefined, 1);
    fake.database.records.set(SESSION_ID, makeSession());
    fake.database.failPutStore = SUMMARY_STORE_NAME;
    const store = new IndexedDbDocumentSessionStore({
      indexedDB: fake as unknown as IDBFactory,
      keyRange: fakeKeyRange(),
      now: () => CREATED_AT + 1_000,
    });

    await expect(store.list()).rejects.toMatchObject({ code: 'quota' });
    expect(fake.database.version).toBe(1);
    expect(fake.database.summaryStoreCreated).toBe(false);
    expect(fake.database.summaryIndexCreated).toBe(false);
    expect([...fake.database.records.keys()]).toEqual([SESSION_ID]);
    expect(fake.database.summaries.size).toBe(0);

    fake.database.failPutStore = null;
    await expect(store.list()).resolves.toEqual([{
      id: SESSION_ID,
      name: 'rad.docx',
      createdAt: CREATED_AT,
      expiresAt: CREATED_AT + LOCAL_DOCUMENT_TTL_MS,
      stage: 'profile',
    }]);
    expect(fake.database.version).toBe(2);
    expect(fake.database.summaryStoreCreated).toBe(true);
    expect(fake.database.summaryIndexCreated).toBe(true);
  });

  it('put rollbacka sessions zapis kada upis metadata sidecara ne uspije', async () => {
    const fake = new FakeIndexedDbFactory();
    const store = new IndexedDbDocumentSessionStore({
      indexedDB: fake as unknown as IDBFactory,
      keyRange: fakeKeyRange(),
      now: () => CREATED_AT + 1_000,
    });
    await store.list();
    fake.database.failPutStore = SUMMARY_STORE_NAME;

    await expect(store.put(makeSession())).rejects.toMatchObject({ code: 'quota' });
    expect(fake.database.records.size).toBe(0);
    expect(fake.database.summaries.size).toBe(0);
  });

  it.each([
    ['unavailable', undefined, 'unavailable'],
    ['blocked', new FakeIndexedDbFactory('blocked'), 'blocked'],
    ['open', new FakeIndexedDbFactory('open'), 'request'],
    ['quota', new FakeIndexedDbFactory('quota'), 'quota'],
    ['request', new FakeIndexedDbFactory('request'), 'request'],
    ['transaction', new FakeIndexedDbFactory('transaction'), 'transaction'],
    ['transaction error event', new FakeIndexedDbFactory('transaction-error'), 'transaction'],
    ['transaction abort event', new FakeIndexedDbFactory('transaction-abort'), 'transaction'],
  ] as const)('vraća stabilnu tipiziranu grešku za %s bez localStorage fallbacka', async (_label, fake, code) => {
    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const store = new IndexedDbDocumentSessionStore({
      indexedDB: fake as unknown as IDBFactory | undefined,
      keyRange: fakeKeyRange(),
      now: () => CREATED_AT + 1_000,
    });

    const operation = code === 'request'
      ? store.get(SESSION_ID)
      : store.put(makeSession());
    await expect(operation).rejects.toBeInstanceOf(LocalDocumentSessionStoreError);
    await expect(operation).rejects.toMatchObject({ code });
    expect(localStorageSpy).not.toHaveBeenCalled();
    localStorageSpy.mockRestore();
  });
});
