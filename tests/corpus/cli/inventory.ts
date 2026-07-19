/**
 * CLI: generiraj inventar provjera i zapisi artefakte (faza 1 Lekta Error Corpus).
 *
 *   npx vite-node tests/corpus/cli/inventory.ts
 *   npm run corpus:inventory
 *
 * Zapisuje u tests/corpus/generated/:
 *   - current-check-inventory.json  (strojno citljiv inventar)
 *   - current-check-inventory.md    (pregled za ljude)
 *   - profile-check-matrix.csv      (profil x bodovana dimenzija)
 * i ispisuje "prvi konkretni output" (broj provjera, nalaza, intake kodova, profila).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildInventory, renderMarkdown, renderMatrixCsv } from '../inventory/extract-check-inventory';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../generated');

async function main() {
  const inv = await buildInventory();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'current-check-inventory.json'), JSON.stringify(inv, null, 2) + '\n');
  writeFileSync(resolve(OUT, 'current-check-inventory.md'), renderMarkdown(inv));
  writeFileSync(resolve(OUT, 'profile-check-matrix.csv'), renderMatrixCsv(inv));

  const c = inv.counts;
  const provenIntake = inv.intakeCodes.filter((x) => x.proven && x.code !== 'suspicious').length;
  console.log('=== Lekta inventar provjera (faza 1) ===');
  console.log(`1) Provjere (makeCheck):        ${c.checks}  (bodovane ${c.scoredChecks}, informativne ${c.informativeChecks}, dinamicne/neokinute ${c.dynamicScoredChecks})`);
  console.log(`2) Jedinstveni naslovi nalaza:  ${c.uniqueIssueTitles}`);
  console.log(`3) Intake reject kodovi:        ${c.intakeRejectCodes}  (runtime-dokazano ${provenIntake}/${c.intakeRejectCodes}${inv.intakeCodes.some((x) => x.code === 'suspicious' && x.proven) ? ' + suspicious' : ''})`);
  console.log(`4) Profili u registru:          ${c.profiles}`);
  console.log(`5) COMPILED_CHECK_IDS:          ${c.compiledCheckIds}`);
  console.log(`6) Runtime uzorak profila:      ${inv.meta.runtimeProfileSample.length} profila`);
  console.log(`   Provjere bez stabilnog ID-a: ${c.checks} (svi; stabilni ID = faza 2)`);
  console.log(`   Provjere bez staticke lokacije (samo runtime): ${c.checksWithoutSource}`);
  console.log('');
  console.log(`Artefakti: ${resolve(OUT, 'current-check-inventory.json')}`);
  console.log(`           ${resolve(OUT, 'current-check-inventory.md')}`);
  console.log(`           ${resolve(OUT, 'profile-check-matrix.csv')}`);
}

main().catch((e) => { console.error('[corpus:inventory]', e?.stack || e?.message || e); process.exit(1); });
