# scripts/register-clean-task.ps1
#
# Stavka G (odluka vlasnika 2026-09-26): registrira Windows Scheduled Task 'Lekta clean:tmp' koji
# dnevno i pri prijavi pokrece `node <repo>/scripts/clean-vitest-tmp.mjs` (isto sto `npm run
# clean:tmp`), s radnim direktorijem korijena repozitorija.
#
# Task radi pod TRENUTNIM korisnikom, LogonType Interactive ("Run only when user is logged on").
# Nacin prijave bez spremljene lozinke (Service-for-User) se NE koristi: izmjereno je da njegova
# registracija bez administratora visi. Interactive ne trazi lozinku ni admina, a ciscenje ionako
# treba samo dok korisnik radi.
#
# Upotreba:
#   powershell -ExecutionPolicy Bypass -File scripts/register-clean-task.ps1 -RepoRoot C:\Users\PC\Desktop\Lekta
#   powershell -ExecutionPolicy Bypass -File scripts/register-clean-task.ps1 -RepoRoot <repo> -DryRun
#   powershell -ExecutionPolicy Bypass -File scripts/register-clean-task.ps1 -Unregister
#
# -DryRun samo ispisuje definiciju (JSON) i nista ne registrira. Na kraju registracije ispisuje se
# Get-ScheduledTaskInfo (LastRunTime, LastTaskResult), da se vidi je li task ikad stvarno izvrsen.
# Datoteka je UTF-8 bez BOM-a i sadrzi samo ASCII (Windows PowerShell 5.1 cita je ispravno).
param(
  [string]$RepoRoot,
  [switch]$Unregister,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$TaskName = 'Lekta clean:tmp'

if ($Unregister) {
  $postoji = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $postoji) {
    Write-Output "Task '$TaskName' nije registriran, nemam sto ukloniti."
  } else {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "Task '$TaskName' uklonjen."
  }
  exit 0
}

if (-not $RepoRoot) { throw 'Nedostaje -RepoRoot (korijen Lekta repozitorija).' }
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path.TrimEnd('\', '/')
$skripta = Join-Path $RepoRoot 'scripts\clean-vitest-tmp.mjs'
if (-not (Test-Path -LiteralPath $skripta -PathType Leaf)) { throw "Nema $skripta; -RepoRoot nije korijen Lekte." }
$node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$korisnik = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$akcija = New-ScheduledTaskAction -Execute $node -Argument "`"$skripta`"" -WorkingDirectory $RepoRoot
$okidaci = @(
  (New-ScheduledTaskTrigger -Daily -At '12:30'),
  (New-ScheduledTaskTrigger -AtLogOn -User $korisnik)
)
$nalog = New-ScheduledTaskPrincipal -UserId $korisnik -LogonType Interactive -RunLevel Limited
$postavke = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

if ($DryRun) {
  [ordered]@{
    TaskName = $TaskName
    Execute = $akcija.Execute
    Arguments = $akcija.Arguments
    WorkingDirectory = $akcija.WorkingDirectory
    UserId = $nalog.UserId
    LogonType = [string]$nalog.LogonType
    Triggers = @($okidaci | ForEach-Object { $_.CimClass.CimClassName })
  } | ConvertTo-Json -Compress | Write-Output
  exit 0
}

Register-ScheduledTask -TaskName $TaskName -Action $akcija -Trigger $okidaci -Principal $nalog `
  -Settings $postavke -Description 'Lekta: npm run clean:tmp (scripts/clean-vitest-tmp.mjs)' -Force | Out-Null
Write-Output "Task '$TaskName' registriran za $korisnik (Interactive): $node `"$skripta`" u $RepoRoot"
Get-ScheduledTaskInfo -TaskName $TaskName |
  Select-Object TaskName, LastRunTime, LastTaskResult, NextRunTime |
  Format-List | Out-String | Write-Output
