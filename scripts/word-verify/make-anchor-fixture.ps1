# scripts/word-verify/make-anchor-fixture.ps1
#
# Napravi PRAVIM Wordom (COM) fixture s konstrukcijama koje lome SIDRA popravka.
#
# Zasto postoji: sidro nastaje iz teksta analize (src/docx/parser.ts, koji za <w:tab/> emitira \t),
# a provjerava se protiv izvlakaca koji cita samo <w:t>. Ta se razlika vidi tek na dokumentu koji
# Word doista proizvodi.
#
# IZMJERENO 2026-08-31: od 19 commitanih fixtura NIJEDNA nema <w:tab/>, dok ga ima 32 od 38
# stvarnih studentskih radova (84%), s 1.298 rizicnih odlomaka. Korpus na kojem se mjerilo po
# konstrukciji nije mogao sadrzavati kvar koji pogadja vecinu stvarnih radova.
#
# Postojece datoteke se PRESKACU. Word pri svakom spremanju upisuje nove rsid oznake i vremenske
# pecate, pa bi ponovno pokretanje promijenilo bajtove vec commitane fixture bez stvarne razlike;
# u dijeljenom radnom stablu usto gazi tudje datoteke (2026-08-31 je takav prolaz obrisao fixturu
# druge sesije). `-Force` je svjestan izbor.
#
#   powershell -File scripts/word-verify/make-anchor-fixture.ps1 -OutDir tests/fixtures/docx-word
param(
  [string]$OutDir = 'tests/fixtures/docx-word',
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$OutDir = (Resolve-Path $OutDir).Path

$targets = @('anchor-cases.docx', 'structure-cases.docx')
$todo = @()
foreach ($name in $targets) {
  $path = Join-Path $OutDir $name
  if ((Test-Path $path) -and -not $Force) { Write-Output ("preskoceno (vec postoji): " + $name) }
  else { $todo += $name }
}
if ($todo.Count -eq 0) { exit 0 }

$word = New-Object -ComObject Word.Application
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0

  if ($todo -contains 'anchor-cases.docx') {
    $out = Join-Path $OutDir 'anchor-cases.docx'
    if (Test-Path $out) { Remove-Item $out -Force }
    $doc = $word.Documents.Add()
    $sel = $word.Selection
    # Rucno numeriran naslov s TABULATOROM: Wordov standardni zapis, i tocno ono sto je lomilo.
    $sel.TypeText('1.'); $sel.TypeText([char]9); $sel.TypeText('UVOD'); $sel.TypeParagraph()
    $sel.TypeText('Uvodni odlomak tijela rada, dovoljne duljine da ne prodje kao naslov.'); $sel.TypeParagraph()
    # Naslov s TIPOGRAFSKOM crticom: croatian-typography-fixer radi prije sidara i mijenja ju.
    $sel.TypeText('2. Metodologija ' + [char]0x2013 + ' pristup'); $sel.TypeParagraph()
    $sel.TypeText('Odlomak ispod naslova s tipografskom crticom.'); $sel.TypeParagraph()
    # PONOVLJEN tekst: nosac laznog prihvacanja sidra kad se indeksi pomaknu.
    $sel.TypeText('Izvor: Izrada autora'); $sel.TypeParagraph()
    $sel.TypeText('Tijelo izmedju dva ponovljena natpisa.'); $sel.TypeParagraph()
    $sel.TypeText('Izvor: Izrada autora'); $sel.TypeParagraph()
    # Goli DOI: meta link-doi-fixera, u runu s pravim Wordovim rPr.
    $sel.TypeText('Izvor je dostupan pod doi:10.1234/lekta.2026.001 u repozitoriju.'); $sel.TypeParagraph()
    $doc.SaveAs2([string]$out, [int]16)
    $doc.Close([int]0)
    Write-Output ("zapisano: " + $out)
  }

  if ($todo -contains 'structure-cases.docx') {
    $out2 = Join-Path $OutDir 'structure-cases.docx'
    if (Test-Path $out2) { Remove-Item $out2 -Force }
    $doc2 = $word.Documents.Add()
    $sel2 = $word.Selection
    # FUSNOTA: dio paketa koji popravak ne smije izgubiti. Nijedna druga fixtura je nema.
    $sel2.Style = $doc2.Styles.Item('Heading 1'); $sel2.TypeText('Rezultati'); $sel2.TypeParagraph()
    $sel2.Style = $doc2.Styles.Item('Normal')
    $sel2.TypeText('Odlomak s fusnotom')
    [void]$doc2.Footnotes.Add($sel2.Range, '', 'Napomena uz odlomak.')
    $sel2.TypeParagraph()
    # PONOVLJEN naslov, oba sa stilom: nosac dvojbe za tekstualno sidro nad pravim naslovima.
    $sel2.Style = $doc2.Styles.Item('Heading 2'); $sel2.TypeText('Pregled'); $sel2.TypeParagraph()
    $sel2.Style = $doc2.Styles.Item('Normal'); $sel2.TypeText('Prvi pregled.'); $sel2.TypeParagraph()
    $sel2.Style = $doc2.Styles.Item('Heading 2'); $sel2.TypeText('Pregled'); $sel2.TypeParagraph()
    $sel2.Style = $doc2.Styles.Item('Normal'); $sel2.TypeText('Drugi pregled.'); $sel2.TypeParagraph()
    # VISE praznih odlomaka: meta empty-paragraph-fixera u pravom Wordovom zapisu.
    $sel2.TypeParagraph(); $sel2.TypeParagraph(); $sel2.TypeParagraph()
    $sel2.TypeText('Zavrsni odlomak.'); $sel2.TypeParagraph()
    $doc2.SaveAs2([string]$out2, [int]16)
    $doc2.Close([int]0)
    Write-Output ("zapisano: " + $out2)
  }
} finally {
  $word.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
