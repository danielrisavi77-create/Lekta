# scripts/word-verify/make-worst-case.ps1
#
# Napravi PRAVIM Wordom rad u kojem je prema uputama krivo SVE sto popravak dira, ali koji
# istovremeno sadrzi i sve sto popravak NE SMIJE dirati. Sluzi kao najgori realan slucaj:
# ako ovaj dokument izadje ispravan i neostecen, obicni radovi su lakSi.
#
# KRIVO (mora se popraviti):
#   font Arial 11, jednostruki prored, lijevo poravnanje, razmak iza odlomka 10 pt,
#   margine 2,54 cm, format Letter, nizovi praznih odlomaka u tijelu.
# MORA PREZIVJETI (zastita):
#   prazni odlomci naslovnice (okomiti razmak), polozena sekcija s tablicom, tablica, slika,
#   fusnota, tekst rada, naslovi kao zasebni stilovi.
param([string]$OutDir = '.tmp-word-verify')
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$OutDir = (Resolve-Path $OutDir).Path
$out = Join-Path $OutDir 'z-najgori-slucaj.docx'
if (Test-Path $out) { Remove-Item $out -Force }

# Mala slika, da se dokaze da binarni dio prolazi popravak netaknut.
Add-Type -AssemblyName System.Drawing
$imgPath = Join-Path $OutDir 'slika.png'
$bmp = New-Object System.Drawing.Bitmap 120, 80
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::SteelBlue)
$g.FillEllipse([System.Drawing.Brushes]::Gold, 20, 15, 80, 50)
$g.Dispose()
$bmp.Save($imgPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$word = New-Object -ComObject Word.Application
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Add()
  $sel = $word.Selection

  # --- NASLOVNICA: bez stilova naslova, razmak napravljen praznim odlomcima ---
  $sel.Style = $doc.Styles.Item('Normal')
  $sel.ParagraphFormat.Alignment = 1   # centrirano
  $sel.TypeText('SVEUCILISTE U ZAGREBU'); $sel.TypeParagraph()
  $sel.TypeText('FAKULTET POLITICKIH ZNANOSTI'); $sel.TypeParagraph()
  1..6 | ForEach-Object { $sel.TypeParagraph() }        # namjerni okomiti razmak
  $sel.TypeText('Ime Prezime'); $sel.TypeParagraph()
  1..2 | ForEach-Object { $sel.TypeParagraph() }
  $sel.TypeText('NASLOV DIPLOMSKOG RADA'); $sel.TypeParagraph()
  1..2 | ForEach-Object { $sel.TypeParagraph() }
  $sel.TypeText('DIPLOMSKI RAD'); $sel.TypeParagraph()
  1..5 | ForEach-Object { $sel.TypeParagraph() }
  $sel.TypeText('Zagreb, 2026.'); $sel.TypeParagraph()
  $sel.InsertBreak([int]7)                              # prijelom stranice (wdPageBreak)

  # --- SADRZAJ: rucno tipkan, bez polja ---
  $sel.ParagraphFormat.Alignment = 0
  $sel.Style = $doc.Styles.Item('Heading 1')
  $sel.TypeText('Sadrzaj'); $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal')
  $sel.TypeText("1. Uvod`t3"); $sel.TypeParagraph()
  $sel.TypeText("2. Razrada`t5"); $sel.TypeParagraph()
  $sel.TypeText("3. Zakljucak`t9"); $sel.TypeParagraph()
  $sel.InsertBreak([int]7)

  # --- UVOD ---
  $sel.Style = $doc.Styles.Item('Heading 1')
  $sel.TypeText('Uvod'); $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal')
  $sel.TypeText('Ovaj rad bavi se pitanjem koje je u hrvatskoj literaturi slabo obradjeno, a dijakriticki znakovi cscdz moraju prezivjeti popravak neizmijenjeni.')
  $sel.TypeParagraph()
  $doc.Footnotes.Add($sel.Range, '', 'Fusnota uz uvodni odlomak.') | Out-Null
  $sel.TypeParagraph()
  1..4 | ForEach-Object { $sel.TypeParagraph() }        # visak praznih odlomaka U TIJELU (mora se sazeti)
  $sel.TypeText('Drugi odlomak uvoda koji je dovoljno dug da se vidi kako se mijenja prelamanje redaka nakon promjene proreda i poravnanja.')
  $sel.TypeParagraph()

  # --- RAZRADA sa slikom ---
  $sel.Style = $doc.Styles.Item('Heading 1')
  $sel.TypeText('Razrada'); $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal')
  $sel.TypeText('Slika ispod mora izaci bit-identicna iz popravka.'); $sel.TypeParagraph()
  $doc.InlineShapes.AddPicture($imgPath, $false, $true, $sel.Range) | Out-Null
  $sel.TypeParagraph()

  # --- POLOZENI PRILOG s tablicom (sekcija koja se NE SMIJE uspraviti) ---
  $sel.InsertBreak([int]2)                              # wdSectionBreakNextPage
  $doc.Sections.Item($doc.Sections.Count).PageSetup.Orientation = 1   # wdOrientLandscape
  $sel.Style = $doc.Styles.Item('Heading 1')
  $sel.TypeText('Prilog: siroka tablica'); $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal')
  $tbl = $doc.Tables.Add($sel.Range, 3, 4)
  $tbl.Borders.Enable = $true
  for ($r = 1; $r -le 3; $r++) { for ($c = 1; $c -le 4; $c++) { $tbl.Cell($r,$c).Range.Text = "R$r-S$c" } }

  # --- SVE KRIVO PREMA UPUTAMA (izravno oblikovanje preko cijelog dokumenta) ---
  $all = $doc.Content
  $all.Font.Name = 'Arial'
  $all.Font.Size = 11
  $all.ParagraphFormat.LineSpacingRule = 0              # jednostruki, treba 1,5
  $all.ParagraphFormat.SpaceAfter = 10                  # treba 0
  # poravnanje: lijevo svugdje osim naslovnice (koja mora ostati centrirana)
  $doc.Content.Paragraphs | ForEach-Object {
    if ($_.Range.Start -gt 900) { $_.Alignment = 0 }
  }
  # krive postavke stranice u SVIM sekcijama
  foreach ($s in $doc.Sections) {
    $s.PageSetup.TopMargin = 72; $s.PageSetup.BottomMargin = 72
    $s.PageSetup.LeftMargin = 72; $s.PageSetup.RightMargin = 72   # 2,54 cm, treba 3 / 2,5
  }
  $doc.Sections.Item(1).PageSetup.PaperSize = 2                    # wdPaperLetter, treba A4

  $doc.SaveAs2([string]$out, [int]16)
  $doc.Close([int]0)
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

Write-Output "Napravljen najgori slucaj: $out ($((Get-Item $out).Length) B)"
