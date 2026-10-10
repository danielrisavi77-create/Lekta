# scripts/word-verify/check-worst-case.ps1
#
# Izmjeri najgori slucaj PRIJE i POSLIJE popravka, pravim Wordom. Provjerava dvije stvari koje su
# jednako vazne:
#   POPRAVLJENO: font, velicina, prored, poravnanje, margine, format stranice
#   OCUVANO:     naslovnica (namjerni prazni odlomci), polozeni prilog, tablica, slika, fusnota,
#                tekst s dijakritikom, broj sekcija
#
#   powershell -File scripts/word-verify/check-worst-case.ps1
param([string]$OutDir = '.tmp-word-verify', [switch]$SkipMake)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
# Stavka G (odluka vlasnika 2026-09-26): izlazni direktorij se brise SAMO na uspjehu (exit 0), i
# samo kad je Word stvarno provjerio barem jedan dokument ($provjereno), ime je .tmp-word-verify ili
# .tmp-word-corpus u korijenu repozitorija, nije junction i git ga ignorira (vidi outdir-cleanup.ps1).
# Na padu ostaje, a putanja se ispise, jer je to jedini dokaz za dijagnozu.
. (Join-Path $PSScriptRoot 'outdir-cleanup.ps1')
trap { Write-Output "PAD (iznimka): izlazni direktorij ostavljen za dijagnozu: $OutDir"; break }

if (-not $SkipMake) { & (Join-Path $PSScriptRoot 'make-worst-case.ps1') -OutDir $OutDir | Out-Null }
$OutDir = (Resolve-Path $OutDir).Path
$src = Join-Path $OutDir 'z-najgori-slucaj.docx'
$dst = Join-Path $OutDir 'z-najgori-slucaj-popravljen.docx'

