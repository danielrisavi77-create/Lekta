// @vitest-environment node
/**
 * Straza u `scripts/with-gate-lock.mjs` (odluka vlasnika 2026-10-03): zapelo dijete (glavni proces
 * bez potomaka, CPU stabla bez pomaka kroz prozor mjerenja) se ubija, lock otpusta, exit 124.
 * Dijete s rastucim CPU-om ili s potomcima se NE ubija.
 *
 * Integracijski scenariji vrte PRAVI omotac nad privremenim lockom i podmetnutim mjerenjem stroja
 * (kao `tests/with-gate-lock.test.ts`), uz kratak razmak straze kroz testnu varijablu
 * LEKTA_GATE_WATCHDOG_INTERVAL_MS. Straza upisuje svako mjerenje u LEKTA_GATE_WATCHDOG_TRACE, pa
 * dijete koje ne smije biti ubijeno zavrsava tek kad je straza napravila dovoljno mjerenja: test
 * ne ovisi o brzini stroja nego o broju stvarno obavljenih mjerenja.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cpuSnapshot, isLauncher, killTree, measureTree, startWatchdog, watchdogConfig, watchdogVerdict } from '../scripts/with-gate-lock.mjs';

const ROOT = resolve(__dirname, '..');
const WRAPPER = join(ROOT, 'scripts', 'with-gate-lock.mjs');
const GBYTES = 1024 ** 3;
const INTERVAL_MS = 400;
const WINDOW = 3;
// MIN u minutama tako da prozor bude tocno WINDOW mjerenja od INTERVAL_MS.
const MIN = String((WINDOW * INTERVAL_MS) / 60_000);
// Dijete koje ne smije biti ubijeno zivi dok straza ne napravi ovoliko mjerenja (> WINDOW + 1).
const SAFE_SAMPLES = WINDOW + 4;

let dir = '';
let lockPath = '';
let measurementPath = '';
let tracePath = '';

function env(): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...process.env };
  delete e.CI;
  delete e.LEKTA_GATE_FORCE;
  delete e.LEKTA_GATE_LOCK_TOKEN;
  return {
    ...e,
    LEKTA_GATE_LOCK_PATH: lockPath,
    LEKTA_GATE_MEASUREMENT_FILE: measurementPath,
    LEKTA_GATE_WATCHDOG_MIN: MIN,
    LEKTA_GATE_WATCHDOG_INTERVAL_MS: String(INTERVAL_MS),
    LEKTA_GATE_WATCHDOG_TRACE: tracePath,
  };
}

function runWrapper(script: string) {
  const res = spawnSync(process.execPath, [WRAPPER, 'wd-test', '--', 'node', '-e', script], {
    cwd: ROOT, env: env(), encoding: 'utf8', timeout: 20_000,
  });
  return { status: res.status, output: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

function runWrapperCommand(command: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  const res = spawnSync(process.execPath, [WRAPPER, 'wd-test', '--', ...command], {
    cwd: ROOT, env: { ...env(), ...extraEnv }, encoding: 'utf8', timeout: 20_000,
  });
  return { status: res.status, output: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

type TraceLine = { cpuSec: number; descendants: number; mainPid: number; treeSignature?: string; processes?: { pid: number; identity: string; cpuSec: number }[] } | null;
function trace(): TraceLine[] {
  if (!existsSync(tracePath)) return [];
  return readFileSync(tracePath, 'utf8').replace(/\r/g, '').split('\n').filter(Boolean).map((l) => JSON.parse(l) as TraceLine);
}

const CAN_OBSERVE_PROCESS_TREE = await (async () => {
  const probe = spawn(process.execPath, ['-e', 'setInterval(function(){},1000)'], { stdio: 'ignore' });
  try {
    await new Promise<void>((resolve, reject) => {
      probe.once('spawn', () => resolve());
      probe.once('error', reject);
    });
    const snapshot = await cpuSnapshot();
    return Boolean(snapshot?.some((p) => p.pid === probe.pid));
  } catch {
    return false;
  } finally {
    probe.kill();
  }
})();

/** JS koji broji retke traga; bez dvostrukih navodnika i znakova koje cmd.exe tumaci. */
const COUNT = "function n(){try{return require('fs').readFileSync(process.env.LEKTA_GATE_WATCHDOG_TRACE,'utf8').split(String.fromCharCode(10)).filter(Boolean).length}catch(e){return 0}}";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lekta-gate-straza-'));
  lockPath = join(dir, 'lekta-gate.lock');
  measurementPath = join(dir, 'mjerenje.json');
  tracePath = join(dir, 'trag.jsonl');
  writeFileSync(measurementPath, JSON.stringify({ processes: [], freeMemBytes: 6 * GBYTES, freeDiskBytes: 60 * GBYTES }));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('straza: postavke', () => {
  it('zadano je iskljucena; samo izricit pozitivan prag ukljucuje strazu', () => {
    expect(watchdogConfig({})).toBeNull();
    expect(watchdogConfig({ LEKTA_GATE_WATCHDOG_MIN: '1' })).toEqual({ intervalMs: 60_000, windowSamples: 1 });
    expect(watchdogConfig({ LEKTA_GATE_WATCHDOG_MIN: '0' })).toBeNull();
    expect(watchdogConfig({ LEKTA_GATE_WATCHDOG_MIN: MIN, LEKTA_GATE_WATCHDOG_INTERVAL_MS: String(INTERVAL_MS) }))
      .toEqual({ intervalMs: INTERVAL_MS, windowSamples: WINDOW });
  });
});

