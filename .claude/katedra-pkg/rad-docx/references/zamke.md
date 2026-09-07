# Zamke — kvarovi koji su se stvarno dogodili

Sve dolje je pogodilo pravi rad i prošlo barem jednu provjeru prije nego što je otkriveno.
Redoslijed je po podmuklosti: prve prođu build, prođu konverziju, i vide se samo ako se
render pogleda okom.

---

## 1. Fiksni prored obreže inline sliku na visinu retka

**Najopakija.** Grafikon se u dokumentu prikaže kao tanka crta preko koje se preliju
oznake s dna osi. Build prođe, pretvorba u PDF prođe, `python-docx` prijavi sliku kao
prisutnu, dimenzije u XML-u su ispravne.

Uzrok: prored zadan bez pravila poravnanja. U `docx-js`:

```js
spacing: { line: 360 }                     // ← LOŠE, ponaša se kao „točno 18 pt"
spacing: { line: 360, lineRule: "auto" }   // ← ISPRAVNO, 1,5 retka
```

U OOXML-u to je `<w:spacing w:line="360" w:lineRule="auto"/>`. Bez `w:lineRule` čitači
smiju pretpostaviti `exact`, i tada je visina retka gornja granica za sliku u njemu.

**Pravilo:** `lineRule="auto"` na **svakom** odlomku, a posebno na onima sa slikom. Odlomak
sa slikom najbolje je dati prored 1,0, ne 1,5.

**Strojna provjera** (jer se inače vidi samo okom):

```python
# širina slike u EMU mora odgovarati zadanoj širini u cm
px = round(sirina_cm * 37.7952755)      # 96 dpi
if f'cx="{px * 9525}"' not in document_xml:      # 1 px = 9525 EMU
    greska("slika nije umetnuta u zadanoj širini")
```

---

## 2. `ImageRun.transformation` mjeri u pikselima, ne u točkama

Slika izađe **25 % manja** od zadane širine, što izgleda kao namjeran izbor pa se ne
prijavi kao greška.

```
1 cm = 28,3465 pt      ← pogrešan faktor
1 cm = 37,7953 px      ← ispravan (96 dpi)
```

Razlika je 96/72 = 1,333. Slika zadana kao 15,5 cm izađe 11,6 cm.

Isto vrijedi za `python-docx`: `Cm(15.5)` je siguran put, `Pt(...)` za širinu slike nije.

---

## 3. LibreOffice ne popunjava polje `TOC` pri pretvorbi u PDF

`soffice --headless --convert-to pdf` **ne** evaluira `TOC` ni `PAGEREF`, ni uz
`<w:updateFields w:val="true"/>` u `settings.xml`. Sadržaj u PDF-u ostane prazan, pa se ni
paginacija ni brojevi u sadržaju ne mogu provjeriti.

**Ne rješava se makroom.** Put preko LibreOffice Basica

```basic
oDoc.getDocumentIndexes().getByIndex(i).update()
```

pozvan kroz `soffice "vnd.sun.star.script:..."` **se zabija** — potvrđeno na dva pokušaja
s dvominutnim timeoutom. Ne ponavljati.

**Rješenje:** dvije varijante iz istog izvora, uz assert istog broja stranica. Vidi
`polja.md`.

---

## 4. `SimpleField` ne nosi svojstva runa

Polje `REF` ubačeno kao `SimpleField` renderira se u **zadanom** oblikovanju dokumenta. U
kurzivnom retku „Izvor:" od 10 pt to je vidljivo strano tijelo: obični 12 pt uspravno
usred kurziva.

**Pravilo:** unakrsne reference idu **samo u tekst** (12 pt, uspravno, kao i ostatak). U
natpisima i u redovima „Izvor:" broj se piše kao običan tekst.

Ako polje mora nositi oblikovanje, gradi se ručno iz `fldChar begin / instrText / fldChar
separate / w:r s rPr / fldChar end`, gdje `w:r` u sredini nosi `rPr`.

---

## 5. Sekcijski prijelom već započinje novu stranicu

Prijelom stranice **prije** prijeloma sekcije daje praznu stranicu. Klasična posljedica:
prazna stranica između sažetka i uvoda koju nitko ne primijeti do ispisa.

