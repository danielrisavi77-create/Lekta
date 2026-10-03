/**
 * scripts/register-clean-task.ps1 (stavka G): Windows Scheduled Task 'Lekta clean-tmp'.
 *
 * Vecina testova ne registrira nista: dokazuje se oblik datoteke (bez BOM-a, samo ASCII, bez S4U,
 * s -Unregister i Interactive) i, na Windowsu, stvarna definicija koju skripta gradi u `-DryRun`
 * nacinu (isti objekti koje bi predala Register-ScheduledTask). Stavka G, tocka 1 je iznimka: na
 * win32, kad je Register-ScheduledTask dostupan, jedan test STVARNO registrira i odmah odjavljuje
 * task pod privremenim imenom 'Lekta-test-<pid>' (task se nikad ne pokrece), s bezuvjetnim
 * ciscenjem u afterAll.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = resolve(process.cwd(), 'scripts/register-clean-task.ps1');
const bytes = readFileSync(SCRIPT);
const text = bytes.toString('utf8').replace(/\r/g, '');
const code = text.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');

describe('register-clean-task.ps1: oblik datoteke', () => {
  it('UTF-8 bez BOM-a i samo ASCII', () => {
    expect([...bytes.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.every((b) => b < 0x80)).toBe(true);
  });

  it('ne spominje S4U nigdje, ni u komentaru', () => {
    expect(text).not.toMatch(/S4U/i);
  });

  it('Interactive pod trenutnim korisnikom, dnevno + AtLogOn, akcija node nad clean-vitest-tmp.mjs', () => {
    expect(code).toMatch(/New-ScheduledTaskPrincipal -UserId \$korisnik -LogonType Interactive\b/);
    expect(code).toContain('[System.Security.Principal.WindowsIdentity]::GetCurrent().Name');
    expect(code).toMatch(/New-ScheduledTaskTrigger -Daily\b/);
    expect(code).toMatch(/New-ScheduledTaskTrigger -AtLogOn -User \$korisnik/);
    expect(code).toContain("Join-Path $RepoRoot 'scripts\\clean-vitest-tmp.mjs'");
    expect(code).toMatch(/New-ScheduledTaskAction -Execute \$node .*-WorkingDirectory \$RepoRoot/);
    expect(code).toContain("$TaskName = 'Lekta clean-tmp'");
  });

  it('ima -Unregister i na kraju ispisuje Get-ScheduledTaskInfo (LastRunTime, LastTaskResult)', () => {
    expect(code).toContain('[switch]$Unregister');
    expect(code).toMatch(/Unregister-ScheduledTask -TaskName \$TaskName -Confirm:\$false/);
    const lastRegister = code.lastIndexOf('Register-ScheduledTask -TaskName');
    const info = code.indexOf('Get-ScheduledTaskInfo -TaskName $TaskName');
    expect(info).toBeGreaterThan(lastRegister);
    expect(code.slice(info)).toMatch(/LastRunTime, LastTaskResult/);
  });
});

/**
 * Izmjereno 2026-09-28: Register-ScheduledTask s ':' u imenu taska pada u redku ~106 s
 * 'The parameter is incorrect' (HRESULT 0x80070057). Ime Scheduled Taska ne smije sadrzavati
 * nijedan od znakova nedopustenih za ime, isti skup kao za nazive datoteka: \ / : * ? " < > |.
 * `npm run clean:tmp` je zaseban, nepromijenjen npm skript naziv i ne prolazi kroz ovaj gard.
 */
const TASK_NAME_FORBIDDEN_CHARS = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];

function taskNameFromSource(src: string): string | null {
  const m = src.match(/\$TaskName\s*=\s*'([^']*)'/);
  return m ? m[1] : null;
}

describe('register-clean-task.ps1: ime taska bez znakova nedopustenih u Task Scheduleru', () => {
  it('$TaskName parsiran iz izvora ne sadrzi nijedan od \\ / : * ? " < > |', () => {
    const ime = taskNameFromSource(text);
    expect(ime).not.toBeNull();
    for (const znak of TASK_NAME_FORBIDDEN_CHARS) {
      expect(ime, `ime taska '${ime}' sadrzi nedopusteni znak '${znak}'`).not.toContain(znak);
    }
  });
});

/**
 * Codex krug 2 (M2): task istog imena koji nije nas (druga akcija ili drugi radni direktorij) se ne
 * uklanja i ne prepisuje. Tekstualni gard nad obje grane (uklanjanje i registracija).
 */