describe('straza: mjerenje stabla', () => {
  // cmd.exe -> npx (node) -> cmd.exe -> vitest (node) -> dva radnika.
  const snapshot = [
    { pid: 10, ppid: 1, name: 'cmd.exe', commandLine: null, cpuSec: 0.1, identity: '10@a' },
    { pid: 11, ppid: 10, name: 'node.exe', commandLine: '"node" "C:\\npm\\node_modules\\npm\\bin\\npx-cli.js" vitest run', cpuSec: 0.5, identity: '11@a' },
    { pid: 12, ppid: 11, name: 'cmd.exe', commandLine: null, cpuSec: 0.1, identity: '12@a' },
    { pid: 13, ppid: 12, name: 'node.exe', commandLine: 'node node_modules/vitest/vitest.mjs run', cpuSec: 3, identity: '13@a' },
    { pid: 14, ppid: 13, name: 'node.exe', commandLine: 'node forks.js', cpuSec: 10, identity: '14@a' },
    { pid: 15, ppid: 13, name: 'node.exe', commandLine: 'node forks.js', cpuSec: 20, identity: '15@a' },
    { pid: 99, ppid: 1, name: 'node.exe', commandLine: 'tudji', cpuSec: 500, identity: '99@a' },
  ];

  it('glavni proces je vitest ispod ljuske i npx-a; CPU je zbroj cijelog stabla, bez tudjih procesa', () => {
    const m = measureTree(snapshot, 10);
    expect(m?.mainPid).toBe(13);
    expect(m?.descendants).toBe(2);
    expect(m?.cpuSec).toBeCloseTo(33.7, 5);
    expect(m?.treePids.sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it('vitest bez radnika ima 0 potomaka', () => {
    const m = measureTree(snapshot.filter((p) => p.pid !== 14 && p.pid !== 15), 10);
    expect(m?.mainPid).toBe(13);
    expect(m?.descendants).toBe(0);
  });

  it('Git Bash kida stablo: bash bez vidljivih potomaka je neproziran list, ostalo nije', () => {
    // Oblik izmjeren 3. 10. 2026.: cmd -> bash.exe; pravi bash.exe s vitestom je siroce (roditelj nestao).
    const broken = [
      { pid: 20, ppid: 1, name: 'cmd.exe', commandLine: null, cpuSec: 0.02, identity: '20@a' },
      { pid: 21, ppid: 20, name: 'bash.exe', commandLine: null, cpuSec: 0.06, identity: '21@a' },
      { pid: 22, ppid: 4242, name: 'bash.exe', commandLine: null, cpuSec: 0.1, identity: '22@a' },
      { pid: 23, ppid: 22, name: 'node.exe', commandLine: 'node vitest.mjs run', cpuSec: 17, identity: '23@a' },
    ];
    const m = measureTree(broken, 20);
    expect(m?.mainPid).toBe(21);
    expect(m?.descendants).toBe(0);
    expect(m?.opaque).toBe(true);
    expect(measureTree(snapshot, 10)?.opaque).toBe(false);
  });

  it('nestao korijen ili neuspjelo mjerenje daju null', () => {
    expect(measureTree(null, 10)).toBeNull();
    expect(measureTree(snapshot, 4242)).toBeNull();
  });

  it('pokretaci: ljuske i npx/npm, ali ne vitest', () => {
    expect(isLauncher({ name: 'cmd.exe', commandLine: null })).toBe(true);
    expect(isLauncher({ name: 'node', commandLine: '/usr/bin/node /usr/lib/node_modules/npm/bin/npx-cli.js vitest' })).toBe(true);
    expect(isLauncher({ name: 'node.exe', commandLine: 'node node_modules/vitest/vitest.mjs run' })).toBe(false);
  });
});

describe('straza: presuda', () => {
  const idle = (cpuSec: number, descendants = 0) => ({
    cpuSec,
    descendants,
    treeSignature: '10@a',
    processes: [{ pid: 10, identity: 'a', cpuSec }],
  });

  it('BASELINE: 0 potomaka i CPU bez pomaka kroz cijeli prozor = ubij', () => {
    expect(watchdogVerdict([idle(5), idle(5.2), idle(5.4), idle(5.5)], { windowSamples: 3 }).kill).toBe(true);
  });

  it('CPU raste vise od 1 s kroz prozor (dijete radi ili ceka I/O s rastucim CPU-om) = ne ubijaj', () => {
    expect(watchdogVerdict([idle(5), idle(5.5), idle(6), idle(6.6)], { windowSamples: 3 }).kill).toBe(false);
  });

  it('glavni proces ima potomke = ne ubijaj, ni uz CPU bez pomaka', () => {
    expect(watchdogVerdict([idle(5), idle(5, 1), idle(5), idle(5)], { windowSamples: 3 }).kill).toBe(false);
  });

  it('neproziran list (ljuska bez vidljivih potomaka) u prozoru = ne ubijaj', () => {
    const opaque = { cpuSec: 5, descendants: 0, opaque: true };
    expect(watchdogVerdict([opaque, opaque, opaque, opaque], { windowSamples: 3 }).kill).toBe(false);
    expect(watchdogVerdict([idle(5), idle(5), opaque, idle(5)], { windowSamples: 3 }).kill).toBe(false);
  });

  it('premalo mjerenja ili nepoznato mjerenje u prozoru = ne ubijaj (fail-open)', () => {
    expect(watchdogVerdict([idle(5), idle(5), idle(5)], { windowSamples: 3 }).kill).toBe(false);
    expect(watchdogVerdict([idle(5), null, idle(5), idle(5)], { windowSamples: 3 }).kill).toBe(false);
  });

  it('promjena stabla ili ponovna upotreba PID-a ne dokazuje zastoj', () => {
    const baseline = (identity: string, cpuSec: number) => ({
      cpuSec,
      descendants: 0,
      treeSignature: `10@${identity}`,
      processes: [{ pid: 10, identity, cpuSec }],
    });
    const changed = [baseline('10@a', 1), baseline('10@a', 1), baseline('10@b', 1), baseline('10@b', 1)];
    expect(watchdogVerdict(changed, { windowSamples: 3 }).kill).toBe(false);
    const workerAppeared = [
      baseline('a', 1),
      { cpuSec: 1.2, descendants: 1, treeSignature: '10@a|11@a', processes: [{ pid: 10, identity: 'a', cpuSec: 1 }, { pid: 11, identity: 'a', cpuSec: 0.2 }] },
      baseline('a', 1),
      baseline('a', 1),
    ];
    expect(watchdogVerdict(workerAppeared, { windowSamples: 3 }).kill).toBe(false);
  });

  it('brojaci CPU koji se vrate unazad ne daju presudu o zastoju', () => {
    const reset = [idle(5), idle(5.2), idle(0.1), idle(0.2)];
    expect(watchdogVerdict(reset, { windowSamples: 3 }).kill).toBe(false);
  });
});

describe('straza: sigurni signali', () => {
  it.skipIf(process.platform === 'win32')('ne salje signal ponovno zauzetom PID/PGID-u s drugim identitetom', async () => {
    const pid = 1234;
    const sample = {
      processes: [{ pid, ppid: 1, pgrp: pid, name: 'node', cpuSec: 1, identity: 'old-start', state: 'S' }],
    };
    const reusedGroup = [
      { pid, ppid: 1, pgrp: pid, name: 'node', cpuSec: 20, identity: 'new-start', state: 'S' },
    ];
    const signal = vi.spyOn(process, 'kill').mockImplementation(() => true);
    try {
      const terminated = await killTree(pid, sample, {
        snapshot: async () => reusedGroup,
        attempts: 1,
        intervalMs: 0,
      });
      expect(terminated).toBe(false);
      expect(signal).not.toHaveBeenCalled();
    } finally {
      signal.mockRestore();
    }
  });
});

describe('straza: neuspjelo ubijanje', () => {
  it('nastavlja mjeriti i ne oznacava exit 124 kad se prekid procesa ne potvrdi', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(function(){}, 10000)'], { stdio: 'ignore' });
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => resolve());
      child.once('error', reject);
    });
    let snapshots = 0;
    let attempts = 0;
    let kills = 0;
    const snapshot = async () => {
      snapshots += 1;
      return [{ pid: child.pid!, ppid: 1, name: 'node', commandLine: 'node sleeper', cpuSec: 0, identity: 'child@a' }];
    };
    const stop = startWatchdog({
      child,
      label: 'failed-kill-test',
      env: { LEKTA_GATE_WATCHDOG_MIN: '0.0001', LEKTA_GATE_WATCHDOG_INTERVAL_MS: '10' },
      snapshot,
      terminate: async () => { attempts += 1; return false; },
      onKill: () => { kills += 1; },
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 80));
      stop();
      expect(attempts).toBeGreaterThan(1);
      expect(snapshots).toBeGreaterThan(3);
      expect(kills).toBe(0);
    } finally {
      stop();
      child.kill('SIGKILL');
    }
  });
});

