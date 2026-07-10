/**
 * Promocija predlozaka naslovnice iz draft u verified (ljudska verifikacija odradjena).
 * Postavlja status="verified" i provenance.verifiedAt na zadani datum svima (ili filtru
 * --units). Bez imena verifikatora (odluka vlasnika: samo datum u javnim podacima).
 * Idempotentno; ne mijenja broj zapisa (manifest ostaje isti).
 *
 * Pokretanje: node scripts/title-pages/promote-verified.mjs [--date 2026-07-10] [--units a,b]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATES_PATH = join(ROOT, 'data', 'title-pages', 'templates.json');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
// Datum se prosljedjuje eksplicitno (skripta ne poziva Date.now radi determinizma/reproducibilnosti).
const date = arg('--date', '2026-07-10');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`Nevaljan --date "${date}" (ocekivano YYYY-MM-DD)`);
  process.exit(1);
}
const unitFilter = arg('--units', null);
const units = unitFilter ? new Set(unitFilter.split(',')) : null;

const templates = JSON.parse(readFileSync(TEMPLATES_PATH, 'utf8'));
let promoted = 0;
for (const t of templates) {
  if (units && !units.has(t.unitId)) continue;
  if (t.status !== 'verified') { t.status = 'verified'; promoted++; }
  t.provenance.verifiedAt = date;
}
writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2) + '\n');

const by = { official: 0, derived: 0 };
for (const t of templates) by[t.provenance.status]++;
console.log(`promovirano ${promoted} u verified (verifiedAt=${date}); ukupno ${templates.length} (official ${by.official}, derived ${by.derived}), svi verified`);
