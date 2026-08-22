# Revizija bodovanih pravila: sto alat mjeri i sto je ostalo

Stanje 2026-08-22. Zaseban dokument, ne primopredaja sesije: opisuje `scripts/audit_scored_quotes.py`
i redove nalaza koje proizvodi. Primopredaja je `docs/NASTAVAK_SLJEDECA_SESIJA.md`.

Pokretanje: `npm run audit:scored-quotes`. NIJE u `npm run check` i nijedan test ne cita
`docs/generated/scored-quote-audit.json`.

---

## 1. Brojke

| | pocetak dana | sada |
|---|---|---|
| bodovanih pravila | 1934 | 1934 |
| revidirano | 1391 | **1593** |
| nerevidirano (izvor se ne cita) | 543 | **341** |
| neprovjerivo (skenirano ili ostecen tekstualni sloj) | 9 | **57** |
| pravila s NOVIM nalazom | 319 | **155** |
| priznato (procitano pa ostavljeno) | 37 | **47** |

Nalazi po redu: 143 nedoslovna prijepisa, 7 odsjecenih, 4 bez vrijednosti u citatu, 1 kvalifikator.

Od 164 zatvorena nalaza, **jedan jedini** bio je stvaran kvar u bodovanju (forenzika, nize).
Ostalo je bilo mjerenje, ne podaci. To je najvazniji zakljucak i razlog zasto se svaki nalaz
citao u izvoru prije nego je bilo sto dirano.

---

## 2. Sto je ostalo OTVORENO

### 2.1 Blokirano tudjim necommitanim radom

Paralelna sesija drzi ~367 datoteka necommitano (sweep `apply_claim_modality.py`). `git commit`
po putanji uzima sadrzaj iz RADNOG STABLA, pa bi povukao njihov rad. Cim se stablo smiri:

1. **forenzika, ciljana vrijednost umjesto najmanje.** Jedini nalaz koji stvarno mice ocjenu.
   Izvor: "rubovi na obje strane, gore i dolje, moraju biti siroki NAJMANJE 2,5 cm". Profil boduje
   tocno 2,5, engine usporedjuje uz toleranciju 0,36 cm, pa rad s 3 cm sa svih strana dobiva
   `Margine dokumenta: fail 0/6`. Izmjereno kroz zivu analizu.

   Motor to od `ec940fa` zna (`marginsMinimum`, pokriveno `tests/margins-minimum.test.ts`), ali
   zastavica je mrtvo slovo dok je profil ne ukljuci. Izmjena je jedna, u
   `data/profiles/verified-profiles.json`, profil `forenzika-diplomski`:

   ```json
   "margins": { "top": 2.5, "right": 2.5, "bottom": 2.5, "left": 2.5, "minimum": true }
   ```

   Kompajler `minimum` odvaja od strana, pa `normalizeCheckFlags` i dalje vidi cetiri broja.

2. **`ffzg-etnologija-graduate--font-size`, citat "ine 12 to".** Vrijednost 12 je TOCNA. Stranica 2
   izvora je renderirana i procitana kao slika: otisnuto stoji "u fontu Times New Roman, velicine 12
   tocaka, s proredom". Znak `þ` je artefakt izvlacenja teksta, a citat je krhotina izmedju dva takva
   znaka. Zamijeniti citat u `data/profiles/ffzg/drafts/ffzg-etnologija-graduate.json` s:
   `"tekst rada treba biti u fontu Times New Roman, velicine 12 tocaka"`.

3. **`vevu-diplomski--font-size`.** Izvor (.docx, sada citljiv) doslovno kaze "...naslove potpoglavlja
   malim slovima 12 pt Bold, a obican tekst 12 pt", a citat je preskocio bas tu recenicu. Produziti
   citat tom recenicom.

4. **63 retka tudjeg rada u `e44a69c`.** Sweep je upao izmedju moje izmjene i commita, pa su
   `modality`/`scope`/`modalitySource` iz `kif.json` i `ttf.json` zavrsili pod mojom porukom. Nista
   nije izgubljeno. Povijest NIJE prepravljana jer bi `--amend` u dijeljenom stablu mogao pojesti
   commit druge sesije. Odluka vlasnika.

### 2.2 Ceka autorsku odluku, nije kvar alata

- **4 pravila kojima citat ne nosi vlastitu vrijednost, a izvor se ne moze strojno procitati:**
  `grf-diplomski--font` (.doc), `ffri-povum-{diplomski,zavrsni}--footnote-size` (potpuno skeniran PDF,
  nula znakova teksta). `.doc` je OLE binarni format; citanje bi trazilo novu ovisnost ili OCR.
- **4 odsjecena citata koji imenuju stvarno izuzece**, ali nijedan ne cini pravilo prestrogim jer
  motor mjeri dominantnu vrijednost. Svaki pokazuje odredbu koju profil ne zapisuje:
  `hks-diplomski` (biljeske 10 pt, prored jednostruk, naslovi lijevo) i `ffzg-filozofija-diplomski`
  (naslovnica, sadrzaj i sazeci se ne numeriraju). Dodavanje pravila je autorski posao.
