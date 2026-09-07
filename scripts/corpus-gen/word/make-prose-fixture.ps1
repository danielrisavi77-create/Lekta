# scripts/corpus-gen/word/make-prose-fixture.ps1
#
# Napravi PRAVIM Wordom dokument iz iste proze koju koristi LibreOffice trak.
#
# ZASTO POSTOJI, izmjereno 2026-09-06: `soffice --convert-to docx` ne pise TOC polje UOPCE (nula
# w:instrText, w:fldChar, w:fldSimple); `text:table-of-content` postane staticni popis. Usklađen
# primjerak zato ne moze proci os sadrzaja. Word to moze (`TablesOfContents.Add`), i usput pise
# `w:rsid` na svakom odlomku, oblik koji nijedan drugi put ne proizvodi.
#
# Ulaz je SPEC (JSON) koji pece `generate-word.mts`: tekst dolazi iz proze, a oblik iz Lektinih
# pravila profila. Skripta nista ne izmislja i ne cita profil sama; sve sto oblikuje dolazi iz speca.
#
#   powershell -File scripts/corpus-gen/word/make-prose-fixture.ps1 -Spec <spec.json> -Out <rad.docx>
param(
  [Parameter(Mandatory = $true)][string]$Spec,
  [Parameter(Mandatory = $true)][string]$Out
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Spec)) { throw "Nema speca: $Spec" }
$s = Get-Content -Raw -Encoding UTF8 $Spec | ConvertFrom-Json

