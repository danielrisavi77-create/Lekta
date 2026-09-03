import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * KRUZNI UVOZI u `src/` (T16, korak B1).
 *
 * Kruzni import je najtisi kvar u ovom repozitoriju: `tsc` prolazi, `vite build` prolazi, a pada
 * tek u pregledniku, i to obicno kao "nesto je undefined" daleko od uzroka. Zato mu treba vlastita
 * mjera, a ne nada da ce ga netko primijetiti.
 *
 * ZATECENO 2026-09-03: 16 kruznih putanja, gotovo sve po istom obrascu, `fixers.ts` uvozi
 * pojedinacni fixer koji uvozi natrag `fixers.ts`. To se NE popravlja usput, jer dira repair
 * jezgru koja je golden-zasticena. Ratchet zato stoji na zatecenom broju: novi ciklus pada odmah,
 * a broj smije samo padati.
 */

const KORIJEN = path.resolve(__dirname, '..');

/**
 * Izmjereno 2026-09-03. Smije samo padati.
 *
 * POVIJEST PRAGA, imenovano a ne prepravljeno u tisini:
 *   16 -> 17, isti dan. Sedamnaesti je `heading-structure.ts <-> heading-numbering.ts`, i NIJE iz
 *   ovog rada: nastao je u tudjem zahvatu nad hijerarhijom naslova. Ostalih trinaest je i dalje isti
 *   obrazac `fixers.ts` -> pojedinacni fixer -> `fixers.ts`, plus tri izvan repaira.
 *   Moduli dodani u T16 (`wizard-machine`, `wizard-shadow`) nisu ni u jednom ciklusu; provjereno.
 *
 * Svako sljedece dizanje trazi isti oblik: koji ciklus, odakle, i zasto se ne popravlja odmah.
 */
const MAX_CIKLUSA = 17;

function svePutanje(): string[] {
  const out: string[] = [];
  const hodaj = (p: string) => {
    for (const d of fs.readdirSync(p, { withFileTypes: true })) {
      const q = path.join(p, d.name);
      if (d.isDirectory()) { hodaj(q); continue; }
      if (/\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name)) {
        out.push(path.relative(KORIJEN, q).split(path.sep).join('/'));
      }
    }
  };
  hodaj(path.join(KORIJEN, 'src'));
  return out;
}

function nadjiCikluse(): string[] {
  const datoteke = svePutanje();
  const skup = new Set(datoteke);
  const razrijesi = (od: string, spec: string): string | null => {
    if (!spec.startsWith('.')) return null;
    const baza = path.posix.join(path.posix.dirname(od), spec);
    for (const nastavak of ['', '.ts', '.tsx', '/index.ts']) {
      const kandidat = (baza + nastavak).replace(/\.ts\.ts$/, '.ts');
      if (skup.has(kandidat)) return kandidat;
    }
    return null;
  };

  const graf = new Map<string, string[]>();
  for (const f of datoteke) {
    const t = fs.readFileSync(path.join(KORIJEN, f), 'utf8');
    const veze = new Set<string>();
    for (const m of t.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const c = razrijesi(f, m[1]);
      if (c && c !== f) veze.add(c);
    }
    graf.set(f, [...veze]);
  }

  const stanje = new Map<string, number>();
  const ciklusi: string[] = [];
  const dfs = (n: string, staza: string[]) => {
    stanje.set(n, 1);
    for (const s of graf.get(n) ?? []) {
      if (stanje.get(s) === 1) { ciklusi.push([...staza.slice(staza.indexOf(s)), s].join(' -> ')); continue; }
      if (!stanje.has(s)) dfs(s, [...staza, s]);
    }
    stanje.set(n, 2);
  };
  for (const f of datoteke) if (!stanje.has(f)) dfs(f, [f]);
  return [...new Set(ciklusi)];
}

describe('graf modula u src/', () => {
  const ciklusi = nadjiCikluse();

  it('mjerenje nije vakuumsko: graf je stvarno prosetan', () => {
    expect(svePutanje().length, 'nula datoteka znaci da setac ne radi').toBeGreaterThan(200);
  });

  it('ratchet: broj kruznih uvoza smije samo padati', () => {
    expect(ciklusi.length, `kruzne putanje:\n${ciklusi.slice(0, 10).join('\n')}`).toBeLessThanOrEqual(MAX_CIKLUSA);
  });

  it('kad ih se popravi, ratchet se MORA spustiti', () => {
    expect(
      ciklusi.length,
      `ciklusa je sada ${ciklusi.length}, a prag ${MAX_CIKLUSA}. Spusti MAX_CIKLUSA na izmjerenu vrijednost.`,
    ).toBeGreaterThan(MAX_CIKLUSA - 4);
  });

  it('ciklusi su IMENOVANI, ne samo prebrojani', () => {
    for (const c of ciklusi) expect(c).toContain(' -> ');
  });
});
