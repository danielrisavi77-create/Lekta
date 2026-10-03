#!/usr/bin/env node
/**
 * WORKTREE GC: uklanja git worktreeove koji su spojeni u master i u kojima nema nista vazno
 * (odluka vlasnika 2026-10-03).
 *
 * Zasto postoji: worktree stvara implementatorska sesija, a spaja ga koordinator kasnije, kad te
 * sesije vise nema ili joj je kontekst sazet. Nitko nije bio "na redu" za ciscenje, pravilo je
 * zivjelo samo u biljeskama, a prvi signal je bio disk ispod 3 GB i gate preflight koji staje
 * (3. 10. 2026.: 1,7 GB slobodno uz 11 worktreeova). Ova skripta je deterministicki provoditelj;
 * zove je SessionStart bootstrap u pozadini (`scripts/agents/session-bootstrap.mjs`) i koordinator
 * nakon spajanja (`.claude/skills/pr-merge/SKILL.md`).
 *
 * Worktree je UKLONJIV samo kad vrijedi SVE:
 *  - `git fetch origin master` je upravo uspio (zastarjeli origin/master nikad nije osnova brisanja);
 *  - nije glavno stablo, nije zakljucan (`git worktree lock`) i nije tekuce stablo ovog procesa;
 *  - HEAD je predak baze (`git merge-base --is-ancestor HEAD origin/master`);
 *  - nijedan commit iz HEAD refloga tog stabla nije dostupan SAMO kroz taj reflog
 *    (`git rev-list <reflog> --not --branches --remotes --tags` je prazan);
 *  - nema promjena pracenih datoteka;
 *  - neprac. datoteke su samo tocno `gate.log` i `.gate-lock` u korijenu (i Linux symlink
 *    `node_modules`, vidi nize); sve ostalo, ukljucivo `src/biljeske.log`, zadrzava stablo;
 *  - ignorirane stavke su samo s uskog popisa: `node_modules` u korijenu kao junction ili symlink
 *    na `node_modules` glavnog repoa, `.tmp-*` i `*.log` u korijenu. Ignorirana mapa izvan popisa
 *    (npr. `dist/`, stvarni `node_modules/`, `.env`) zadrzava stablo: sadrzaj se ne moze dokazati;
 *  - u stablu nema drugog reparse pointa (junction ili symlink) osim tog jednog `node_modules`;
 *  - ne drzi ga zivi gate lock; aktivan lock BEZ citljive putanje stabla zadrzava SVA stabla
 *    (presuda `lockStatus` iz `scripts/gate-preflight.mjs`, ista funkcija, ne kopija);
 *  - nijedan tudji proces nema stazu stabla u naredbenom retku (nemjerljiv snimak procesa zadrzava);
 *  - stariji je od 60 min (najnoviji mtime od `.git` datoteke, gitdir HEAD i gitdir index).
 *
 * Zadano je SUHI RAD: tablica kandidata i ukupno MB koji se mogu osloboditi. `--apply` uzima
 * vlastiti medjuprocesni lock (`lekta-worktree-gc.lock` u %TEMP%; drugi GC tada odustaje) i za svako
 * stablo NEPOSREDNO prije uklanjanja ponovno mjeri sve uvjete. Zatim: odvoji SAMO link `node_modules`
 * (cilj ostaje), premjesti `gate.log`/`.gate-lock` u %TEMP%/lekta-worktree-gc-odlozeno (nista se ne
 * brise rucno), pa `git worktree remove` BEZ `--force` (git jos jednom provjerava cistocu i sam
 * brise dopustene ignorirane stavke). Nakon toga mapa mora nestati i iz popisa i s diska.
 *
 * Izlazni kod: 0 kad je mjerenje potpuno. Djelomican pad bilo kojeg git poziva (ili neuspjelo
 * uklanjanje) daje 1: nepotpuno mjerenje nikad nije tiha nula. Nedostupan origin nije pad nego
 * izricito stanje: sva stabla su zadrzana s razlogom "origin nedostupan".
 *
 * Uporaba:
 *   node scripts/worktree-gc.mjs                  # suhi rad, tablica
 *   node scripts/worktree-gc.mjs --apply          # ukloni uklonjive
 *   node scripts/worktree-gc.mjs --apply --quiet  # jedan redak (SessionStart, u pozadini)
 *   node scripts/worktree-gc.mjs --json           # sazetak za gate preflight
 *   opcije: --repo <staza> (zadano korijen ovog repoa), --base <ref> (zadano origin/master)
 *   okolina: LEKTA_WORKTREE_GC_LOCK_PATH, LEKTA_WORKTREE_GC_STASH (samo za testove)
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmdirSync, statSync, symlinkSync, unlinkSync,
} from 'node:fs';
import os from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isPidAlive,
  listProcesses,
  lockFilePath,
  lockStatus,
  ownProcessTree,
  readLock,
  releaseLock,
  writeLock,
} from './gate-preflight.mjs';

const MIN_AGE_MS = 60 * 60 * 1000;
const DEFAULT_BASE = 'origin/master';
const FETCH_TIMEOUT_MS = 30_000;
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Neprac. datoteke u KORIJENU stabla koje se smiju odloziti (tocna imena, nikad mape). */
const ALLOWED_UNTRACKED_ROOT = new Set(['gate.log', '.gate-lock']);

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
function runGit(args, cwd, okCodes = [0], timeoutMs = undefined) {
  const res = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
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

/**
 * Parsira gitdir `logs/HEAD` (reflog HEAD-a tog stabla): sve stare i nove SHA vrijednosti osim nula.
 * @returns {string[]} jedinstveni SHA-ovi redom pojave
 */
export function parseReflogShas(text) {
  const out = new Set();
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = line.match(/^([0-9a-f]{40,64}) ([0-9a-f]{40,64}) /);
    if (!m) continue;
    for (const sha of [m[1], m[2]]) if (!/^0+$/.test(sha)) out.add(sha);
  }
  return [...out];
}

