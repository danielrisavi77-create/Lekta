// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LocalDocumentSessionStore,
  LocalDocumentSessionV1,
} from '../src/session/local-document-session';

const analyzer = vi.hoisted(() => ({
  init: vi.fn(),
  dispose: vi.fn(),
  load: vi.fn(),
  subscribeAccepted: vi.fn(),
  acceptedListener: null as null | ((event: any) => void),
  unsubscribeAccepted: vi.fn(),
}));

vi.mock('../src/ui/app', () => ({
  initAnalyzerApp: analyzer.init,
  disposeAnalyzerApp: analyzer.dispose,
  loadAnalyzerDocument: analyzer.load,
  subscribeAnalyzerDocumentAccepted: analyzer.subscribeAccepted,
}));

import {
  disposeWorkspaceRuntime,
  mountWorkspaceRuntime,
} from '../src/routes/workspace/workspace-runtime';

const sessionId = '123e4567-e89b-42d3-a456-426614174000';
const replacementSessionId = '123e4567-e89b-42d3-a456-426614174001';
const newestSessionId = '123e4567-e89b-42d3-a456-426614174002';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function renderFixture(): void {
  document.body.innerHTML = `
    <main id="main-content" data-workspace-state="restoring">
      <section id="workspace-status" aria-busy="true">
        <h2 data-workspace-status-title>Otvaram dokument</h2>
        <p data-workspace-status-detail>Pricekaj.</p>
      </section>
      <strong data-workspace-document-name>Ucitavanje</strong>
    </main>
  `;
}

function localSession(id = sessionId, name = 'diplomski-rad.docx'): LocalDocumentSessionV1 {
  return {
    schemaVersion: 1,
    id,
    createdAt: 1_000,
    expiresAt: 2_000,
    document: {
      name,
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      lastModified: 900,
      bytes: new Uint8Array([80, 75, 3, 4]).buffer,
    },
    intake: {
      kind: 'ok',
      quickStats: null,
      suspicious: false,
      suspicionReason: null,
      capability: {
        canAnalyze: true,
        canRepair: true,
        totalDeclaredBytes: 4,
        entryCount: 1,
        repairBlocker: null,
      },
    },
  };
}

function localStore(session: LocalDocumentSessionV1 | null = localSession()): LocalDocumentSessionStore {
  return {
    put: vi.fn(async () => undefined),
    get: vi.fn(async () => session),
    update: vi.fn(async () => {
      throw new Error('update nije dio workspace mounta');
    }),
    list: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
    deleteExpired: vi.fn(async () => 0),
  };
}

function state(): string | undefined {
  return document.getElementById('main-content')?.dataset.workspaceState;
}

function statusTitle(): string | null | undefined {
  return document.querySelector('[data-workspace-status-title]')?.textContent;
}

function statusDetail(): string | null | undefined {
  return document.querySelector('[data-workspace-status-detail]')?.textContent;
}

beforeEach(() => {
  analyzer.init.mockReset();
  analyzer.dispose.mockReset();
  analyzer.load.mockReset();
  analyzer.subscribeAccepted.mockReset();
  analyzer.unsubscribeAccepted.mockReset();
  analyzer.acceptedListener = null;
  analyzer.subscribeAccepted.mockImplementation((listener) => {
    analyzer.acceptedListener = listener;
    return analyzer.unsubscribeAccepted;
  });
  analyzer.load.mockResolvedValue({ accepted: true });
  renderFixture();
});

afterEach(() => {
  disposeWorkspaceRuntime(document);
});

