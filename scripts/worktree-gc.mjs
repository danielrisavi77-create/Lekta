#!/usr/bin/env node
/**
 * WORKTREE GC: uklanja git worktreeove koji su spojeni u master i u kojima nema nista vazno
 * (odluka vlasnika 2026-10-03).
 *
 * Zasto postoji: worktree stvara implementatorska sesija, a spaja ga koordinator kasnije, kad te
 * sesije vise nema ili joj je kontekst sazet. Nitko nije bio "na redu" za ciscenje, pravilo je
 * zivjelo samo u biljeskama, a prvi signal je bio disk ispod 3 GB i gate preflight koji staje
 * (3. 10. 2026.: 1,7 GB slobodno uz 11 worktreeova). Ova skripta je deterministicki provoditelj;
 * zove je SessionStart bootstrap (`scripts/agents/session-bootstrap.mjs`) i koordinator nakon
 * spajanja (`.claude/skills/pr-merge/SKILL.md`).
 *
 * Worktree je UKLONJIV samo kad vrijedi SVE:
 *  - nije glavno stablo, nije zakljucan (`git worktree lock`) i nije tekuce stablo ovog procesa;
 *  - HEAD je predak baze (`git merge-base --is-ancestor HEAD origin/master`): nijedan commit se ne gubi;
 *  - nema promjena pracenih datoteka;
 *  - neprac. datoteke su samo s uskog popisa (gate.log, .gate-lock, *.log), a ignorirane samo
 *    potrosne (node_modules, dist, test-results...); sve ostalo (npr. .env, lokalni korpus) zadrzava;
 *  - ne drzi ga zivi gate lock (isti lock i ista presuda kao `scripts/gate-preflight.mjs`);
 *  - nijedan tudji proces nema stazu stabla u naredbenom retku (nemjerljiv snimak procesa zadrzava);
 *  - stariji je od 60 min (najnoviji mtime od `.git` datoteke, gitdir HEAD i gitdir index).
 *
 * Zadano je SUHI RAD: tablica kandidata i ukupno MB koji se mogu osloboditi. `--apply` uklanja
 * samo uklonjive: prvo SAMO link za junction/symlink (`node_modules` junction na glavni repo; cilj
 * se provjerava da je netaknut), zatim potrosne neprac. datoteke, pa `git worktree remove` BEZ
 * `--force` (git sam jos jednom provjerava cistocu), na kraju `git worktree prune`.
 *
 * Izlazni kod: 0 kad je mjerenje potpuno. Djelomican pad bilo kojeg git poziva (ili neuspjelo
 * uklanjanje) daje 1: nepotpuno mjerenje nikad nije tiha nula.
 *
 * Uporaba:
 *   node scripts/worktree-gc.mjs                  # suhi rad, tablica
 *   node scripts/worktree-gc.mjs --apply          # ukloni uklonjive
 *   node scripts/worktree-gc.mjs --apply --quiet  # jedan redak (SessionStart)
 *   node scripts/worktree-gc.mjs --json           # sazetak za gate preflight
 *   opcije: --repo <staza> (zadano korijen ovog repoa), --base <ref> (zadano origin/master)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isPidAlive,
  listProcesses,
  lockFilePath,
  lockStatus,
  ownProcessTree,
  readLock,
} from './gate-preflight.mjs';

const MIN_AGE_MS = 60 * 60 * 1000;
const DEFAULT_BASE = 'origin/master';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Neprac. datoteke koje smiju nestati s worktreeom (samo datoteke, nikad mape). */
const DISPOSABLE_UNTRACKED = [/^gate\.log$/i, /^\.gate-lock$/i, /\.log$/i];
/** Ignorirane stavke koje su potrosne: ovisnosti, build i izvjestaji testova. */
const DISPOSABLE_IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'test-results',
  'playwright-report',
  'coverage',
  '.vite',
  'scratchpad-dist-public',
]);
const DISPOSABLE_IGNORED_FILES = [/^gate\.log$/i, /^\.gate-lock$/i, /\.log$/i, /\.tsbuildinfo$/i];

class GitError extends Error {
  constructor(args, cwd, detail) {
    super(`git ${args.join(' ')} (u ${cwd}) nije uspio: ${detail}`);
    this.name = 'GitError';
  }
}

