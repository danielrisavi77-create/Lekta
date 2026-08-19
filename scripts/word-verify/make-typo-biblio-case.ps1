# scripts/word-verify/make-typo-biblio-case.ps1
#
# Dokument u kojem se SUDARAJU dva popravka koja mijenjaju TEKST istog odlomka:
#   - croatian-typography-fixer (dvostruki razmaci, "...", razmak pred %, crtice, decimalna tocka)
#   - bibliography-repair-fixer / link-doi-fixer (zapisi literature s DOI-jem)
#
# Tipografske greske su NAMJERNO unutar samih zapisa literature, jer je to najgori slucaj: oba
# fixera ciljaju ISTI odlomak. Sluzi provjeri je li premjestanje croatian-typographyja na pocetak
# faze (ANCHOR_SENSITIVE_FIXERS) stvorilo novi RE-55 sudar.
#
# Tekst je IZMISLJEN (izmisljeni autori, naslovi i DOI-jevi), pa nema nicijih osobnih podataka.
param([string]$Out = 'tests/fixtures/docx/typografija-i-literatura.docx')
$ErrorActionPreference = 'Stop'

$full = Join-Path (Get-Location) $Out
$dir = Split-Path $full -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
if (Test-Path $full) { Remove-Item $full -Force }

$word = New-Object -ComObject Word.Application
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Add()
  $sel = $word.Selection

  $sel.Style = $doc.Styles.Item('Heading 1'); $sel.TypeText('Uvod'); $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal')
  # Tipografske greske u TIJELU: dvostruki razmaci, tri tocke, razmak pred postotkom, decimalna tocka.
  $sel.TypeText('Ovaj rad  ima dvostruke  razmake, tri tocke... i 15 % udjela te vrijednost 3.14 u tekstu.')
  $sel.TypeParagraph()

  $sel.Style = $doc.Styles.Item('Heading 1'); $sel.TypeText('Literatura'); $sel.TypeParagraph()
  $sel.Style = $doc.Styles.Item('Normal')
  # Zapisi literature: NAMJERNO neabecedni, s DOI-jem i s ISTIM tipografskim greskama u sebi.
  $sel.TypeText('Zelenko, M. (2021). Izmisljeni naslov o mjerenju... Casopis za nista, 12(3), 45-67. doi:10.1234/izmisljeno.2021')
  $sel.TypeParagraph()
  $sel.TypeText('Ancic, P. (2019). Drugi  izmisljeni naslov. Drugi casopis, 5(1), 10-22. doi:10.5678/izmisljeno.2019')
  $sel.TypeParagraph()
  $sel.TypeText('Babic, I. (2020). Treci izmisljeni naslov s 20 % udjela. Treci casopis, 8(2), 30-41. doi:10.9012/izmisljeno.2020')
  $sel.TypeParagraph()

  $doc.SaveAs2([string]$full, [int]16)
  $doc.Close([int]0)
  Write-Host "Napravljen: $full"
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
