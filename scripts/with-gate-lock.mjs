#!/usr/bin/env node
/**
 * OMOTAC GATEA: zauzmi lock, pokreni naredbu, otpusti lock UVIJEK (i kad naredba padne).
 *
 *   node scripts/with-gate-lock.mjs <oznaka> [--env KLJUC=VRIJEDNOST ...] -- <naredba ...>
 *
 * Zasto omotac, a ne `preflight && naredba && release` u package.json: lanac s `&&` preskoci
 * `--release` bas kad naredba padne, pa bi lock ostao visiti do nestanka PID-a. Oblik
 * `(naredba; code=$?; release; exit $code)` ne radi u `cmd.exe`, koji npm na Windowsu koristi.
 * Ovdje se naredba pokrece kao dijete, njezin izlazni kod se cuva, a lock se otpusta u `finally`.
 *
 * Lock nosi PID OVOG procesa (zivi koliko i naredba) i token koji se predaje djetetu kroz
 * `LEKTA_GATE_LOCK_TOKEN`. Ugnijezdjeni gate (npr. `release:check` pokrece `npm run check`) po
 * tokenu prepozna vlastiti lock i ne blokira sam sebe, niti ga otpusta.
 *
 * Izlazni kodovi: kod naredbe; 2 kad preflight odbije (naredba se tada ne pokrece); 124 kad
 * straza ubije zapelo dijete.
 *
 * STRAZA (odluka vlasnika 2026-10-03): dva vitest runa su visjela 48 i 55 min bez ijednog radnika
 * nakon sto je laptop ostao bez RAM-a i drzala lock, pa su svi ostali gateovi stajali. Dok dijete
 * radi, svakih 60 s mjeri se CPU vrijeme cijelog stabla djeteta i broj potomaka glavnog procesa
 * (prvi proces ispod ljuske i npx/npm pokretaca). Kad glavni proces nema potomaka I CPU stabla kroz
 * LEKTA_GATE_WATCHDOG_MIN mjerenja (zadano 5, dakle 5 min) nije porastao vise od 1 s, stablo se
 * ubija, lock otpusta i izlazi s 124. Dijete s potomcima ili s rastucim CPU-om se nikad ne dira.
 * Mjerenje koje ne uspije ne broji se (fail-open: nikad ubijanje na temelju nepoznatog). Isto
 * vrijedi kad je glavni proces ljuska bez vidljivih potomaka: Git Bash na Windowsu kida stablo
 * procesa kod exec-a, pa `-- bash skripta.sh` straza ne moze izmjeriti i ne dira ga.
 * LEKTA_GATE_WATCHDOG_MIN=0 iskljucuje strazu. LEKTA_GATE_WATCHDOG_INTERVAL_MS i
 * LEKTA_GATE_WATCHDOG_TRACE postoje samo za testove (kraci razmak i trag mjerenja).
 */
import { execFile, execFileSync, spawn } from 'node:child_process';
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { acquireGate, lockFilePath, measureMachine, releaseLock, weakMachineWorkerEnv } from './gate-preflight.mjs';

export function parseWrapperArgs(argv) {
  const sep = argv.indexOf('--');
  if (sep < 1 || sep === argv.length - 1) return null;
  const head = argv.slice(0, sep);
  const command = argv.slice(sep + 1);
  const label = head[0];
  if (!label || label.startsWith('--')) return null;
  const extraEnv = {};
  for (let i = 1; i < head.length; i += 1) {
    if (head[i] !== '--env') return null;
    const pair = head[i + 1] ?? '';
    const eq = pair.indexOf('=');
    if (eq < 1) return null;
    extraEnv[pair.slice(0, eq)] = pair.slice(eq + 1);
    i += 1;
  }
  return { label, extraEnv, command };
}

/** Spaja argumente u jedan redak za ljusku; argument s razmakom ili navodnikom ide u navodnike. */
export function joinCommand(parts) {
  return parts
    .map((p) => (/^[\w@%+=:,./\\-]+$/.test(p) ? p : `"${p.replace(/"/g, '\\"')}"`))
    .join(' ');
}

export const WATCHDOG_CPU_EPSILON_SEC = 1;
// Git Bash na Windowsu: bash.exe i sh.exe (Win32_Process.Name nosi nastavak).
const LAUNCHER_NAMES = new Set(['cmd.exe', 'sh', 'bash', 'dash', 'zsh', 'sh.exe', 'bash.exe', 'dash.exe', 'zsh.exe', 'powershell.exe', 'pwsh.exe', 'pwsh']);