$full = if ([System.IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path (Get-Location) $Out }
$dir = Split-Path $full -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
if (Test-Path $full) { Remove-Item $full -Force }

# Zaostao WINWORD drzi COM i tiho produzuje ili obara sljedeci poziv (poznata zamka iz F2.4 speca).
$zaostali = @(Get-Process WINWORD -ErrorAction SilentlyContinue)
if ($zaostali.Count -gt 0) {
  throw "Zaostalo $($zaostali.Count) WINWORD procesa; zatvori ih prije generiranja."
}

# Mala slika za prikaze: dokazuje da binarni dio prolazi kroz paket.
Add-Type -AssemblyName System.Drawing
$imgPath = Join-Path $env:TEMP 'lekta-prose-slika.png'
$bmp = New-Object System.Drawing.Bitmap 160, 100
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::WhiteSmoke)
$g.FillRectangle([System.Drawing.Brushes]::SteelBlue, 20, 20, 120, 60)
$g.Dispose(); $bmp.Save($imgPath, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()

$word = New-Object -ComObject Word.Application
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Add()
  $sel = $word.Selection

  # --- OBLIK IZ PRAVILA PROFILA, ne iz Wordovih zadanih vrijednosti -------------------------------
  $normal = $doc.Styles.Item('Normal')
  $normal.Font.Name = $s.rules.font
  $normal.Font.Size = $s.rules.sizePt
  # wdLineSpaceSingle=0, wdLineSpace1pt5=1, wdLineSpaceDouble=2
  $normal.ParagraphFormat.LineSpacingRule = $s.rules.lineSpacingRule
  # wdAlignParagraphLeft=0, wdAlignParagraphJustify=3
  $normal.ParagraphFormat.Alignment = $(if ($s.rules.justify) { 3 } else { 0 })

  $ps = $doc.PageSetup
  $ps.TopMargin = $word.CentimetersToPoints($s.rules.marginTopCm)
  $ps.BottomMargin = $word.CentimetersToPoints($s.rules.marginBottomCm)
  $ps.LeftMargin = $word.CentimetersToPoints($s.rules.marginLeftCm)
  $ps.RightMargin = $word.CentimetersToPoints($s.rules.marginRightCm)
  $ps.PageWidth = $word.CentimetersToPoints($s.rules.pageWidthCm)
  $ps.PageHeight = $word.CentimetersToPoints($s.rules.pageHeightCm)

  # --- NASLOVNICA: redci dolaze iz Lektina predloska ---------------------------------------------
  $sel.Style = $doc.Styles.Item('Normal')
  $sel.ParagraphFormat.Alignment = 1  # wdAlignParagraphCenter
  foreach ($line in $s.titleLines) {
    if ([string]::IsNullOrWhiteSpace($line)) { $sel.TypeParagraph() } else { $sel.TypeText($line); $sel.TypeParagraph() }
  }
  $sel.InsertBreak(7)  # wdPageBreak
  $sel.ParagraphFormat.Alignment = $(if ($s.rules.justify) { 3 } else { 0 })

  # --- SADRZAJ: ZIVO POLJE, ono zbog cega ovaj trak postoji --------------------------------------
  if ($s.rules.requireToc) {
    $sel.Style = $doc.Styles.Item('Heading 1')
    $sel.TypeText('Sadrzaj'); $sel.TypeParagraph()
    $sel.Style = $doc.Styles.Item('Normal')
    $tocRange = $sel.Range
    # UpperHeadingLevel 1, LowerHeadingLevel 3, s brojevima stranica i hiperpoveznicama.
    $doc.TablesOfContents.Add($tocRange, $true, 1, 3, $false, '', $true, $true, '', $true, $true, $false) | Out-Null
    $sel.EndKey(6) | Out-Null   # wdStory
    $sel.InsertBreak(7)
  }

  # --- SAZETAK I KLJUCNE RIJECI -------------------------------------------------------------------
  $sel.Style = $doc.Styles.Item('Heading 1'); $sel.TypeText('Sazetak'); $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal'); $sel.TypeText($s.abstractHr); $sel.TypeParagraph()
  $sel.TypeText('Kljucne rijeci: ' + ($s.keywordsHr -join ', ')); $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Heading 1'); $sel.TypeText('Abstract'); $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal'); $sel.TypeText($s.abstractEn); $sel.TypeParagraph()
  $sel.TypeText('Keywords: ' + ($s.keywordsEn -join ', ')); $sel.TypeParagraph()

  # --- POGLAVLJA: naslovi kroz PRAVE Word stilove, pa ih TOC polje moze pokupiti ------------------
  $fusnotaIdx = 0
  foreach ($ch in $s.chapters) {
    $razina = [Math]::Min(3, [Math]::Max(1, [int]$ch.level))
    $sel.Style = $doc.Styles.Item("Heading $razina")
    $sel.TypeText([string]$ch.title); $sel.TypeParagraph()
    $sel.Style = $doc.Styles.Item('Normal')
    foreach ($p in $ch.paragraphs) {
      $sel.TypeText([string]$p)
      if ($fusnotaIdx -lt $s.footnotes.Count) {
        $doc.Footnotes.Add($sel.Range, '', [string]$s.footnotes[$fusnotaIdx]) | Out-Null
        $fusnotaIdx++
      }
      $sel.TypeParagraph()
    }
  }

  # --- PRIKAZI: natpis iznad, izvor ispod (element.source trazi redak koji pocinje s "Izvor:") ----
  foreach ($t in $s.tables) {
    $sel.Style = $doc.Styles.Item('Normal')
    $sel.TypeText([string]$t.caption); $sel.TypeParagraph()
    $redaka = $t.rows.Count
    $stupaca = ($t.rows | ForEach-Object { $_.Count } | Measure-Object -Maximum).Maximum
    $tbl = $doc.Tables.Add($sel.Range, $redaka, $stupaca)
    for ($r = 0; $r -lt $redaka; $r++) {
      for ($c = 0; $c -lt $t.rows[$r].Count; $c++) {
        $tbl.Cell($r + 1, $c + 1).Range.Text = [string]$t.rows[$r][$c]
      }
    }
    $sel.EndKey(6) | Out-Null
    $sel.TypeParagraph()
    $sel.TypeText('Izvor: ' + [string]$t.source); $sel.TypeParagraph()
  }
  foreach ($f in $s.figures) {
    $sel.Style = $doc.Styles.Item('Normal')
    $sel.InlineShapes.AddPicture($imgPath) | Out-Null
    $sel.TypeParagraph()
    $sel.TypeText([string]$f.caption); $sel.TypeParagraph()
    $sel.TypeText('Izvor: ' + [string]$f.source); $sel.TypeParagraph()
  }

  # --- POPISI PRIKAZA (element.lists) -------------------------------------------------------------
  if ($s.tables.Count -gt 0) {
    $sel.Style = $doc.Styles.Item('Heading 1'); $sel.TypeText('Popis tablica'); $sel.TypeParagraph()
    $sel.Style = $doc.Styles.Item('Normal')
    foreach ($t in $s.tables) { $sel.TypeText([string]$t.caption); $sel.TypeParagraph() }
  }
  if ($s.figures.Count -gt 0) {
    $sel.Style = $doc.Styles.Item('Heading 1'); $sel.TypeText('Popis slika'); $sel.TypeParagraph()
    $sel.Style = $doc.Styles.Item('Normal')
    foreach ($f in $s.figures) { $sel.TypeText([string]$f.caption); $sel.TypeParagraph() }
  }

  # --- LITERATURA ---------------------------------------------------------------------------------
  $sel.Style = $doc.Styles.Item('Heading 1'); $sel.TypeText('Literatura'); $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal')
  $i = 1
  foreach ($b in $s.bibliography) {
    $sel.TypeText("$i. " + [string]$b); $sel.TypeParagraph()
    $i++
  }

  # --- BROJ STRANICE U PODNOZJU -------------------------------------------------------------------
  if ($s.rules.requirePageNumbers) {
    $hf = $doc.Sections.Item(1).Footers.Item(1).Range
    $hf.ParagraphFormat.Alignment = 1
    $hf.Fields.Add($hf, 33) | Out-Null   # wdFieldPage
  }

  # Osvjezi polja da TOC dobije stvarne stavke i brojeve stranica; bez toga polje postoji ali je
  # prazno, sto je drugo stanje od onoga koje ovaj trak treba pokriti.
  $doc.Fields.Update() | Out-Null
  if ($s.rules.requireToc -and $doc.TablesOfContents.Count -gt 0) {
    $doc.TablesOfContents.Item(1).Update() | Out-Null
  }

  $doc.SaveAs2([string]$full, [int]16)   # wdFormatXMLDocument
  $doc.Close([int]0)
  Write-Output "zapisano: $full"
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
