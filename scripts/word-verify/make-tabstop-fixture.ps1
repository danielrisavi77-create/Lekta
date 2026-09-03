# scripts/word-verify/make-tabstop-fixture.ps1
#
# Napravi PRAVIM Wordom (COM) fixturu s dva oblika koje nas sinteticki korpus po konstrukciji nema,
# a stvarni studentski radovi ih redovito imaju. Oba su 2026-09-03 bila ziv kvar u proizvodu.
#
#   1. DEFINICIJA TAB-STOPA (`<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" .../></w:tabs>`),
#      dakle potpisna linija s tockastim vodicem. `croatian-typography-fixer` ju je zamjenjivao
#      tekstom i proizvodio `<w:tabs><w:t> </w:t></w:tabs>`, sto Word ODBIJA otvoriti. Pogadjalo je
#      6 od 38 stvarnih radova, a 0 od 7 commitanih i 0 od 19 golden fixtura.
#
#   2. RUN S FONTOM SAMO ZA SLOZENA I ISTOCNOAZIJSKA PISMA (`<w:rFonts w:eastAsia=".." w:cs=".."/>`
#      bez `w:ascii` i `w:hAnsi`). Analiza je taj font pripisivala latinici, pa je obarala radove
#      koji pravilo postuju. Na jednom stvarnom radu takav je bio 57% teksta.
#
# Oba oblika Word upisuje SAM pri spremanju; nas graditelj fixtura (`tests/helpers/docx-builder.ts`)
# ih ne proizvodi, pa ih testovi bez ovakve fixture ne mogu vidjeti.
#
# Fixtura ne sadrzi nicij studentski tekst: sve recenice su sintetska ispuna.
#
# Postojeca datoteka se PRESKACE. Word pri svakom spremanju upisuje nove rsid oznake i vremenske
# pecate, pa bi ponovno pokretanje promijenilo bajtove vec commitane fixture bez stvarne razlike;
# u dijeljenom radnom stablu usto gazi tudje datoteke. `-Force` je svjestan izbor.
#
#   powershell -File scripts/word-verify/make-tabstop-fixture.ps1 -OutDir tests/fixtures/docx-word
param(
  [string]$OutDir = 'tests/fixtures/docx-word',
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$OutDir = (Resolve-Path $OutDir).Path

$name = 'tabstop-and-cs-fonts.docx'
$path = Join-Path $OutDir $name
if ((Test-Path $path) -and -not $Force) {
  Write-Host "[make-tabstop-fixture] $name vec postoji, preskacem (-Force za prepisivanje)."
  exit 0
}

$wdAlignTabRight = 2
$wdTabLeaderDots = 1
$wdAlignParagraphJustify = 3

# Recenice moraju biti MEDJUSOBNO RAZLICITE. Ponovljen tekst u dokumentu cini sidro dvojbenim
# (`verdictFor` u apply-fixers), pa `required-section-fixer` s pravom odustaje uz `stale-anchor`.
# Prva izvedba ove fixture ponavljala je cetiri recenice sest puta i time je mjerila TO, a ne ono
# zbog cega postoji.
$TEKST = @(
  'Ovaj odlomak sluzi kao sintetska ispuna tijela rada i ne prenosi nicij autorski sadrzaj.',
  'Metodoloski okvir opisan je ovdje samo radi duljine teksta, da dominantni font ima stabilan uzorak.',
  'Rezultati se u ovoj datoteci ne iznose, jer fixtura postoji zbog oblika zapisa, a ne zbog sadrzaja.',
  'Rasprava je izostavljena, a svaki sljedeci odlomak nosi drukciju recenicu radi jedinstvenosti sidra.',
  'Prikupljanje gradje opisano je nacelno, bez ijednog stvarnog podatka iz bilo cijeg studentskog rada.',
  'Analiticki postupak spomenut je u jednoj recenici koja se nigdje drugdje u dokumentu ne ponavlja.',
  'Ogranicenja pristupa navedena su kratko, jer tekst ovdje sluzi iskljucivo kao nosac oblikovanja.',
  'Zakljucna napomena zatvara ovaj niz odlomaka i takodjer je jedinstvena unutar cijele datoteke.',
  'Teorijska podloga sazeta je u recenici koja postoji samo zato da odlomaka bude dovoljno mnogo.',
  'Pregled literature ovdje nije napisan, nego je zamijenjen ovom jednom neponovljenom recenicom.',
  'Operacionalizacija pojmova opisana je natuknicom koja se ne pojavljuje ni u jednom drugom odlomku.',
  'Uzorkovanje je spomenuto radi cjelovitosti, uz formulaciju razlicitu od svih ostalih u dokumentu.',
  'Obrada podataka opisana je jednom recenicom cija se normalizirana inacica nigdje ne ponavlja.',
  'Etika istrazivanja navedena je zasebno, kako bi svaki odlomak imao vlastiti tekstualni otisak.',
  'Valjanost mjerenja opisana je kratkom recenicom koja je jedinstvena unutar ove sintetske gradje.',
  'Pouzdanost postupka spomenuta je odvojeno, opet formulacijom koja se drugdje u tekstu ne javlja.',
  'Interpretacija nalaza ovdje ne postoji, a ova recenica sluzi samo kao jos jedan razlicit odlomak.',
  'Usporedba s ranijim radovima izostavljena je, uz napomenu koja se u dokumentu pojavljuje jednom.',
  'Prakticne implikacije nisu izvedene, nego ih zamjenjuje ova zasebna i neponovljena formulacija.',
  'Buduca istrazivanja spomenuta su jednom recenicom razlicitom od svih prethodnih i sljedecih.',
  'Zahvale nisu upisane, a ovaj odlomak stoji ovdje kao nosac jos jednog jedinstvenog otiska teksta.',
  'Popis kratica nije sastavljen, pa ovu poziciju drzi recenica koja se nigdje drugdje ne ponavlja.',
  'Prilozi nisu ukljuceni, a ova recenica zatvara niz razlicitih odlomaka tijela ove sintetske gradje.',
  'Zavrsna recenica ove fixture takodjer je jedinstvena, cime nijedno sidro ne postaje dvojbeno.'
)

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Add()
  # Latinica dolazi iz stila; runovi nize NAMJERNO ne postavljaju ascii font.
  $doc.Styles.Item('Normal').Font.Name = 'Times New Roman'
  $doc.Styles.Item('Normal').Font.Size = 12
  $sel = $word.Selection

  # --- 1. potpisne linije s desnim tab-stopom i tockastim vodicem -----------------------------
  # Oblik s naslovnice i izjave o akademskoj cestitosti: "Mentor: ......................".
  foreach ($natpis in @('Mentor:', 'Student:', 'Datum obrane:')) {
    $sel.ParagraphFormat.TabStops.ClearAll()
    $sel.ParagraphFormat.TabStops.Add(255, $wdAlignTabRight, $wdTabLeaderDots) | Out-Null
    $sel.TypeText($natpis)
    $sel.TypeText([char]9)
    $sel.TypeParagraph()
  }
  $sel.ParagraphFormat.TabStops.ClearAll()

  # --- 2. tijelo rada: runovi s fontom SAMO za slozena pisma -----------------------------------
  # NameAscii se NE dira: latinica ostaje naslijedjena iz stila Normal (Times New Roman).
  # NameBi je font SLOZENIH pisama i Word ga zapisuje kao `w:cs`; to je atribut zbog kojeg je
  # analiza padala. `NameFarEast` (`w:eastAsia`) se NE postavlja jer ga Word na stroju bez
  # ukljucene istocnoazijske podrske odbija (HRESULT 0x800A16D4); za ovaj razred nije potreban,
  # jer kvar nastaje vec od `w:cs` bez `w:ascii`.
  $sel.ParagraphFormat.Alignment = $wdAlignParagraphJustify
  $sel.Font.NameBi = 'Book Antiqua'
  for ($i = 0; $i -lt 24; $i++) {
    $sel.TypeText($TEKST[$i % $TEKST.Length])
    $sel.TypeParagraph()
  }

  $doc.SaveAs2([string]$path, [int]16)  # wdFormatDocumentDefault (.docx)
  $doc.Close([int]0)
  Write-Host "[make-tabstop-fixture] zapisano: $path"
} finally {
  $word.Quit()
}
