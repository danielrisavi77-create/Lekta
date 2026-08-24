#!/usr/bin/env node
// scripts/disk-cleanup.mjs
//
// Sto na disku zauzima mjesto, a moze se ponovno napraviti jednom naredbom.
//
// Repozitorij vec zna odgovor: `.gitignore` je popis onoga sto je LOKALNO i regenerabilno
// (node_modules, dist, .artifacts, .harvest-cache, .tmp-*, playwright izlazi, izlazi
// generatora demo videa, korpusni indeksi). Ta znanja su ovdje pretvorena u mjerenje i,
// kad se izricito zatrazi, u brisanje.
//
// SIGURNOSNI UGOVOR (razlog zasto ova skripta postoji umjesto rucnog `rm -rf`):
//   1. Bez zastavice `--apply` skripta NISTA ne brise, samo mjeri i ispisuje.
//   2. Kandidat unutar repozitorija brise se SAMO ako ga git smatra ignoriranim
//      (`git check-ignore`). Praceni sadrzaj je time nedodirljiv i kad se u popis
//      zabunom upise kriva putanja.
//   3. Putanja izvan repozitorija dopustena je samo unutar korisnickog doma i samo iz
//      ugradjenog popisa cacheva, iza zastavice `--global`.
//   4. Skupo obnovljivo (korpusni indeks, harvestani materijali) NIJE u zadanom skupu;
//      trazi `--include-costly`.
//   5. Postoji popis koji se NIKAD ne brise, ni sa svim zastavicama (stvarni studentski
//      radovi, tajne, lokalni preflight fajlovi). Oni se samo prijave.
//
// Pokretanje:
//   npm run clean                              izvjestaj za repozitorij
//   npm run clean -- --global                  i dev cachevi izvan repozitorija
//   npm run clean -- --global --include-costly sve, ukljucujuci skupo obnovljivo
//   npm run clean -- --apply                   stvarno brisanje zadanog skupa
//
// Kombinacije zastavica se zbrajaju: `--apply --global --include-costly` brise sve sto je
// prethodni izvjestaj s istim zastavicama pokazao.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = os.homedir();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const GLOBAL = args.includes('--global');
const COSTLY = args.includes('--include-costly');

/**
 * Kandidati unutar repozitorija.
 *
 * `costly` znaci: obnova je moguca, ali trosi mrezu, vrijeme ili oboje, pa se ne brise
 * dok se to izricito ne zatrazi. Sve ostalo vraca jedna lokalna naredba.
 */
export const REPO_CANDIDATES = [
  { rel: 'node_modules', why: 'ovisnosti', restore: 'npm ci' },
  { rel: 'dist', why: 'build izlaz', restore: 'npm run build' },
  { rel: 'scratchpad-dist-public', why: 'privremeni build izlaz', restore: 'npm run build' },
  { rel: 'artifacts', why: 'lokalni artefakti alata', restore: 'ponovno pokretanje alata' },
  { rel: '.artifacts', why: 'lokalni artefakti alata', restore: 'ponovno pokretanje alata' },
  { rel: '.harvest-cache', why: 'cache harvesta citata (doi.org/CSL)', restore: 'ponovni harvest' },
  { rel: '.tmp-edge-bundles', why: 'bundlovi Edge funkcija', restore: 'npm run check:edge' },
  { rel: '.tmp-word-verify', why: 'Word oracle radni fajlovi', restore: 'npm run verify:word:toc' },
  { rel: 'test-results', why: 'Playwright izlazi', restore: 'npm run test:ux' },
  { rel: 'playwright-report', why: 'Playwright izvjestaj', restore: 'npm run test:ux' },
  { rel: '.playwright-mcp', why: 'Playwright MCP radni direktorij', restore: 'ponovno pokretanje' },
  { rel: '.netlify', why: 'lokalni Netlify direktorij', restore: 'netlify link' },
  { rel: '.superpowers', why: 'radno stanje izvodjenja (task briefovi, progress)', restore: 'nije potrebno' },
  { rel: 'tmp', why: 'kopije korisnickih .docx iz emit-repair-samples', restore: 'npm run emit-repair-samples' },
  { rel: 'scripts/demo-video/frames', why: 'frameovi demo videa', restore: 'generator demo videa' },
  { rel: 'coverage', why: 'izvjestaj pokrivenosti testova', restore: 'vitest run --coverage' },
  {
    rel: 'training-pipeline/output',
    why: 'izlazi training pipelinea',
    restore: 'python training-pipeline/run_pipeline.py',
    costly: true,
  },
  {
    rel: 'training-pipeline/sources',
    why: 'harvestani materijali training pipelinea',
    restore: 'ponovni harvest (mreza)',
    costly: true,
  },
];

