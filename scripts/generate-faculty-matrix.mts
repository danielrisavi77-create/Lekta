/** CLI: generira fakultetsku matricu profila, popravaka i DOCX regresijskih uzoraka. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildFacultyMatrixReport } from '../tests/helpers/faculty-matrix';
import { buildCoverageCells } from '../tests/helpers/coverage-cells';
import { buildRepairCoverageMatrix } from '../tests/helpers/repair-coverage';
import corpusReport from '../docs/generated/repair-real-corpus.json';
import closedLoopReport from '../docs/generated/closed-loop.json';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const report = buildFacultyMatrixReport();
const output = join(root, 'docs', 'generated', 'faculty-matrix.json');

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');

console.log('=== Fakultetska matrica Repair Enginea ===');
console.log(`fakulteta: ${report.summary.facultyCount}, profila: ${report.summary.profileCount}`);
console.log(`opcija: ${report.summary.offeredOptionCount}, mapirano: ${report.summary.mappedOptionCount}`);
console.log(`stvarnih DOCX uzoraka: ${report.summary.realDocxSampleCount}`);
console.log(`fakulteta s uzorkom: ${report.summary.facultiesWithRealDocx}, bez uzorka: ${report.summary.facultiesWithoutRealDocx}`);
console.log(
  `closed-loop po profilu: pass ${report.summary.syntheticClosedLoopPassCount}, ` +
    `nije pokrenuto ${report.summary.syntheticClosedLoopNotRunCount}`,
);
console.log(`zapisano: ${output}`);

/**
 * Pun popis celija ide u ZASEBAN artefakt: 407 profila x 31 fixer je oko 12.600 redaka, sto bi
 * `faculty-matrix.json` napuhalo bez koristi. Matrica nosi sazetak, ovdje stoji svaka celija s
 * dokazom ili razlogom, da se nalaz moze provjeriti a ne samo procitati kao brojka.
 */
const cells = buildCoverageCells(
  buildRepairCoverageMatrix(),
  closedLoopReport as Parameters<typeof buildCoverageCells>[1],
  corpusReport as Parameters<typeof buildCoverageCells>[2],
);
const cellOutput = join(root, 'docs', 'generated', 'coverage-cells.json');
writeFileSync(
  cellOutput,
  JSON.stringify(
    {
      schemaVersion: 1,
      scope: {
        note: 'Celija = (profil x fixer). Tocno jedan od dva statusa, nikad prazno, nikad treci.',
        repairSource: 'tests/helpers/repair-coverage.ts',
        closedLoopSource: 'docs/generated/closed-loop.json',
        realCorpusSource: 'docs/generated/repair-real-corpus.json',
      },
      summary: cells.summary,
      cells: cells.cells,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `celija: ${cells.summary.cellCount}, pokriveno ${cells.summary.coveredCount} ` +
    `(od toga dokaz 'resolved' ${cells.summary.resolvedCount}), nepokriveno ${cells.summary.uncoveredCount}`,
);
for (const [reason, count] of Object.entries(cells.summary.byReason)) console.log(`  ${reason}: ${count}`);
console.log(`zapisano: ${cellOutput}`);

/**
 * OPT-IN: iste celije, ali s dokazima iz LOKALNOG korpusa stvarnih radova.
 *
 * Zasto zaseban izlaz, a ne spajanje u committani artefakt: `docs/generated/repair-real-corpus.local.json`
 * je gitignoriran (mjeri 102 stvarna rada koji se ne commitaju), pa bi njegovo uvrstavanje ucinilo
 * `faculty-matrix.json` neponovljivim izvan ovog stroja, a `tests/faculty-matrix.test.ts` usporedjuje
 * svjez izracun s committanim artefaktom. Committani brojevi zato ostaju CI-reproducibilni, a ovaj
 * izlaz pokazuje koliko je STVARNO izmjereno.
 */
if (process.argv.includes('--local')) {
  const localPath = join(root, 'docs', 'generated', 'repair-real-corpus.local.json');
  if (!existsSync(localPath)) {
    console.log(`lokalni korpus: nema ${localPath}, preskacem (nije greska)`);
  } else {
    const localCorpus = JSON.parse(readFileSync(localPath, 'utf8'));
    const localCells = buildCoverageCells(
      buildRepairCoverageMatrix(),
      closedLoopReport as Parameters<typeof buildCoverageCells>[1],
      localCorpus as Parameters<typeof buildCoverageCells>[2],
    );
    const localOutput = join(root, 'docs', 'generated', 'coverage-cells.local.json');
    writeFileSync(
      localOutput,
      JSON.stringify(
        {
          schemaVersion: 1,
          scope: {
            note: 'LOKALNO mjerenje; ne commita se. Dokazi iz repair-real-corpus.local.json.',
            realCorpusSource: 'docs/generated/repair-real-corpus.local.json',
            documentCount: localCorpus.results?.length ?? 0,
          },
          summary: localCells.summary,
          cells: localCells.cells,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      `lokalno: celija ${localCells.summary.cellCount}, pokriveno ${localCells.summary.coveredCount} ` +
        `(resolved ${localCells.summary.resolvedCount}), nepokriveno ${localCells.summary.uncoveredCount}`,
    );
    console.log(`zapisano: ${localOutput}`);
  }
}
