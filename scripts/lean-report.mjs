#!/usr/bin/env node
// T56: mrtvi kod i duplikati kao MJERENJE, ne kao ciscenje.
//
// `npm run lean:report` vrti knip (neiskoristene datoteke, exporti, tipovi, ovisnosti) i jscpd
// (duplicirani retci), pise `docs/generated/LEAN_REPORT.md` i odrzava ratchet
// `docs/generated/lean-baseline.json`. Baseline se NIKAD ne dize: zapisuje se minimum postojece i
// izmjerene vrijednosti po metrici, pa pad postaje novi strop, a rast ostaje vidljiv u
// `tests/lean-ratchet.test.ts`. Nista se ne brise; svaki nalaz je samo popis.
//
// Djelomican pad pipelinea rusi mjerenje: alat koji ne vrati parsabilan JSON baca gresku, nikad
// ne daje nulu. `--check` vraca izlazni kod 1 kad ijedna ratchet metrika naraste iznad baselinea.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withProvenance } from './lib/provenance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_PATH = path.join(ROOT, 'docs', 'generated', 'lean-baseline.json');
export const REPORT_PATH = path.join(ROOT, 'docs', 'generated', 'LEAN_REPORT.md');
const GENERATOR = 'npm run lean:report';

/** Metrike koje ratchet cuva; postotak dupliciranja je samo informativan (brisanje nedupliciranog koda ga dize). */
export const RATCHET_METRIKE = [
  'knipDatoteke',
  'knipExporti',
  'knipTipovi',
  'knipOvisnosti',
  'knipNenavedene',
  'knipNerazrijesene',
  'jscpdDupliciraniRetci',
  'jscpdKlonovi',
];

const KNIP_POLJA = {
  knipDatoteke: ['files'],
  knipExporti: ['exports', 'nsExports'],
  knipTipovi: ['types', 'nsTypes', 'enumMembers', 'classMembers'],
  knipOvisnosti: ['dependencies', 'devDependencies', 'optionalPeerDependencies'],
  knipNenavedene: ['unlisted'],
  knipNerazrijesene: ['unresolved'],
};

/**
 * Kako pokrenuti alat iz node_modules. Na Windowsu NE preko `.bin/<ime>.cmd`: Node od CVE-2024-27980
 * odbija `execFile` nad `.cmd` bez shella (EINVAL), pa bi mjerenje na svakom Windows stroju palo.
 * Isti recept kao `resolveProviderInvocation` u scripts/agents/cli.mjs: JS ulaz iz `bin` polja paketa
 * kroz `process.execPath`, bez shella. Na ostalim platformama ostaje `.bin/<ime>`.
 */
export function toolInvocation(name, options = {}) {
  const platform = options.platform ?? process.platform;
  const root = options.root ?? ROOT;
  const exists = options.exists ?? existsSync;
  const readText = options.readText ?? ((p) => readFileSync(p, 'utf8'));
  if (platform !== 'win32') {
    const p = path.join(root, 'node_modules', '.bin', name);
    if (!exists(p)) throw new Error(`lean-report: ${name} nije instaliran (node_modules/.bin/${name}); pokreni npm ci`);
    return { command: p, argsPrefix: [] };
  }
  const pkgDir = path.join(root, 'node_modules', name);
  const pkgPath = path.join(pkgDir, 'package.json');
  if (!exists(pkgPath)) throw new Error(`lean-report: ${name} nije instaliran (node_modules/${name}); pokreni npm ci`);
  const pkgBin = JSON.parse(readText(pkgPath)).bin;
  const rel = typeof pkgBin === 'string' ? pkgBin : pkgBin && pkgBin[name];
  if (typeof rel !== 'string') throw new Error(`lean-report: ${name}/package.json nema bin ulaz "${name}"`);
  const entry = path.join(pkgDir, rel);
  if (!exists(entry)) throw new Error(`lean-report: ${name} bin ulaz ne postoji (${entry})`);
  return { command: process.execPath, argsPrefix: [entry] };
}

