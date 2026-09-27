// @vitest-environment node
/**
 * Omotac `scripts/with-gate-lock.mjs` (T62): zauzme lock, pokrene naredbu, sacuva njezin izlazni
 * kod i otpusti lock UVIJEK, i kad naredba padne. Upravo pad je slucaj koji lanac `a && b && c`
 * u package.json ne pokriva, pa se ovdje dokazuje izravno.
 *
 * Svaki scenarij vrti PRAVI omotac kao zaseban proces, ali nad privremenom stazom locka
 * (`LEKTA_GATE_LOCK_PATH`) i podmetnutim mjerenjem procesa/RAM-a/diska
 * (`LEKTA_GATE_MEASUREMENT_FILE`), pa ne dira pravi `%TEMP%\lekta-gate.lock` i ne ovisi o tome
 * vrti li netko drugi vitest na stroju. Zivost PID-a u locku se mjeri stvarno.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { joinCommand, parseWrapperArgs } from '../scripts/with-gate-lock.mjs';

const ROOT = resolve(__dirname, '..');
const WRAPPER = join(ROOT, 'scripts', 'with-gate-lock.mjs');
const GBYTES = 1024 ** 3;

let dir = '';
let lockPath = '';
let measurementPath = '';
let seenPath = '';

function writeMeasurement(extra: Record<string, unknown> = {}) {
  writeFileSync(measurementPath, JSON.stringify({
    processes: [],
    freeMemBytes: 6 * GBYTES,
    freeDiskBytes: 60 * GBYTES,
    ...extra,
  }));
}

function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.CI;
  delete env.LEKTA_GATE_FORCE;
  delete env.LEKTA_GATE_LOCK_TOKEN;
  return { ...env, LEKTA_GATE_LOCK_PATH: lockPath, LEKTA_GATE_MEASUREMENT_FILE: measurementPath, ...extra };
}

/** Naredba koja zapise sto vidi (lock i token) i izade sa zadanim kodom. */
function probeCommand(exitCode: number): string[] {
  const script = [
    "const fs=require('fs');",
    'const p=process.env.LEKTA_GATE_LOCK_PATH;',
    "const lock=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null;",
    'fs.writeFileSync(process.argv[1],JSON.stringify({lock,token:process.env.LEKTA_GATE_LOCK_TOKEN||null,all:process.env.LEKTA_UX_ALL_BROWSERS||null}));',
    `process.exit(${exitCode});`,
  ].join('');
  return ['node', '-e', script, seenPath];
}