/**
 * Postavke straze iz okoline. null = straza iskljucena.
 * @returns {{ intervalMs: number, windowSamples: number } | null}
 */
export function watchdogConfig(env = process.env) {
  const rawMin = env.LEKTA_GATE_WATCHDOG_MIN;
  const minutes = rawMin === undefined || rawMin === '' ? 5 : Number(rawMin);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const rawInterval = Number(env.LEKTA_GATE_WATCHDOG_INTERVAL_MS);
  const intervalMs = Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 60_000;
  return { intervalMs, windowSamples: Math.max(1, Math.ceil((minutes * 60_000) / intervalMs)) };
}

/** Je li proces samo pokretac (ljuska, npx/npm) koji se preskace pri trazenju glavnog procesa. */
export function isLauncher(proc) {
  const name = (proc.name ?? '').toLowerCase();
  if (LAUNCHER_NAMES.has(name)) return true;
  const cmd = proc.commandLine ?? '';
  return /^node(\.exe)?$/.test(name) && /(npx-cli\.js|npm-cli\.js|[\\/]npx(\.cmd)?(["\s]|$)|[\\/]npm(\.cmd)?(["\s]|$))/i.test(cmd);
}

/**
 * Iz snimka procesa izvodi jedno mjerenje stabla s korijenom `rootPid` (proces koji je omotac
 * pokrenuo): ukupno CPU vrijeme svih procesa u stablu i broj potomaka glavnog procesa. Glavni
 * proces je prvi ispod lanca pokretaca (ljuska, npx/npm) koji imaju tocno jedno dijete.
 * @param {{pid:number, ppid:number, name:string, commandLine:string|null, cpuSec:number}[] | null} snapshot
 * @param {number} rootPid
 * @returns {{ cpuSec: number, descendants: number, mainPid: number, treePids: number[] } | null}
 */
export function measureTree(snapshot, rootPid) {
  if (!snapshot) return null;
  const byPid = new Map(snapshot.map((p) => [p.pid, p]));
  if (!byPid.has(rootPid)) return null;
  /** @type {Map<number, number[]>} */
  const children = new Map();
  for (const p of snapshot) {
    if (p.pid === p.ppid) continue;
    const list = children.get(p.ppid) ?? [];
    list.push(p.pid);
    children.set(p.ppid, list);
  }
  const subtree = (pid) => {
    const out = [];
    const stack = [pid];
    const seen = new Set();
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      out.push(cur);
      for (const c of children.get(cur) ?? []) stack.push(c);
    }
    return out;
  };
  const treePids = subtree(rootPid);
  const cpuSec = treePids.reduce((sum, pid) => sum + (byPid.get(pid)?.cpuSec ?? 0), 0);
  let mainPid = rootPid;
  for (;;) {
    const kids = children.get(mainPid) ?? [];
    const proc = byPid.get(mainPid);
    if (proc && isLauncher(proc) && kids.length === 1) mainPid = kids[0];
    else break;
  }
  const mainProc = byPid.get(mainPid);
  // Neproziran list: glavni proces je i dalje pokretac (ljuska). Na Windowsu Git Bash kod exec-a
  // pokrece novi bash.exe ciji roditelj nestaje, pa stvarni posao (npx, vitest, radnici) ispada iz
  // stabla korijena; izmjereno 3. 10. 2026.: `with-gate-lock x -- bash skripta.sh` je izgledao kao
  // bash bez potomaka i bez CPU-a dok je vitest radio kao siroce. Takvo mjerenje ne smije ubiti.
  const opaque = Boolean(mainProc && isLauncher(mainProc));
  return { cpuSec, descendants: subtree(mainPid).length - 1, mainPid, treePids, opaque };
}

/**
 * Presuda straze nad nizom mjerenja (najnovije zadnje). Ubija samo kad u zadnjih `windowSamples`
 * mjerenja glavni proces nema potomaka i CPU stabla od mjerenja prije prozora nije porastao vise
 * od `cpuEpsilonSec`. Nepoznato mjerenje (null) ili neproziran list (`opaque`: glavni proces je
 * ljuska bez vidljivih potomaka) u prozoru znaci: ne ubijaj.
 * @param {({ cpuSec: number, descendants: number, opaque?: boolean } | null)[]} samples
 * @param {{ windowSamples: number, cpuEpsilonSec?: number }} options
 */
