# scripts/corpus-gen/word/make-violation-witnesses.ps1
#
# SVJEDOCI S NAMJERNIM PREKRSAJIMA (T68, traka `witness`).
#
# Za svaki zadani profil PRAVIM Wordom napravi .docx s izmisljenim akademskim tekstom (nijedna recenica
# nije iz studentskog rada) koji namjerno krsi SVAKO verificirano bodovano pravilo tog profila iz
# data/profiles/repair-map.json (checkId font, font-size, line-spacing, margins, paper-size, justify;
# samo status `verified`). Uz svaki .docx pise sidecar .json: profileId, track `witness`, synthetic true
# i popis namjernih prekrsaja (checkId -> ocekivano / postavljeno).
#
# Harness (tests/real-corpus/harness.ts) svjedoke mjeri u ZASEBNOM skupu `witnessResults`, nikad u
# `results`; ratchet je `WITNESS_CILJANIH_RATCHET` u tests/real-corpus-vacuity.test.ts i dize se u ISTOM
# commitu sa svjedocima.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/corpus-gen/word/make-violation-witnesses.ps1 `
#     -Profiles apuri-zavrsni,hks-diplomski -OutDir tests/fixtures/docx
#
# BEZ WORDA: ispisuje `NEPOKRIVEN: Word nije dostupan` i izlazi s kodom 2, nikad tiho s 0. `-WordProgId`
# postoji samo da se ta grana moze dokazati i na stroju koji Word ima (test daje nepostojeci ProgID).
#
# `-PlanOnly`: bez Worda ispise PLAN (JSON: profil i namjerni prekrsaji koje bi svjedok nosio) i nista ne
# generira. Sluzi Word-free testu izbora krsecih vrijednosti; plan NIJE svjedok i ne ulazi u mjerenje.
#
# PREPORUCENI PROFILI (izracunato 2026-10-04 iz data/profiles/repair-map.json: zapisi sa checkId iz
# gornjih sest i `status: verified`; nijedan profil nema isti checkId dvaput, pa je broj zapisa jednak
# broju razlicitih pravila). Raspodjela po broju pravila: 6 pravila 72 profila, 5 pravila 158, 4 pravila
# 61, 3 pravila 21, 2 pravila 13, 1 pravilo 8, 0 pravila 35 (ukupno 368). Najvise je 6, pa su svi
# preporuceni iz skupine sa 6; medju njima su odabrani oni s NAJRAZLICITIJIM ocekivanim vrijednostima
# (vrijednosti iz verified-profiles.json), da svjedoci ne vjezbaju pet puta isti par:
#   profileId            verified bodovanih pravila   ocekivano
#   apuri-zavrsni        6                            Times New Roman 12, prored 1,5, margine 2,5
#   hks-diplomski        6                            Book Antiqua 11, prored 1,5, margine 2,5 (drugi font i velicina)
#   effectus-diplomski   6                            Times New Roman 12, prored 1,15 (drugi prored)
#   efri-diplomski       6                            Times New Roman 12, prored 1,5, margine 3 (sire margine)
#   grf-zavrsni          6                            Times New Roman 12, margine 2 / 2,5 / 2 / 3,5 (nesimetricne)
# Test `tests/real-corpus-vacuity.test.ts` ponovno izracunava ovaj popis iz repair-map.json i pada ako
# se broj ili profil razidje sa zaglavljem.
#
# IZBOR KRSECE VRIJEDNOSTI. repair-map nosi popis pravila, ne vrijednosti, pa se ocekivane vrijednosti
# citaju iz data/profiles/verified-profiles.json (lokalna datoteka, nikad u pregledniku). Krseca vrijednost
# mora biti IZVAN tolerancije analize, inace svjedok nista ne krsi:
#   margine     ocekivano - 1 cm (najmanje 1 cm). NE 2,54 cm: analiza dopusta 0,36 cm odstupanja
#               (src/scoring/evaluate/formatting.ts), pa je 2,54 prema 2,5 ISPRAVNO, ne prekrsaj.
#               Uze, a ne sire, jer profil s "najmanje 2,5 cm" siru marginu ne kaznjava.
#   font        prvi od Courier New / Comic Sans MS / Verdana koji profil ne dopusta.
#   velicina    prva od 9 / 16 pt koja je barem 2 pt daleko od svake dopustene.
#   prored      jednostruki (1,0), osim kad profil dopusta prored ispod 1,3; tada dvostruki (2,0).
#   papir       Letter umjesto A4.
#   poravnanje  lijevo umjesto obostranog.
param(
  [Parameter(Mandatory = $true)][string[]]$Profiles,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$WordProgId = 'Word.Application',
  [switch]$PlanOnly
)
$ErrorActionPreference = 'Stop'