const isRootNodeModules = (path) => path === 'node_modules' || path === 'node_modules/';

/** Neprac. stavka s popisa: tocno ime u korijenu, ili `node_modules` link na glavni repo. */
export function isAllowedUntracked(path, { mainNodeModulesLink = false } = {}) {
  if (mainNodeModulesLink && isRootNodeModules(path)) return true;
  return !path.includes('/') && ALLOWED_UNTRACKED_ROOT.has(path);
}

/**
 * Ignorirana stavka s uskog popisa: `node_modules` u korijenu SAMO kao link na glavni repo, te
 * `.tmp-*` i `*.log` u korijenu. Sve drugo (i `dist/`) zadrzava stablo jer se sadrzaj ne moze
 * dokazati potrosnim.
 */
export function isAllowedIgnored(path, { mainNodeModulesLink = false } = {}) {
  if (isRootNodeModules(path)) return mainNodeModulesLink;
  const bare = path.endsWith('/') ? path.slice(0, -1) : path;
  if (bare.includes('/')) return false;
  if (bare.startsWith('.tmp-')) return true;
  return !path.endsWith('/') && /\.log$/i.test(bare);
}

const listed = (label, items) => `${label}: ${items.slice(0, 2).join(', ')}${items.length > 2 ? ` (+${items.length - 2})` : ''}`;

/**
 * CISTA presuda nad vec izmjerenim cinjenicama. Ne dira OS ni git.
 * @param {{ main: boolean, bare: boolean, locked: boolean, prunable: boolean, current: boolean,
 *   originFresh: boolean, ancestor: boolean|null, unreachableCommits: number|null,
 *   status: { tracked: string[], untracked: string[], ignored: string[] }|null,
 *   mainNodeModulesLink: boolean, foreignLinks: string[]|null,
 *   lockHeld: boolean|null, lockAmbiguous: boolean, processPids: number[]|null, newestMtimeMs: number|null }} facts
 * @param {{ nowMs: number, minAgeMs?: number }} options
 * @returns {{ removable: boolean, reasons: string[] }}
 */