function registerOwnershipProblems(src: string): string[] {
  const c = src.replace(/\r/g, '').split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
  const problems: string[] = [];
  if (!/^function Test-LektaCleanTaskOwned \{$/m.test(c)) problems.push('nema funkcije Test-LektaCleanTaskOwned');
  if (!c.includes('$akcije.Count -ne 1')) problems.push('vlasnistvo ne trazi tocno jednu akciju');
  if (!c.includes('[string]$akcije[0].Arguments') || !c.includes('[string]$akcije[0].WorkingDirectory')) {
    problems.push('vlasnistvo ne usporedjuje Actions[0].Arguments i WorkingDirectory');
  }
  if (!c.includes('[string]$akcije[0].Execute') || !c.includes('node') || !c.includes('node.exe')) {
    problems.push('vlasnistvo ne provjerava da je Execute node ili node.exe');
  }
  if (/-Force\b/.test(c)) problems.push('skripta koristi -Force (prepisuje tudji task)');
  const refuse = /if \(-not \(Test-LektaCleanTaskOwned [^\n]*\)\) \{\n[^\n]*Odbijam[^\n]*\n\s+exit 1\n/;
  const unreg = c.indexOf('if ($Unregister) {');
  const unregEnd = unreg < 0 ? -1 : c.indexOf('\n}\n', unreg);
  const unregBlock = unreg < 0 || unregEnd < 0 ? '' : c.slice(unreg, unregEnd);
  const unregCall = unregBlock.indexOf('Unregister-ScheduledTask');
  const unregCheck = unregBlock.indexOf('Test-LektaCleanTaskOwned');
  if (unregCall < 0 || unregCheck < 0 || unregCheck > unregCall || !refuse.test(unregBlock)) {
    problems.push('-Unregister ne odbija tudji task prije Unregister-ScheduledTask');
  }
  const rest = unregEnd < 0 ? c : c.slice(unregEnd);
  const reg = rest.indexOf('Register-ScheduledTask -TaskName');
  const regCheck = rest.indexOf('Test-LektaCleanTaskOwned');
  if (reg < 0 || regCheck < 0 || regCheck > reg || !refuse.test(rest)) {
    problems.push('registracija ne odbija postojeci tudji task istog imena');
  }
  return problems;
}

describe('register-clean-task.ps1: vlasnistvo nad taskom (Codex krug 2, M2)', () => {
  it('baseline: skripta zadovoljava gard vlasnistva', () => {
    expect(registerOwnershipProblems(text)).toEqual([]);
  });

  it('gard hvata -Unregister koji brise bez provjere vlasnistva', () => {
    const mutirano = text.replace(
      /(if \(\$Unregister\) \{[\s\S]*?)if \(-not \(Test-LektaCleanTaskOwned [^\n]*\)\) \{\n[^\n]*\n\s+exit 1\n\s+\}\n/,
      '$1',
    );
    expect(mutirano).not.toBe(text);
    expect(registerOwnershipProblems(mutirano)).toContain('-Unregister ne odbija tudji task prije Unregister-ScheduledTask');
  });

  it('gard hvata registraciju s -Force i bez provjere postojeceg taska', () => {
    const sForce = text.replace(
      "-Description 'Lekta: npm run clean:tmp (scripts/clean-vitest-tmp.mjs)'",
      "-Description 'Lekta: npm run clean:tmp (scripts/clean-vitest-tmp.mjs)' -Force",
    );
    expect(sForce).not.toBe(text);
    expect(registerOwnershipProblems(sForce)).toContain('skripta koristi -Force (prepisuje tudji task)');
    const zadnjaProvjera = text.lastIndexOf('if (-not (Test-LektaCleanTaskOwned');
    expect(zadnjaProvjera).toBeGreaterThan(text.indexOf('if ($Unregister) {'));
    const bezProvjere = text.slice(0, zadnjaProvjera) + text.slice(zadnjaProvjera).replace(
      /if \(-not \(Test-LektaCleanTaskOwned [^\n]*\)\) \{\n[^\n]*\n\s+exit 1\n\s+\}\n/,
      '',
    );
    expect(bezProvjere).not.toBe(text);
    expect(registerOwnershipProblems(bezProvjere)).toContain('registracija ne odbija postojeci tudji task istog imena');
  });
});

function powershell(args: string[]) {
  return spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], {
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
  });
}

describe.skipIf(process.platform !== 'win32')('register-clean-task.ps1: -DryRun na Windowsu', () => {
  it('gradi Interactive task s node akcijom u korijenu repozitorija i nista ne registrira', () => {
    const exists = () => powershell(['-Command',
      "if (Get-ScheduledTask -TaskName 'Lekta clean-tmp' -ErrorAction SilentlyContinue) { 'DA' } else { 'NE' }"]).stdout.trim();
    const prije = exists();
    const repo = process.cwd();
    const r = powershell(['-File', SCRIPT, '-RepoRoot', repo, '-DryRun']);
    expect(r.status, r.stderr).toBe(0);
    const line = r.stdout.replace(/\r/g, '').split('\n').find((l) => l.startsWith('{')) ?? '';
    const def = JSON.parse(line) as Record<string, unknown>;
    expect(def.TaskName).toBe('Lekta clean-tmp');
    expect(String(def.Execute)).toMatch(/node(\.exe)?$/i);
    expect(def.Arguments).toBe(`"${resolve(repo, 'scripts', 'clean-vitest-tmp.mjs')}"`);
    expect(String(def.WorkingDirectory).toLowerCase()).toBe(resolve(repo).toLowerCase());
    expect(def.LogonType).toBe('Interactive');
    expect(def.Triggers).toEqual(['MSFT_TaskDailyTrigger', 'MSFT_TaskLogonTrigger']);
    expect(exists()).toBe(prije);
  });
});

describe.skipIf(process.platform !== 'win32')('register-clean-task.ps1: Test-LektaCleanTaskOwned stvarno izvedena (M1)', () => {
  it('prihvaca samo nasu akciju iz predanog korijena, odbija tudju akciju i tudji radni direktorij', () => {
    const repo = resolve(process.cwd());
    const nasArg = `"${resolve(repo, 'scripts', 'clean-vitest-tmp.mjs')}"`;
    const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const task = (args: string, wd: string, n = 1, exe = 'node.exe') =>
      `[pscustomobject]@{ Actions = @(1..${n} | ForEach-Object { [pscustomobject]@{ Execute = ${q(exe)}; Arguments = ${q(args)}; WorkingDirectory = ${q(wd)} } }) }`;
    const cases: Array<[string, string]> = [
      ['NAS', task(nasArg, repo)],
      ['NAS_VELIKA', task(nasArg.toUpperCase(), `${repo.toUpperCase()}\\`)],
      ['TUDJA_AKCIJA', task('"C:\\drugi\\backup.ps1"', repo)],
      ['TUDJI_WD', task(nasArg, 'C:\\drugi-repo')],
      ['DRUGI_REPO', task('"C:\\drugi-repo\\scripts\\clean-vitest-tmp.mjs"', 'C:\\drugi-repo')],
      ['DVIJE_AKCIJE', task(nasArg, repo, 2)],
      ['POWERSHELL_EXECUTE', task(nasArg, repo, 1, 'powershell.exe')],
    ];
    const cmd = [
      `$ast = [System.Management.Automation.Language.Parser]::ParseFile(${q(SCRIPT)}, [ref]$null, [ref]$null)`,
      "$fn = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Test-LektaCleanTaskOwned' }, $true)",
      'if ($null -eq $fn) { throw "nema funkcije Test-LektaCleanTaskOwned" }',
      '. ([scriptblock]::Create($fn.Extent.Text))',
      ...cases.map(([ime, t]) => `"${ime}=$(Test-LektaCleanTaskOwned -Task (${t}) -Root ${q(repo)})"`),
    ].join('; ');
    const r = powershell(['-Command', cmd]);
    expect(r.status, r.stderr).toBe(0);
    const out = r.stdout.replace(/\r/g, '');
    expect(out).toContain('NAS=True');
    expect(out).toContain('NAS_VELIKA=True');
    expect(out).toContain('TUDJA_AKCIJA=False');
    expect(out).toContain('TUDJI_WD=False');
    expect(out).toContain('DRUGI_REPO=False');
    expect(out).toContain('DVIJE_AKCIJE=False');
    expect(out).toContain('POWERSHELL_EXECUTE=False');
  });
});

function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function taskExists(name: string): string {
  return powershell(['-Command',
    `if (Get-ScheduledTask -TaskName ${psQuote(name)} -ErrorAction SilentlyContinue) { 'DA' } else { 'NE' }`,
  ]).stdout.trim();
}

/**
 * Stavka G, tocka 2: -TaskName kao PARAMETAR (ne samo zadano ime u izvoru) mora biti odbijen ako
 * sadrzi bilo koji od \ / : * ? " < > | , PRIJE ikakvog poziva Register-ScheduledTask ili grane
 * -Unregister, s exit 1 i jasnom porukom. Skripta se stvarno pokrece; nijedan task se ne registrira.
 */
describe.skipIf(process.platform !== 'win32')(
  `register-clean-task.ps1: -TaskName parametar odbija nedopusteni znak${process.platform !== 'win32' ? ' (preskoceno: nije win32)' : ''}`,
  () => {
    const lose = 'Lekta:test-nedopusteno';

    it("odbija ':' u -TaskName pri registraciji, exit 1, bez ikakvog poziva Register-ScheduledTask", () => {
      const prije = taskExists(lose);
      const r = powershell(['-File', SCRIPT, '-RepoRoot', process.cwd(), '-TaskName', lose]);
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/Odbijam:.*-TaskName.*nedopusteni znak/);
      expect(taskExists(lose)).toBe(prije);
      expect(taskExists(lose)).toBe('NE');
    });

    it("odbija ':' u -TaskName i uz -Unregister, prije Get-/Unregister-ScheduledTask", () => {
      const r = powershell(['-File', SCRIPT, '-RepoRoot', process.cwd(), '-TaskName', lose, '-Unregister']);
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/Odbijam:.*-TaskName.*nedopusteni znak/);
    });
  },
);

