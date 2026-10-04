// @vitest-environment node
/**
 * `scripts/env-doctor.mjs`: svaki raskorak okoline se dokazuje nad SINTETICKOM mapom (temp
 * package.json, node_modules/vitest/package.json, lockfileovi), nikad nad stvarnim repoom, pa test
 * ne ovisi o tome sto je danas instalirano. Git i Codex se podmecu kao funkcije.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkCodex,
  checkCrlf,
  checkLockfile,
  checkNode,
  checkSharedTree,
  checkVitest,
  codexMinimum,
  detectCodexVersion,
  strictExitCode,
  runDoctor,
  satisfiesRange,
  summaryLine,
} from '../scripts/env-doctor.mjs';

let root = '';

function writeJson(rel: string, value: unknown) {
  const path = join(root, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

/** Zdrava sinteticka okolina: sve se slaze. */
function healthyTree() {
  writeJson('package.json', { engines: { node: '>=20' }, devDependencies: { vitest: '^4.1.11' } });
  writeJson('node_modules/vitest/package.json', { version: '4.1.11' });
  writeJson('package-lock.json', {
    lockfileVersion: 3,
    packages: {
      '': { name: 'x' },
      'node_modules/vitest': { version: '4.1.11' },
      'node_modules/fsevents': { version: '2.3.3', optional: true },
    },
  });
  writeJson('node_modules/.package-lock.json', { packages: { 'node_modules/vitest': { version: '4.1.11' } } });
}

