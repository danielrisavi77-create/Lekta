import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeSiteStats } from '../src/coverage/site-stats';

/**
 * PECENE BROJKE ZA TRAKU NA `/`: "N studijskih profila · M ustanova · K javnih radova".
 *
 * Do 2026-09-05 su se te brojke racunale ZIVO na naslovnici (`renderHeroCoverage` u app.ts) iz
 * laganog registra profila (194 KB JSON), kataloga (73 KB) i korpusne statistike. Cisti ulaz `/`
 * te podatke ne smije vuci: uvoz registra sam bi bio veci od cijele stranice. Zato se brojke peku
 * ovdje, iz ISTE formule, u `data/coverage/site-stats.json` (PUBLIC, smije u bundle), a
 * `tests/site-stats.test.ts` tvrdi da je pecena vrijednost jednaka svjezem izracunu, pa zastarjela
 * brojka pada u gateu umjesto da tiho stoji na naslovnici.
 *
 * Obnova: `npm run gen-site-stats`.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stats = computeSiteStats();
mkdirSync(join(root, 'data', 'coverage'), { recursive: true });
writeFileSync(join(root, 'data', 'coverage', 'site-stats.json'), `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
console.log(`[gen-site-stats] profila ${stats.profiles}, ustanova ${stats.institutions}, javnih radova ${stats.works}`);
