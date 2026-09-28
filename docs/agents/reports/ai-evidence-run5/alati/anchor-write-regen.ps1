# Upis sidrenja za zadane profile, pa cijeli lanac regeneracije redom, pa testovi zastarjelosti. Samo alati repozitorija.
param([Parameter(Mandatory = $true)][string]$Tree, [Parameter(Mandatory = $true)][string]$Targets)
$ErrorActionPreference = 'Continue'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
Set-Location $Tree
$ok = 0; $fail = @()
foreach ($p in Get-Content $Targets) {
  $o = cmd /c "npx vite-node scripts/anchor-rule-quotes.mts $p --write 2>&1"
  if (($o -join "`n") -match 'upisani') { $ok++ } else { $fail += "$p : $(($o | Where-Object { $_ -and $_ -notmatch 'generate-citation' } | Select-Object -Last 1))" }
}
"sidrenje upisano: $ok"; $fail
# Lanac regeneracije (redoslijed je bitan: worklist -> ledger -> claims -> matrica -> server -> runtime mape -> manifest/coverage).
$spec = Join-Path $env:TEMP 'lekta-empty-port-spec.json'
foreach ($c in @(
  'npm run worklist',
  'npm run completion-ledger',
  'npm run gen-profile-claims',
  'npm run repair-faculty-matrix',
  'npm run gen-profile-rules-server',
  'npx vite-node scripts/gen-profile-runtime-maps.mts',
  'npm run repair-real-corpus-backlog')) {
  $null = cmd /c "$c 2>&1"; "$c -> exit $LASTEXITCODE"
}
# Manifest i scored-coverage izvode se iz stvarnih datoteka kroz idempotentni port-faculty s praznim specom.
[IO.File]::WriteAllText($spec, '{"faculty":"efos","sources":[],"profiles":[],"ledger":[]}', (New-Object System.Text.UTF8Encoding($false)))
$null = cmd /c "node scripts/port-faculty.mjs `"$spec`" 2>&1"; "port-faculty -> exit $LASTEXITCODE"
# Worklist i serverski artefakt ovise o gornjem; claim-modality provjerava samo CI (rule-claims).
foreach ($c in @('npm run worklist', 'npm run gen-profile-rules-server', 'npm run claim-modality')) {
  $null = cmd /c "$c 2>&1"; "$c -> exit $LASTEXITCODE"
}
npx vitest run tests/ledger-consistency.test.ts tests/coverage-report.test.ts tests/profile-runtime-maps.test.ts tests/profile-rules-server.test.ts tests/completion-ledger.test.ts tests/profile-claims.test.ts tests/faculty-matrix.test.ts tests/projection-freshness.test.ts tests/verification-worklist.test.ts tests/profile-validator.test.ts tests/rule-evidence-bridge.test.ts tests/anchor-rule-quotes.test.ts --maxWorkers=1 --minWorkers=1 2>&1 | Select-String 'Test Files|Tests  |FAIL ' | ForEach-Object { $_.Line.Trim() }
'GOTOVO'
