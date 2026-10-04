#!/usr/bin/env node
/**
 * GATE PREFLIGHT: deterministicka brava umjesto dogovora medju sesijama (T62, vlasnik 2026-09-26).
 *
 * Problem koji rjesava: stroj je i3 s 2 jezgre i 8 GB RAM-a, a na njemu istodobno radi vise
 * Claude/Codex sesija. Dva `npm run check` ili `test:ux` u isto vrijeme ne padnu cisto nego
 * mlate memoriju, pa padaju testovi koji izolirano prolaze (OOM, `spawn UNKNOWN`, istek
 * webServera). Dogovor "pricekaj da drugi zavrsi" nije dokaz; ova skripta jest.
 *
 * Pravila (odbija s izlaznim kodom 2 i hrvatskom porukom):
 *  - tudji lock je ziv (PID vlasnika postoji; kad se PID ne moze provjeriti, lock je ziv samo
 *    ako je mladji od 3 h);
 *  - postoji ijedan tudji vitest/playwright proces (izvan vlastitog stabla procesa);
 *  - slobodni RAM < 1,5 GB ili slobodni disk < 3 GB.
 * Nemjerljivo stanje (null) je UPOZORENJE, nikad blokada (fail-open). Nadjacavanje je SAMO
 * `LEKTA_GATE_FORCE=1`: ispisuje NADJACANO i svejedno upisuje lock. Na CI-ju (`CI` postavljen)
 * preflight samo ispisuje mjerenja i propusta, bez locka.
 *
 * Uporaba:
 *   node scripts/gate-preflight.mjs --check-only        # samo stanje; exit 0 slobodno, 2 zauzeto
 *   node scripts/gate-preflight.mjs --label check       # zauzmi (PID roditelja = npm ljuska)
 *   node scripts/gate-preflight.mjs --release           # otpusti lock koji drzi isti roditelj
 * Za npm skripte je sigurniji omotac `scripts/with-gate-lock.mjs`, koji lock otpusta i pri padu.
 *
 * `judgeGate` je cista funkcija: prima vec izmjereno stanje, ne dira OS, pa je test deterministican.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync, statfsSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GB = 1024 ** 3;

export const THRESHOLDS = Object.freeze({
  minFreeMemBytes: 1.5 * GB,
  minFreeDiskBytes: 3 * GB,
  // Lock ciji se PID ne moze provjeriti smatra se zivim samo dok je mladji od ovoga.
  unverifiableLockMaxAgeMs: 3 * 60 * 60 * 1000,
  // Vise interaktivnih sesija od ovoga je upozorenje (RAM), ne blokada.
  maxClaudeSessions: 3,
  // Lock mladji od ovoga se nikad ne brise pri preuzimanju, cak ni kad je proglasen mrtvim ili
  // zastarjelim: sprjecava rusenje tudjeg locka koji je upravo napisan (uska utrka dvije sesije).
  minTakeoverAgeMs: 5_000,
});

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Slab stroj (pravilo vlasnika 2026-09-28, docs/agents/ROUTING.md "Teski poslovi na laptopu"):
 * najvise 4 logicke jezgre ili manje od 12 GB RAM-a. Na takvom stroju gate pokrece Vitest s
 * jednim radnikom (`vitest.config.ts` cita `VITEST_MAX_THREADS`).
 */
const WEAK_MACHINE = Object.freeze({ maxCpus: 4, minTotalMemBytes: 12 * GB });

/** Logicke jezgre i ukupni RAM; nemjerljivo je `null` (fail-open: ne proglasava stroj slabim). */
export function measureMachine() {
  let cpus = null;
  let totalMemBytes = null;
  try {
    const n = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
    cpus = Number.isFinite(n) && n > 0 ? n : null;
  } catch { /* nemjerljivo */ }
  try {
    const m = os.totalmem();
    totalMemBytes = Number.isFinite(m) && m > 0 ? m : null;
  } catch { /* nemjerljivo */ }
  return { cpus, totalMemBytes };
}

/**
 * Env koji gate dodaje djetetu na slabom stroju, ili `null`. Postojeci `VITEST_MAX_THREADS` se
 * nikad ne dira; na CI-ju se nista ne dodaje (CI runner mjeri svoje, a pravilo je za laptop).
 */
export function weakMachineWorkerEnv({ cpus, totalMemBytes, env = process.env } = {}) {
  if (isCiEnv(env)) return null;
  if (env.VITEST_MAX_THREADS !== undefined && env.VITEST_MAX_THREADS !== '') return null;
  const fewCpus = Number.isFinite(cpus) && cpus > 0 && cpus <= WEAK_MACHINE.maxCpus;
  const lowMem = Number.isFinite(totalMemBytes) && totalMemBytes > 0 && totalMemBytes < WEAK_MACHINE.minTotalMemBytes;
  return fewCpus || lowMem ? { VITEST_MAX_THREADS: '1' } : null;
}

