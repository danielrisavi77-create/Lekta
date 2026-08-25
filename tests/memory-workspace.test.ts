// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountMemoryWorkspace } from '../src/routes/intake/memory-workspace';
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
          <button type="button" data-route-theme>Lampa</button>
          <button type="button" data-route-menu-button aria-expanded="false">Izbornik</button>
          <nav data-route-menu hidden>
            <a href="/rad/" data-route-link="workspace">Korektorski stol</a>
            <a href="/saznaj-vise/" data-route-link="learn-more">Saznaj više</a>
          </nav>
        </header>
        <main id="main-content" tabindex="-1">
          <section id="workspace-status">
            <strong data-workspace-status-title></strong>
            <span data-workspace-status-detail></span>
          </section>
          <span data-workspace-document-name></span>
          <div id="analyzer"></div>
        </main>
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

beforeEach(() => {
  document.documentElement.removeAttribute('data-route');
  document.documentElement.dataset.theme = 'light';
  document.title = 'Lekta: učitaj rad';
  document.body.className = 'intake-root';
  document.body.innerHTML = '<main id="original"><button id="originalAction">Odaberi</button></main>';
  document.querySelectorAll('[data-memory-workspace-style]').forEach((node) => node.remove());
});

describe('memory-only workspace', () => {
  it('učitava pravi route shell, stilove i runtime bez izvršavanja fetched scriptova', async () => {
    const runtime = vi.fn(async (
      doc: Document,
      options: { fragment: string; store: { get(id: string): Promise<LocalDocumentSessionV1 | null> } },
    ) => {
      expect(doc.querySelector('#analyzer')).not.toBeNull();
      expect(options.fragment).toBe(`#session=${SESSION_ID}`);
      expect((await options.store.get(SESSION_ID))?.document.name).toBe('diplomski-rad.docx');
    });

    await mountMemoryWorkspace(session(), {
      doc: document,
      isCurrent: () => true,
      fetchWorkspace: async () => response(),
      loadRuntime: async () => ({ mountWorkspaceRuntime: runtime }),
    });

    expect(runtime).toHaveBeenCalledOnce();
    expect(document.title).toBe('Korektorski stol | Lekta');
    expect(document.body.className).toBe('workspace-body');
    expect(document.querySelectorAll('script')).toHaveLength(0);
    expect(document.body.dataset.scriptExecuted).toBeUndefined();
    expect(document.querySelector('[data-memory-workspace-style]')).not.toBeNull();
    expect(document.body.textContent).toMatch(/samo u ovom tabu/i);
    expect(document.documentElement.dataset.route).toBe('workspace');
    expect(document.querySelector('[data-route-link="workspace"]')?.getAttribute('aria-current')).toBe('page');

    const theme = document.querySelector<HTMLButtonElement>('[data-route-theme]')!;
    theme.click();
    expect(document.documentElement.dataset.theme).toBe('dark');

    const menu = document.querySelector<HTMLElement>('[data-route-menu]')!;
    document.querySelector<HTMLButtonElement>('[data-route-menu-button]')!.click();
    expect(menu.hidden).toBe(false);
  });

  it('na runtime kvar atomski vraća iste intake čvorove, a njihovi listeneri ostaju aktivni', async () => {
    const original = document.querySelector<HTMLButtonElement>('#originalAction')!;
    const click = vi.fn();
    original.addEventListener('click', click);

    await expect(mountMemoryWorkspace(session(), {
      doc: document,
      isCurrent: () => true,
      fetchWorkspace: async () => response(),
      loadRuntime: async () => ({
        mountWorkspaceRuntime: async () => {
          throw new Error('runtime failed');
        },
      }),
    })).rejects.toThrow('runtime failed');

    expect(document.title).toBe('Lekta: učitaj rad');
    expect(document.body.className).toBe('intake-root');
    expect(document.querySelector('#originalAction')).toBe(original);
    expect(document.querySelector('[data-memory-workspace-style]')).toBeNull();
    expect(document.documentElement.dataset.route).toBeUndefined();
    original.click();
    expect(click).toHaveBeenCalledOnce();
  });

  it('kasni runtime starog odabira vraća intake umjesto da prepiše noviji tok', async () => {
    let current = true;
    let releaseRuntime!: () => void;
    const runtimePending = new Promise<void>((resolve) => { releaseRuntime = resolve; });
    const runtime = vi.fn(() => runtimePending);
    const original = document.querySelector('#original')!;

    const mounting = mountMemoryWorkspace(session(), {
      doc: document,
      isCurrent: () => current,
      fetchWorkspace: async () => response(),
      loadRuntime: async () => ({ mountWorkspaceRuntime: runtime }),
    });
    await vi.waitFor(() => expect(runtime).toHaveBeenCalledOnce());
    expect(document.querySelector('#analyzer')).not.toBeNull();

    current = false;
    releaseRuntime();
    await mounting;

    expect(document.querySelector('#original')).toBe(original);
    expect(document.querySelector('#analyzer')).toBeNull();
    expect(document.querySelector('[data-memory-workspace-style]')).toBeNull();
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
  });
});
