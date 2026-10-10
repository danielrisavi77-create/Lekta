<#
  T82: registrira Scheduled Task koji svaki dan pise izvjestaj potrosnje tokena
  (scripts/agents/usage-daily.mjs) u %USERPROFILE%\Lekta-usage\YYYY-MM-DD.md.

  Okidaci: pri prijavi korisnika i svaki dan u 07:55. Radi samo dok je korisnik prijavljen,
  bez najvisih prava. Idempotentno: postojeci zadatak istog imena se zamjenjuje.

  Pokretanje (obican PowerShell, ne kao administrator):
    powershell -ExecutionPolicy Bypass -File scripts\agents\register-usage-daily-task.ps1
    powershell -ExecutionPolicy Bypass -File scripts\agents\register-usage-daily-task.ps1 -Repo C:\Lekta

  Dokaz: na kraju ispisuje Get-ScheduledTaskInfo (LastRunTime, LastTaskResult) nakon jednog
  rucnog pokretanja.
#>
[CmdletBinding()]
param(
  [string]$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [string]$Ime = 'Lekta usage daily'
)
$ErrorActionPreference = 'Stop'

$skripta = Join-Path $Repo 'scripts\agents\usage-daily.mjs'
if (-not (Test-Path $skripta)) { throw "Nema $skripta; -Repo mora biti korijen klona Lekte." }
$node = (Get-Command node -ErrorAction Stop).Source

$korisnik = "$env:USERDOMAIN\$env:USERNAME"
$akcija = New-ScheduledTaskAction -Execute $node -Argument "`"$skripta`" --repo `"$Repo`"" -WorkingDirectory $Repo
$okidaci = @(
  (New-ScheduledTaskTrigger -AtLogOn -User $korisnik),
  (New-ScheduledTaskTrigger -Daily -At '07:55')
)
$principal = New-ScheduledTaskPrincipal -UserId $korisnik -LogonType Interactive -RunLevel Limited
# Priority 5: Task Scheduler po zadanom daje 7, a uz njega ide i nizak I/O prioritet. Izmjereno
# 2026-10-04 na laptopu: s 7 je citanje transkripata gladovalo uz tudje gateove (3 s CPU-a u
# 12 min, prekid na 15 min, LastTaskResult 267014, bez izvjestaja); s 5 zavrsava za 102 s.
$postavke = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew -Priority 5

Register-ScheduledTask -TaskName $Ime -Action $akcija -Trigger $okidaci -Principal $principal -Settings $postavke -Force | Out-Null
Write-Host "Registriran zadatak '$Ime' za $korisnik (pri prijavi i svaki dan u 07:55)."

Start-ScheduledTask -TaskName $Ime
$rok = (Get-Date).AddMinutes(10)
do { Start-Sleep -Seconds 5; $stanje = (Get-ScheduledTask -TaskName $Ime).State } while ($stanje -eq 'Running' -and (Get-Date) -lt $rok)
Get-ScheduledTaskInfo -TaskName $Ime | Select-Object TaskName, LastRunTime, LastTaskResult, NextRunTime | Format-List