/**
 * Jedan git poziv. Vraca stdout ili baca GitError; `okCodes` dopusta izlazne kodove koji nose
 * odgovor (npr. 1 za `merge-base --is-ancestor`).
 * @returns {{ code: number, stdout: string }}
 */
function runGit(args, cwd, okCodes = [0]) {
  const res = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  if (res.error) throw new GitError(args, cwd, res.error.message);
  const code = typeof res.status === 'number' ? res.status : -1;
  if (!okCodes.includes(code)) {
    throw new GitError(args, cwd, `izlaz ${code}: ${(res.stderr || '').trim().split('\n')[0] ?? ''}`);
  }
  return { code, stdout: res.stdout ?? '' };
}

/** Staza za usporedbu: apsolutna, kose crte, bez zavrsne, mala slova na Windowsu. */
function normPath(p) {
  const out = resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? out.toLowerCase() : out;
}

/**
 * Parsira `git worktree list --porcelain`.
 * @returns {{ path: string, head: string|null, branch: string|null, detached: boolean, bare: boolean, locked: boolean, prunable: boolean }[]}
 */
export function parseWorktreeList(text) {
  const out = [];
  let cur = null;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice('worktree '.length), head: null, branch: null, detached: false, bare: false, locked: false, prunable: false };
      out.push(cur);
    } else if (!cur) {
      continue;
    } else if (line.startsWith('HEAD ')) cur.head = line.slice(5).trim();
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).trim().replace(/^refs\/heads\//, '');
    else if (line === 'detached') cur.detached = true;
    else if (line === 'bare') cur.bare = true;
    else if (line === 'locked' || line.startsWith('locked ')) cur.locked = true;
    else if (line === 'prunable' || line.startsWith('prunable ')) cur.prunable = true;
  }
  return out;
}

/**
 * Parsira `git status --porcelain=v1 -z --ignored=traditional --untracked-files=normal`.
 * @returns {{ tracked: string[], untracked: string[], ignored: string[] }}
 */
export function parseStatusZ(text) {
  const tracked = [];
  const untracked = [];
  const ignored = [];
  const parts = text.split('\0');
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    if (!entry) continue;
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    if (xy === '??') untracked.push(path);
    else if (xy === '!!') ignored.push(path);
    else {
      tracked.push(path);
      if (xy[0] === 'R' || xy[0] === 'C') i += 1; // izvorna staza preimenovanja
    }
  }
  return { tracked, untracked, ignored };
}

function isDisposableUntracked(path) {
  if (path.endsWith('/')) return false;
  const name = basename(path);
  return DISPOSABLE_UNTRACKED.some((re) => re.test(name));
}

function isDisposableIgnored(path) {
  if (path.endsWith('/')) return DISPOSABLE_IGNORED_DIRS.has(basename(path.slice(0, -1)));
  const name = basename(path);
  return DISPOSABLE_IGNORED_DIRS.has(name) || DISPOSABLE_IGNORED_FILES.some((re) => re.test(name));
}

/**
 * CISTA presuda nad vec izmjerenim cinjenicama. Ne dira OS ni git.
 * @param {{ main: boolean, bare: boolean, locked: boolean, prunable: boolean, current: boolean,
 *   ancestor: boolean|null, status: { tracked: string[], untracked: string[], ignored: string[] }|null,
 *   lockHeld: boolean|null, processPids: number[]|null, newestMtimeMs: number|null }} facts
 * @param {{ nowMs: number, minAgeMs?: number }} options
 * @returns {{ removable: boolean, reasons: string[] }}
 */
