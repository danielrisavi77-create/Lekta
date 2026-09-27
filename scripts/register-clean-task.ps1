# scripts/register-clean-task.ps1
#
# Stavka G (odluka vlasnika 2026-09-26): registrira Windows Scheduled Task 'Lekta clean-tmp' koji
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
#   powershell -ExecutionPolicy Bypass -File scripts/register-clean-task.ps1 -RepoRoot <repo> -Unregister
#   powershell -ExecutionPolicy Bypass -File scripts/register-clean-task.ps1 -RepoRoot <repo> -TaskName <ime>
#
# -DryRun samo ispisuje definiciju (JSON) i nista ne registrira. Na kraju registracije ispisuje se
# Get-ScheduledTaskInfo (LastRunTime, LastTaskResult), da se vidi je li task ikad stvarno izvrsen.
# Datoteka je UTF-8 bez BOM-a i sadrzi samo ASCII (Windows PowerShell 5.1 cita je ispravno).
#
# -TaskName (zadano 'Lekta clean-tmp') mijenja ime Scheduled Taska; koristi ga npr. test koji
# registrira pod privremenim imenom da ne dira pravi 'Lekta clean-tmp' task. Zadano ime i -TaskName
# prolaze isti gard nedopustenih znakova, vidi nize.
#
# Stvarni task na laptopu se registrira nad ZASEBNIM worktreeom C:\Users\PC\Lekta-clean-task
# (detached origin/master), ne nad dijeljenim radnim stablom C:\Users\PC\Desktop\Lekta ni nad bilo
# kojim Lekta-wt-*; ta mapa nema node_modules jer ova skripta i clean-vitest-tmp.mjs koriste samo
# Node ugradjene module. Osvjezavanje: git -C C:\Users\PC\Lekta-clean-task fetch && git -C
# C:\Users\PC\Lekta-clean-task checkout --detach origin/master. Dokaz da task stvarno radi:
# Start-ScheduledTask -TaskName 'Lekta clean-tmp', pa Get-ScheduledTaskInfo -TaskName
# 'Lekta clean-tmp' i provjera LastRunTime/LastTaskResult. Vidi i docs/agents/ROUTING.md, "Pravila
# za stroj".
#
# Vlasnistvo (Codex nalaz, krug 2, M2): task istog imena je NAS samo ako ima tocno jednu akciju
# ciji su Arguments tocno "<RepoRoot>\scripts\clean-vitest-tmp.mjs" (u navodnicima), a
# WorkingDirectory tocno <RepoRoot>. -Unregister uklanja samo takav task; registracija ne prepisuje
# tudji task istog imena i ne koristi prepisivanje bez pitanja, nego ga odbija. Nas postojeci task
# se prvo ukloni, pa ponovno registrira.
param(
  [string]$RepoRoot,
  [string]$TaskName = 'Lekta clean-tmp',
  [switch]$Unregister,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
# Ime (zadano ili predano kroz -TaskName) ne smije sadrzavati ':' ni druge znakove nedopustene
# za ime Windows Scheduled Taska (isti skup kao za nazive datoteka: \ / : * ? " < > |); Register-
# ScheduledTask s takvim znakom u imenu pada s 'The parameter is incorrect' (HRESULT 0x80070057).
# Provjera je ovdje, prije bilo kojeg poziva Register-ScheduledTask ili Get-/Unregister-
# ScheduledTask, i vrijedi za oba nacina rada (registracija i -Unregister). Vidi
# tests/register-clean-task.test.ts.
$ZabranjeniZnakoviTaskName = '\', '/', ':', '*', '?', '"', '<', '>', '|'
foreach ($znak in $ZabranjeniZnakoviTaskName) {
  if ($TaskName.Contains($znak)) {
    Write-Output "Odbijam: -TaskName '$TaskName' sadrzi nedopusteni znak '$znak' (ime Scheduled Taska ne smije sadrzavati nijedan od: \ / : * ? `" < > |)."
    exit 1
  }
}

function Test-LektaCleanTaskOwned {
  param($Task, [string]$Root)
  $cmp = [System.StringComparison]::OrdinalIgnoreCase
  $korijen = $Root.TrimEnd('\', '/')
  $akcije = @($Task.Actions)
  if ($akcije.Count -ne 1) { return $false }
  # Execute mora biti node ili node.exe (bez razlike velikih slova) ili tocna putanja koju skripta registrira
  $execute = ([string]$akcije[0].Execute).Trim()
  $leafExecute = [System.IO.Path]::GetFileName($execute).ToLower()
  if ($leafExecute -ne 'node' -and $leafExecute -ne 'node.exe') { return $false }
  $ocekivano = '"' + (Join-Path $korijen 'scripts\clean-vitest-tmp.mjs') + '"'
  $argumenti = ([string]$akcije[0].Arguments).Trim()
  $radni = ([string]$akcije[0].WorkingDirectory).TrimEnd('\', '/')
  return ($argumenti.Equals($ocekivano, $cmp) -and $radni.Equals($korijen, $cmp))
}

if (-not $RepoRoot) { throw 'Nedostaje -RepoRoot (korijen Lekta repozitorija).' }

if ($Unregister) {
  # GetFullPath, ne Resolve-Path: task se smije ukloniti i kad korijena vise nema na disku.
  $korijen = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\', '/')
  $postoji = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $postoji) {
    Write-Output "Task '$TaskName' nije registriran, nemam sto ukloniti."
    exit 0
  }
  if (-not (Test-LektaCleanTaskOwned -Task $postoji -Root $korijen)) {
    Write-Output "Odbijam: task '$TaskName' ne pokrece clean-vitest-tmp.mjs iz $korijen (akcija: $(@($postoji.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments) u $($_.WorkingDirectory)" }) -join '; ')); nije uklonjen."
    exit 1
  }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "Task '$TaskName' uklonjen."
  exit 0
}

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

$postoji = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $postoji) {
  if (-not (Test-LektaCleanTaskOwned -Task $postoji -Root $RepoRoot)) {
    Write-Output "Odbijam: task '$TaskName' vec postoji i ne pokrece clean-vitest-tmp.mjs iz $RepoRoot; ne prepisujem ga."
    exit 1
  }
  # Nas task iz istog korijena: ukloni ga i registriraj iznova (bez prepisivanja preko imena).
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $TaskName -Action $akcija -Trigger $okidaci -Principal $nalog `
  -Settings $postavke -Description 'Lekta: npm run clean:tmp (scripts/clean-vitest-tmp.mjs)' | Out-Null
Write-Output "Task '$TaskName' registriran za $korisnik (Interactive): $node `"$skripta`" u $RepoRoot"
Get-ScheduledTaskInfo -TaskName $TaskName |
  Select-Object TaskName, LastRunTime, LastTaskResult, NextRunTime |
  Format-List | Out-String | Write-Output
