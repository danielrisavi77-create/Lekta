/**
 * Sintaksa svake `.mjs` skripte u `scripts/`, mjerena BAS ONIM parserom koji te skripte izvodi.
 *
 * ISPRAVAK VLASTITE TVRDNJE (2026-08-31): prva verzija ovog zaglavlja tvrdila je da `npm run check`
 * kvar "NIJE vidio jer se `scripts/**` ne provjerava nicim". TO JE BILO NETOCNO. `oxlint` je u
 * gateu od `9c0b9d46` (2026-08-24), dakle tjedan dana prije, i `check` pocinje bas njime. Izmjereno
 * naknadno: uz vracen backtick oxlint prijavi `generate-faculty-pages.mjs:462:73`. Kvar mi je
 * promakao jer sam vrtio `tsc`, `vitest` i `vite build` ODVOJENO, a nikad sam `check`.
 *
 * ZASTO GARD SVEJEDNO OSTAJE: `node --check` i oxlint NISU isti parser i mjerljivo se razilaze.
 * `scripts/workflows/*.mjs` su tijela workflow skripti s `return` na najvisoj razini: `node --check`
 * ih odbija ("Illegal return statement"), oxlint ih prihvaca (0 errora). Deploy izvodi
 * `node scripts/...`, pa je Nodeov parser mjerodavan za pitanje "hoce li se ovo uopce pokrenuti".
 *
 * Ovaj gard zato NE dijeli posao s oxlintom nego mjeri drugu stvar: Nodeovu modulnu semantiku.
 * `.mts` i `.ts` namjerno NISU ovdje: njih oxlint stvarno pokriva (provjereno podmetnutim kvarom u
 * `corpus-ingest.mts` -> `error: Unexpected token`), a TypeScript 7 vise ne izlaze klasicni
 * compiler API (`ts.ScriptTarget` je `undefined`), pa bi vlastiti parser bio i suvisan i nemoguc.
 *
 * Cijena propusta je bila deploy, ne test: `netlify.toml` ulancava korake s `&&`, pa pad jedne
 * skripte znaci nula generiranih stranica i `verify-deploy-dist.mjs` koji se nikad ne izvrsi.
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