export function judgeWorktree(facts, { nowMs, minAgeMs = MIN_AGE_MS }) {
  if (facts.main) return { removable: false, reasons: ['glavno stablo'] };
  if (facts.bare) return { removable: false, reasons: ['bare repo'] };
  if (facts.prunable) return { removable: true, reasons: [] };
  const reasons = [];
  if (facts.locked) reasons.push('zakljucan (git worktree lock)');
  if (facts.current) reasons.push('tekuce stablo ovog procesa');
  if (facts.ancestor !== true) reasons.push('HEAD nije spojen u bazu');
  if (!facts.status) {
    reasons.push('stanje stabla nije izmjereno');
  } else {
    if (facts.status.tracked.length > 0) reasons.push(`necommitane promjene (${facts.status.tracked.length})`);
    const untracked = facts.status.untracked.filter((p) => !isDisposableUntracked(p));
    if (untracked.length > 0) reasons.push(`neprac. datoteke: ${untracked.slice(0, 2).join(', ')}${untracked.length > 2 ? ` (+${untracked.length - 2})` : ''}`);
    const ignored = facts.status.ignored.filter((p) => !isDisposableIgnored(p));
    if (ignored.length > 0) reasons.push(`ignorirane datoteke: ${ignored.slice(0, 2).join(', ')}${ignored.length > 2 ? ` (+${ignored.length - 2})` : ''}`);
  }
  if (facts.lockHeld === null) reasons.push('gate lock nemjerljiv');
  else if (facts.lockHeld) reasons.push('drzi ga aktivni gate lock');
  if (facts.processPids === null) reasons.push('procesi nisu izmjereni');
  else if (facts.processPids.length > 0) reasons.push(`proces radi u stablu (PID ${facts.processPids.slice(0, 3).join(', ')})`);
  if (facts.newestMtimeMs === null) reasons.push('starost nepoznata');
  else if (nowMs - facts.newestMtimeMs < minAgeMs) reasons.push(`mladji od ${Math.round(minAgeMs / 60000)} min`);
  return { removable: reasons.length === 0, reasons };
}

/** Gitdir worktreea iz njegove `.git` datoteke, ili null. */
function readGitdir(wtPath) {
  try {
    const raw = readFileSync(join(wtPath, '.git'), 'utf8');
    const m = raw.match(/^gitdir:\s*(.+)$/m);
    if (!m) return null;
    const gd = m[1].trim();
    return isAbsolute(gd) ? gd : resolve(wtPath, gd);
  } catch {
    return null;
  }
}

/** Najnoviji mtime od `.git` datoteke, gitdir HEAD i gitdir index; null kad nijedan ne postoji. */
function newestActivityMs(wtPath) {
  const gitdir = readGitdir(wtPath);
  const candidates = [join(wtPath, '.git')];
  if (gitdir) candidates.push(join(gitdir, 'HEAD'), join(gitdir, 'index'));
  let newest = null;
  for (const p of candidates) {
    try {
      const m = statSync(p).mtimeMs;
      if (newest === null || m > newest) newest = m;
    } catch {
      // nema datoteke; ostale odlucuju
    }
  }
  return newest;
}

/** Velicina mape u bajtovima; linkovi i junctioni se NE prate (broji se samo sam link). */
function dirSizeBytes(root) {
  let total = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      let st;
      try {
        st = lstatSync(p);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) stack.push(p);
      else total += st.size;
    }
  }
  return total;
}

const toMb = (bytes) => Math.round(bytes / (1024 * 1024));

/**
 * Mjeri sve worktreeove. Baca GitError na bilo kojem neuspjelom git pozivu.
 * @returns {{ mainPath: string, rows: object[], lockUnmeasurable: boolean }}
 */
