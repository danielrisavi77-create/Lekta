/**
 * Snapshot generator za M4 hrvatski korpus (lekta-pipeline/korpus.db, zaseban gitignorean
 * pipeline projekt) -> data/coverage/corpus-stats.json u GLAVNOM repou.
 *
 * korpus.db (SQLite, ~1.4 GB) nikad ne ulazi u ovaj repo (.gitignore blokira *.db) i ne
 * postoji na drugim strojevima/CI, pa web tier ne moze citati bazu live. Ova skripta je
 * RUCNI, jednokratni korak (kao scripts/gen-verified-split.mjs): pokrene se kad zelis
 * osvjeziti javnu brojku, snapshot se commita, src/coverage/coverage-loader.ts ga cita
 * staticki kao i sve ostalo u data/**. NIJE dio `npm run check` (build ne smije ovisiti
 * o datoteci koje nema u svjezem checkoutu).
 *
 * Pokreni:  node scripts/gen-corpus-stats.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = join(root, 'lekta-pipeline/korpus.db');

if (!existsSync(dbPath)) {
  console.error(
    `[gen-corpus-stats] ${dbPath} ne postoji. Ova skripta je opcionalna i ocekuje lekta-pipeline\n` +
    'checkout uz gradjeni korpus.db; bez njega data/coverage/corpus-stats.json ostaje na zadnjem snapshotu.',
  );
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const works = db.prepare('SELECT COUNT(*) AS n FROM works').get().n;
const bySource = db.prepare('SELECT repo, COUNT(*) AS n FROM works GROUP BY repo').all();
db.close();

const sources = Object.fromEntries(bySource.map((r) => [r.repo, r.n]));
const sourceSum = Object.values(sources).reduce((a, b) => a + b, 0);

if (!(works > 400000)) throw new Error(`[gen-corpus-stats] works=${works} ispod ocekivanog poda (sanity floor 400000).`);
if (sourceSum !== works) throw new Error(`[gen-corpus-stats] zbroj po izvoru (${sourceSum}) != works (${works}).`);

const snapshot = {
  works,
  sources,
  generatedAt: new Date().toISOString().slice(0, 10),
};

writeFileSync(join(root, 'data/coverage/corpus-stats.json'), JSON.stringify(snapshot, null, 2) + '\n');
console.log(`corpus-stats.json: ${works} radova (${Object.entries(sources).map(([k, v]) => `${k}=${v}`).join(', ')}).`);
