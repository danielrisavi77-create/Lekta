/**
 * OZICENJE GATEA IZDANJA: tko ga zove, cime, i sto se ne smije tiho pomaknuti.
 *
 * `release-gate-cli.test.ts` dokazuje da ulazne tocke padaju kad trebaju. Ovdje se cuva ono sto se
 * time ne moze izmjeriti: da lanac objave koristi PUNI gate (a ne njegovu skracenu, testnu inacicu),
 * da razvojni CI i release gate ostaju dvije razlicite strogosti, i da popis obaveznih razina ima
 * jedan izvor istine.
 *
 * Ovo su tvrdnje o KONFIGURACIJI, pa se citaju iz datoteka. Sadrzaj se normalizira (CRLF -> LF) jer
 * repozitorij ima `core.autocrlf`, pa ista datoteka iz istog commita na disku ima dvije velicine
 * (CLAUDE.md: "gard koji cita datoteku s diska mora normalizirati CR").
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TIERS, requiredTierIds } from '../scripts/release-tiers.mjs';
import { BUILD_STEPS, VERIFY_STEP } from '../scripts/build-production.mjs';

const procitaj = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

const NETLIFY = procitaj('netlify.toml');
const CHECK_YML = procitaj('.github/workflows/check.yml');
const SMOKE_YML = procitaj('.github/workflows/post-deploy-smoke.yml');
const DEPLOY_GATE = procitaj('scripts/verify-deploy-dist.mjs');

describe('lanac objave zove PUNI gate', () => {
  it('nijedan potrosac ne koristi --proof-gate-only ni preusmjeravanje stabla', () => {
    // `--proof-gate-only` postoji zato da se gate moze mjeriti kao proces. Kad bi zavrsio u lancu
    // objave, deploy bi prolazio bez ijedne provjere sadrzaja dist/ i nitko to ne bi primijetio.
    for (const [ime, tekst] of [['netlify.toml', NETLIFY], ['check.yml', CHECK_YML], ['VERIFY_STEP', VERIFY_STEP]] as const) {
      expect(tekst, ime).not.toContain('--proof-gate-only');
      expect(tekst, ime).not.toContain('--root');
      expect(tekst, ime).not.toContain('--dist ');
    }
  });

  it('deploy gate zove collectReleaseGate tocno jednom i svaki nalaz vodi u fail()', () => {
    const pozivi = DEPLOY_GATE.match(/collectReleaseGate\(/g) ?? [];
    expect(pozivi).toHaveLength(1);
    expect(DEPLOY_GATE).toContain('if (gate.failures.length) fail(');
  });

  it('build-production i dalje vrti build-info prije provjere dist artefakta', () => {
    // Identitet artefakta se sada usporedjuje s commitom koji se gradi; da `build-info` ispadne iz
    // lanca, gate bi padao na (a) i to bi izgledalo kao kvar provjere, a bio bi kvar redoslijeda.
    expect(BUILD_STEPS).toContain('build-info');
    expect(BUILD_STEPS.indexOf('build-info')).toBeGreaterThan(BUILD_STEPS.indexOf('build'));
    expect(VERIFY_STEP).toBe('node scripts/verify-deploy-dist.mjs');
  });
});

describe('razvojni CI i release gate su dvije razlicite strogosti', () => {
  it('netlify (objava) trazi dokaz izdanja, dist-gate (razvojni CI) ne', () => {
    expect(NETLIFY).toContain('LEKTA_REQUIRE_RELEASE_PROOF = "1"');
    // Dokaz se pece lokalno jer trazi Word, pa bi obavezan dokaz na svakom pushu blokirao CI.
    expect(CHECK_YML).not.toContain('LEKTA_REQUIRE_RELEASE_PROOF');
  });

  it('periodicki nadzor ostaje blag: cron ne smije dobiti --strict-commit', () => {
    // Zakljucana objava namjerno zaostaje za masterom (vlasnik, 2026-09-09). Strogi mod ondje bi bio
    // stalna crvena koju svi nauce ignorirati, i time bi se izgubio i signal koji nadzor daje.
    expect(SMOKE_YML).toContain('--expect-commit');
    expect(SMOKE_YML).not.toContain('--strict-commit');
  });
});

describe('popis razina ima jedan izvor istine', () => {
  it('release-check cita TIERS iz release-tiers.mjs, ne iz vlastite kopije', () => {
    const releaseCheck = procitaj('scripts/release-check.mjs');
    expect(releaseCheck).toContain("import { TIERS } from './release-tiers.mjs'");
    expect(releaseCheck).not.toMatch(/const TIERS = \[/);
  });

  it('obavezne razine su tocno one koje su i bile (ux-dist i extraction ostaju neobavezne)', () => {
    expect(requiredTierIds()).toEqual(['check', 'conformance', 'slow', 'ux', 'strict-open', 'word', 'word-worst']);
    const neobavezne = TIERS.filter((t: { required?: boolean }) => !t.required).map((t: { id: string }) => t.id);
    expect(neobavezne).toEqual(['projections', 'ux-dist', 'extraction']);
  });
});