export function judgeWorktree(facts, { nowMs, minAgeMs = MIN_AGE_MS }) {
  if (facts.main) return { removable: false, reasons: ['glavno stablo'] };
  if (facts.bare) return { removable: false, reasons: ['bare repo'] };
  if (facts.prunable) return { removable: true, reasons: [] };
  const reasons = [];
  if (facts.originFresh !== true) reasons.push('origin nedostupan (fetch nije uspio)');
  if (facts.locked) reasons.push('zakljucan (git worktree lock)');
  if (facts.current) reasons.push('tekuce stablo ovog procesa');
  if (facts.ancestor !== true) reasons.push('HEAD nije spojen u bazu');
  if (facts.unreachableCommits === null || facts.unreachableCommits === undefined) reasons.push('reflog nije izmjeren');
  else if (facts.unreachableCommits > 0) reasons.push(`lokalni commiti samo u reflogu (${facts.unreachableCommits})`);
  if (!facts.status) {
    reasons.push('stanje stabla nije izmjereno');
  } else {
    const opts = { mainNodeModulesLink: facts.mainNodeModulesLink === true };
    if (facts.status.tracked.length > 0) reasons.push(`necommitane promjene (${facts.status.tracked.length})`);
    const untracked = facts.status.untracked.filter((p) => !isAllowedUntracked(p, opts));
    if (untracked.length > 0) reasons.push(listed('neprac. datoteke', untracked));
    const ignored = facts.status.ignored.filter((p) => !isAllowedIgnored(p, opts));
    if (ignored.length > 0) reasons.push(listed('ignorirane datoteke', ignored));
  }
  if (facts.foreignLinks === null || facts.foreignLinks === undefined) reasons.push('linkovi nisu izmjereni');
  else if (facts.foreignLinks.length > 0) reasons.push(listed('junction ili symlink u stablu', facts.foreignLinks));
  if (facts.lockAmbiguous === true) reasons.push('aktivan gate lock bez citljive putanje stabla');
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

/**
 * Broj commita iz HEAD refloga stabla koje nijedna grana, remote ni tag ne drzi. null kad se
 * reflog ne moze procitati (a postoji). Bez refloga: 0 (nema sto izgubiti osim HEAD-a, koji
 * provjerava `ancestor`).
 */
function countReflogOnlyCommits(wtPath, mainPath) {
  const gitdir = readGitdir(wtPath);
  if (!gitdir) return null;
  let raw;
  try {
    raw = readFileSync(join(gitdir, 'logs', 'HEAD'), 'utf8');
  } catch (error) {
    return error && error.code === 'ENOENT' ? 0 : null;
  }
  const shas = parseReflogShas(raw);
  let count = 0;
  for (let i = 0; i < shas.length; i += 200) {
    const chunk = shas.slice(i, i + 200);
    // Nepostojeci objekt (reflog nakon gc-a) ruši rev-list: to je pad mjerenja, ne "nula".
    const out = runGit(['rev-list', ...chunk, '--not', '--branches', '--remotes', '--tags'], mainPath).stdout;
    count += out.split('\n').filter(Boolean).length;
  }
  return count;
}

/**
 * Popis reparse pointa (junction ili symlink) u stablu, bez pracenja linkova. Jedini dopusten je
 * `node_modules` u korijenu koji pokazuje na `node_modules` glavnog repoa; on se vraca zasebno.
 * @returns {{ mainNodeModulesLink: boolean, foreignLinks: string[] }}
 */
function scanLinks(wtPath, mainPath) {
  const mainNm = normPath(join(mainPath, 'node_modules'));
  let mainNodeModulesLink = false;
  const foreignLinks = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const dir = rel ? join(wtPath, rel) : wtPath;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!rel && e.name === '.git') continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const st = lstatSync(join(dir, e.name));
      if (st.isSymbolicLink()) {
        let target = null;
        try {
          target = normPath(resolve(dir, readlinkSync(join(dir, e.name))));
        } catch {
          target = null;
        }
        if (childRel === 'node_modules' && target === mainNm) mainNodeModulesLink = true;
        else foreignLinks.push(childRel);
      } else if (st.isDirectory()) {
        stack.push(childRel);
      }
    }
  }
  return { mainNodeModulesLink, foreignLinks };
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
 * Stanje gate locka za cijelu presudu, istom funkcijom kao gate preflight (`lockStatus`).
 * @returns {{ unmeasurable: boolean, aliveWorktree: string|null, ambiguous: boolean }}
 */
function measureGateLock(env, nowMs) {
  const lockRaw = readLock(lockFilePath(env));
  if (lockRaw && lockRaw.unmeasurable) return { unmeasurable: true, aliveWorktree: null, ambiguous: false };
  if (!lockRaw) return { unmeasurable: false, aliveWorktree: null, ambiguous: false };
  const alive = lockStatus({ lock: lockRaw, lockAlive: isPidAlive(lockRaw.pid), nowMs }) === 'alive';
  if (!alive) return { unmeasurable: false, aliveWorktree: null, ambiguous: false };
  if (lockRaw.corrupt || !lockRaw.worktree) return { unmeasurable: false, aliveWorktree: null, ambiguous: true };
  return { unmeasurable: false, aliveWorktree: normPath(lockRaw.worktree), ambiguous: false };
}

