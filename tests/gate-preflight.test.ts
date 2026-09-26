// @vitest-environment node
/**
 * Gate preflight (T62, pravila za stroj): `judgeGate` je cista presuda nad izmjerenim stanjem, pa
 * se ovdje stanje podmece i nijedan test ne dira pravi `%TEMP%\lekta-gate.lock` ni procese stroja.
 * Datotecni dio (lock upis/otpustanje) radi nad privremenom stazom.
 *
 * Isti modul nosi i provjeru Playwright projekata (lokalno samo Chromium motor), jer su oba dio
 * istog pravila: jedan gate na i3 stroju s 2 jezgre ne smije trostruko trositi preglednike.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  GB,
  THRESHOLDS,
  acquireGate,
  canTakeOverLock,
  foreignTestProcesses,
  isCiEnv,
  isTestRunnerCommand,
  judgeGate,
  lockFilePath,
  lockStatus,
  ownProcessTree,
  parseProcessJson,
  parsePsOutput,
  parseWmicCsv,
  readLock,
  releaseLock,
  writeLock,
} from '../scripts/gate-preflight.mjs';
import { ALL_UX_PROJECTS, CHROMIUM_ENGINE_PROJECTS, selectUxProjects } from '../playwright.config';

const NOW = Date.parse('2026-09-26T12:00:00Z');

type State = Parameters<typeof judgeGate>[0];

function freeState(overrides: Partial<State> = {}): State {
  return {
    nowMs: NOW,
    lockPath: 'nebitno',
    lock: null,
    lockAlive: null,
    foreignTestProcesses: [],
    claudeProcessCount: 1,
    freeMemBytes: 4 * GB,
    freeDiskBytes: 40 * GB,
    worktree: 'C:/wt/ovaj',
    injected: false,
    ...overrides,
  } as State;
}

function foreignLock(minutesAgo: number, extra: Record<string, unknown> = {}) {
  return {
    pid: 4242,
    startedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
    worktree: 'C:/wt/tudji',
    label: 'check',
    token: 'tudji-token',
    corrupt: false,
    ...extra,
  };
}

describe('judgeGate: cista presuda', () => {
  it('BASELINE: slobodan stroj propusta i trazi upis locka', () => {
    const v = judgeGate(freeState());
    expect(v.allow).toBe(true);
    expect(v.mode).toBe('free');
    expect(v.writeLock).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it('tudji lock s zivim PID-om: odbija i kaze tko drzi i koliko dugo', () => {
    const v = judgeGate(freeState({ lock: foreignLock(12), lockAlive: true }));
    expect(v.allow).toBe(false);
    expect(v.mode).toBe('refused');
    expect(v.reasons.join(' ')).toMatch(/"check" \(PID 4242, stablo C:\/wt\/tudji\) vec 12 min/);
  });

  it('lock s mrtvim PID-om: propusta, preuzima lock i upozorava', () => {
    const v = judgeGate(freeState({ lock: foreignLock(12), lockAlive: false }));
    expect(v.allow).toBe(true);
    expect(v.writeLock).toBe(true);
    expect(v.warnings.join(' ')).toMatch(/mrtav lock/);
  });

  it('PID neprovjerljiv: lock mladji od 3 h je ziv, stariji je mrtav', () => {
    expect(judgeGate(freeState({ lock: foreignLock(179), lockAlive: null })).allow).toBe(false);
    const stale = judgeGate(freeState({ lock: foreignLock(181), lockAlive: null }));
    expect(stale.allow).toBe(true);
    expect(stale.warnings.join(' ')).toMatch(/stariji od 3 h/);
  });

  it('nerazumljiv lock bez vremena i PID-a: zastario, ne vjecna blokada', () => {
    const lock = { pid: null, startedAt: null, worktree: null, label: null, token: null, corrupt: true };
    expect(lockStatus(freeState({ lock, lockAlive: null }))).toBe('stale');
    expect(judgeGate(freeState({ lock, lockAlive: null })).allow).toBe(true);
  });

  it('tudji vitest proces: odbija (bez obzira na slobodan lock)', () => {
    const v = judgeGate(freeState({
      foreignTestProcesses: [{ pid: 8524, commandLine: 'node C:/x/node_modules/vitest/vitest.mjs run' }],
    }));
    expect(v.allow).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/PID 8524/);
  });

  it('RAM ispod 1,5 GB: odbija; tocno na pragu propusta', () => {
    expect(judgeGate(freeState({ freeMemBytes: 1.49 * GB })).allow).toBe(false);
    expect(judgeGate(freeState({ freeMemBytes: 1.49 * GB })).reasons.join(' ')).toMatch(/RAM/);
    expect(judgeGate(freeState({ freeMemBytes: THRESHOLDS.minFreeMemBytes })).allow).toBe(true);
  });

  it('disk ispod 3 GB: odbija; tocno na pragu propusta', () => {
    expect(judgeGate(freeState({ freeDiskBytes: 2.9 * GB })).allow).toBe(false);
    expect(judgeGate(freeState({ freeDiskBytes: 2.9 * GB })).reasons.join(' ')).toMatch(/disk/);
    expect(judgeGate(freeState({ freeDiskBytes: THRESHOLDS.minFreeDiskBytes })).allow).toBe(true);
  });

  it('LEKTA_GATE_FORCE: propusta uz NADJACANO i svejedno upisuje lock', () => {
    const blocked = freeState({ lock: foreignLock(5), lockAlive: true, freeMemBytes: 0.5 * GB });
    const v = judgeGate(blocked, { force: true });
    expect(v.allow).toBe(true);
    expect(v.mode).toBe('forced');
    expect(v.writeLock).toBe(true);
    expect(v.reasons[0]).toMatch(/NADJACANO/);
    // Razlozi se ne gube: nadjacano znaci "znam i svejedno", ne "nista nije bilo".
    expect(v.reasons.join(' ')).toMatch(/RAM/);
  });

  it('CI: propusta bez locka i samo biljezi mjerenja', () => {
    const blocked = freeState({ lock: foreignLock(5), lockAlive: true, freeMemBytes: 0.5 * GB });
    const v = judgeGate(blocked, { ci: true });
    expect(v.allow).toBe(true);
    expect(v.mode).toBe('ci');
    expect(v.writeLock).toBe(false);
    expect(v.reasons.every((r) => r.startsWith('(CI, ne blokira)'))).toBe(true);
  });

  it('null mjerenja (procesi, RAM, disk): upozorenje, ne blokada', () => {
    const v = judgeGate(freeState({ foreignTestProcesses: null, freeMemBytes: null, freeDiskBytes: null }));
    expect(v.allow).toBe(true);
    expect(v.reasons).toEqual([]);
    expect(v.warnings.join(' ')).toMatch(/nisu izmjereni/);
    expect(v.warnings.join(' ')).toMatch(/RAM nije izmjeren/);
    expect(v.warnings.join(' ')).toMatch(/disk nije izmjeren/);
  });

  it('ugnijezdjeni gate s vlastitim tokenom ne blokira sam sebe i ne upisuje novi lock', () => {
    const own = foreignLock(5, { token: 'moj-token', label: 'release:check' });
    const v = judgeGate(freeState({ lock: own, lockAlive: true }), { heldToken: 'moj-token' });
    expect(v.allow).toBe(true);
    expect(v.mode).toBe('nested');
    expect(v.writeLock).toBe(false);
    // Drugi token nije nas lock.
    expect(judgeGate(freeState({ lock: own, lockAlive: true }), { heldToken: 'drugi' }).allow).toBe(false);
  });

  it('vise od 3 claude.exe procesa: upozorenje, ne blokada', () => {
    const v = judgeGate(freeState({ claudeProcessCount: 6 }));
    expect(v.allow).toBe(true);
    expect(v.warnings.join(' ')).toMatch(/vise od 3 interaktivne sesije: RAM/);
    expect(judgeGate(freeState({ claudeProcessCount: 3 })).warnings).toEqual([]);
  });

  it('isCiEnv: CI=false i CI=0 nisu CI', () => {
    expect(isCiEnv({ CI: 'true' })).toBe(true);
    expect(isCiEnv({ CI: '1' })).toBe(true);
    expect(isCiEnv({ CI: 'false' })).toBe(false);
    expect(isCiEnv({ CI: '0' })).toBe(false);
    expect(isCiEnv({})).toBe(false);
  });
});

describe('prepoznavanje procesa', () => {
  // Doslovni naredbeni redci izmjereni na ovom stroju 2026-09-26 (Get-CimInstance Win32_Process).
  const MEASURED = {
    vitestBin: '"node"   "C:\\Users\\PC\\.codex\\worktrees\\x\\Lekta\\node_modules\\.bin\\\\..\\vitest\\vitest.mjs" run',
    npxVitest: '"C:\\Program Files\\nodejs\\node.exe" "C:\\Program Files\\nodejs/node_modules/npm/bin/npx-cli.js" vitest run tests/a.test.ts',
    tinypool: '"C:\\Program Files\\nodejs\\node.exe" --conditions development --conditions node C:\\Users\\PC\\Desktop\\Lekta\\node_modules\\tinypool\\dist\\entry\\process.js',
    pwTestServer: '"C:\\Program Files\\nodejs\\node.EXE" node_modules\\@playwright\\test\\cli.js test-server -c playwright.config.ts --host 127.0.0.1',
    npmCheck: '"C:\\Program Files\\nodejs\\node.exe" "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" run check',
  };

  it('vitest kroz .bin i kroz npx su pokretaci', () => {
    expect(isTestRunnerCommand(MEASURED.vitestBin)).toBe(true);
    expect(isTestRunnerCommand(MEASURED.npxVitest)).toBe(true);
    expect(isTestRunnerCommand('node node_modules/.bin/playwright test --project=chromium')).toBe(true);
  });

  it('npm run check, tinypool radnik i mirujuci playwright test-server nisu pokretaci', () => {
    expect(isTestRunnerCommand(MEASURED.npmCheck)).toBe(false);
    expect(isTestRunnerCommand(MEASURED.tinypool)).toBe(false);
    expect(isTestRunnerCommand(MEASURED.pwTestServer)).toBe(false);
    expect(isTestRunnerCommand('node C:/wt/wf-vitest-fix/scripts/x.mjs')).toBe(false);
    expect(isTestRunnerCommand(null)).toBe(false);
  });

  it('tekst zadatka u argumentima nije pokretac (Codex s "vitest run" u promptu, izmjereno 2026-09-26)', () => {
    const codex = '"node"   "C:\\Users\\PC\\AppData\\Roaming\\npm\\\\node_modules\\@openai\\codex\\bin\\codex.js" exec --cd C:\\Users\\PC\\lekta-wt\\x resume 01a0 "pokreni npx vitest run tests/a.test.ts i playwright test"';
    expect(isTestRunnerCommand(codex)).toBe(false);
    expect(isTestRunnerCommand('node scripts/with-gate-lock.mjs test:ux -- playwright test')).toBe(false);
    // npm exec pokrece paket kao i npx; npm run ne pokrece nista sam (dijete se broji zasebno).
    expect(isTestRunnerCommand('node C:/nodejs/node_modules/npm/bin/npm-cli.js exec vitest run')).toBe(true);
    expect(isTestRunnerCommand('node C:/nodejs/node_modules/npm/bin/npx-cli.js @playwright/test test')).toBe(true);
    expect(isTestRunnerCommand('node C:/nodejs/node_modules/npm/bin/npm-cli.js run test:ux')).toBe(false);
    // Radnik playwrighta (stvarno vrti testove) se broji.
    expect(isTestRunnerCommand('node C:/r/node_modules/playwright/lib/common/process.js')).toBe(true);
  });

  it('vlastito stablo (preci i potomci) se iskljucuje, tudji pokretac ostaje', () => {
    const processes = [
      { pid: 10, ppid: 1, name: 'cmd.exe', commandLine: null },
      { pid: 20, ppid: 10, name: 'node.exe', commandLine: 'node node_modules/vitest/vitest.mjs run' }, // predak
      { pid: 30, ppid: 20, name: 'node.exe', commandLine: 'node scripts/gate-preflight.mjs' }, // mi
      { pid: 40, ppid: 30, name: 'node.exe', commandLine: 'node node_modules/.bin/playwright test' }, // potomak
      { pid: 50, ppid: 1, name: 'node.exe', commandLine: 'node node_modules/vitest/vitest.mjs run' }, // tudji
      { pid: 60, ppid: 1, name: 'claude.exe', commandLine: 'claude.exe --prompt "pokreni vitest run"' },
    ];
    expect([...ownProcessTree(processes, 30)].sort((a, b) => a - b)).toEqual([1, 10, 20, 30, 40]);
    expect(foreignTestProcesses(processes, 30)).toEqual([{ pid: 50, commandLine: processes[4].commandLine }]);
    expect(foreignTestProcesses(null, 30)).toBeNull();
  });

  it('parseri snimka: PowerShell JSON (niz i jedan objekt), wmic CSV sa zarezom, ps', () => {
    const arr = parseProcessJson('\uFEFF[{"pid":5,"ppid":1,"name":"node.exe","cmd":"node a.js"},{"pid":6,"ppid":5,"name":"x.exe","cmd":null}]');
    expect(arr).toEqual([
      { pid: 5, ppid: 1, name: 'node.exe', commandLine: 'node a.js' },
      { pid: 6, ppid: 5, name: 'x.exe', commandLine: null },
    ]);
    expect(parseProcessJson('{"pid":7,"ppid":1,"name":"node.exe","cmd":"n"}')).toHaveLength(1);
    expect(parseProcessJson('')).toBeNull();
    expect(parseProcessJson('nije json')).toBeNull();

    const csv = '\r\nNode,CommandLine,Name,ParentProcessId,ProcessId\r\nPC,node a.js --x=1,2,node.exe,4,99\r\nPC,,System,0,4\r\n';
    expect(parseWmicCsv(csv)).toEqual([
      { pid: 99, ppid: 4, name: 'node.exe', commandLine: 'node a.js --x=1,2' },
      { pid: 4, ppid: 0, name: 'System', commandLine: null },
    ]);
    expect(parsePsOutput('  12     1 /usr/bin/node /x/vitest.mjs run\n')).toEqual([
      { pid: 12, ppid: 1, name: 'node', commandLine: '/usr/bin/node /x/vitest.mjs run' },
    ]);
  });
});

describe('lock datoteka (privremena staza, nikad pravi %TEMP% lock)', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('LEKTA_GATE_LOCK_PATH preusmjerava lock; bez njega je lekta-gate.lock', () => {
    expect(lockFilePath({ LEKTA_GATE_LOCK_PATH: 'C:/x/moj.lock' })).toBe('C:/x/moj.lock');
    expect(lockFilePath({ LOCALAPPDATA: 'C:/Users/PC/AppData/Local' }).replace(/\\/g, '/')).toMatch(/lekta-gate\.lock$/);
  });

  it('wx upis ne gazi postojeci lock; otpusta se samo vlastiti', () => {
    dir = mkdtempSync(join(tmpdir(), 'lekta-gate-test-'));
    const path = join(dir, 'lekta-gate.lock');
    const record = { pid: 1, startedAt: new Date(NOW).toISOString(), worktree: 'w', label: 'check', token: 'A' };
    expect(writeLock(path, record)).toBe(true);
    expect(writeLock(path, { ...record, token: 'B' })).toBe(false);
    expect(readLock(path)?.token).toBe('A');

    expect(releaseLock(path, { token: 'B' })).toBe('foreign');
    expect(readLock(path)?.token).toBe('A');
    expect(releaseLock(path, { token: 'A' })).toBe('released');
    expect(readLock(path)).toBeNull();
    expect(releaseLock(path, { token: 'A' })).toBe('absent');
  });

  it('nerazumljiv sadrzaj nije "nema locka"', () => {
    dir = mkdtempSync(join(tmpdir(), 'lekta-gate-test-'));
    const path = join(dir, 'lekta-gate.lock');
    writeFileSync(path, '{ pola json');
    const lock = readLock(path);
    expect(lock).not.toBeNull();
    expect(lock?.corrupt).toBe(true);
    expect(lock?.startedAt).toBeTruthy();
    expect(readFileSync(path, 'utf8')).toBe('{ pola json');
  });

  it('greska pri citanju koja nije ENOENT (npr. staza je direktorij, EISDIR/EPERM) vraca unmeasurable, ne baca', () => {
    dir = mkdtempSync(join(tmpdir(), 'lekta-gate-test-'));
    // Staza postoji ali NIJE datoteka: `readFileSync` na direktoriju baca EISDIR na svim
    // platformama, sto imitira istu klasu kvara kao EPERM/EBUSY/EACCES (datoteka postoji, citanje
    // ne uspijeva iz razloga koji nije "nema je").
    const path = join(dir, 'lekta-gate.lock');
    mkdirSync(path);
    expect(() => readLock(path)).not.toThrow();
    const lock = readLock(path);
    expect(lock).toEqual({ unmeasurable: true, error: expect.any(String) });
  });

  it('judgeGate: lock koji se ne moze procitati je UPOZORENJE (fail-open), ne blokada i ne "nema locka" preuzimanje', () => {
    const v = judgeGate(freeState({ lock: null, lockAlive: null, lockUnmeasurable: true } as State));
    expect(v.allow).toBe(true);
    expect(v.warnings.some((w) => /lock datoteka se ne moze procitati/.test(w))).toBe(true);
    // Ne smije se prijaviti kao "preuzet mrtav lock", jer nikad nije procitan stvaran lock.
    expect(v.warnings.some((w) => /preuzima se/.test(w))).toBe(false);
  });
});

describe('canTakeOverLock: nikad ne brisi lock mladji od praga', () => {
  it('lock proglasen dead/stale se smije ukloniti tek nakon minTakeoverAgeMs', () => {
    expect(canTakeOverLock('dead', THRESHOLDS.minTakeoverAgeMs)).toBe(true);
    expect(canTakeOverLock('dead', THRESHOLDS.minTakeoverAgeMs - 1)).toBe(false);
    expect(canTakeOverLock('stale', THRESHOLDS.minTakeoverAgeMs)).toBe(true);
    expect(canTakeOverLock('stale', 0)).toBe(false);
  });

  it('status alive/free se nikad ne uklanja bez obzira na starost', () => {
    expect(canTakeOverLock('alive', 10 * THRESHOLDS.minTakeoverAgeMs)).toBe(false);
    expect(canTakeOverLock('free', 10 * THRESHOLDS.minTakeoverAgeMs)).toBe(false);
  });

  it('nepoznata starost (age null) ne blokira preuzimanje zastarjelog locka', () => {
    expect(canTakeOverLock('dead', null)).toBe(true);
    expect(canTakeOverLock('stale', null)).toBe(true);
  });
});

describe('acquireGate: atomarno preuzimanje locka izmedju dvije sesije', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  function measurementFile(dirPath: string, overrides: Record<string, unknown> = {}) {
    const file = join(dirPath, 'mjerenje.json');
    writeFileSync(file, JSON.stringify({ processes: [], freeMemBytes: 8 * GB, freeDiskBytes: 80 * GB, ...overrides }));
    return file;
  }

  it('sesija B odmah nakon sesije A vidi svjez, ziv lock i odbija (exit 2), lock ostaje sesije A', () => {
    dir = mkdtempSync(join(tmpdir(), 'lekta-gate-acquire-'));
    const lockPath = join(dir, 'lekta-gate.lock');
    const measurement = measurementFile(dir);
    const envZa = (label: string) => ({
      LEKTA_GATE_LOCK_PATH: lockPath,
      LEKTA_GATE_MEASUREMENT_FILE: measurement,
      LEKTA_GATE_FORCE: undefined,
    } as unknown as NodeJS.ProcessEnv);
    const tisina = () => {};

    // Sesija A: lock je prazan, zauzima ga stvarnim (zivim) PID-om ovog test procesa.
    const a = acquireGate({ label: 'A', ownerPid: process.pid, env: envZa('A'), root: 'w', log: tisina });
    expect(a.allow).toBe(true);
    expect(readLock(lockPath)?.token).toBe(a.token);

    // Sesija B odmah zatim: prvo mjerenje vec vidi lock A kao ziv (stvaran PID), pa odbija u JEDNOM
    // pokusaju, bez ijednog brisanja tudje datoteke.
    const b = acquireGate({ label: 'B', ownerPid: process.pid + 1, env: envZa('B'), root: 'w', log: tisina });
    expect(b.allow).toBe(false);
    expect(b.verdict?.reasons.some((r) => /gate vec drzi/.test(r))).toBe(true);
    expect(readLock(lockPath)?.token).toBe(a.token);
  });

  it('lock mrtvog PID-a mladji od minTakeoverAgeMs se NE brise; sesija ceka umjesto da ga preuzme', () => {
    dir = mkdtempSync(join(tmpdir(), 'lekta-gate-acquire-'));
    const lockPath = join(dir, 'lekta-gate.lock');
    const measurement = measurementFile(dir);
    const mrtavPid = 999_999; // nepostojeci PID: isPidAlive vraca false (dead), ne null.
    const record = { pid: mrtavPid, startedAt: new Date().toISOString(), worktree: 'w', label: 'stari', token: 'STARI' };
    writeFileSync(lockPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });

    const env = {
      LEKTA_GATE_LOCK_PATH: lockPath,
      LEKTA_GATE_MEASUREMENT_FILE: measurement,
    } as unknown as NodeJS.ProcessEnv;
    const tisina = () => {};

    const b = acquireGate({ label: 'B', ownerPid: process.pid, env, root: 'w', log: tisina });
    // Lock je "dead" (PID ne postoji) ali star manje od 5 s: ne smije se ukloniti, pa oba pokusaja
    // u petlji nailaze na `wx` EEXIST i sesija zavrsava odbijena, NIKAD tihom zamjenom tudjeg locka.
    expect(b.allow).toBe(false);
    expect(readLock(lockPath)?.token).toBe('STARI');
  });

  it('isti mrtav lock stariji od minTakeoverAgeMs SE preuzima', () => {
    dir = mkdtempSync(join(tmpdir(), 'lekta-gate-acquire-'));
    const lockPath = join(dir, 'lekta-gate.lock');
    const measurement = measurementFile(dir);
    const mrtavPid = 999_999;
    const staro = new Date(Date.now() - THRESHOLDS.minTakeoverAgeMs - 1_000).toISOString();
    const record = { pid: mrtavPid, startedAt: staro, worktree: 'w', label: 'stari', token: 'STARI' };
    writeFileSync(lockPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });

    const env = {
      LEKTA_GATE_LOCK_PATH: lockPath,
      LEKTA_GATE_MEASUREMENT_FILE: measurement,
    } as unknown as NodeJS.ProcessEnv;
    const tisina = () => {};

    const b = acquireGate({ label: 'B', ownerPid: process.pid, env, root: 'w', log: tisina });
    expect(b.allow).toBe(true);
    expect(readLock(lockPath)?.token).toBe(b.token);
    expect(readLock(lockPath)?.token).not.toBe('STARI');
  });
});

describe('CLI: node scripts/gate-preflight.mjs (--check-only, --label, --release)', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  const SCRIPT = resolve(process.cwd(), 'scripts/gate-preflight.mjs');

  function run(args: string[], env: Record<string, string | undefined>) {
    return spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, CI: undefined, LEKTA_GATE_FORCE: undefined, LEKTA_GATE_LOCK_TOKEN: undefined, ...env },
      timeout: 30_000,
    });
  }

  function measurementFile(dirPath: string, overrides: Record<string, unknown> = {}) {
    const file = join(dirPath, 'mjerenje.json');
    writeFileSync(file, JSON.stringify({ processes: [], freeMemBytes: 8 * GB, freeDiskBytes: 80 * GB, ...overrides }));
    return file;
  }

  it('--check-only: exit 0 kad je stroj slobodan (mjerenje podmetnuto)', () => {
    dir = mkdtempSync(join(tmpdir(), 'lekta-gate-cli-'));
    const lockPath = join(dir, 'lekta-gate.lock');
    const measurement = measurementFile(dir);
    const res = run(['--check-only'], { LEKTA_GATE_LOCK_PATH: lockPath, LEKTA_GATE_MEASUREMENT_FILE: measurement });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/presuda: SLOBODNO \(exit 0\)/);
  });

  it('--check-only: exit 2 kad lock vec drzi ziv PID', () => {
    dir = mkdtempSync(join(tmpdir(), 'lekta-gate-cli-'));
    const lockPath = join(dir, 'lekta-gate.lock');
    const measurement = measurementFile(dir);
    const record = { pid: process.pid, startedAt: new Date().toISOString(), worktree: 'w', label: 'tudji', token: 'T' };
    writeFileSync(lockPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
    const res = run(['--check-only'], { LEKTA_GATE_LOCK_PATH: lockPath, LEKTA_GATE_MEASUREMENT_FILE: measurement });
    expect(res.status).toBe(2);
    expect(res.stdout).toMatch(/presuda: ZAUZETO \(exit 2\)/);
  });

  it('--label pa --release u istoj ljusci (isti roditeljski proces): lock je vlastiti, brise se', () => {
    dir = mkdtempSync(join(tmpdir(), 'lekta-gate-cli-'));
    const lockPath = join(dir, 'lekta-gate.lock');
    const measurement = measurementFile(dir);
    const env = { LEKTA_GATE_LOCK_PATH: lockPath, LEKTA_GATE_MEASUREMENT_FILE: measurement };

    // Oba spawna dijele ISTI roditeljski proces (ovaj test proces), pa CLI ("PID roditelja = npm
    // ljuska") kod oba poziva zapisuje/trazi isti `process.ppid`, tocno "ista ljuska" iz naslova.
    const acquire = run(['--label', 'moj-gate'], env);
    expect(acquire.status).toBe(0);
    expect(readLock(lockPath)).not.toBeNull();

    const release = run(['--release'], env);
    expect(release.status).toBe(0);
    expect(release.stderr).toMatch(/lock otpusten/);
    expect(readLock(lockPath)).toBeNull();
  });

  it('--release iz drugog roditelja (tudji lock): ostaje, ne brise se tiho', () => {
    dir = mkdtempSync(join(tmpdir(), 'lekta-gate-cli-'));
    const lockPath = join(dir, 'lekta-gate.lock');
    const measurement = measurementFile(dir);
    // Lock upisan izravno, s PID-om i tokenom koji ne pripadaju OVOM procesu ni njegovom
    // roditelju: simulira sesiju pokrenutu iz DRUGE ljuske/roditelja.
    const record = { pid: 424_242, startedAt: new Date().toISOString(), worktree: 'w', label: 'tudja-sesija', token: 'TUDJI-TOKEN' };
    writeFileSync(lockPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });

    const release = run(['--release'], { LEKTA_GATE_LOCK_PATH: lockPath, LEKTA_GATE_MEASUREMENT_FILE: measurement });
    // `--release` uvijek vraca 0 (nikad ne rusi npm skriptu), ali NE smije obrisati tudji lock.
    expect(release.status).toBe(0);
    expect(release.stderr).toMatch(/lock drzi drugi proces; NE brise se/);
    expect(readLock(lockPath)?.token).toBe('TUDJI-TOKEN');
  });
});

describe('playwright.config.ts: lokalno samo Chromium motor', () => {
  const names = (env: Record<string, string | undefined>) => selectUxProjects(ALL_UX_PROJECTS, env).map((p) => p.name);

  it('BASELINE: puni popis i dalje nosi svih pet projekata (CI ih vidi kao i dosad)', () => {
    expect(ALL_UX_PROJECTS.map((p) => p.name)).toEqual(['chromium', 'mobile-chromium', 'firefox', 'webkit', 'mobile-webkit']);
  });

  it('bez env: samo chromium i mobile-chromium', () => {
    expect(names({})).toEqual(['chromium', 'mobile-chromium']);
    expect(names({})).toEqual([...CHROMIUM_ENGINE_PROJECTS]);
    expect(names({ LEKTA_UX_ALL_BROWSERS: '0' })).toEqual(['chromium', 'mobile-chromium']);
  });

  it('LEKTA_UX_ALL_BROWSERS=1 ili CI: svi projekti', () => {
    const all = ['chromium', 'mobile-chromium', 'firefox', 'webkit', 'mobile-webkit'];
    expect(names({ LEKTA_UX_ALL_BROWSERS: '1' })).toEqual(all);
    expect(names({ CI: 'true' })).toEqual(all);
  });

  it('skripte koje traze tudje motore postavljaju LEKTA_UX_ALL_BROWSERS same', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    for (const [name, body] of Object.entries(pkg.scripts)) {
      if (/--project=(firefox|webkit|mobile-webkit)\b/.test(body)) {
        expect(body, name).toMatch(/--env LEKTA_UX_ALL_BROWSERS=1/);
      }
    }
  });
});