/** Je li env oznacen kao CI. `CI=false` i `CI=0` (neki alati ih tako postave) nisu CI. */
export function isCiEnv(env = process.env) {
  const v = env.CI;
  return v !== undefined && v !== '' && v !== 'false' && v !== '0';
}

/**
 * Staza locka. Na Windowsu se namjerno ne oslanja na `os.tmpdir()`: sesija s preusmjerenim
 * `TEMP` (sandbox, drugi alat) inace bi gledala DRUGU datoteku i lock ne bi nista stitio.
 * `%LOCALAPPDATA%\Temp` je isti za sve procese istog korisnika. `LEKTA_GATE_LOCK_PATH` postoji
 * da testovi nikad ne diraju pravi lock.
 */
export function lockFilePath(env = process.env) {
  if (env.LEKTA_GATE_LOCK_PATH) return env.LEKTA_GATE_LOCK_PATH;
  if (process.platform === 'win32' && env.LOCALAPPDATA) return join(env.LOCALAPPDATA, 'Temp', 'lekta-gate.lock');
  return join(os.tmpdir(), 'lekta-gate.lock');
}

/**
 * Cita lock. Vraca null kad datoteke nema. Nerazumljiv sadrzaj NIJE "nema locka": vraca se kao
 * lock bez PID-a, star koliko i datoteka, pa ga vrijedi pravilo od 3 h.
 *
 * Greska pri citanju koja NIJE "nema datoteke" (EPERM, EBUSY, EACCES i slicno, npr. antivirus ili
 * drugi proces drzi datoteku otvorenu) ne smije srusiti gate: vraca se `{ unmeasurable: true }`, a
 * `judgeGate` to tretira kao UPOZORENJE (fail-open), ne kao blokadu ni kao "nema locka".
 */
export function readLock(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    return { unmeasurable: true, error: error && error.code ? error.code : 'UNKNOWN' };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        pid: Number.isInteger(parsed.pid) ? parsed.pid : null,
        startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : null,
        worktree: typeof parsed.worktree === 'string' ? parsed.worktree : null,
        label: typeof parsed.label === 'string' ? parsed.label : null,
        token: typeof parsed.token === 'string' ? parsed.token : null,
        corrupt: false,
      };
    }
  } catch {
    // pada na nize
  }
  let startedAt = null;
  try {
    startedAt = statSync(path).mtime.toISOString();
  } catch {
    startedAt = null;
  }
  return { pid: null, startedAt, worktree: null, label: null, token: null, corrupt: true };
}

/**
 * Postoji li proces s tim PID-om. `process.kill(pid, 0)` ne salje signal nego samo provjerava
 * (na Windowsu libuv otvara proces i cita izlazni kod). ESRCH = nema ga, EPERM = postoji ali
 * nije nas. Sve ostalo je null: nije izmjereno, pa vrijedi pravilo od 3 h.
 * @returns {boolean|null}
 */
export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && error.code === 'ESRCH') return false;
    if (error && error.code === 'EPERM') return true;
    return null;
  }
}

/**
 * Parsira JSON snimak procesa iz PowerShella (`ConvertTo-Json`, jedan objekt ili niz).
 * @returns {{pid:number, ppid:number, name:string, commandLine:string|null}[]|null}
 */
export function parseProcessJson(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return null;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const out = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const pid = Number(p.pid);
    if (!Number.isInteger(pid)) continue;
    out.push({
      pid,
      ppid: Number.isInteger(Number(p.ppid)) ? Number(p.ppid) : 0,
      name: typeof p.name === 'string' ? p.name : '',
      commandLine: typeof p.cmd === 'string' ? p.cmd : null,
    });
  }
  return out.length ? out : null;
}

/**
 * Parsira `wmic process get CommandLine,Name,ParentProcessId,ProcessId /format:csv`. Stupci su
 * abecedni (Node, CommandLine, Name, ParentProcessId, ProcessId); naredbeni redak smije sadrzavati
 * zarez, pa se zadnja tri polja citaju s desna, a sve izmedju je naredbeni redak.
 */
export function parseWmicCsv(text) {
  if (typeof text !== 'string') return null;
  const out = [];
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 5) continue;
    const pid = Number(parts[parts.length - 1]);
    const ppid = Number(parts[parts.length - 2]);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue; // zaglavlje
    const name = parts[parts.length - 3];
    const commandLine = parts.slice(1, parts.length - 3).join(',');
    out.push({ pid, ppid, name, commandLine: commandLine || null });
  }
  return out.length ? out : null;
}