```
naslovnica … [PB] … sadržaj … [PB] … sažetak … [SEC] … uvod    ← ispravno
naslovnica … [PB] … sadržaj … [PB] … sažetak … [PB][SEC] … uvod ← prazna stranica
```

---

## 6. Naslov u nenumeriranom prednjem dijelu razbija sadržaj

Ako numeracija počinje od Uvoda, a sažetak je oblikovan kao `Heading 1`, u sadržaju se
pojavi sa stranicom `0` ili s brojem koji ne postoji u podnožju.

**Rješenje:** naslovi prednjeg dijela **ne smiju biti** `Heading 1/2`. Koriste stil koji
izgleda isto ali nema `outlineLvl`, pa ih polje `TOC \o "1-2"` ne vidi.

---

## 7. `python-docx` ne vidi zadano oblikovanje koje je napisao `docx-js`

```python
d.styles["Normal"]        # KeyError: no style with name 'Normal'
```

`docx-js` piše zadano oblikovanje u `<w:docDefaults>` u `word/styles.xml`, bez imenovanog
stila `Normal`. Word to razrješava ispravno, `python-docx` ne.

Provjera formata mora čitati arhivu:

```python
with zipfile.ZipFile(docx) as z:
    styles = z.read("word/styles.xml").decode("utf-8")
dd = re.search(r"<w:docDefaults>.*?</w:docDefaults>", styles, re.S).group(0)
assert 'w:ascii="Times New Roman"' in dd
assert '<w:sz w:val="24"/>' in dd          # 12 pt
assert 'w:line="360"' in dd and 'w:lineRule="auto"' in dd
```

Isto vrijedi i za `d.element.xml` — to je samo `document.xml`, ne cijela arhiva.

---

## 8. Tema nosi drugi font od stila

Pandoc i Wordovi predlošci nose temu s `Cambria`/`Calibri`. Stil `Normal` može biti Times
New Roman, a sve što korisnik naknadno utipka pada na temu. Vidi se tek kad mentor doda
komentar i tekst izađe drugim pismom.

```python
t = re.sub(r'(<a:(?:major|minor)Font>\s*<a:latin[^/]*?typeface=")[^"]*"',
           r'\1Times New Roman"', tema_xml)
```

---

## 9. Granice riječi u hrvatskom

Brojanje veznih sredstava bez granica riječi prijavi „jer" 85× u radu od 5.000 riječi,
jer pogađa **mjerenje**, **vjerojatnost**, **izvještaje**.

```python
# \b ne pokriva dijakritike na način na koji se očekuje
n = len(re.findall(r"(?<![\wšđčćžŠĐČĆŽ])" + re.escape(veznik) + r"(?![\wšđčćžŠĐČĆŽ])", tekst))
```

Uz to: stil se mjeri nad **tijelom** rada. Popis literature od tridesetak jedinica sruši
medijan dužine rečenice i digne udio kratkih rečenica, pa alat prijavi „staccato" na
tekstu koji ga nema.

---

## 10. Krem podloga grafikona pravi vidljiv pravokutnik

`#FCFCFB` na bijeloj stranici nije neutralan — vidi se rub. Validator palete koristi
`surface` za **provjeru kontrasta**, a to nije ista vrijednost kao `facecolor` za
**izvoz**.

```python
POVRSINA_VALIDACIJA = "#fcfcfb"   # ulaz u validate_palette.js
POVRSINA_IZVOZ      = "#ffffff"   # facecolor u savefig — boja papira
```

---

## 11. Udio izračunan iz nezaokruženih vrijednosti ne poklapa se s tablicom

Tablica prikazuje zaokružene brojke, a udio uz nju izračunan je iz **punih**. Recenzent
podijeli ono što vidi i dobije drugu znamenku od one koja piše u istom retku:

```
puni iznosi:      2,156 / 6,856 = 31,4 %   ← alat izračuna ovo
prikazane brojke: 2,16  / 6,86  = 31,5 %   ← čitatelj izračuna ovo
```

