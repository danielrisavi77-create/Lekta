/**
 * WORD TRAK: isti prozni JSON, dokument gradi PRAVI Word kroz COM.
 *
 *   npm run corpus-gen:word -- --row <id> [--out <dir>]
 *   npm run corpus-gen:word -- --all [--limit N]
 *
 * Zasto uz LibreOffice trak, a ne umjesto njega. Izmjereno 2026-09-06: `soffice --convert-to docx`
 * ne pise TOC polje UOPCE, pa usklađen primjerak ne moze proci os sadrzaja. Word to moze
 * (`TablesOfContents.Add`) i usput pise `w:rsid` na svakom odlomku, oblik koji nijedan drugi put ne
 * proizvodi. Dva alata nad istom prozom su ujedno i jedina posteno usporediva provenijencijska os.
 *
 * Oblik dolazi iz LEKTINIH pravila, tekst iz proze, naslovnica iz Lektina predloska. PowerShell
 * skripta nista ne cita sama; sve sto oblikuje stize kroz spec, pa se ne moze dogoditi da dva traka
 * mjere razlicit oblik zato sto ga razlicito citaju.
 *
 * Windows i Word 2010+; nema li ga, izlazni kod je 2 ("nepokriveno"), nikad tiho preskakanje.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enumerateRows, composedRulesFor, type CorpusRow } from './rows.mts';
import { validateProseBody, type ProseBody } from '../../src/corpus/prose-schema';
import { titleLinesFor, emitSidecar } from './emit.mts';

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const KORPUS = process.env.LEKTA_SYNTHETIC_CORPUS || join('C:', 'Users', 'PC', 'Desktop', 'Lekta-korpus', '04-sintetski');
const PROZA_DIR = join(KORPUS, 'proza');
const PS1 = join(ROOT, 'scripts', 'corpus-gen', 'word', 'make-prose-fixture.ps1');

const WORD_CANDIDATES = [
  join('C:', 'Program Files (x86)', 'Microsoft Office', 'Office14', 'WINWORD.EXE'),
  join('C:', 'Program Files', 'Microsoft Office', 'Office14', 'WINWORD.EXE'),
  join('C:', 'Program Files', 'Microsoft Office', 'root', 'Office16', 'WINWORD.EXE'),
];

function findWord(): string | null {
  for (const c of WORD_CANDIDATES) if (existsSync(c)) return c;
  return null;
}

/** Wordov `LineSpacingRule`: 0 jednostruko, 1 prored 1,5, 2 dvostruko; ostalo ide na 1,5. */
function lineSpacingRule(spacing: number | undefined): number {
  if (spacing === 1) return 0;
  if (spacing === 2) return 2;
  return 1;
}

interface Rules {
  font?: string[];
  size?: number[];
  spacing?: number;
  margins?: { top: number; right: number; bottom: number; left: number };
  paperSizes?: string[];
  justify?: boolean;
  requireToc?: boolean;
  requirePageNumbers?: boolean;
}

function pageSize(rules: Rules): { w: number; h: number } {
  const name = (rules.paperSizes ?? ['A4'])[0];
  if (/letter/i.test(name)) return { w: 21.59, h: 27.94 };
  if (/a5/i.test(name)) return { w: 14.8, h: 21 };
  return { w: 21, h: 29.7 };
}

async function generirajRedak(row: CorpusRow, outDir: string, wordPath: string): Promise<void> {
  const prozaPath = join(PROZA_DIR, `${row.id}.json`);
  if (!existsSync(prozaPath)) {
    console.log(`  ${row.id.padEnd(42)} PRESKOCENO: nema proze`);
    return;
  }
  const body = JSON.parse(readFileSync(prozaPath, 'utf8')) as ProseBody;
  const nalazi = validateProseBody(body);
  if (nalazi.length) {
    console.error(`  ${row.id}: proza ima ${nalazi.length} nalaz(a):`);
    for (const n of nalazi) console.error(`      ${n}`);
    process.exitCode = 1;
    return;
  }

  const rules = composedRulesFor(row) as Rules;
  const { lines, templateId } = await titleLinesFor(row, body);
  const page = pageSize(rules);
  const m = rules.margins ?? { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };

  const spec = {
    titleLines: lines,
    abstractHr: body.abstract.hr,
    abstractEn: body.abstract.en,
    keywordsHr: body.keywords.hr,
    keywordsEn: body.keywords.en,
    chapters: body.chapters,
    tables: body.tables,
    figures: body.figures,
    footnotes: body.footnotes,
    bibliography: body.bibliography.map((b) => b.text + (b.doi ? ` https://doi.org/${b.doi}` : '')),
    rules: {
      font: rules.font?.[0] ?? 'Times New Roman',
      sizePt: rules.size?.[0] ?? 12,
      lineSpacingRule: lineSpacingRule(rules.spacing),
      justify: rules.justify !== false,
      marginTopCm: m.top,
      marginBottomCm: m.bottom,
      marginLeftCm: m.left,
      marginRightCm: m.right,
      pageWidthCm: page.w,
      pageHeightCm: page.h,
      requireToc: rules.requireToc !== false,
      requirePageNumbers: rules.requirePageNumbers !== false,
    },
  };

  mkdirSync(outDir, { recursive: true });
  const naziv = `${row.id}--word`;
  const specPath = join(outDir, `${naziv}.spec.json`);
  const docxPath = join(outDir, `${naziv}.docx`);
  writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');

  const command = `npm run corpus-gen:word -- --row ${row.id}`;
  execFileSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Spec', specPath, '-Out', docxPath],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000 },
  );
  rmSync(specPath, { force: true });
  if (!existsSync(docxPath)) throw new Error(`Word nije proizveo ${docxPath}`);

  const res = await emitSidecar({
    docxPath,
    row,
    body,
    templateId,
    tool: 'word',
    toolPath: wordPath,
    command,
    counters: {},
    requireToc: spec.rules.requireToc,
  });

  const bytes = readFileSync(docxPath).length;
  const oznaka = res.problems.length ? 'NALAZ' : 'ok   ';
  console.log(`  ${oznaka} ${naziv.padEnd(48)} ${String(bytes).padStart(7)} B  oblika: ${res.claimed.length}`);
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
  const outIdx = argv.indexOf('--out');
  const outDir = outIdx >= 0 ? resolve(ROOT, argv[outIdx + 1]) : join(KORPUS, 'docx');
  const limitIdx = argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : Infinity;

  const wordPath = findWord();
  if (!wordPath) {
    console.error('Word nije pronadjen; trak je NEPOKRIVEN na ovom stroju, ne prolazi.');
    console.error('Trazeno na: ' + WORD_CANDIDATES.join(', '));
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

  console.log(`Word: ${wordPath}`);
  console.log(`proza: ${PROZA_DIR}`);
  console.log(`izlaz: ${outDir}\n`);
  for (const row of odabrani) await generirajRedak(row, outDir, wordPath);
}

await main();