function runWrapper(args: string[], env: NodeJS.ProcessEnv) {
  const res = spawnSync(process.execPath, [WRAPPER, ...args], { cwd: ROOT, env, encoding: 'utf8', timeout: 90_000 });
  return { status: res.status, output: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

function seen(): { lock: { token: string; label: string; worktree: string } | null; token: string | null; all: string | null } | null {
  return existsSync(seenPath) ? JSON.parse(readFileSync(seenPath, 'utf8')) : null;
}

function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  return Number(child.stdout);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lekta-gate-omotac-'));
  lockPath = join(dir, 'lekta-gate.lock');
  measurementPath = join(dir, 'mjerenje.json');
  seenPath = join(dir, 'vidjeno.json');
  writeMeasurement();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('with-gate-lock: argumenti', () => {
  it('parsira oznaku, --env parove i naredbu iza --', () => {
    expect(parseWrapperArgs(['check', '--', 'npm', 'run', 'check:inner'])).toEqual({
      label: 'check', extraEnv: {}, command: ['npm', 'run', 'check:inner'],
    });
    expect(parseWrapperArgs(['ux', '--env', 'A=1', '--env', 'B=x=y', '--', 'playwright', 'test'])).toEqual({
      label: 'ux', extraEnv: { A: '1', B: 'x=y' }, command: ['playwright', 'test'],
    });
    expect(parseWrapperArgs(['check'])).toBeNull();
    expect(parseWrapperArgs(['--', 'npm'])).toBeNull();
    expect(parseWrapperArgs(['check', '--'])).toBeNull();
  });

  it('joinCommand stavlja navodnike samo gdje treba', () => {
    expect(joinCommand(['npm', 'run', 'check:inner'])).toBe('npm run check:inner');
    expect(joinCommand(['node', '-e', 'process.exit(3)'])).toBe('node -e "process.exit(3)"');
    expect(joinCommand(['--only=check,conformance'])).toBe('--only=check,conformance');
  });
});

// Svaki scenarij dize dva node procesa i ljusku; na i3 stroju pod opterecenjem to zna potrajati.
describe('with-gate-lock: lock oko naredbe', { timeout: 90_000 }, () => {
  it('BASELINE uspjeh: lock je upisan za vrijeme naredbe, token predan djetetu, otpusten poslije, exit 0', () => {
    const r = runWrapper(['test-omotac', '--', ...probeCommand(0)], cleanEnv());
    expect(r.status, r.output).toBe(0);
    const s = seen();
    expect(s?.lock?.label).toBe('test-omotac');
    expect(s?.lock?.token).toBeTruthy();
    expect(s?.token).toBe(s?.lock?.token);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('pad naredbe: izlazni kod se cuva (3) i lock se SVEJEDNO otpusta', () => {
    const r = runWrapper(['test-omotac', '--', ...probeCommand(3)], cleanEnv());
    expect(r.status, r.output).toBe(3);
    expect(seen()?.lock?.label).toBe('test-omotac');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('tudji ziv lock: exit 2, naredba se ne pokrece, tudji lock ostaje netaknut', () => {
    const foreign = { pid: process.pid, startedAt: new Date().toISOString(), worktree: 'C:/tudji', label: 'check', token: 'tudji' };
    writeFileSync(lockPath, JSON.stringify(foreign));
    const r = runWrapper(['test-omotac', '--', ...probeCommand(0)], cleanEnv());
    expect(r.status, r.output).toBe(2);
    expect(r.output).toMatch(/ODBIJENO/);
    expect(r.output).toMatch(/"check" \(PID \d+, stablo C:\/tudji\)/);
    expect(seen()).toBeNull();
    expect(JSON.parse(readFileSync(lockPath, 'utf8')).token).toBe('tudji');
  });

  it('tudji vitest proces: exit 2, naredba se ne pokrece', () => {
    writeMeasurement({ processes: [{ pid: 999_991, ppid: 1, name: 'node.exe', commandLine: 'node node_modules/vitest/vitest.mjs run' }] });
    const r = runWrapper(['test-omotac', '--', ...probeCommand(0)], cleanEnv());
    expect(r.status, r.output).toBe(2);
    expect(r.output).toMatch(/tudji vitest\/playwright/);
    expect(seen()).toBeNull();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('mrtav lock: preuzima se, naredba radi, lock otpusten', () => {
    // Preuzimanje mrtvog locka je namjerno zabranjeno dok je lock mladji od minTakeoverAgeMs (5 s,
    // odluka iz pregleda T71), da se ne pregazi lock koji je druga sesija upravo napisala u uskoj
    // utrci. Zato lock ovdje mora biti star barem 10 s, i po JSON `startedAt` polju (sto
    // `lockAgeMs` stvarno cita) i po mtime/atime datoteke.
    const past = new Date(Date.now() - 10_000);
    writeFileSync(lockPath, JSON.stringify({ pid: deadPid(), startedAt: past.toISOString(), worktree: 'C:/x', label: 'stari', token: 'stari' }));
    utimesSync(lockPath, past, past);
    const r = runWrapper(['test-omotac', '--', ...probeCommand(0)], cleanEnv());
    expect(r.status, r.output).toBe(0);
    expect(seen()?.lock?.label).toBe('test-omotac');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('mrtav lock sa svjezim vremenom: NE preuzima se (mladji od praga preuzimanja)', () => {
    // Suprotnost testu iznad: isti mrtav PID, ali lock je tek napisan (svjez `startedAt`/mtime).
    // `canTakeOverLock` ga namjerno ne dira dok ne prodje minTakeoverAgeMs, pa naredba mora ostati
    // ODBIJENA (exit 2) i tudji lock netaknut.
    writeFileSync(lockPath, JSON.stringify({ pid: deadPid(), startedAt: new Date().toISOString(), worktree: 'C:/x', label: 'stari', token: 'stari' }));
    const r = runWrapper(['test-omotac', '--', ...probeCommand(0)], cleanEnv());
    expect(r.status, r.output).toBe(2);
    expect(r.output).toMatch(/mladji od \d+ ms/);
    expect(seen()).toBeNull();
    expect(existsSync(lockPath)).toBe(true);
    expect(JSON.parse(readFileSync(lockPath, 'utf8')).label).toBe('stari');
  });

  it('LEKTA_GATE_FORCE=1: NADJACANO, lock upisan preko tudjeg i otpusten', () => {
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), worktree: 'C:/tudji', label: 'check', token: 'tudji' }));
    const r = runWrapper(['test-omotac', '--', ...probeCommand(0)], cleanEnv({ LEKTA_GATE_FORCE: '1' }));
    expect(r.status, r.output).toBe(0);
    expect(r.output).toMatch(/NADJACANO/);
    expect(seen()?.lock?.label).toBe('test-omotac');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('CI: naredba radi bez locka, izlazni kod se cuva', () => {
    writeMeasurement({ freeMemBytes: 0.1 * GBYTES });
    const r = runWrapper(['test-omotac', '--', ...probeCommand(5)], cleanEnv({ CI: 'true' }));
    expect(r.status, r.output).toBe(5);
    expect(seen()?.lock).toBeNull();
    expect(r.output).toMatch(/CI/);
  });

  it('ugnijezdjeni gate s vlastitim tokenom: radi i NE otpusta roditeljev lock', () => {
    const parent = { pid: process.pid, startedAt: new Date().toISOString(), worktree: 'C:/moj', label: 'release:check', token: 'roditelj' };
    writeFileSync(lockPath, JSON.stringify(parent));
    const r = runWrapper(['check', '--', ...probeCommand(0)], cleanEnv({ LEKTA_GATE_LOCK_TOKEN: 'roditelj' }));
    expect(r.status, r.output).toBe(0);
    expect(JSON.parse(readFileSync(lockPath, 'utf8')).token).toBe('roditelj');
  });

  it('--env se predaje naredbi', () => {
    const r = runWrapper(['test-omotac', '--env', 'LEKTA_UX_ALL_BROWSERS=1', '--', ...probeCommand(0)], cleanEnv());
    expect(r.status, r.output).toBe(0);
    expect(seen()?.all).toBe('1');
  });
});

/**
 * Provjerava da `check:inner` (a) pocinje ciscenjem privremenih vitest datoteka i (b) sadrzi,
 * tim redom, svih sest koraka nekadasnjeg gatea. Ne trazi doslovni niz jer master (PR #128)
 * smije mijenjati samo prefiks; identitet koraka i njihov redoslijed ostaju obvezni.
 */
function checkInnerStepsValid(script: string): boolean {
  const prefix = 'node scripts/clean-vitest-tmp.mjs && ';
  if (!script.startsWith(prefix)) return false;
  const steps = script.slice(prefix.length).split(' && ');
  const expected = [
    'npm run check:claude-context',
    'oxlint',
    'tsc --noEmit',
    'npm run check:edge',
    'vitest run',
    'vite build',
  ];
  return steps.length === expected.length && steps.every((step, i) => step === expected[i]);
}

describe('package.json: gate skripte idu kroz omotac', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

  it.each(['check', 'test:ux', 'test:ux:dist', 'test:ux:browsers', 'release:check'])('%s pocinje omotacem sa svojom oznakom', (name) => {
    expect(pkg.scripts[name]).toMatch(new RegExp(`^node scripts/with-gate-lock\\.mjs ${name} (--env \\S+ )*-- `));
  });

  it('check:inner pocinje ciscenjem privremenih datoteka i nosi svih sest koraka nekadasnjeg gatea, tim redom', () => {
    expect(checkInnerStepsValid(pkg.scripts['check:inner']), pkg.scripts['check:inner']).toBe(true);
    expect(pkg.scripts.check).toBe('node scripts/with-gate-lock.mjs check -- npm run check:inner');
  });

  it('MUTACIJA: check:inner bez jednog koraka obara provjeru koraka', () => {
    const mutated = pkg.scripts['check:inner'].replace(' && vitest run', '');
    expect(mutated).not.toBe(pkg.scripts['check:inner']);
    expect(checkInnerStepsValid(mutated)).toBe(false);
  });

  it('MUTACIJA: check:inner s premjestenim koracima obara provjeru redoslijeda', () => {
    const steps = pkg.scripts['check:inner'].replace('node scripts/clean-vitest-tmp.mjs && ', '').split(' && ');
    const reordered = [...steps].reverse();
    const mutated = `node scripts/clean-vitest-tmp.mjs && ${reordered.join(' && ')}`;
    expect(mutated).not.toBe(pkg.scripts['check:inner']);
    expect(checkInnerStepsValid(mutated)).toBe(false);
  });

  it('MUTACIJA: check:inner bez prefiksa za ciscenje obara provjeru', () => {
    const mutated = pkg.scripts['check:inner'].replace('node scripts/clean-vitest-tmp.mjs && ', '');
    expect(mutated).not.toBe(pkg.scripts['check:inner']);
    expect(checkInnerStepsValid(mutated)).toBe(false);
  });
});
