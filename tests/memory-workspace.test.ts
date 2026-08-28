// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountMemoryWorkspace } from '../src/routes/intake/memory-workspace';
import { mountRouteShell } from '../src/routes/shared/route-shell';
import { MemoryDocumentSessionStore } from '../src/session/indexeddb-document-session-store';
import type { LocalDocumentSessionV1 } from '../src/session/local-document-session';

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174000';

function session(): LocalDocumentSessionV1 {
  const now = Date.now();
  return {
    schemaVersion: 1,
    id: SESSION_ID,
    createdAt: now,
    expiresAt: now + 86_400_000,
    document: {
      name: 'diplomski-rad.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      lastModified: now,
      bytes: new Uint8Array([80, 75, 3, 4]).buffer,
    },
    intake: {
      kind: 'ok',
      quickStats: null,
      suspicious: false,
      suspicionReason: null,
      capability: null,
    },
  };
}

function workspaceHtml(): string {
  return `<!doctype html>
    <html lang="hr">
      <head>
        <title>Korektorski stol | Lekta</title>
        <style>.legacy-analyzer-style { display: block; }</style>
      </head>
      <body class="workspace-body">
        <a class="skip-link" href="#main-content">Preskoči</a>
        <header>
          <a href="/">Lekta</a>
          <nav aria-label="Glavna navigacija">
            <a href="/">Nova provjera</a>
            <a href="/moji-radovi/">Moji radovi</a>
          </nav>
          <button type="button" data-route-directory-button aria-controls="route-directory" aria-expanded="false">Sve</button>
        </header>
        <main id="main-content" tabindex="-1">
          <section id="workspace-status">
            <strong data-workspace-status-title></strong>
            <span data-workspace-status-detail></span>
          </section>
          <span data-workspace-document-name></span>
          <div id="analyzer"></div>
        </main>
        <div data-route-directory-layer></div>
        <script>document.body.dataset.scriptExecuted = 'true'</script>
      </body>
    </html>`;
}

