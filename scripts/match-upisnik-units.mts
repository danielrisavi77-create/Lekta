/**
 * CLI: prijedlog uparivanja sastavnica iz Upisnika s nasim jedinicama
 * (docs/generated/upisnik-unit-match.json), P1-6 u docs/PLAN_POTPUNA_POKRIVENOST.md.
 *
 *   npx vite-node scripts/match-upisnik-units.mts
 *   npm run match-upisnik-units
 *
 * Skripta NIKAD nista ne upisuje u registar programa. Proizvodi PRIJEDLOG koji covjek pregleda:
 * svaki izvoditelj dobiva najbolju jedinicu, razinu pouzdanosti, razlog i alternative. Prijenos u
 * registar je zaseban korak, jer je uparivanje prosudba, ne string-match.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ZAGREB_CATALOG } from '../src/catalog/catalog-loader';
import { buildMatchReport, type CatalogUnitInput } from '../src/programs/unit-match';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const draft = JSON.parse(
  readFileSync(join(root, 'data', 'programs', 'drafts', 'upisnik.json'), 'utf8'),
) as { rows: Array<{ izvoditelj: string }> };

const units: CatalogUnitInput[] = ZAGREB_CATALOG.flatMap((institution) =>
  institution.units.map((unit) => ({
    unitId: unit.id,
    unitName: unit.name,
    institutionName: institution.name,
  })),
);

const report = buildMatchReport(draft.rows, units);

mkdirSync(join(root, 'docs', 'generated'), { recursive: true });
writeFileSync(
  join(root, 'docs', 'generated', 'upisnik-unit-match.json'),
  JSON.stringify(report, null, 2) + '\n',
);

const s = report.summary;
console.log('=== Uparivanje sastavnica Upisnika s nasim jedinicama ===');
console.log(`izvoditelja u Upisniku: ${s.executorCount}, nasih jedinica: ${s.unitCount}`);
console.log(
  `pouzdanost: exact ${s.byConfidence.exact}, strong ${s.byConfidence.strong}, ` +
    `weak ${s.byConfidence.weak}, BEZ para ${s.byConfidence.none}`,
);
console.log(`nasih jedinica upareno: ${s.unitsMatched}, bez ijednog izvoditelja: ${s.unitsWithoutExecutor}`);
console.log(`programa cija sastavnica nije uparena: ${s.programsWithoutUnit}`);
console.log('');

const unmatched = report.proposals.filter((p) => p.match == null).sort((a, b) => b.programCount - a.programCount);
if (unmatched.length) {
  console.log(`NEUPARENI IZVODITELJI (${unmatched.length}), po broju programa:`);
  for (const p of unmatched.slice(0, 15)) console.log(`  ${String(p.programCount).padStart(3)}  ${p.executor}`);
  if (unmatched.length > 15) console.log(`  ... jos ${unmatched.length - 15}`);
  console.log('');
}

const weak = report.proposals.filter((p) => p.match?.confidence === 'weak');
if (weak.length) {
  console.log(`SLABI PRIJEDLOZI (${weak.length}) - traze ljudsku potvrdu:`);
  for (const p of weak.slice(0, 10)) {
    console.log(`  ${p.executor}  ->  ${p.match!.unitId}  (${p.match!.reason})`);
  }
  console.log('');
}

console.log('zapisano: docs/generated/upisnik-unit-match.json');
console.log('Prijedlog NIJE odluka: prijenos u registar programa je zaseban, ljudski korak.');