Obje su brojke točne — razlikuje ih **osnovica**. Zato se nalaz ne da obraniti izračunom:
tko god provjerava, provjerava iz tablice, jer puni iznosi nigdje ne stoje. Isto vrijedi
za zbroj stupca: točan zbroj nezaokruženih doprinosa ne odgovara zbroju prikazanih, pa
stupac koji je **točniji** izgleda kao greška.

**Pravilo (željezno):** svaki izvedeni udio i zbroj računa se iz PRIKAZANIH vrijednosti.
`assets/model_predlozak.py` to nosi u `r2`/`r3` i `ale()`; puni je opis u `brojke.md`,
odjeljak „Osnovica zaokruživanja".

Zaokruživanje mora biti **pola gore**, a Pythonov `round` to nije: `round(1.8155, 3)` daje
1,815 jer je 1,8155 u dvojnom zapisu nešto ispod polovice. Otud nudge u pomoćnicima:

```python
def r3(x): return round(x + 1e-12, 3)      # r3(1,8155) = 1,816; bez nudgea 1,815
```

Izmjereno na predlošku: `ale()` daje **1,816** = zbroj prikazanih doprinosa
(0,686 + 0,74 + 0,39), dok je točan zbroj **1,8151**. Ta se razlika ne skriva — ako se ne
da izbjeći, piše se u izvoru pod tablicom.

Stroj ovo ne hvata i ne može: obje osnovice daju uvjerljivu tablicu, a alat ne zna koju je
autor mislio. `rad-audit/scripts/check_tablice.py` zato provjerava samo posljedicu (zbroj
stupca, postoci do 100) i ima toleranciju baš zato što se udjeli po pravilu računaju iz
zaokruženih vrijednosti — zbroj 99,9 ili 100,1 nije greška.

**Zamka pri pisanju ograde:** predložak na VLASTITIM brojkama ne pokazuje vlastito pravilo.
Gubici scenarija (6,856 · 24,66 · 77,94) takvi su da `r2` ne promijeni nijedan doprinos, pa
prikazana i puna osnovica daju isti iznos (1,816). Prva inačica ograde mjerila je baš to i
mutacija „računaj iz punog gubitka" ju je preživjela. Osnovica se vidi tek na scenariju
gdje zaokruživanje mijenja znamenku, npr. iznos 2,1549: prikazano 2,15, iz punog 2,155.

**Ograda:** `test_stari_kvarovi.py` RD11 (5 provjera). Mutacije, svaka obara samo svoju:
`round(x + 1e-12, n)` → `round(x, n)` obara pola-gore; `r2(gubitak(...))` → `gubitak(...)`
obara osnovicu; uklonjen unutarnji `r3` u `ale()` obara zbroj.

---

## 12. „Nije zadano" nije „nema podatka" — prevlast se izvrće

**Najvrjednija zamka nađena na tuđem radu.** Provjera veličine pisma prijavila je da tijelo
diplomskog rada ima 11 pt, a profil traži 12 pt. Rad je bio ispravan.

U Wordovu dokumentu **velika većina runova nema zadanu veličinu** — nasljeđuje ju iz
`docDefaults`. Eksplicitno je zadaje samo nekoliko mjesta, ovdje sažetak i abstract. Ako se
`None` odbaci kao „nema podatka", ostane samo iznimka i ona postane „prevladavajuća":

```
runovi bez zadane veličine (nasljeđuju 12 pt): 1473
runovi s eksplicitnih 11 pt (sažetak):           32
→ odbacivanjem None-ova „prevladava" 11 pt
```

**Pravilo:** prije izračuna prevlasti razriješi naslijeđenu vrijednost po lancu
**run → stil → docDefaults**, pa tek onda broji.

```python
def efektivna(run, stil_v, zadano):
    v = run.font.size.pt if run.font.size is not None else None
    return v if v is not None else (stil_v if stil_v is not None else zadano)
```

Isto vrijedi za pismo, prored i poravnanje. Vrijedi i obrnuto: vrijednost zadana **samo** po
odlomcima, a ne u stilu, jest ispravna ali krhka — svaki novi odlomak pada na drugu
vrijednost. To je upozorenje, ne greška.

---

## 13. Tijelo rada mora biti ograđeno prije mjerenja oblikovanja