describe('straza: pravi omotac', { timeout: 30_000 }, () => {
  it.skipIf(!CAN_OBSERVE_PROCESS_TREE)('dijete koje spava bez CPU-a i bez potomaka: ubijeno, poruka, exit 124, lock otpusten', () => {
    const r = runWrapper('setTimeout(function(){}, 600000)');
    expect(r.status, r.output).toBe(124);
    expect(r.output).toMatch(/with-gate-lock: dijete zapelo \(0 radnika, CPU bez pomaka [\d.]+ min\), ubijam/);
    expect(r.output).toMatch(/lock otpusten/);
    expect(existsSync(lockPath)).toBe(false);
    const t = trace().filter((l): l is NonNullable<TraceLine> => l !== null);
    expect(t.length).toBeGreaterThanOrEqual(WINDOW + 1);
    expect(t.slice(-WINDOW).every((l) => l.descendants === 0)).toBe(true);
  });

  it.skipIf(!CAN_OBSERVE_PROCESS_TREE)('dijete s rastucim CPU-om (petlja) NIJE ubijeno ni nakon vise prozora mjerenja', () => {
    const script = `${COUNT}for(;;){if(n()>=${SAFE_SAMPLES})process.exit(0);var e=Date.now()+100;while(Date.now()<e){}}`;
    const r = runWrapper(script);
    expect(r.status, r.output).toBe(0);
    expect(r.output).not.toMatch(/dijete zapelo/);
    expect(trace().length).toBeGreaterThanOrEqual(SAFE_SAMPLES);
    expect(existsSync(lockPath)).toBe(false);
  });

  it.skipIf(!CAN_OBSERVE_PROCESS_TREE)('dijete s potomkom (oba spavaju, CPU bez pomaka) NIJE ubijeno', () => {
    const script = `${COUNT}var g=require('child_process').spawn(process.execPath,['-e','setTimeout(function(){},600000)'],{stdio:'ignore'});`
      + `setInterval(function(){if(n()>=${SAFE_SAMPLES}){g.kill();process.exit(0)}},100);`;
    const r = runWrapper(script);
    expect(r.status, r.output).toBe(0);
    expect(r.output).not.toMatch(/dijete zapelo/);
    const t = trace().filter((l): l is NonNullable<TraceLine> => l !== null);
    // Izravni signal: straza je stvarno vidjela potomka, nije prezivio slucajno.
    expect(t.some((l) => l.descendants >= 1)).toBe(true);
  });

  it.skipIf(process.platform !== 'linux' || !CAN_OBSERVE_PROCESS_TREE)('na Linuxu -- bash all.sh prekida stvarno vidljiv proces putem /proc i SIGKILL prije otpustanja locka', () => {
    const scriptPath = join(dir, 'all.sh');
    const pidPath = join(dir, 'worker.pid');
    writeFileSync(scriptPath, 'exec node -e "require(\'fs\').writeFileSync(process.env.WATCHDOG_WORKER_PID, String(process.pid)); setTimeout(function(){}, 600000)"\n');
    const r = runWrapperCommand(['bash', scriptPath], { WATCHDOG_WORKER_PID: pidPath });
    expect(r.status, r.output).toBe(124);
    expect(existsSync(lockPath)).toBe(false);
    expect(existsSync(pidPath)).toBe(true);
    const workerPid = Number(readFileSync(pidPath, 'utf8'));
    let state = '';
    try {
      const stat = readFileSync(`/proc/${workerPid}/stat`, 'utf8');
      state = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0];
    } catch {
      state = 'gone';
    }
    expect(['gone', 'Z', 'X']).toContain(state);
  });

  it.skipIf(process.platform !== 'win32')('Git Bash -- bash all.sh ostaje pod watchdogom dok shell ne zavrsi i ne ostavlja radnika nakon otpustanja locka', () => {
    const scriptPath = join(dir, 'all.sh');
    const pidPath = join(dir, 'worker.pid');
    const script = [
      'node -e "require(\'fs\').writeFileSync(process.env.WATCHDOG_WORKER_PID, String(process.pid)); setTimeout(function(){}, 600000)" &',
      'worker=$!',
      'trace=$(cygpath -u "$LEKTA_GATE_WATCHDOG_TRACE")',
      `while [ ! -f "$trace" ] || [ "$(wc -l < "$trace")" -lt ${SAFE_SAMPLES} ]; do sleep 0.05; done`,
      'kill "$worker"',
      'wait "$worker" 2>/dev/null || true',
    ].join('\n') + '\n';
    writeFileSync(scriptPath, script);
    const r = runWrapperCommand(['bash', scriptPath], { WATCHDOG_WORKER_PID: pidPath });
    expect(r.status, r.output).toBe(0);
    expect(r.output).not.toMatch(/dijete zapelo/);
    expect(existsSync(lockPath)).toBe(false);
    const workerPid = Number(readFileSync(pidPath, 'utf8'));
    const alive = spawnSync('tasklist', ['/FI', `PID eq ${workerPid}`], { encoding: 'utf8' }).stdout ?? '';
    expect(alive).not.toMatch(new RegExp(`\\b${workerPid}\\b`));
  });
});
