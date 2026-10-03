#!/usr/bin/env node
/**
 * ENV-DOCTOR: raskorak okoline prije nego sto lazno obori gate (odluka vlasnika 2026-10-03).
 *
 *   node scripts/env-doctor.mjs [--strict]
 *
 * Povod: 3. 10. 2026. `node_modules/vitest` je bio 2.1.9, a package.json trazi ^4.1.11; gate je
 * davao lazne padove koji su izgledali kao kvar koda. Ovaj alat samo cita datoteke (i najvise jedan
 * `codex --version` s timeoutom 3 s), nikad ne pokrece npm i nikad nista ne mijenja.
 *
 * Ispis: jedan redak po provjeri, zatim zavrsni redak `env-doctor: OK` ili
 * `env-doctor: N raskoraka`. Izlazni kod je uvijek 0, osim uz `--strict` (tada 1 kad ima raskoraka).
 *
 * Statusi provjere: `ok`, `raskorak` (broji se), `info` (samo obavijest, ne broji se),
 * `nepoznato` (nije se moglo izmjeriti; fail-open, ne broji se kao raskorak).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CODEX_MIN_FALLBACK = '0.160.0';

/** @returns {[number, number, number] | null} */
export function parseVersion(text) {
  if (typeof text !== 'string') return null;
  const m = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(text.trim().replace(/^v/, ''));
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

export function compareVersions(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/** Jedan komparator semvera (^, ~, >=, >, <=, <, =, x.y.z, djelomicno `20`). null = ne razumije. */
function satisfiesComparator(version, comparator) {
  const m = /^(\^|~|>=|<=|>|<|=)?\s*v?(\d+(?:\.(?:\d+|x|\*))?(?:\.(?:\d+|x|\*))?)$/.exec(comparator.trim());
  if (!m) return null;
  const op = m[1] ?? '';
  const parts = m[2].split('.');
  const given = parts.filter((p) => /^\d+$/.test(p)).length;
  const base = parseVersion(parts.map((p) => (/^\d+$/.test(p) ? p : '0')).join('.'));
  if (!base) return null;
  const cmp = compareVersions(version, base);
  switch (op) {
    case '>=': return cmp >= 0;
    case '>': return cmp > 0;
    case '<=': return cmp <= 0;
    case '<': return cmp < 0;
    case '^': {
      if (cmp < 0) return false;
      if (base[0] > 0 || given < 2) return version[0] === base[0];
      if (base[1] > 0 || given < 3) return version[0] === 0 && version[1] === base[1];
      return compareVersions(version, base) === 0;
    }
    case '~':
      if (cmp < 0) return false;
      return given < 2 ? version[0] === base[0] : version[0] === base[0] && version[1] === base[1];
    default:
      // Gola ili `=` verzija; djelomicna (`20`, `20.1`) znaci isti major/minor.
      if (given === 1) return version[0] === base[0];
      if (given === 2) return version[0] === base[0] && version[1] === base[1];
      return cmp === 0;
  }
}

/** Zadovoljava li verzija raspon (`a b` = i, `||` = ili). null kad raspon nije razumljiv. */
export function satisfiesRange(versionText, range) {
  const version = parseVersion(versionText);
  if (!version || typeof range !== 'string' || !range.trim()) return null;
  let anyKnown = false;
  for (const alternative of range.split('||')) {
    const comparators = alternative.trim().split(/\s+/).filter(Boolean);
    if (comparators.length === 0) continue;
    let all = true;
    let known = true;
    for (const c of comparators) {
      const r = satisfiesComparator(version, c);
      if (r === null) known = false;
      else if (!r) all = false;
    }
    if (!known) continue;
    anyKnown = true;
    if (all) return true;
  }
  return anyKnown ? false : null;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** (a) Node naspram .nvmrc ili package.json engines. */
export function checkNode({ root, nodeVersion }) {
  const nvmrc = readText(join(root, '.nvmrc'))?.trim();
  const engines = readJson(join(root, 'package.json'))?.engines?.node;
  const wanted = nvmrc || engines;
  const source = nvmrc ? '.nvmrc' : 'package.json engines';
  if (!wanted) return { id: 'node', status: 'info', message: `node ${nodeVersion}: nema .nvmrc ni engines.node` };
  const ok = satisfiesRange(nodeVersion, wanted);
  if (ok === null) return { id: 'node', status: 'nepoznato', message: `node ${nodeVersion}: raspon "${wanted}" (${source}) nije razumljiv` };
  return ok
    ? { id: 'node', status: 'ok', message: `node ${nodeVersion} zadovoljava "${wanted}" (${source})` }
    : { id: 'node', status: 'raskorak', message: `node ${nodeVersion} NE zadovoljava "${wanted}" (${source})` };
}

/** (b) Instalirani vitest naspram raspona u package.json. */
export function checkVitest({ root }) {
  const pkg = readJson(join(root, 'package.json'));
  const range = pkg?.devDependencies?.vitest ?? pkg?.dependencies?.vitest;
  if (!range) return { id: 'vitest', status: 'info', message: 'vitest: nije u package.json' };
  const installed = readJson(join(root, 'node_modules', 'vitest', 'package.json'))?.version;
  if (!installed) return { id: 'vitest', status: 'raskorak', message: `vitest: nije instaliran, package.json trazi "${range}"; npm ci potreban` };
  const ok = satisfiesRange(installed, range);
  if (ok === null) return { id: 'vitest', status: 'nepoznato', message: `vitest ${installed}: raspon "${range}" nije razumljiv` };
  return ok
    ? { id: 'vitest', status: 'ok', message: `vitest ${installed} zadovoljava "${range}"` }
    : { id: 'vitest', status: 'raskorak', message: `vitest ${installed} NE zadovoljava "${range}"; npm ci potreban` };
}

/**
 * (c) package-lock.json naspram instaliranog stanja (`node_modules/.package-lock.json`, skriveni
 * lockfile koji npm pise pri instalaciji). Broji pakete s razlicitom verzijom i one koji u
 * instalaciji nedostaju (osim opcionalnih, koji se na drugoj platformi legitimno ne instaliraju).
 */
export function checkLockfile({ root }) {
  const lock = readJson(join(root, 'package-lock.json'));
  if (!lock?.packages) return { id: 'lockfile', status: 'info', message: 'lockfile: nema package-lock.json s "packages"' };
  const hidden = readJson(join(root, 'node_modules', '.package-lock.json'));
  if (!hidden?.packages) {
    return { id: 'lockfile', status: 'raskorak', message: 'lockfile: nema node_modules/.package-lock.json; npm ci potreban' };
  }
  let differ = 0;
  let missing = 0;
  const examples = [];
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (!key.startsWith('node_modules/') || !entry || typeof entry !== 'object') continue;
    const installed = hidden.packages[key];
    if (!installed) {
      if (entry.optional || entry.devOptional || entry.peer) continue;
      missing += 1;
      if (examples.length < 3) examples.push(`${key.slice('node_modules/'.length)} nedostaje`);
      continue;
    }
    if (entry.version && installed.version && entry.version !== installed.version) {
      differ += 1;
      if (examples.length < 3) examples.push(`${key.slice('node_modules/'.length)} ${installed.version} umjesto ${entry.version}`);
    }
  }
  if (differ === 0 && missing === 0) return { id: 'lockfile', status: 'ok', message: 'lockfile: instalacija odgovara package-lock.json' };
  return {
    id: 'lockfile',
    status: 'raskorak',
    message: `lockfile: ${differ} razlicitih verzija, ${missing} nedostaje (${examples.join('; ')}); npm ci potreban`,
  };
}

/** Minimum iz codex-review skilla ("mora ispisati 0.160.0 ili vise"); zamjena kad se ne da procitati. */
export function codexMinimum(root) {
  const text = readText(join(root, '.claude', 'skills', 'codex-review', 'SKILL.md'));
  const m = text ? /(\d+\.\d+\.\d+) ili vise/.exec(text) : null;
  return m ? m[1] : CODEX_MIN_FALLBACK;
}

/**
 * Verzija Codex CLI-ja. Brzi put: npm globalna instalacija uz shim u PATH-u
 * (`<dir>/node_modules/@openai/codex/package.json`), jer sam `codex --version` na Windowsu traje
 * oko 2 s. Inace jedan `codex --version` s timeoutom 3 s.
 * @returns {{ installed: boolean, version: string | null }}
 */
export function detectCodexVersion(env = process.env) {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  let found = false;
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) {
    if (!exts.some((ext) => existsSync(join(dir, `codex${ext}`)))) continue;
    found = true;
    const version = readJson(join(dir, 'node_modules', '@openai', 'codex', 'package.json'))?.version;
    if (typeof version === 'string') return { installed: true, version };
    break;
  }
  if (!found) return { installed: false, version: null };
  const res = spawnSync('codex', ['--version'], { encoding: 'utf8', timeout: 3000, shell: process.platform === 'win32', windowsHide: true });
  const text = `${res.stdout ?? ''}`;
  const m = /(\d+\.\d+\.\d+)/.exec(text);
  return { installed: true, version: res.status === 0 && m ? m[1] : null };
}

/** (d) Codex CLI naspram minimuma. Neinstaliran Codex nije raskorak. */
export function checkCodex({ root, codex }) {
  const minimum = codexMinimum(root);
  if (!codex.installed) return { id: 'codex', status: 'info', message: 'codex: nije instaliran' };
  if (!codex.version) return { id: 'codex', status: 'nepoznato', message: `codex: verzija se nije mogla procitati (minimum ${minimum})` };
  const v = parseVersion(codex.version);
  const min = parseVersion(minimum);
  if (!v || !min) return { id: 'codex', status: 'nepoznato', message: `codex ${codex.version}: usporedba s ${minimum} nije moguca` };
  return compareVersions(v, min) >= 0
    ? { id: 'codex', status: 'ok', message: `codex ${codex.version} >= ${minimum}` }
    : { id: 'codex', status: 'raskorak', message: `codex ${codex.version} ispod minimuma ${minimum} (codex-review skill)` };
}

function defaultGit(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, windowsHide: true }).trim();
  } catch {
    return null;
  }
}

