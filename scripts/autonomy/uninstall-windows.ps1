<#
.SYNOPSIS
  Uklanja Task Scheduler zadatak Lekta autonomnog kontrolera. NE brise repozitorij, bazu, dokaze ni konfiguraciju.
#>
param([string]$TaskName = 'Lekta Autonomy Tick')
$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) { Write-Host "Zadatak '$TaskName' ne postoji; nista za ukloniti."; exit 0 }
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Uklonjen zadatak '$TaskName'. Stanje u LEKTA_AUTONOMY_HOME je netaknuto (autonomy.sqlite, status.md, artifacts/)."
