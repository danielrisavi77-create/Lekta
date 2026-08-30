// @vitest-environment happy-dom
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import esbuild from 'esbuild';
import type { LocalDocumentSessionSummary } from '../src/session/local-document-session';

const intakeHost = vi.hoisted(() => ({
  initAnalyzerApp: vi.fn(),
  list: vi.fn(),
  mountController: vi.fn(),
  mountShell: vi.fn(),
  mountWorkspaceRuntime: vi.fn(),
}));

vi.mock('../src/session/indexeddb-document-session-store', () => ({
  IndexedDbDocumentSessionStore: class {
    list = intakeHost.list;
  },
}));

vi.mock('../src/routes/intake/intake-controller', () => ({
  mountIntakeController: intakeHost.mountController,
}));

vi.mock('../src/routes/shared/route-shell', () => ({
  mountRouteShell: intakeHost.mountShell,
}));

vi.mock('../src/routes/workspace/workspace-shell', () => ({
  renderWorkspaceBootError: vi.fn(),
  renderWorkspaceShell: vi.fn(),
}));

vi.mock('../src/routes/workspace/workspace-runtime', () => ({
  mountWorkspaceRuntime: intakeHost.mountWorkspaceRuntime,
}));

vi.mock('../src/shared/ui-boot', () => ({}));
vi.mock('../src/ui/korektorski', () => ({}));
vi.mock('../src/ui/hero-demo', () => ({}));
vi.mock('../src/ui/app', () => ({ initAnalyzerApp: intakeHost.initAnalyzerApp }));

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const routes = [
  {
    input: 'rad',
    path: 'rad/index.html',
    canonical: 'https://lektahr.netlify.app/rad/',
    entry: '/src/routes/workspace/main.ts',
  },
  {
    input: 'saznajVise',
    path: 'saznaj-vise/index.html',
    canonical: 'https://lektahr.netlify.app/saznaj-vise/',
    entry: '/src/routes/learn-more/main.ts',
  },
  {
    input: 'mojiRadovi',
    path: 'moji-radovi/index.html',
    canonical: 'https://lektahr.netlify.app/moji-radovi/',
    entry: '/src/routes/my-work/main.ts',
  },
] as const;

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function executableInlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .filter((match) => {
      const attributes = match[1] ?? '';
      return !/\bsrc\s*=/i.test(attributes)
        && !/type=["']application\/ld\+json["']/i.test(attributes);
    })
    .map((match) => match[2]);
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/\bhref=["']([^"']+)["']/gi)].map((match) => match[1]);
}

const originalIndex = source('index.html');
const themeRestoreScript = executableInlineScripts(originalIndex).find((body) => body.includes('lekta.theme'));

const shellHosts = [
  {
    path: 'index.html',
    controls: ['Lekta', 'Moji radovi', 'Sve'],
    links: ['/', '/moji-radovi/'],
  },
  {
    path: 'rad/index.html',
    controls: ['Lekta', 'Nova provjera', 'Moji radovi', 'Sve'],
    links: ['/', '/', '/moji-radovi/'],
  },
  {
    path: 'saznaj-vise/index.html',
    controls: ['Lekta', 'Nova provjera', 'Moji radovi', 'Sve'],
    links: ['/', '/', '/moji-radovi/'],
  },
  {
    path: 'moji-radovi/index.html',
    controls: ['Lekta', 'Nova provjera', 'Moji radovi', 'Sve'],
    links: ['/', '/', '/moji-radovi/'],
  },
] as const;

function parsed(path: string): Document {
  const doc = document.implementation.createHTMLDocument('');
  doc.documentElement.innerHTML = source(path);
  return doc;
}

function installRootHost(): HTMLElement {
  const rootDoc = parsed('index.html');
  const sourceHost = rootDoc.getElementById('intakeStage');
  if (!sourceHost) throw new Error('Nedostaje #intakeStage u root fixtureu.');
  const host = document.importNode(sourceHost, true);
  document.body.replaceChildren(host);
  return host;
}

