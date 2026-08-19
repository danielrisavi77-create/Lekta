# scripts/word-verify/make-toc-case.ps1
#
# Napravi PRAVIM Wordom rad koji ima naslov "Sadrzaj" ali NEMA TOC polje, plus stvarne
# Heading naslove. To je tocno uvjet pod kojim se toc-field-fixer nudi (repair-items.ts:
# postoji sadrzajParagraphIndex, a hasTocField !== true).
#
# Sluzi dokazivanju izuzeca iz CLAUDE.md: toc-field-fixer smije mijenjati vidljivi tekst jer
# tekst sadrzaja GENERIRA Word iz polja, a ne autor. Provjera je u check-toc-case.ps1.
param([string]$OutDir = '.tmp-word-verify')
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$OutDir = (Resolve-Path $OutDir).Path
$out = Join-Path $OutDir 'toc-slucaj.docx'
if (Test-Path $out) { Remove-Item $out -Force }

$word = New-Object -ComObject Word.Application
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Add()
  $sel = $word.Selection

  # --- Naslovnica (obican tekst, bez stilova naslova) ---
  $sel.Style = $doc.Styles.Item('Normal')
  $sel.TypeText('SVEUCILISTE U ZAGREBU')
  $sel.TypeParagraph()
  $sel.TypeText('Diplomski rad')
  $sel.TypeParagraph()
  $sel.InsertBreak(7)   # wdPageBreak

  # --- Naslov "Sadrzaj" BEZ ijednog TOC polja ispod njega ---
  $sel.Style = $doc.Styles.Item('Heading 1')
  $sel.TypeText('Sadrzaj')
  $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal')
  $sel.TypeText('(ovdje jos nema polja sadrzaja)')
  $sel.TypeParagraph()
  $sel.InsertBreak(7)

  # --- Stvarni naslovi koje ce Word kasnije pokupiti u sadrzaj ---
  $sel.Style = $doc.Styles.Item('Heading 1')
  $sel.TypeText('Uvod')
  $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal')
  $sel.TypeText('Uvodni odlomak s dijakritikom: cscdz mora prezivjeti popravak.')
  $sel.TypeParagraph()

  $sel.Style = $doc.Styles.Item('Heading 1')
  $sel.TypeText('Teorijski okvir')
  $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal')
  $sel.TypeText('Tekst teorijskog okvira.')
  $sel.TypeParagraph()

  $sel.Style = $doc.Styles.Item('Heading 2')
  $sel.TypeText('Pojmovno odredjenje')
  $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal')
  $sel.TypeText('Tekst pododjeljka.')
  $sel.TypeParagraph()

  $sel.Style = $doc.Styles.Item('Heading 1')
  $sel.TypeText('Zakljucak')
  $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal')
  $sel.TypeText('Zakljucni odlomak.')
  $sel.TypeParagraph()

  $doc.SaveAs2([string]$out, [int]16)   # wdFormatDocumentDefault (.docx)
  $doc.Close([int]0)
  Write-Host "Napravljen: $out"
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
