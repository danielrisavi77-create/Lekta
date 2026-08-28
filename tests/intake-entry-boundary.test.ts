import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ROOT_HTML = resolve(ROOT, 'index.html');
const INTAKE_MAIN = resolve(ROOT, 'src/routes/intake/main.ts');
const CONTROLLER = resolve(ROOT, 'src/routes/intake/intake-controller.ts');
const MEMORY_WORKSPACE = resolve(ROOT, 'src/routes/intake/memory-workspace.ts');
const INTAKE_CSS = resolve(ROOT, 'src/routes/intake/intake.css');
const VITE_CONFIG = resolve(ROOT, 'vite.config.ts');

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

function resolveRelativeImport(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(from), specifier);
  const candidates = extname(base)
    ? [base]
    : [base, `${base}.ts`, `${base}.tsx`, `${base}.css`, `${base}.json`, resolve(base, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function staticRuntimeImports(path: string): string[] {
  const code = source(path).replace(/^\s*import\s+type\b[\s\S]*?;\s*$/gm, '');
  const imports: string[] = [];
  const pattern = /^\s*import\s+(?!type\b)(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]\s*;?/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code))) {
    const resolved = resolveRelativeImport(path, match[1]);
    if (resolved) imports.push(resolved);
  }
  return imports;
}

function collectStaticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const path = queue.pop()!;
    if (seen.has(path)) continue;
    seen.add(path);
    for (const imported of staticRuntimeImports(path)) queue.push(imported);
  }
  return seen;
}

