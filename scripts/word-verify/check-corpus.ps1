# scripts/word-verify/check-corpus.ps1
#
# Tier 2 nad COMMITANIM KORPUSOM: provuce svaki `tests/fixtures/docx/*.docx` kroz pravi repair
# motor, pa popravljeni paket otvori PRAVIM Wordom uz `OpenAndRepair=false`.
#
# ZASTO POSTOJI: `check.ps1` mjeri tri dokumenta koja Word sam napravi, a `check-worst-case.ps1`
# jedan sastavljen najgori slucaj. Commitani korpus (LibreOffice izlaz, pravi Word radovi, pravni
# fixturi s fusnotama, doktorska disertacija) do 2026-08-30 nije prosao kroz Word NIJEDNOM. Tier 0 i
# Tier 1 ga vrte, ali nijedan od njih ne odgovara na pitanje "hoce li se korisniku otvoriti".
#
#   powershell -File scripts/word-verify/check-corpus.ps1
#
# Trazi instaliran Microsoft Word. Izlazni kod 1 ako ijedan dokument ne otvori ili izgubi dio.
#
# STO SE TVRDI I STO SE SAMO MJERI, namjerno razdvojeno:
#   TVRDNJA  dokument se otvara bez Wordovog tihog oporavka
#   TVRDNJA  nijedan dio paketa nije IZGUBLJEN
#   MJERI    koliko je dijelova promijenjeno, sto je primijenjeno, sto preskoceno, odlomci prije/poslije
# Vidljivi tekst se NE tvrdi kao nepromijenjen, i to je namjerno: `repair.mts` ukljucuje
# `heading-case-fixer`, koji po CLAUDE.md SMIJE mijenjati vidljivi tekst. Tvrdnja koja bi tu lazno
# padala natjerala bi nekoga da je iskljuci, pa bi se izgubila i ona koja vrijedi.
param(
  [string]$OutDir = '.tmp-word-corpus'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$fixtures = Join-Path $root 'tests\fixtures\docx'

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$OutDir = (Resolve-Path $OutDir).Path

$docs = Get-ChildItem $fixtures -Filter '*.docx' | Sort-Object Name
if ($docs.Count -eq 0) {
  Write-Output 'NIJEDAN fixture nije pronaden (prazan skup je crveno, ne tiho zeleno).'
  exit 1
}
Write-Output "Korpus: $($docs.Count) commitanih fixtura iz tests/fixtures/docx"

# --- 1. Popravak kroz PRAVI motor (isti pozivi kao repair-docx Edge funkcija) ---
$rows = @()
foreach ($d in $docs) {
  $out = Join-Path $OutDir ($d.BaseName + '-popravljen.docx')
  Push-Location $root
  try {
    $json = & npx vite-node 'scripts/word-verify/repair.mts' -- $d.FullName $out 2>&1 | Out-String
  } finally { Pop-Location }
  $start = $json.IndexOf('{')
  if ($start -lt 0) {
    $rows += [pscustomobject]@{ Dokument = $d.BaseName; Izlaz = $null; Greska = 'popravak nije vratio JSON' }
    continue
  }
  $res = ($json.Substring($start) | ConvertFrom-Json)
  $rows += [pscustomobject]@{
    Dokument      = $d.BaseName
    Izlaz         = $out
    Greska        = $null
    Primijenjeno  = [int]($res.primijenjeno | Measure-Object).Count
    Preskoceno    = [int]($res.preskoceno | Measure-Object).Count
    Izgubljeno    = ($res.izgubljeniDijelovi -join ',')
    BitIdenticnih = "$($res.bitIdenticnih)/$($res.dijelovaPrije)"
  }
}

# --- 2. Pravi Word otvara i original i popravljeni ---
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0

function Open-Strict {
  param([string]$path)
  # OpenAndRepair = $false: ostecen dokument baca gresku umjesto tihog oporavka.
  return $word.Documents.Open($path, $false, $true, $false, '', '', $true, '', '', 0, 0, $false, $true, $false, $false)
}

$fail = 0
$report = @()
try {
  foreach ($r in $rows) {
    if ($r.Greska) {
      $fail++
      $report += [pscustomobject]@{ Dokument = $r.Dokument; Otvara = 'PAD: ' + $r.Greska; Odlomci = ''; Dijelovi = ''; Izgubljeno = ''; Primijenjeno = '' }
      continue
    }

    $odlomciPrije = ''
    try {
      $orig = Open-Strict (Join-Path $fixtures ($r.Dokument + '.docx'))
      $odlomciPrije = [int]$orig.Paragraphs.Count
      $orig.Close($false)
    } catch {
      # Ulaz koji se ni sam ne otvara nije nalaz o POPRAVKU; imenuje se, ali ne obara provjeru.
      $odlomciPrije = 'ulaz se ne otvara'
    }

    try {
      $doc = Open-Strict $r.Izlaz
      $odlomciPoslije = [int]$doc.Paragraphs.Count
      $doc.Close($false)

      $izgubljeno = $r.Izgubljeno
      if ($izgubljeno) { $fail++ }

      $report += [pscustomobject]@{
        Dokument     = $r.Dokument
        Otvara       = 'DA'
        Odlomci      = "$odlomciPrije -> $odlomciPoslije"
        Dijelovi     = $r.BitIdenticnih
        Izgubljeno   = $(if ($izgubljeno) { $izgubljeno } else { '-' })
        Primijenjeno = "$($r.Primijenjeno)/$($r.Primijenjeno + $r.Preskoceno)"
      }
    } catch {
      $fail++
      $report += [pscustomobject]@{
        Dokument = $r.Dokument; Otvara = 'PAD: ' + $_.Exception.Message
        Odlomci = ''; Dijelovi = ''; Izgubljeno = ''; Primijenjeno = ''
      }
    }
  }
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

$report | Format-Table -AutoSize | Out-String -Width 400 | Write-Output

if ($fail -gt 0) {
  Write-Output "PAD: $fail od $($rows.Count) dokumenata se ne otvara ili je izgubio dio paketa."
  exit 1
}
Write-Output "SVE PROSLO: svih $($rows.Count) popravljenih paketa otvara pravi Word, nijedan dio nije izgubljen."
exit 0