/** Cisti sazetak knip JSON izvjestaja (knip 6: { issues: [{ file, files, exports, ... }] }). */
export function summarizeKnip(report) {
  if (!report || typeof report !== 'object' || !Array.isArray(report.issues)) {
    throw new Error('lean-report: knip izvjestaj nema polje "issues"');
  }
  const counts = Object.fromEntries(Object.keys(KNIP_POLJA).map((k) => [k, 0]));
  const poDatoteci = new Map();
  for (const issue of report.issues) {
    if (!issue || typeof issue.file !== 'string') throw new Error('lean-report: knip stavka bez "file"');
    let ukupno = 0;
    for (const [metrika, polja] of Object.entries(KNIP_POLJA)) {
      for (const polje of polja) {
        const n = Array.isArray(issue[polje]) ? issue[polje].length : 0;
        counts[metrika] += n;
        if (metrika !== 'knipDatoteke') ukupno += n;
      }
    }
    if (ukupno > 0) poDatoteci.set(issue.file, (poDatoteci.get(issue.file) || 0) + ukupno);
  }
  const top = [...poDatoteci.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 10)
    .map(([file, n]) => ({ file, n }));
  return { counts, top };
}

/** Cisti sazetak jscpd JSON izvjestaja ({ statistics.total, duplicates: [{ firstFile, secondFile, lines }] }). */
export function summarizeJscpd(report) {
  const total = report && report.statistics && report.statistics.total;
  if (!total || typeof total.duplicatedLines !== 'number' || typeof total.lines !== 'number') {
    throw new Error('lean-report: jscpd izvjestaj nema statistics.total');
  }
  const poDatoteci = new Map();
  for (const d of Array.isArray(report.duplicates) ? report.duplicates : []) {
    for (const strana of [d.firstFile, d.secondFile]) {
      if (!strana || typeof strana.name !== 'string') continue;
      const n = typeof d.lines === 'number' ? d.lines : 0;
      poDatoteci.set(strana.name, (poDatoteci.get(strana.name) || 0) + n);
    }
  }
  const top = [...poDatoteci.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 10)
    .map(([file, n]) => ({ file, n }));
  return {
    counts: { jscpdDupliciraniRetci: total.duplicatedLines, jscpdKlonovi: total.clones ?? 0 },
    ukupnoRedaka: total.lines,
    postotak: Math.round(total.percentage * 100) / 100,
    top,
  };
}

/** Vraca popis metrika koje su narasle iznad baselinea (prazan = u redu). */
export function ratchetProblems(baseline, current) {
  const problemi = [];
  for (const m of RATCHET_METRIKE) {
    const b = baseline && baseline.metrike ? baseline.metrike[m] : undefined;
    const c = current[m];
    if (typeof b !== 'number') {
      problemi.push(`${m}: baseline nema vrijednost`);
      continue;
    }
    if (typeof c !== 'number') {
      problemi.push(`${m}: mjerenje nema vrijednost`);
      continue;
    }
    if (c > b) problemi.push(`${m}: ${c} > baseline ${b}`);
  }
  return problemi;
}

/** Novi baseline: minimum postojece i izmjerene vrijednosti; null kad se nista ne spusta. */
export function lowerBaseline(baseline, current) {
  const stare = (baseline && baseline.metrike) || {};
  const nove = {};
  let promjena = !baseline;
  for (const m of RATCHET_METRIKE) {
    const b = stare[m];
    nove[m] = typeof b === 'number' ? Math.min(b, current[m]) : current[m];
    if (nove[m] !== b) promjena = true;
  }
  return promjena ? nove : null;
}

