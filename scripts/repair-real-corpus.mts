import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runRealCorpus } from '../tests/real-corpus/harness';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outIndex = process.argv.indexOf('--out');
const outputDir = outIndex >= 0 && process.argv[outIndex + 1] ? resolve(root, process.argv[outIndex + 1]) : undefined;
const report = await runRealCorpus(undefined, { ...(outputDir ? { outputDir } : {}) });
mkdirSync(join(root, 'docs', 'generated'), { recursive: true });
writeFileSync(join(root, 'docs', 'generated', 'repair-real-corpus.json'), JSON.stringify(report, null, 2) + '\n');

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
console.log(`zapisano: docs/generated/repair-real-corpus.json`);
if (outputDir) console.log(`paket za ručni pregled: ${outputDir}`);
if (report.summary.failCount > 0) process.exitCode = 1;