describe('minimalni intake ulaz', () => {
  it('root je mali zaseban ulaz, bez skrivenog starog workspacea i prodajnog landinga', () => {
    const html = source(ROOT_HTML);

    expect(statSync(ROOT_HTML).size).toBeLessThan(30_000);
    expect(html).toMatch(/src=["']\/src\/routes\/intake\/main\.ts["']/);
    expect(html).toContain('id="intakeDropzone"');
    expect(html).toContain('id="intakeFile"');
    expect(html).toContain('id="intakeFileName"');
    expect(html).toContain('id="intakeStatus"');
    expect(html).toContain('id="intakeError"');
    expect(html).toContain('id="intakeMemoryAction"');
    expect(html).toContain('href="/moji-radovi/"');
    expect(html).toContain('href="/saznaj-vise/#how"');
    expect(html).not.toMatch(/id=["']analyzer["']|pricing|cijene|Često postavljena pitanja|Kako radi provjera/i);
  });

  it('statusi su dostupni čitaču ekrana i svi ID-jevi su jedinstveni', () => {
    const html = source(ROOT_HTML);
    expect(html).toMatch(/id="intakeStatus"[^>]*aria-live="polite"/);
    expect(html).toMatch(/id="intakeError"[^>]*role="alert"/);
    expect(html).toMatch(/id="intakeFile"[^>]*tabindex="-1"[^>]*aria-hidden="true"/);

    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prikaz i validacija limita koriste isti device-aware zajednički izračun', () => {
    const html = source(ROOT_HTML);
    const main = source(INTAKE_MAIN);

    expect(html).toContain('data-upload-limit');
    expect(html).not.toMatch(/20\s*MB/i);
    expect(main).toContain('uploadCapBytes');
    expect(main).toMatch(/deviceMemory/);
    expect(main).toMatch(/pointer:\s*coarse/);
    expect(main).toMatch(/data-upload-limit/);
  });

  it('početni statički graf nema analizator, profile, repair motor ni vizualno teške module', () => {
    const graph = [...collectStaticGraph(INTAKE_MAIN)].map((path) => path.replace(/\\/g, '/'));
    const forbidden = graph.filter((path) => (
      path.includes('/src/analysis/')
      || path.includes('/src/profiles/')
      || path.includes('/src/ui/')
      || path.includes('/src/routes/workspace/')
      || (path.includes('/src/repair/') && !path.endsWith('/src/repair/docx-budget.ts'))
      || /(?:preflight|preview|history|motion|premium|landing)/i.test(path)
    ));

    expect(forbidden).toEqual([]);
    expect(graph.some((path) => path.endsWith('/src/repair/docx-budget.ts'))).toBe(true);
  });

  it('root static graph includes the shared shell and public directory', () => {
    // Mutacija hvacena: root vise ne montira shell ili prvi paint dobije feature modul.
    const graph = [...collectStaticGraph(INTAKE_MAIN)].map((path) => path.replaceAll('\\', '/'));
    expect(graph).toEqual(expect.arrayContaining([
      expect.stringMatching(/\/src\/routes\/shared\/route-shell\.ts$/),
      expect.stringMatching(/\/src\/routes\/shared\/public-route-directory\.ts$/),
      expect.stringMatching(/\/src\/routes\/shared\/public-route-directory\.json$/),
    ]));
    const sharedForbidden = graph.filter((path) => (
      /(?:^|\/)(?:ui-boot|lucide|premium|motion|analysis|profiles|repair|auth|history|preflight|preview|landing)(?:[./-]|$)/i.test(path)
      && !path.endsWith('/src/repair/docx-budget.ts')
    ));
    expect(sharedForbidden).toEqual([]);
  });

  it('intake gate i puni workspace ostaju dinamički iza korisničke akcije', () => {
    const main = source(INTAKE_MAIN);

    expect(main).toMatch(/import\(['"]\.\.\/\.\.\/docx\/intake-gate['"]\)/);
    expect(main).toMatch(/import\(['"]\.\/memory-workspace['"]\)/);
    expect(staticRuntimeImports(INTAKE_MAIN).some((path) => path.endsWith('intake-gate.ts'))).toBe(false);
    expect(staticRuntimeImports(INTAKE_MAIN).some((path) => path.endsWith('memory-workspace.ts'))).toBe(false);
  });

  it('memory-only put učitava isti /rad/ shell bez izvršavanja njegovih scriptova', () => {
    const memoryWorkspace = source(MEMORY_WORKSPACE);

    expect(memoryWorkspace).toContain("fetch('/rad/'");
    expect(memoryWorkspace).toContain('DOMParser');
    expect(memoryWorkspace).toMatch(/querySelectorAll[^\n]*script/);
    expect(memoryWorkspace).toMatch(/script\.remove\(\)/);
    expect(memoryWorkspace).toContain('MemoryDocumentSessionStore');
    expect(memoryWorkspace).toContain('mountWorkspaceRuntime');
    expect(memoryWorkspace).toContain('mountRouteShell');
  });

  it('ime datoteke nema HTML, logging ni analytics izlaz u controlleru', () => {
    const controller = source(CONTROLLER);

    expect(controller).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
    expect(controller).not.toMatch(/console\.|analytics|track\s*\(/i);
    expect(controller).toMatch(/fileName[^\n]*textContent|textContent[^\n]*file\.name/);
  });

  it('taktilni vizual koristi kratke transformacije i poštuje reduced motion bez beskonačne animacije', () => {
    const css = source(INTAKE_CSS);

    expect(css).toMatch(/transform/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).not.toMatch(/animation[^;{]*infinite/i);
    expect(css).not.toMatch(/url\([^)]*\.(?:png|jpe?g|webp|gif)/i);
  });

  it('eksplicitna spremljena dark tema vrijedi i kada je OS u light načinu', () => {
    const css = source(INTAKE_CSS);
    const explicitDark = css.indexOf(':root[data-theme="dark"]');
    const osDark = css.indexOf('@media (prefers-color-scheme: dark)');

    expect(explicitDark).toBeGreaterThanOrEqual(0);
    expect(osDark).toBeGreaterThan(explicitDark);
  });

  it('Vite preskače font preload samo za minimalni root ulaz', () => {
    const config = source(VITE_CONFIG);

    expect(config).toMatch(/ctx\.filename[\s\S]*resolve\(ctx\.filename\)[\s\S]*resolve\(__dirname,\s*['"]index\.html['"]\)[\s\S]*return html/);
  });
});
