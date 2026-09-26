/**
 * scripts/clean-vitest-tmp.mjs: ciscenje ostataka Vitesta i WordReplica testova iz %TEMP%.
 *
 * Sve se mjeri nad `mkdtemp` korijenom, NIKAD nad stvarnim os.tmpdir(): stroj dijele druge sesije
 * i njihov zivi gate pise upravo tamo. Popis procesa se ubrizgava, pa je ishod deterministican.
 *
 * Zamka od 2026-09-26 (brisanje po mtime MAPE ubilo zivi gate: 148 unhandled errors, ENOENT
 * ...\Temp\<nanoid>\web\<sha1>, 466 umjesto 613 test datoteka) ima vlastiti test koji PRVO dokazuje
 * da fixtura stvarno proizvodi tu klasu ulaza (mtime mape star, datoteka unutra svjeza), a tek onda
 * tvrdi da je skripta ne brise.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  executePlan,
  isDirectChildOf,
  parseArgs,
  parsePsOutput,
  parseWindowsProcesses,
  planCleanup,
  runCli,
  runnerGuard,
} from '../scripts/clean-vitest-tmp.mjs';

type Proc = { pid: number; ppid: number | null; name?: string | null; command: string | null };

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);
const THRESHOLD = 2 * HOUR;
const SELF = 4242;
/** Tocno 21 znak iz [A-Za-z0-9_-]. */
const NANO_A = 'abcdefghijABCDEFGHIJ_';
const NANO_B = 'Zy9-8x7w6v5u4t3s2r1q0';
const NANO_C = 'QQQQQQQQQQQQQQQQQQQQQ';
/** Mirno stanje stroja: samo npm ljuska ovog runa, nijedan runner. */
const QUIET: Proc[] = [{ pid: 7, ppid: 1, name: 'node.exe', command: 'node npm-cli.js run check' }];
/** Stvarni oblik naredbenih redaka izmjeren na vlasnikovom stroju 2026-09-26 (CIM upit). */
const VITEST_CMD = '"node" "C:\\Users\\PC\\Desktop\\Lekta\\node_modules\\.bin\\\\..\\vitest\\vitest.mjs" run tests/x.test.ts';
const PLAYWRIGHT_TEST_SERVER =
  '"C:\\Program Files\\nodejs\\node.EXE" node_modules\\@playwright\\test\\cli.js test-server -c playwright.config.ts --host 127.0.0.1';

let root = '';

function setTime(path: string, ms: number): void {
  utimesSync(path, ms / 1000, ms / 1000);
}

