import { describe, expect, it, vi } from 'vitest';
import type { IntakeOk } from '../src/docx/intake-gate';
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
const CREATED_AT = Date.UTC(2026, 7, 24, 9, 0, 0);
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const intake: IntakeOk = {
  kind: 'ok',
  quickStats: { words: 1_234, pages: 8 },
  suspicious: false,
  suspicionReason: null,
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
    expect(isLocalDocumentSessionId('../rad.docx')).toBe(false);

    expect(sessionFragment(SESSION_ID)).toBe(`#session=${SESSION_ID}`);
    expect(parseSessionFragment(`#session=${SESSION_ID}`)).toBe(SESSION_ID);
    expect(parseSessionFragment(`session=${SESSION_ID}`)).toBeNull();
    expect(parseSessionFragment(`?session=${SESSION_ID}`)).toBeNull();
    expect(parseSessionFragment(`#session=${SESSION_ID}&profile=fpzg`)).toBeNull();
    expect(parseSessionFragment(`#profile=fpzg&session=${SESSION_ID}`)).toBeNull();
    expect(parseSessionFragment(`#session=${SESSION_ID}&session=${SECOND_SESSION_ID}`)).toBeNull();
    expect(parseSessionFragment(`#session=${SESSION_ID.toUpperCase()}`)).toBeNull();
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

type FakeFailure = 'open' | 'blocked' | 'quota' | 'request' | 'transaction';

class FakeRequest<T> {
  result!: T;
  error: DOMException | null = null;
  onsuccess: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
}

class FakeOpenRequest extends FakeRequest<FakeDatabase> {
  onupgradeneeded: ((event: IDBVersionChangeEvent) => void) | null = null;
  onblocked: ((event: Event) => void) | null = null;
}

class FakeTransaction {
  error: DOMException | null = null;
  oncomplete: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onabort: ((event: Event) => void) | null = null;

  constructor(
    private readonly database: FakeDatabase,
    readonly mode: IDBTransactionMode,
  ) {}

  objectStore(name: string): FakeObjectStore {
    if (name !== LOCAL_DOCUMENT_STORE_NAME) throw new DOMException('Store ne postoji', 'NotFoundError');
    return new FakeObjectStore(this.database, this);
  }

  complete(): void {
    queueMicrotask(() => this.oncomplete?.(new Event('complete')));
  }
}

class FakeIndex {
  constructor(
    private readonly database: FakeDatabase,
    private readonly transaction: FakeTransaction,
  ) {}

  getAllKeys(range: IDBKeyRange): FakeRequest<IDBValidKey[]> {
    const request = new FakeRequest<IDBValidKey[]>();
    const upper = (range as unknown as { upper: number }).upper;
    queueMicrotask(() => {
      request.result = [...this.database.records.values()]
        .filter((record) => Number((record as { expiresAt?: unknown }).expiresAt) <= upper)
        .map((record) => String((record as { id: unknown }).id));
      request.onsuccess?.(new Event('success'));
      this.transaction.complete();
    });
    return request;
  }
}

class FakeObjectStore {
  readonly indexNames = { contains: (name: string) => this.database.indexCreated && name === LOCAL_DOCUMENT_EXPIRY_INDEX };

  constructor(
    private readonly database: FakeDatabase,
    private readonly transaction: FakeTransaction,
  ) {}

  createIndex(name: string, keyPath: string): FakeIndex {
    this.database.indexCreated = name === LOCAL_DOCUMENT_EXPIRY_INDEX && keyPath === 'expiresAt';
    return new FakeIndex(this.database, this.transaction);
  }

  index(name: string): FakeIndex {
    if (name !== LOCAL_DOCUMENT_EXPIRY_INDEX) throw new DOMException('Indeks ne postoji', 'NotFoundError');
    return new FakeIndex(this.database, this.transaction);
  }

  put(value: unknown): FakeRequest<IDBValidKey> {
    const request = new FakeRequest<IDBValidKey>();
    queueMicrotask(() => {
      if (this.database.failure === 'quota') {
        request.error = new DOMException('Nema prostora', 'QuotaExceededError');
        request.onerror?.(new Event('error'));
        return;
      }
      const cloned = structuredClone(value) as { id: string };
      this.database.records.set(cloned.id, cloned);
      request.result = cloned.id;
      request.onsuccess?.(new Event('success'));
      this.transaction.complete();
    });
    return request;
  }

  get(key: IDBValidKey): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>();
    queueMicrotask(() => {
      if (this.database.failure === 'request') {
        request.error = new DOMException('Čitanje nije uspjelo', 'UnknownError');
        request.onerror?.(new Event('error'));
        return;
      }
      request.result = structuredClone(this.database.records.get(String(key)));
      request.onsuccess?.(new Event('success'));
      this.transaction.complete();
    });
    return request;
  }

  getAll(): FakeRequest<unknown[]> {
    const request = new FakeRequest<unknown[]>();
    queueMicrotask(() => {
      request.result = [...this.database.records.values()].map((record) => structuredClone(record));
      request.onsuccess?.(new Event('success'));
      this.transaction.complete();
    });
    return request;
  }

  delete(key: IDBValidKey): FakeRequest<undefined> {
    const request = new FakeRequest<undefined>();
    queueMicrotask(() => {
      this.database.records.delete(String(key));
      request.result = undefined;
      request.onsuccess?.(new Event('success'));
      this.transaction.complete();
    });
    return request;
  }
}

class FakeDatabase {
  readonly objectStoreNames = { contains: (name: string) => this.storeCreated && name === LOCAL_DOCUMENT_STORE_NAME };
  readonly records = new Map<string, unknown>();
  readonly transactionModes: IDBTransactionMode[] = [];
  storeCreated = false;
  indexCreated = false;
  onversionchange: ((event: Event) => void) | null = null;

  constructor(readonly failure?: FakeFailure) {}

  createObjectStore(name: string, options?: IDBObjectStoreParameters): FakeObjectStore {
    this.storeCreated = name === LOCAL_DOCUMENT_STORE_NAME && options?.keyPath === 'id';
    return new FakeObjectStore(this, new FakeTransaction(this, 'versionchange'));
  }

  transaction(_name: string, mode: IDBTransactionMode): FakeTransaction {
    if (this.failure === 'transaction') throw new DOMException('Transakcija nije dostupna', 'InvalidStateError');
    this.transactionModes.push(mode);
    return new FakeTransaction(this, mode);
  }

  close(): void {}
}

class FakeIndexedDbFactory {
  readonly database: FakeDatabase;
  openedWith: { name: string; version: number } | null = null;

  constructor(private readonly failure?: FakeFailure) {
    this.database = new FakeDatabase(failure);
  }

  open(name: string, version?: number): FakeOpenRequest {
    this.openedWith = { name, version: version ?? 1 };
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
      request.result = this.database;
      request.onupgradeneeded?.({ oldVersion: 0, newVersion: version ?? 1 } as IDBVersionChangeEvent);
      request.onsuccess?.(new Event('success'));
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

  it.each([
    ['unavailable', undefined, 'unavailable'],
    ['blocked', new FakeIndexedDbFactory('blocked'), 'blocked'],
    ['open', new FakeIndexedDbFactory('open'), 'request'],
    ['quota', new FakeIndexedDbFactory('quota'), 'quota'],
    ['request', new FakeIndexedDbFactory('request'), 'request'],
    ['transaction', new FakeIndexedDbFactory('transaction'), 'transaction'],
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