const REGISTER_TEST_IS_WIN = process.platform === 'win32';
function registerTestHasCmdlet(): boolean {
  if (!REGISTER_TEST_IS_WIN) return false;
  const r = powershell(['-Command',
    "if (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue) { 'DA' } else { 'NE' }"]);
  return r.status === 0 && r.stdout.trim() === 'DA';
}
const REGISTER_TEST_HAS_CMDLET = registerTestHasCmdlet();
const REGISTER_TEST_SKIP_REASON = !REGISTER_TEST_IS_WIN
  ? 'nije win32'
  : (!REGISTER_TEST_HAS_CMDLET ? 'Register-ScheduledTask nedostupan' : '');
const REGISTER_TEST_TASK_NAME = `Lekta-test-${process.pid}`;

/**
 * Stavka G, tocka 1: STVARNA registracija i odjava pod PRIVREMENIM imenom 'Lekta-test-<pid>', samo
 * na win32 i samo ako je Register-ScheduledTask dostupan kroz powershell. Task se NIKAD ne pokrece
 * (Start-ScheduledTask se ne poziva), samo registrira i odmah odjavi. Ciscenje je bezuvjetno u
 * afterAll, pa ostaje i ako expect u testu padne.
 */
describe.skipIf(!REGISTER_TEST_HAS_CMDLET)(
  `register-clean-task.ps1: stvarna registracija i odjava pod privremenim imenom${REGISTER_TEST_SKIP_REASON ? ` (preskoceno: ${REGISTER_TEST_SKIP_REASON})` : ''}`,
  () => {
    afterAll(() => {
      try {
        powershell(['-File', SCRIPT, '-RepoRoot', process.cwd(), '-TaskName', REGISTER_TEST_TASK_NAME, '-Unregister']);
      } catch {
        /* zadnja mreza ispod pokusava izravno */
      }
      if (taskExists(REGISTER_TEST_TASK_NAME) === 'DA') {
        powershell(['-Command',
          `Unregister-ScheduledTask -TaskName ${psQuote(REGISTER_TEST_TASK_NAME)} -Confirm:$false`]);
      }
    });

    it('registrira ocekivanu akciju (node, argument, WorkingDirectory) i LogonType Interactive, pa se cisto odjavljuje', () => {
      const repo = process.cwd();
      const reg = powershell(['-File', SCRIPT, '-RepoRoot', repo, '-TaskName', REGISTER_TEST_TASK_NAME]);
      expect(reg.status, reg.stderr || reg.stdout).toBe(0);

      const infoCmd = [
        `$t = Get-ScheduledTask -TaskName ${psQuote(REGISTER_TEST_TASK_NAME)} -ErrorAction SilentlyContinue`,
        'if ($null -eq $t) { Write-Output "MISSING" } else {',
        '  $a = $t.Actions[0]',
        '  [pscustomobject]@{ Execute = $a.Execute; Arguments = $a.Arguments; '
          + 'WorkingDirectory = $a.WorkingDirectory; LogonType = [string]$t.Principal.LogonType } '
          + '| ConvertTo-Json -Compress | Write-Output',
        '}',
      ].join('; ');
      const info = powershell(['-Command', infoCmd]);
      expect(info.status, info.stderr).toBe(0);
      const linija = info.stdout.replace(/\r/g, '').trim().split('\n').pop() ?? '';
      expect(linija).not.toBe('MISSING');
      const def = JSON.parse(linija) as Record<string, unknown>;
      expect(String(def.Execute).toLowerCase()).toMatch(/node(\.exe)?$/);
      expect(def.Arguments).toBe(`"${resolve(repo, 'scripts', 'clean-vitest-tmp.mjs')}"`);
      expect(String(def.WorkingDirectory).toLowerCase()).toBe(resolve(repo).toLowerCase());
      expect(def.LogonType).toBe('Interactive');

      const unreg = powershell(['-File', SCRIPT, '-RepoRoot', repo, '-TaskName', REGISTER_TEST_TASK_NAME, '-Unregister']);
      expect(unreg.status, unreg.stderr || unreg.stdout).toBe(0);
      expect(taskExists(REGISTER_TEST_TASK_NAME)).toBe('NE');
    });
  },
);