/**
 * (e) HEAD dijeljenog stabla naspram lokalnog origin/master, bez fetcha. Pseudo-ref
 * `main-worktree/HEAD` daje HEAD glavnog stabla iz bilo kojeg worktreea, pa su dovoljna dva poziva
 * gita (svaki na opterecenom Windowsu traje oko 0,4 s, a bootstrap mora ostati ispod 2 s).
 * `--left-right --count A...B` daje "ispred iza"; HEAD je predak origin/master kad nije ispred.
 */
export function checkSharedTree({ root, git = defaultGit }) {
  const head = git(['rev-parse', '--short', 'main-worktree/HEAD'], root);
  const counts = git(['rev-list', '--left-right', '--count', 'main-worktree/HEAD...origin/master'], root);
  const m = counts === null ? null : /^(\d+)\s+(\d+)$/.exec(counts.trim());
  if (!head || !m) {
    return { id: 'dijeljeno-stablo', status: 'nepoznato', message: 'dijeljeno stablo: HEAD ili origin/master se ne mogu procitati' };
  }
  const isAncestor = Number(m[1]) === 0;
  const behind = Number(m[2]);
  const note = 'prema lokalnom origin/master, bez fetcha';
  if (!isAncestor) {
    return { id: 'dijeljeno-stablo', status: 'raskorak', message: `dijeljeno stablo ${head}: HEAD nije predak origin/master (${note})` };
  }
  return { id: 'dijeljeno-stablo', status: 'info', message: `dijeljeno stablo ${head}: ${behind} commita iza origin/master (${note})` };
}

