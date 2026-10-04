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
 * STRAZA (odluka vlasnika 2026-10-03): zadano je iskljucena jer mirovanje i nizak CPU nisu dokaz
 * zastoja. Koordinator je moze izricito ukljuciti (`LEKTA_GATE_WATCHDOG_MIN`) samo za poznati
 * zaglavljeni Vitest poziv. Svakih 60 s usporedjuje identitete procesa, sastav stabla i kumulativni
 * CPU pomak; nepoznato mjerenje, promjena stabla, reset brojača, vidljivi radnik ili neprozirni
 * launcher nikad ne daje presudu za ubijanje. Prekid se potvrduje prije izlaza 124 i otpustanja locka.
 * Git Bash/MSYS moze odvojiti dijete od PPID stabla, pa se launcher-list bez vidljivih potomaka
 * smatra neprozirnim i ostaje ziv. LEKTA_GATE_WATCHDOG_MIN=0 iskljucuje strazu.
 * LEKTA_GATE_WATCHDOG_INTERVAL_MS i LEKTA_GATE_WATCHDOG_TRACE sluze testovima.
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
const LAUNCHER_NAMES = new Set(['cmd.exe', 'sh', 'bash', 'dash', 'zsh', 'sh.exe', 'bash.exe', 'dash.exe', 'zsh.exe', 'env', 'env.exe', 'timeout', 'timeout.exe', 'npm', 'npm.exe', 'npx', 'npx.exe', 'powershell.exe', 'pwsh.exe', 'pwsh']);

/**
 * Postavke straze iz okoline. null = straza iskljucena.
 * @returns {{ intervalMs: number, windowSamples: number } | null}
 */
export function watchdogConfig(env = process.env) {
  const rawMin = env.LEKTA_GATE_WATCHDOG_MIN;
  const minutes = rawMin === undefined || rawMin === '' ? 0 : Number(rawMin);
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
 * @param {{pid:number, ppid:number, name:string, commandLine:string|null, cpuSec:number, identity:string, state?:string}[] | null} snapshot
 * @param {number} rootPid
 * @returns {{ cpuSec: number, descendants: number, mainPid: number, treePids: number[], treeSignature:string, processes:{pid:number,identity:string,cpuSec:number,state?:string,pgrp?:number}[] } | null}
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
  const processes = treePids.map((pid) => byPid.get(pid));
  if (processes.some((p) => !p || typeof p.identity !== 'string' || p.identity.length === 0 || !Number.isFinite(p.cpuSec))) return null;
  const processRecords = processes.map((p) => ({ pid: p.pid, identity: p.identity, cpuSec: p.cpuSec, state: p.state, pgrp: p.pgrp }));
  const cpuSec = processRecords.reduce((sum, p) => sum + p.cpuSec, 0);
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
  const treeSignature = processRecords.map((p) => `${p.pid}@${p.identity}`).sort().join('|');
  return { cpuSec, descendants: subtree(mainPid).length - 1, mainPid, treePids, treeSignature, processes: processRecords, opaque };
}

/**
 * Presuda je moguca samo kroz stabilan prozor identicnih procesa s rastucim ili nepromijenjenim
 * kumulativnim CPU brojacima. Promjena sastava, identiteta ili reset brojača vraca nepoznatu presudu.
 * @param {({ cpuSec: number, descendants: number, opaque?: boolean, treeSignature?:string, processes?:{pid:number,identity:string,cpuSec:number}[] } | null)[]} samples
 * @param {{ windowSamples: number, cpuEpsilonSec?: number }} options
 */
export function watchdogVerdict(samples, { windowSamples, cpuEpsilonSec = WATCHDOG_CPU_EPSILON_SEC }) {
  if (samples.length < windowSamples + 1) return { kill: false };
  const window = samples.slice(-(windowSamples + 1));
  if (window.some((s) => !s)) return { kill: false };
  if (window.some((s) => s.opaque)) return { kill: false };
  if (window.some((s) => s.descendants > 0)) return { kill: false };
  if (window.some((s) => !s.treeSignature || !Array.isArray(s.processes) || !s.processes.length)) return { kill: false };
  const first = window[0];
  const keys = first.processes.map((p) => `${p.pid}@${p.identity}`).sort();
  if (keys.join('|') !== first.treeSignature) return { kill: false };
  for (const sample of window) {
    const sampleKeys = sample.processes.map((p) => `${p.pid}@${p.identity}`).sort();
    if (sample.treeSignature !== first.treeSignature || sampleKeys.join('|') !== first.treeSignature) return { kill: false };
  }
  const firstCpu = new Map(first.processes.map((p) => [`${p.pid}@${p.identity}`, p.cpuSec]));
  let previousCpu = firstCpu;
  for (const sample of window.slice(1)) {
    const nextCpu = new Map(sample.processes.map((p) => [`${p.pid}@${p.identity}`, p.cpuSec]));
    for (const key of keys) {
      const previous = previousCpu.get(key);
      const current = nextCpu.get(key);
      if (!Number.isFinite(previous) || !Number.isFinite(current) || current < previous) return { kill: false, reason: 'cpu-reset' };
    }
    previousCpu = nextCpu;
  }
  const lastCpu = previousCpu;
  let growth = 0;
  for (const key of keys) {
    const start = firstCpu.get(key);
    const end = lastCpu.get(key);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return { kill: false, reason: 'cpu-reset' };
    growth += end - start;
  }
  return { kill: growth <= cpuEpsilonSec, growth };
}

