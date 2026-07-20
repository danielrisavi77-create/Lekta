# scripts/word-verify/check-worst-case.ps1
#
# Izmjeri najgori slucaj PRIJE i POSLIJE popravka, pravim Wordom. Provjerava dvije stvari koje su
# jednako vazne:
#   POPRAVLJENO: font, velicina, prored, poravnanje, margine, format stranice
#   OCUVANO:     naslovnica (namjerni prazni odlomci), polozeni prilog, tablica, slika, fusnota,
#                tekst s dijakritikom, broj sekcija
#
#   powershell -File scripts/word-verify/check-worst-case.ps1
param([string]$OutDir = '.tmp-word-verify', [switch]$SkipMake)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

if (-not $SkipMake) { & (Join-Path $PSScriptRoot 'make-worst-case.ps1') -OutDir $OutDir | Out-Null }
$OutDir = (Resolve-Path $OutDir).Path
$src = Join-Path $OutDir 'z-najgori-slucaj.docx'
$dst = Join-Path $OutDir 'z-najgori-slucaj-popravljen.docx'

function Measure-Doc {
  param($word, [string]$path)
  $doc = $word.Documents.Open($path, $false, $true, $false, '', '', $true, '', '', 0, 0, $false, $true, $false, $false)
  # Odlomak tijela: prvi odlomak uvodnog teksta
  $bodyIdx = 1
  for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
    if ($doc.Paragraphs.Item($i).Range.Text -match 'Ovaj rad bavi se') { $bodyIdx = $i; break }
  }
  $body = $doc.Paragraphs.Item($bodyIdx).Range
  # Prazni odlomci naslovnice (do naslova Sadrzaj) moraju ostati netaknuti
  $prazni = 0
  for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
    $t = $doc.Paragraphs.Item($i).Range.Text
    if ($t -match 'Sadrzaj') { break }
    if ($t.Trim() -eq '') { $prazni++ }
  }
  $m = [pscustomobject]@{
    Font         = [string]$body.Font.Name
    Velicina     = [double]$body.Font.Size
    Prored       = [double]$body.ParagraphFormat.LineSpacing
    RazmakIza    = [double]$body.ParagraphFormat.SpaceAfter
    Poravnanje   = [int]$body.ParagraphFormat.Alignment
    MarginaL     = [math]::Round($doc.Sections.Item(1).PageSetup.LeftMargin / 28.3465, 2)
    MarginaT     = [math]::Round($doc.Sections.Item(1).PageSetup.TopMargin / 28.3465, 2)
    SirinaCm     = [math]::Round($doc.Sections.Item(1).PageSetup.PageWidth / 28.3465, 1)
    VisinaCm     = [math]::Round($doc.Sections.Item(1).PageSetup.PageHeight / 28.3465, 1)
    Sekcija2Orij = $(if ($doc.Sections.Count -ge 2) { [int]$doc.Sections.Item(2).PageSetup.Orientation } else { -1 })
    Prilog       = $(if ($doc.Sections.Count -ge 2) { '{0}x{1}' -f [math]::Round($doc.Sections.Item(2).PageSetup.PageWidth/28.3465,1), [math]::Round($doc.Sections.Item(2).PageSetup.PageHeight/28.3465,1) } else { '-' })
    Sekcija      = [int]$doc.Sections.Count
    Tablica      = [int]$doc.Tables.Count
    Slika        = [int]$doc.InlineShapes.Count
    Fusnota      = [int]$doc.Footnotes.Count
    Odlomaka     = [int]$doc.Paragraphs.Count
    PrazniNaNasl = $prazni
    Dijakritika  = [bool]($doc.Content.Text -match 'cscdz')
    Naslovnica   = [string]$doc.Paragraphs.Item(1).Range.Text.Trim()
    NaslovFont   = [string]$doc.Styles.Item('Heading 1').Font.Name
    NaslovPt     = [double]$doc.Styles.Item('Heading 1').Font.Size
    NaslovBold   = [int]$doc.Styles.Item('Heading 1').Font.Bold
    FusnotaFont  = [string]$doc.Footnotes.Item(1).Range.Font.Name
    FusnotaPt    = [double]$doc.Footnotes.Item(1).Range.Font.Size
  }
  $doc.Close([int]0)
  return $m
}