# Popis profila smije doci i kao jedan niz `a,b,c` (powershell -File ne razlaze zarez u polje).
$Profiles = @($Profiles | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($Profiles.Count -eq 0) { throw 'Nije zadan nijedan profil (-Profiles).' }

# --- 1. WORD PRVO: bez njega nema svjedoka, i to se kaze glasno -----------------------------------------
function Write-Nepokriven([string]$razlog) {
  Write-Output "NEPOKRIVEN: Word nije dostupan ($razlog). Svjedoci nisu generirani; ovo NIJE prolaz."
  exit 2
}
if (-not $PlanOnly) {
  $wordType = $null
  try { $wordType = [type]::GetTypeFromProgID($WordProgId) } catch { $wordType = $null }
  if ($null -eq $wordType) { Write-Nepokriven "ProgID $WordProgId nije registriran" }
}

# --- 2. PRAVILA PROFILA ---------------------------------------------------------------------------------
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$repairMap = Get-Content -Raw -Encoding UTF8 (Join-Path $repoRoot 'data/profiles/repair-map.json') | ConvertFrom-Json
$verifiedPath = Join-Path $repoRoot 'data/profiles/verified-profiles.json'
if (-not (Test-Path $verifiedPath)) { throw "Nema $verifiedPath; ocekivane vrijednosti se ne mogu procitati." }
$verified = Get-Content -Raw -Encoding UTF8 $verifiedPath | ConvertFrom-Json
$SCORED = @('font', 'font-size', 'line-spacing', 'margins', 'paper-size', 'justify')

function Get-ScoredRules([string]$profileId) {
  $entries = $repairMap.$profileId
  if ($null -eq $entries) { throw "Profil $profileId nema zapis u repair-map.json." }
  return @($entries | Where-Object { $SCORED -contains $_.checkId -and $_.status -eq 'verified' })
}

function Get-ProfileRules([string]$profileId) {
  $p = $verified | Where-Object { $_.id -eq $profileId } | Select-Object -First 1
  if ($null -eq $p) { throw "Profil $profileId ne postoji u verified-profiles.json." }
  return $p.rules
}

function Pick-Violation([string]$checkId, $rules) {
  switch ($checkId) {
    'font' {
      $allowed = @($rules.font | Where-Object { $null -ne $_ })
      $set = @('Courier New', 'Comic Sans MS', 'Verdana') | Where-Object { $allowed -notcontains $_ } | Select-Object -First 1
      return @{ expected = $allowed; set = $set }
    }
    'font-size' {
      $allowed = @($rules.size | Where-Object { $null -ne $_ } | ForEach-Object { [double]$_ })
      $set = @(9, 16) | Where-Object { $c = $_; -not ($allowed | Where-Object { [Math]::Abs($_ - $c) -lt 2 }) } | Select-Object -First 1
      return @{ expected = $allowed; set = $set }
    }
    'line-spacing' {
      $allowed = @($rules.spacing | Where-Object { $null -ne $_ } | ForEach-Object { [double]$_ })
      $set = if ($allowed | Where-Object { $_ -lt 1.3 }) { 2.0 } else { 1.0 }
      return @{ expected = $allowed; set = $set }
    }
    'margins' {
      $m = $rules.margins
      $set = [ordered]@{}
      foreach ($side in 'top', 'right', 'bottom', 'left') {
        $want = if ($null -ne $m -and $null -ne $m.$side) { [double]$m.$side } else { 2.5 }
        $set[$side] = [Math]::Max(1.0, $want - 1.0)
      }
      return @{ expected = $m; set = $set }
    }
    'paper-size' {
      # Letter je prekrsaj samo ako ga profil ne dopusta; inace bi sidecar imenovao prekrsaj koji to nije.
      $allowed = @($rules.paperSizes | Where-Object { $null -ne $_ })
      if ($allowed -contains 'Letter') { throw "Profil dopusta Letter; generator nema drugi format kojim bi krsio paper-size." }
      return @{ expected = $(if ($allowed.Count -gt 0) { $allowed } else { 'A4' }); set = 'Letter' }
    }
    'justify' { return @{ expected = 'obostrano'; set = 'lijevo' } }
  }
  throw "Nepoznat checkId $checkId."
}

# --- 3. IZMISLJEN AKADEMSKI TEKST (nijedna recenica nije iz studentskog rada) ---------------------------
$naslovi = @('Uvod', 'Teorijski okvir', 'Metodologija', 'Rasprava', 'Zakljucak')
$odlomci = @(
  'Ovaj rad razmatra opce nacelo prema kojem se formalna pravila pisanja provjeravaju neovisno o sadrzaju, pa se ista provjera moze primijeniti na razlicita podrucja.',
  'Polaziste je pretpostavka da ujednacen izgled teksta olaksava citanje i ocjenjivanje, a da odstupanja od propisanog oblika ne govore nista o kvaliteti argumentacije.',
  'Izmisljeni primjer opisuje istrazivanje provedeno na zamisljenom uzorku, pri cemu su svi podaci i imena izmisljeni iskljucivo za potrebe ovog ogleda.',
  'Rezultati zamisljenog istrazivanja prikazani su opisno, bez tablica i slika, kako bi se pazljivo odvojilo ono sto se mjeri od onoga sto se tek pretpostavlja.',
  'U raspravi se zakljucuje da je dosljedan oblik preduvjet za postenu usporedbu radova, ali da sam po sebi ne jamci nijednu tvrdnju o njihovu sadrzaju.'
)

function New-Witness($word, [string]$profileId, [string]$outFile, $violations) {
  $doc = $word.Documents.Add()
  try {
    $sel = $word.Selection
    $sel.Style = $doc.Styles.Item('Normal')
    $sel.ParagraphFormat.Alignment = 1   # naslovnica centrirano
    $sel.TypeText('SVJEDOK NAMJERNIH PREKRSAJA'); $sel.TypeParagraph()
    $sel.TypeText("Profil: $profileId"); $sel.TypeParagraph()
    $sel.TypeText('Izmisljeni rad za mjerenje popravka oblika'); $sel.TypeParagraph()
    $sel.InsertBreak([int]7)             # wdPageBreak
    foreach ($naslov in $naslovi) {
      $sel.Style = $doc.Styles.Item('Heading 1')
      $sel.TypeText($naslov); $sel.TypeParagraph()
      $sel.Style = $doc.Styles.Item('Normal')
      foreach ($o in $odlomci) { $sel.TypeText($o); $sel.TypeParagraph() }
    }

    # Namjerni prekrsaji: izravno oblikovanje preko cijelog dokumenta, kao kod make-worst-case.ps1.
    $all = $doc.Content
    foreach ($v in $violations) {
      switch ($v.checkId) {
        'font' { $all.Font.Name = [string]$v.set }
        'font-size' { $all.Font.Size = [double]$v.set }
        'line-spacing' {
          # wdLineSpaceSingle = 0, wdLineSpaceDouble = 2
          $all.ParagraphFormat.LineSpacingRule = $(if ([double]$v.set -ge 2) { 2 } else { 0 })
        }
        'justify' {
          foreach ($p in $doc.Paragraphs) { if ($p.Range.Start -gt 200) { $p.Alignment = 0 } }  # wdAlignParagraphLeft
        }
        'margins' {
          foreach ($s in $doc.Sections) {
            $s.PageSetup.TopMargin = $word.CentimetersToPoints([double]$v.set.top)
            $s.PageSetup.RightMargin = $word.CentimetersToPoints([double]$v.set.right)
            $s.PageSetup.BottomMargin = $word.CentimetersToPoints([double]$v.set.bottom)
            $s.PageSetup.LeftMargin = $word.CentimetersToPoints([double]$v.set.left)
          }
        }
        'paper-size' { foreach ($s in $doc.Sections) { $s.PageSetup.PaperSize = 2 } }  # wdPaperLetter
      }
    }
    $doc.SaveAs2([string]$outFile, [int]16)  # wdFormatXMLDocument
  } finally {
    $doc.Close([int]0)
  }
}

function Get-Plan([string]$profileId) {
  $rules = Get-ProfileRules $profileId
  $scored = Get-ScoredRules $profileId
  if ($scored.Count -eq 0) { throw "Profil $profileId nema nijedno verificirano bodovano pravilo; svjedok bi bio prazan." }
  return @($scored | ForEach-Object {
    $pick = Pick-Violation $_.checkId $rules
    # Bez krsece vrijednosti svjedok bi tiho NE krsio pravilo koje sidecar imenuje: glasno odbij.
    if ($null -eq $pick.set) { throw "Profil ${profileId}: nema krsece vrijednosti za $($_.checkId) izvan dopustenih." }
    if ($_.checkId -eq 'line-spacing' -and ($pick.expected | Where-Object { [Math]::Abs($_ - [double]$pick.set) -le 0.2 })) {
      throw "Profil ${profileId}: prored $($pick.set) je unutar 0,2 od dopustenog."
    }
    [ordered]@{ ruleId = $_.ruleId; checkId = $_.checkId; expected = $pick.expected; set = $pick.set }
  })
}

if ($PlanOnly) {
  $plan = @($Profiles | ForEach-Object { [ordered]@{ profileId = $_; track = 'witness'; violations = @(Get-Plan $_) } })
  Write-Output (ConvertTo-Json -InputObject $plan -Depth 6)
  exit 0
}

# --- 4. GENERIRANJE -------------------------------------------------------------------------------------
# Plan za SVE profile prije ijednog zapisa: profil koji ne moze dati svjedoka (npr. dopusta Letter) mora
# zaustaviti skriptu prije nego sto raniji profili ostave djelomican skup svjedoka na disku.
$planovi = [ordered]@{}
foreach ($profileId in $Profiles) { $planovi[$profileId] = @(Get-Plan $profileId) }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$OutDir = (Resolve-Path $OutDir).Path

$zaostali = @(Get-Process WINWORD -ErrorAction SilentlyContinue)
if ($zaostali.Count -gt 0) { throw "Zaostalo $($zaostali.Count) WINWORD procesa; zatvori ih prije generiranja." }

$word = $null
try { $word = New-Object -ComObject $WordProgId } catch { Write-Nepokriven $_.Exception.Message }
$utf8 = New-Object System.Text.UTF8Encoding $false
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  foreach ($profileId in $Profiles) {
    $violations = $planovi[$profileId]
    $base = "svjedok-$profileId"
    $docxPath = Join-Path $OutDir "$base.docx"
    if (Test-Path $docxPath) { Remove-Item $docxPath -Force }
    New-Witness $word $profileId $docxPath $violations
    $sidecar = [ordered]@{
      profileId = $profileId
      track = 'witness'
      synthetic = $true
      generator = 'scripts/corpus-gen/word/make-violation-witnesses.ps1'
      wordVersion = [string]$word.Version
      violations = $violations
    }
    [System.IO.File]::WriteAllText((Join-Path $OutDir "$base.json"), (($sidecar | ConvertTo-Json -Depth 6) + "`n"), $utf8)
    Write-Output "svjedok: $docxPath ($($violations.Count) namjernih prekrsaja)"
  }
} finally {
  if ($null -ne $word) {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  }
}
