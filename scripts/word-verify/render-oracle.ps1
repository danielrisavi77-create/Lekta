# scripts/word-verify/render-oracle.ps1
#
# TRECI ORAKUL: sto Word STVARNO vidi. Otvara svaki rad iz vanjskog korpusa uz OpenAndRepair=false
# i cita velicinu stranice i margine iz WORDOVA modela, pa ih usporedjuje s onim sto je izmjerio
# `scripts/corpus-oracle.py`.
#
# ZASTO POSTOJI: `corpus-oracle.py` i Lekta OBJE citaju OOXML. Ako Word renderira drukcije nego sto
# XML sugerira, mogu se sloziti i obje biti u krivu o tome sto student vidi. Ovo je jedina provjera
# koja odgovara na pitanje "hoce li se korisniku otvoriti i hoce li izgledati kako mislimo".
#
# Upis ide u `renderOracle` u sidecaru; ne dira nista drugo.
#
#   powershell -ExecutionPolicy Bypass -File scripts/word-verify/render-oracle.ps1

$ErrorActionPreference = 'Stop'
$corpus = $env:LEKTA_CORPUS_ROOT
if (-not $corpus) { $corpus = 'C:/Users/PC/LektaCorpus/corpus' }
$now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$ok = 0; $mismatch = 0; $failed = 0

# Word mjeri u tockama; 1 cm = 28.3465 tocke.
function ToCm([double]$points) { return [math]::Round($points / 28.3465, 2) }

Get-ChildItem -Path $corpus -Filter *.docx | ForEach-Object {
  $docx = $_.FullName
  $side = [System.IO.Path]::ChangeExtension($docx, '.json')
  if (-not (Test-Path $side)) { return }
  $j = Get-Content $side -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not $j.profileId) { return }
  if (-not $j.expected -or -not $j.expected.findings -or $j.expected.findings.Count -eq 0) { return }

  $opened = $false; $matches = $false; $note = ''
  try {
    # OpenAndRepair=false je bitan: s popravkom bi Word sam sanirao paket i sakrio kvar.
    $doc = $word.Documents.Open($docx, [ref]$false, [ref]$true, [ref]$false, [ref]'', [ref]'',
                                [ref]$false, [ref]'', [ref]'', [ref]0, [ref]0, [ref]$false,
                                [ref]$false, [ref]$false, [ref]$false)
    $opened = $true
    $ps = $doc.PageSetup
    $wCm = ToCm $ps.PageWidth
    $hCm = ToCm $ps.PageHeight
    $isA4 = ([math]::Abs($wCm - 21.0) -lt 0.2) -and ([math]::Abs($hCm - 29.7) -lt 0.2)

    # Usporedi s onim sto je python orakul zapisao kao ocekivanje za format stranice.
    $expA4 = $j.expected.findings | Where-Object { $_.checkId -eq 'page.size.a4' }
    if ($expA4) {
      # expectFail = true znaci "NIJE A4"; Word mora reci isto.
      $matches = ($expA4.expectFail -eq (-not $isA4))
      $note = "Word: $wCm x $hCm cm (A4=$isA4), orakul ocekuje pad=$($expA4.expectFail)"
    } else {
      $matches = $true
      $note = "Word: $wCm x $hCm cm; profil ne propisuje format stranice"
    }
    $doc.Close([ref]$false)
  } catch {
    $note = 'Word nije otvorio dokument: ' + $_.Exception.Message
  }

  if (-not $opened) { $failed++ } elseif ($matches) { $ok++ } else { $mismatch++ }

  $j | Add-Member -NotePropertyName renderOracle -NotePropertyValue ([pscustomobject]@{
    tool = 'word-com'; ranAt = $now; opened = $opened; matches = $matches; note = $note
  }) -Force
  # BEZ BOM-a. `Set-Content -Encoding UTF8` u Windows PowerShellu 5.1 pise BOM, a JSON.parse na njega
  # puca: prvi prolaz je time ucinio 40 sidecara necitljivima i broj radova s profilom pao je 48 -> 8.
  [System.IO.File]::WriteAllText($side, ($j | ConvertTo-Json -Depth 12), (New-Object System.Text.UTF8Encoding($false)))
}

$word.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
Write-Output "[word-orakul] slaze se: $ok | ne slaze se: $mismatch | nije otvorio: $failed"
