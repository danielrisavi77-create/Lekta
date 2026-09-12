/**
 * GENERATOR SINTETICKOG KORPUSA: redak + proza + pravila -> .docx kroz PRAVI LibreOffice.
 *
 *   npx vite-node scripts/corpus-gen/generate.mts -- --row <id> [--messy] [--out <dir>]
 *   npx vite-node scripts/corpus-gen/generate.mts -- --all [--limit N]
 *
 * Podjela izvora, i ona se ne mijesa:
 *   TEKST      iz proze (`$LEKTA_SYNTHETIC_CORPUS/proza/<id>.json`), pisane izvan pipelinea;
 *   OBLIK      iz Lektinih pravila profila i predlozaka naslovnice (`data/**`);
 *   NEUREDNOST iz kataloga mutacija, primijenjena na IZVORU prije nego alat spremi.
 *
 * Ne pokrece se u CI-ju: trazi LibreOffice, kojega na ubuntu runnerima nema. Isto kao Tier 2 za Word,
 * ovo je rucni korak na stroju koji alat ima; nedostatak alata je IZLAZNI KOD 2 ("nepokriveno"),
 * nikad tiho preskakanje.
 *
 * Izlaz nikad ne ide u `tests/fixtures/docx/`: sve zivi izvan repozitorija, a u repo se poslije
 * svjesno bira kuriran podskup.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enumerateRows, composedRulesFor, type CorpusRow } from './rows.mts';
import { buildFodt, type ProfileRules } from './prose-scenario.mts';
import { applyMutations, MUTATIONS } from './mutations.mts';
import { validateProseBody, validateProseAgainstRow, type ProseBody } from '../../src/corpus/prose-schema';
import { titleLinesFor, emitSidecar } from './emit.mts';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const KORPUS = process.env.LEKTA_SYNTHETIC_CORPUS || join('C:', 'Users', 'PC', 'Desktop', 'Lekta-korpus', '04-sintetski');
const PROZA_DIR = join(KORPUS, 'proza');

const SOFFICE_CANDIDATES = [
  join('C:', 'Program Files', 'LibreOffice', 'program', 'soffice.exe'),
  join('C:', 'Program Files (x86)', 'LibreOffice', 'program', 'soffice.exe'),
  '/usr/bin/soffice',
  '/usr/local/bin/soffice',
];

function findSoffice(): string | null {
  for (const c of SOFFICE_CANDIDATES) if (existsSync(c)) return c;
  return null;
}

const USER_INSTALLATION = 'file:///C:/Users/PC/AppData/Local/Temp/claude/lo-profile-sintetski';

function convert(soffice: string, fodtPath: string, outDir: string): string {
  execFileSync(
    soffice,
    [
      '--headless',
      '--norestore',
      `-env:UserInstallation=${USER_INSTALLATION}`,
      '--convert-to',
      'docx:MS Word 2007 XML',
      '--outdir',
      outDir,
      fodtPath,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 },
  );
  const produced = join(outDir, basename(fodtPath).replace(/\.fodt$/i, '.docx'));
  if (!existsSync(produced)) throw new Error(`LibreOffice nije proizveo ${produced}`);
  return produced;
}

/** Mutacije koje se primjenjuju na "neuredan" primjerak; sve iz kataloga. */
const NEUREDNE = MUTATIONS.map((m) => m.id);

