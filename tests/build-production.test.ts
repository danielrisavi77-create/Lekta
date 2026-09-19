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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { BUILD_STEPS, buildCommandLine, runBuild } from '../scripts/build-production.mjs';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

/**
 * Najblizi korijen paketa iznad `from`, po istom pravilu po kojem ga trazi npm: hodaj UZBRDO dok ne
 * nadjes direktorij s `package.json`. Vraca `null` samo ako ga nema sve do korijena datotecnog sustava.
 *
 * Postoji da bi dry run ispod mogao TVRDITI u kojem paketu ce `npm run` zavrsiti, umjesto da se to
 * pretpostavlja. Cista funkcija, bez pokretanja npm-a.
 */
function nearestPackageRoot(from: string): string | null {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

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

  it('cwd unutar repozitorija NIJE prazan direktorij: razrjesuje se u korijen paketa (zato dry run ide izvan njega)', () => {
    // Gard nad gardom ispod. Do 2026-09-13 je dry run isao u `node_modules/.bin` uz komentar da je to
    // "prazan direktorij gdje `npm run build` nema package.json". Nije: npm korijen paketa trazi hodanjem
    // UZBRDO, pa je iz `node_modules/.bin` nalazio korijen samog repozitorija i test je vrtio PRAVI build.
    // U worktreeu s junctionom na `node_modules` je jos gore: `npm prefix` iz te staze fizicki razrjesuje
    // junction, pa je izmjereno vratio korijen DIJELJENOG stabla (C:/Users/PC/Desktop/Lekta), ne worktreea.
    // Test je pritom bio zelen samo zato sto je taj pravi build slucajno padao; da uspije, tvrdnja
    // `expect(code).not.toBe(0)` pada, a build usput prazni i prepisuje tudji `dist/`.
    expect(nearestPackageRoot(resolve(ROOT, 'node_modules/.bin'))).toBe(ROOT);
  });

  it('runBuild staje na prvom padu i vraca njegov kod (mutacija: skripta ne smije nastaviti nakon pada)', () => {
    // Dry run ide u IZOLIRAN privremeni direktorij s VLASTITIM `package.json` bez skripte `build`, pa
    // `npm run build` padne odmah ("Missing script", izmjereno: status 1) i nijedan pravi build se ne
    // pokrene. Vlastiti `package.json` u samom cwd-u zaustavlja npm-ov pogled uzbrdo, pa ishod ne ovisi
    // ni o tome sto stoji iznad privremenog direktorija.
    const dir = mkdtempSync(join(tmpdir(), 'lekta-build-production-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'lekta-build-production-dry', private: true, version: '0.0.0', scripts: {} }),
      );
      // Bez ove tvrdnje bi dry run mogao neopazeno zavrsiti u nekom pravom paketu (upravo kvar iznad).
      expect(nearestPackageRoot(dir)).toBe(dir);
      expect(nearestPackageRoot(dir)).not.toBe(ROOT);

      const logs: string[] = [];
      const code = runBuild({ cwd: dir, log: (m: string) => logs.push(m) });
      expect(code).not.toBe(0);
      expect(logs.some((l) => l.includes('PAD u koraku "npm run build"'))).toBe(true);
      expect(logs.some((l) => l.includes('build-info'))).toBe(false);
      // Pravi build bi ovdje ostavio `dist/`; dry run ne smije ostaviti nista osim vlastitog package.json.
      expect(existsSync(join(dir, 'dist'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
