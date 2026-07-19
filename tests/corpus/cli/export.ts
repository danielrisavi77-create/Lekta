/**
 * CLI: izvezi korpus kao STVARNE .docx datoteke za rucni upload u Lektu (faza 6, prompt 11).
 *
 *   npm run corpus:export                 # svi slucajevi
 *   npx vite-node tests/corpus/cli/export.ts --oracle atomic-fail
 *   npx vite-node tests/corpus/cli/export.ts --case atomic.format.font.dominant
 *   npx vite-node tests/corpus/cli/export.ts --out .artifacts/lekta-error-corpus
 *
 * Naziv datoteke: <case-id>__<profile-id>__<expected>.docx
 * Uz .docx pise manifest.json, manifest.csv i README.md. Binarni izvoz se NE commita
 * (generira se na zahtjev); u repou ostaju generator, katalog i manifest snapshoti.
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { installXmlDomParser } from '../../../src/docx/xml-dom-install';
import { buildDocx } from '../../helpers/docx-builder';
import { ATOMIC_CASES } from '../catalog/atomic';
import { VALID_CONTROL_CASES } from '../catalog/valid-controls';
import { BOUNDARY_CASES } from '../catalog/boundary';
import { LEGAL_ATOMIC_CASES, LEGAL_VALID_CASES } from '../catalog/legal';
import { PROFILE_ATOMIC_CASES } from '../catalog/profile-enabled';
import { FOOTNOTE_ATOMIC_CASES } from '../catalog/footnote-format';
import type { ErrorCase } from '../error-case';

installXmlDomParser(true);

function parseArgs(argv: string[]) {
  const a: { out: string; oracle?: string; caseId?: string } = { out: '.artifacts/lekta-error-corpus' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--oracle') a.oracle = argv[++i];
    else if (argv[i] === '--case') a.caseId = argv[++i];
  }
  return a;
}

const ALL: ErrorCase[] = [...ATOMIC_CASES, ...LEGAL_ATOMIC_CASES, ...PROFILE_ATOMIC_CASES, ...FOOTNOTE_ATOMIC_CASES, ...VALID_CONTROL_CASES, ...LEGAL_VALID_CASES, ...BOUNDARY_CASES];

/** Ocekivani "status" datoteke u imenu: fail (atomski/boundary-not-pass), ok (valid/boundary-pass). */
function expectedTag(c: ErrorCase): string {
  if (c.oracle === 'valid-control') return 'ok';
  if (c.expect.outcome === 'pass') return 'ok';
  return 'fail';
}
function subdir(c: ErrorCase): string {
  if (c.oracle === 'atomic-fail') return 'atomic';
  if (c.oracle === 'valid-control') return 'valid-controls';
  return 'boundary';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let cases = ALL;
  if (args.oracle) cases = cases.filter((c) => c.oracle === args.oracle);
  if (args.caseId) cases = cases.filter((c) => c.id === args.caseId);
  if (!cases.length) { console.error('Nema slucajeva za zadane filtere.'); process.exit(1); }

  const out = resolve(process.cwd(), args.out);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const manifest: any[] = [];
  const csv: string[] = ['file,caseId,title,oracle,category,profileId,checkId,expectedOutcome,expectedTag,detectableNow'];
  for (const c of cases) {
    const dir = resolve(out, subdir(c));
    mkdirSync(dir, { recursive: true });
    const fname = `${c.id}__${c.profileId}__${expectedTag(c)}.docx`;
    const bytes = buildDocx(c.build());
    writeFileSync(resolve(dir, fname), bytes);
    const rel = `${subdir(c)}/${fname}`;
    manifest.push({
      file: rel, caseId: c.id, title: c.title, oracle: c.oracle, category: c.category,
      profileId: c.profileId, checkId: c.expect.checkId, checkTitle: c.expect.title,
      expectedOutcome: c.expect.outcome, expectedTag: expectedTag(c), detectableNow: c.detectableNow, notes: c.notes ?? null,
    });
    csv.push([rel, c.id, JSON.stringify(c.title), c.oracle, c.category, c.profileId, c.expect.checkId, c.expect.outcome, expectedTag(c), String(c.detectableNow)].join(','));
  }

  writeFileSync(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(resolve(out, 'manifest.csv'), csv.join('\n') + '\n');
  writeFileSync(resolve(out, 'README.md'), readme(manifest.length));

  console.log(`Izvezeno ${manifest.length} .docx u ${out}/`);
  console.log('Rucni upload: otvori Lektu, odaberi navedeni profil, ucitaj .docx i usporedi s manifestom.');
}

function readme(n: number): string {
  return [
    '# Lekta Error Corpus - izvezene .docx datoteke',
    '',
    `Sadrzi ${n} sintetickih .docx dokumenata s KONTROLIRANIM greskama (i valjanih kontrola).`,
    'Svaki je izveden iz jedne PROLAZNE baze jednom mutacijom, pa je nalaz predvidljiv.',
    '',
    '## Kako rucno provjeriti',
    '',
    '1. Otvori Lektu (lokalno `npm run dev` ili produkciju).',
    '2. Za svaku datoteku odaberi profil iz naziva (`<case-id>__<profile-id>__<expected>.docx`).',
    '3. Ucitaj .docx. Ocekivani ishod je u `manifest.json` (`checkTitle`, `expectedOutcome`):',
    '   - `__fail` = ciljana provjera treba pasti ili izgubiti bodove,',
    '   - `__ok` = ciljana provjera treba ostati prolazna (valid control / boundary u dopustenom rasponu).',
    '',
    '## Mape',
    '- `atomic/` - jedna greska po dokumentu (dokaz detekcije).',
    '- `valid-controls/` - valjane netipicne reprezentacije (ne smiju dati lazni nalaz).',
    '- `boundary/` - below/exact/within-tol/above za brojcane pragove.',
    '',
    'Napomena: dokumenti su sinteticki, bez stvarnih osobnih podataka, i ne salju se nikamo.',
    '',
  ].join('\n');
}

main();
