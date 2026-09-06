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
import { applyMutations, shapeForMutation, MUTATIONS } from './mutations.mts';
import { validateProseBody, wordCount, type ProseBody } from '../../src/corpus/prose-schema';
import { detectShapes, presentShapes, verifyShapeClaims } from '../../src/corpus/docx-shapes';
import { readZip } from '../../src/repair/zip-codec';
import { TITLE_PAGE_TEMPLATES, resolveTemplate, ensureTemplatesHeavy } from '../../src/title-pages/template-loader';

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

/**
 * Redci naslovnice iz LEKTINA predloska.
 *
 * Naslovnica je jedina fakultetska dimenzija koju proza ne nosi, i jedina po kojoj se vecina redaka
 * uopce razlikuje: izmjereno 2026-09-06, 720 redaka daje samo 163 razlicita skupa pravila tijela.
 * Zato se uzima iz predloska, po ULOGAMA koje predlozak propisuje, a ne po nasem redoslijedu.
 */
async function titleLines(row: CorpusRow, body: ProseBody): Promise<{ lines: string[]; templateId: string | null }> {
  await ensureTemplatesHeavy();
  const t = resolveTemplate(TITLE_PAGE_TEMPLATES, row.unitId, row.workType as never) as
    | { id: string; elements?: Array<{ role: string; fixedText?: string; uppercase?: boolean }> }
    | null;
  const natpis: Record<string, string> = {
    seminar: 'SEMINARSKI RAD',
    final: 'ZAVRŠNI RAD',
    graduate: 'DIPLOMSKI RAD',
    specialist: 'SPECIJALISTIČKI RAD',
    doctoral: 'DOKTORSKI RAD',
    article: 'ZNANSTVENI ČLANAK',
    project: 'PROJEKTNI RAD',
  };
  const vrijednost: Record<string, string> = {
    university: 'Sveučilište u Zagrebu',
    faculty: row.unitName,
    study: row.program,
    author: body.titlePage.author,
    title: body.titlePage.title,
    subtitle: '',
    worktype: body.titlePage.label || natpis[row.workType] || 'RAD',
    mentor: `Mentor: ${body.titlePage.mentor}`,
    comentor: '',
    placeyear: 'Zagreb, 2026.',
  };
  if (!t?.elements?.length) {
    // Bez predloska se NE izmislja fakultetski raspored; uzima se neutralan minimum i to se biljezi.
    return {
      lines: [row.unitName, row.program, '', body.titlePage.author, '', body.titlePage.title, '',
        vrijednost.worktype, '', vrijednost.mentor, '', vrijednost.placeyear],
      templateId: null,
    };
  }
  const lines: string[] = [];
  for (const e of t.elements) {
    const v = e.fixedText ?? vrijednost[e.role] ?? '';
    if (!v) continue;
    lines.push(e.uppercase ? v.toUpperCase() : v);
    lines.push('');
  }
  return { lines, templateId: t.id };
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
  const nalazi = validateProseBody(body);
  if (nalazi.length) {
    // Proza koja ne prolazi validator NE ide dalje: dokument bi nosio oblik koji nismo htjeli mjeriti.
    console.error(`  ${row.id}: proza ima ${nalazi.length} nalaz(a):`);
    for (const n of nalazi) console.error(`      ${n}`);
    process.exitCode = 1;
    return;
  }

  const rules = composedRulesFor(row) as ProfileRules;
  const { lines, templateId } = await titleLines(row, body);
  const osnovni = buildFodt(body, { titleLines: lines, rules });
  const { fodt, counters } = messy ? applyMutations(osnovni, NEUREDNE) : { fodt: osnovni, counters: {} };

  const naziv = `${row.id}--${messy ? 'neuredan' : 'uskladjen'}`;
  const fodtPath = join(outDir, `${naziv}.fodt`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(fodtPath, fodt, 'utf8');
  const docxPath = convert(soffice, fodtPath, outDir);
  rmSync(fodtPath, { force: true });

  const bytes = new Uint8Array(readFileSync(docxPath));
  const shapes = detectShapes(await readZip(bytes));
  const claimed = presentShapes(shapes);
  const presuda = verifyShapeClaims(claimed, shapes, counters, shapeForMutation());

  const sidecar = {
    profileId: row.routedProfileId,
    // DVA POJASA. `synthetic` je prvi filtar u `sidecarAdmitted`, `track` je bijeli popis; dokument s
    // nasom prozom ne smije potkrijepiti tvrdnju "dokazano na stvarnom studentskom radu".
    synthetic: true,
    track: 'authored',
    row: {
      id: row.id,
      unitId: row.unitId,
      workType: row.workType,
      level: row.level,
      program: row.program,
      variant: row.variant,
      fallbackFamily: row.fallbackFamily,
      titlePageTemplateId: templateId,
    },
    prose: { id: body.id, words: wordCount(body), authoring: body.authoring },
    provenance: {
      tool: 'libreoffice',
      toolPath: soffice,
      os: `${process.platform} ${process.arch}`,
      command: `npx vite-node scripts/corpus-gen/generate.mts -- --row ${row.id}${messy ? ' --messy' : ''}`,
      generatedAt: new Date().toISOString(),
    },
    mutations: counters,
    shapes: { claimed },
  };
  writeFileSync(docxPath.replace(/\.docx$/i, '.json'), JSON.stringify(sidecar, null, 2) + '\n', 'utf8');

  const problemi = [...presuda.missing, ...presuda.unknown, ...presuda.underDetected];
  const oznaka = problemi.length ? 'NALAZ' : 'ok   ';
  console.log(`  ${oznaka} ${naziv.padEnd(48)} ${String(bytes.length).padStart(7)} B  oblika: ${claimed.length}`);
  for (const p of problemi) {
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