function normalizedText(element: Element): string {
  return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function sessionSummary(id: string, name: string, createdAt: number): LocalDocumentSessionSummary {
  return {
    id,
    name,
    createdAt,
    expiresAt: createdAt + 86_400_000,
    stage: 'profile',
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  intakeHost.list.mockResolvedValue([]);
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
});

describe('intake-first MPA route inputs', () => {
  it('root aktivira samo novi intake entrypoint', () => {
    expect(originalIndex).toContain('src="/src/routes/intake/main.ts"');
    expect(originalIndex).not.toContain('src="/src/main.ts"');
    expect(originalIndex).not.toContain('id="analyzer"');
  });

  it('registrira sva tri nova Vite ulaza', () => {
    const config = source('vite.config.ts');
    for (const route of routes) {
      const escapedPath = route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(config).toMatch(
        new RegExp(`\\b${route.input}\\s*:\\s*resolve\\(__dirname,\\s*['"]${escapedPath}['"]\\)`),
      );
    }
  });

  it.each(routes)('$path postoji kao hrvatski, pristupačan i CSP-siguran HTML ulaz', (route) => {
    const absolutePath = join(root, route.path);
    expect(existsSync(absolutePath), `${route.path} ne postoji`).toBe(true);
    if (!existsSync(absolutePath)) return;

    const html = readFileSync(absolutePath, 'utf8');
    expect(html).toMatch(/<html\s[^>]*lang=["']hr["']/i);
    expect(html).toMatch(/<meta\s+charset=["']?utf-8["']?\s*\/?>/i);
    expect(html).toMatch(/<meta\s+name=["']viewport["'][^>]*content=["'][^"']*width=device-width/i);
    expect(html).toContain(`<link rel="canonical" href="${route.canonical}">`);
    expect(html).toMatch(
      new RegExp(`<script\\s+type=["']module["']\\s+src=["']${route.entry.replaceAll('/', '\\/')}["']\\s*><\\/script>`, 'i'),
    );
    expect(html).toMatch(/<body[^>]*>\s*<a\s[^>]*class=["'][^"']*\bskip-link\b[^"']*["'][^>]*href=["']#main-content["']/i);
    expect(html).toMatch(/<main\s[^>]*id=["']main-content["'][^>]*tabindex=["']-1["']/i);
    expect(executableInlineScripts(html)).toEqual([themeRestoreScript]);
  });

  it.each(routes)('$path nema dvostruke DOM identitete', (route) => {
    const html = source(route.path);
    const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect([...new Set(duplicates)]).toEqual([]);
  });
});

describe('granice route shellova', () => {
  it.each(shellHosts)('$path ima samo odobreni no-JS header i jedan direktorij', (host) => {
    // Mutation caught: vraćanje starog nav elementa, autha, lampe ili viška odluka u header.
    const doc = parsed(host.path);
    const header = doc.querySelector('header');
    expect(header).not.toBeNull();
    if (!header) return;

    const controls = [...header.querySelectorAll('a, button')];
    expect(normalizedText(controls[0])).toContain('Lekta');
    expect(controls.slice(1).map(normalizedText)).toEqual(host.controls.slice(1));
    expect([...header.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual(host.links);
    expect(controls.length - 1, 'korisničke odluke bez branda').toBeLessThanOrEqual(3);

    const directoryButton = header.querySelector<HTMLButtonElement>('[data-route-directory-button]');
    expect(directoryButton?.getAttribute('aria-controls')).toBe('route-directory');
    expect(directoryButton?.getAttribute('aria-expanded')).toBe('false');
    expect(doc.querySelectorAll('[data-route-directory-button]')).toHaveLength(1);
    expect(doc.querySelectorAll('[data-route-directory-layer]')).toHaveLength(1);
    expect(doc.querySelector('[data-route-menu], [data-route-menu-button], [data-route-theme]')).toBeNull();
  });

  it('root ostaje upload-first i ispod stola nudi samo dva tiha ulaza', () => {
    // Mutation caught: uklanjanje upload mounta ili vraćanje marketinškog nav zida na root.
    const doc = parsed('index.html');
    for (const id of [
      'intakeStage', 'intakeDropzone', 'intakeFile', 'intakeFileName', 'intakeFormat',
      'intakePrivacy', 'intakeStatus', 'intakeError', 'intakeMemoryAction',
    ]) {
      expect(doc.getElementById(id), 'nedostaje #' + id).not.toBeNull();
    }
    expect([...doc.querySelectorAll('main a')].map((link) => link.getAttribute('href'))).toEqual([
      '/saznaj-vise/#how',
      '/alati.html',
    ]);
    expect(normalizedText(doc.querySelector('header')!)).not.toMatch(/Nova provjera|Lampa|Prijava|Cijene|Benchmark|Alati/i);
  });

  it.each([
    {
      entry: '../src/routes/workspace/main',
      options: { current: 'workspace', variant: 'workspace', privacySettingsAvailable: true },
    },
    {
      entry: '../src/routes/learn-more/main',
      options: { current: 'learn-more', variant: 'content', privacySettingsAvailable: true },
    },
    {
      entry: '../src/routes/my-work/main',
      options: { current: 'my-work', variant: 'my-work', privacySettingsAvailable: false },
    },
  ])('$entry predaje puni host options ugovor', async ({ entry, options }) => {
    // Mutation caught: caller ponovno koristi nepotpuni bridge ili pogrešan privacy host signal.
    await import(entry);

    expect(intakeHost.mountShell).toHaveBeenCalledOnce();
    expect(intakeHost.mountShell.mock.calls[0]?.[1]).toEqual(options);
  });

  it('root montira Sve prije listanja i remounta samo najnoviju sesiju', async () => {
    // Mutation caught: IndexedDB blokira Sve ili host koristi stariju sesiju.
    installRootHost();
    const newestId = '123e4567-e89b-42d3-a456-426614174000';
    const olderId = '223e4567-e89b-42d3-a456-426614174000';
    let resolveList!: (value: LocalDocumentSessionSummary[]) => void;
    intakeHost.list.mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve; }));

    await import('../src/routes/intake/main');

    expect(intakeHost.mountShell).toHaveBeenCalledTimes(1);
    expect(intakeHost.mountShell).toHaveBeenNthCalledWith(1, document, {
      current: 'intake',
      variant: 'intake',
      privacySettingsAvailable: false,
    });
    expect(intakeHost.list).toHaveBeenCalledOnce();

    resolveList([
      sessionSummary(newestId, 'najnoviji-rad.docx', 200),
      sessionSummary(olderId, 'stariji-rad.docx', 100),
    ]);
    await vi.waitFor(() => expect(intakeHost.mountShell).toHaveBeenCalledTimes(2));
    expect(intakeHost.mountShell).toHaveBeenNthCalledWith(2, document, {
      current: 'intake',
      variant: 'intake',
      privacySettingsAvailable: false,
      continuation: {
        href: '/rad/#session=123e4567-e89b-42d3-a456-426614174000',
        label: 'Nastavi trenutačni rad',
      },
    });
    const shellOptions = intakeHost.mountShell.mock.calls.map(([, options]) => options);
    expect(JSON.stringify(shellOptions)).not.toMatch(/najnoviji-rad|stariji-rad/);
  });

  it('kasni continuation ne remounta intake nakon zamjene izvornog hosta', async () => {
    // Mutation caught: dovršetak starog list() poziva prepiše memory-only workspace shell.
    const originalIntakeHost = installRootHost();
    let resolveList!: (value: LocalDocumentSessionSummary[]) => void;
    const pendingList = new Promise<LocalDocumentSessionSummary[]>((resolve) => {
      resolveList = resolve;
    });
    intakeHost.list.mockReturnValueOnce(pendingList);

    await import('../src/routes/intake/main');
    expect(intakeHost.mountShell).toHaveBeenCalledTimes(1);

    const workspaceHost = document.createElement('main');
    workspaceHost.id = 'analyzer';
    originalIntakeHost.replaceWith(workspaceHost);
    expect(originalIntakeHost.isConnected).toBe(false);

    resolveList([
      sessionSummary('123e4567-e89b-42d3-a456-426614174000', 'novi-rad.docx', 200),
    ]);
    await pendingList;
    await Promise.resolve();

    expect(intakeHost.mountShell).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: 'prazan popis', result: [] as LocalDocumentSessionSummary[] },
    { label: 'IndexedDB kvar', result: new Error('indexeddb unavailable') },
  ])('root nakon $label ostavlja početni shell nepromijenjen', async ({ result }) => {
    // Mutation caught: prazan ili neuspjeli store stvara mrežni ili generički continuation fallback.
    if (result instanceof Error) intakeHost.list.mockRejectedValueOnce(result);
    else intakeHost.list.mockResolvedValueOnce(result);

    await import('../src/routes/intake/main');
    await vi.waitFor(() => expect(intakeHost.list).toHaveBeenCalledOnce());
    await Promise.resolve();

    expect(intakeHost.mountShell).toHaveBeenCalledTimes(1);
    expect(intakeHost.mountShell).toHaveBeenCalledWith(document, {
      current: 'intake',
      variant: 'intake',
      privacySettingsAvailable: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('informativna ruta ne aktivira legacy full-page boot', () => {
    const html = source('saznaj-vise/index.html');
    const legacySignature = ['checkGrid', 'pricingGrid', 'orderModal', 'historyModal', 'legalModal'];
    expect(legacySignature.every((id) => html.includes(`id="${id}"`))).toBe(false);
  });

  it('radni prostor izlaže stabilne mount točke svih postojećih tokova', () => {
    const path = join(root, 'rad/index.html');
    expect(existsSync(path), 'rad/index.html ne postoji').toBe(true);
    if (!existsSync(path)) return;

    const html = readFileSync(path, 'utf8');
    for (const id of [
      'workspace-status',
      'workspace-profile',
      'workspace-progress',
      'workspace-document',
      'workspace-findings',
      'workspace-primary-action',
      'workspace-repair',
      'workspace-comparison',
      'workspace-submission',
      'workspace-advanced',
    ]) {
      expect(html, `nedostaje #${id}`).toContain(`id="${id}"`);
    }
  });

  it('informativna ruta koristi root-relative linkove za root HTML alate', () => {
    const html = source('saznaj-vise/index.html');
    const routeHrefs = hrefs(html);
    const documentRelativeHtml = routeHrefs.filter((href) => /^[^/#][^:]*\.html(?:[?#].*)?$/.test(href));

    expect(documentRelativeHtml).toEqual([]);
    expect(routeHrefs).not.toContain('#analyzer');
    for (const path of [
      '/alati.html',
      '/citat.html',
      '/izjava.html',
      '/kartice.html',
      '/landing_benchmark.html',
      '/landing_usporedba.html',
      '/literatura.html',
      '/naslovnica.html',
    ]) {
      expect(routeHrefs).toContain(path);
    }
  });

  it('korektorski stol drži jednu auth kontrolu u utility redu izvan headera', () => {
    // Mutation caught: auth se izgubi ili ponovno završi u globalnom headeru.
    const doc = parsed('rad/index.html');
    const authEntries = [...doc.querySelectorAll<HTMLButtonElement>('[data-auth-entry]')];

    expect(authEntries).toHaveLength(1);
    expect(authEntries[0].closest('.launch-actions')).not.toBeNull();
    expect(authEntries[0].closest('header')).toBeNull();
  });

  it('privacy settings kontrolu stvara samo shell na consent rutama', () => {
    // Mutation caught: statički duplicate id ostane u velikom host HTML-u.
    expect(parsed('rad/index.html').querySelector('#privacySettingsBtn')).toBeNull();
    expect(parsed('saznaj-vise/index.html').querySelector('#privacySettingsBtn')).toBeNull();
  });

  it('privacy copy razlikuje povijest analiza od privremene lokalne dokumentne sesije', () => {
    const html = source('rad/index.html');

    expect(html).toContain('Word datoteka nije dio povijesti');
    expect(html).toContain('privatnoj lokalnoj sesiji');
    expect(html).toContain('dokument se ne šalje na poslužitelj');
    expect(html).not.toContain('Sadržaj dokumenta i sama Word datoteka ne spremaju se.');
  });

  it('dijeljeni shell ostaje malen i bez feature grafa', () => {
    const path = join(root, 'src/routes/shared/route-shell.ts');
    expect(existsSync(path), 'route-shell.ts ne postoji').toBe(true);
    if (!existsSync(path)) return;

    const routeShell = readFileSync(path, 'utf8');
    const staticImports = [...routeShell.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g)]
      .map((match) => match[1]);
    expect(staticImports).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/ui-boot|lucide|premium|motion|analysis|profiles|repair|landing|preflight|preview|history/i),
    ]));
  });

  it('dijeljeni shell ima samo dopustene staticke importe i bez dinamickog feature grafa', async () => {
    // Mutacija hvacena: shell uvodi feature import ili odgada feature graf iza import().
    const path = join(root, 'src/routes/shared/route-shell.ts');
    const routeShell = readFileSync(path, 'utf8');
    const staticImports = [...routeShell.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g)]
      .map((match) => match[1]);
    expect(staticImports).toEqual([
      '../../shared/browser-storage',
      './public-route-directory',
      '../../shared/skip-link.css',
      './route-shell.css',
    ]);
    expect([...routeShell.matchAll(/\bimport\s*\(/g)]).toEqual([]);

    const result = await esbuild.build({
      absWorkingDir: root,
      entryPoints: ['src/routes/shared/route-shell.ts'],
      bundle: true,
      minify: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      metafile: true,
      outdir: 'route-shell-import-gate',
    });
    expect(result.metafile, 'esbuild mora vratiti potpuni metafile import grafa').toBeDefined();
    if (!result.metafile) return;
    const inputs = Object.keys(result.metafile.inputs).map((input) => input.replaceAll('\\', '/')).sort();
    expect(inputs).toEqual([
      'src/routes/shared/public-route-directory.json',
      'src/routes/shared/public-route-directory.ts',
      'src/routes/shared/route-shell.css',
      'src/routes/shared/route-shell.ts',
      'src/shared/browser-storage.ts',
      'src/shared/skip-link.css',
    ]);
  }, 60_000);

  it('workspace prikazuje restoring shell prije dinamičkog učitavanja runtimea', () => {
    const path = join(root, 'src/routes/workspace/main.ts');
    expect(existsSync(path), 'workspace/main.ts ne postoji').toBe(true);
    if (!existsSync(path)) return;

    const main = readFileSync(path, 'utf8');
    const renderIndex = main.indexOf('renderWorkspaceShell(');
    const runtimeImportIndex = main.search(/import\(\s*["']\.\/workspace-runtime["']\s*\)/);
    expect(renderIndex).toBeGreaterThanOrEqual(0);
    expect(runtimeImportIndex).toBeGreaterThan(renderIndex);
    expect(main).not.toMatch(/from\s+["']\.\/workspace-runtime["']/);
  });

  it('workspace runtime koristi postojeću analyzer granicu', () => {
    const path = join(root, 'src/routes/workspace/workspace-runtime.ts');
    expect(existsSync(path), 'workspace-runtime.ts ne postoji').toBe(true);
    if (!existsSync(path)) return;

    const runtime = readFileSync(path, 'utf8');
    expect(runtime).toMatch(/\binitAnalyzerApp\b/);
    expect(runtime).toMatch(/\bloadAnalyzerDocument\b/);
  });
});