function response(): Response {
  return new Response(workspaceHtml(), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

class DeferredPreparationStore extends MemoryDocumentSessionStore {
  private signalPreparationStarted!: () => void;
  private releasePreparation!: () => void;
  readonly preparationStarted = new Promise<void>((resolve) => {
    this.signalPreparationStarted = resolve;
  });
  private readonly preparationPending = new Promise<void>((resolve) => {
    this.releasePreparation = resolve;
  });

  override async put(value: LocalDocumentSessionV1): Promise<void> {
    this.signalPreparationStarted();
    await this.preparationPending;
    await super.put(value);
  }

  release(): void {
    this.releasePreparation();
  }
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  document.documentElement.removeAttribute('data-route');
  document.documentElement.removeAttribute('data-route-variant');
  document.documentElement.dataset.theme = 'light';
  document.title = 'Lekta: učitaj rad';
  document.body.className = 'intake-root';
  document.body.innerHTML = `
    <a class="skip-link" href="#main-content">Preskoči</a>
    <header>
      <a href="/">Lekta</a>
      <a href="/moji-radovi/">Moji radovi</a>
      <button type="button" data-route-directory-button aria-controls="route-directory" aria-expanded="false">Sve</button>
    </header>
    <main id="main-content"><div id="original"><button id="originalAction">Odaberi</button></div></main>
    <div data-route-directory-layer></div>
  `;
  mountRouteShell(document, {
    current: 'intake',
    variant: 'intake',
    privacySettingsAvailable: false,
  });
  document.querySelectorAll('[data-memory-workspace-style]').forEach((node) => node.remove());
});

describe('memory-only workspace', () => {
  it('montira workspace shell i privacy kontrolu prije runtimea bez izvršavanja fetched scriptova', async () => {
    // Mutation caught: runtime se pokrene prije shella pa ne može vezati dinamički privacySettingsBtn.
    let runtimeObservedPrivacy = false;
    let runtimeRoute: string | undefined;
    let runtimeVariant: string | undefined;
    const runtime = vi.fn(async (
      doc: Document,
      options: { fragment: string; sessionScope?: 'persistent' | 'tab'; store: { get(id: string): Promise<LocalDocumentSessionV1 | null> } },
    ) => {
      expect(doc.querySelector('#analyzer')).not.toBeNull();
      runtimeObservedPrivacy = doc.getElementById('privacySettingsBtn') !== null;
      runtimeRoute = doc.documentElement.dataset.route;
      runtimeVariant = doc.documentElement.dataset.routeVariant;
      expect(options.fragment).toBe(`#session=${SESSION_ID}`);
      expect(options.sessionScope).toBe('tab');
      expect((await options.store.get(SESSION_ID))?.document.name).toBe('diplomski-rad.docx');
    });

    await mountMemoryWorkspace(session(), {
      doc: document,
      isCurrent: () => true,
      fetchWorkspace: async () => response(),
      loadRuntime: async () => ({ mountWorkspaceRuntime: runtime }),
    });

    expect(runtime).toHaveBeenCalledOnce();
    expect(runtimeObservedPrivacy).toBe(true);
    expect(runtimeRoute).toBe('workspace');
    expect(runtimeVariant).toBe('workspace');
    expect(document.title).toBe('Korektorski stol | Lekta');
    expect(document.body.className).toBe('workspace-body');
    expect(document.querySelectorAll('script')).toHaveLength(0);
    expect(document.body.dataset.scriptExecuted).toBeUndefined();
    expect(document.querySelector('[data-memory-workspace-style]')).not.toBeNull();
    expect(document.body.textContent).toMatch(/samo u ovom tabu/i);
    expect(document.documentElement.dataset.route).toBe('workspace');
    expect(document.documentElement.dataset.routeVariant).toBe('workspace');
    expect(document.querySelectorAll('#privacySettingsBtn')).toHaveLength(1);
    expect(document.getElementById('privacySettingsBtn')?.hidden).toBe(false);

    const theme = document.querySelector<HTMLButtonElement>('[data-route-directory-theme]')!;
    theme.click();
    expect(document.documentElement.dataset.theme).toBe('dark');

    document.querySelector<HTMLButtonElement>('[data-route-directory-button]')!.click();
    expect(document.querySelector<HTMLElement>('[role="dialog"]')?.hidden).toBe(false);
    expect(document.querySelector('[data-route-menu], [data-route-menu-button], [data-route-theme]')).toBeNull();
  });

  it('na runtime kvar vraća intake i prenosi listener ownership na novi intake shell', async () => {
    // Mutation caught: rollback ne remounta intake ili ostavi workspace i prvi intake listener živima.
    const original = document.querySelector<HTMLButtonElement>('#originalAction')!;
    const originalDialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    let workspaceHadPrivacy = false;
    let workspaceTrigger: HTMLButtonElement | null = null;
    let workspaceDialog: HTMLElement | null = null;
    const disposeRuntime = vi.fn((doc: Document) => {
      expect(doc.querySelector('#analyzer')).not.toBeNull();
      expect(doc.querySelector('#original')).toBeNull();
    });
    const click = vi.fn();
    original.addEventListener('click', click);
    document.body.style.overflow = 'clip';
    document.body.tabIndex = -1;
    original.focus();
    expect(document.activeElement).toBe(original);

    await expect(mountMemoryWorkspace(session(), {
      doc: document,
      isCurrent: () => true,
      fetchWorkspace: async () => response(),
      loadRuntime: async () => ({
        mountWorkspaceRuntime: async (doc: Document) => {
          workspaceHadPrivacy = doc.getElementById('privacySettingsBtn') !== null;
          workspaceTrigger = doc.querySelector<HTMLButtonElement>('[data-route-directory-button]')!;
          workspaceDialog = doc.querySelector<HTMLElement>('[role="dialog"]')!;
          doc.body.tabIndex = -1;
          doc.body.focus();
          workspaceTrigger?.click();
          expect(doc.body.style.overflow).toBe('hidden');
          expect(doc.activeElement?.id).toBe('route-directory-title');
          throw new Error('runtime failed');
        },
        disposeWorkspaceRuntime: disposeRuntime,
      }),
    })).rejects.toThrow('runtime failed');
    expect(disposeRuntime).toHaveBeenCalledOnce();

    expect(document.title).toBe('Lekta: učitaj rad');
    expect(document.body.className).toBe('intake-root');
    expect(document.querySelector('#originalAction')).toBe(original);
    expect(document.querySelector('[data-memory-workspace-style]')).toBeNull();
    expect(document.documentElement.dataset.route).toBe('intake');
    expect(document.documentElement.dataset.routeVariant).toBe('intake');
    expect(document.body.style.overflow).toBe('clip');
    expect(document.activeElement).toBe(original);

    expect(workspaceHadPrivacy).toBe(true);
    expect(workspaceTrigger).not.toBeNull();
    expect(workspaceDialog).not.toBeNull();
    if (!workspaceTrigger || !workspaceDialog) return;
    expect(workspaceDialog.hidden).toBe(true);
    workspaceTrigger.click();
    expect(workspaceDialog.hidden).toBe(true);

    const restoredTrigger = document.querySelector<HTMLButtonElement>('[data-route-directory-button]')!;
    restoredTrigger.click();
    expect(document.querySelector<HTMLElement>('[role="dialog"]')?.hidden).toBe(false);
    expect(originalDialog.hidden).toBe(true);

    original.click();
    expect(click).toHaveBeenCalledOnce();
  });

  it('runtime kvar nakon odgođene pripreme vraća settled intake snapshot', async () => {
    // Mutation caught: intake shell se disposa tek nakon captureDocument() pa snapshot pamti otvoreni panel.
    const originalAction = document.querySelector<HTMLButtonElement>('#originalAction')!;
    const intakeTrigger = document.querySelector<HTMLButtonElement>('[data-route-directory-button]')!;
    const intakeDialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const store = new DeferredPreparationStore();
    let workspaceTrigger: HTMLButtonElement | null = null;
    let workspaceDialog: HTMLElement | null = null;
    document.body.style.overflow = 'clip';
    originalAction.focus();
    expect(document.activeElement).toBe(originalAction);

    const mounting = mountMemoryWorkspace(session(), {
      doc: document,
      isCurrent: () => true,
      fetchWorkspace: async () => response(),
      loadRuntime: async () => ({
        mountWorkspaceRuntime: async (doc: Document) => {
          workspaceTrigger = doc.querySelector<HTMLButtonElement>('[data-route-directory-button]')!;
          workspaceDialog = doc.querySelector<HTMLElement>('[role="dialog"]')!;
          workspaceTrigger?.focus();
          workspaceTrigger?.click();
          expect(doc.body.style.overflow).toBe('hidden');
          expect(doc.activeElement?.id).toBe('route-directory-title');
          throw new Error('runtime failed after deferred preparation');
        },
      }),
      createStore: () => store,
    });
    const failedMount = expect(mounting).rejects.toThrow('runtime failed after deferred preparation');

    await store.preparationStarted;
    expect(document.querySelector('#analyzer')).toBeNull();
    intakeTrigger.click();
    expect(intakeDialog.hidden).toBe(false);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement?.id).toBe('route-directory-title');

    store.release();
    await failedMount;

    expect.soft(document.body.style.overflow).toBe('clip');
    expect.soft(document.activeElement).toBe(originalAction);
    expect(intakeDialog.hidden).toBe(true);
    expect(workspaceTrigger).not.toBeNull();
    expect(workspaceDialog).not.toBeNull();
    if (!workspaceTrigger || !workspaceDialog) return;
    expect(workspaceDialog.hidden).toBe(true);
    workspaceTrigger.click();
    expect(workspaceDialog.hidden).toBe(true);

    const restoredTrigger = document.querySelector<HTMLButtonElement>('[data-route-directory-button]')!;
    const restoredDialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(restoredTrigger).toBe(intakeTrigger);
    expect(restoredDialog).not.toBe(intakeDialog);
    restoredTrigger.click();
    expect(restoredDialog.hidden).toBe(false);
    expect(intakeDialog.hidden).toBe(true);
  });

  it('kasni runtime starog odabira vraća intake umjesto da prepiše noviji tok', async () => {
    // Mutation caught: stale rollback vrati DOM bez živog intake shella ili ostavi workspace listener.
    let current = true;
    let releaseRuntime!: () => void;
    let workspaceHadPrivacy = false;
    let workspaceTrigger: HTMLButtonElement | null = null;
    let workspaceDialog: HTMLElement | null = null;
    const disposeRuntime = vi.fn((doc: Document) => {
      expect(doc.querySelector('#analyzer')).not.toBeNull();
      expect(doc.querySelector('#original')).toBeNull();
    });
    const runtimePending = new Promise<void>((resolve) => { releaseRuntime = resolve; });
    const runtime = vi.fn((doc: Document) => {
      workspaceHadPrivacy = doc.getElementById('privacySettingsBtn') !== null;
      workspaceTrigger = doc.querySelector<HTMLButtonElement>('[data-route-directory-button]')!;
      workspaceDialog = doc.querySelector<HTMLElement>('[role="dialog"]')!;
      doc.body.tabIndex = -1;
      doc.body.focus();
      workspaceTrigger?.click();
      expect(doc.body.style.overflow).toBe('hidden');
      expect(doc.activeElement?.id).toBe('route-directory-title');
      return runtimePending;
    });
    const original = document.querySelector('#original')!;
    const originalAction = document.querySelector<HTMLButtonElement>('#originalAction')!;
    document.body.style.overflow = 'scroll';
    document.body.tabIndex = -1;
    originalAction.focus();
    expect(document.activeElement).toBe(originalAction);

    const mounting = mountMemoryWorkspace(session(), {
      doc: document,
      isCurrent: () => current,
      fetchWorkspace: async () => response(),
      loadRuntime: async () => ({
        mountWorkspaceRuntime: runtime,
        disposeWorkspaceRuntime: disposeRuntime,
      }),
    });
    await vi.waitFor(() => expect(runtime).toHaveBeenCalledOnce());
    expect(document.querySelector('#analyzer')).not.toBeNull();

    current = false;
    releaseRuntime();
    await mounting;
    expect(disposeRuntime).toHaveBeenCalledOnce();
    expect(document.querySelector('#original')).toBe(original);
    expect(document.querySelector('#analyzer')).toBeNull();
    expect(document.querySelector('[data-memory-workspace-style]')).toBeNull();
    expect(document.documentElement.dataset.route).toBe('intake');
    expect(document.documentElement.dataset.routeVariant).toBe('intake');
    expect(document.body.style.overflow).toBe('scroll');
    expect(document.activeElement).toBe(originalAction);
    expect(workspaceHadPrivacy).toBe(true);
    expect(workspaceTrigger).not.toBeNull();
    expect(workspaceDialog).not.toBeNull();
    if (!workspaceTrigger || !workspaceDialog) return;
    expect(workspaceDialog.hidden).toBe(true);
    workspaceTrigger.click();
    expect(workspaceDialog.hidden).toBe(true);

    document.querySelector<HTMLButtonElement>('[data-route-directory-button]')!.click();
    expect(document.querySelector<HTMLElement>('[role="dialog"]')?.hidden).toBe(false);
  });

  it('stale nakon runtimea i odgođene pripreme vraća settled intake snapshot', async () => {
    // Mutation caught: stale rollback obnavlja snapshot snimljen dok je intake direktorij još otvoren.
    let current = true;
    let releaseRuntime!: () => void;
    const runtimePending = new Promise<void>((resolve) => { releaseRuntime = resolve; });
    const originalAction = document.querySelector<HTMLButtonElement>('#originalAction')!;
    const intakeTrigger = document.querySelector<HTMLButtonElement>('[data-route-directory-button]')!;
    const intakeDialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const store = new DeferredPreparationStore();
    let workspaceTrigger: HTMLButtonElement | null = null;
    let workspaceDialog: HTMLElement | null = null;
    const runtime = vi.fn((doc: Document) => {
      workspaceTrigger = doc.querySelector<HTMLButtonElement>('[data-route-directory-button]')!;
      workspaceDialog = doc.querySelector<HTMLElement>('[role="dialog"]')!;
      workspaceTrigger?.focus();
      workspaceTrigger?.click();
      expect(doc.body.style.overflow).toBe('hidden');
      expect(doc.activeElement?.id).toBe('route-directory-title');
      return runtimePending;
    });
    document.body.style.overflow = 'scroll';
    originalAction.focus();
    expect(document.activeElement).toBe(originalAction);

    const mounting = mountMemoryWorkspace(session(), {
      doc: document,
      isCurrent: () => current,
      fetchWorkspace: async () => response(),
      loadRuntime: async () => ({ mountWorkspaceRuntime: runtime }),
      createStore: () => store,
    });

    await store.preparationStarted;
    expect(document.querySelector('#analyzer')).toBeNull();
    intakeTrigger.click();
    expect(intakeDialog.hidden).toBe(false);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement?.id).toBe('route-directory-title');

    store.release();
    await vi.waitFor(() => expect(runtime).toHaveBeenCalledOnce());
    expect(document.querySelector('#analyzer')).not.toBeNull();

    current = false;
    releaseRuntime();
    await mounting;

    expect.soft(document.body.style.overflow).toBe('scroll');
    expect.soft(document.activeElement).toBe(originalAction);
    expect(intakeDialog.hidden).toBe(true);
    expect(workspaceTrigger).not.toBeNull();
    expect(workspaceDialog).not.toBeNull();
    if (!workspaceTrigger || !workspaceDialog) return;
    expect(workspaceDialog.hidden).toBe(true);
    workspaceTrigger.click();
    expect(workspaceDialog.hidden).toBe(true);

    const restoredTrigger = document.querySelector<HTMLButtonElement>('[data-route-directory-button]')!;
    const restoredDialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(restoredTrigger).toBe(intakeTrigger);
    expect(restoredDialog).not.toBe(intakeDialog);
    restoredTrigger.click();
    expect(restoredDialog.hidden).toBe(false);
    expect(intakeDialog.hidden).toBe(true);
  });

  it('stale rezultat prije commita uopće ne mijenja intake DOM', async () => {
    const original = document.querySelector('#original')!;
    const runtime = vi.fn(async () => undefined);

    await mountMemoryWorkspace(session(), {
      doc: document,
      isCurrent: () => false,
      fetchWorkspace: async () => response(),
      loadRuntime: async () => ({ mountWorkspaceRuntime: runtime }),
    });

    expect(document.querySelector('#original')).toBe(original);
    expect(runtime).not.toHaveBeenCalled();
    expect(document.querySelector('[data-memory-workspace-style]')).toBeNull();
    expect(document.documentElement.dataset.route).toBe('intake');
    expect(document.documentElement.dataset.routeVariant).toBe('intake');
  });
});
