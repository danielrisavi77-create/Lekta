/**
 * Jedan lanac izgradnje za Netlify i CI (plan T03).
 *
 * `netlify.toml` i `dist-gate` u `check.yml` moraju zvati ISTU skriptu, a skripta mora proizvoditi doslovno
 * onaj niz koraka koji je do 2026-09-09 stajao prepisan na oba mjesta. Bez ovoga generator dodan samo na
 * jednoj strani daje CI koji gradi drukciji `dist/` od hostinga, a to je bas razred kvara iz nalaza 3
 * vanjskog audita (javna stranica naspram mastera).
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUILD_STEPS, buildCommandLine, runBuild } from '../scripts/build-production.mjs';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

describe('build-production: jedan lanac za oba potrosaca', () => {
  it('netlify.toml zove skriptu, ne prepisan niz naredbi', () => {
    const toml = read('netlify.toml');
    const command = toml.match(/^\s*command\s*=\s*"([^"]+)"/m)?.[1];
    expect(command).toBe('node scripts/build-production.mjs');
  });

  it('dist-gate zove istu skriptu (bez verify, jer je provjera zaseban imenovan korak) i potom verify', () => {
    const yml = read('.github/workflows/check.yml');
    expect(yml).toContain('node scripts/build-production.mjs --skip-verify');
    expect(yml).toContain('node scripts/verify-deploy-dist.mjs');
    // Stari prepisani niz ne smije prezivjeti nigdje u workflowu.
    expect(yml).not.toMatch(/npm run build && npm run build-info/);
  });

  it('lanac je onaj koji je stajao u netlify.toml do 2026-09-09, i verify je zadnji', () => {
    expect(buildCommandLine()).toBe(
      'npm run build && npm run build-info && npm run generate-citation-tools && npm run generate-legal-pages'
      + ' && npm run generate-coverage-page && npm run generate-faculty-pages && npm run generate-title-page-tools'
      + ' && npm run generate-competitor-pages && node scripts/verify-deploy-dist.mjs',
    );
    expect(buildCommandLine({ verify: false })).not.toContain('verify-deploy-dist');
    expect(BUILD_STEPS[0]).toBe('build');
    expect(BUILD_STEPS[1]).toBe('build-info');
  });

  it('svaki korak postoji kao npm skripta', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    for (const step of BUILD_STEPS) expect(pkg.scripts[step], step).toBeDefined();
  });

  it('runBuild staje na prvom padu i vraca njegov kod (mutacija: skripta ne smije nastaviti nakon pada)', () => {
    // Dry: pokreni u praznom direktoriju gdje `npm run build` nema package.json pa pada odmah.
    const logs: string[] = [];
    const code = runBuild({ cwd: resolve(ROOT, 'node_modules/.bin'), log: (m: string) => logs.push(m) });
    expect(code).not.toBe(0);
    expect(logs.some((l) => l.includes('PAD u koraku "npm run build"'))).toBe(true);
    expect(logs.some((l) => l.includes('build-info'))).toBe(false);
  });
});
