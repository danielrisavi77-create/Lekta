/**
 * EVAL SLUCAJEVI ZA `katedra-lite`, i priprema isporuke.
 *
 *   npm run skill-evals [-- --od N] [-- --write] [-- --stage <dir>]
 *
 * `--write` zapisuje fragment (`docs/generated/skill-evals.json`).
 * `--stage` slaze MAPU ZA PREDAJU: fragment, `files/` s dokumentima i README koji kaze sto su.
 *
 * ZASTO DOKUMENTI NE ZIVE DVAPUT U REPOZITORIJU. Fixture su vec commitane u
 * `tests/fixtures/docx-authored/`; ovdje se samo KOPIRAJU u mapu za predaju, koja nije dio repoa.
 * Duplicirani binarni sadrzaj bi se razisao pri prvoj izmjeni, a razisao bi se tiho.
 *
 * GRANICA KOJU README IZRICE. Dokumenti su sintetski testni ulazi: autor i mentor su izmisljeni,
 * sadrzaj je izmisljen. Idu drugom proizvodu kao ULAZ ZA MJERENJE PONASANJA, nikad kao izvor
 * fakultetskih pravila. Smjer istine o pravilima ostaje Lekta -> Katedra i ovo ga ne mijenja.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEvalCases } from '../../src/corpus/tool-evals';
import { EVALI } from '../../src/corpus/eval-catalog';
import type { ComparisonRow } from '../../src/corpus/tool-comparison';
import { KVAROVI } from '../../src/corpus/defect-catalog';
import { withProvenance } from '../lib/provenance.mjs';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'docx-authored');
const USPOREDBA = join(ROOT, 'docs', 'generated', 'skill-compare.json');
const OUT = join(ROOT, 'docs', 'generated', 'skill-evals.json');

const README = [
  '# Sintetski testni ulazi iz Lekte',
  '',
  'Ovi dokumenti su SINTETSKI TESTNI ULAZI, ne studentski radovi i ne za predaju. Autor i mentor su',
  'izmisljena imena, sadrzaj je izmisljen, nijedna tvrdnja ne opisuje tudje stvarno istrazivanje.',
  'Nastali su za mjerenje alata i idu uz eval slucajeve u `evals.json`.',
  '',
  '## Sto se s njima SMIJE',
  '',
  'Vrtjeti provjere i mjeriti ponasanje modela. To je jedina namjena.',
  '',
  '## Sto se s njima NE SMIJE',
  '',
  'Iz njih se NE izvode fakultetska pravila. Dokumenti su gradjeni PREMA Lektinim profilima, pa bi',
  'izvodjenje pravila iz njih bilo citanje Lektina propisa kroz zaobilazni put, i ucinilo bi tudju',
  'provjeru prividno mjerodavnom. Smjer istine o pravilima ostaje Lekta -> Katedra, jednosmjerno.',
  '',
  'Svaki dokument ima sidecar u Lekti (`tests/fixtures/docx-authored/<ime>.json`) s trakom `authored`',
  'i zastavicom `synthetic: true`; ondje pise i kako je nastao.',
  '',
];

function main(): void {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const odIdx = argv.indexOf('--od');
  const startAfter = odIdx >= 0 ? Number(argv[odIdx + 1]) : 10;
  const stageIdx = argv.indexOf('--stage');
  const stage = stageIdx >= 0 ? resolve(argv[stageIdx + 1]) : null;

  if (!Number.isInteger(startAfter) || startAfter < 0) {
    console.error('--od trazi cijeli broj (zadnji zauzet id u ciljanom evals.json).');
    process.exitCode = 2;
    return;
  }
  if (!existsSync(USPOREDBA)) {
    console.error(`Nema artefakta usporedbe: ${USPOREDBA}`);
    console.error('Pokreni `npm run skill-compare -- --write`; bez mjerenja eval nema sto cuvati.');
    process.exitCode = 2;
    return;
  }

  const rows = (JSON.parse(readFileSync(USPOREDBA, 'utf8')) as { rows: ComparisonRow[] }).rows;
  const { cases, skipped, fixtures } = renderEvalCases(EVALI, KVAROVI, rows, startAfter);

  // Isporuka bez dokumenta nije eval nego tvrdnja; nedostajuca fixtura obara izvoz.
  const nedostaju = fixtures.filter((f) => !existsSync(join(FIXTURES, f)));
  if (nedostaju.length) {
    console.error(`Nedostaju fixture: ${nedostaju.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(`slucajeva: ${cases.length} (id ${cases.map((c) => c.id).join(', ')}), dokumenata: ${fixtures.length}`);
  for (const s of skipped) console.log(`  ispao: ${s.defectId} (${s.why})`);
  if (!cases.length) {
    console.error('Nijedan slucaj nema kvar koji cuva; izvoz bi bio prazan.');
    process.exitCode = 1;
    return;
  }

  const fragment = withProvenance(
    {
      schemaVersion: 1,
      skill_name: 'katedra-lite',
      napomena:
        'Fragment za `katedra-lite/evals/evals.json`. Svaki slucaj potjece iz kvara izmjerenog ' +
        'usporedbom Lekte i Katedre nad ISTIM dokumentom, i cuva PONASANJE MODELA dok alat nije ' +
        'popravljen: da krivi izlaz ne prenese kao istinu o radu. Dokumenti su sintetski testni ulazi ' +
        'i nisu izvor fakultetskih pravila.',
      continuesFrom: startAfter,
      evals: cases,
      files: fixtures.map((f) => `evals/files/${f}`),
    },
    'npm run skill-evals -- --write',
  );

  if (write) {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(fragment, null, 2) + '\n', 'utf8');
    console.log(`zapisano: ${OUT}`);
  }

  if (stage) {
    mkdirSync(join(stage, 'files'), { recursive: true });
    for (const f of fixtures) copyFileSync(join(FIXTURES, f), join(stage, 'files', f));
    writeFileSync(join(stage, 'evals-fragment.json'), JSON.stringify(fragment, null, 2) + '\n', 'utf8');
    writeFileSync(join(stage, 'README.md'), README.join('\n'), 'utf8');
    console.log(`\nmapa za predaju: ${stage}`);
    console.log(`  files/            ${fixtures.length} dokumenta`);
    console.log('  evals-fragment.json');
    console.log('  README.md         sto se s dokumentima smije, a sto ne');
  }

  if (!write && !stage) console.log(`\n${JSON.stringify(fragment.evals, null, 2)}`);
}

main();
