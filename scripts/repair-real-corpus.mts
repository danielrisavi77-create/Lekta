import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runRealCorpus } from '../tests/real-corpus/harness';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outIndex = process.argv.indexOf('--out');
const outputDir = outIndex >= 0 && process.argv[outIndex + 1] ? resolve(root, process.argv[outIndex + 1]) : undefined;
const includeLocal = process.argv.includes('--local') || process.env.LEKTA_LOCAL_CORPUS === '1';
const report = await runRealCorpus(undefined, { ...(outputDir ? { outputDir } : {}), includeLocal });
mkdirSync(join(root, 'docs', 'generated'), { recursive: true });
// Commitani izvjestaj mora ostati REPRODUCIBILAN u CI-ju, pa opisuje iskljucivo commitane fixture
// (tests/real-corpus.test.ts ga usporedjuje s vlastitim pokretanjem). Mjerenje koje ukljucuje
// lokalne, necommitane radove ide u zaseban, gitignoriran izvjestaj: inace bi commitani artefakt
// tvrdio brojke koje nitko osim vlasnika diska ne moze ponoviti.
const reportPath = includeLocal ? 'repair-real-corpus.local.json' : 'repair-real-corpus.json';
writeFileSync(join(root, 'docs', 'generated', reportPath), JSON.stringify(report, null, 2) + '\n');

if (outputDir) {
  const reviewManifest = report.results
    .filter((result) => result.manualReviewRequired && result.changedFixerIds.length > 0)
    .map((result) => ({
      documentId: result.documentId,
      profileId: result.profileId,
      repairedFile: `${result.documentId}__repaired.docx`,
      changedFixerIds: result.changedFixerIds,
      manualReviewReasons: result.manualReviewReasons,
    }));
  writeFileSync(join(outputDir, 'manifest.json'), JSON.stringify(reviewManifest, null, 2) + '\n');
  writeFileSync(join(outputDir, 'README.md'), [
    '# Lekta real corpus review pack',
    '',
    'Ove su kopije popravljene u memoriji. Originalni fixturei nisu mijenjani.',
    'Za svaki dokument odaberi navedeni profil i otvori popravljenu kopiju u Wordu ili LibreOfficeu.',
    'Provjeri naslovnicu, sekcije, numeriranje, margine, tablice i fusnote gdje postoje.',
    '',
  ].join('\n'));
}

console.log('=== Repair real corpus ===');
console.log(`dokumen: ${report.summary.documentCount}, promijenjeno: ${report.summary.changedDocumentCount}`);
console.log(`no-op: ${report.summary.noOpCount}, za pregled: ${report.summary.reviewCount}, pad: ${report.summary.failCount}`);
console.log(`zapisano: docs/generated/${reportPath}`);
if (outputDir) console.log(`paket za ručni pregled: ${outputDir}`);
if (report.summary.failCount > 0) process.exitCode = 1;
