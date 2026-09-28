# Suhi prolaz sidrenja citata za sve profile s quote-not-found (iz plan.json). Ne pise nista u stablo.
param([Parameter(Mandatory = $true)][string]$Run, [Parameter(Mandatory = $true)][string]$Tree)
$ErrorActionPreference = 'Continue'
$plan = Get-Content "$Run\plan.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$profiles = @($plan.blocked | Where-Object { $_.code -eq 'quote-not-found' } | ForEach-Object { $_.profileId } | Sort-Object -Unique)
$out = @()
Set-Location $Tree
foreach ($p in $profiles) {
  $lines = cmd /c "npx vite-node scripts/anchor-rule-quotes.mts $p 2>&1"
  $line = $lines | Where-Object { $_ -match '^PROBNI IZRA' } | Select-Object -First 1
  $err = if (-not $line) { ($lines | Where-Object { $_ -and $_ -notmatch 'generate-citation' } | Select-Object -Last 1) } else { $null }
  $counts = if ($line) { ($line -replace '^[^{]*', '') | ConvertFrom-Json } else { $null }
  $out += [pscustomobject]@{ profileId = $p; counts = $counts; error = "$err" }
  "$(Get-Date -Format HH:mm) $p $($line -replace '^[^{]*','') $err"
}
[IO.File]::WriteAllText("$Run\anchor-dryrun.json", ($out | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
"GOTOVO $($profiles.Count) profila"
