// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LocalDocumentSessionStore,
  LocalDocumentSessionV1,
} from '../src/session/local-document-session';

const analyzer = vi.hoisted(() => ({
  init: vi.fn(),
  load: vi.fn(),
}));

vi.mock('../src/ui/app', () => ({
  initAnalyzerApp: analyzer.init,
  loadAnalyzerDocument: analyzer.load,
}));

import { mountWorkspaceRuntime } from '../src/routes/workspace/workspace-runtime';

const sessionId = '123e4567-e89b-42d3-a456-426614174000';

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

function localSession(): LocalDocumentSessionV1 {
  return {
    schemaVersion: 1,
    id: sessionId,
    createdAt: 1_000,
    expiresAt: 2_000,
    document: {
      name: 'diplomski-rad.docx',
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
  analyzer.load.mockReset();
  analyzer.load.mockResolvedValue({ accepted: true });
  renderFixture();
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
});