export function watchdogVerdict(samples, { windowSamples, cpuEpsilonSec = WATCHDOG_CPU_EPSILON_SEC }) {
  if (samples.length < windowSamples + 1) return { kill: false };
  const window = samples.slice(-(windowSamples + 1));
  if (window.some((s) => !s)) return { kill: false };
  if (window.some((s) => s.opaque)) return { kill: false };
  if (window.slice(1).some((s) => s.descendants > 0)) return { kill: false };
  const growth = window[window.length - 1].cpuSec - window[0].cpuSec;
  return { kill: growth <= cpuEpsilonSec, growth };
}

const PS_CPU_SNAPSHOT = [
  'Get-CimInstance Win32_Process | ForEach-Object {',
  '[pscustomobject]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = [string]$_.Name;',
  "cmd = $(if ($_.Name -eq 'node.exe') { [string]$_.CommandLine } else { $null });",
  'cpu = ([double]$_.KernelModeTime + [double]$_.UserModeTime) / 10000000 } }',
  '| ConvertTo-Json -Compress',
].join(' ');

/** Parsira PowerShell snimak s CPU vremenom (sekunde). */
export function parseCpuSnapshotJson(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, '').trim());
  } catch {
    return null;
  }
  const out = [];
  for (const p of Array.isArray(parsed) ? parsed : [parsed]) {
    if (!p || typeof p !== 'object' || !Number.isInteger(p.pid)) continue;
    out.push({
      pid: p.pid,
      ppid: Number.isInteger(p.ppid) ? p.ppid : 0,
      name: typeof p.name === 'string' ? p.name : '',
      commandLine: typeof p.cmd === 'string' ? p.cmd : null,
      cpuSec: typeof p.cpu === 'number' && Number.isFinite(p.cpu) ? p.cpu : 0,
    });
  }
  return out.length ? out : null;
}

/** Linux: snimak iz /proc (utime + stime u otkucajima od 1/100 s). */
function procSnapshot() {
  let entries;
  try {
    entries = readdirSync('/proc');
  } catch {
    return null;
  }
  const out = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, 'utf8');
      const close = stat.lastIndexOf(')');
      const name = stat.slice(stat.indexOf('(') + 1, close);
      const fields = stat.slice(close + 2).split(' ');
      let commandLine = null;
      try {
        commandLine = readFileSync(`/proc/${entry}/cmdline`, 'utf8').split('\0').join(' ').trim() || null;
      } catch {
        commandLine = null;
      }
      out.push({ pid: Number(entry), ppid: Number(fields[1]), name, commandLine, cpuSec: (Number(fields[11]) + Number(fields[12])) / 100 });
    } catch {
      // proces je nestao izmedju citanja direktorija i datoteke
    }
  }
  return out.length ? out : null;
}

/** Asinkroni snimak procesa s CPU vremenom; null kad mjerenje ne uspije. */
export function cpuSnapshot(signal) {
  if (process.platform !== 'win32') return Promise.resolve(procSnapshot());
  return new Promise((resolvePromise) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', PS_CPU_SNAPSHOT],
      { timeout: 30_000, windowsHide: true, maxBuffer: 32 * 1024 * 1024, signal },
      (error, stdout) => resolvePromise(error ? null : parseCpuSnapshotJson(stdout)),
    );
  });
}

/** Ubija cijelo stablo: Windows `taskkill /T /F`, drugdje SIGKILL svakom procesu (listovi prvi). */
export function killTree(rootPid, treePids) {
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(rootPid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch {
      // proces je mozda vec nestao
    }
    return;
  }
  for (const pid of [...treePids].reverse()) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // vec nestao
    }
  }
}

/**
 * Pokrece strazu nad djetetom; vraca funkciju koja je zaustavlja. Prvo mjerenje je odmah
 * (osnovica), zatim svakih `intervalMs`, uvijek tek kad je prethodno gotovo.
 */
