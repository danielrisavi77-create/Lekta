import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * NETLIFY I `dist-gate` MORAJU GRADITI ISTIM RUNTIMEOM I ISTIM LANCEM.
 *
 * Odluka vlasnika 2026-09-09: Netlify vise ne gradi na svaki push, nego tek kad se objava zatrazi.
 * To je sigurno SAMO zato sto `dist-gate` u `check.yml` vec vrti produkcijski build na svaki push,
 * pa se "gradi li se artefakt" zna i bez Netlifyja. Ta zamjena vrijedi dok su obje strane iste.
 *
 * Dok su se razlikovale (CI 24, Netlify 20), "CI zelen" nije znacilo "Netlify zelen", a upravo se
 * na to oslanjamo. Razlika je bila TIHA: nista je nije mjerilo, a otkrila se tek kad je produkcija
 * stala i kad se trazio uzrok.
 *
 * Gard usporedjuje DVIJE stvari, jer se raziden moze dogoditi na obje:
 *   1. verziju Nodea (`NODE_VERSION` u `netlify.toml` naspram `node-version` u `dist-gate` jobu);
 *   2. sam lanac naredbi (`command` naspram koraka "Produkcijski build").
 *
 * Drugu tvrdnju je lako podcijeniti: da netko doda generator u `netlify.toml` a ne u CI, CI bi i
 * dalje bio zelen nad artefaktom koji se ne isporucuje.
 */
const KORIJEN = process.cwd();
const TOML = readFileSync(join(KORIJEN, 'netlify.toml'), 'utf8');
const CI = readFileSync(join(KORIJEN, '.github/workflows/check.yml'), 'utf8');

/** Blok `dist-gate` joba; sve tvrdnje gledaju SAMO njega, ne cijeli workflow. */
function distGate(): string {
  const start = CI.indexOf('\n  dist-gate:');
  expect(start, 'job `dist-gate` ne postoji u check.yml').toBeGreaterThan(0);
  const rest = CI.slice(start + 1);
  const next = rest.search(/\n {2}[a-z][\w-]*:\n/);
  return next > 0 ? rest.slice(0, next) : rest;
}

/** Lanac se usporedjuje po KORACIMA, ne po nizu: razmaci i prijelomi nisu ugovor. */
function koraci(chain: string): string[] {
  return chain.split('&&').map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

describe('produkcijski build: Netlify i CI se ne smiju razici', () => {
  it('grade istom verzijom Nodea', () => {
    const netlify = /NODE_VERSION\s*=\s*"(\d+)"/.exec(TOML)?.[1];
    const ci = /node-version:\s*(\d+)/.exec(distGate())?.[1];
    expect(netlify, 'NODE_VERSION nije nadjen u netlify.toml').toBeTruthy();
    expect(ci, '`node-version` nije nadjen u dist-gate jobu').toBeTruthy();
    expect(ci, `CI gradi na Node ${ci}, Netlify na ${netlify}`).toBe(netlify);
  });

  it('grade istim lancem naredbi', () => {
    const netlifyChain = /command\s*=\s*"([^"]+)"/.exec(TOML)?.[1] ?? '';
    const ciChain = /run:\s*(npm run build [^\n]+)/.exec(distGate())?.[1] ?? '';
    expect(netlifyChain, 'build command nije nadjen u netlify.toml').toBeTruthy();
    expect(ciChain, 'produkcijski build korak nije nadjen u dist-gate jobu').toBeTruthy();

    // `verify-deploy-dist` je u CI-u ZASEBAN korak (`node scripts/verify-deploy-dist.mjs`), pa se
    // iz Netlifyjeva lanca izuzima; sve ostalo mora biti isto i istim redom.
    const netlifyKoraci = koraci(netlifyChain).filter((k) => !k.includes('verify-deploy-dist'));
    expect(distGate(), 'CI ne provjerava dist artefakt').toContain('verify-deploy-dist.mjs');
    expect(koraci(ciChain)).toEqual(netlifyKoraci);
  });

  it('SENTINEL: citaci stvarno nalazi sadrzaj, a ne prazan niz', () => {
    // Prazan `dist-gate` blok bi obje tvrdnje iznad ucinio vakuumskima.
    expect(distGate().length).toBeGreaterThan(400);
    expect(TOML.length).toBeGreaterThan(400);
  });
});
