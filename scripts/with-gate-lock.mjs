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
 * Izlazni kodovi: kod naredbe; 2 kad preflight odbije (naredba se tada ne pokrece).
 */
import { spawn } from 'node:child_process';
import { acquireGate, isPidAlive, listProcesses, lockFilePath, measureMachine, releaseLock, weakMachineWorkerEnv } from './gate-preflight.mjs';

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

/**
 * Potomci zadanog PID-a (djeca, unuci, ...), bez njega samog. Na prekid se signal salje cijelom
 * stablu: `child.kill` pogada samo `sh -c` ljusku, a `npm`, `vitest` i njegovi radnici bi ostali
 * zivi dok omotac otpusti lock (T110, izmjereno 2026-10-08).
 * @param {{pid:number, ppid:number}[]} processes
 * @param {number} rootPid
 * @returns {number[]}
 */
export function descendantPids(processes, rootPid) {
  const out = [];
  const seen = new Set([rootPid]);
  const queue = [rootPid];
  while (queue.length) {
    const parent = queue.shift();
    for (const p of processes) {
      if (p.ppid === parent && !seen.has(p.pid)) {
        seen.add(p.pid);
        out.push(p.pid);
        queue.push(p.pid);
      }
    }
  }
  return out;
}

/**
 * Salje signal djetetu i svim njegovim potomcima. Stablo se snima PRIJE slanja: kad ljuska umre,
 * njezina se djeca presele pod init i veza s omotacem se gubi. Bez snimka (fail-open) signal ide
 * samo djetetu, kao prije.
 * @returns {number[]} PID-ovi kojima je signal poslan
 */
export function signalTree(childPid, signal, { list = listProcesses, kill = process.kill.bind(process) } = {}) {
  const snapshot = list();
  const pids = [childPid, ...(snapshot ? descendantPids(snapshot, childPid) : [])];
  for (const pid of pids) {
    try {
      kill(pid, signal);
    } catch {
      // proces je vec nestao
    }
  }
  return pids;
}

/**
 * Ceka da svi zadani PID-ovi nestanu, najvise `graceMs`; preostale gasi s SIGKILL. Tek nakon toga
 * omotac smije otpustiti lock, inace bi drugi gate krenuo uz zivi tudji vitest.
 * @returns {Promise<number[]>} PID-ovi koje je trebalo ubiti s SIGKILL
 */
export async function reapTree(pids, { graceMs = 10_000, stepMs = 100, alive = isPidAlive, kill = process.kill.bind(process), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const deadline = Date.now() + graceMs;
  let living = pids.filter((pid) => alive(pid) === true);
  while (living.length && Date.now() < deadline) {
    await sleep(stepMs);
    living = living.filter((pid) => alive(pid) === true);
  }
  for (const pid of living) {
    try {
      kill(pid, 'SIGKILL');
    } catch {
      // proces je nestao izmedju provjere i signala
    }
  }
  return living;
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

  /** PID-ovi kojima je proslijedjen signal; prije otpustanja locka moraju nestati. */
  let signalled = [];
  try {
    const code = await new Promise((resolvePromise) => {
      const child = spawn(joinCommand(command), { stdio: 'inherit', shell: true, env: childEnv });
      const forward = (signal) => {
        // Ctrl+C na Windowsu ionako dobije cijela konzola; ovdje se samo ceka da dijete zavrsi,
        // da bi `finally` otpustio lock. Drugdje signal ide cijelom stablu djeteta (T110).
        if (process.platform === 'win32' || !child.pid) return;
        signalled = [...new Set([...signalled, ...signalTree(child.pid, signal)])];
      };
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(signal, forward);
      child.on('error', (error) => {
        console.error(`[gate-preflight] ${label}: naredba se nije mogla pokrenuti: ${error.message}`);
        resolvePromise(1);
      });
      child.on('exit', (exitCode, signal) => {
        resolvePromise(typeof exitCode === 'number' ? exitCode : signal ? 1 : 0);
      });
    });
    return code;
  } finally {
    if (signalled.length) {
      const killed = await reapTree(signalled);
      if (killed.length) console.error(`[gate-preflight] ${label}: SIGKILL za ${killed.length} proces(a) koji nisu stali na signal.`);
    }
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