Nastalo kao **regresija**: rad koji je prije bio čist odjednom je javio „prored 1,5 u samo
69 % odlomaka" i „12 pt u 78 % runova". Oboje je bio **popis literature**, koji je tipično
jednostruko proređen i 11 pt.

Tijelo se ograđuje isto kao za mjerenje opsega: **od Uvoda do popisa literature**, bez
naslova, natpisa, izvora i prednjeg dijela.

```python
POCETAK = re.compile(r"^\s*(1\.?\s+\S|UVOD\b|Uvod\b)", re.I)
KRAJ = re.compile(r"^\s*(?:\d+\.?\s*)?(LITERATURA|Popis literature|BIBLIOGRAFIJA)\s*$")
```

Ista klasa greške već je zabilježena u `katedra/references/zakrpe-katedra.md`, nalaz 1, za
mjerenje opsega. Pojavljuje se svaki put kad alat mjeri „cijeli dokument" umjesto tijela.

---

## 14. Naslov prelomljen preko dva retka ne nalazi se po točnom nizu

`pdftotext` na mjestu prijeloma retka ubaci razmak kojega u izvoru nema:

```
docx: „(1947.-1991.)"
pdf : „(1947.-\n1991.)"  →  nakon normalizacije razmaka: „(1947.- 1991.)"
```

Traženje po točnom nizu ne uspije. Rješenje je **stisnuti oba niza** — izbaciti sve razmake
— i tražiti nad stisnutim tekstom, uz kartu granica stranica građenu nad istim stisnutim
tekstom.

Uz to treba svesti sve crtice na jednu (`‐ ‑ ‒ – — ― −` → `-`) i nelomljive razmake na
obične. Razlika u crtici između naslova i sadržaja nije kozmetička: ona je **dokaz da je
sadržaj zastario**, jer se generira iz naslova (v. kvar 3 i nalaz iz prihvatnog testa).

---

## 15. Heuristički parser strukture pogađa vlastite tablice dokumenta

Ako alat prepoznaje strukturu rada iz `### N.N Naslov` i redaka `| N. | …`, onda ga
**hodogram** i **popis „ručno provjeri"** u istom dokumentu obmanjuju:

```
1. Odobrenje plana          [9 str.]     ← redak hodograma, ne poglavlje
3. Numeracija stranica.**   [300 str.]   ← stavka iz popisa provjera
```

Rješenje je ograda, ne bolji regex:

```markdown
<!-- STRUKTURA:POCETAK -->
| Pogl. | Naslov | Str. |
<!-- STRUKTURA:KRAJ -->
```

---

## 16. Mjerenje se sruši u jednu stranicu, a petlja se na tome stabilizira

**Najopakija u ovoj skupini**, jer se ne prijavi kao greška nego kao uspjeh. Izgradnja
javi „✅ stabilno", assert o istom broju stranica prođe, dokument izađe s **potpuno
pogrešnim** brojevima u sadržaju.

Uzrok je lančan:

1. Stranica sadržaja nije izbačena iz pretrage. Igla je bila `"SADRŽAJ"`, a graditelj
   naslov piše `"Sadržaj"` — traženje razlikuje velika i mala slova.
2. Na toj stranici stoji **svaki** naslov rada, kao stavka.
3. Pretraga naslova ide **redom** i pamti dosad najdalju stranicu. Prvi naslov se „nađe"
   na sadržaju, pa se i svi ostali nađu tamo.
4. Rezultat je stalan između krugova, jer je pogreška dosljedna → **fiksna točka**.

```
  1  1. Uvod                          ← svi na istoj stranici
  2  2. Teorijsko-konceptualni okvir
  2  2.1. …
```

**Tri ograde, sve tri potrebne:**

```python
# a) igla se traži kao CIJELI REDAK i bez razlike velikih i malih slova.
#    „Sadržaj" je i obična riječ („sadržaj kolektivnog ugovora"), pa pretraga po
#    podnizu prazni stranice tijela — a to je gore od nepronalaženja.
po_iglici = any(norm(r).casefold() in NAVIGACIJA for r in sirovo[i].splitlines())

# b) potpis neovisan o stilu: redak koji završava vodilicom od točaka i brojem.
VODILICA = re.compile(r"\.{5,}\s*\d+\s*$", re.M)

# c) ograda razasutosti — pada kad je rezultat nemoguć
raspon = max(stranice) - min(stranice) + 1
if raspon < 0.5 * ukupno:
    greska("naslovi zauzimaju samo N od M stranica")
```