/** (f) CRLF: core.autocrlf i eol pravilo u .gitattributes. Samo informacija. */
export function checkCrlf({ root, git = defaultGit }) {
  const autocrlf = git(['config', 'core.autocrlf'], root) ?? 'nije postavljen';
  const attrs = readText(join(root, '.gitattributes'));
  const eolRules = attrs ? attrs.split(/\r?\n/).filter((l) => !l.trim().startsWith('#') && /\beol=/.test(l)).length : 0;
  return { id: 'crlf', status: 'info', message: `crlf: core.autocrlf=${autocrlf}, .gitattributes eol pravila: ${eolRules}` };
}

export const DEFAULT_CHECKS = Object.freeze([
  (ctx) => checkNode(ctx),
  (ctx) => checkVitest(ctx),
  (ctx) => checkLockfile(ctx),
  (ctx) => checkCodex({ root: ctx.root, codex: ctx.codex() }),
  (ctx) => checkSharedTree(ctx),
  (ctx) => checkCrlf(ctx),
]);

/**
 * Pokrece sve provjere. Svaka je fail-open: iznimka postaje redak `nepoznato`.
 * @returns {{ results: { id: string, status: string, message: string }[], mismatches: number }}
 */
export function runDoctor({
  root = REPO_ROOT,
  nodeVersion = process.versions.node,
  codex = () => detectCodexVersion(),
  git = defaultGit,
  checks = DEFAULT_CHECKS,
} = {}) {
  const ctx = { root, nodeVersion, codex, git };
  const results = checks.map((check, index) => {
    try {
      return check(ctx);
    } catch (error) {
      return { id: `provjera-${index}`, status: 'nepoznato', message: `provjera pala: ${error instanceof Error ? error.message : String(error)}` };
    }
  });
  return { results, mismatches: results.filter((r) => r.status === 'raskorak').length };
}

export function summaryLine({ mismatches }) {
  return mismatches === 0 ? 'env-doctor: OK' : `env-doctor: ${mismatches} raskoraka`;
}

export function formatDoctor(report) {
  const lines = report.results.map((r) => `  [${r.status}] ${r.message}`);
  return [...lines, summaryLine(report)];
}

const isDirectRun = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('scripts/env-doctor.mjs');
if (isDirectRun) {
  const report = runDoctor();
  for (const line of formatDoctor(report)) console.log(line);
  process.exitCode = process.argv.includes('--strict') && report.mismatches > 0 ? 1 : 0;
}