export function startWatchdog({ child, label, env, onKill, snapshot = cpuSnapshot }) {
  const config = watchdogConfig(env);
  if (!config || typeof child.pid !== 'number') return () => {};
  const rootPid = child.pid;
  const samples = [];
  let stopped = false;
  let timer = null;
  const abort = new AbortController();
  const trace = env.LEKTA_GATE_WATCHDOG_TRACE;
  const tick = async () => {
    if (stopped) return;
    const sample = measureTree(await snapshot(abort.signal), rootPid);
    if (stopped) return;
    samples.push(sample);
    if (samples.length > config.windowSamples + 1) samples.shift();
    if (trace) {
      try {
        appendFileSync(trace, `${JSON.stringify(sample && { cpuSec: sample.cpuSec, descendants: sample.descendants, mainPid: sample.mainPid, opaque: sample.opaque })}\n`);
      } catch {
        // trag sluzi samo testovima
      }
    }
    if (sample && watchdogVerdict(samples, { windowSamples: config.windowSamples }).kill) {
      stopped = true;
      const minutes = Math.round(((config.windowSamples * config.intervalMs) / 60_000) * 10) / 10;
      console.error(`with-gate-lock: dijete zapelo (0 radnika, CPU bez pomaka ${minutes} min), ubijam [${label}, PID ${rootPid}]`);
      onKill();
      killTree(rootPid, sample.treePids);
      return;
    }
    timer = setTimeout(tick, config.intervalMs);
  };
  timer = setTimeout(tick, 0);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    // Mjerenje u tijeku (powershell) se prekida, da omotac ne ceka na njega nakon kraja djeteta.
    abort.abort();
  };
}

async function main(argv) {
  const parsed = parseWrapperArgs(argv);
  if (!parsed) {
    console.error('uporaba: node scripts/with-gate-lock.mjs <oznaka> [--env K=V ...] -- <naredba ...>');
    return 64;
  }
  const { label, extraEnv, command } = parsed;
  const env = process.env;
  const gate = acquireGate({ label, ownerPid: process.pid, env });
  if (!gate.allow) return 2;

  const path = lockFilePath(env);
  const ownsLock = Boolean(gate.token) && !gate.nested;
  let released = false;
  const release = () => {
    if (released || !ownsLock) return;
    released = true;
    try {
      const result = releaseLock(path, { token: gate.token });
      console.error(`[gate-preflight] ${label}: lock ${result === 'released' ? 'otpusten' : `nije otpusten (${result})`}.`);
    } catch (error) {
      console.error(`[gate-preflight] ${label}: otpustanje locka nije uspjelo: ${error && error.message}`);
    }
  };
  // Zadnja linija obrane: i kad se proces gasi nekim drugim putem, lock ne ostaje.
  process.on('exit', release);

  const childEnv = { ...env, ...extraEnv };
  if (gate.token) childEnv.LEKTA_GATE_LOCK_TOKEN = gate.token;
  // Slab stroj: jedan Vitest radnik, osim kad je VITEST_MAX_THREADS vec postavljen (ROUTING.md).
  const workers = weakMachineWorkerEnv({ ...measureMachine(), env: childEnv });
  if (workers) {
    Object.assign(childEnv, workers);
    console.error('preflight: slab stroj, VITEST_MAX_THREADS=1');
  }

  try {
    const code = await new Promise((resolvePromise) => {
      const child = spawn(joinCommand(command), { stdio: 'inherit', shell: true, env: childEnv });
      let killedByWatchdog = false;
      const stopWatchdog = startWatchdog({ child, label, env, onKill: () => { killedByWatchdog = true; } });
      const forward = (signal) => {
        // Ctrl+C na Windowsu ionako dobije cijela konzola; ovdje se samo ceka da dijete zavrsi,
        // da bi `finally` otpustio lock.
        if (process.platform !== 'win32') child.kill(signal);
      };
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(signal, forward);
      child.on('error', (error) => {
        stopWatchdog();
        console.error(`[gate-preflight] ${label}: naredba se nije mogla pokrenuti: ${error.message}`);
        resolvePromise(1);
      });
      child.on('exit', (exitCode, signal) => {
        stopWatchdog();
        if (killedByWatchdog) {
          resolvePromise(124);
          return;
        }
        resolvePromise(typeof exitCode === 'number' ? exitCode : signal ? 1 : 0);
      });
    });
    return code;
  } finally {
    release();
  }
}

const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entry.endsWith('scripts/with-gate-lock.mjs')) {
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