/** Parsira `ps -eo pid=,ppid=,args=` (Linux/macOS). */
export function parsePsOutput(text) {
  if (typeof text !== 'string') return null;
  const out = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(rawLine);
    if (!m) continue;
    const args = m[3].trim();
    const first = args.split(/\s+/)[0] ?? '';
    out.push({ pid: Number(m[1]), ppid: Number(m[2]), name: first.split(/[\\/]/).pop() ?? '', commandLine: args || null });
  }
  return out.length ? out : null;
}

function runCapture(command, args) {
  try {
    const buf = execFileSync(command, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    });
    // wmic zna pisati UTF-16LE kad mu je izlaz preusmjeren.
    const looksUtf16 = buf.length > 3 && buf[1] === 0 && buf[3] === 0;
    return looksUtf16 ? buf.toString('utf16le') : buf.toString('utf8');
  } catch {
    return null;
  }
}

const PS_SNAPSHOT = [
  'Get-CimInstance Win32_Process | ForEach-Object {',
  '[pscustomobject]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = [string]$_.Name;',
  "cmd = $(if (@('node.exe','claude.exe') -contains $_.Name) { [string]$_.CommandLine } else { $null }) } }",
  '| ConvertTo-Json -Compress',
].join(' ');

/**
 * Snimak svih procesa (PID, roditelj, ime, naredbeni redak za node/claude). Isti mehanizam koristi
 * i `scripts/agents/session-bootstrap.mjs`. Vraca null kad se ne moze izmjeriti (fail-open), nikad
 * prazan popis koji bi izgledao kao "nista ne radi".
 */
export function listProcesses() {
  if (process.platform === 'win32') {
    const ps = parseProcessJson(runCapture('powershell', ['-NoProfile', '-NonInteractive', '-Command', PS_SNAPSHOT]));
    if (ps) return ps;
    return parseWmicCsv(runCapture('wmic', ['process', 'get', 'CommandLine,Name,ParentProcessId,ProcessId', '/format:csv']));
  }
  return parsePsOutput(runCapture('ps', ['-eo', 'pid=,ppid=,args=']));
}

/**
 * Rastavlja naredbeni redak na argumente (navodnici drze razmake zajedno). Dovoljno za ono sto
 * Windows i `ps` vracaju za node procese; ne pokusava rekonstruirati svako pravilo `cmd.exe`.
 */
export function splitCommandLine(commandLine) {
  const tokens = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(commandLine)) !== null) tokens.push(m[1] ?? m[2]);
  return tokens;
}

// Node opcije koje uzimaju vrijednost kao zaseban argument (`--conditions development`).
const NODE_OPTIONS_WITH_VALUE = new Set(['--conditions', '-C', '-r', '--require', '--import', '--loader', '--experimental-loader', '--input-type']);

/** Prvi argument koji nije opcija, pocevsi od indeksa `from`; preskace vrijednosti poznatih opcija. */
function firstPositional(tokens, from) {
  for (let i = from; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (NODE_OPTIONS_WITH_VALUE.has(t)) {
      i += 1;
      continue;
    }
    if (!t.startsWith('-')) return i;
  }
  return -1;
}

const RUNNER_SEGMENT = /^(vitest|@playwright|playwright|playwright-core)(\.(mjs|cjs|js|cmd))?$/i;
const pathSegments = (p) => p.split(/[\\/]+/).filter(Boolean);

/**
 * Je li naredbeni redak vitest ili playwright pokretac. Gleda se SAMO ono sto node izvrsava: staza
 * skripte (segment `vitest`, `@playwright`, `playwright`, `vitest.mjs`), a za `npx`/`npm exec`
 * paket koji se pokrece. Tekst u ostalim argumentima se ne gleda: izmjereno 2026-09-26, Codex
 * (`codex.js exec ... "<zadatak>"`) nosi cijeli zadatak u argv, s rijecima "vitest run", pa bi
 * podudaranje po cijelom retku lazno zakljucalo gate dok god Codex radi.
 *
 * IZUZETAK: `playwright ... test-server` je mirujuci posluzitelj VS Code prosirenja. Ne vrti
 * testove dok ga netko ne pokrene, a zivi koliko i editor, pa bi trajno zakljucao gate. Kad
 * stvarno vrti testove, njegovi radnici (node procesi iz playwright paketa) su vidljivi i broje se.
 */