async function generirajRedak(row: CorpusRow, messy: boolean, outDir: string, soffice: string): Promise<void> {
  const prozaPath = join(PROZA_DIR, `${row.id}.json`);
  if (!existsSync(prozaPath)) {
    console.log(`  ${row.id.padEnd(42)} PRESKOCENO: nema proze (${prozaPath})`);
    return;
  }
  const body = JSON.parse(readFileSync(prozaPath, 'utf8')) as ProseBody;
  // Tijelo se provjerava PREMA SEBI i PREMA RETKU: do 2026-09-08 je proza mogla tvrditi bilo koji
  // `unitId`, `workType`, `level` ili `family` a da to nista ne prijavi (mjereno: jedno od devet
  // tijela se razilazilo dva dana).
  const nalazi = [
    ...validateProseBody(body),
    ...validateProseAgainstRow(body, {
      id: row.id,
      unitId: row.unitId,
      workType: row.workType,
      level: row.level,
      family: row.family,
    }),
  ];
  if (nalazi.length) {
    // Proza koja ne prolazi validator NE ide dalje: dokument bi nosio oblik koji nismo htjeli mjeriti.
    console.error(`  ${row.id}: proza ima ${nalazi.length} nalaz(a):`);
    for (const n of nalazi) console.error(`      ${n}`);
    process.exitCode = 1;
    return;
  }

  const rules = composedRulesFor(row) as ProfileRules;
  const { lines, templateId } = await titleLinesFor(row, body);
  const osnovni = buildFodt(body, { titleLines: lines, rules });
  const { fodt, counters, notApplicable } = messy
    ? applyMutations(osnovni, NEUREDNE)
    : { fodt: osnovni, counters: {}, notApplicable: {} };

  const naziv = `${row.id}--${messy ? 'neuredan' : 'uskladjen'}`;
  const fodtPath = join(outDir, `${naziv}.fodt`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(fodtPath, fodt, 'utf8');
  const docxPath = convert(soffice, fodtPath, outDir);
  rmSync(fodtPath, { force: true });

  // Mjerenje oblika, provjera tvrdnji i sidecar idu kroz ZAJEDNICKI izlazni sloj (`emit.mts`), isti
  // koji koristi Word trak. Bez toga bi svaki alat imao vlastiti sidecar, pa bi se razlika medju
  // trakama citala kao razlika medju ALATIMA, a bila bi razlika medju nasim dvjema izvedbama.
  const res = await emitSidecar({
    docxPath,
    row,
    body,
    templateId,
    tool: 'libreoffice',
    toolPath: soffice,
    command: `npx vite-node scripts/corpus-gen/generate.mts -- --row ${row.id}${messy ? ' --messy' : ''}`,
    counters,
    notApplicable,
    requireToc: rules.requireToc !== false,
  });

  const bytes = readFileSync(docxPath).length;
  const oznaka = res.problems.length ? 'NALAZ' : 'ok   ';
  console.log(`  ${oznaka} ${naziv.padEnd(48)} ${String(bytes).padStart(7)} B  oblika: ${res.claimed.length}`);
  // Ogranicenje alata NIJE nalaz (ne obara prolaz), ali se ispisuje svaki put: presucena granica se
  // brzo procita kao pokrivenost.
  for (const o of res.limitations) console.log(`        NEPOKRIVENO ${o}`);
  for (const p of res.problems) {
    console.error(`        ${p}`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const rowIdx = argv.indexOf('--row');
  const only = rowIdx >= 0 ? argv[rowIdx + 1] : null;
  const all = argv.includes('--all');
  const messy = argv.includes('--messy');
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx >= 0 ? resolve(ROOT, argv[outIdx + 1]) : join(KORPUS, 'docx');
  const limitIdx = argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : Infinity;

  const soffice = findSoffice();
  if (!soffice) {
    console.error('LibreOffice nije pronadjen; traka je NEPOKRIVENA na ovom stroju, ne prolazi.');
    console.error('Trazeno na: ' + SOFFICE_CANDIDATES.join(', '));
    process.exit(2);
  }
  if (!only && !all) {
    console.error('Zadaj --row <id> ili --all.');
    process.exit(1);
  }

  const rows = enumerateRows();
  const odabrani = (only ? rows.filter((r) => r.id === only) : rows).slice(0, limit);
  if (!odabrani.length) {
    console.error(only ? `Nepoznat redak: ${only}` : 'Nijedan redak.');
    process.exit(1);
  }

  console.log(`LibreOffice: ${soffice}`);
  console.log(`proza: ${PROZA_DIR}`);
  console.log(`izlaz: ${outDir}\n`);
  for (const row of odabrani) {
    await generirajRedak(row, false, outDir, soffice);
    if (messy || all) await generirajRedak(row, true, outDir, soffice);
  }
}

await main();
