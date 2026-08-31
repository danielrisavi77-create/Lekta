# scripts/word-verify/make-anchor-fixture.ps1
#
# Napravi PRAVIM Wordom (COM) dokument s konstrukcijama koje lome SIDRA popravka.
#
# Zasto postoji: sidro nastaje iz teksta analize (src/docx/parser.ts, koji za <w:tab/> emitira \t),
# a provjerava se protiv izvlakaca koji cita samo <w:t>. Ta se razlika vidi tek na dokumentu koji
# Word doista proizvodi.
#
# IZMJERENO 2026-08-31: od 19 commitanih fixtura NIJEDNA nema <w:tab/>, dok ga ima 32 od 38
# stvarnih studentskih radova (84%), s 1.298 rizicnih odlomaka. Korpus na kojem se mjerilo po
# konstrukciji nije mogao sadrzavati kvar koji pogadja vecinu stvarnih radova.
#
#   powershell -File scripts/word-verify/make-anchor-fixture.ps1 -OutDir tests/fixtures/docx-word
param(
  [string]$OutDir = 'tests/fixtures/docx-word'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$OutDir = (Resolve-Path $OutDir).Path
$out = Join-Path $OutDir 'anchor-cases.docx'
if (Test-Path $out) { Remove-Item $out -Force }

$word = New-Object -ComObject Word.Application
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Add()
  $sel = $word.Selection

  # 1. Rucno numeriran naslov s TABULATOROM: Wordov standardni zapis, i tocno ono sto je lomilo.
  $sel.TypeText('1.'); $sel.TypeText([char]9); $sel.TypeText('UVOD'); $sel.TypeParagraph()
  $sel.TypeText('Uvodni odlomak tijela rada, dovoljne duljine da ne prodje kao naslov.'); $sel.TypeParagraph()

  # 2. Naslov s TIPOGRAFSKOM crticom: croatian-typography-fixer radi PRIJE sidara i mijenja ju.
  $sel.TypeText('2. Metodologija ' + [char]0x2013 + ' pristup'); $sel.TypeParagraph()
  $sel.TypeText('Odlomak ispod naslova s tipografskom crticom.'); $sel.TypeParagraph()

  # 3. PONOVLJEN tekst: nosac laznog prihvacanja sidra kad se indeksi pomaknu.
  $sel.TypeText('Izvor: Izrada autora'); $sel.TypeParagraph()
  $sel.TypeText('Tijelo izmedju dva ponovljena natpisa.'); $sel.TypeParagraph()
  $sel.TypeText('Izvor: Izrada autora'); $sel.TypeParagraph()

  # 4. Goli DOI: meta link-doi-fixera, u runu s pravim Wordovim rPr.
  $sel.TypeText('Izvor je dostupan pod doi:10.1234/lekta.2026.001 u repozitoriju.'); $sel.TypeParagraph()

  $doc.SaveAs2([string]$out, [int]16)   # 16 = wdFormatXMLDocument
  $doc.Close([int]0)                    # 0 = wdDoNotSaveChanges
} finally {
  $word.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
Write-Output ("zapisano: " + $out)