export function isTestRunnerCommand(commandLine) {
  if (typeof commandLine !== 'string' || !commandLine.trim()) return false;
  const tokens = splitCommandLine(commandLine);
  const scriptIdx = firstPositional(tokens, 1);
  if (scriptIdx < 0) return false;
  const script = tokens[scriptIdx];
  const base = pathSegments(script).pop() ?? '';

  let runnerIdx = -1;
  if (/^(npx-cli\.js|npx(\.cmd)?)$/i.test(base)) {
    runnerIdx = firstPositional(tokens, scriptIdx + 1);
  } else if (/^(npm-cli\.js|npm(\.cmd)?)$/i.test(base)) {
    const sub = firstPositional(tokens, scriptIdx + 1);
    if (sub >= 0 && /^(exec|x)$/i.test(tokens[sub])) runnerIdx = firstPositional(tokens, sub + 1);
  }

  let isRunner;
  if (runnerIdx >= 0) {
    isRunner = RUNNER_SEGMENT.test(pathSegments(tokens[runnerIdx])[0] ?? '');
  } else {
    isRunner = pathSegments(script).some((seg) => RUNNER_SEGMENT.test(seg));
  }
  if (!isRunner) return false;
  return !tokens.slice(scriptIdx + 1).some((t) => t.toLowerCase() === 'test-server');
}

/**
 * Vlastito stablo procesa: preci (lanac roditelja) i potomci zadanog PID-a. Poznato ogranicenje:
 * Windows ponovno koristi PID-ove, pa roditelj koji je umro i ciji je PID preuzeo drugi proces moze
 * lanac odvesti u tudji proces. Posljedica je propustanje (fail-open), nikad lazna blokada.
 */
export function ownProcessTree(processes, selfPid) {
  const own = new Set([selfPid]);
  const byPid = new Map(processes.map((p) => [p.pid, p]));
  let cursor = byPid.get(selfPid);
  while (cursor && cursor.ppid && !own.has(cursor.ppid)) {
    own.add(cursor.ppid);
    cursor = byPid.get(cursor.ppid);
  }
  const queue = [selfPid];
  while (queue.length) {
    const parent = queue.shift();
    for (const p of processes) {
      if (p.ppid === parent && p.pid !== parent && !own.has(p.pid)) {
        own.add(p.pid);
        queue.push(p.pid);
      }
    }
  }
  return own;
}

/**
 * Samo node procesi mogu biti pokretaci. `claude.exe` i drugi alati znaju nositi tekst zadatka u
 * argumentima (i rijec "vitest" u njemu), pa bi ih podudaranje po tekstu lazno brojalo.
 */
export function isNodeProcess(p) {
  return /^node(\.exe)?$/i.test(p.name ?? '');
}

/** Tudji vitest/playwright procesi: node pokretaci izvan vlastitog stabla. null ostaje null. */
export function foreignTestProcesses(processes, selfPid) {
  if (!Array.isArray(processes)) return null;
  const own = ownProcessTree(processes, selfPid);
  return processes
    .filter((p) => !own.has(p.pid) && isNodeProcess(p) && isTestRunnerCommand(p.commandLine))
    .map((p) => ({ pid: p.pid, commandLine: p.commandLine }));
}

/** Broj `claude.exe` procesa (interaktivne sesije). null kad snimka nema. */
export function countClaudeProcesses(processes) {
  if (!Array.isArray(processes)) return null;
  return processes.filter((p) => /^claude(\.exe)?$/i.test(p.name)).length;
}