/**
 * Uzorci datoteka (ne direktorija) koji se skupljaju po stablu repozitorija.
 * Trazi se samo izvan `node_modules` i `.git`, inace sken traje predugo.
 */
const REPO_FILE_PATTERNS = [
  { match: (name) => name === '.DS_Store', why: 'macOS smece', restore: 'nije potrebno' },
  { match: (name) => name === 'debug.log', why: 'debug log ugradjenog preglednika', restore: 'nije potrebno' },
  { match: (name) => name === '__pycache__', dir: true, why: 'Python bytecode', restore: 'nije potrebno' },
  { match: (name) => name.endsWith('.egg-info'), dir: true, why: 'Python build metapodaci', restore: 'nije potrebno' },
];

/**
 * Dev cachevi izvan repozitorija. Svaki je namjerno cache: brisanje usporava sljedeci
 * build, ali nista ne gubi. Putanje pokrivaju i Linux i macOS rasporede.
 */
export const GLOBAL_CANDIDATES = [
  { rel: '.npm/_cacache', why: 'npm cache', restore: 'npm cache verify (sam se puni)' },
  { rel: '.cache/ms-playwright', why: 'Playwright preglednici', restore: 'npx playwright install' },
  { rel: 'Library/Caches/ms-playwright', why: 'Playwright preglednici (macOS)', restore: 'npx playwright install' },
  { rel: '.cache/puppeteer', why: 'Puppeteer preglednici', restore: 'ponovno preuzimanje' },
  { rel: '.cache/pip', why: 'pip cache', restore: 'sam se puni' },
  { rel: 'Library/Caches/pip', why: 'pip cache (macOS)', restore: 'sam se puni' },
  { rel: '.cache/yarn', why: 'yarn cache', restore: 'sam se puni' },
  { rel: 'Library/Caches/Yarn', why: 'yarn cache (macOS)', restore: 'sam se puni' },
  { rel: '.bun/install/cache', why: 'bun cache', restore: 'sam se puni' },
  { rel: '.cache/typescript', why: 'TypeScript cache tipova', restore: 'sam se puni' },
  { rel: '.cache/electron', why: 'Electron preuzimanja', restore: 'ponovno preuzimanje' },
  { rel: '.cache/deno', why: 'Deno cache (Supabase Edge)', restore: 'sam se puni' },
  {
    rel: 'Library/Developer/Xcode/DerivedData',
    why: 'Xcode build izlazi (macOS)',
    restore: 'sljedeci Xcode build',
    costly: true,
  },
];

/**
 * Nikad se ne brise, ni sa svim zastavicama.
 *
 * Ovo nisu artefakti: `tests/fixtures/docx-local` su tudji studentski radovi s osobnim
 * podacima koji se ne mogu regenerirati, a `.env` i preflight fajlovi nose lokalnu
 * konfiguraciju. Prijavljuju se samo zato da se vidi gdje mjesto odlazi.
 */
export const NEVER_DELETE = [
  { rel: 'tests/fixtures/docx-local', why: 'stvarni studentski radovi, neponovljivi' },
  { rel: 'docs/generated/repair-real-corpus.local.json', why: 'rezultat lokalnog mjerenja' },
  { rel: '.env', why: 'tajne' },
  { rel: 'lekta-pipeline', why: 'zaseban git repozitorij (M4 korpus)' },
];

const IGNORE_WALK = new Set(['node_modules', '.git']);

export function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

/** Velicina putanje na disku. Simbolicke veze se broje kao 0 i nikad se ne slijede. */
function sizeOf(target) {
  let total = 0;
  const stack = [target];
  while (stack.length) {
    const current = stack.pop();
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      let entries = [];
      try {
        entries = fs.readdirSync(current);
      } catch {
        continue;
      }
      for (const entry of entries) stack.push(path.join(current, entry));
      continue;
    }
    total += stat.size;
  }
  return total;
}

/** Trazi datoteke i direktorije po uzorku, bez ulaska u node_modules i .git. */
function collectPatterns() {
  const found = [];
  const stack = [ROOT];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      const pattern = REPO_FILE_PATTERNS.find(
        (p) => Boolean(p.dir) === entry.isDirectory() && p.match(entry.name),
      );
      if (pattern) {
        found.push({ abs: full, why: pattern.why, restore: pattern.restore });
        continue;
      }
      if (entry.isDirectory() && !IGNORE_WALK.has(entry.name)) stack.push(full);
    }
  }
  return found;
}

/**
 * Je li putanja unutar repozitorija git-ignorirana.
 *
 * Ovo je glavni gard: praceni sadrzaj se ne brise ni kad je zabunom upisan u popis.
 * `node_modules` je poseban slucaj samo utoliko sto `check-ignore` na njemu radi jednako,
 * pa nema iznimke.
 */