- **143 nedoslovna prijepisa.** Uzorak procitan: citat sazima natucnicki popis u recenicu, sve
  vrijednosti su na mjestu. Gubi se sljedivost, ne bodovanje. Preporuka: NE prepisivati ih. Citat se
  studentu nikad ne prikazuje; u proizvodu je VRATA (`sourceId && sourcePage && quote` otkljucava
  ponude asistiranog popravka) i ne izlazi kroz izvoz prema Katedri.

### 2.3 Odgovoreno mjerenjem, ne treba vise nista

- `paper-size: true` naspram `paper-size: "A4"`: **isto bodovanje** (`pass 3/3` za A4, `warn 1/3` za
  Letter). Razlikuje se samo naslov provjere.
- `alu-kiparstvo--paper-size` i polozeni A4: provjera formata usporedjuje dimenzije bez obzira na
  redoslijed, pa nema posljedice. Priznato uz napomenu da nalaz treba otvoriti ako se provjera ikad
  pooštri na orijentaciju.
- `zvu-specijalisticki` NE boduje iz akta za drugu vrstu rada. Naslov akta: "PRAVILNIK O ZAVRSNIM
  RADOVIMA NA STRUCNIM I SPECIJALISTICKIM DIPLOMSKIM STRUCNIM STUDIJIMA"; Prilog 3. je zaseban
  obrazac za specijalisticki studij. Raniji zapis je bio kriv i ispravljen je.
- `pravo-doktorski-pravne-znanosti` DOISTA boduje iz akta za drugu vrstu rada: naslov pokriva samo
  diplomske i zavrsne radove, a u 16.763 znaka nema "poslijediplom", "doktorski rad" ni "disertacij".
- Oba stupa izvedene odluke za `pravo` su potvrdjena: dokument se doslovno spusta na preporuku, a
  obvezujuci `pravo-pravilnik-studiji-2026` (56.097 znakova) ima NULA formatnih odredbi.

---

## 3. Sto alat sada mjeri, i sto NE mjeri

Sest provjera, svaka suzena na razred koji stvarno moze pomaknuti ocjenu ili srusiti obranu pred
fakultetom. Svako suzenje je izmjereno na svim nalazima tog reda, ne procijenjeno.

| provjera | okida kad |
|---|---|
| citat nije doslovan prijepis | podudaranje rijeci ispod 85% |
| brojevi ne stoje | rijeci se poklapaju, ali broj iz citata nije u opisanom odlomku |
| odsjecen citat | nastavak imenuje DIO RADA, govori o ISTOJ osi i nudi DRUGU vrijednost |
| kvalifikator | ublazavanje upravlja bas vrijednoscu koja se boduje |
| vrijednost ne stoji u citatu | citat ne spominje ono sto pravilo boduje |
| predlozak | tvrdnja o XML-u nije potvrdjena u opsegu na koji se poziva |

NE mjeri: `.doc`, `.html`, `.rar` izvore (341 pravilo), i `citation-style` os kod provjere
vrijednosti (token je kanonska klasifikacija koju je covjek izveo iz opisa).

---

## 4. Zamke koje se ne isplati ponovno otkrivati

- **Izvjestaj SKRACUJE citat.** Repliciranje nad `docs/generated/scored-quote-audit.json` prolazi
  ondje gdje pun citat pada. Puni citati su u `data/profiles/*/drafts/`.
- **Ostecen tekstualni sloj nije kvar podatka.** `unipu` daje "zavr5ni rad" i "formatu 44", `biolos`
  daje "2,n" umjesto "2,5". Kad podudaranje pada a citat izgleda uredno, RENDERIRAJ stranicu i
  procitaj je kao sliku (fitz, 4x zoom). Dvaput je time dokazano da je podatak tocan.
- **Jedinice.** Izvori pisu margine u milimetrima ("lijeva 25 mm"), profil u centimetrima. 35 od 43
  pogotka provjere vrijednosti bilo je samo to.
- **Dvoznacne hrvatske rijeci.** "po obje margine" je poravnanje, ne margine. "Ispis rada: obostran"
  je obostrani ISPIS, ne poravnanje teksta (uz to OCR daje "lspis"). "Razmak prije i poslije 0 pt" i
  "12 pt" dijele mjeru, pa goli `pt` ne smije oznacavati os velicine slova.
- **Granica koju pravilo vec boduje nije ublazavanje.** "najvise do tri (3) razine" uz `maxLevel: 3`
  je iskaz same odredbe. Margine nisu takav slucaj jer su im kljucevi strane.
- **Negativni gard je obavezan.** Prva izvedba provjere predlozaka trazila je `w:sz="24"` po cijelom
  paketu i propustala izmisljene tvrdnje, jer predlozak legitimno sadrzi `w:sz="28"` za naslove.
  Provjera koja ne moze pasti gora je od nikakve, i to ne otkriva citanje koda nego podmetnut ulaz.
- **Prije commita u dijeljenom stablu** ponovi `git diff --stat -- <putanje>` i usporedi s onim sto
  si stvarno mijenjao. Generator druge sesije zna upasti izmedju izmjene i commita.
