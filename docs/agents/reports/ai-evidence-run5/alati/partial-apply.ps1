# Djelomicna primjena AI dokaza po profilu. -Mode dry: proba za svaki profil pa nacrt UVIJEK vraca bajt-identicno.
# -Mode write: upisuje samo profile ciji probni izracun prolazi. Samo alati repozitorija + scratch sastavljac.
param([Parameter(Mandatory = $true)][string]$Tree, [Parameter(Mandatory = $true)][string]$Run,
      [ValidateSet('dry', 'write')][string]$Mode = 'dry', [string]$Only = '')
$ErrorActionPreference = 'Continue'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$tools = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Tree
$plan = Get-Content "$Run\plan.json" -Raw -Encoding UTF8 | ConvertFrom-Json
# Prihvaceni ruleId-jevi iz svih presuda.
$accepted = @{}
Get-ChildItem "$Run\verdict" -Filter *.json | ForEach-Object {
  $v = (Get-Content $_.FullName -Raw -Encoding UTF8) -replace '^﻿', '' | ConvertFrom-Json
  foreach ($r in @($v.accepted)) { $accepted[$r] = $true }
}
$profiles = @($plan.profiles.PSObject.Properties | Where-Object {
  $t = @($_.Value.targetRuleIds); ($t | Where-Object { $accepted.ContainsKey($_) }).Count -gt 0
} | ForEach-Object { $_.Name })
if ($Only) { $profiles = @($Only -split ',') }
"profila s barem jednim prihvacenim pravilom: $($profiles.Count)"
$out = @()
foreach ($p in $profiles) {
  $row = [ordered]@{ profileId = $p; built = 0; applied = $false; reason = '' }
  $null = cmd /c "npm run closed-loop -- --profile $p --no-structural 2>&1"
  # closed-loop prepisuje datoteku manifesta; detector-loop cuva ne-detektorske i dodaje detektorske (redoslijed je bitan).
  $null = cmd /c "npm run detector-loop -- --profile $p 2>&1"
  # Stari ai-confirmed dogadaji bez dokaza (odluka vlasnika): append-only korekcija samo u nacinu write.
  if ($Mode -eq 'write') {
    $rec = cmd /c "npx vite-node scripts/reconcile-ai-ledger.mts $p 2>&1" | Where-Object { $_ -match 'append-only korekcija' } | Select-Object -First 1
    if ($rec -and $rec -notmatch ': 0 append-only') { $null = cmd /c "npx vite-node scripts/reconcile-ai-ledger.mts $p --write 2>&1"; "$p : ledger korekcija ($rec)" }
  }
  $asm = cmd /c "npx vite-node `"$tools\assemble-ai-evidence.mts`" -- --root `"$Tree`" --scratch `"$Run`" --profile $p --partial 2>&1" | Where-Object { $_ -match '^\{' } | Select-Object -Last 1
  $a = if ($asm) { $asm | ConvertFrom-Json } else { $null }
  if (-not $a -or -not $a.ok) { $row.reason = 'sastavljanje: ' + ((@($a.missing) | ForEach-Object { $_.code } | Group-Object | ForEach-Object { "$($_.Name)x$($_.Count)" }) -join ','); $out += [pscustomobject]$row; "$p : $($row.reason)"; continue }
  $row.built = $a.ready
  $draft = Join-Path $Tree $a.draft
  $orig = [IO.File]::ReadAllBytes($draft)
  $null = cmd /c "npx vite-node `"$tools\assemble-ai-evidence.mts`" -- --root `"$Tree`" --scratch `"$Run`" --profile $p --partial --write-draft 2>&1"
  $dry = cmd /c "npx vite-node scripts/apply-ai-evidence-profile.mts $p 2>&1" | Where-Object { $_ -and $_ -notmatch 'generate-citation' }
  $dryOk = ($dry -join "`n") -match 'PROBNI IZRA'
  if ($Mode -eq 'write' -and $dryOk) {
    $wr = cmd /c "npx vite-node scripts/apply-ai-evidence-profile.mts $p --write 2>&1"
    if (($wr -join "`n") -match 'upisani') { $row.applied = $true; $row.reason = 'upisano' }
    else { [IO.File]::WriteAllBytes($draft, $orig); $row.reason = 'upis pao: ' + ($wr | Select-Object -Last 1) }
  } else {
    [IO.File]::WriteAllBytes($draft, $orig)
    $row.reason = if ($dryOk) { 'proba prolazi' } else { 'proba: ' + (($dry | Select-Object -First 1) -replace '\s+', ' ') }
  }
  $out += [pscustomobject]$row
  "$p : built=$($row.built) $($row.reason)"
}
[IO.File]::WriteAllText("$Run\partial-$Mode.json", ($out | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
'GOTOVO'