**Dodatna zamka unutar zamke:** `VODILICA` se **ne smije** primijeniti na normalizirani
tekst. Normalizacija (`re.sub(r"\s+", " ", …)`) briše prijelome redaka, pa `$` uz `re.M`
više nema gdje pasti i uzorak nikad ne pogodi. Mjerenje zato drži **oba** oblika teksta:
normalizirani za traženje naslova prelomljenih preko dva retka, sirovi za sve što je
vezano na kraj retka.

---

## 17. Ubacivanje odlomaka za nosač prijeloma sekcije premješta numeraciju

Sadržaj se generira kao **jedan** odlomak-nosač koji graditelj ostavi prazan. Ako se u
njega upisuje N stavki, iskušenje je ubacivati nove odlomke **za** nosačem.

To ne radi, jer graditelj u `w:pPr` tog istog odlomka obično zapiše **prijelom sekcije**
(restart numeracije od 1). Nakon ubacivanja prijelom ostaje na **prvom** redu sadržaja, pa
svih ostalih 35 redova padne u sekciju tijela:

```
str. 3   Sadržaj  ·  1. Uvod … 1                    ← [SEC] ovdje
str. 4   2. Teorijsko … 4  …  Literatura … 48       ← ostatak sadržaja, već u tijelu
         1. Uvod                                     ← Uvod dijeli list sa sadržajem
                        1                            ← numeracija restartana previše rano
```

**Pravilo:** novi odlomci idu **ispred** nosača, a nosač ostaje **zadnji** red popisa.
Provjera je jednostavna: prva stranica tijela ne smije nositi ni jednu stavku sadržaja.

---

## 18. Abecedni `glob` nije redoslijed dokumenta, a generirane datoteke se pokupe

Sastavljanje rukopisa iz `rukopis/*.md` bez eksplicitnog popisa daje dvije greške odjednom:

```
literatura.md   ← po abecedi PRVA, u radu POSLJEDNJA
pog1_uvod.md
rad_predaja.md  ← proizvod prethodne izgradnje: cijeli rad JOŠ JEDNOM
```

Rezultat je bio **113 stranica umjesto 57**, uz literaturu na početku. Ni jedno ni drugo
nije javljeno kao greška, jer je markdown formalno valjan.

```python
GENERIRANO = {"rad_predaja.md", "_rad.md"}     # nikad ulaz
# eksplicitan popis (dijelovi.json / rad.json / dijelovi.txt) je PRAVILO,
# glob je zadnja mogućnost i uz upozorenje
```

---

## 19. Graditelj kućnog stila nije njegov Pythonov skript

Prilagodnik je pozivao `build_docx.py` satelita i dobio dokument čiji je `document.xml`
**bajt po bajt jednak** onome iz punog lanca satelita — a rad se prelomio drukčije, s
razlikom od jedne stranice koja se u prozoru od 25 stranica dva puta otvorila i zatvorila.

Razlika je bila izvan `document.xml`, u shell-cjevovodu **oko** Pythona:

```xml
<!-- word/settings.xml -->
<w:autoHyphenation w:val="true"/>   <!-- prijelom riječi MIJENJA lom redaka -->
<w:hyphenationZone w:val="357"/><w:consecutiveHyphenLimit w:val="2"/>
<!-- word/theme/theme1.xml -->     Cambria/Calibri → Times New Roman
<!-- word/styles.xml -->           docDefaults rFonts: minorHAnsi → Times New Roman
```

**Dijagnostički postupak** koji je to našao, vrijedi zapamtiti: kad dva dokumenta imaju
jednako tijelo a različitu paginaciju, ne gledaj `document.xml` — **diffaj arhivu po
članovima**:

