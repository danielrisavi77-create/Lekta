/**
 * Gard: svaka npm skripta mora gadjati COMMITANU datoteku.
 *
 * Zasto postoji, izmjereno 2026-09-04/05: `package.json` je commitan i nosi
 * `corpus-gen:libreoffice`, koji pokazuje na `scripts/corpus-gen/libreoffice.mjs` -- datoteku koja u
 * gitu nije postojala. Na cistom checkoutu ta naredba ne radi, a nista to nije prijavljivalo.
 *
 * `npm run orphan-scan` taj razred NE POKRIVA i to nije propust nego opseg: on trazi commitane
 * module koji UVOZE necommitan simbol, dakle gleda `import`, a npm skripta nije uvoz nego staza u
 * nizu. Oba su ista bolest ("commitani ovisnik uz necommitanu ovisnost"), ali kroz dva razlicita
 * kanala, pa trebaju dvije provjere.
 *
 * KLJUC: mjeri se `git ls-files`, NE postojanje na disku. Provjera nad radnim stablom ovdje uvijek
 * prolazi, jer netrackane datoteke ondje postoje; izmjereno je da ista provjera nad diskom daje 0
 * nedostajucih, a nad commitanim stanjem 1. Isti razred kao gate koji mjeri stablo umjesto HEAD-a.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const scripts = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
}).scripts;

/** Staze koje se u naredbi predaju izvrsitelju (node, vite-node, python, tsx). */
function targetsOf(cmd: string): string[] {
  const out: string[] = [];
  for (const m of cmd.matchAll(/(?:node|vite-node|npx vite-node|python|python3|tsx)\s+([A-Za-z0-9_./-]+\.(?:mjs|mts|ts|js|py))/g)) {
    out.push(m[1]);
  }
  return out;
}

const tracked = new Set(
  execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n'),
);

/**
 * Zateceno 2026-09-05: JEDNA. Popis smije samo PADATI.
 *
 * `scripts/corpus-gen/libreoffice.mjs` je dio necommitanog rada na generatoru korpusa; commitanje je
 * u tijeku u drugoj sesiji. Kad slegne, ovaj popis ide na prazan i tvrdnja postaje bezuvjetna.
 */
const NECOMMITANE_RATCHET = ['scripts/corpus-gen/libreoffice.mjs'];

function missing(): string[] {
  const out: string[] = [];
  for (const cmd of Object.values(scripts)) {
    for (const t of targetsOf(cmd)) if (!tracked.has(t)) out.push(t);
  }
  return [...new Set(out)].sort();
}

describe('npm skripte gadjaju commitane datoteke', () => {
  it('nijedna skripta ne pokazuje na necommitanu datoteku, osim zatecenih', () => {
    expect(missing()).toEqual([...NECOMMITANE_RATCHET].sort());
  });

  it('ratchet smije samo padati', () => {
    expect(NECOMMITANE_RATCHET.length).toBeLessThanOrEqual(1);
  });

  /** Mjeri se commitano stanje, ne disk; inace provjera prolazi vakuumski u svakom radnom stablu. */
  it('popis trackanih datoteka nije prazan', () => {
    expect(tracked.size, 'prazan popis znaci da git nije procitan, ne da je sve u redu').toBeGreaterThan(100);
  });

  /** NEGATIVNA KONTROLA: detektor mora vidjeti metu koje nema. */
  it('detektor prijavi izmisljenu metu', () => {
    expect(targetsOf('node scripts/ne-postoji.mjs')).toEqual(['scripts/ne-postoji.mjs']);
    expect(tracked.has('scripts/ne-postoji.mjs')).toBe(false);
  });

  /** I kontrolu u drugom smjeru: postojeca meta se NE smije prijaviti. */
  it('postojeca meta se ne prijavljuje', () => {
    expect(tracked.has('scripts/orphan-scan.mjs')).toBe(true);
  });
});