function measureFreeDisk(root) {
  try {
    const stats = statfsSync(root);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

function measureFreeMem() {
  try {
    const v = os.freemem();
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Mjeri stvarno stanje stroja. `LEKTA_GATE_MEASUREMENT_FILE` (samo za testove omotaca) podmece
 * procese, RAM i disk iz JSON datoteke; lock i zivost PID-a se i tada mjere stvarno.
 */
export function measureState({ env = process.env, root = REPO_ROOT, selfPid = process.pid, now = Date.now() } = {}) {
  const path = lockFilePath(env);
  const lockRaw = readLock(path);
  const lockUnmeasurable = Boolean(lockRaw && lockRaw.unmeasurable);
  const lock = lockUnmeasurable ? null : lockRaw;
  const lockAlive = lock ? isPidAlive(lock.pid) : null;

  let processes;
  let freeMemBytes;
  let freeDiskBytes;
  let injected = false;
  if (env.LEKTA_GATE_MEASUREMENT_FILE) {
    injected = true;
    const fake = JSON.parse(readFileSync(env.LEKTA_GATE_MEASUREMENT_FILE, 'utf8'));
    processes = fake.processes ?? null;
    freeMemBytes = fake.freeMemBytes ?? null;
    freeDiskBytes = fake.freeDiskBytes ?? null;
  } else {
    processes = listProcesses();
    freeMemBytes = measureFreeMem();
    freeDiskBytes = measureFreeDisk(root);
  }

  return {
    nowMs: now,
    lockPath: path,
    lock,
    lockAlive,
    lockUnmeasurable,
    foreignTestProcesses: foreignTestProcesses(processes, selfPid),
    claudeProcessCount: countClaudeProcesses(processes),
    freeMemBytes,
    freeDiskBytes,
    worktree: root,
    injected,
  };
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'nepoznato vrijeme';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

const gb = (bytes) => `${(bytes / GB).toFixed(2).replace('.', ',')} GB`;

export function lockAgeMs(lock, nowMs) {
  const started = lock && lock.startedAt ? Date.parse(lock.startedAt) : Number.NaN;
  return Number.isFinite(started) ? nowMs - started : null;
}

/**
 * Presuda nad lockom: 'free' (nema locka), 'alive', 'dead' ili 'stale' (PID neprovjerljiv i lock
 * stariji od praga, ili bez vremena).
 */
export function lockStatus(state, thresholds = THRESHOLDS) {
  if (!state.lock) return 'free';
  if (state.lockAlive === true) return 'alive';
  if (state.lockAlive === false) return 'dead';
  const age = lockAgeMs(state.lock, state.nowMs);
  if (age !== null && age < thresholds.unverifiableLockMaxAgeMs) return 'alive';
  return 'stale';
}

export function describeLock(lock, nowMs) {
  const label = lock.label ?? (lock.corrupt ? 'nerazumljiv lock' : 'bez oznake');
  const where = lock.worktree ? `, stablo ${lock.worktree}` : '';
  const pid = lock.pid === null ? 'PID nepoznat' : `PID ${lock.pid}`;
  return `"${label}" (${pid}${where}) vec ${formatDuration(lockAgeMs(lock, nowMs) ?? Number.NaN)}`;
}

/**
 * CISTA presuda. Ne dira OS.
 *
 * @param {object} state - izlaz `measureState` (ili podmetnut u testu).
 * @param {{ force?: boolean, ci?: boolean, heldToken?: string|null, thresholds?: typeof THRESHOLDS }} [options]
 * @returns {{ allow: boolean, reasons: string[], warnings: string[], mode: 'free'|'refused'|'forced'|'ci'|'nested', writeLock: boolean }}
 *   `reasons` su razlozi odbijanja (uz NADJACANO kad je nadjacano); `warnings` su nemjerljiva stanja.
 */
export function judgeGate(state, options = {}) {
  const thresholds = options.thresholds ?? THRESHOLDS;
  const blockers = [];
  const warnings = [];

  const status = lockStatus(state, thresholds);
  const nested = Boolean(
    options.heldToken && state.lock && state.lock.token === options.heldToken && status !== 'dead',
  );

  if (state.lockUnmeasurable) {
    warnings.push('lock datoteka se ne moze procitati (nije "nema datoteke"); tretira se kao slobodna, ne blokira.');
  }

  if (!nested) {
    if (status === 'alive') {
      const how = state.lockAlive === true ? 'PID je ziv' : 'PID se ne moze provjeriti, a lock je mladji od 3 h';
      blockers.push(`gate vec drzi ${describeLock(state.lock, state.nowMs)}; ${how}.`);
    } else if (status === 'dead') {
      warnings.push(`zatecen mrtav lock ${describeLock(state.lock, state.nowMs)} (PID vise ne postoji); preuzima se.`);
    } else if (status === 'stale') {
      warnings.push(`zatecen lock ${describeLock(state.lock, state.nowMs)} s neprovjerljivim PID-om, stariji od 3 h; smatra se mrtvim.`);
    }
  }

  if (state.foreignTestProcesses === null || state.foreignTestProcesses === undefined) {
    warnings.push('tudji vitest/playwright procesi nisu izmjereni (snimak procesa nije uspio); ne blokira.');
  } else if (state.foreignTestProcesses.length > 0) {
    const list = state.foreignTestProcesses
      .slice(0, 3)
      .map((p) => `PID ${p.pid}: ${(p.commandLine ?? '').replace(/\s+/g, ' ').slice(0, 110)}`)
      .join('; ');
    const more = state.foreignTestProcesses.length > 3 ? ` (+${state.foreignTestProcesses.length - 3} jos)` : '';
    const msg = `radi ${state.foreignTestProcesses.length} tudji vitest/playwright proces(a): ${list}${more}.`;
    if (nested) warnings.push(msg);
    else blockers.push(msg);
  }

  if (state.freeMemBytes === null || state.freeMemBytes === undefined) {
    warnings.push('slobodni RAM nije izmjeren; ne blokira.');
  } else if (state.freeMemBytes < thresholds.minFreeMemBytes) {
    blockers.push(`slobodni RAM ${gb(state.freeMemBytes)} je ispod praga ${gb(thresholds.minFreeMemBytes)}.`);
  }

  if (state.freeDiskBytes === null || state.freeDiskBytes === undefined) {
    warnings.push('slobodni disk nije izmjeren; ne blokira.');
  } else if (state.freeDiskBytes < thresholds.minFreeDiskBytes) {
    blockers.push(`slobodni disk ${gb(state.freeDiskBytes)} je ispod praga ${gb(thresholds.minFreeDiskBytes)}.`);
  }

  if (typeof state.claudeProcessCount === 'number' && state.claudeProcessCount > thresholds.maxClaudeSessions) {
    warnings.push(`vise od ${thresholds.maxClaudeSessions} interaktivne sesije: RAM (claude.exe: ${state.claudeProcessCount}).`);
  }

  if (options.ci) {
    return {
      allow: true,
      reasons: blockers.map((b) => `(CI, ne blokira) ${b}`),
      warnings,
      mode: 'ci',
      writeLock: false,
    };
  }
  if (nested) {
    return { allow: true, reasons: [], warnings, mode: 'nested', writeLock: false };
  }
  if (options.force) {
    return {
      allow: true,
      reasons: ['NADJACANO (LEKTA_GATE_FORCE=1): gate se pokrece unatoc preflightu.', ...blockers],
      warnings,
      mode: 'forced',
      writeLock: true,
    };
  }
  if (blockers.length) {
    return { allow: false, reasons: blockers, warnings, mode: 'refused', writeLock: false };
  }
  return { allow: true, reasons: [], warnings, mode: 'free', writeLock: true };
}

/** Redci stanja za ispis (--check-only, omotac, bootstrap). */
export function formatStateLines(state, thresholds = THRESHOLDS) {
  const lines = [];
  const status = lockStatus(state, thresholds);
  if (status === 'free') lines.push('lock: slobodan');
  else if (status === 'alive') lines.push(`lock: drzi ${describeLock(state.lock, state.nowMs)}`);
  else if (status === 'dead') lines.push(`lock: mrtav (${describeLock(state.lock, state.nowMs)}, PID nestao)`);
  else lines.push(`lock: zastario (${describeLock(state.lock, state.nowMs)}, PID neprovjerljiv)`);

  if (state.foreignTestProcesses === null || state.foreignTestProcesses === undefined) {
    lines.push('tudji vitest/playwright: nije izmjereno');
  } else {
    const pids = state.foreignTestProcesses.map((p) => p.pid).join(', ');
    lines.push(`tudji vitest/playwright: ${state.foreignTestProcesses.length}${pids ? ` (PID ${pids})` : ''}`);
  }
  lines.push(
    state.freeMemBytes === null || state.freeMemBytes === undefined
      ? 'RAM slobodno: nije izmjereno'
      : `RAM slobodno: ${gb(state.freeMemBytes)} (prag ${gb(thresholds.minFreeMemBytes)})`,
  );
  lines.push(
    state.freeDiskBytes === null || state.freeDiskBytes === undefined
      ? 'disk slobodno: nije izmjereno'
      : `disk slobodno: ${gb(state.freeDiskBytes)} (prag ${gb(thresholds.minFreeDiskBytes)})`,
  );
  lines.push(
    typeof state.claudeProcessCount === 'number'
      ? `claude.exe procesi: ${state.claudeProcessCount}`
      : 'claude.exe procesi: nije izmjereno',
  );
  if (state.injected) lines.push('MJERENJE PODMETNUTO (LEKTA_GATE_MEASUREMENT_FILE, samo za testove)');
  return lines;
}

/**
 * Pise lock atomarno (`wx`): ako ga je netko zauzeo izmedju mjerenja i upisa, upis padne umjesto da
 * tiho pregazi tudji lock. Mrtav/zastario lock se prvo brise; NADJACANO pise preko svega.
 * @returns {boolean} true ako je lock upisan.
 */
export function writeLock(path, record, { overwrite = false, removeExisting = false } = {}) {
  if (removeExisting) {
    try {
      unlinkSync(path);
    } catch {
      // nije ga bilo ili ga je netko vec maknuo
    }
  }
  try {
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { flag: overwrite ? 'w' : 'wx' });
    return true;
  } catch (error) {
    if (error && error.code === 'EEXIST') return false;
    throw error;
  }
}

/**
 * Otpusta lock SAMO ako je nas (isti token ili isti PID vlasnika). Tudji lock se nikad ne brise.
 * @returns {'released'|'absent'|'foreign'}
 */
export function releaseLock(path, { token = null, pid = null } = {}) {
  const lock = readLock(path);
  if (!lock) return 'absent';
  const ours = (token && lock.token === token) || (pid !== null && lock.pid === pid);
  if (!ours) return 'foreign';
  try {
    unlinkSync(path);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
  return 'released';
}

/**
 * Smije li se lock proglasen `dead`/`stale` fizicki obrisati prije novog upisa. Cista funkcija radi
 * izravnog testiranja: NIKAD ne dopusta uklanjanje locka mladjeg od `thresholds.minTakeoverAgeMs`,
 * cak ni kad je status vec `dead` ili `stale` (druga sesija ga je mozda upravo napisala u uskoj
 * utrci izmedju mjerenja i upisa). `age === null` (nepoznata starost) ne blokira uklanjanje, jer
 * inace zastario lock bez citljivog vremena nikad ne bi mogao biti preuzet.
 * @param {'free'|'alive'|'dead'|'stale'} status
 * @param {number|null} age
 * @param {typeof THRESHOLDS} thresholds
 * @returns {boolean}
 */
export function canTakeOverLock(status, age, thresholds = THRESHOLDS) {
  if (status !== 'dead' && status !== 'stale') return false;
  return age === null || age >= thresholds.minTakeoverAgeMs;
}

/** Je li izmjereni slobodni disk ispod praga (null nije ispod: nemjerljivo ne blokira). */
function diskBelowThreshold(state, thresholds = THRESHOLDS) {
  return typeof state.freeDiskBytes === 'number' && state.freeDiskBytes < thresholds.minFreeDiskBytes;
}

/**
 * Redak za poruku odbijanja kad je disk ispod praga: koliko worktreeova se moze ukloniti i kojom
 * naredbom (`scripts/worktree-gc.mjs`, odluka vlasnika 2026-10-03). Prvi signal neprovodjenja
 * ciscenja bio je upravo ovaj prag, pa poruka sada imenuje lijek. Mjerenje je fail-open: pad ili
 * istek daju redak s naredbom bez broja. Uz podmetnuto mjerenje (testovi) se pravi repo ne mjeri.
 * @param {{ root: string, injected?: boolean, spawn?: typeof spawnSync, timeoutMs?: number }} options
 * @returns {string}
 */
export function worktreeGcHint({ root, injected = false, spawn = spawnSync, timeoutMs = 60_000 }) {
  const command = 'node scripts/worktree-gc.mjs --apply';
  if (!injected) {
    try {
      const res = spawn(process.execPath, [join(root, 'scripts', 'worktree-gc.mjs'), '--json'], {
        cwd: root,
        encoding: 'utf8',
        timeout: timeoutMs,
        windowsHide: true,
      });
      if (!res.error && res.status === 0) {
        const parsed = JSON.parse(String(res.stdout ?? '').trim().split(/\r?\n/).pop() ?? '');
        if (Number.isInteger(parsed.removable) && Number.isInteger(parsed.removableMb)) {
          return `uklonjivih worktreeova: ${parsed.removable} (${parsed.removableMb} MB); oslobodi: ${command}`;
        }
      }
    } catch {
      // pada na nize
    }
  }
  return `uklonjivi worktreeovi nisu izmjereni; provjeri i oslobodi: node scripts/worktree-gc.mjs, zatim ${command}`;
}

/**
 * Mjeri, presudi i (ako smije) upise lock. Zajednicko za CLI i omotac.
 * @returns {{ allow: boolean, verdict: ReturnType<typeof judgeGate>, state: object, token: string|null, nested: boolean }}
 */
export function acquireGate({ label, ownerPid, env = process.env, root = REPO_ROOT, log = console.error }) {
  const thresholds = THRESHOLDS;
  const options = {
    force: env.LEKTA_GATE_FORCE === '1',
    ci: isCiEnv(env),
    heldToken: env.LEKTA_GATE_LOCK_TOKEN || null,
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const state = measureState({ env, root });
    const verdict = judgeGate(state, options);
    const prefix = `[gate-preflight] ${label}`;
    for (const line of formatStateLines(state)) log(`${prefix}: ${line}`);
    for (const w of verdict.warnings) log(`${prefix}: UPOZORENJE: ${w}`);

    if (!verdict.allow) {
      log(`${prefix}: ODBIJENO (exit 2). Stroj nije slobodan za gate:`);
      for (const r of verdict.reasons) log(`  - ${r}`);
      if (diskBelowThreshold(state, thresholds)) log(`  - ${worktreeGcHint({ root, injected: state.injected })}`);
      log('  Pricekaj (`node scripts/gate-preflight.mjs --check-only` u petlji) ili, samo uz vlasnikovu odluku, LEKTA_GATE_FORCE=1.');
      return { allow: false, verdict, state, token: null, nested: false };
    }
    if (verdict.mode === 'ci') {
      for (const r of verdict.reasons) log(`${prefix}: ${r}`);
      log(`${prefix}: CI: samo mjerenje, lock se ne upisuje.`);
      return { allow: true, verdict, state, token: null, nested: false };
    }
    if (verdict.mode === 'nested') {
      log(`${prefix}: unutar vec zauzetog vlastitog locka (${describeLock(state.lock, state.nowMs)}); nastavlja bez novog locka.`);
      return { allow: true, verdict, state, token: options.heldToken, nested: true };
    }
    if (verdict.mode === 'forced') for (const r of verdict.reasons) log(`${prefix}: ${r}`);

    const token = randomUUID();
    const record = {
      pid: ownerPid,
      startedAt: new Date(state.nowMs).toISOString(),
      worktree: root,
      label,
      token,
    };
    const status = lockStatus(state);
    const lockAge = state.lock ? lockAgeMs(state.lock, state.nowMs) : null;
    // Nikad ne brisi lock mladji od `minTakeoverAgeMs`, cak ni proglasen mrtvim/zastarjelim: to
    // je upravo prozor u kojem je druga sesija tek napisala lock (uska utrka izmedju mjerenja i
    // upisa u DRUGOJ sesiji). `wx` upis ispod ce tada sam pasti s EEXIST, sto ovaj poziv salje na
    // ponovno mjerenje umjesto na tihu obrisi-pa-upisi zamjenu.
    const smijeUkloniti = canTakeOverLock(status, lockAge, thresholds);
    if ((status === 'dead' || status === 'stale') && !smijeUkloniti) {
      log(`${prefix}: zatecen lock mladji od ${thresholds.minTakeoverAgeMs} ms unatoc statusu "${status}"; ne uklanja se, mjeri se ponovno.`);
    }
    const written = writeLock(state.lockPath, record, {
      overwrite: verdict.mode === 'forced',
      removeExisting: smijeUkloniti,
    });
    if (written) {
      log(`${prefix}: lock zauzet (PID ${ownerPid}, ${state.lockPath}).`);
      return { allow: true, verdict, state, token, nested: false };
    }
    log(`${prefix}: lock je zauzet izmedju mjerenja i upisa; mjeri se ponovno.`);
  }
  log(`[gate-preflight] ${label}: ODBIJENO (exit 2): lock se ne moze zauzeti.`);
  return { allow: false, verdict: null, state: null, token: null, nested: false };
}

function parseArgs(argv) {
  const args = { label: 'gate', checkOnly: false, release: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check-only') args.checkOnly = true;
    else if (a === '--release') args.release = true;
    else if (a === '--label') args.label = argv[++i] ?? 'gate';
    else if (a.startsWith('--label=')) args.label = a.slice('--label='.length);
  }
  return args;
}

/** Zavrsni redak env-doctora, samo informacija: ne mijenja presudu i nikad ne rusi preflight. */
async function envDoctorLine() {
  try {
    const { runDoctor, summaryLine } = await import('./env-doctor.mjs');
    return summaryLine(runDoctor({ root: REPO_ROOT }));
  } catch {
    return 'env-doctor: nije izmjereno';
  }
}

async function main(argv) {
  const args = parseArgs(argv);
  const env = process.env;
  const path = lockFilePath(env);

  if (args.release) {
    if (isCiEnv(env)) return 0;
    const result = releaseLock(path, { token: env.LEKTA_GATE_LOCK_TOKEN || null, pid: process.ppid });
    if (result === 'released') console.error(`[gate-preflight] lock otpusten (${path}).`);
    else if (result === 'absent') console.error('[gate-preflight] lock nije postojao; nista za otpustiti.');
    else console.error('[gate-preflight] lock drzi drugi proces; NE brise se.');
    return 0;
  }

  if (args.checkOnly) {
    const state = measureState({ env });
    const verdict = judgeGate(state, { ci: isCiEnv(env), heldToken: env.LEKTA_GATE_LOCK_TOKEN || null });
    console.log(`[gate-preflight] stanje stroja ${new Date(state.nowMs).toISOString()} (${state.lockPath})`);
    for (const line of formatStateLines(state)) console.log(`  ${line}`);
    console.log(`  ${await envDoctorLine()}`);
    for (const w of verdict.warnings) console.log(`  UPOZORENJE: ${w}`);
    if (verdict.allow) {
      console.log('  presuda: SLOBODNO (exit 0)');
      return 0;
    }
    console.log('  presuda: ZAUZETO (exit 2)');
    for (const r of verdict.reasons) console.log(`  - ${r}`);
    if (diskBelowThreshold(state)) console.log(`  - ${worktreeGcHint({ root: REPO_ROOT, injected: state.injected })}`);
    return 2;
  }

  const result = acquireGate({ label: args.label, ownerPid: process.ppid, env });
  console.error(`[gate-preflight] ${args.label}: ${await envDoctorLine()}`);
  return result.allow ? 0 : 2;
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  const norm = (p) => resolve(p).replace(/\\/g, '/').toLowerCase();
  return norm(entry) === norm(fileURLToPath(import.meta.url));
}

if (isDirectRun()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