```python
for dio in ("word/styles.xml", "word/settings.xml", "word/theme/theme1.xml",
            "word/fontTable.xml", "word/footer1.xml", "word/footer2.xml"):
```

`scripts/arhiva.py` je taj prolaz izdvojen da ga svaki prilagodnik može pozvati.

---

## 20. Motorov ključ prikaza nije graditeljevo sidro

Motor mjeri stranice natpisa i predaje ih graditelju za popis tablica. Ključevi se nisu
poklopili:

```
motor:      "tablica1"
graditelj:  "_Ref_tab1"     ← ime Wordove zabilješke
```

Posljedica nije bila pad, nego **tiho prazan popis prikaza**: graditelj je popis ostavio
kao neispunjeno polje, a LibreOffice ga pri pretvorbi ne popunjava (kvar 3), pa se u PDF-u
vidi samo `[Popis tablica — u Wordu: desni klik → Update Field]`.

**Pravilo:** motorov izlaz je **samoopisan**, a prevođenje je posao prilagodnika.

```json
[{"kljuc": "tablica1", "natpis": "Tablica 1. Kronologija …", "str": 4}]
```

Uz to: stanje petlje mora se prevesti **prije** izgradnje, ne poslije. Prijevod nakon
graditelja znači da ga graditelj čita krug zakašnjelo — a petlja koja je konvergirala u
dva kruga stane prije nego što ga uopće vidi.

---

## 21. Inline markdown u naslovu čini naslov nemjerljivim

Naslov `## 7.4. Postindustrijska Pula: *brownfield* prostori i novi narativi` u Wordu je
kurziv, a u PDF-u **nema zvjezdica**. Traženje po tekstu iz markdowna nikad ne uspije, pa
ta stavka sadržaja izađe **bez broja stranice**.

Naslovi za mjerenje moraju se očistiti od svega što je oblikovanje, ne tekst:

```python
OZNAKE = [(r"\*\*(.+?)\*\*", r"\1"), (r"\*(.+?)\*", r"\1"),
          (r"__(.+?)__", r"\1"), (r"(?<!\w)_(.+?)_(?!\w)", r"\1"),
          (r"`(.+?)`", r"\1"), (r"~~(.+?)~~", r"\1"),
          (r"\[(.+?)\]\([^)]*\)", r"\1"), (r"\s*\{#[^}]*\}\s*$", "")]
```

Podvlaka traži čuvare `(?<!\w)` i `(?!\w)`, inače pojede `snake_case` u naslovu.

---

## 22. Način `--json` preskočio je vlastiti pad

**Najgora vrsta ove greške**, jer je ograda postojala i bila je ispravna — samo je u
načinu rada koji je stvarno u uporabi nije bilo:

```python
    if a.json:
        print(json.dumps(...))
        return            # ← ovdje, a provjera nenađenih naslova je NIŽE
    ...
    if nenadeni_naslovi:
        sys.exit(1)       # ← nikad se ne izvrši kad se zove s --json
```

Petlja izgradnje mjeri **isključivo** s `--json`. Naslov koji se ne nalazi u ispisu prošao
je kroz sve krugove tiho, i našao se samo ručnim pokretanjem istog alata bez `--json`.

**Pravilo:** ograda ide **prije** svakog `return`, ili se izlazni kod formira na jednom
mjestu na kraju. Kad alat ima dva načina ispisa, oba se moraju testirati — pisanje samo
jedne provjere po ogradi je klasična greška.

```bash
python3 izmjeri.py rad.pdf --naslovi naslovi.json            # čitljivo
python3 izmjeri.py rad.pdf --naslovi naslovi.json --json     # isti izlazni kod!
```

---

## 23. Navigacijsku stranicu se ne prazni, nego se s nje zadržava samo naslov

