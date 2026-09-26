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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GB,
  THRESHOLDS,
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
