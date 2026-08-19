/**
 * CLI: zapisi verifikacijske dosjee citatnih specova (data/verification/citation-dossiers/**).
 *
 *   npx vite-node scripts/citation-spec-dossier.mts [facultyId ...]
 *   npm run citation-dossiers
 *
 * Sva logika je u src/verification/citation-dossier.ts (tipizirana, dijeljena s
 * tests/citation-dossier.test.ts, koji pada ako specovi odu bez regeneriranja dosjea).
 *
 * Ranija .mjs inacica je motor ucitavala kroz esbuild-IIFE trik jer .mjs ne moze uvesti
 * TypeScript. Posljedica nije bila samo slozenost: izlaz se nije mogao staviti pod drift gard,
 * pa je 70 od 71 commitanog dosjea zastarilo (naslovi stilova bez dijakritike). Pod vite-nodeom
 * je motor obican import, esbuild vise ne treba.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderCitationDossiers, type DossierTarget } from '../src/verification/citation-dossier';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import type { CitationSpec } from '../src/citations/citation-spec';
import type { SourceEntry } from '../src/profiles/profile-schema';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_ROOT = join(root, 'data', 'tools', 'citation-specs');
const OUT_DIR = join(root, 'data', 'verification', 'citation-dossiers');

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

const readSpecDir = (dir: string): DossierTarget[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({
          fac: f.replace(/\.json$/, ''),
          spec: JSON.parse(readFileSync(join(dir, f), 'utf8')) as CitationSpec,
        }))
    : [];

// Pokriva i drafts/ (u pregledu) i verified/ (vec approvano): dosje ostaje tocan i nakon approvea.
const targets = [
  ...readSpecDir(join(SPEC_ROOT, 'drafts')),
  ...readSpecDir(join(SPEC_ROOT, 'verified')),
].filter((t) => !only.length || only.includes(t.fac));

const extractDir = join(SPEC_ROOT, 'extractions');
const extractions: Record<string, string> = {};
if (existsSync(extractDir)) {
  for (const f of readdirSync(extractDir).filter((f) => f.endsWith('.txt'))) {
    extractions[f.replace(/\.txt$/, '')] = readFileSync(join(extractDir, f), 'utf8');
  }
}

const report = renderCitationDossiers({
  targets,
  sources: SOURCE_REGISTRY as SourceEntry[],
  extractions,
});

mkdirSync(OUT_DIR, { recursive: true });
for (const [rel, content] of Object.entries(report.files)) {
  writeFileSync(join(root, rel), content, 'utf8');
}

for (const r of report.rows) {
  const warn = r.diffs || r.schemaErrs || r.grepFails ? '  <-- PROVJERI' : '';
  console.log(
    `[dossier] ${r.fac}: ${r.matches} MATCH, ${r.diffs} DIFF(nedeklariran), ${r.declaredDiffs} DIFF(dekl), ` +
      `${r.noExample} bez examplea, ${r.schemaErrs} shema, ${r.grepFails} grep-fail${warn}`,
  );
}

// Cleanup: makni orphan dossiere (.md bez odgovarajuceg speca u drafts/ ILI verified/).
if (!only.length) {
  const live = new Set(Object.keys(report.files).map((rel) => rel.slice(rel.lastIndexOf('/') + 1)));
  let removed = 0;
  for (const f of readdirSync(OUT_DIR).filter((f) => f.endsWith('.md'))) {
    if (!live.has(f)) {
      unlinkSync(join(OUT_DIR, f));
      removed++;
    }
  }
  if (removed) console.log(`[dossier] cleanup: uklonjeno ${removed} orphan dossiera (spec vise ne postoji).`);
}

console.log(`[dossier] INDEX.md: ${report.rows.length} dosjea, ${report.blockers.length} problem.`);