/** Vitest oblik: <root>/<name>/<sub>/<sha1>; svi mtimeovi postavljeni na `ageMs` unatrag. */
function makeVitestDir(name: string, ageMs: number, subs: string[] = ['web']): string {
  const dir = join(root, name);
  for (const sub of subs) {
    mkdirSync(join(dir, sub), { recursive: true });
    const f = join(dir, sub, 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
    writeFileSync(f, 'export default 1;\n');
    setTime(f, NOW - ageMs);
    setTime(join(dir, sub), NOW - ageMs);
  }
  setTime(dir, NOW - ageMs);
  return dir;
}

function plan(listProcesses: () => Proc[] | null = () => QUIET) {
  return planCleanup({ root, nowMs: NOW, thresholdMs: THRESHOLD, listProcesses, selfPid: SELF });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lekta-clean-tmp-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('clean-vitest-tmp: sto se brise', () => {
  it('brise nanoid/web mapu cija je najnovija datoteka starija od praga', () => {
    const dir = makeVitestDir(NANO_A, 3 * HOUR);
    const p = plan();
    expect(p.blocked).toBeNull();
    expect(p.remove.map((i) => i.path)).toEqual([dir]);
    const res = executePlan(p);
    expect(res.removed).toBe(1);
    expect(existsSync(dir)).toBe(false);
  });

  it('brise staru mapu sa ssr i web podmapama', () => {
    const dir = makeVitestDir(NANO_B, 5 * HOUR, ['web', 'ssr']);
    executePlan(plan());
    expect(existsSync(dir)).toBe(false);
  });

  it('brise stari word-replica-tests-* bez obzira na sadrzaj, i prazan', () => {
    const full = join(root, 'word-replica-tests-abc123');
    mkdirSync(join(full, 'nesto'), { recursive: true });
    writeFileSync(join(full, 'nesto', 'out.docx'), 'x');
    setTime(join(full, 'nesto', 'out.docx'), NOW - 4 * HOUR);
    setTime(join(full, 'nesto'), NOW - 4 * HOUR);
    setTime(full, NOW - 4 * HOUR);
    const empty = join(root, 'word-replica-tests-empty');
    mkdirSync(empty);
    setTime(empty, NOW - 4 * HOUR);
    executePlan(plan());
    expect(existsSync(full)).toBe(false);
    expect(existsSync(empty)).toBe(false);
  });

  it('zbraja bajtove obrisanog', () => {
    makeVitestDir(NANO_A, 3 * HOUR);
    const res = executePlan(plan());
    expect(res.removedBytes).toBe('export default 1;\n'.length);
  });
});

describe('clean-vitest-tmp: zamka od 2026-09-26 (starost po datotekama, ne po mapi)', () => {
  it('fixtura proizvodi klasu ulaza: mtime mape star, datoteka unutra svjeza', () => {
    const dir = makeVitestDir(NANO_A, 10 * HOUR);
    const fresh = join(dir, 'web', 'ffffffffffffffffffffffffffffffffffffffff');
    writeFileSync(fresh, 'svjeze');
    setTime(fresh, NOW - 60_000);
    // Pisanje u web/ mijenja mtime web/, ne i korijena; vrati i web/ na staro, kao u stvarnoj zamci
    // gdje Vitest prepisuje postojece sha1 datoteke.
    setTime(join(dir, 'web'), NOW - 10 * HOUR);
    setTime(dir, NOW - 10 * HOUR);
    // Naivno pravilo (mtime mape) bi je obrisalo: to je tocno kvar od 26. 9.
    expect(NOW - statSync(dir).mtimeMs).toBeGreaterThanOrEqual(THRESHOLD);
    expect(NOW - statSync(join(dir, 'web')).mtimeMs).toBeGreaterThanOrEqual(THRESHOLD);
    expect(NOW - statSync(fresh).mtimeMs).toBeLessThan(THRESHOLD);

    const p = plan();
    expect(p.remove).toEqual([]);
    expect(p.young.map((i) => i.path)).toEqual([dir]);
    executePlan(p);
    expect(existsSync(fresh)).toBe(true);
  });

  it('svjeza datoteka duboko u podstablu takodjer cuva mapu', () => {
    const dir = makeVitestDir(NANO_A, 10 * HOUR);
    const deep = join(dir, 'web', 'a', 'b');
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(deep, 'x'), '1');
    setTime(join(deep, 'x'), NOW - 5_000);
    for (const d of [deep, join(dir, 'web', 'a'), join(dir, 'web'), dir]) setTime(d, NOW - 10 * HOUR);
    executePlan(plan());
    expect(existsSync(join(deep, 'x'))).toBe(true);
  });
});

describe('clean-vitest-tmp: sto se NE dira', () => {
  it('ne dira mladu mapu', () => {
    const dir = makeVitestDir(NANO_A, 30 * 60_000);
    const p = plan();
    expect(p.young.map((i) => i.path)).toEqual([dir]);
    executePlan(p);
    expect(existsSync(dir)).toBe(true);
  });

  it('ne dira ime od 20 ni od 22 znaka ni ime s nedopustenim znakom', () => {
    const d20 = makeVitestDir(NANO_A.slice(0, 20), 9 * HOUR);
    const d22 = makeVitestDir(NANO_A + 'x', 9 * HOUR);
    const dDot = makeVitestDir('abcdefghij.BCDEFGHIJ_', 9 * HOUR);
    const p = plan();
    expect(p.remove).toEqual([]);
    executePlan(p);
    for (const d of [d20, d22, dDot]) expect(existsSync(d)).toBe(true);
  });

  it('ne dira nanoid mapu bez web/ssr (druga podmapa, prazna, ili datoteka)', () => {
    const other = makeVitestDir(NANO_A, 9 * HOUR, ['cache']);
    const empty = join(root, NANO_B);
    mkdirSync(empty);
    setTime(empty, NOW - 9 * HOUR);
    const withFile = join(root, NANO_C);
    mkdirSync(withFile);
    writeFileSync(join(withFile, 'web'), 'datoteka a ne mapa');
    setTime(join(withFile, 'web'), NOW - 9 * HOUR);
    setTime(withFile, NOW - 9 * HOUR);
    const p = plan();
    expect(p.remove).toEqual([]);
    expect(p.refused.map((r) => r.path).sort()).toEqual([other, empty, withFile].sort());
    executePlan(p);
    for (const d of [other, empty, withFile]) expect(existsSync(d)).toBe(true);
  });

  it('ne dira nanoid mapu koja uz web ima jos nesto', () => {
    const dir = makeVitestDir(NANO_A, 9 * HOUR);
    writeFileSync(join(dir, 'README'), 'tudje');
    setTime(join(dir, 'README'), NOW - 9 * HOUR);
    setTime(dir, NOW - 9 * HOUR);
    const p = plan();
    expect(p.remove).toEqual([]);
    executePlan(p);
    expect(existsSync(join(dir, 'web'))).toBe(true);
  });

  it('ne dira obicnu datoteku s nanoid imenom ni tudje mape', () => {
    writeFileSync(join(root, NANO_A), 'datoteka');
    setTime(join(root, NANO_A), NOW - 9 * HOUR);
    mkdirSync(join(root, 'npm-cache-foo'));
    setTime(join(root, 'npm-cache-foo'), NOW - 9 * HOUR);
    const p = plan();
    expect(p.remove).toEqual([]);
    expect(p.refused).toEqual([]);
    executePlan(p);
    expect(existsSync(join(root, NANO_A))).toBe(true);
    expect(existsSync(join(root, 'npm-cache-foo'))).toBe(true);
  });

  it('preskace mapu s vise unosa od gornje granice', () => {
    const dir = makeVitestDir(NANO_A, 9 * HOUR);
    for (let i = 0; i < 5; i++) {
      const f = join(dir, 'web', `f${i}`);
      writeFileSync(f, '1');
      setTime(f, NOW - 9 * HOUR);
    }
    setTime(join(dir, 'web'), NOW - 9 * HOUR);
    const p = planCleanup({
      root, nowMs: NOW, thresholdMs: THRESHOLD, listProcesses: () => QUIET, selfPid: SELF, maxEntries: 3,
    });
    expect(p.remove).toEqual([]);
    expect(p.refused[0]?.reason).toMatch(/vise od 3 unosa/);
    // Baseline: s dovoljnom granicom ista mapa ide u brisanje.
    expect(plan().remove.map((i) => i.path)).toEqual([dir]);
  });
});

describe('clean-vitest-tmp: putanja izvan korijena', () => {
  it('isDirectChildOf prihvaca samo izravno dijete', () => {
    expect(isDirectChildOf(root, join(root, NANO_A))).toBe(true);
    expect(isDirectChildOf(root, root)).toBe(false);
    expect(isDirectChildOf(root, join(root, NANO_A, 'web'))).toBe(false);
    expect(isDirectChildOf(root, join(root, '..', NANO_A))).toBe(false);
    expect(isDirectChildOf(root, resolve(root + 'x', NANO_A))).toBe(false);
  });

  it('executePlan odbija podmetnutu putanju izvan korijena i ne brise je', () => {
    const outside = mkdtempSync(join(tmpdir(), 'lekta-clean-tmp-outside-'));
    try {
      const victim = join(outside, NANO_A);
      mkdirSync(join(victim, 'web'), { recursive: true });
      const p = plan();
      p.remove.push({ path: victim, kind: 'vitest', newestMs: 0, bytes: 0 });
      const calls: string[] = [];
      const res = executePlan(p, { rm: (path: string) => { calls.push(path); } });
      expect(calls).toEqual([]);
      expect(res.removed).toBe(0);
      expect(res.refused.map((r) => r.path)).toEqual([victim]);
      expect(existsSync(victim)).toBe(true);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('clean-vitest-tmp: zivi procesi (nepoznato = ne brisi)', () => {
  it('baseline: mirno stanje brise staru mapu', () => {
    makeVitestDir(NANO_A, 3 * HOUR);
    expect(plan().remove).toHaveLength(1);
  });

  it('ziv vitest proces zadrzava nanoid mapu (u held, ne u remove) i nista ne brise', () => {
    const dir = makeVitestDir(NANO_A, 9 * HOUR);
    const procs: Proc[] = [...QUIET, { pid: 900, ppid: 1, name: 'node.exe', command: VITEST_CMD }];
    const p = plan(() => procs);
    expect(p.blocked).toBeNull();
    expect(p.guards.vitest).toMatchObject({ ok: false, reason: expect.stringMatching(/radi 1 vitest proces/) });
    expect(p.remove).toEqual([]);
    expect(p.held.map((h) => h.path)).toEqual([dir]);
    const res = executePlan(p);
    expect(res.removed).toBe(0);
    expect(existsSync(dir)).toBe(true);
  });

  it('nalaz 26. 9.: trajni Playwright test-server (roditelj Code.exe) NE blokira staru nanoid mapu', () => {
    const dir = makeVitestDir(NANO_A, 9 * HOUR);
    const pw: Proc[] = [
      ...QUIET,
      { pid: 11496, ppid: 1, name: 'Code.exe', command: '"C:\\Users\\PC\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"' },
      { pid: 3176, ppid: 11496, name: 'node.exe', command: PLAYWRIGHT_TEST_SERVER },
    ];
    const p = plan(() => pw);
    expect(p.blocked).toBeNull();
    expect(p.guards.vitest).toEqual({ ok: true });
    expect(p.held).toEqual([]);
    expect(p.remove.map((i) => i.path)).toEqual([dir]);
    executePlan(p);
    expect(existsSync(dir)).toBe(false);

    // Isti popis uz ziv vitest blokira: razlika je SAMO vitest proces, ne Playwright.
    const dir2 = makeVitestDir(NANO_B, 9 * HOUR);
    const sVitestom: Proc[] = [...pw, { pid: 16524, ppid: 1, name: 'node.exe', command: VITEST_CMD }];
    const p2 = plan(() => sVitestom);
    expect(p2.remove).toEqual([]);
    expect(p2.held.map((h) => h.path)).toEqual([dir2]);
    executePlan(p2);
    expect(existsSync(dir2)).toBe(true);
  });

  it('gard je po vrsti: pytest cuva word-replica mapu, ne i nanoid; vitest obrnuto', () => {
    const nano = makeVitestDir(NANO_A, 9 * HOUR);
    const word = join(root, 'word-replica-tests-_2uj9491');
    mkdirSync(word);
    setTime(word, NOW - 9 * HOUR);

    const sPytestom: Proc[] = [
      ...QUIET,
      { pid: 800, ppid: 1, name: 'python.exe', command: 'python -m pytest tests/e2e -k word_replica' },
    ];
    const p = plan(() => sPytestom);
    expect(p.guards['word-replica']).toMatchObject({ ok: false });
    expect(p.guards.vitest).toEqual({ ok: true });
    expect(p.remove.map((i) => i.path)).toEqual([nano]);
    expect(p.held.map((h) => h.path)).toEqual([word]);

    const sVitestom: Proc[] = [...QUIET, { pid: 900, ppid: 1, name: 'node.exe', command: VITEST_CMD }];
    const q = plan(() => sVitestom);
    expect(q.remove.map((i) => i.path)).toEqual([word]);
    expect(q.held.map((h) => h.path)).toEqual([nano]);
  });

  it('word_replica runner bez pytesta takodjer cuva word-replica mapu; Python bez njih ne', () => {
    const wr: Proc[] = [
      ...QUIET,
      { pid: 801, ppid: 1, name: 'python.exe', command: 'python -m word_replica.runner verify x.docx' },
    ];
    expect(runnerGuard(wr, SELF, 'word-replica').ok).toBe(false);
    const drugi: Proc[] = [...QUIET, { pid: 802, ppid: 1, name: 'python.exe', command: 'python scripts/corpus-oracle.py' }];
    expect(runnerGuard(drugi, SELF, 'word-replica').ok).toBe(true);
    // Code.exe s pytest u retku nije Python proces, pa ne blokira kad popis nosi ime.
    const code: Proc[] = [...QUIET, { pid: 803, ppid: 1, name: 'Code.exe', command: 'code --folder pytest' }];
    expect(runnerGuard(code, SELF, 'word-replica').ok).toBe(true);
  });

  it('ne brise nista kad je popis procesa null', () => {
    const dir = makeVitestDir(NANO_A, 9 * HOUR);
    const p = plan(() => null);
    expect(p.blocked).toMatch(/nije izmjeren/);
    executePlan(p);
    expect(existsSync(dir)).toBe(true);
  });

  it('ne brise nista kad mjerenje procesa baci', () => {
    const dir = makeVitestDir(NANO_A, 9 * HOUR);
    const p = plan(() => { throw new Error('powershell nedostupan'); });
    expect(p.blocked).not.toBeNull();
    executePlan(p);
    expect(existsSync(dir)).toBe(true);
  });

  it('ne brise nista kad naredbeni redak Node procesa nije citljiv', () => {
    const procs: Proc[] = [...QUIET, { pid: 901, ppid: 1, name: 'node.exe', command: null }];
    expect(runnerGuard(procs, SELF, 'vitest').ok).toBe(false);
    const dir = makeVitestDir(NANO_A, 9 * HOUR);
    const p = plan(() => procs);
    expect(p.remove).toEqual([]);
    expect(p.held.map((h) => h.path)).toEqual([dir]);
    // Necitljiv Python proces cini nepoznatom word-replica vrstu.
    const py: Proc[] = [...QUIET, { pid: 904, ppid: 1, name: 'python.exe', command: null }];
    expect(runnerGuard(py, SELF, 'word-replica').ok).toBe(false);
    expect(runnerGuard(py, SELF, 'vitest').ok).toBe(true);
  });

  it('gleda samo Node procese kad popis nosi ime procesa', () => {
    const g = runnerGuard(
      [...QUIET, { pid: 902, ppid: 1, name: 'Code.exe', command: 'code tests/vitest.config.ts' }],
      SELF,
      'vitest',
    );
    expect(g.ok).toBe(true);
    const bez = runnerGuard([...QUIET, { pid: 902, ppid: 1, command: 'sh -c vitest run' }], SELF, 'vitest');
    expect(bez.ok).toBe(false);
  });

  it('iskljucuje vlastiti proces i ljusku npm run check koja pokrece ovu skriptu', () => {
    const shell = 'sh -c "node scripts/clean-vitest-tmp.mjs && oxlint && vitest run && vite build"';
    const procs: Proc[] = [
      { pid: 50, ppid: 1, command: 'node npm-cli.js run check' },
      { pid: 60, ppid: 50, command: shell },
      { pid: SELF, ppid: 60, command: 'node scripts/clean-vitest-tmp.mjs' },
    ];
    expect(runnerGuard(procs, SELF, 'vitest').ok).toBe(true);
    // Mutacija: ista ljuska koja NIJE nas predak (druga sesija) blokira.
    const tudja: Proc[] = [...procs, { pid: 70, ppid: 1, command: shell }];
    expect(runnerGuard(tudja, SELF, 'vitest').ok).toBe(false);
    // Mutacija: predak koji je sam vitest ne iskljucuje se.
    const vitestPredak: Proc[] = [
      { pid: 60, ppid: 1, command: 'node node_modules/vitest/vitest.mjs run' },
      { pid: SELF, ppid: 60, command: 'node scripts/clean-vitest-tmp.mjs' },
    ];
    expect(runnerGuard(vitestPredak, SELF, 'vitest').ok).toBe(false);
  });
});

describe('clean-vitest-tmp: dry-run, greske i izlazni kod', () => {
  it('dry-run ne brise, ali broji', () => {
    const dir = makeVitestDir(NANO_A, 9 * HOUR);
    const res = executePlan(plan(), { dryRun: true });
    expect(res.dryRun).toBe(true);
    expect(res.removed).toBe(1);
    expect(existsSync(dir)).toBe(true);
  });

  it('EBUSY i EPERM se zbrajaju, ne bacaju', () => {
    makeVitestDir(NANO_A, 9 * HOUR);
    makeVitestDir(NANO_B, 9 * HOUR);
    makeVitestDir(NANO_C, 9 * HOUR);
    let n = 0;
    const codes = ['EBUSY', 'EPERM', 'EBUSY'];
    const rm = (): void => {
      const err = new Error('zauzeto') as Error & { code: string };
      err.code = codes[n++] ?? 'EBUSY';
      throw err;
    };
    const res = executePlan(plan(), { rm });
    expect(res.removed).toBe(0);
    expect(res.errorCounts).toEqual({ EBUSY: 2, EPERM: 1 });
  });

  it('parseArgs: prag, dry-run i neispravni argumenti', () => {
    expect(parseArgs([])).toEqual({ dryRun: false, olderThanHours: 2, error: null });
    expect(parseArgs(['--dry-run', '--older-than-hours=6'])).toEqual({ dryRun: true, olderThanHours: 6, error: null });
    expect(parseArgs(['--older-than-hours=0']).error).not.toBeNull();
    expect(parseArgs(['--older-than-hours=abc']).error).not.toBeNull();
    expect(parseArgs(['--rm-rf']).error).not.toBeNull();
  });

  it('neispravan prag u planu blokira brisanje', () => {
    const dir = makeVitestDir(NANO_A, 9 * HOUR);
    const p = planCleanup({ root, nowMs: NOW, thresholdMs: 0, listProcesses: () => QUIET, selfPid: SELF });
    expect(p.blocked).not.toBeNull();
    executePlan(p);
    expect(existsSync(dir)).toBe(true);
  });

  it('parsira CIM JSON (niz i pojedinacni objekt) i ps izlaz; smece daje null', () => {
    const arr = parseWindowsProcesses(
      '[{"ProcessId":1,"ParentProcessId":0,"Name":"node.exe","CommandLine":"node x"},{"ProcessId":2,"ParentProcessId":1,"Name":"System","CommandLine":null}]',
    );
    expect(arr).toEqual([
      { pid: 1, ppid: 0, name: 'node.exe', command: 'node x' },
      { pid: 2, ppid: 1, name: 'System', command: null },
    ]);
    expect(parseWindowsProcesses('{"ProcessId":3,"ParentProcessId":1,"Name":"node.exe","CommandLine":"a"}')).toHaveLength(1);
    expect(parseWindowsProcesses('nije json')).toBeNull();
    expect(parseWindowsProcesses('')).toBeNull();
    expect(parsePsOutput('  1     0 /sbin/init\r\n 42 1 node vitest.mjs run\n')).toEqual([
      { pid: 1, ppid: 0, command: '/sbin/init' },
      { pid: 42, ppid: 1, command: 'node vitest.mjs run' },
    ]);
    expect(parsePsOutput('')).toBeNull();
  });

  /**
   * Dry-run grana CLI toka, deterministicki: popis procesa je ubrizgan (mirno stanje), pa ishod ne
   * ovisi o tome radi li na stroju Vitest. Ranija inacica je spawnala skriptu i zbog Vitest fork
   * workera kao pretka uvijek prolazila kroz granu blokiranja, a tvrdila je dry-run.
   */
  it('CLI tok (runCli) u dry-runu ispisuje sto BI obrisao i nista ne brise', () => {
    const dir = makeVitestDir(NANO_A, 9 * HOUR);
    const lines: string[] = [];
    const rmCalls: string[] = [];
    runCli({
      argv: ['--dry-run'],
      root,
      nowMs: NOW,
      listProcesses: () => QUIET,
      selfPid: SELF,
      log: (l: string) => lines.push(l),
      rm: (p: string) => { rmCalls.push(p); },
    });
    const out = lines.join('\n');
    expect(out).not.toMatch(/nista nije obrisano, razlog/);
    expect(out).toContain('bi se obrisalo (dry-run): 1 mapa');
    expect(out).toContain('zadrzano zbog zivih procesa: 0 mapa');
    expect(rmCalls).toEqual([]);
    expect(existsSync(dir)).toBe(true);

    // Baseline iste grane bez dry-runa: ista mapa se stvarno brise, pa gornja tvrdnja nije vakuumska.
    const lines2: string[] = [];
    runCli({ argv: [], root, nowMs: NOW, listProcesses: () => QUIET, selfPid: SELF, log: (l: string) => lines2.push(l) });
    expect(lines2.join('\n')).toContain('obrisano: 1 mapa');
    expect(existsSync(dir)).toBe(false);
  });

  it('CLI tok uz ziv vitest ispisuje razlog po vrsti i zadrzanu mapu', () => {
    const dir = makeVitestDir(NANO_A, 9 * HOUR);
    const lines: string[] = [];
    runCli({
      argv: ['--dry-run'],
      root,
      nowMs: NOW,
      listProcesses: () => [...QUIET, { pid: 900, ppid: 1, name: 'node.exe', command: VITEST_CMD }],
      selfPid: SELF,
      log: (l: string) => lines.push(l),
    });
    const out = lines.join('\n');
    expect(out).toMatch(/vitest: ne brisem, radi 1 vitest proces/);
    expect(out).toContain('bi se obrisalo (dry-run): 0 mapa');
    expect(out).toContain('zadrzano zbog zivih procesa: 1 mapa');
    expect(existsSync(dir)).toBe(true);
  });

  it('ulazna tocka izlazi s 0 uz neispravan argument i nista ne brise', () => {
    // Ova grana izlazi PRIJE mjerenja procesa, pa ne ovisi o stanju stroja.
    const dir = makeVitestDir(NANO_A, 9 * HOUR);
    const script = join(import.meta.dirname, '..', 'scripts', 'clean-vitest-tmp.mjs');
    const env = { ...process.env, TEMP: root, TMP: root, TMPDIR: root };
    const bad = spawnSync(process.execPath, [script, '--older-than-hours=-1'], { env, encoding: 'utf8', timeout: 90_000 });
    expect(bad.status).toBe(0);
    expect(bad.stdout).toMatch(/neispravan --older-than-hours: --older-than-hours=-1; nista nije obrisano/);
    expect(existsSync(dir)).toBe(true);
  }, 120_000);
});
