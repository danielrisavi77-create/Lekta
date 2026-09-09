<#
.SYNOPSIS
  Instalira Windows Task Scheduler zadatak za Lekta autonomni kontroler (jedan primjerak, svakih 60 min).

.DESCRIPTION
  Zadatak pokrece `python -m scripts.autonomy.cli tick` iz APSOLUTNE staze POUZDANE instalacije
  (pregledani checkout), ne iz kandidatova worktreea, i ne povlaci najnoviji kod pri startu.
  MultipleInstances = IgnoreNew: dva okidanja se ne preklapaju; Store lease je druga brana.
  Radi u prijavljenoj interaktivnoj sesiji (Word COM to trazi), pa se registrira bez lozinke i
  s -RunLevel Limited. Ne dodjeljuje nikakve tajne.

.PARAMETER RepoPath
  Apsolutna staza pouzdane instalacije (git checkout pregledane verzije).
.PARAMETER StateDir
  LEKTA_AUTONOMY_HOME (stanje, baza, konfiguracija). Zadano %LOCALAPPDATA%\Lekta\autonomy.
.PARAMETER Minutes
  Period ponavljanja. Zadano 60.
#>
param(
  [Parameter(Mandatory = $true)][string]$RepoPath,
  [string]$StateDir = (Join-Path $env:LOCALAPPDATA 'Lekta\autonomy'),
  [int]$Minutes = 60,
  [string]$TaskName = 'Lekta Autonomy Tick'
)

$ErrorActionPreference = 'Stop'
$RepoPath = (Resolve-Path $RepoPath).Path
if (-not (Test-Path (Join-Path $RepoPath 'scripts\autonomy\cli.py'))) {
  throw "U $RepoPath nema scripts/autonomy/cli.py; instalacija trazi pregledani checkout."
}
$python = (Get-Command python -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
$config = Join-Path $StateDir 'autonomy.json'
if (-not (Test-Path $config)) {
  Copy-Item (Join-Path $RepoPath 'config\autonomy.example.json') $config
  Write-Host "Kopiran predlozak konfiguracije u $config (mode=observe, publisherEnabled=false). Uredi ga prije aktivacije viseg nacina."
}
$log = Join-Path $StateDir 'tick.log'
$cmd = "/c set LEKTA_AUTONOMY_HOME=$StateDir&& cd /d `"$RepoPath`" && `"$python`" -m scripts.autonomy.cli tick >> `"$log`" 2>&1"
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmd -WorkingDirectory $RepoPath
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes $Minutes)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4) `
  -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Registriran zadatak '$TaskName': svakih $Minutes min, iz $RepoPath, stanje u $StateDir."
Write-Host "Provjera: schtasks /Query /TN `"$TaskName`" /V /FO LIST ; dnevnik: $log"
Write-Host "Prvo pokreni rucno: cd $RepoPath ; `$env:LEKTA_AUTONOMY_HOME='$StateDir' ; python -m scripts.autonomy.cli doctor ; python -m scripts.autonomy.cli tick --dry-run"