describe('workspace runtime', () => {
  it('bez fragmenta ostaje u sigurnom error stanju i ne otvara pohranu', async () => {
    const store = localStore();

    await mountWorkspaceRuntime(document, { fragment: '', store });

    expect(analyzer.init).toHaveBeenCalledWith(document);
    expect(store.deleteExpired).not.toHaveBeenCalled();
    expect(store.get).not.toHaveBeenCalled();
    expect(state()).toBe('error');
    expect(statusTitle()).toBe('Nema aktivnog dokumenta');
  });

  it('missing, expired ili corrupt zapis prikazuje kao neupotrebljivu lokalnu sesiju', async () => {
    const store = localStore(null);

    await mountWorkspaceRuntime(document, { fragment: `#session=${sessionId}`, store });

    expect(store.deleteExpired).toHaveBeenCalledOnce();
    expect(store.get).toHaveBeenCalledWith(sessionId);
    expect(analyzer.load).not.toHaveBeenCalled();
    expect(state()).toBe('error');
    expect(statusTitle()).toMatch(/istekla|o\u0161te\u0107ena|ne postoji/i);
  });

  it('spremno stanje postavlja tek nakon potvrdenog analyzer admissiona', async () => {
    const store = localStore();

    await mountWorkspaceRuntime(document, { fragment: `#session=${sessionId}`, store });

    expect(analyzer.load).toHaveBeenCalledOnce();
    const admission = analyzer.load.mock.calls[0][0];
    expect(admission.source).toBe('workspace-session');
    expect(admission.file).toBeInstanceOf(File);
    expect(admission.file.name).toBe('diplomski-rad.docx');
    expect(document.querySelector('[data-workspace-document-name]')?.textContent).toBe('diplomski-rad.docx');
    expect(state()).toBe('profile');
    expect(statusTitle()).toBe('Dokument je spreman na korektorskom stolu');
  });

  it('odbijeni intake nikada ne prikazuje kao spreman dokument', async () => {
    analyzer.load.mockResolvedValue({
      accepted: false,
      reason: 'intake-rejected',
      message: 'Dokument je premalen za akademski rad.',
    });

    await mountWorkspaceRuntime(document, {
      fragment: `#session=${sessionId}`,
      store: localStore(),
    });

    expect(state()).toBe('error');
    expect(statusTitle()).toBe('Dokument nije prihva\u0107en');
    expect(statusDetail()).toContain('premalen');
    expect(document.querySelector('[data-workspace-document-name]')?.textContent).toBe('Dokument nije aktivan');
  });

  it('nedostupna lokalna pohrana zavrsava u objasnjenom error stanju', async () => {
    const store = localStore();
    vi.mocked(store.deleteExpired).mockRejectedValueOnce(new Error('IndexedDB blocked'));

    await expect(mountWorkspaceRuntime(document, {
      fragment: `#session=${sessionId}`,
      store,
    })).resolves.toBeUndefined();

    expect(analyzer.load).not.toHaveBeenCalled();
    expect(state()).toBe('error');
    expect(statusTitle()).toBe('Lokalnu sesiju nije mogu\u0107e otvoriti');
  });

  it('greska analyzer admissiona ne ostavlja restoring niti lazno ready stanje', async () => {
    analyzer.load.mockRejectedValueOnce(new Error('admission failed'));

    await expect(mountWorkspaceRuntime(document, {
      fragment: `#session=${sessionId}`,
      store: localStore(),
    })).resolves.toBeUndefined();

    expect(state()).toBe('error');
    expect(statusTitle()).toBe('Dokument nije mogu\u0107e otvoriti');
  });

  it('noviji mount zadrzava vlasnistvo kada se stariji restore dovrsi kasnije', async () => {
    const pendingSession = deferred<LocalDocumentSessionV1 | null>();
    const oldStore = localStore();
    vi.mocked(oldStore.get).mockImplementationOnce(() => pendingSession.promise);
    const newerStore = localStore(localSession(replacementSessionId, 'noviji.docx'));

    const oldMount = mountWorkspaceRuntime(document, {
      fragment: '#session=' + sessionId,
      store: oldStore,
    });
    await vi.waitFor(() => expect(oldStore.get).toHaveBeenCalledOnce());

    await mountWorkspaceRuntime(document, {
      fragment: '#session=' + replacementSessionId,
      store: newerStore,
    });
    expect(document.querySelector('[data-workspace-document-name]')?.textContent).toBe('noviji.docx');

    pendingSession.resolve(localSession(sessionId, 'zastarjeli.docx'));
    await oldMount;

    expect(analyzer.load).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-workspace-document-name]')?.textContent).toBe('noviji.docx');
    expect(state()).toBe('profile');
  });

  it('prihvacena zamjena B ponistava zakasnjeli pocetni restore A', async () => {
    const pendingSession = deferred<LocalDocumentSessionV1 | null>();
    const store = localStore();
    vi.mocked(store.get).mockImplementationOnce(() => pendingSession.promise);
    const replacement = localSession(replacementSessionId, 'b.docx');
    const replaceUrl = vi.fn();

    const mounting = mountWorkspaceRuntime(document, {
      fragment: '#session=' + sessionId,
      store,
      createSession: vi.fn(async () => replacement),
      replaceUrl,
    });
    await vi.waitFor(() => expect(store.get).toHaveBeenCalledOnce());

    analyzer.acceptedListener?.({
      file: new File([new Uint8Array([2])], 'b.docx'),
      source: 'user-selection',
      intake: replacement.intake,
    });
    await vi.waitFor(() => expect(replaceUrl).toHaveBeenCalledWith('/rad/#session=' + replacementSessionId));

    pendingSession.resolve(localSession(sessionId, 'a.docx'));
    await mounting;

    expect(analyzer.load).not.toHaveBeenCalled();
    expect(document.querySelector('[data-workspace-document-name]')?.textContent).toBe('b.docx');
    expect(state()).toBe('profile');
  });

  it('dispose prekida runtime ownership i kasni restore vise ne mijenja DOM', async () => {
    const pendingSession = deferred<LocalDocumentSessionV1 | null>();
    const store = localStore();
    vi.mocked(store.get).mockImplementationOnce(() => pendingSession.promise);
    const mounting = mountWorkspaceRuntime(document, {
      fragment: '#session=' + sessionId,
      store,
    });
    await vi.waitFor(() => expect(store.get).toHaveBeenCalledOnce());

    disposeWorkspaceRuntime(document);
    pendingSession.resolve(localSession());
    await mounting;

    expect(analyzer.unsubscribeAccepted).toHaveBeenCalledOnce();
    expect(analyzer.dispose).toHaveBeenCalledWith(document);
    expect(analyzer.load).not.toHaveBeenCalled();
    expect(document.querySelector('[data-workspace-document-name]')?.textContent).toBe('Ucitavanje');
  });

  it('prihvaceni korisnicki dokument atomarno postaje nova kanonska lokalna sesija', async () => {
    const store = localStore();
    const replacement = localSession(replacementSessionId, 'zamjena.docx');
    const createSession = vi.fn(async () => replacement);
    const replaceUrl = vi.fn();
    await mountWorkspaceRuntime(document, {
      fragment: '#session=' + sessionId,
      store,
      createSession,
      replaceUrl,
    });
    vi.mocked(store.put).mockClear();
    vi.mocked(store.delete).mockClear();

    const file = new File([new Uint8Array([80, 75, 3, 4])], 'zamjena.docx');
    analyzer.acceptedListener?.({
      file,
      source: 'user-selection',
      intake: replacement.intake,
    });

    await vi.waitFor(() => expect(store.put).toHaveBeenCalledWith(replacement));
    await vi.waitFor(() => expect(store.delete).toHaveBeenCalledWith(sessionId));
    expect(createSession).toHaveBeenCalledWith(file, replacement.intake);
    expect(replaceUrl).toHaveBeenCalledWith('/rad/#session=' + replacementSessionId);
    expect(document.querySelector('[data-workspace-document-name]')?.textContent).toBe('zamjena.docx');
  });

  it('utrka B pa C objavljuje samo C i cisti i A i zakasnjelu orphan B sesiju', async () => {
    const store = localStore();
    const replacement = localSession(replacementSessionId, 'b.docx');
    const newest = localSession(newestSessionId, 'c.docx');
    const pendingB = deferred<void>();
    vi.mocked(store.put).mockImplementation((value) => (
      value.id === replacementSessionId ? pendingB.promise : Promise.resolve()
    ));
    const createSession = vi.fn(async (file: File) => (
      file.name === 'b.docx' ? replacement : newest
    ));
    const replaceUrl = vi.fn();
    await mountWorkspaceRuntime(document, {
      fragment: '#session=' + sessionId,
      store,
      createSession,
      replaceUrl,
    });
    vi.mocked(store.put).mockClear();
    vi.mocked(store.delete).mockClear();

    analyzer.acceptedListener?.({
      file: new File([new Uint8Array([1])], 'b.docx'),
      source: 'user-selection',
      intake: replacement.intake,
    });
    await vi.waitFor(() => expect(store.put).toHaveBeenCalledWith(replacement));

    analyzer.acceptedListener?.({
      file: new File([new Uint8Array([2])], 'c.docx'),
      source: 'user-selection',
      intake: newest.intake,
    });
    await vi.waitFor(() => expect(replaceUrl).toHaveBeenCalledWith('/rad/#session=' + newestSessionId));
    await vi.waitFor(() => expect(store.delete).toHaveBeenCalledWith(sessionId));

    pendingB.resolve();
    await vi.waitFor(() => expect(store.delete).toHaveBeenCalledWith(replacementSessionId));

    expect(replaceUrl).not.toHaveBeenCalledWith('/rad/#session=' + replacementSessionId);
    expect(document.querySelector('[data-workspace-document-name]')?.textContent).toBe('c.docx');
  });

  it('tab-only runtime ne objavljuje neobnovljiv session fragment', async () => {
    const store = localStore();
    const replacement = localSession(replacementSessionId, 'tab-zamjena.docx');
    const replaceUrl = vi.fn();
    await mountWorkspaceRuntime(document, {
      fragment: '#session=' + sessionId,
      store,
      createSession: vi.fn(async () => replacement),
      replaceUrl,
      sessionScope: 'tab',
    });
    vi.mocked(store.put).mockClear();
    vi.mocked(store.delete).mockClear();

    analyzer.acceptedListener?.({
      file: new File([new Uint8Array([4])], 'tab-zamjena.docx'),
      source: 'user-selection',
      intake: replacement.intake,
    });

    await vi.waitFor(() => expect(store.put).toHaveBeenCalledWith(replacement));
    await vi.waitFor(() => expect(store.delete).toHaveBeenCalledWith(sessionId));
    expect(replaceUrl).not.toHaveBeenCalled();
    expect(statusTitle()).toMatch(/samo u ovom tabu/i);
    expect(document.querySelector('[data-workspace-document-name]')?.textContent).toBe('tab-zamjena.docx');
  });

  it('kvar spremanja nove datoteke uklanja stari fragment umjesto povratka na A nakon refresha', async () => {
    const store = localStore();
    const replacement = localSession(replacementSessionId, 'samo-tab.docx');
    const createSession = vi.fn(async () => replacement);
    const replaceUrl = vi.fn();
    await mountWorkspaceRuntime(document, {
      fragment: '#session=' + sessionId,
      store,
      createSession,
      replaceUrl,
    });
    vi.mocked(store.put).mockRejectedValueOnce(new DOMException('Quota', 'QuotaExceededError'));
    vi.mocked(store.delete).mockClear();

    analyzer.acceptedListener?.({
      file: new File([new Uint8Array([3])], 'samo-tab.docx'),
      source: 'user-selection',
      intake: replacement.intake,
    });

    await vi.waitFor(() => expect(replaceUrl).toHaveBeenCalledWith('/rad/'));
    expect(store.delete).not.toHaveBeenCalledWith(sessionId);
    expect(statusTitle()).toMatch(/samo u ovom tabu/i);
    expect(document.querySelector('[data-workspace-document-name]')?.textContent).toBe('samo-tab.docx');
  });
});
