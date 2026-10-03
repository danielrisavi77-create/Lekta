import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { lockfileSourceProblems } from '../scripts/lockfile-sources.mjs';
import { lockfileGuardWiringProblems } from './helpers/lockfile-sources';

/** T99 (issue #220): gard izvora paketa u package-lock.json. Mutacije su u gate-mutations. */
const REG = 'https://registry.npmjs.org/';
const ok = (n: string) => ({ resolved: `${REG}${n}/-/${n}-1.0.0.tgz`, integrity: 'sha512-AAAA' });
const lock = (packages: Record<string, unknown>) => ({ lockfileVersion: 3, packages: { '': { name: 'x' }, ...packages } });

describe('T99: lockfileSourceProblems', () => {
  it('stvarni package-lock.json je cist i provjerava stvarne pakete', () => {
    const real = JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8'));
    const out = lockfileSourceProblems(real);
    expect(out.problems).toEqual([]);
    expect(out.checked).toBeGreaterThan(1000);
  });

  it('korijen, link i inBundle bez resolved nisu prekrsaj (nema laznog pozitiva)', () => {
    const out = lockfileSourceProblems(lock({
      'node_modules/a': ok('a'),
      'node_modules/a/node_modules/b': { version: '1.0.0', inBundle: true },
      'packages/lokalni': { link: true, resolved: 'packages/lokalni' },
    }));
    expect(out).toEqual({ problems: [], checked: 1, skipped: 3 });
  });

  it('svaki los izvor je imenovan po paketu', () => {
    const out = lockfileSourceProblems(lock({
      'node_modules/a': ok('a'),
      'node_modules/host': { ...ok('host'), resolved: 'https://evil.example/host.tgz' },
      'node_modules/http': { ...ok('http'), resolved: `http://registry.npmjs.org/http/-/http-1.0.0.tgz` },
      'node_modules/git': { ...ok('git'), resolved: 'git+https://github.com/x/git.git#abc' },
      'node_modules/bez': { resolved: ok('bez').resolved },
      'node_modules/sha1': { ...ok('sha1'), integrity: 'sha1-AAAA' },
      'node_modules/nista': { version: '1.0.0' },
    }));
    expect(out.problems).toEqual([
      'node_modules/host: `resolved` nije https://registry.npmjs.org/ (https://evil.example/host.tgz)',
      'node_modules/http: `resolved` nije https://registry.npmjs.org/ (http://registry.npmjs.org/http/-/http-1.0.0.tgz)',
      'node_modules/git: `resolved` nije https://registry.npmjs.org/ (git+https://github.com/x/git.git#abc)',
      'node_modules/bez: nema `integrity`',
      'node_modules/sha1: `integrity` nije sha512 (sha1)',
      'node_modules/nista: nema `resolved`',
      'node_modules/nista: nema `integrity`',
    ]);
  });

  it('host koji samo pocinje kao registry ne prolazi', () => {
    const out = lockfileSourceProblems(lock({ 'node_modules/a': { ...ok('a'), resolved: 'https://registry.npmjs.org.evil.example/a.tgz' } }));
    expect(out.problems).toHaveLength(1);
  });

  it('necitljiv ili prazan lockfile nije zelen', () => {
    expect(lockfileSourceProblems({ lockfileVersion: 1, dependencies: {} }).problems).toHaveLength(1);
    expect(lockfileSourceProblems(null).problems).toHaveLength(1);
    expect(lockfileSourceProblems(lock({})).problems).toEqual(['lockfile nema nijedan provjeren paket']);
  });
});

describe('T99: skripta i CI', () => {
  it('selftest i mjerenje prolaze kao zasebni procesi', () => {
    for (const args of [['--selftest'], []]) {
      const r = spawnSync(process.execPath, [resolve(process.cwd(), 'scripts', 'lockfile-sources.mjs'), ...args], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/SELF-TEST OK|OK: \d+ paketa/);
    }
  });

  it('security-audit.yml pokrece gard prije npm audit, selftest prije mjerenja (baseline)', () => {
    const wf = readFileSync(resolve(process.cwd(), '.github', 'workflows', 'security-audit.yml'), 'utf8');
    expect(lockfileGuardWiringProblems(wf)).toEqual([]);
  });
});
