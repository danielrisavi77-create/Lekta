/**
 * CLI: zapisi completion ledger (docs/generated/completion-ledger.json).
 *
 *   npx vite-node scripts/generate-completion-ledger.mts
 *   npm run completion-ledger
 *
 * Sva logika je u src/verification/completion-ledger.ts (cista funkcija, dijeljena s
 * tests/completion-ledger.test.ts). Ovdje se samo citaju vec generirani, drift-gardirani
 * artefakti i rezultat zapisuje na disk.
 *
 * Ledger je JOIN sloj: ako neki ulaz zastari, past ce NJEGOV gard (coverage-report,
 * faculty-matrix, repair-coverage, verification-worklist), ne ovaj.
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { computeWorklist } from '../src/verification/worklist';
import { buildCompletionLedger, pdfSeparationProblems, type LedgerInputs } from '../src/verification/completion-ledger';
import type { ThesisProfile, SourceEntry } from '../src/profiles/profile-schema';
import { loadRepositoryAiEvidenceContext } from './ai-evidence-context-loader';
import { hashRepairSourceTree } from './lib/repair-source-hash.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = <T,>(rel: string): T => JSON.parse(readFileSync(join(root, rel), 'utf8')) as T;
const currentRepairSourceHash = hashRepairSourceTree(join(root, 'src', 'repair'));

const profiles = [
  ...VERIFIED_PROFILES_WITH_DRAFTS,
  ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
] as unknown as ThesisProfile[];
const legalProfileIds = new Set(LEGAL_DEPARTMENTS_WITH_DRAFTS.map((profile) => profile.id));
const aiEvidenceContext = await loadRepositoryAiEvidenceContext(root, profiles, SOURCE_REGISTRY as SourceEntry[]);

const inputs: LedgerInputs = {
  currentRepairSourceHash,
  registryProfiles: profiles.map((p) => ({
    id: p.id,
    scope: legalProfileIds.has(p.id) ? 'legal' : 'faculty',
    unitId: (p as unknown as { unitId?: string }).unitId ?? null,
    workTypes: (p as unknown as { workTypes?: string[] }).workTypes ?? [],
  })),
  faculties: readJson<{ faculties: LedgerInputs['faculties'] }>('docs/generated/faculty-matrix.json').faculties,
  coverageCells: readJson<{ cells: LedgerInputs['coverageCells'] }>('data/coverage/scored-coverage.json').cells,
  worklistRows: computeWorklist(profiles, SOURCE_REGISTRY as SourceEntry[], [], {
    aiEvidenceResults: aiEvidenceContext.resultsByRule,
  }).rows,
  repairRows: readJson<{ rows: LedgerInputs['repairRows'] }>('docs/generated/repair-coverage.json').rows,
  programs: readJson<{ programs: LedgerInputs['programs'] }>('data/programs/program-registry.json').programs,
  titleTemplates: readJson<LedgerInputs['titleTemplates']>('data/title-pages/templates-index.json'),
  citationSpecs: readJson<LedgerInputs['citationSpecs']>('data/tools/citation-specs/verified-index.json'),
  declarations: readJson<LedgerInputs['declarations']>('data/declarations/declarations.json'),
  closedLoop: readJson<{ rows: NonNullable<LedgerInputs['closedLoop']> }>('docs/generated/closed-loop.json').rows,
};

// Ovjera mjerenja nad stvarnim radovima. Datoteka je neobavezna: bez nje ledger radi kao i prije,
// a razina `A` ostaje prazna. Nepotpisanu ovjeru `provenProfiles` sam odbija, pa je ovdje nema potrebe
// filtrirati.
const ovjeraPut = join(root, 'data', 'verification', 'real-corpus-attestation.json');
const corpusAttestation = existsSync(ovjeraPut)
  ? (JSON.parse(readFileSync(ovjeraPut, 'utf8')) as Parameters<typeof buildCompletionLedger>[0]['corpusAttestation'])
  : null;

// Ovjera nad javnim radovima pretvorenim iz PDF-a (odluka vlasnika 2026-09-28). Neobavezna kao i prava:
// bez datoteke nijedan redak nema `A-pdf`. Daje SAMO zasebnu razinu `A-pdf`, nikad `claim`; ovjeru bez
// `sourceKind: 'public-pdf-converted'` ili bez potpisa `provenPdfUnitWorkTypes` sam odbija.
const pdfOvjeraPut = join(root, 'data', 'verification', 'pdf-corpus-attestation.json');
const pdfCorpusAttestation = existsSync(pdfOvjeraPut)
  ? (JSON.parse(readFileSync(pdfOvjeraPut, 'utf8')) as Parameters<typeof buildCompletionLedger>[0]['pdfCorpusAttestation'])
  : null;

const ledger = buildCompletionLedger({ ...inputs, corpusAttestation, pdfCorpusAttestation });

// Codex #225, nalaz 3: gard odvojenosti A-pdf radi nad STVARNIM ulazima generatora, ne samo u testu. Ledger
// bez PDF ovjere mora biti isti u svemu osim PDF polja; inace se artefakt ne pise.
const problemiPdf = pdfSeparationProblems(buildCompletionLedger({ ...inputs, corpusAttestation, pdfCorpusAttestation: null }), ledger);
if (problemiPdf.length) {
  console.error(`[completion-ledger] FAIL: PDF ovjera dira ljestvicu:\n  ${problemiPdf.join('\n  ')}`);
  process.exit(1);
}

mkdirSync(join(root, 'docs', 'generated'), { recursive: true });
writeFileSync(
  join(root, 'docs', 'generated', 'completion-ledger.json'),
  JSON.stringify(ledger, null, 2) + '\n',
);

const s = ledger.summary;
const fmt = (obj: Record<string, number>) =>
  Object.entries(obj)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}=${n}`)
    .join(', ');

console.log('=== Completion ledger ===');
console.log(`redaka: ${s.rowCount} (profila: ${s.profileCount})`);
console.log(`program : ${fmt(s.byProgram)}`);
console.log(`pravila : ${fmt(s.byRules)}`);
console.log(`popravak: ${fmt(s.byRepair)}`);
console.log(`dokaz   : ${fmt(s.byProof)}`);
console.log(`sadrzaji: ${fmt(s.byAssets)}  (najslabiji clan od tri podosi)`);
console.log(`  naslovnica: ${fmt(s.byTitlePage)}`);
console.log(`  citat     : ${fmt(s.byCitation)}`);
console.log(`  izjava    : ${fmt(s.byDeclaration)}`);
console.log(`tvrdnja : ${fmt(s.byClaim)}`);
console.log(`A svi registri: ${ledger.globalA.profilesAtA}/${ledger.globalA.registeredProfileCount} | svi registrirani na A: ${ledger.globalA.allProfilesA ? 'DA' : 'NE'}`);
console.log(`fakulteti A: ${ledger.facultyAllA.facultyAtA}/${ledger.facultyAllA.registeredFacultyCount} | cilj 407/407: ${ledger.facultyAllA.meetsFacultyAllA ? 'GO' : 'NO-GO'}`);
console.log(`fakulteti >= B: ${ledger.facultyMinimumB.facultyAtLeastB}/${ledger.facultyMinimumB.registeredFacultyCount} | ${ledger.facultyMinimumB.meetsFacultyMinimumB ? 'GO' : 'NO-GO'}`);
console.log(`pravni profili A: ${ledger.facultyMinimumB.legalProfilesAtA}/${ledger.facultyMinimumB.legalProfileCount} | ispod A: ${ledger.facultyMinimumB.legalProfilesBelowA.join(', ') || 'nema'}`);
console.log(`A-pdf   : ${s.byPdfClaim['A-pdf']}  (zasebno, ne ulazi u tvrdnju)`);
console.log('');
if (s.nationalClaimBlockers.length) {
  console.log('NACIONALNA TVRDNJA: NO-GO');
  for (const b of s.nationalClaimBlockers) console.log(`  - ${b}`);
} else {
  console.log('NACIONALNA TVRDNJA: nema blokatora.');
}
console.log('zapisano: docs/generated/completion-ledger.json');
