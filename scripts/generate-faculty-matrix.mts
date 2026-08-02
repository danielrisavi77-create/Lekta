/** CLI: generira fakultetsku matricu profila, popravaka i DOCX regresijskih uzoraka. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildFacultyMatrixReport } from '../tests/helpers/faculty-matrix';

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
console.log(`closed-loop po profilu: nije pokrenuto (${report.summary.syntheticClosedLoopNotRunCount})`);
console.log(`zapisano: ${output}`);
