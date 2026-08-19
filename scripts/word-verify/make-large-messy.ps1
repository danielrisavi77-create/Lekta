# scripts/word-verify/make-large-messy.ps1
#
# Napravi PRAVIM Wordom veliki, neuredan rad koji pokriva strukturne osobine sto ih commitani
# korpus NEMA, a stvarni radovi ih imaju gotovo redovito (izmjereno sondom nad 38 stvarnih radova):
#
#   >400 odlomaka          24/38 stvarnih, 0/12 commitanih
#   >20 praznih odlomaka   34/38 stvarnih, 0/12 commitanih
#   >3 sekcije              7/38 stvarnih, 0/12 commitanih
#   neprihvacene revizije   1/38 stvarnih, 0/12 commitanih
#
# Tekst je IZMISLJEN, dakle nema nicijih osobnih podataka i fixture se smije commitati. To je
# ista praksa kao kod fer-diplomski-puna-struktura (generirano, anonimno, kompozitna struktura).
param([string]$Out = 'tests/fixtures/docx/word-veliki-neuredan.docx')
$ErrorActionPreference = 'Stop'

$full = Join-Path (Get-Location) $Out
$dir = Split-Path $full -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
if (Test-Path $full) { Remove-Item $full -Force }

# Mala slika: dokazuje da binarni dio prolazi popravak netaknut.
Add-Type -AssemblyName System.Drawing
$imgPath = Join-Path $env:TEMP 'lekta-fixture-slika.png'
$bmp = New-Object System.Drawing.Bitmap 140, 90
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::SteelBlue)
$g.FillRectangle([System.Drawing.Brushes]::Gold, 20, 20, 100, 50)
$g.Dispose(); $bmp.Save($imgPath, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()

$word = New-Object -ComObject Word.Application
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Add()
  $sel = $word.Selection

  # Krivo oblikovanje koje popravak treba uhvatiti (Arial 11, jednostruko, lijevo).
  $doc.Styles.Item('Normal').Font.Name = 'Arial'
  $doc.Styles.Item('Normal').Font.Size = 11
  $doc.Styles.Item('Normal').ParagraphFormat.LineSpacingRule = 0
  $doc.Styles.Item('Normal').ParagraphFormat.Alignment = 0

  # --- SEKCIJA 1: naslovnica, razmak praznim odlomcima (mora prezivjeti) ---
  $sel.Style = $doc.Styles.Item('Normal')
  $sel.TypeText('SVEUCILISTE U ZAGREBU'); $sel.TypeParagraph()
  1..8 | ForEach-Object { $sel.TypeParagraph() }
  $sel.TypeText('NASLOV IZMISLJENOG RADA ZA POKRIVENOST FIXERA'); $sel.TypeParagraph()
  1..6 | ForEach-Object { $sel.TypeParagraph() }
  $sel.TypeText('Zagreb, 2026.'); $sel.TypeParagraph()
  $sel.InsertBreak(2)   # wdSectionBreakNextPage

  # --- SEKCIJA 2: sadrzaj BEZ polja (uvjet za toc-field-fixer) ---
  $sel.Style = $doc.Styles.Item('Heading 1'); $sel.TypeText('Sadrzaj'); $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal'); $sel.TypeText('(bez polja sadrzaja)'); $sel.TypeParagraph()
  $sel.InsertBreak(2)

  # --- SEKCIJA 3: glavni tekst, dug i s viskom praznih odlomaka ---
  $poglavlja = @('Uvod', 'Teorijski okvir', 'Metodologija', 'Rezultati', 'Rasprava', 'Zakljucak')
  foreach ($p in $poglavlja) {
    $sel.Style = $doc.Styles.Item('Heading 1'); $sel.TypeText($p); $sel.TypeParagraph()
    $sel.Style = $doc.Styles.Item('Normal')
    1..60 | ForEach-Object {
      $sel.TypeText("Odlomak $_ poglavlja $p. Dijakriticki znakovi cscdz moraju prezivjeti popravak neizmijenjeni.")
      $sel.TypeParagraph()
      if ($_ % 10 -eq 0) { $sel.TypeParagraph() }   # visak praznih u TIJELU (smije se saziti)
    }
  }

  # Tablica i slika (ne smiju se pokvariti).
  $sel.Style = $doc.Styles.Item('Normal'); $sel.TypeText('Tablica 1. Izmisljeni podaci'); $sel.TypeParagraph()
  $tbl = $doc.Tables.Add($sel.Range, 3, 4); $tbl.Cell(1, 1).Range.Text = 'A'; $tbl.Cell(3, 4).Range.Text = 'B'
  $sel.EndKey(6) | Out-Null; $sel.TypeParagraph()
  $sel.TypeText('Slika 1. Izmisljeni prikaz'); $sel.TypeParagraph()
  $sel.InlineShapes.AddPicture($imgPath) | Out-Null; $sel.TypeParagraph()

  # Fusnota.
  $sel.TypeText('Recenica s fusnotom.')
  $doc.Footnotes.Add($sel.Range, '', 'Izmisljena biljeska.') | Out-Null
  $sel.TypeParagraph()

  # --- SEKCIJA 4: polozeni prilog (cetvrta sekcija) ---
  $sel.InsertBreak(2)
  $doc.Sections.Item($doc.Sections.Count).PageSetup.Orientation = 1   # wdOrientLandscape
  $sel.Style = $doc.Styles.Item('Heading 1'); $sel.TypeText('Prilog A'); $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal'); $sel.TypeText('Sadrzaj priloga.'); $sel.TypeParagraph()

  # Zaglavlje i podnozje s PAGE poljem.
  $hf = $doc.Sections.Item(3).Footers.Item(1).Range
  $hf.Fields.Add($hf, 33) | Out-Null   # wdFieldPage

  # --- NEPRIHVACENE REVIZIJE (Track Changes) ---
  $doc.TrackRevisions = $true
  $sel.TypeText('Ova recenica je umetnuta uz ukljucene revizije i ostaje neprihvacena.')
  $sel.TypeParagraph()
  $doc.TrackRevisions = $false

  $doc.SaveAs2([string]$full, [int]16)
  $doc.Close([int]0)
  Write-Host "Napravljen: $full"
  Write-Host "Odlomaka: $($doc.Paragraphs.Count)"
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
