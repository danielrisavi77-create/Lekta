// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { judgeLint, uOpsegu } from '../scripts/hooks/lint-feedback.mjs';

describe('lint-feedback: opseg', () => {
  it('JS/TS izvor je u opsegu, ignorirane putanje oxlinta i ostale ekstenzije nisu', () => {
    expect(uOpsegu('src/ui/app.ts')).toBe(true);
    expect(uOpsegu('scripts/hooks/dash-guard.mjs')).toBe(true);
    expect(uOpsegu('tests/a.test.ts')).toBe(true);
    expect(uOpsegu('supabase/functions/x/index.ts')).toBe(true);
    expect(uOpsegu('vite.config.ts')).toBe(true);
    expect(uOpsegu('docs/a.md')).toBe(false);
    expect(uOpsegu('docs/x.ts')).toBe(false);
    expect(uOpsegu('data/profiles/a.json')).toBe(false);
    expect(uOpsegu('.claude/workflows/lekta-lean.js')).toBe(false);
    // `.oxlintrc.json` ne ignorira tests/fixtures, pa ih lintaju i `npm run lint` i build-gate (Grok nit na #366).
    expect(uOpsegu('tests/fixtures/x/a.js')).toBe(true);
    expect(uOpsegu('src/styles/app.css')).toBe(false);
    expect(uOpsegu(null)).toBe(false);
  });
});

describe('lint-feedback: presuda', () => {
  it('izlaz 0 je cist i tih', () => {
    expect(judgeLint('src/a.ts', { status: 0, stdout: '' })).toEqual({ prijavi: false, poruka: '' });
  });

  it('izlaz 1 prijavljuje nalaz modelu s putanjom i retkom oxlinta', () => {
    const r = judgeLint('src/a.ts', { status: 1, stdout: 'src/a.ts:2:12: Checking equality with NaN [Error/eslint(use-isnan)]\n\n1 problem\n' });
    expect(r.prijavi).toBe(true);
    expect(r.poruka).toContain('src/a.ts:2:12');
    expect(r.poruka).toContain('use-isnan');
  });

  it('dug izlaz se skracuje na 40 redaka uz sazetak', () => {
    const stdout = Array.from({ length: 45 }, (_, i) => `src/a.ts:${i + 1}:1: x`).join('\n');
    const r = judgeLint('src/a.ts', { status: 1, stdout });
    expect(r.poruka).toContain('src/a.ts:40:1');
    expect(r.poruka).not.toContain('src/a.ts:41:1');
    expect(r.poruka).toContain('... jos 5 redaka');
  });

  it('timeout ili greska pokretanja je fail-open', () => {
    expect(judgeLint('src/a.ts', { status: null }).prijavi).toBe(false);
    expect(judgeLint('src/a.ts', { status: 1, error: new Error('ENOENT') }).prijavi).toBe(false);
  });

  it('neuspjeh bez ijednog retka nalaza je kvar alata, fail-open s razlogom', () => {
    const r = judgeLint('src/a.ts', { status: 1, stdout: '', stderr: "'C:\\Program' is not recognized\nvise" });
    expect(r.prijavi).toBe(false);
    expect(r.poruka).toContain("'C:\\Program' is not recognized");
    expect(r.poruka).not.toContain('vise');
  });
});

/**
 * Izravni signal: stvarni hook kao proces nad privremenim "repozitorijem" (marker, stvarni
 * `.oxlintrc.json`, symlink na instalirani oxlint). Nista se ne pise u radno stablo.
 */
describe('lint-feedback: hook kao proces', () => {
  const hook = resolve('scripts/hooks/lint-feedback.mjs');

  function pokreni(datoteke: Record<string, string>, cilj: string, bezOxlinta = false) {
    const dir = mkdtempSync(join(tmpdir(), 'lekta-lint-hook-'));
    try {
      mkdirSync(join(dir, 'docs', 'agents'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'agents', 'tasks.json'), '{}');
      copyFileSync(resolve('.oxlintrc.json'), join(dir, '.oxlintrc.json'));
      if (!bezOxlinta) {
        mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true });
        symlinkSync(resolve('node_modules', '.bin', 'oxlint'), join(dir, 'node_modules', '.bin', 'oxlint'));
      }
      for (const [rel, sadrzaj] of Object.entries(datoteke)) {
        mkdirSync(join(dir, rel, '..'), { recursive: true });
        writeFileSync(join(dir, rel), sadrzaj);
      }
      const ulaz = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: join(dir, cilj) }, cwd: dir });
      return spawnSync(process.execPath, [hook], { input: ulaz, encoding: 'utf8', timeout: 30_000 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const pokvaren = 'export function f(a: number) {\n  if (a == NaN) return 1;\n  return 2;\n}\n';

  it('pokvarena datoteka u src/ vraca izlaz 2 i nalaz oxlinta', () => {
    const r = pokreni({ 'src/x.ts': pokvaren }, 'src/x.ts');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('src/x.ts:2:');
    expect(r.stderr).toContain('use-isnan');
  });

  it('cista datoteka vraca izlaz 0 bez poruke', () => {
    const r = pokreni({ 'src/x.ts': 'export const a = 1;\n' }, 'src/x.ts');
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });

  it('ista pokvarena datoteka izvan opsega (docs/) se ne provjerava', () => {
    const r = pokreni({ 'docs/x.ts': pokvaren }, 'docs/x.ts');
    expect(r.status).toBe(0);
  });

  it('bez instaliranog oxlinta hook propusta (fail-open)', () => {
    const r = pokreni({ 'src/x.ts': pokvaren }, 'src/x.ts', true);
    expect(r.status).toBe(0);
  });

  it('neispravan JSON na ulazu je fail-open', () => {
    const r = spawnSync(process.execPath, [hook], { input: 'nije json', encoding: 'utf8', timeout: 30_000 });
    expect(r.status).toBe(0);
  });
});
