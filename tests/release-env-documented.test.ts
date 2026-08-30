/**
 * Gard: varijabla koja GATE-a objavu mora biti popisana u `.env.example`.
 *
 * Zasto postoji, izmjereno 2026-08-30: `npm run release:check` ima razinu `extraction` s
 * `required: true` i `requiresEnv: 'LEKTA_STAGING_ORIGIN'`, a ta varijabla nije postojala NIGDJE
 * osim u dvije skripte koje je citaju: ni u `.env.example`, ni u `netlify.toml`, ni u `.github/`,
 * ni u `docs/`. Posljedica nije kozmeticka: bez nje je razina `unavailable`, a kako je `required`,
 * `RELEASE_PROOF.json` ostaje `complete: false`, pa `verify-deploy-dist` uz
 * `LEKTA_REQUIRE_RELEASE_PROOF=1` (sto `master` postavlja) TVRDO pada. Dakle: potpun dokaz o
 * provjerama nije mogao proizvesti nitko tko slijedi konfiguraciju iz repozitorija, a poruka o
 * gresci imenuje varijablu koju operater nema gdje procitati.
 *
 * Ista rupa je zatekla jos dvije zastavice koje odlucuju o objavi: `LEKTA_REQUIRE_RELEASE_PROOF`
 * (tvrdi deploy gate) i `LEKTA_REPAIR_LIVE` (beta placenog popravka).
 *
 * Popis se IZVODI iz skripti, nikad ne prepisuje rucno: gard koji nosi vlastiti popis stiti samo
 * ono cega se netko sjetio, a upravo je zaboravljanje bilo kvar.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const GATE_SCRIPTS = ['scripts/release-check.mjs', 'scripts/verify-deploy-dist.mjs'];

function sourceOf(relative: string): string {
  return readFileSync(join(ROOT, relative), 'utf8');
}

/** Sve `LEKTA_*` varijable koje gate skripte citaju, bilo kroz `process.env` bilo kroz `requiresEnv`. */
function gateVariables(): string[] {
  const found = new Set<string>();
  for (const relative of GATE_SCRIPTS) {
    const src = sourceOf(relative);
    for (const m of src.matchAll(/process\.env\.(LEKTA_[A-Z0-9_]+)/g)) found.add(m[1]);
    for (const m of src.matchAll(/requiresEnv:\s*'([A-Z0-9_]+)'/g)) found.add(m[1]);
  }
  return [...found].sort();
}

/** Imena varijabli deklarirana u `.env.example` (oblik `NAME=`). */
function documentedVariables(): Set<string> {
  const out = new Set<string>();
  for (const m of sourceOf('.env.example').matchAll(/^([A-Z0-9_]+)=/gm)) out.add(m[1]);
  return out;
}

describe('release/deploy varijable su dokumentirane', () => {
  it('mjeri netrivijalan broj gate varijabli', () => {
    // Bez ovoga bi pokvaren izvod (nula pogodaka) prosao kao cist gard, isto lazno zeleno
    // kao prazan skup u klasifikacijskom manifestu.
    expect(gateVariables().length).toBeGreaterThanOrEqual(4);
  });

  it('`.env.example` uopce ima sadrzaj koji se da procitati', () => {
    expect(documentedVariables().size).toBeGreaterThan(50);
  });

  it('svaka gate varijabla je popisana u `.env.example`', () => {
    const documented = documentedVariables();
    const missing = gateVariables().filter((name) => !documented.has(name));
    expect(missing, `nedokumentirane gate varijable: ${missing.join(', ')}`).toEqual([]);
  });

  /**
   * Najostriji slucaj: razina koja je `required` a ovisi o varijabli. Ako ta varijabla nije
   * dokumentirana, potpun dokaz je NEDOSTIZAN, a to je tocno stanje zateceno 2026-08-30.
   */
  it('svaka OBVEZNA razina s `requiresEnv` ima dokumentiranu varijablu', () => {
    const src = sourceOf('scripts/release-check.mjs');
    const documented = documentedVariables();
    const offenders: string[] = [];
    for (const line of src.split('\n')) {
      if (!line.includes('requiresEnv')) continue;
      if (!/required:\s*true/.test(line)) continue;
      const name = /requiresEnv:\s*'([A-Z0-9_]+)'/.exec(line)?.[1];
      if (name && !documented.has(name)) offenders.push(name);
    }
    expect(offenders, `obvezna razina ovisi o nedokumentiranoj varijabli: ${offenders.join(', ')}`).toEqual([]);
  });
});
