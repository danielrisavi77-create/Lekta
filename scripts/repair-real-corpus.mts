import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runRealCorpus } from '../tests/real-corpus/harness';
import { withProvenance } from './lib/provenance.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argValue = (name: string): string | null => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
};
const outIndex = process.argv.indexOf('--out');
const outputDir = outIndex >= 0 && process.argv[outIndex + 1] ? resolve(root, process.argv[outIndex + 1]) : undefined;
// `--only-root <korijen>` (A-pdf, odluka vlasnika 2026-09-28): mjeri SAMO zadani korijen, bez commitanih
// fixture, bez tests/fixtures/docx-local i bez LEKTA_CORPUS_SOURCE. Tako PDF korpus (izlaz corpus-ingest
// s --source-kind public-pdf-converted) ne dobiva ni jedan izvorni DOCX u isto mjerenje, i obrnuto.
const onlyRootArg = argValue('--only-root');
const onlyRoot = onlyRootArg ? resolve(onlyRootArg) : null;
if (process.argv.includes('--only-root') && (!onlyRoot || !existsSync(onlyRoot) || !statSync(onlyRoot).isDirectory())) {
  console.error(`[repair-real-corpus] FAIL: --only-root trazi postojecu mapu (dobiveno: ${String(onlyRootArg)}).`);
  process.exit(2);
}
const includeLocal = !onlyRoot && (process.argv.includes('--local') || process.env.LEKTA_LOCAL_CORPUS === '1');
const localArtifact = includeLocal || onlyRoot !== null;
// `--report <datoteka>`: lokalni artefakt na drugo mjesto (test kroz stvarnu skriptu, ili mjerni korpus
// koji ne smije dijeliti gitignorirani izvjestaj s drugim mjerenjem). Commitani izvjestaj se ne preusmjerava.
const reportArg = argValue('--report');
if (process.argv.includes('--report') && (!reportArg || !localArtifact)) {
  console.error('[repair-real-corpus] FAIL: --report <datoteka> vrijedi samo uz --only-root ili lokalni korpus.');
  process.exit(2);
}
const report = onlyRoot
  ? await runRealCorpus(onlyRoot, { ...(outputDir ? { outputDir } : {}), includeLocal: false, externalRoot: null })
  : await runRealCorpus(undefined, { ...(outputDir ? { outputDir } : {}), includeLocal });

/**
 * Vrsta izvora svakog rezultata, iz sidecara kojeg je napisao corpus-ingest (`--source-kind`). Harness nosi
 * samo profil i trake, pa bi se bez ovoga u artefaktu mjerenja izgubilo je li rad izvorni DOCX ili pretvoren
 * iz PDF-a; ovjera (`scripts/attest-real-corpus.mjs`) po ovom polju odbija mjesovito mjerenje. Upisuje se
 * samo u LOKALNI artefakt: commitani `repair-real-corpus.json` ostaje usporediv s pokretanjem u CI-ju.
 */
function sourceKindOf(entryRoot: string | undefined, fileName: string): string | null {
  const dir = entryRoot ? resolve(root, entryRoot) : join(root, 'tests', 'fixtures', 'docx');
  try {
    const meta = JSON.parse(readFileSync(join(dir, fileName.replace(/\.docx$/i, '.json')), 'utf8')) as { sourceKind?: unknown };
    return typeof meta.sourceKind === 'string' ? meta.sourceKind : null;
  } catch {
    return null;
  }
}
if (localArtifact) {
  const byId = new Map(report.manifest.map((entry) => [entry.documentId, entry]));
  for (const result of report.results as Array<(typeof report.results)[number] & { sourceKind?: string | null }>) {
    const entry = byId.get(result.documentId);
    result.sourceKind = entry ? sourceKindOf(entry.root, entry.fileName) : null;
  }
}
if (onlyRoot) {
  report.scope = { ...report.scope, root: '--only-root', onlyRoot: true } as typeof report.scope;
}

mkdirSync(join(root, 'docs', 'generated'), { recursive: true });
// Commitani izvjestaj mora ostati REPRODUCIBILAN u CI-ju, pa opisuje iskljucivo commitane fixture
// (tests/real-corpus.test.ts ga usporedjuje s vlastitim pokretanjem). Mjerenje koje ukljucuje
// lokalne, necommitane radove ide u zaseban, gitignoriran izvjestaj: inace bi commitani artefakt
// tvrdio brojke koje nitko osim vlasnika diska ne moze ponoviti.
const reportPath = localArtifact ? 'repair-real-corpus.local.json' : 'repair-real-corpus.json';
const reportFile = reportArg ? resolve(reportArg) : join(root, 'docs', 'generated', reportPath);
// Lokalni artefakt nosi provenijenciju (KADA i NAD KOJIM COMMITOM je mjereno), jer ovjera
// (`scripts/attest-real-corpus.mjs`) iz njega cita vrijeme mjerenja. Do 2026-09-05 je ovjera upisivala
// vrijeme VLASTITOG pokretanja, pa je `measuredAt` govorio kad je ovjera napisana, ne kad je mjereno.
// Commitani izvjestaj ostaje BEZ pecata: `tests/real-corpus.test.ts` ga usporedjuje s vlastitim
// pokretanjem i vremenski pecat bi tu usporedbu trajno rusio.
const izlaz = localArtifact
  ? withProvenance(
      report,
      onlyRoot
        ? 'vite-node scripts/repair-real-corpus.mts --only-root <korijen>'
        : 'LEKTA_LOCAL_CORPUS=1 vite-node scripts/repair-real-corpus.mts',
    )
  : report;
mkdirSync(dirname(reportFile), { recursive: true });
writeFileSync(reportFile, JSON.stringify(izlaz, null, 2) + '\n');

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
if (onlyRoot) console.log(`samo korijen: ${onlyRoot}`);
console.log(`dokumen: ${report.summary.documentCount}, promijenjeno: ${report.summary.changedDocumentCount}`);
console.log(`no-op: ${report.summary.noOpCount}, za pregled: ${report.summary.reviewCount}, pad: ${report.summary.failCount}`);
console.log(`zapisano: ${reportArg ? reportFile : `docs/generated/${reportPath}`}`);
if (outputDir) console.log(`paket za ručni pregled: ${outputDir}`);
if (report.summary.failCount > 0) process.exitCode = 1;
// Prazan mjerni korijen nije uspjeh: ingest bez prepoznatog profila ne daje nijedan dokument.
if (onlyRoot && report.results.length === 0) {
  console.error('[repair-real-corpus] FAIL: --only-root nema nijedan dokument sa sidecarom i profilom.');
  process.exitCode = 1;
}