const noGit = () => null;
const codexOk = () => ({ installed: true, version: '0.160.0' });
const healthyGit = (args: string[]) => {
  if (args[0] === 'rev-parse') return 'abc1234';
  if (args[0] === 'rev-list') return '0\t0';
  return null;
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lekta-env-doctor-'));
  healthyTree();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('env-doctor: rasponi verzija', () => {
  it.each([
    ['4.1.11', '^4.1.11', true],
    ['4.2.0', '^4.1.11', true],
    ['2.1.9', '^4.1.11', false],
    ['5.0.0', '^4.1.11', false],
    ['0.2.5', '^0.2.3', true],
    ['0.3.0', '^0.2.3', false],
    ['1.2.9', '~1.2.3', true],
    ['1.3.0', '~1.2.3', false],
    ['24.14.1', '>=20', true],
    ['18.20.0', '>=20', false],
    ['20.11.0', '20', true],
    ['22.0.0', '20', false],
    ['20.5.0', '>=20 <21', true],
    ['18.0.0', '^18 || ^20', true],
    ['4.1.11-beta.1', '^4.1.11', null],
    ['20.0.0-rc.1', '>=20', null],
    ['20.0.1', '>20', false],
    ['21.0.0', '>20', true],
  ])('%s u "%s" = %s', (version, range, expected) => {
    expect(satisfiesRange(version, range)).toBe(expected);
  });

  it('nerazumljiv raspon daje null (nepoznato), ne lazni raskorak', () => {
    expect(satisfiesRange('1.0.0', 'latest')).toBeNull();
  });
});

describe('env-doctor: provjere nad sintetickom mapom', () => {
  it('BASELINE: zdrava okolina nema raskoraka i zavrsni redak je "env-doctor: OK"', () => {
    const report = runDoctor({ root, nodeVersion: '24.14.1', codex: codexOk, git: healthyGit });
    expect(report.mismatches, JSON.stringify(report.results)).toBe(0);
    expect(summaryLine(report)).toBe('env-doctor: OK');
    expect(report.results).toHaveLength(6);
  });

  it('(a) Node ispod engines je raskorak; .nvmrc ima prednost pred engines', () => {
    expect(checkNode({ root, nodeVersion: '18.20.0' }).status).toBe('raskorak');
    writeFileSync(join(root, '.nvmrc'), 'v22\n');
    const r = checkNode({ root, nodeVersion: '24.14.1' });
    expect(r.status).toBe('raskorak');
    expect(r.message).toMatch(/\.nvmrc/);
  });

  it('(b) vitest 2.1.9 naspram ^4.1.11 je raskorak (stanje 3. 10. 2026.)', () => {
    writeJson('node_modules/vitest/package.json', { version: '2.1.9' });
    const r = checkVitest({ root });
    expect(r.status).toBe('raskorak');
    expect(r.message).toMatch(/2\.1\.9 NE zadovoljava "\^4\.1\.11"; npm ci potreban/);
    const report = runDoctor({ root, nodeVersion: '24.14.1', codex: codexOk, git: healthyGit });
    expect(summaryLine(report)).toBe('env-doctor: 2 raskoraka');
  });

  it('(b) neinstaliran vitest je raskorak', () => {
    rmSync(join(root, 'node_modules', 'vitest'), { recursive: true });
    expect(checkVitest({ root }).status).toBe('raskorak');
  });

  it('(c) stvarni instalirani manifest s drugom verzijom je raskorak', () => {
    writeJson('node_modules/vitest/package.json', { version: '2.1.9' });
    writeJson('node_modules/.package-lock.json', { packages: { 'node_modules/vitest': { version: '2.1.9' } } });
    const r = checkLockfile({ root });
    expect(r.status).toBe('raskorak');
    expect(r.message).toMatch(/1 razlicitih verzija, 0 nedostaje, 0 nepoznato .*npm ci potreban/);
  });

  it('(c) zastarjeli skriveni npm lock ne obara stvarni uskladjeni paket', () => {
    writeJson('node_modules/.package-lock.json', { packages: { 'node_modules/vitest': { version: '2.1.9' } } });
    expect(checkLockfile({ root }).status).toBe('ok');
  });

  it('(c) paket koji nedostaje je raskorak, opcionalni (fsevents) nije', () => {
    rmSync(join(root, 'node_modules', 'vitest'), { recursive: true, force: true });
    writeJson('node_modules/.package-lock.json', { packages: {} });
    const r = checkLockfile({ root });
    expect(r.status).toBe('raskorak');
    expect(r.message).toMatch(/0 razlicitih verzija, 1 nedostaje, 0 nepoznato \(vitest nedostaje\)/);
  });

  it('(c) bez skrivenog lockfilea stvarni instalirani paketi se i dalje provjeravaju', () => {
    rmSync(join(root, 'node_modules', '.package-lock.json'));
    expect(checkLockfile({ root }).status).toBe('ok');
  });

  it('(d) Codex ispod minimuma iz codex-review skilla je raskorak; neinstaliran nije', () => {
    mkdirSync(join(root, '.claude', 'skills', 'codex-review'), { recursive: true });
    writeFileSync(join(root, '.claude', 'skills', 'codex-review', 'SKILL.md'), '`codex --version` mora ispisati 0.170.0 ili vise.');
    expect(codexMinimum(root)).toBe('0.170.0');
    expect(checkCodex({ root, codex: { installed: true, version: '0.160.0' } }).status).toBe('raskorak');
    expect(checkCodex({ root, codex: { installed: true, version: '0.171.2' } }).status).toBe('ok');
    const missing = checkCodex({ root, codex: { installed: false, version: null } });
    expect(missing.status).toBe('info');
    expect(missing.message).toBe('codex: nije instaliran');
  });

  it('(d) bez skilla vrijedi minimum 0.160.0', () => {
    expect(codexMinimum(root)).toBe('0.160.0');
    expect(checkCodex({ root, codex: { installed: true, version: '0.156.1' } }).status).toBe('raskorak');
  });

  it('(d) verzija se cita iz npm globalne instalacije uz shim u PATH-u; prazan PATH = nije instaliran', () => {
    const bin = join(root, 'bin');
    mkdirSync(join(bin, 'node_modules', '@openai', 'codex'), { recursive: true });
    writeFileSync(join(bin, process.platform === 'win32' ? 'codex.cmd' : 'codex'), '');
    writeFileSync(join(bin, 'node_modules', '@openai', 'codex', 'package.json'), JSON.stringify({ version: '0.161.0' }));
    expect(detectCodexVersion({ PATH: bin })).toEqual({ installed: true, version: '0.161.0' });
    expect(detectCodexVersion({ PATH: join(root, 'nema') })).toEqual({ installed: false, version: null });
  });

  it('(e) HEAD dijeljenog stabla koji nije predak origin/master je raskorak; iza je samo info', () => {
    const git = (ancestor: boolean) => (args: string[]) => {
      if (args[0] === 'rev-parse' && args.includes('main-worktree/HEAD')) return 'abc1234';
      if (args[0] === 'rev-list' && args.includes('main-worktree/HEAD...origin/master')) return ancestor ? '0\t7' : '2\t7';
      return null;
    };
    const behind = checkSharedTree({ root, git: git(true) });
    expect(behind.status).toBe('info');
    expect(behind.message).toMatch(/7 commita iza origin\/master \(prema lokalnom origin\/master, bez fetcha\)/);
    expect(checkSharedTree({ root, git: git(false) }).status).toBe('raskorak');
    expect(checkSharedTree({ root, git: noGit }).status).toBe('nepoznato');
  });

  it('(f) CRLF je samo informacija', () => {
    writeFileSync(join(root, '.gitattributes'), '# komentar eol=lf\n*.mjs text eol=lf\n*.sh text eol=lf\n');
    const r = checkCrlf({ root, git: () => 'true' });
    expect(r.status).toBe('info');
    expect(r.message).toBe('crlf: core.autocrlf=true, .gitattributes eol pravila: 2');
  });

  it('nepoznata provjera ne ispisuje lazni OK i strict vraca neuspjeh', () => {
    const report = runDoctor({ root, checks: [() => { throw new Error('bum'); }] });
    expect(report.mismatches).toBe(0);
    expect(report.results[0].status).toBe('nepoznato');
    expect(report.unknowns).toBe(1);
    expect(summaryLine(report)).toBe('env-doctor: 1 nepoznata provjera');
    expect(strictExitCode(report)).toBe(1);
    expect(strictExitCode(report, false)).toBe(0);
  });
});
