/**
 * scripts/register-clean-task.ps1 (stavka G): Windows Scheduled Task 'Lekta clean:tmp'.
 *
 * Task se u testu NIKAD ne registrira. Dokazuje se oblik datoteke (bez BOM-a, samo ASCII, bez
 * S4U, s -Unregister i Interactive) i, na Windowsu, stvarna definicija koju skripta gradi u
 * `-DryRun` nacinu (isti objekti koje bi predala Register-ScheduledTask).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

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
    expect(code).toContain("$TaskName = 'Lekta clean:tmp'");
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
      "if (Get-ScheduledTask -TaskName 'Lekta clean:tmp' -ErrorAction SilentlyContinue) { 'DA' } else { 'NE' }"]).stdout.trim();
    const prije = exists();
    const repo = process.cwd();
    const r = powershell(['-File', SCRIPT, '-RepoRoot', repo, '-DryRun']);
    expect(r.status, r.stderr).toBe(0);
    const line = r.stdout.replace(/\r/g, '').split('\n').find((l) => l.startsWith('{')) ?? '';
    const def = JSON.parse(line) as Record<string, unknown>;
    expect(def.TaskName).toBe('Lekta clean:tmp');
    expect(String(def.Execute)).toMatch(/node(\.exe)?$/i);
    expect(def.Arguments).toBe(`"${resolve(repo, 'scripts', 'clean-vitest-tmp.mjs')}"`);
    expect(String(def.WorkingDirectory).toLowerCase()).toBe(resolve(repo).toLowerCase());
    expect(def.LogonType).toBe('Interactive');
    expect(def.Triggers).toEqual(['MSFT_TaskDailyTrigger', 'MSFT_TaskLogonTrigger']);
    expect(exists()).toBe(prije);
  });
});
