# scripts/word-verify/make-fixtures.ps1
#
# Napravi PRAVE .docx dokumente pravim Wordom (COM), u oblicima kakve studenti stvarno predaju.
# Sintetski fixture iz tests/fixtures/docx imaju 4 dijela i nekomprimirani su; pravi Wordov
# dokument ima 12 do 20 dijelova (numbering, settings, theme, fontTable, footnotes) i DEFLATE.
# Bez ovoga se nikad ne provjeri ono sto se u praksi lomi: reference na temu, izostavljeni
# atributi i ocuvanje dijelova koje popravak ne dira.
#
# Trazi instaliran Microsoft Word. Ne pokrece se u CI-ju, nego rukom na stroju koji ga ima.
#   powershell -File scripts/word-verify/make-fixtures.ps1 -OutDir .tmp-word-verify
param(
  [string]$OutDir = '.tmp-word-verify'
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$OutDir = (Resolve-Path $OutDir).Path

# Zajednicko tijelo: naslov, dva odlomka, niz praznih odlomaka (za cistac), tablica, fusnota.
function New-WordDoc {
  param([string]$Name, [scriptblock]$Shape)
  $out = Join-Path $OutDir $Name
  if (Test-Path $out) { Remove-Item $out -Force }
  $word = New-Object -ComObject Word.Application
  try {
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Add()
    $sel = $word.Selection
    $sel.Style = $doc.Styles.Item('Heading 1'); $sel.TypeText('Uvod'); $sel.TypeParagraph()
    $sel.Style = $doc.Styles.Item('Normal')
    $sel.TypeText('Prvi odlomak tijela rada s dijakritikom: cscdz, CSCDZ.'); $sel.TypeParagraph()
    $sel.TypeText('Drugi odlomak tijela rada koji je dovoljno dug da se vidi prelamanje retka.'); $sel.TypeParagraph()
    $sel.TypeParagraph(); $sel.TypeParagraph(); $sel.TypeParagraph()   # niz praznih odlomaka
    $sel.TypeText('Zakljucak.'); $sel.TypeParagraph()
    $doc.Footnotes.Add($doc.Content.Paragraphs.Item(2).Range, '', 'Fusnota jedan.') | Out-Null
    & $Shape $doc $word
    $doc.SaveAs2([string]$out, [int]16)   # 16 = wdFormatXMLDocument
    $doc.Close([int]0)                    # 0 = wdDoNotSaveChanges
  } finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  }
  Write-Output $out
}

# A) Cist Wordov zadani dokument. Font je REFERENCA NA TEMU, stil Normal je prazan.
New-WordDoc 'a-word-default.docx' { param($doc,$word) } | Out-Null

# B) Student oznaci sve pa promijeni oblikovanje. Vrijednosti zavrse kao IZRAVNO oblikovanje
#    na runovima i odlomcima; stilovi i dalje nemaju nista. Najcesci oblik u praksi.
New-WordDoc 'b-izravno-oblikovanje.docx' {
  param($doc,$word)
  $r = $doc.Content
  $r.Font.Name = 'Arial'; $r.Font.Size = 11
  $r.ParagraphFormat.LineSpacingRule = 0   # jednostruki
  $r.ParagraphFormat.Alignment = 0         # lijevo
  $r.ParagraphFormat.SpaceAfter = 10
} | Out-Null

# C) Student izmijeni STIL Normal (ono sto upute zapravo traze). Vrijednosti su u stilu.
New-WordDoc 'c-izmijenjen-stil.docx' {
  param($doc,$word)
  $st = $doc.Styles.Item('Normal')
  $st.Font.Name = 'Arial'; $st.Font.Size = 11
  $st.ParagraphFormat.LineSpacingRule = 0
  $st.ParagraphFormat.Alignment = 0
  $st.ParagraphFormat.SpaceAfter = 10
} | Out-Null

Write-Output "Napravljeno u: $OutDir"
Get-ChildItem $OutDir -Filter '*.docx' | ForEach-Object { "  {0,-32} {1} B" -f $_.Name, $_.Length }