function measureWorktrees({ repo = REPO_ROOT, base = DEFAULT_BASE, env = process.env, nowMs = Date.now(), sizes = 'all', cwd = process.cwd() } = {}) {
  const list = parseWorktreeList(runGit(['worktree', 'list', '--porcelain'], repo).stdout);
  if (list.length === 0) throw new GitError(['worktree', 'list'], repo, 'prazan popis');
  const mainPath = list[0].path;
  const baseSha = runGit(['rev-parse', '--verify', `${base}^{commit}`], mainPath).stdout.trim();

  const lockRaw = readLock(lockFilePath(env));
  const lockUnmeasurable = Boolean(lockRaw && lockRaw.unmeasurable);
  const lock = lockUnmeasurable ? null : lockRaw;
  const lockAlive = lock ? lockStatus({ lock, lockAlive: isPidAlive(lock.pid), nowMs }) === 'alive' : false;

  // Snimak procesa se radi lijeno, najvise jednom, i samo kad neko stablo dodje do te provjere.
  let processes;
  let foreign;
  const foreignProcesses = () => {
    if (foreign !== undefined) return foreign;
    try {
      processes = listProcesses();
    } catch {
      processes = null;
    }
    const own = Array.isArray(processes) ? ownProcessTree(processes, process.pid) : new Set();
    foreign = Array.isArray(processes)
      ? processes.filter((p) => !own.has(p.pid) && typeof p.commandLine === 'string' && p.commandLine)
      : null;
    return foreign;
  };
  const cwdNorm = normPath(cwd);

  const rows = list.map((wt, index) => {
    const main = index === 0;
    const branch = wt.branch ?? (wt.head ? `(detached ${wt.head.slice(0, 8)})` : '(nepoznato)');
    const row = { path: wt.path, branch, head: wt.head, sizeBytes: null, removable: false, reasons: [], prunable: wt.prunable };
    if (main || wt.bare || wt.prunable) {
      const verdict = judgeWorktree({ main, bare: wt.bare, locked: wt.locked, prunable: wt.prunable, current: false, ancestor: null, status: null, lockHeld: false, processPids: [], newestMtimeMs: null }, { nowMs });
      return { ...row, removable: verdict.removable, reasons: wt.prunable ? ['mapa ne postoji (prune)'] : verdict.reasons, sizeBytes: 0 };
    }
    // Mapa nestala, a git je ne nudi za prune (npr. zakljucan): nema sto mjeriti ni ukloniti.
    if (!existsSync(wt.path)) return { ...row, reasons: ['mapa ne postoji, a git je ne nudi za prune'], sizeBytes: 0 };
    const wtNorm = normPath(wt.path);
    const ancestor = wt.head
      ? runGit(['merge-base', '--is-ancestor', wt.head, baseSha], mainPath, [0, 1]).code === 0
      : false;
    // Dvije faze radi brzine (SessionStart): skeniranje ignoriranih stavki i snimak procesa traju
    // sekundama po stablu, pa se rade samo za stablo koje je proslo jeftine provjere. Zadrzanom
    // stablu tablica zato navodi razloge iz prve faze, ne nuzno sve.
    let status = parseStatusZ(runGit(['status', '--porcelain=v1', '-z', '--untracked-files=normal'], wt.path).stdout);
    const lockHeld = lockUnmeasurable ? null : Boolean(lockAlive && lock && lock.worktree && normPath(lock.worktree) === wtNorm);
    const current = cwdNorm === wtNorm || cwdNorm.startsWith(`${wtNorm}/`);
    const facts = { main, bare: false, locked: wt.locked, prunable: false, current, ancestor, status, lockHeld, processPids: [], newestMtimeMs: newestActivityMs(wt.path) };
    let verdict = judgeWorktree(facts, { nowMs });
    if (verdict.removable) {
      status = parseStatusZ(
        runGit(['status', '--porcelain=v1', '-z', '--ignored=traditional', '--untracked-files=normal'], wt.path).stdout,
      );
      const variants = [wt.path, wt.path.replace(/\//g, '\\')].map((v) => (process.platform === 'win32' ? v.toLowerCase() : v));
      const fp = foreignProcesses();
      const processPids = fp === null ? null : fp
        .filter((p) => {
          const cl = process.platform === 'win32' ? p.commandLine.toLowerCase() : p.commandLine;
          return variants.some((v) => cl.includes(v));
        })
        .map((p) => p.pid);
      verdict = judgeWorktree({ ...facts, status, processPids }, { nowMs });
    }
    const sizeBytes = sizes === 'all' || (sizes === 'removable' && verdict.removable) ? dirSizeBytes(wt.path) : null;
    return { ...row, removable: verdict.removable, reasons: verdict.reasons, sizeBytes, status };
  });

  return { mainPath, rows, lockUnmeasurable };
}

/**
 * Uklanja SAMO link (junction ili symlink); cilj ostaje. Baca ako cilj nakon toga nestane.
 */
function removeLinkOnly(linkPath) {
  let target = null;
  try {
    target = resolve(dirname(linkPath), readlinkSync(linkPath));
  } catch {
    target = null;
  }
  try {
    unlinkSync(linkPath);
  } catch {
    rmdirSync(linkPath);
  }
  if (existsSync(linkPath)) throw new Error(`link ${linkPath} nije uklonjen`);
  if (target && !existsSync(target)) throw new Error(`cilj linka ${target} je nestao nakon uklanjanja linka`);
}

/** Uklanja jedan uklonjiv worktree. Baca na bilo kojem neuspjehu. */
function removeWorktree(mainPath, row) {
  if (!existsSync(row.path)) return 'nestao';
  const entries = [...(row.status?.untracked ?? []), ...(row.status?.ignored ?? [])];
  for (const rel of entries) {
    const p = join(row.path, rel.replace(/\/$/, ''));
    let st;
    try {
      st = lstatSync(p);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) removeLinkOnly(p);
  }
  for (const rel of row.status?.untracked ?? []) {
    if (!isDisposableUntracked(rel)) continue;
    try {
      unlinkSync(join(row.path, rel));
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
    }
  }
  runGit(['worktree', 'remove', row.path], mainPath);
  return 'uklonjen';
}

function formatTable(rows) {
  const lines = ['putanja | grana | MB | odluka'];
  for (const r of rows) {
    const mb = r.sizeBytes === null ? '?' : String(toMb(r.sizeBytes));
    const verdict = r.removable ? 'UKLONJIV' : `zadrzan: ${r.reasons.join('; ')}`;
    lines.push(`${r.path} | ${r.branch} | ${mb} | ${verdict}`);
  }
  return lines;
}

function parseArgs(argv) {
  const args = { apply: false, quiet: false, json: false, repo: REPO_ROOT, base: DEFAULT_BASE };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--json') args.json = true;
    else if (a === '--repo') args.repo = resolve(argv[++i] ?? '.');
    else if (a === '--base') args.base = argv[++i] ?? DEFAULT_BASE;
  }
  return args;
}

function main(argv, { env = process.env, log = console.log, err = console.error } = {}) {
  const args = parseArgs(argv);
  let measured;
  try {
    measured = measureWorktrees({
      repo: args.repo,
      base: args.base,
      env,
      sizes: args.quiet || args.json ? 'removable' : 'all',
    });
  } catch (error) {
    err(`worktree-gc: PAD mjerenja (exit 1): ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const { mainPath, rows } = measured;
  const others = rows.filter((r) => normPath(r.path) !== normPath(mainPath));
  const removable = others.filter((r) => r.removable);
  const removableBytes = removable.reduce((s, r) => s + (r.sizeBytes ?? 0), 0);

  if (args.json) {
    log(JSON.stringify({ removable: removable.length, removableMb: toMb(removableBytes), kept: others.length - removable.length }));
    return 0;
  }
  if (!args.quiet) {
    for (const line of formatTable(rows)) log(line);
    log(`ukupno uklonjivo: ${removable.length} stabala, ${toMb(removableBytes)} MB`);
  }
  if (!args.apply) return 0;

  let removedCount = 0;
  let removedBytes = 0;
  let failed = 0;
  for (const row of removable) {
    if (row.prunable) continue;
    try {
      const result = removeWorktree(mainPath, row);
      if (result === 'uklonjen') {
        removedCount += 1;
        removedBytes += row.sizeBytes ?? 0;
        if (!args.quiet) log(`uklonjen: ${row.path}`);
      }
    } catch (error) {
      failed += 1;
      err(`worktree-gc: uklanjanje ${row.path} nije uspjelo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const prunable = removable.filter((r) => r.prunable).length;
  try {
    runGit(['worktree', 'prune'], mainPath);
    removedCount += prunable;
  } catch (error) {
    failed += 1;
    err(`worktree-gc: ${error instanceof Error ? error.message : String(error)}`);
  }
  const kept = others.length - removedCount;
  log(`worktree-gc: uklonjeno ${removedCount} (${toMb(removedBytes)} MB), zadrzano ${kept}${failed ? `, PAD ${failed}` : ''}`);
  return failed ? 1 : 0;
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  const norm = (p) => resolve(p).replace(/\\/g, '/').toLowerCase();
  return norm(entry) === norm(fileURLToPath(import.meta.url));
}

if (isDirectRun()) {
  process.exitCode = main(process.argv.slice(2));
}