export function measure() {
  const knipInv = toolInvocation('knip');
  const knipRaw = execFileSync(knipInv.command, [...knipInv.argsPrefix, '--reporter', 'json', '--no-exit-code', '--no-progress'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let knipJson;
  try {
    knipJson = JSON.parse(knipRaw);
  } catch (err) {
    throw new Error(`lean-report: knip nije vratio JSON (${err.message}): ${knipRaw.slice(0, 200)}`);
  }
  const out = mkdtempSync(path.join(tmpdir(), 'lean-jscpd-'));
  try {
    const jscpdInv = toolInvocation('jscpd');
    execFileSync(jscpdInv.command, [...jscpdInv.argsPrefix, '--config', '.jscpd.json', '--output', out, '--reporters', 'json', '--silent'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    const jscpdJson = JSON.parse(readFileSync(path.join(out, 'jscpd-report.json'), 'utf8'));
    const knip = summarizeKnip(knipJson);
    const jscpd = summarizeJscpd(jscpdJson);
    return { metrike: { ...knip.counts, ...jscpd.counts }, knipTop: knip.top, jscpd };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

export function renderReport(m, baseline) {
  const red = (k, opis) => {
    const b = baseline && baseline.metrike ? baseline.metrike[k] : undefined;
    return `| ${opis} | ${m.metrike[k]} | ${typeof b === 'number' ? b : 'nema'} |`;
  };
  const top = (list) => (list.length ? list.map((t, i) => `${i + 1}. \`${t.file}\` (${t.n})`).join('\n') : '_nema nalaza_');
  return [
    '# Lean izvjestaj (T56)',
    '',
    `Generira \`${GENERATOR}\`; ne uredjuj rucno. Mjerenje, ne ciscenje: nista od navedenog nije obrisano,`,
    'a knip na ovom repozitoriju ima i lazne pozitive (npr. HTML ulazi i skripte koje se zovu izvan package.json).',
    'Ratchet: `docs/generated/lean-baseline.json`, gard `tests/lean-ratchet.test.ts` (brojevi ne smiju rasti).',
    '',
    '| Metrika | Izmjereno | Baseline |',
    '|---|---:|---:|',
    red('knipDatoteke', 'knip: neiskoristene datoteke'),
    red('knipExporti', 'knip: neiskoristeni exporti'),
    red('knipTipovi', 'knip: neiskoristeni tipovi i clanovi'),
    red('knipOvisnosti', 'knip: neiskoristene ovisnosti (dependencies + devDependencies)'),
    red('knipNenavedene', 'knip: koristene a nenavedene ovisnosti'),
    red('knipNerazrijesene', 'knip: nerazrijeseni importi'),
    red('jscpdDupliciraniRetci', 'jscpd: duplicirani retci'),
    red('jscpdKlonovi', 'jscpd: klonovi'),
    '',
    `Duplicirano: ${m.jscpd.postotak} % od ${m.jscpd.ukupnoRedaka} redaka (informativno, nije u ratchetu).`,
    '',
    '## Top 10 datoteka po knip nalazima (exporti, tipovi, ovisnosti)',
    '',
    top(m.knipTop),
    '',
    '## Top 10 datoteka po dupliciranim retcima (jscpd)',
    '',
    top(m.jscpd.top),
    '',
  ].join('\n');
}

function readBaseline() {
  return existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : null;
}

function main(argv) {
  const m = measure();
  const baseline = readBaseline();
  if (argv.includes('--check')) {
    const problemi = baseline ? ratchetProblems(baseline, m.metrike) : ['baseline ne postoji'];
    for (const p of problemi) console.log(`RATCHET: ${p}`);
    console.log(problemi.length ? 'lean ratchet: PAO' : 'lean ratchet: u redu');
    return problemi.length ? 1 : 0;
  }
  const nove = lowerBaseline(baseline, m.metrike);
  const efektivni = nove ? { metrike: nove } : baseline;
  if (nove) {
    // Nepoznati top-level kljucevi postojeceg baselinea se cuvaju (CLAUDE.md: writeri cuvaju nepoznate kljuceve).
    const zapis = withProvenance({ ...(baseline || {}), metrike: nove }, GENERATOR);
    writeFileSync(BASELINE_PATH, `${JSON.stringify(zapis, null, 2)}\n`);
    console.log(`lean-report: baseline zapisan (${path.relative(ROOT, BASELINE_PATH)})`);
  }
  writeFileSync(REPORT_PATH, renderReport(m, efektivni));
  console.log(`lean-report: ${path.relative(ROOT, REPORT_PATH)}`);
  for (const k of RATCHET_METRIKE) console.log(`  ${k}: ${m.metrike[k]}`);
  console.log(`  jscpdPostotak: ${m.jscpd.postotak}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
  }
}
