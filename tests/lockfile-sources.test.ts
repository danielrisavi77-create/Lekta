import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isStrictSha512, lockfileSourceProblems } from '../scripts/lockfile-sources.mjs';
import { lockfileGuardWiringProblems } from './helpers/lockfile-sources';

/** T99 (issue #220): gard izvora paketa u package-lock.json. Mutacije su u gate-mutations. */
const REG = 'https://registry.npmjs.org/';
const SHA512 = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
const SHA1 = 'sha1-EfatjsUqKYSrqv18O1FlA3hcIHI=';
const ok = (n: string) => ({ resolved: `${REG}${n}/-/${n}-1.0.0.tgz`, integrity: SHA512 });
const lock = (packages: Record<string, unknown>, lockfileVersion: unknown = 3) =>
  ({ lockfileVersion, packages: { '': { name: 'x' }, ...packages } });

describe('T99: lockfileSourceProblems', () => {
  it('stvarni package-lock.json je cist i provjerava stvarne pakete', () => {
    const real = JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8'));
    const out = lockfileSourceProblems(real);
    expect(out.problems).toEqual([]);
    expect(out.checked).toBeGreaterThan(1000);
  });

  it('korijen i inBundle s roditeljem koji ga navodi u bundleDependencies nisu prekrsaj', () => {
    const out = lockfileSourceProblems(lock({
      'node_modules/a': { ...ok('a'), bundleDependencies: ['b', '@s/c'] },
      'node_modules/a/node_modules/b': { version: '1.0.0', inBundle: true },
      'node_modules/a/node_modules/@s/c': { version: '1.0.0', inBundle: true },
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
      'node_modules/sha1': { ...ok('sha1'), integrity: SHA1 },
      'node_modules/nista': { version: '1.0.0' },
    }));
    expect(out.problems).toEqual([
      'node_modules/host: `resolved` nije https://registry.npmjs.org/ (https://evil.example/host.tgz)',
      'node_modules/http: `resolved` nije https://registry.npmjs.org/ (http://registry.npmjs.org/http/-/http-1.0.0.tgz)',
      'node_modules/git: `resolved` nije https://registry.npmjs.org/ (git+https://github.com/x/git.git#abc)',
      'node_modules/bez: nema `integrity`',
      'node_modules/sha1: `integrity` nije jedan sha512 zapis od 64 bajta (sha1-EfatjsUqKYS)',
      'node_modules/nista: nema `resolved`',
      'node_modules/nista: nema `integrity`',
    ]);
  });

  it('host koji samo pocinje kao registry ne prolazi', () => {
    const out = lockfileSourceProblems(lock({ 'node_modules/a': { ...ok('a'), resolved: 'https://registry.npmjs.org.evil.example/a.tgz' } }));
    expect(out.problems).toHaveLength(1);
  });

  it('integrity mora biti tocno jedan sha512 od 64 bajta (Codex F3)', () => {
    expect(isStrictSha512(SHA512)).toBe(true);
    for (const bad of [
      'sha512-', `sha512- ${SHA1}`, `${SHA512} ${SHA1}`, `${SHA1} ${SHA512}`, `${SHA512}?opt`,
      `sha512-${Buffer.alloc(32, 1).toString('base64')}`, ` ${SHA512}`, SHA1, 'sha512-AAAA', undefined,
    ]) expect(isStrictSha512(bad), String(bad)).toBe(false);
  });

  it('inBundle i link nisu bezuvjetno izuzeti (Codex F2)', () => {
    const parent = { ...ok('a'), bundleDependencies: ['b'] };
    const cases: Record<string, unknown>[] = [
      { 'node_modules/a': ok('a'), 'node_modules/a/node_modules/b': { inBundle: true } },
      { 'node_modules/a': parent, 'node_modules/a/node_modules/x': { inBundle: true } },
      { 'node_modules/a': parent, 'node_modules/b': { inBundle: true } },
      { 'node_modules/a': parent, 'node_modules/a/node_modules/b': { inBundle: true, resolved: 'https://evil.example/b.tgz' } },
      { 'node_modules/a': ok('a'), 'node_modules/w': { link: true, resolved: '../izvan' } },
      { 'node_modules/a': ok('a'), 'node_modules/w': { link: true } },
    ];
    for (const c of cases) expect(lockfileSourceProblems(lock(c)).problems.length, JSON.stringify(c)).toBeGreaterThan(0);
  });

  it('tranzitivni i podignuti bundle prolaze, nepotrebni bundled paket pada (Codex runda 2, F2)', () => {
    const a = { ...ok('a'), bundleDependencies: ['b'] };
    const b = { version: '1.0.0', inBundle: true, dependencies: { c: '^1.0.0' } };
    // a -> a/b -> a/b/c
    expect(lockfileSourceProblems(lock({ 'node_modules/a': a, 'node_modules/a/node_modules/b': b,
      'node_modules/a/node_modules/b/node_modules/c': { version: '1.0.0', inBundle: true } })).problems).toEqual([]);
    // c podignut pod vlasnika a, treba ga bundled b
    expect(lockfileSourceProblems(lock({ 'node_modules/a': a, 'node_modules/a/node_modules/b': b,
      'node_modules/a/node_modules/c': { version: '1.0.0', inBundle: true } })).problems).toEqual([]);
    // c koji b ne treba, pod b i pod a
    for (const key of ['node_modules/a/node_modules/b/node_modules/x', 'node_modules/a/node_modules/x']) {
      expect(lockfileSourceProblems(lock({ 'node_modules/a': a, 'node_modules/a/node_modules/b': b,
        [key]: { version: '1.0.0', inBundle: true } })).problems, key).toHaveLength(1);
    }
    // ciklus bundled paketa bez veze s deklariranim bundleom (Codex R2 na #274)
    expect(lockfileSourceProblems(lock({ 'node_modules/a': a, 'node_modules/a/node_modules/b': { version: '1.0.0', inBundle: true },
      'node_modules/a/node_modules/x': { version: '1.0.0', inBundle: true, dependencies: { y: '1' } },
      'node_modules/a/node_modules/y': { version: '1.0.0', inBundle: true, dependencies: { x: '1' } } })).problems).toHaveLength(2);
    // vlasnik bez bundleDependencies ne moze nositi bundle
    expect(lockfileSourceProblems(lock({ 'node_modules/a': ok('a'), 'node_modules/a/node_modules/b': b,
      'node_modules/a/node_modules/b/node_modules/c': { version: '1.0.0', inBundle: true } })).problems.length).toBeGreaterThan(0);
  });

  it('lockfileVersion mora biti broj 3 (Codex F4)', () => {
    for (const v of [1, 2, 4, 999, '3', null, undefined]) {
      const input = { lockfileVersion: v, packages: { '': { name: 'x' }, 'node_modules/a': ok('a') } };
      expect(lockfileSourceProblems(input).problems, String(v))
        .toEqual([`lockfileVersion mora biti broj 3, a je ${JSON.stringify(v)}`]);
    }
  });

  it('necitljiv ili prazan lockfile nije zelen', () => {
    expect(lockfileSourceProblems({ lockfileVersion: 3, dependencies: {} }).problems).toHaveLength(1);
    expect(lockfileSourceProblems(null).problems).toHaveLength(1);
    expect(lockfileSourceProblems([]).problems).toHaveLength(1);
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

  it('security-audit.yml pokrece gard prije instalacije i npm audit, blokirajuce (baseline)', () => {
    const wf = readFileSync(resolve(process.cwd(), '.github', 'workflows', 'security-audit.yml'), 'utf8');
    expect(lockfileGuardWiringProblems(wf)).toEqual([]);
  });
});