Push-Location $root
try { $json = & npx vite-node 'scripts/word-verify/repair.mts' -- $src $dst 2>&1 | Out-String } finally { Pop-Location }
$res = ($json.Substring($json.IndexOf('{')) | ConvertFrom-Json)

$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
try {
  $prije = Measure-Doc $word $src
  $poslije = Measure-Doc $word $dst
} finally {
  $word.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

Write-Output "PRIMIJENJENO: $($res.primijenjeno -join ', ')"
Write-Output "PRESKOCENO:   $(if ($res.preskoceno) { $res.preskoceno -join ', ' } else { '(nista)' })"
Write-Output "DIJELOVI:     $($res.bitIdenticnih)/$($res.dijelovaPrije) bit-identicno; izgubljeno: $(if ($res.izgubljeniDijelovi) { $res.izgubljeniDijelovi -join ',' } else { 'nijedan' })"
Write-Output ''

$script:fail = 0
function Check {
  param([string]$Naziv, $Prije, $Poslije, $Cilj, [switch]$Preserve)
  $ok = if ($Preserve) { $Poslije -eq $Prije } else { $Poslije -eq $Cilj }
  if (-not $ok) { $script:fail++ }
  $ciljTxt = if ($Preserve) { "ostaje $Prije" } else { "$Cilj" }
  Write-Output ('{0} {1,-20} prije={2,-16} poslije={3,-16} cilj={4}' -f $(if ($ok) { 'DA' } else { 'NE' }), $Naziv, $Prije, $Poslije, $ciljTxt)
}

Write-Output '--- MORA SE POPRAVITI ---'
Check 'Font'            $prije.Font       $poslije.Font       'Times New Roman'
Check 'Velicina'        $prije.Velicina   $poslije.Velicina   12
Check 'Prored'          $prije.Prored     $poslije.Prored     18
Check 'Razmak iza'      $prije.RazmakIza  $poslije.RazmakIza  0
Check 'Poravnanje'      $prije.Poravnanje $poslije.Poravnanje 3
Check 'Margina lijevo'  $prije.MarginaL   $poslije.MarginaL   3
Check 'Margina gore'    $prije.MarginaT   $poslije.MarginaT   2.5
Check 'Sirina stranice' $prije.SirinaCm   $poslije.SirinaCm   21
Check 'Visina stranice' $prije.VisinaCm   $poslije.VisinaCm   29.7
# Polozeni prilog mora dobiti A4 sa zamijenjenim stranicama, ne uspravni A4 i ne stari Letter.
Check 'Prilog (polozen)' $prije.Prilog    $poslije.Prilog     '29,7x21'
Check 'Naslov 1 font'    $prije.NaslovFont $poslije.NaslovFont 'Times New Roman'
Check 'Naslov 1 velicina' $prije.NaslovPt  $poslije.NaslovPt   14
Check 'Naslov 1 bold'    $prije.NaslovBold $poslije.NaslovBold -1
Check 'Fusnota font'     $prije.FusnotaFont $poslije.FusnotaFont 'Times New Roman'
Check 'Fusnota velicina' $prije.FusnotaPt  $poslije.FusnotaPt  10

Write-Output ''
Write-Output '--- NE SMIJE SE POKVARITI ---'
Check 'Prazni naslovnice' $prije.PrazniNaNasl $poslije.PrazniNaNasl $null -Preserve
Check 'Polozeni prilog'   $prije.Sekcija2Orij $poslije.Sekcija2Orij $null -Preserve
Check 'Broj sekcija'      $prije.Sekcija      $poslije.Sekcija      $null -Preserve
Check 'Tablica'           $prije.Tablica      $poslije.Tablica      $null -Preserve
Check 'Slika'             $prije.Slika        $poslije.Slika        $null -Preserve
Check 'Fusnota'           $prije.Fusnota      $poslije.Fusnota      $null -Preserve
Check 'Dijakritika'       $prije.Dijakritika  $poslije.Dijakritika  $null -Preserve
Check 'Naslovnica redak'  $prije.Naslovnica   $poslije.Naslovnica   $null -Preserve

Write-Output ''
Write-Output "Odlomaka: $($prije.Odlomaka) -> $($poslije.Odlomaka) (visak praznih u TIJELU se smije saziti)"
if ($script:fail -gt 0) { Write-Output "NEUSPJEH: $script:fail provjera nije proslo."; exit 1 }
Write-Output 'SVE PROSLO.'
