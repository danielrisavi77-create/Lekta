# scripts/word-verify/outdir-cleanup.ps1
#
# Stavka G (odluka vlasnika 2026-09-26): Word check skripte (check.ps1, check-worst-case.ps1,
# check-corpus.ps1, check-toc-case.ps1) ovu datoteku ukljucuju (dot-source) i SAMO NA USPJEHU
# (neposredno prije `exit 0`) brisu svoj izlazni direktorij. Na padu ga ostavljaju i ispisuju
# putanju, jer su popravljeni paketi koje Word nije otvorio jedini dokaz za dijagnozu.
#
# Brise se samo direktorij koji ispunjava SVE uvjete:
#   1. pozivatelj je predao broj stvarno provjerenih dokumenata veci od nule (-CheckedCount);
#      `check.ps1 -SkipMake -OutDir <mapa bez DOCX-a>` ima $fail = 0, a to nije uspjeh;
#   2. ime (leaf) je tocno jedno iz allowliste .tmp-word-verify ili .tmp-word-corpus (bez razlike
#      velikih slova). Bez allowliste `-OutDir node_modules` (git ga ignorira, u njemu nema
#      pracenih datoteka) na uspjehu rekurzivno obrise node_modules (Codex nalaz, krug 2);
#   3. roditelj je tocno korijen repozitorija (ni sam korijen, ni dublje, ni tests/fixtures);
#   4. direktorij NIJE reparse point (junction ili simbolicka veza), a ni nijedan unos ispod njega,
#      jer rekurzivno brisanje kroz junction brise tudji cilj;
#   5. git ga ignorira (.gitignore) i ne sadrzi nijednu git-pracenu datoteku.
# Sve ostalo, i svaki kvar same provjere, znaci: ne brisi, samo ispisi zasto.
# Gard: tests/helpers/word-verify-cleanup.ts (tekst) i tests/word-verify-outdir-cleanup.test.ts
# (stvarno izvodjenje funkcije na Windowsu); mutacije u tests/gate-mutations.test.ts.
function Remove-WordVerifyOutDir {
  param(
    [Parameter(Mandatory = $true)][string]$Dir,
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)][int]$CheckedCount
  )
  $cmp = [System.StringComparison]::OrdinalIgnoreCase
  $dozvoljenaImena = @('.tmp-word-verify', '.tmp-word-corpus')
  $puna = { param($p) $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($p).TrimEnd('\', '/') }
  $full = & $puna $Dir
  $korijen = & $puna $RepoRoot
  if ($CheckedCount -le 0) {
    Write-Output "Izlazni direktorij NIJE obrisan (provjereno $CheckedCount dokumenata, bez provjere nema uspjeha): $full"
    return
  }
  $ime = Split-Path -Path $full -Leaf
  $dozvoljeno = @($dozvoljenaImena | Where-Object { $_.Equals($ime, $cmp) }).Count -eq 1
  if (-not $dozvoljeno) {
    Write-Output "Izlazni direktorij NIJE obrisan (ime '$ime' nije .tmp-word-verify ni .tmp-word-corpus): $full"
    return
  }
  $roditelj = (Split-Path -Path $full -Parent).TrimEnd('\', '/')
  if (-not $roditelj.Equals($korijen, $cmp)) {
    Write-Output "Izlazni direktorij NIJE obrisan (roditelj nije korijen repozitorija $korijen): $full"
    return
  }
  $reparse = $null
  try {
    $item = Get-Item -LiteralPath $full -Force -ErrorAction Stop
    if (-not $item.PSIsContainer) {
      $reparse = 'nije direktorij'
    } elseif ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
      $reparse = 'direktorij je junction ili simbolicka veza'
    } else {
      # Obilazak bez ulaska u reparse point: prvi takav unos zaustavlja brisanje.
      $stog = New-Object 'System.Collections.Generic.Stack[System.IO.DirectoryInfo]'
      $stog.Push([System.IO.DirectoryInfo]$item)
      while ($null -eq $reparse -and $stog.Count -gt 0) {
        foreach ($c in $stog.Pop().GetFileSystemInfos()) {
          if ($c.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            $reparse = "sadrzi junction ili simbolicku vezu $($c.FullName)"
            break
          }
          if ($c -is [System.IO.DirectoryInfo]) { $stog.Push($c) }
        }
      }
    }
  } catch {
    $reparse = "stanje nije izmjereno: $($_.Exception.Message)"
  }
  if ($null -ne $reparse) {
    Write-Output "Izlazni direktorij NIJE obrisan ($reparse): $full"
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
    Write-Output "Izlazni direktorij obrisan nakon uspjeha ($CheckedCount provjerenih dokumenata): $full"
  } catch {
    Write-Output "Izlazni direktorij nije obrisan ($($_.Exception.Message)): $full"
  }
}
