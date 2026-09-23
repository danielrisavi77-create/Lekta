import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeSiteStats, computePlateIndex } from '../src/coverage/site-stats';

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
 * OD F8 (2026-09-23) `site-stats.json` UZ TO NOSI I `units` (unitId -> kratica i naziv ustanove) za
 * `/saznaj-vise/`. TRAKA (`src/shared/site-chrome.ts`) taj JSON od ovog kruga NE UVOZI, jer naziv
 * gura njen bundle blizu granice (191 B rezerve); umjesto toga cita mali `unit-kratice.json`
 * (`computePlateIndex`), bez `naziv` polja. Formula i pravilo izvodjenja kratice zive u
 * `src/coverage/site-stats.ts`, ne ovdje, jer ih generator i `tests/site-stats.test.ts` moraju
 * DIJELITI: da su u skripti, test bi ih morao prepisati i usporedba pecenog sa svjezim izracunom
 * bila bi usporedba dvije kopije istog koda.
 *
 * Obnova: `npm run gen-site-stats`.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stats = computeSiteStats();
const plate = computePlateIndex();
mkdirSync(join(root, 'data', 'coverage'), { recursive: true });
writeFileSync(join(root, 'data', 'coverage', 'site-stats.json'), `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
writeFileSync(join(root, 'data', 'coverage', 'unit-kratice.json'), `${JSON.stringify(plate, null, 2)}\n`, 'utf8');
console.log(`[gen-site-stats] profila ${stats.profiles}, ustanova ${stats.institutions}, javnih radova ${stats.works}`);
// Ispisano odvojeno, jer je pecen za plocicu profila (F8) i mora pasti u oko kad presusi: prazan
// indeks je zeleno pecenje bez sadrzaja, a to je kvar koji se na naslovnici ne vidi.
console.log(`[gen-site-stats] plocica (unit-kratice.json): ${Object.keys(plate.units).length} jedinica, ${Object.keys(plate.workTypes).length} razina rada`);