function Measure-Doc {
  param($word, [string]$path)
  $doc = $word.Documents.Open($path, $false, $true, $false, '', '', $true, '', '', 0, 0, $false, $true, $false, $false)
  # Odlomak tijela: prvi odlomak uvodnog teksta
  $bodyIdx = 1
  for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
    if ($doc.Paragraphs.Item($i).Range.Text -match 'Ovaj rad bavi se') { $bodyIdx = $i; break }
  }
  $body = $doc.Paragraphs.Item($bodyIdx).Range
  # Prazni odlomci naslovnice (do naslova Sadrzaj) moraju ostati netaknuti
  $prazni = 0
  for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
    $t = $doc.Paragraphs.Item($i).Range.Text
    if ($t -match 'Sadrzaj') { break }
    if ($t.Trim() -eq '') { $prazni++ }
  }
  $m = [pscustomobject]@{
    Font         = [string]$body.Font.Name
    Velicina     = [double]$body.Font.Size
    Prored       = [double]$body.ParagraphFormat.LineSpacing
    RazmakIza    = [double]$body.ParagraphFormat.SpaceAfter
    Poravnanje   = [int]$body.ParagraphFormat.Alignment
    MarginaL     = [math]::Round($doc.Sections.Item(1).PageSetup.LeftMargin / 28.3465, 2)
    MarginaT     = [math]::Round($doc.Sections.Item(1).PageSetup.TopMargin / 28.3465, 2)
    SirinaCm     = [math]::Round($doc.Sections.Item(1).PageSetup.PageWidth / 28.3465, 1)
    VisinaCm     = [math]::Round($doc.Sections.Item(1).PageSetup.PageHeight / 28.3465, 1)
    Sekcija2Orij = $(if ($doc.Sections.Count -ge 2) { [int]$doc.Sections.Item(2).PageSetup.Orientation } else { -1 })
    Prilog       = $(if ($doc.Sections.Count -ge 2) { '{0}x{1}' -f [math]::Round($doc.Sections.Item(2).PageSetup.PageWidth/28.3465,1), [math]::Round($doc.Sections.Item(2).PageSetup.PageHeight/28.3465,1) } else { '-' })
    Sekcija      = [int]$doc.Sections.Count
    Tablica      = [int]$doc.Tables.Count
    Slika        = [int]$doc.InlineShapes.Count
    Fusnota      = [int]$doc.Footnotes.Count
    Odlomaka     = [int]$doc.Paragraphs.Count
    PrazniNaNasl = $prazni
    Dijakritika  = [bool]($doc.Content.Text -match 'cscdz')
    Naslovnica   = [string]$doc.Paragraphs.Item(1).Range.Text.Trim()
    NaslovFont   = [string]$doc.Styles.Item('Heading 1').Font.Name
    NaslovPt     = [double]$doc.Styles.Item('Heading 1').Font.Size
    NaslovBold   = [int]$doc.Styles.Item('Heading 1').Font.Bold
    FusnotaFont  = [string]$doc.Footnotes.Item(1).Range.Font.Name
    FusnotaPt    = [double]$doc.Footnotes.Item(1).Range.Font.Size
    # Naslov 1. razine ("Uvod"): tekst mora postati velikim slovima, a tijelo NE.
    NaslovTekst  = [string]$(($doc.Paragraphs | Where-Object { $_.Range.Text -match '^Uvod|^UVOD' } | Select-Object -First 1).Range.Text).Trim()
    TijeloTekst  = [string]$doc.Paragraphs.Item($bodyIdx).Range.Text.Trim()
    # Dodano uz fazu B: strukture koje popravak NIKAD ne smije izgubiti, a koje se ne vide
    # ni u tekstu ni u oblikovanju. Broj polja pada tiho ako fixer razbije fldChar par;
    # zaglavlja i podnozja nestanu kad se sekcija prepise; bookmarkovi nose ciljeve
    # unakrsnih uputa i sadrzaja, pa njihov gubitak pokvari TOC bez ijedne vidljive promjene.
    # --- VIZUALNI INTEGRITET (audit DOCX-21) ---
    # Postojece provjere BROJE elemente (1 tablica, 1 slika), pa ne vide da je tablica ostala
    # tablica ali izgubila stupac, ni da je slika "prezivjela" srusena na nulu. Ni jedno se ne
    # vidi u tekstu ni u oblikovanju, a korisnik oboje primijeti odmah.
    #
    # Broj STRANICA se namjerno NE usporedjuje: popravak mijenja font, prored i margine, pa je
    # drugacija paginacija ocekivana, a ne kvar. Mjeri se ono sto popravak FORME ne smije
    # promijeniti: dimenzije tablica, dimenzije slika i njihov medjusobni redoslijed.
    TablicaDim   = [string](($doc.Tables | ForEach-Object { '{0}x{1}' -f $_.Rows.Count, $_.Columns.Count }) -join ',')
    SlikaDim     = [string](($doc.InlineShapes | ForEach-Object { '{0}x{1}' -f [math]::Round($_.Width), [math]::Round($_.Height) }) -join ',')
    # Redoslijed tablica (T) i slika (I) po polozaju. Prazni odlomci se SMIJU saziti, pa se
    # odlomci ne broje; ono sto se ne smije promijeniti je sto dolazi prije cega.
    ElementRed   = [string]((@(
                      $doc.Tables | ForEach-Object { [pscustomobject]@{ Poz = $_.Range.Start; Tip = 'T' } }
                      $doc.InlineShapes | ForEach-Object { [pscustomobject]@{ Poz = $_.Range.Start; Tip = 'I' } }
                    ) | Sort-Object Poz | ForEach-Object { $_.Tip }) -join '')
    Polja        = [int]$doc.Fields.Count
    Bookmarkova  = [int]$doc.Bookmarks.Count
    Zaglavlja    = [int]$(($doc.Sections | ForEach-Object { $_.Headers } | Where-Object { $_.Exists }).Count)
    Podnozja     = [int]$(($doc.Sections | ForEach-Object { $_.Footers } | Where-Object { $_.Exists }).Count)
    # docProps se NE cita ovdje: BuiltInDocumentProperties je u ovom Word/PowerShell okruzenju
    # null (provjereno), pa bi usporedba bila vakuozno zelena. Autora javlja repair.mts izravno
    # iz paketa (polje docPropsAutor), sto je i pouzdanije i radi izvan Windowsa.
  }
  $doc.Close([int]0)
  return $m
}

Push-Location $root
try { $json = & npx vite-node 'scripts/word-verify/repair.mts' -- $src $dst 2>&1 | Out-String } finally { Pop-Location }
$res = ($json.Substring($json.IndexOf('{')) | ConvertFrom-Json)
# VRATA INTEGRITETA: kad odbiju popravak, $dst je bit-identican $src, pa bi se "poslije" mjerilo na
# ORIGINALU. src/repair/CLAUDE.md trazi izricito `integrityFailure === null`; polje koje nedostaje
# je isto PAD. Word se tada ni ne pokrece.
if (-not ($res.PSObject.Properties.Name -contains 'integrityFailure')) {
  Write-Output 'NEUSPJEH: repair.mts nije javio integrityFailure.'
  Write-Output "Izlazni direktorij ostavljen za dijagnozu: $OutDir"
  exit 1
}
if ($null -ne $res.integrityFailure) {
  Write-Output "NEUSPJEH: VRATA INTEGRITETA ODBILA: $($res.integrityFailure.part): $($res.integrityFailure.problem)"
  Write-Output "Izlazni direktorij ostavljen za dijagnozu: $OutDir"
  exit 1
}