const PS_CPU_SNAPSHOT = [
  'Get-CimInstance Win32_Process | ForEach-Object {',
  '[pscustomobject]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = [string]$_.Name;',
  "identity = $(if ($_.CreationDate) { [string]$_.CreationDate.ToFileTimeUtc() } else { $null });",
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
      identity: typeof p.identity === 'string' ? p.identity : '',
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
      const state = fields[0];
      const pgrp = Number(fields[2]);
      const identity = fields[19];
      const cpuSec = (Number(fields[11]) + Number(fields[12])) / 100;
      if (!/^\d+$/.test(identity ?? '') || !Number.isFinite(cpuSec) || !Number.isInteger(pgrp)) continue;
      let commandLine = null;
      try {
        commandLine = readFileSync(`/proc/${entry}/cmdline`, 'utf8').split('\0').join(' ').trim() || null;
      } catch {
        commandLine = null;
      }
      out.push({ pid: Number(entry), ppid: Number(fields[1]), pgrp, name, commandLine, cpuSec, identity, state });
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

/** Salje prekid i potvrduje da su prestali raditi promatrani procesi prije otpustanja gatea. */
export async function killTree(rootPid, sample, { snapshot = cpuSnapshot, attempts = 20, intervalMs = 50 } = {}) {
  if (!sample || !Array.isArray(sample.processes) || sample.processes.length === 0) return false;
  const keyOf = (proc) => `${proc.pid}@${proc.identity}`;
  const isLive = (proc) => proc.state !== 'Z' && proc.state !== 'X';
  const tracked = new Map(sample.processes.map((proc) => [keyOf(proc), proc]));
  const rootRecord = sample.processes.find((proc) => proc.pid === rootPid);
  if (!rootRecord) return false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await snapshot();
    if (!current) return false;

    // PID/PGID numericki jednakost nije dokaz identiteta: dijete moze izaci, a OS prije ovog
    // mjerenja ponovno dodijeliti njegov PID drugom procesu. Signaliziraj samo nakon svjezeg
    // podudaranja PID-a i stabilnog identiteta iz uzorka koji je pokrenuo presudu.
    const root = current.find((proc) => proc.pid === rootPid && proc.identity === rootRecord.identity);
    if (root) {
      const currentTree = measureTree(current, rootPid);
      if (!currentTree) return false;
      for (const proc of currentTree.processes) tracked.set(keyOf(proc), proc);
    }

    const liveByKey = new Map(current.filter(isLive).map((proc) => [keyOf(proc), proc]));
    const liveTracked = [...tracked.keys()].map((key) => liveByKey.get(key)).filter(Boolean);
    const groupMembers = process.platform === 'win32' ? [] : current.filter((proc) =>
      proc.pgrp === rootPid && isLive(proc));
    const trackedGroupMember = groupMembers.some((proc) => tracked.has(keyOf(proc)));
    if (!liveTracked.length && !groupMembers.length) return true;

    if (process.platform === 'win32') {
      // /T on sigurno samo dok svjezi snimak potvrduje da rootPid jos pripada pocetnom procesu.
      // Ako je root izasao, pojedinacno prekidamo samo jos zive identitete koje smo vec izmjerili.
      const targets = root && isLive(root) ? [root] : liveTracked;
      for (const target of targets) {
        try {
          execFileSync('taskkill', ['/PID', String(target.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        } catch {
          // Sljedeci snimak mora potvrditi da je tocni proces prestao raditi.
        }
      }
    } else {
      // Negativni PID cilja cijelu grupu. Koristimo ga samo dok je barem jedan izmjereni identitet
      // jos u toj grupi; nepoznat proces s ponovno zauzetim PGID-om ne smije dobiti signal.
      if (trackedGroupMember) {
        try {
          process.kill(-rootPid, 'SIGKILL');
        } catch (error) {
          if (error?.code !== 'ESRCH') {
            // Potvrda ispod odlucuje je li grupa stvarno prestala raditi.
          }
        }
      }
      for (const target of liveTracked) {
        if (trackedGroupMember && target.pgrp === rootPid) continue;
        try {
          process.kill(target.pid, 'SIGKILL');
        } catch (error) {
          if (error?.code !== 'ESRCH') {
            // Nepotvrdeni proces ostaje blocker.
          }
        }
      }
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
  }
  return false;
}

/**
 * Pokrece strazu nad djetetom; vraca funkciju koja je zaustavlja. Prvo mjerenje je odmah
 * (osnovica), zatim svakih `intervalMs`, uvijek tek kad je prethodno gotovo.
 */
export function startWatchdog({ child, label, env, onKill, onTerminationPending = () => {}, onTerminationFailed = () => {}, snapshot = cpuSnapshot, terminate = killTree }) {
  const config = watchdogConfig(env);
  if (!config || typeof child.pid !== 'number') return () => {};
  const rootPid = child.pid;
  const samples = [];
  let stopped = false;
  let preserveTermination = false;
  let terminationSample = null;
  let timer = null;
  let warnedTermination = false;
  const abort = new AbortController();
  const trace = env.LEKTA_GATE_WATCHDOG_TRACE;
  const attemptTermination = async (sample) => {
    const minutes = Math.round(((config.windowSamples * config.intervalMs) / 60_000) * 10) / 10;
    onTerminationPending();
    let terminated = false;
    try {
      terminated = await terminate(rootPid, sample);
    } catch {
      terminated = false;
    }
    if (terminated) {
      stopped = true;
      console.error(`with-gate-lock: dijete zapelo (0 radnika, CPU bez pomaka ${minutes} min), ubijam [${label}, PID ${rootPid}]`);
      onKill();
      return true;
    }
    onTerminationFailed();
    if (!warnedTermination) {
      console.error(`with-gate-lock: prekid djeteta nije potvrden; nastavljam nadzor [${label}, PID ${rootPid}]`);
      warnedTermination = true;
    }
    return false;
  };
  const tick = async () => {
    if (stopped) return;
    if (preserveTermination && terminationSample) {
      const terminated = await attemptTermination(terminationSample);
      if (!terminated && !stopped) timer = setTimeout(tick, config.intervalMs);
      return;
    }
    const sample = measureTree(await snapshot(abort.signal), rootPid);
    if (stopped) return;
    samples.push(sample);
    if (samples.length > config.windowSamples + 1) samples.shift();
    if (trace) {
      try {
        appendFileSync(trace, `${JSON.stringify(sample && { cpuSec: sample.cpuSec, descendants: sample.descendants, mainPid: sample.mainPid, opaque: sample.opaque, treeSignature: sample.treeSignature, processes: sample.processes })}\n`);
      } catch {
        // trag sluzi samo testovima
      }
    }
    if (sample && watchdogVerdict(samples, { windowSamples: config.windowSamples }).kill) {
      terminationSample = sample;
      if (await attemptTermination(sample)) return;
      if (stopped) return;
      if (preserveTermination) {
        timer = setTimeout(tick, config.intervalMs);
        return;
      }
    }
    timer = setTimeout(tick, config.intervalMs);
  };
  timer = setTimeout(tick, 0);
  return ({ preservePendingTermination = false } = {}) => {
    if (preservePendingTermination && terminationSample && !stopped) {
      preserveTermination = true;
      if (timer) clearTimeout(timer);
      abort.abort();
      timer = null;
      return;
    }
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
      const child = spawn(joinCommand(command), { stdio: 'inherit', shell: true, detached: process.platform !== 'win32', env: childEnv });
      let killedByWatchdog = false;
      let childExited = false;
      let watchdogTerminationPending = false;
      let naturalExit = null;
      let settled = false;
      const settle = (code) => {
        if (settled) return;
        settled = true;
        resolvePromise(code);
      };
      const stopWatchdog = startWatchdog({
        child,
        label,
        env,
        onTerminationPending: () => { watchdogTerminationPending = true; },
        onTerminationFailed: () => {
          if (!childExited) watchdogTerminationPending = false;
        },
        onKill: () => {
          killedByWatchdog = true;
          watchdogTerminationPending = false;
          if (childExited) settle(124);
        },
      });
      const forward = (signal) => {
        // Ctrl+C na Windowsu ionako dobije cijela konzola; ovdje se samo ceka da dijete zavrsi,
        // da bi `finally` otpustio lock.
        if (process.platform !== 'win32' && typeof child.pid === 'number') {
          try {
            process.kill(-child.pid, signal);
          } catch {
            // Naredba je mozda vec zavrsila.
          }
        }
      };
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(signal, forward);
      child.on('error', (error) => {
        stopWatchdog();
        console.error(`[gate-preflight] ${label}: naredba se nije mogla pokrenuti: ${error.message}`);
        settle(1);
      });
      child.on('exit', (exitCode, signal) => {
        childExited = true;
        naturalExit = () => killedByWatchdog ? 124 : typeof exitCode === 'number' ? exitCode : signal ? 1 : 0;
        stopWatchdog({ preservePendingTermination: watchdogTerminationPending });
        if (watchdogTerminationPending) return;
        settle(naturalExit());
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
