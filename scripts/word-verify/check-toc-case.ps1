# scripts/word-verify/check-toc-case.ps1
#
# TIER 2 za izuzece toc-field-fixera (CLAUDE.md, "test vidljivog teksta").
#
# Pravilo glasi: zahvat je dopusten ako tekst koji korisnik vidi ostane isti I PRIJE I POSLIJE
# osvjezavanja polja u Wordu. toc-field-fixer je upisan kao izuzetak uz obrazlozenje da tekst
# sadrzaja GENERIRA Word iz polja, a ne autor. Ovo to provjerava doslovno, umjesto da se vjeruje
# obrazlozenju:
#
#   1. Word otvara popravljeni dokument BEZ popravka (OpenAndRepair = false),
#   2. AUTORSKI tekst je nepromijenjen prije osvjezavanja polja,
#   3. nakon Fields.Update() nijedan autorski odlomak nije nestao ni izmijenjen,
#   4. SVE sto je osvjezavanje dodalo su stavke sadrzaja koje odgovaraju STVARNIM naslovima
#      dokumenta, dakle nista izmisljeno.
param(
  [string]$Original  = '.tmp-word-verify/toc-slucaj.docx',
  [string]$Repaired  = '.tmp-word-verify/toc-slucaj-popravljen.docx'
)
$ErrorActionPreference = 'Stop'
$Original = (Resolve-Path $Original).Path
$Repaired = (Resolve-Path $Repaired).Path

function Get-Paragraphs($doc) {
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($p in $doc.Paragraphs) {
    $t = $p.Range.Text -replace "[`r`a]", ''
    $t = $t.Trim()
    if ($t.Length -gt 0) { $out.Add($t) }
  }
  return $out
}

$word = New-Object -ComObject Word.Application
$fail = 0
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0

  # Autorski tekst iz IZVORNOG dokumenta (referenca istine).
  $docO = $word.Documents.Open($Original, [ref]$false, [ref]$true, [ref]$false, [ref]'', [ref]'', [ref]$true)
  $autorski = Get-Paragraphs $docO
  $naslovi = New-Object System.Collections.Generic.List[string]
  foreach ($p in $docO.Paragraphs) {
    if ($p.Style.NameLocal -like 'Heading*' -or $p.Style.NameLocal -like 'Naslov*') {
      $t = ($p.Range.Text -replace "[`r`a]", '').Trim()
      if ($t.Length -gt 0) { $naslovi.Add($t) }
    }
  }
  $docO.Close([int]0)

  # Popravljeni: OpenAndRepair = false. Ako Word mora popravljati, ovo baca.
  $docR = $word.Documents.Open($Repaired, [ref]$false, [ref]$true, [ref]$false, [ref]'', [ref]'', [ref]$true)
  Write-Host 'DA Otvara bez popravka (OpenAndRepair=false)'

  $prije = Get-Paragraphs $docR
  $docR.Fields.Update() | Out-Null
  $poslije = Get-Paragraphs $docR
  $brojPolja = $docR.Fields.Count

  # Tekst SAMOG sadrzaja, iz TOC raspona (ne izvedeno iz razlike odlomaka; vidi nize zasto).
  $tocLines = New-Object System.Collections.Generic.List[string]
  $brojToc = $docR.TablesOfContents.Count
  for ($i = 1; $i -le $brojToc; $i++) {
    foreach ($line in ($docR.TablesOfContents.Item($i).Range.Text -split "`r")) {
      $t = ($line -replace "[`a]", '').Trim()
      if ($t.Length -gt 0) { $tocLines.Add($t) }
    }
  }
  $docR.Close([int]0)

  Write-Host ''
  Write-Host '--- PRIJE osvjezavanja polja ---'
  $nedostaju = @($autorski | Where-Object { $prije -notcontains $_ })
  if ($nedostaju.Count -eq 0) {
    Write-Host "DA Svih $($autorski.Count) autorskih odlomaka je netaknuto"
  } else {
    $fail++
    Write-Host "NE Nedostaje autorski tekst: $($nedostaju -join ' | ')"
  }

  Write-Host ''
  Write-Host '--- POSLIJE Fields.Update() ---'
  Write-Host "   Polja: $brojPolja, sadrzaja (TOC): $brojToc"
  $izgubljeni = @($autorski | Where-Object { $poslije -notcontains $_ })
  if ($izgubljeni.Count -eq 0) {
    Write-Host "DA Nijedan autorski odlomak nije nestao ni izmijenjen"
  } else {
    $fail++
    Write-Host "NE Osvjezavanje je pojelo autorski tekst: $($izgubljeni -join ' | ')"
  }

  # Sadrzaj se cita IZRAVNO iz polja, ne kao razlika skupova odlomaka.
  #
  # Zasto: stavka sadrzaja nosi ISTI tekst kao naslov iz kojeg je izvedena ("Uvod"), pa usporedba
  # po clanstvu ne vidi nista novo iako je Word generirao cijeli sadrzaj. Prva verzija ove skripte
  # je zbog toga javila "osvjezavanje nije dodalo nista" i pala na dokumentu koji je zapravo bio
  # ispravan. Broj odlomaka i sadrzaj TOC raspona su jednoznacni.
  Write-Host "   Odlomaka prije: $($prije.Count) -> poslije: $($poslije.Count)"
  if ($tocLines.Count -eq 0) {
    $fail++
    Write-Host 'NE Polje sadrzaja je prazno nakon osvjezavanja: nema sto dokazivati'
  } else {
    $izmisljeno = @()
    foreach ($d in $tocLines) {
      # Stavka sadrzaja je "Naslov<tab>broj"; usporedjujemo pocetni tekst s poznatim naslovima.
      $caption = ($d -split "`t")[0].Trim()
      $poznat = $false
      foreach ($n in $naslovi) { if ($caption -eq $n) { $poznat = $true; break } }
      if (-not $poznat) { $izmisljeno += $d }
    }
    if ($izmisljeno.Count -eq 0) {
      Write-Host "DA Sve stavke sadrzaja ($($tocLines.Count)) izvedene su iz STVARNIH naslova dokumenta"
      foreach ($d in $tocLines) { Write-Host "     + $d" }
    } else {
      $fail++
      Write-Host 'NE Sadrzaj sadrzi tekst koji NIJE naslov dokumenta (izmisljeno):'
      foreach ($d in $izmisljeno) { Write-Host "     ! $d" }
    }
  }

  Write-Host ''
  if ($fail -eq 0) {
    Write-Host 'SVE PROSLO: toc-field-fixer mijenja SAMO tekst koji Word generira iz polja.'
  } else {
    Write-Host "PALO: $fail provjera(e)."
    exit 1
  }
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
