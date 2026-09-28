# Deterministicki pokretac izvlacenja: Luna po izvoru, usporedba, Sol samo za retryable, usporedba.
# Bez Claude tokena. Pokretanje iz glavne sesije (pozadinski procesi podagenta ne prezive podagenta).
# Upotreba: powershell -File run-extraction.ps1 -Run <scratch/runN> -Sources a,b,c
param(
  [Parameter(Mandatory = $true)][string]$Run,
  [Parameter(Mandatory = $true)][string[]]$Sources,
  [string]$Tag = ''
)
$summaryName = if ($Tag) { "extraction-summary-$Tag.json" } else { 'extraction-summary.json' }
$ErrorActionPreference = 'Continue'
# powershell -File predaje "a,b,c" kao jedan niz; razdvoji ga ovdje.
$Sources = @($Sources | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
foreach ($src in $Sources) { if (-not (Test-Path "$Run\in\$src.json")) { "NEMA ULAZA: $src"; exit 2 } }
$tools = Split-Path -Parent $MyInvocation.MyCommand.Path
$summary = @()
foreach ($src in $Sources) {
  $row = [ordered]@{ sourceId = $src; luna = $null; sol = $null; lunaTokens = $null; solTokens = $null }
  foreach ($pass in @('luna', 'sol')) {
    if ($pass -eq 'sol') {
      if (-not $row.luna -or -not $row.luna.retryableRuleIds -or $row.luna.retryableRuleIds.Count -eq 0) { break }
      $only = " Obradi SAMO ruleId: $($row.luna.retryableRuleIds -join ', ')."
    } else { $only = '' }
    $model = if ($pass -eq 'luna') { 'gpt-6-luna' } else { 'gpt-6-sol' }
    $out = "$Run\out\$src.$pass.json"
    $log = "$Run\out\$src.$pass.log"
    $prompt = "Slijedi upute u $tools\UPUTE-izvlacenje.md. Ulaz: $Run\in\$src.json. Izlaz (jedina datoteka koju smijes pisati): $out. U model.model upisi $model.$only"
    cmd /c "codex exec -m $model --skip-git-repo-check -c model_reasoning_effort=medium --cd `"$Run`" `"$prompt`" < nul > `"$log`" 2>&1"
    $tok = (Select-String -Path $log -Pattern '^tokens used' -Context 0, 1 | Select-Object -Last 1).Context.PostContext
    $cmp = node "$tools\compare-extraction.mjs" "$Run" "$src" $pass | ConvertFrom-Json
    if ($pass -eq 'luna') { $row.luna = $cmp; $row.lunaTokens = "$tok" } else { $row.sol = $cmp; $row.solTokens = "$tok" }
  }
  $summary += [pscustomobject]$row
  [IO.File]::WriteAllText("$Run\$summaryName", ($summary | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
  "$(Get-Date -Format HH:mm) $src luna=$($row.lunaTokens) sol=$($row.solTokens)"
}
'GOTOVO'