Rješenje kvara 16 („izbaci stranicu sadržaja iz pretrage") pretjeralo je u drugu stranu:
`POPIS TABLICA I GRAFIKONA` je **i sam naslov** kojemu treba izmjeriti stranicu, a
praznjenjem stranice postao je nemjerljiv.

Prvi popravak bio je crna lista — izbaci retke koji izgledaju kao stavka (vodilica ili broj
na kraju). Ne radi: **duga stavka se prelomi na dva retka**, prvi redak nema broj na kraju
i preživi filtar, s punim tekstom naslova u sebi.

```
4.1. Ratne uprave: od talijanske vlasti do njemačke okupacije i savezničkih
                                     bombardiranja ...................... 18
^^^ ovaj redak prođe crnu listu i ostaje kao lažni naslov na stranici sadržaja
```

**Bijela lista je jedini ispravan oblik:** sa navigacijske stranice zadržava se samo ono
što je **naslov navigacijskog dijela**, sve ostalo se briše. Prepoznavanje naslova je
srednji put između jednakosti (preuzak — ne hvata „POPIS TABLICA I GRAFIKONA") i podniza
(preširok — hvata prozu): kratak redak koji iglom **počinje** i ne završava rečeničnim
znakom.


---

## Kvar: normalizator koji tiho premješta nepoznato

**Simptom.** Dokument prolazi vlastitu provjeru sheme, a Word pri otvaranju nudi popravak
sadržaja. Ili: prekršaj postoji, ali ga nijedan alat ne prijavljuje.

**Uzrok.** Normalizator sortira djecu kontejnera po popisu iz sheme, a elementu kojega nema u
popisu dodjeljuje ključ `10**6` i time ga gura na kraj. Validator koji radi iz istoga popisa taj
element ne poznaje pa ga ne provjerava. **Ista praznina istodobno kvari dokument i skriva kvar.**

Konkretno: `SECTPR` bez `headerReference`/`footerReference` premjestio je referencu podnožja na
kraj `sectPr`-a; `SETTINGS` bez `mathPr` premjestio je `mathPr` iza `listSeparator`.

**Popravak.** Nepoznato dijete **ostaje na mjestu** i prijavljuje se imenom:

```
NEPOZNATI ELEMENTI (ostavljeni na mjestu, provjeri ručno):
  mathPr  ×1
```

**Kvar 2: validator koji ispisuje samo rezultat.** `✅ shema-valjano` bez popisa provjerenih
kontejnera i dijelova paketa je neupotrebljiv, jer ne razlikuje „nema prekršaja" od „nisam
gledao". Ispis mora nositi doseg:

```
provjereno kontejnera: pPr, rPr, sectPr, settings, style, tblPr, tcBorders, tcPr, trPr
u dijelovima: word/*.xml
izvan redoslijeda: nema
```

Prva inačica gledala je tri kontejnera i javljala zeleno nad dokumentom s pet prekršaja.

## 24. Komponenta zadatka bez „igala" traži doslovan tekst zahtjeva unutar rada

`provjeri_zadatak` uzima `k.get("igle") or [k["naziv"]]`. Kad komponenta nema igala, alat
traži **opis zahtjeva** kao nisku u tekstu rada. Zahtjev je opis onoga što rad mora
zadovoljiti, a ne rečenica koju rad mora sadržavati, pa se ne nalazi nikad.

```python
    for k in zadatak.get("komponente", []):
        igle = k.get("igle") or [k["naziv"]]
        if not any(i in sve for i in igle):
            P.g(f"zadatak traži, a u radu nema: {k['naziv']}")
```

Na radu Paroci to je dalo **četiri lažne greške od pet komponenti**, uz poruku „rad se ne
predaje":

```
· zadatak traži, a u radu nema: broj stranice i kod PARAFRAZE, ne samo kod doslovnog citata
· zadatak traži, a u radu nema: svi elementi rada prema Uputama Katedre
· zadatak traži, a u radu nema: tehničko oblikovanje prema Uputama Katedre
```

Sva tri zahtjeva bila su ispunjena: svih 65 citata imalo je lokator, 9/9 obaveznih dijelova
bilo je gotovo, `check_rules` je javljao 0 kršenja od 15 pravila. Lažni nalaz je ovdje skup
dvostruko, jer stoji pod naslovom „rad se ne predaje" i uči korisnika da tu poruku preskoči.

Popravak: uz komponentu se dopušta polje `provjereno` (`{alat, nalaz, datum}`) za zahtjev
koji se ne da izraziti niskom. Komponenta s iglama provjerava se kao dosad; komponenta s
nalazom provjere ispisuje se kao ograničenje s imenom alata i njegovim nalazom; komponenta
bez jednog i drugog ispisuje se kao „nije strojno provjerljivo", ne kao greška. Greška ostaje
samo ondje gdje igle postoje, a u radu ih nema.

Mjereno poslije zakrpe na istom radu: `✅ nijedna greška`, uz četiri retka pod
„OGRANIČENJA — nije provjereno" koji imenuju alat i nalaz.

## 25. `str(None)` je niska „None", pa dokument bez zadanog proreda dobiva grešku da je prored fiksan

`provjeri_predaju.py` mjeri prevladavajuće `line_spacing_rule` po odlomcima. Kad prored
nigdje nije zadan, `_prevladava` vraća `None`, a `str(None)` daje nisku `"None"` — istinitu
i bez `AUTO`, `POINT` ili `MULTIPLE` u sebi, pa grana koja traži fiksni prored okida.

```python
pravila = str(None)                      # 'None'
bool(pravila and "AUTO" not in pravila.upper()
     and "POINT" not in pravila.upper()
     and "MULTIPLE" not in pravila.upper())    # True  -> GREŠKA
```

Poruka je pritom obrnuta od istine (prored nije zadan, a alat kaže da je fiksan), nalaz je
razine **greška** i zaustavlja predaju, a isti ispis u istom trenutku sadrži i točan nalaz
kao upozorenje:

```
PRIJE:   ❌ GREŠKE (1) — rad se ne predaje:
            · prored je fiksan (None) — inline slike se obrežu na visinu retka
         ⚠️  · prored nije zadan ni na odlomcima ni u stilu — nasljeđuje se iz predloška
POSLIJE: ✅ nijedna greška
         ⚠️  · prored nije zadan ni na odlomcima ni u stilu — nasljeđuje se iz predloška
```

Pogađa svaki dokument sastavljen nad tuđim predloškom, jer takav prored nasljeđuje umjesto
da ga zapisuje. Popravak isključuje nisku `"None"` iz grane; upozorenje koje stvarno opisuje
stanje ostaje. Ograda: dokument koji prored doista nasljeđuje i dalje treba pogledati, ali
to je upozorenje, ne zapreka predaji.

## 26. Blokirajuća provjera koja ne postoji javlja se kao „treba ponovna instalacija"

`provjeri_reference.py` zove se na osam mjesta u `katedra-lite` (`predaja.md` dvaput,
`povratak.md` triput, `dijelovi.json` uz dva obavezna dijela, `katedra/references/kvar.md`
jednom), a `gate.py --faza predaja` vodi je kao **blokirajuću**. Skripte u paketu nije bilo.

```
➖ brojevi stranica protiv stvarnog otiska              blokira
     `rad-docx` nema scripts/provjeri_reference.py — treba ponovna instalacija
```

Dvostruka šteta: jedina provjera koja mjeri brojeve stranica protiv otiska nikad se ne
pokrene, a poruka šalje korisnika da ponovno instalira paket koji je potpun. Ponovna
instalacija daje isti nalaz, pa se drugi put preskoči i prestane se čitati. Popravak je
sama skripta: iz `.docx`-a čita keširane vrijednosti `PAGEREF` polja, iz PDF-a stvarni
prijelom, i uspoređuje ih redak po redak.

```
$ provjeri_reference.py rad.pdf --docx rad.docx
  ✅ svih 27 brojeva slaže se sa stvarnim prijelomom.        (izlazni kod 0)
$ provjeri_reference.py rad.pdf --docx rad_s_jednim_krivim.docx
  ❌ tvrdi 7 · otisak 1   1. UVOD
  ❌ 1 od 27 brojeva ne slaže se s otiskom — rad se ne predaje.   (izlazni kod 1)
```

Ograda koja se izgovara: mjeri se **keširana** vrijednost, a Word je osvježava tek kad
netko otvori dokument i pokrene Update Field. Alat zato ne tvrdi da će brojevi ostati
točni, nego da su točni u datoteci koja se predaje. Izlazni kod 2 znači da se nije dalo
izmjeriti (nema `pdftotext`, nema polja) i to nije isto što i prolaz.
