import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const originalIndexHash = '7c4e38f7305521ebd5a91044d1e9a001fd6ff441601d659053a78790600488fd';

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

describe('intake-first MPA route inputs', () => {
  it('zadržava javni root netaknut tijekom route-shell taska', () => {
    const hash = createHash('sha256').update(originalIndex).digest('hex');
    expect(hash).toBe(originalIndexHash);
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

  it('korektorski stol izlaže auth i postavke privatnosti postojecem runtimeu', () => {
    const html = source('rad/index.html');

    expect(html).toMatch(/<button\b[^>]*\bdata-auth-entry\b[^>]*>/i);
    expect(html).toMatch(/<button\b[^>]*\bid=["']privacySettingsBtn["'][^>]*>/i);
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