function isGitIgnored(abs) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', abs], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Zadnja brana prije brisanja: nikad korijen, nikad dom, nikad izvan poznatih stabala. */
export function isSafeToRemove(abs) {
  const resolved = path.resolve(abs);
  if (resolved === '/' || resolved === HOME || resolved === ROOT) return false;
  const insideRoot = resolved.startsWith(`${ROOT}${path.sep}`);
  const insideHome = resolved.startsWith(`${HOME}${path.sep}`);
  if (!insideRoot && !insideHome) return false;
  if (insideRoot) return isGitIgnored(resolved);
  return true;
}

function describe(entries) {
  return entries
    .filter((e) => fs.existsSync(e.abs))
    .map((e) => ({ ...e, bytes: sizeOf(e.abs) }))
    .filter((e) => e.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);
}

function label(abs) {
  if (abs.startsWith(`${ROOT}${path.sep}`)) return path.relative(ROOT, abs);
  if (abs.startsWith(`${HOME}${path.sep}`)) return `~/${path.relative(HOME, abs)}`;
  return abs;
}

function section(title, entries) {
  if (!entries.length) return 0;
  const total = entries.reduce((sum, e) => sum + e.bytes, 0);
  console.log(`\n${title}  (${human(total)})`);
  for (const entry of entries) {
    console.log(`  ${human(entry.bytes).padStart(9)}  ${label(entry.abs)}`);
    console.log(`             ${entry.why}; povrat: ${entry.restore}`);
  }
  return total;
}

function main() {
  const wanted = (list, base) =>
    list
      .filter((c) => COSTLY || !c.costly)
      .map((c) => ({ ...c, abs: path.join(base, c.rel) }));

  // Izvjestaj mora pokazivati tocno ono sto bi `--apply` obrisao, pa prolazi kroz isti
  // gard. Praceni sadrzaj (primjer: `dist-packs`, koji je commitani izlaz pakiranja, ne
  // artefakt) tako ne moze zavrsiti ni u ponudi, a ne samo u preskocenima.
  const repo = describe([...wanted(REPO_CANDIDATES, ROOT), ...collectPatterns()]).filter((e) =>
    isGitIgnored(e.abs),
  );
  const global = GLOBAL ? describe(wanted(GLOBAL_CANDIDATES, HOME)) : [];
  const protectedEntries = describe(NEVER_DELETE.map((c) => ({ ...c, abs: path.join(ROOT, c.rel), restore: '-' })));

  const skippedCostly = [...REPO_CANDIDATES, ...GLOBAL_CANDIDATES].filter((c) => c.costly).length;

  console.log(`Lekta disk cleanup${APPLY ? ' (BRISANJE)' : ' (samo izvjestaj)'}`);
  console.log(`Repozitorij: ${ROOT}`);

  let total = 0;
  total += section('Regenerabilno u repozitoriju', repo);
  total += section('Dev cachevi izvan repozitorija', global);

  if (protectedEntries.length) {
    const size = protectedEntries.reduce((sum, e) => sum + e.bytes, 0);
    console.log(`\nZasticeno, NE brise se  (${human(size)})`);
    for (const entry of protectedEntries) {
      console.log(`  ${human(entry.bytes).padStart(9)}  ${label(entry.abs)}`);
      console.log(`             ${entry.why}`);
    }
  }

  if (!total) {
    console.log('\nNema sto za pocistiti.');
    return;
  }

  console.log(`\nUkupno za oslobodjenje: ${human(total)}`);
  if (!GLOBAL) console.log('Savjet: `--global` dodaje npm, Playwright i pip cacheve izvan repozitorija.');
  if (!COSTLY && skippedCostly) {
    console.log(`Savjet: \`--include-costly\` dodaje ${skippedCostly} stavki cija obnova trosi mrezu ili vrijeme.`);
  }

  if (!APPLY) {
    console.log('\nNista nije obrisano. Za stvarno brisanje ponovi istu naredbu s `--apply`.');
    return;
  }

  let freed = 0;
  for (const entry of [...repo, ...global]) {
    if (!isSafeToRemove(entry.abs)) {
      console.log(`  preskocen (nije ignoriran ili je izvan dopustenog stabla): ${label(entry.abs)}`);
      continue;
    }
    try {
      fs.rmSync(entry.abs, { recursive: true, force: true });
      freed += entry.bytes;
      console.log(`  obrisano ${human(entry.bytes).padStart(9)}  ${label(entry.abs)}`);
    } catch (error) {
      console.log(`  neuspjelo: ${label(entry.abs)} (${error.message})`);
    }
  }
  console.log(`\nOslobodjeno: ${human(freed)}`);
}

// Pokrece se samo kad je datoteka POZVANA, ne kad je uvezena. Test uvozi popise i
// gard, i ne smije pritom pokrenuti sken diska.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
