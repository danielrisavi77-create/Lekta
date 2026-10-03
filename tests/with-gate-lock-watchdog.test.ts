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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isLauncher, measureTree, watchdogConfig, watchdogVerdict } from '../scripts/with-gate-lock.mjs';

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
    cwd: ROOT, env: env(), encoding: 'utf8', timeout: 150_000,
  });
  return { status: res.status, output: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

type TraceLine = { cpuSec: number; descendants: number; mainPid: number } | null;
function trace(): TraceLine[] {
  if (!existsSync(tracePath)) return [];
  return readFileSync(tracePath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as TraceLine);
}

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
  it('zadano 5 min uz mjerenje svakih 60 s; 0 iskljucuje; testni razmak skracuje prozor', () => {
    expect(watchdogConfig({})).toEqual({ intervalMs: 60_000, windowSamples: 5 });
    expect(watchdogConfig({ LEKTA_GATE_WATCHDOG_MIN: '1' })).toEqual({ intervalMs: 60_000, windowSamples: 1 });
    expect(watchdogConfig({ LEKTA_GATE_WATCHDOG_MIN: '0' })).toBeNull();
    expect(watchdogConfig({ LEKTA_GATE_WATCHDOG_MIN: MIN, LEKTA_GATE_WATCHDOG_INTERVAL_MS: String(INTERVAL_MS) }))
      .toEqual({ intervalMs: INTERVAL_MS, windowSamples: WINDOW });
  });
});

describe('straza: mjerenje stabla', () => {
  // cmd.exe -> npx (node) -> cmd.exe -> vitest (node) -> dva radnika.
  const snapshot = [
    { pid: 10, ppid: 1, name: 'cmd.exe', commandLine: null, cpuSec: 0.1 },
    { pid: 11, ppid: 10, name: 'node.exe', commandLine: '"node" "C:\\npm\\node_modules\\npm\\bin\\npx-cli.js" vitest run', cpuSec: 0.5 },
    { pid: 12, ppid: 11, name: 'cmd.exe', commandLine: null, cpuSec: 0.1 },
    { pid: 13, ppid: 12, name: 'node.exe', commandLine: 'node node_modules/vitest/vitest.mjs run', cpuSec: 3 },
    { pid: 14, ppid: 13, name: 'node.exe', commandLine: 'node forks.js', cpuSec: 10 },
    { pid: 15, ppid: 13, name: 'node.exe', commandLine: 'node forks.js', cpuSec: 20 },
    { pid: 99, ppid: 1, name: 'node.exe', commandLine: 'tudji', cpuSec: 500 },
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
      { pid: 20, ppid: 1, name: 'cmd.exe', commandLine: null, cpuSec: 0.02 },
      { pid: 21, ppid: 20, name: 'bash.exe', commandLine: null, cpuSec: 0.06 },
      { pid: 22, ppid: 4242, name: 'bash.exe', commandLine: null, cpuSec: 0.1 },
      { pid: 23, ppid: 22, name: 'node.exe', commandLine: 'node vitest.mjs run', cpuSec: 17 },
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
  const idle = (cpuSec: number, descendants = 0) => ({ cpuSec, descendants });

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
});

describe('straza: pravi omotac', { timeout: 180_000 }, () => {
  it('dijete koje spava bez CPU-a i bez potomaka: ubijeno, poruka, exit 124, lock otpusten', () => {
    const r = runWrapper('setTimeout(function(){}, 600000)');
    expect(r.status, r.output).toBe(124);
    expect(r.output).toMatch(/with-gate-lock: dijete zapelo \(0 radnika, CPU bez pomaka [\d.]+ min\), ubijam/);
    expect(r.output).toMatch(/lock otpusten/);
    expect(existsSync(lockPath)).toBe(false);
    const t = trace().filter((l): l is NonNullable<TraceLine> => l !== null);
    expect(t.length).toBeGreaterThanOrEqual(WINDOW + 1);
    expect(t.slice(-WINDOW).every((l) => l.descendants === 0)).toBe(true);
  });

  it('dijete s rastucim CPU-om (petlja) NIJE ubijeno ni nakon vise prozora mjerenja', () => {
    const script = `${COUNT}for(;;){if(n()>=${SAFE_SAMPLES})process.exit(0);var e=Date.now()+100;while(Date.now()<e){}}`;
    const r = runWrapper(script);
    expect(r.status, r.output).toBe(0);
    expect(r.output).not.toMatch(/dijete zapelo/);
    expect(trace().length).toBeGreaterThanOrEqual(SAFE_SAMPLES);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('dijete s potomkom (oba spavaju, CPU bez pomaka) NIJE ubijeno', () => {
    const script = `${COUNT}var g=require('child_process').spawn(process.execPath,['-e','setTimeout(function(){},600000)'],{stdio:'ignore'});`
      + `setInterval(function(){if(n()>=${SAFE_SAMPLES}){g.kill();process.exit(0)}},100);`;
    const r = runWrapper(script);
    expect(r.status, r.output).toBe(0);
    expect(r.output).not.toMatch(/dijete zapelo/);
    const t = trace().filter((l): l is NonNullable<TraceLine> => l !== null);
    // Izravni signal: straza je stvarno vidjela potomka, nije prezivio slucajno.
    expect(t.some((l) => l.descendants >= 1)).toBe(true);
  });
});
