# scripts/word-verify/check.ps1
#
# Cijela petlja dokaza: pravi Word napravi dokumente -> popravak -> PRAVI Word otvori rezultat
# i kaze sto u njemu STVARNO pise. Jedina provjera koja odgovara na dva pitanja koja nijedan
# jedinicni test ne moze:
#   1. hoce li se popravljeni dokument uopce otvoriti kod korisnika (bez "Word je popravio"),
#   2. je li se trazeno pravilo stvarno primijenilo, mjereno Wordovim vlastitim ocitanjem.
#
#   powershell -File scripts/word-verify/check.ps1
#
# Trazi instaliran Microsoft Word. Izlazni kod 1 ako ijedan dokument padne ili ijedno
# ocekivano pravilo nije primijenjeno.
param(
  [string]$OutDir = '.tmp-word-verify',
  [switch]$SkipMake
)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent

if (-not $SkipMake) {
  & (Join-Path $PSScriptRoot 'make-fixtures.ps1') -OutDir $OutDir | Out-Null
}
$OutDir = (Resolve-Path $OutDir).Path

# Cilj popravka (mora odgovarati REQUESTS u repair.mts)
$ciljFont = 'Times New Roman'
$ciljPt = 12
$ciljProredPt = 18      # 1,5 x 12 pt
$ciljPoravnanje = 3     # wdAlignParagraphJustify
$ciljMarginaL = 3.0
$ciljMarginaT = 2.5

# RE-52: ova skripta mjeri DRUGI odlomak kao tijelo teksta (vidi komentar nize), sto vrijedi samo
# za a/b/c iz make-fixtures.ps1 (naslov + tijelo). Dokument najgoreg slucaja pocinje NASLOVNICOM
# ciji je drugi odlomak namjerno centriran, pa ga je ova skripta prijavljivala kao "poravnanje NE (1)"
# iako je centrirana naslovnica ISPRAVAN ishod. Za njega postoji vlastiti verifikator
# (check-worst-case.ps1), pa se ovdje izricito preskace umjesto da daje lazan pad.
$docs = Get-ChildItem $OutDir -Filter '*.docx' |
  Where-Object { $_.Name -notlike '*-popravljen.docx' -and $_.BaseName -ne 'z-najgori-slucaj' }
$preskoceni = Get-ChildItem $OutDir -Filter '*.docx' | Where-Object { $_.BaseName -eq 'z-najgori-slucaj' }
foreach ($p in $preskoceni) {
  Write-Output "PRESKACEM $($p.BaseName): ima naslovnicu, provjerava ga check-worst-case.ps1."
}
$rows = @()
foreach ($d in $docs) {
  $out = Join-Path $OutDir ($d.BaseName + '-popravljen.docx')
  Push-Location $root
  try {
    $json = & npx vite-node 'scripts/word-verify/repair.mts' -- $d.FullName $out 2>&1 | Out-String
  } finally { Pop-Location }
  $start = $json.IndexOf('{')
  $res = ($json.Substring($start) | ConvertFrom-Json)
  $rows += [pscustomobject]@{
    Dokument = $d.BaseName
    Izlaz = $out
    Primijenjeno = ($res.primijenjeno -join ',')
    Preskoceno = ($res.preskoceno -join ',')
    Izgubljeno = ($res.izgubljeniDijelovi -join ',')
    BitIdenticnih = "$($res.bitIdenticnih)/$($res.dijelovaPrije)"
  }
}

# Word otvara rezultat i mjeri stvarno stanje
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$fail = 0
$report = @()
try {
  foreach ($r in $rows) {
    try {
      # OpenAndRepair = $false (zadnji parametri): ostecen dokument baca gresku umjesto tihog oporavka
      $doc = $word.Documents.Open($r.Izlaz, $false, $true, $false, '', '', $true, '', '', 0, 0, $false, $true, $false, $false)
      # Mjeri se ODLOMAK TIJELA (drugi odlomak: prvi je naslov), jer se pravila profila odnose na
      # osnovni tekst. Mjerenje nad cijelim dokumentom mijesa naslov i vraca "neodredjeno" (9999999).
      $normal = $doc.Styles.Item('Normal')
      $body = $doc.Content.Paragraphs.Item(2).Range
      $eFont = $body.Font.Name                 # '' znaci mjesovito
      $eFontStyle = $normal.Font.Name
      $ePt = $body.Font.Size
      $eProred = $body.ParagraphFormat.LineSpacing
      $ePoravnanje = $body.ParagraphFormat.Alignment
      $mL = [math]::Round($doc.PageSetup.LeftMargin / 28.3465, 2)
      $mT = [math]::Round($doc.PageSetup.TopMargin / 28.3465, 2)
      $doc.Close([int]0)

      # Efektivni font: ako je izravno oblikovanje uklonjeno, Content.Font.Name je '' ili stilski
      $fontOk = ($eFont -eq $ciljFont) -or (($eFont -eq '') -and ($eFontStyle -eq $ciljFont))
      $ptOk = [math]::Abs([double]$ePt - $ciljPt) -lt 0.6
      $proredOk = [math]::Abs([double]$eProred - $ciljProredPt) -lt 0.6
      $poravnanjeOk = ([int]$ePoravnanje -eq $ciljPoravnanje)
      $marginaOk = ([math]::Abs($mL - $ciljMarginaL) -lt 0.05) -and ([math]::Abs($mT - $ciljMarginaT) -lt 0.05)

      $ok = @($fontOk,$ptOk,$proredOk,$poravnanjeOk,$marginaOk)
      if ($ok -contains $false) { $fail++ }

      $mark = { param($b) if ($b) { 'DA ' } else { 'NE ' } }
      $report += [pscustomobject]@{
        Dokument   = $r.Dokument
        Otvara     = 'DA'
        Font       = (& $mark $fontOk) + "($(if($eFont){$eFont}else{$eFontStyle}))"
        Velicina   = (& $mark $ptOk) + "($ePt pt)"
        Prored     = (& $mark $proredOk) + "($eProred)"
        Poravnanje = (& $mark $poravnanjeOk) + "($ePoravnanje)"
        Margine    = (& $mark $marginaOk) + "(L$mL T$mT)"
        Dijelovi   = $r.BitIdenticnih
        Izgubljeno = $(if ($r.Izgubljeno) { $r.Izgubljeno } else { '-' })
      }
    } catch {
      $fail++
      $report += [pscustomobject]@{
        Dokument = $r.Dokument; Otvara = 'PAD: ' + $_.Exception.Message
        Font=''; Velicina=''; Prored=''; Poravnanje=''; Margine=''; Dijelovi=''; Izgubljeno=''
      }
    }
  }
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

$report | Format-Table -AutoSize | Out-String -Width 240 | Write-Output
if ($fail -gt 0) {
  Write-Output "NEUSPJEH: $fail dokumenata nije zadovoljilo ocekivanje."
  exit 1
}
Write-Output 'SVE PROSLO: svaki dokument se otvara i svako pravilo je primijenjeno.'
