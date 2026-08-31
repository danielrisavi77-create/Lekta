/**
 * Sintaksa svake `.mjs` skripte u `scripts/`.
 *
 * ZASTO POSTOJI: 2026-08-31 je komentar dodan unutar template literala (`PAGE_STYLE` u
 * `generate-faculty-pages.mjs`) sadrzavao backtickove, koji literal PREKIDAJU. Datoteka je time
 * postala sintaksno neispravna, `node --check` je padao, a `npm run check` to NIJE vidio jer
 * `tsconfig.json` ima `include: ["src"]`, pa se `scripts/**` ne provjerava nicim.
 *
 * Cijena je bila deploy, ne test: `netlify.toml` ulancava korake s `&&`, pa bi pao cijeli build,
 * nula generiranih fakultetskih stranica, a `verify-deploy-dist.mjs` se ne bi ni izvrsio. Kvar je
 * pritom bio nevidljiv u svakom lokalnom prolazu jer nijedan test tu skriptu ne uvozi.
 *
 * Ovo je najjeftiniji dio backloga 7 iz CLAUDE.md (ukljucivanje `scripts/` i `tests/` u tsconfig):
 * ne tipizira nista, ali hvata bas onaj razred koji je do deploya i doveo.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptsDir = join(root, 'scripts');

/**
 * `scripts/workflows/**` se NE provjerava, i to je jedina iznimka.
 *
 * Te datoteke nisu samostalni ES moduli nego TIJELA workflow skripti koja se izvode unutar omotaca,
 * pa smiju imati `return` na najvisoj razini. `node --check` ih zato odbija s "Illegal return
 * statement", i to je tocno ponasanje, ne kvar. Iznimka je NABROJANA, a ne obrazac, da se pod nju ne
 * moze slucajno gurnuti obicna skripta.
 */
const IZUZETI_DIREKTORIJI = ['workflows'];

function mjsFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (IZUZETI_DIREKTORIJI.includes(e.name)) continue;
      out.push(...mjsFiles(join(dir, e.name), rel));
    }
    else if (e.name.endsWith('.mjs')) out.push(rel);
  }
  return out.sort();
}

describe('scripts/: svaka .mjs datoteka je sintaksno ispravna', () => {
  const files = mjsFiles(scriptsDir);

  it('mjeri netrivijalan broj skripti', () => {
    // Bez ovoga bi promasen put ili preimenovan direktorij dao prazan skup i cist prolaz.
    expect(files.length, 'ocekuje se desetak i vise .mjs skripti').toBeGreaterThan(50);
  });

  it.each(files)('%s', (rel) => {
    // `node --check` ne IZVODI skriptu, samo je parsira, pa je sigurno pustiti sve.
    expect(() => {
      execFileSync(process.execPath, ['--check', join(scriptsDir, rel)], { stdio: 'pipe' });
    }, `${rel} nije sintaksno ispravna`).not.toThrow();
  });
});