$provjereno = 0
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
try {
  $prije = Measure-Doc $word $src
  $poslije = Measure-Doc $word $dst
  $provjereno++
} finally {
  $word.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

Write-Output "PRIMIJENJENO: $($res.primijenjeno -join ', ')"
Write-Output "PRESKOCENO:   $(if ($res.preskoceno) { $res.preskoceno -join ', ' } else { '(nista)' })"
Write-Output "DIJELOVI:     $($res.bitIdenticnih)/$($res.dijelovaPrije) bit-identicno; izgubljeno: $(if ($res.izgubljeniDijelovi) { $res.izgubljeniDijelovi -join ',' } else { 'nijedan' })"
Write-Output ''

$script:fail = 0
function Test-Ocekivanje {
  param($Prije, $Poslije, $Cilj, [switch]$Preserve)
  if ($Preserve) { return ($Poslije -eq $Prije) }
  return ($Poslije -eq $Cilj)
}
# Autor se MORA ocistiti samo kad je final-document-inspector primijenjen I kad je uklanjanje
# dc:creator stvarno trazeno. Sama primjena fixera nije dovoljna: on se primijeni i zbog rsid-ova.
function Test-TrazenoCiscenjeAutora {
  param([bool]$InspektorPrimijenjen, $TrazenaPolja)
  return ($InspektorPrimijenjen -and (@($TrazenaPolja) -contains 'creator'))
}
function Check {
  param([string]$Naziv, $Prije, $Poslije, $Cilj, [switch]$Preserve)
  $ok = Test-Ocekivanje $Prije $Poslije $Cilj -Preserve:$Preserve
  if (-not $ok) { $script:fail++ }
  $ciljTxt = if ($Preserve) { "ostaje $Prije" } else { "$Cilj" }
  Write-Output ('{0} {1,-20} prije={2,-16} poslije={3,-16} cilj={4}' -f $(if ($ok) { 'DA' } else { 'NE' }), $Naziv, $Prije, $Poslije, $ciljTxt)
}

Write-Output '--- MORA SE POPRAVITI ---'
Check 'Font'            $prije.Font       $poslije.Font       'Times New Roman'
Check 'Velicina'        $prije.Velicina   $poslije.Velicina   12
Check 'Prored'          $prije.Prored     $poslije.Prored     18
Check 'Razmak iza'      $prije.RazmakIza  $poslije.RazmakIza  0
Check 'Poravnanje'      $prije.Poravnanje $poslije.Poravnanje 3
Check 'Margina lijevo'  $prije.MarginaL   $poslije.MarginaL   3
Check 'Margina gore'    $prije.MarginaT   $poslije.MarginaT   2.5
Check 'Sirina stranice' $prije.SirinaCm   $poslije.SirinaCm   21
Check 'Visina stranice' $prije.VisinaCm   $poslije.VisinaCm   29.7
# Polozeni prilog mora dobiti A4 sa zamijenjenim stranicama, ne uspravni A4 i ne stari Letter.
Check 'Prilog (polozen)' $prije.Prilog    $poslije.Prilog     '29,7x21'
Check 'Naslov 1 font'    $prije.NaslovFont $poslije.NaslovFont 'Times New Roman'
Check 'Naslov 1 velicina' $prije.NaslovPt  $poslije.NaslovPt   14
Check 'Naslov 1 bold'    $prije.NaslovBold $poslije.NaslovBold -1
Check 'Fusnota font'     $prije.FusnotaFont $poslije.FusnotaFont 'Times New Roman'
Check 'Fusnota velicina' $prije.FusnotaPt  $poslije.FusnotaPt  10
Check 'Naslov velika slova' $prije.NaslovTekst $poslije.NaslovTekst 'UVOD'

Write-Output ''
Write-Output '--- NE SMIJE SE POKVARITI ---'
Check 'Prazni naslovnice' $prije.PrazniNaNasl $poslije.PrazniNaNasl $null -Preserve
Check 'Polozeni prilog'   $prije.Sekcija2Orij $poslije.Sekcija2Orij $null -Preserve
Check 'Broj sekcija'      $prije.Sekcija      $poslije.Sekcija      $null -Preserve
Check 'Tablica'           $prije.Tablica      $poslije.Tablica      $null -Preserve
Check 'Slika'             $prije.Slika        $poslije.Slika        $null -Preserve
Check 'Fusnota'           $prije.Fusnota      $poslije.Fusnota      $null -Preserve
Check 'Dijakritika'       $prije.Dijakritika  $poslije.Dijakritika  $null -Preserve
Check 'Naslovnica redak'  $prije.Naslovnica   $poslije.Naslovnica   $null -Preserve
# Zahvat u tekst smije dirati SAMO naslove: tijelo rada mora ostati slovo u slovo isto.
Check 'Tekst tijela'      $prije.TijeloTekst  $poslije.TijeloTekst  $null -Preserve
# Strukture koje nestaju TIHO (ne vide se ni u tekstu ni u oblikovanju).
Check 'Broj polja'        $prije.Polja        $poslije.Polja        $null -Preserve
Check 'Bookmarkova'       $prije.Bookmarkova  $poslije.Bookmarkova  $null -Preserve
Check 'Zaglavlja'         $prije.Zaglavlja    $poslije.Zaglavlja    $null -Preserve
Check 'Podnozja'          $prije.Podnozja     $poslije.Podnozja     $null -Preserve
Check 'Dimenzije tablica' $prije.TablicaDim   $poslije.TablicaDim   $null -Preserve
Check 'Dimenzije slika'   $prije.SlikaDim     $poslije.SlikaDim     $null -Preserve
Check 'Redoslijed elem.'  $prije.ElementRed   $poslije.ElementRed   $null -Preserve
# docProps iz PAKETA (repair.mts), jer COM BuiltInDocumentProperties ovdje ne radi.
# Autor SMIJE nestati samo ako je final-document-inspector primijenjen I ako je uklanjanje
# dc:creator stvarno trazeno (`trazenoUklanjanjeMeta` iz repair.mts). Od #325 (e3ae7451) privatni
# metapodaci po zadanom OSTAJU, a fixer se i dalje primijeni zbog rsid-ova, pa sama primjena vise
# ne znaci ciscenje. Bez trazenog uklanjanja je gubitak autorstva regresija, i docProps/core.xml
# mora ostati bajt-identican.
if (-not ($res.PSObject.Properties.Name -contains 'trazenoUklanjanjeMeta')) {
  Write-Output 'NEUSPJEH: repair.mts nije javio trazenoUklanjanjeMeta.'
  Write-Output "Izlazni direktorij ostavljen za dijagnozu: $OutDir"
  exit 1
}
# NEGATIVNA KONTROLA, svaki prolaz: trazeno uklanjanje uz neociscen dc:creator mora biti PAD.
# Bez nje bi suzeni uvjet ispod mogao tiho postati "nikad ne trazi ciscenje".
$kontrolaTrazi = Test-TrazenoCiscenjeAutora $true @('creator')
$kontrolaProlazi = Test-Ocekivanje 'Autor' 'Autor' '-'
$kontrolaBezZahtjeva = Test-TrazenoCiscenjeAutora $true @()
if ($kontrolaTrazi -and -not $kontrolaProlazi -and -not $kontrolaBezZahtjeva) {
  Write-Output 'DA Negativna kontrola: trazeno uklanjanje uz neociscen dc:creator PADA'
} else {
  $script:fail++
  Write-Output 'NE Negativna kontrola: trazeno uklanjanje uz neociscen dc:creator NE pada'
}
$inspektor = $res.primijenjeno -contains 'final-document-inspector-assisted'
$ciscenjeMeta = Test-TrazenoCiscenjeAutora $inspektor $res.trazenoUklanjanjeMeta
if ($ciscenjeMeta) {
  Check 'docProps autor ocisc.' $res.docPropsPrije.autor $res.docPropsPoslije.autor '-'
} else {
  Check 'docProps autor'    $res.docPropsPrije.autor  $res.docPropsPoslije.autor  $null -Preserve
  Check 'core.xml promijenjen' $false ($res.promijenjeniDijelovi -contains 'docProps/core.xml') $null -Preserve
}
Check 'docProps naslov'   $res.docPropsPrije.naslov $res.docPropsPoslije.naslov $null -Preserve

Write-Output ''
Write-Output "Odlomaka: $($prije.Odlomaka) -> $($poslije.Odlomaka) (visak praznih u TIJELU se smije saziti)"
if ($script:fail -gt 0) {
  Write-Output "NEUSPJEH: $script:fail provjera nije proslo."
  Write-Output "Izlazni direktorij ostavljen za dijagnozu: $OutDir"
  exit 1
}
if ($provjereno -eq 0) {
  Write-Output "PAD: nijedan dokument nije provjeren (prazan skup je crveno, ne zeleno)"
  Write-Output "Izlazni direktorij ostavljen za dijagnozu: $OutDir"
  exit 1
}
Write-Output 'SVE PROSLO.'

# Uspjeh: tek sada, kad je Word zatvoren i nijedna provjera nije pala.
Remove-WordVerifyOutDir -Dir $OutDir -RepoRoot $root -CheckedCount $provjereno
exit 0
