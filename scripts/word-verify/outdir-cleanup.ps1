# scripts/word-verify/outdir-cleanup.ps1
#
# Stavka G (odluka vlasnika 2026-09-26): Word check skripte (check.ps1, check-worst-case.ps1,
# check-corpus.ps1, check-toc-case.ps1) ovu datoteku ukljucuju (dot-source) i SAMO NA USPJEHU
# (neposredno prije `exit 0`) brisu svoj izlazni direktorij. Na padu ga ostavljaju i ispisuju
# putanju, jer su popravljeni paketi koje Word nije otvorio jedini dokaz za dijagnozu.
#
# Brise se samo direktorij koji je
#   1. strogo unutar korijena repozitorija (nikad sam korijen),
#   2. nije tests/fixtures ni ispod njega,
#   3. git ga ignorira (.gitignore: .tmp-word-verify/, .tmp-word-corpus/) i
#   4. ne sadrzi nijednu git-pracenu datoteku.
# Sve ostalo, i svaki kvar same provjere, znaci: ne brisi, samo ispisi zasto.
# Gard: tests/helpers/word-verify-cleanup.ts (tekst) i tests/word-verify-outdir-cleanup.test.ts
# (stvarno izvodjenje funkcije na Windowsu); mutacije u tests/gate-mutations.test.ts.
function Remove-WordVerifyOutDir {
  param([string]$Dir, [string]$RepoRoot)
  $cmp = [System.StringComparison]::OrdinalIgnoreCase
  $sep = [System.IO.Path]::DirectorySeparatorChar
  $puna = { param($p) $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($p).TrimEnd('\', '/') }
  $full = & $puna $Dir
  $korijen = & $puna $RepoRoot
  $fixtures = & $puna (Join-Path $korijen 'tests\fixtures')
  $uRepou = $full.StartsWith($korijen + $sep, $cmp)
  $podFixturama = $full.Equals($fixtures, $cmp) -or $full.StartsWith($fixtures + $sep, $cmp)
  if (-not $uRepou -or $podFixturama) {
    Write-Output "Izlazni direktorij NIJE obrisan (izvan korijena repozitorija ili pod tests/fixtures): $full"
    return
  }
  $ignoriran = $false
  $praceno = @()
  try {
    & git -C $korijen check-ignore -q -- $full | Out-Null
    $ignoriran = ($LASTEXITCODE -eq 0)
    $praceno = @(& git -C $korijen ls-files -- $full)
    if ($LASTEXITCODE -ne 0) { $ignoriran = $false }
  } catch {
    $ignoriran = $false
  }
  if (-not $ignoriran -or $praceno.Count -gt 0) {
    Write-Output "Izlazni direktorij NIJE obrisan (git ga ne ignorira ili sadrzi pracene datoteke): $full"
    return
  }
  try {
    Remove-Item -LiteralPath $full -Recurse -Force -ErrorAction Stop
    Write-Output "Izlazni direktorij obrisan nakon uspjeha: $full"
  } catch {
    Write-Output "Izlazni direktorij nije obrisan ($($_.Exception.Message)): $full"
  }
}