/**
 * Pripremi zajednicki kontekst mjerenja: popis, fetch, baza. Baca GitError na neuspjelom git
 * pozivu osim fetcha, ciji pad je izricito stanje `originFresh: false`.
 */
function prepareContext({ repo, base, env, nowMs, cwd }) {
  const list = parseWorktreeList(runGit(['worktree', 'list', '--porcelain'], repo).stdout);
  if (list.length === 0) throw new GitError(['worktree', 'list'], repo, 'prazan popis');
  const mainPath = list[0].path;
  let originFresh = true;
  let fetchError = null;
  const m = base.match(/^origin\/(.+)$/);
  if (m) {
    try {
      runGit(['fetch', 'origin', m[1], '--quiet'], mainPath, [0], FETCH_TIMEOUT_MS);
    } catch (error) {
      originFresh = false;
      fetchError = error instanceof Error ? error.message : String(error);
    }
  }
  const baseSha = runGit(['rev-parse', '--verify', `${base}^{commit}`], mainPath).stdout.trim();

  // Snimak procesa se radi lijeno, najvise jednom, i samo kad neko stablo dodje do te provjere.
  let foreign;
  const foreignProcesses = () => {
    if (foreign !== undefined) return foreign;
    let processes;
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
  return { list, mainPath, baseSha, originFresh, fetchError, env, nowMs, cwdNorm: normPath(cwd), foreignProcesses };
}

/**
 * Mjeri i presudjuje jedno stablo. Dvije faze radi brzine: skeniranje ignoriranih stavki, linkova
 * i snimak procesa rade se samo za stablo koje je proslo jeftine provjere. Zadrzanom stablu
 * tablica zato navodi razloge iz prve faze, ne nuzno sve.
 */
function measureOne(ctx, wt, index, { sizes = 'all', nowMs = ctx.nowMs } = {}) {
  const main = index === 0;
  const branch = wt.branch ?? (wt.head ? `(detached ${wt.head.slice(0, 8)})` : '(nepoznato)');
  const row = { path: wt.path, branch, head: wt.head, sizeBytes: null, removable: false, reasons: [], prunable: wt.prunable };
  if (main || wt.bare || wt.prunable) {
    const verdict = judgeWorktree({ main, bare: wt.bare, prunable: wt.prunable }, { nowMs });
    return { ...row, removable: verdict.removable, reasons: wt.prunable ? ['mapa ne postoji (prune)'] : verdict.reasons, sizeBytes: 0 };
  }
  // Mapa nestala, a git je ne nudi za prune (npr. zakljucan): nema sto mjeriti ni ukloniti.
  if (!existsSync(wt.path)) return { ...row, reasons: ['mapa ne postoji, a git je ne nudi za prune'], sizeBytes: 0 };
  const wtNorm = normPath(wt.path);
  const ancestor = wt.head
    ? runGit(['merge-base', '--is-ancestor', wt.head, ctx.baseSha], ctx.mainPath, [0, 1]).code === 0
    : false;
  let status = parseStatusZ(runGit(['status', '--porcelain=v1', '-z', '--untracked-files=normal'], wt.path).stdout);
  const gateLock = measureGateLock(ctx.env, nowMs);
  const lockHeld = gateLock.unmeasurable ? null : gateLock.aliveWorktree === wtNorm;
  const current = ctx.cwdNorm === wtNorm || ctx.cwdNorm.startsWith(`${wtNorm}/`);
  // Linux: `node_modules` symlink git vidi kao neprac. datoteku; dopusten je samo ako je link na
  // glavni repo, sto se u prvoj fazi provjerava izravno (bez punog skeniranja).
  const nmPath = join(wt.path, 'node_modules');
  let mainNodeModulesLink = false;
  try {
    mainNodeModulesLink = lstatSync(nmPath).isSymbolicLink()
      && normPath(resolve(wt.path, readlinkSync(nmPath))) === normPath(join(ctx.mainPath, 'node_modules'));
  } catch {
    mainNodeModulesLink = false;
  }
  const facts = {
    main, bare: false, locked: wt.locked, prunable: false, current, originFresh: ctx.originFresh, ancestor,
    unreachableCommits: countReflogOnlyCommits(wt.path, ctx.mainPath),
    status, mainNodeModulesLink, foreignLinks: [], lockHeld, lockAmbiguous: gateLock.ambiguous,
    processPids: [], newestMtimeMs: newestActivityMs(wt.path),
  };
  let verdict = judgeWorktree(facts, { nowMs });
  if (verdict.removable) {
    status = parseStatusZ(
      runGit(['status', '--porcelain=v1', '-z', '--ignored=traditional', '--untracked-files=normal'], wt.path).stdout,
    );
    verdict = judgeWorktree({ ...facts, status }, { nowMs });
  }
  if (verdict.removable) {
    let links;
    try {
      links = scanLinks(wt.path, ctx.mainPath);
    } catch {
      links = { mainNodeModulesLink: false, foreignLinks: null };
    }
    const variants = [wt.path, wt.path.replace(/\//g, '\\')].map((v) => (process.platform === 'win32' ? v.toLowerCase() : v));
    const fp = ctx.foreignProcesses();
    const processPids = fp === null ? null : fp
      .filter((p) => {
        const cl = process.platform === 'win32' ? p.commandLine.toLowerCase() : p.commandLine;
        return variants.some((v) => cl.includes(v));
      })
      .map((p) => p.pid);
    verdict = judgeWorktree({ ...facts, status, ...links, processPids }, { nowMs });
  }
  const sizeBytes = sizes === 'all' || (sizes === 'removable' && verdict.removable) ? dirSizeBytes(wt.path) : null;
  return { ...row, removable: verdict.removable, reasons: verdict.reasons, sizeBytes, status, mainNodeModulesLink };
}

/**
 * Mjeri sve worktreeove. Baca GitError na bilo kojem neuspjelom git pozivu (osim fetcha).
 * @returns {{ ctx: object, mainPath: string, rows: object[] }}
 */
function measureWorktrees({ repo = REPO_ROOT, base = DEFAULT_BASE, env = process.env, nowMs = Date.now(), sizes = 'all', cwd = process.cwd() } = {}) {
  const ctx = prepareContext({ repo, base, env, nowMs, cwd });
  const rows = ctx.list.map((wt, index) => measureOne(ctx, wt, index, { sizes }));
  return { ctx, mainPath: ctx.mainPath, rows };
}

/** Lock datoteka medjuprocesnog GC locka (odvojen od gate locka: GC mora raditi i na punom disku). */
function gcLockPath(env = process.env) {
  if (env.LEKTA_WORKTREE_GC_LOCK_PATH) return env.LEKTA_WORKTREE_GC_LOCK_PATH;
  if (process.platform === 'win32' && env.LOCALAPPDATA) return join(env.LOCALAPPDATA, 'Temp', 'lekta-worktree-gc.lock');
  return join(os.tmpdir(), 'lekta-worktree-gc.lock');
}

/**
 * Uzima GC lock (`wx`, isti zapis kao gate lock). Mrtav ili zastario lock (presuda `lockStatus`)
 * se preuzima jednom. @returns {{ token: string }|{ busy: string }}
 */
function acquireGcLock(path, mainPath, nowMs) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = randomUUID();
    const record = { pid: process.pid, startedAt: new Date(nowMs).toISOString(), worktree: mainPath, label: 'worktree-gc', token };
    if (writeLock(path, record)) return { token };
    const existing = readLock(path);
    if (!existing) continue;
    if (existing.unmeasurable) return { busy: 'GC lock se ne moze procitati' };
    const status = lockStatus({ lock: existing, lockAlive: isPidAlive(existing.pid), nowMs });
    if (status === 'alive') return { busy: `drugi worktree-gc radi (PID ${existing.pid ?? 'nepoznat'})` };
    try {
      unlinkSync(path);
    } catch {
      // netko ga je vec maknuo
    }
  }
  return { busy: 'GC lock nije uzet' };
}

/** Uklanja SAMO link (junction ili symlink); cilj ostaje. Baca ako cilj nakon toga nestane. */
function removeLinkOnly(linkPath) {
  const target = resolve(dirname(linkPath), readlinkSync(linkPath));
  try {
    unlinkSync(linkPath);
  } catch {
    rmdirSync(linkPath);
  }
  if (existsSync(linkPath)) throw new Error(`link ${linkPath} nije uklonjen`);
  if (!existsSync(target)) throw new Error(`cilj linka ${target} je nestao nakon uklanjanja linka`);
  return target;
}

/** Mapa u koju se odlazu dopustene neprac. datoteke (nikad se ne brisu rucno). */
function stashDir(env) {
  return env.LEKTA_WORKTREE_GC_STASH || join(os.tmpdir(), 'lekta-worktree-gc-odlozeno');
}

/**
 * Uklanja jedan stablo koje je upravo ponovno izmjereno kao uklonjivo. Baca na bilo kojem
 * neuspjehu, nakon pokusaja da vrati odvojeni link i odlozene datoteke.
 */
function removeWorktree(mainPath, row, env) {
  if (!existsSync(row.path)) return 'nestao';
  const undo = [];
  try {
    if (row.mainNodeModulesLink) {
      const linkPath = join(row.path, 'node_modules');
      const target = removeLinkOnly(linkPath);
      undo.push(() => symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir'));
    }
    const stashRoot = join(stashDir(env), `${basename(row.path)}-${Date.now()}`);
    for (const rel of row.status?.untracked ?? []) {
      if (isRootNodeModules(rel) || !isAllowedUntracked(rel)) continue;
      mkdirSync(stashRoot, { recursive: true });
      const from = join(row.path, rel);
      const to = join(stashRoot, rel);
      renameSync(from, to);
      undo.push(() => renameSync(to, from));
    }
    runGit(['worktree', 'remove', row.path], mainPath);
  } catch (error) {
    for (const step of undo.reverse()) {
      try {
        step();
      } catch {
        // vracanje je najbolji pokusaj; izvorna greska ide dalje
      }
    }
    throw error;
  }
  const still = parseWorktreeList(runGit(['worktree', 'list', '--porcelain'], mainPath).stdout)
    .some((w) => normPath(w.path) === normPath(row.path));
  if (still || existsSync(row.path)) {
    throw new Error(`nakon git worktree remove stablo jos postoji (${still ? 'u popisu' : 'na disku'})`);
  }
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
  const { ctx, mainPath, rows } = measured;
  const others = rows.filter((r) => normPath(r.path) !== normPath(mainPath));
  const removable = others.filter((r) => r.removable);
  const removableBytes = removable.reduce((s, r) => s + (r.sizeBytes ?? 0), 0);
  const originNote = ctx.originFresh ? '' : '; origin nedostupan, nista se ne uklanja';
  if (!ctx.originFresh) err(`worktree-gc: ${ctx.fetchError}`);

  if (args.json) {
    log(JSON.stringify({ removable: removable.length, removableMb: toMb(removableBytes), kept: others.length - removable.length, originFresh: ctx.originFresh }));
    return 0;
  }
  if (!args.quiet) {
    for (const line of formatTable(rows)) log(line);
    log(`ukupno uklonjivo: ${removable.length} stabala, ${toMb(removableBytes)} MB${originNote}`);
  }
  if (!args.apply) return 0;

  const lockPath = gcLockPath(env);
  const gcLock = acquireGcLock(lockPath, mainPath, Date.now());
  if ('busy' in gcLock) {
    log(`worktree-gc: preskoceno (${gcLock.busy}), uklonjeno 0, zadrzano ${others.length}`);
    return 0;
  }
  let removedCount = 0;
  let removedBytes = 0;
  let failed = 0;
  try {
    for (const row of removable) {
      if (row.prunable) continue;
      // Neposredno prije uklanjanja: svjeze stanje popisa i SVE provjere ponovno, pod GC lockom.
      let fresh;
      try {
        const list = parseWorktreeList(runGit(['worktree', 'list', '--porcelain'], mainPath).stdout);
        const index = list.findIndex((w) => normPath(w.path) === normPath(row.path));
        if (index < 0) continue;
        fresh = measureOne(ctx, list[index], index, { sizes: 'none', nowMs: Date.now() });
      } catch (error) {
        failed += 1;
        err(`worktree-gc: ponovno mjerenje ${row.path} nije uspjelo: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (!fresh.removable) {
        if (!args.quiet) log(`zadrzan pri ponovnoj provjeri: ${row.path}: ${fresh.reasons.join('; ')}`);
        continue;
      }
      try {
        const result = removeWorktree(mainPath, fresh, env);
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
  } finally {
    releaseLock(lockPath, { token: gcLock.token });
  }
  const kept = others.length - removedCount;
  log(`worktree-gc: uklonjeno ${removedCount} (${toMb(removedBytes)} MB), zadrzano ${kept}${originNote}${failed ? `, PAD ${failed}` : ''}`);
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
