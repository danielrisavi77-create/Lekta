# Revizija bodovanih pravila: sto alat mjeri i sto je ostalo

Stanje 2026-08-23. Zaseban dokument, ne primopredaja sesije: opisuje `scripts/audit_scored_quotes.py`
i redove nalaza koje proizvodi. Primopredaja je `docs/NASTAVAK_SLJEDECA_SESIJA.md`.

Pokretanje: `npm run audit:scored-quotes`. NIJE u `npm run check` i nijedan test ne cita
`docs/generated/scored-quote-audit.json`.

---

## 1. Brojke

| | pocetak dana | sada |
|---|---|---|
| bodovanih pravila | 1934 | 1932 |
| revidirano | 1391 | **1919** |
| nerevidirano (izvor se ne cita) | 543 | **13** |
| neprovjerivo (skenirano ili ostecen tekstualni sloj) | 9 | **88** |
| pravila s NOVIM nalazom | 319 | **156** |
| priznato (procitano pa ostavljeno) | 37 | **47** |

Nalazi po redu: 148 nedoslovnih prijepisa i 8 odsjecenih. Redovi "kvalifikator", "vrijednost ne stoji
u citatu", "brojevi ne stoje", "vrijednost je SKUP" i "predlozak" su PRAZNI. Pad bodovanih pravila s 1934 na 1932 nije iz ove revizije: `vuka-strojarski-{diplomski,zavrsni}--margins`
demotirao je drift alat paralelne sesije.

Od 163 zatvorena nalaza, **jedan jedini** bio je stvaran kvar u bodovanju (forenzika, nize).
Ostalo je bilo mjerenje, ne podaci. To je najvazniji zakljucak i razlog zasto se svaki nalaz
citao u izvoru prije nego je bilo sto dirano.

---

## 2. Sto je ostalo OTVORENO

### 2.1 Zatvoreno 2026-08-23

Cetiri popravka koja su cekala da se radno stablo smiri su upisana (`2c214fd`, `d9996e5`), uz zeleni
izolirani gate (369/369).

1. **forenzika: margine kao NAJMANJE dopustene.** Jedini nalaz cijele revizije koji je stvarno micao
   ocjenu. Rad s 3 cm sa svih strana, uskladjen s uputom "najmanje 2,5 cm", dobivao je `fail 0/6`;
   sada `pass 6/6`, dok 2 cm i dalje pada. Zastavica stoji u paru: `rules.marginsMinimum` u runtimeu
   i `value.minimum` u draftu.

   ZAMKA: zastavica upisana UNUTAR `rules.margins` ne radi nista. Engine cita `profile.marginsMinimum`,
   a kompajler `minimum` razdvaja samo iz `ruleEntries`. Uhvaceno tek zivom analizom.

2. **`ffzg-etnologija-graduate--font-size`**, citat "ine 12 to" zamijenjen citljivim rasponom sa
   stranice 2 (otisnuto: "u fontu Times New Roman, velicine 12 tocaka").

3. **`grf-diplomski--font`** i **4. `vevu-diplomski--font-size`**: citati produzeni doslovno do
   vrijednosti koju pravilo boduje. Oba izvora su citljiva tek otkad revizija cita `.doc` i `.docx`.

5. **63 retka tudjeg rada u `e44a69c`.** JEDINO sto ostaje otvoreno iz ovog odjeljka. Sweep je upao
   izmedju izmjene i commita, pa su `modality`/`scope`/`modalitySource` iz `kif.json` i `ttf.json`
   zavrsili pod mojom porukom. Nista nije izgubljeno. Povijest NIJE prepravljana jer bi `--amend` u
   dijeljenom stablu mogao pojesti commit druge sesije. Odluka vlasnika.

   Isto se ponovilo namjerno i zapisano u `2c214fd` i `d9996e5`: fajl se ne moze commitati po
   dijelovima, pa te izmjene nose 2 retka njihove `recommendedCitation` promjene i mehanicka polja
   iz sweepa. Cijena je mjerena: nosenje tudje izmjene povlaci i pregradnju artefakata koji o njoj
   ovise (`dist-packs/katedra-pack.json`), a svaki od njih ima svoj drift gard.

### 2.2 Ceka autorsku odluku, nije kvar alata

- **8 odsjecenih citata koji imenuju stvarno izuzece**, ali nijedan ne cini pravilo prestrogim jer
  motor mjeri dominantnu vrijednost. Svaki pokazuje odredbu koju profil ne zapisuje: `hks-diplomski`
  (biljeske 10 pt, prored jednostruk, naslovi lijevo), `ffzg-filozofija-diplomski` (naslovnica,
  sadrzaj i sazeci se ne numeriraju) i `pmf-fizika-graduate` (uz slike i tablice velicina slova je 11,
  ne 12). Dodavanje pravila je autorski posao.
- **148 nedoslovnih prijepisa.** Uzorak procitan: citat sazima natucnicki popis u recenicu, sve
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

NE mjeri: `.html` (7 pravila, pune web stranice s izbornicima pa je omjer suma i koristi slab) i
`.rar` (6 pravila). Ukupno 13 nerevidiranih, i ispis sada kaze RAZLOG po razlog umjesto jedne
neprozirne brojke. Ne mjeri ni `citation-style` os kod provjere vrijednosti
(token je kanonska klasifikacija koju je covjek izveo iz opisa).

Izvori se citaju iz cetiri puta: PDF (fitz), `.docx` (zip + XML), naslijedjeni `.doc` (OLE, tablica
komada) i `<ime>-ocr.txt` uz skenirani PDF (`scripts/ocr_pdf.py`). OCR tekst se NE tretira kao
tekstualni sloj: `has_scanned_pages` ostaje True, pa nepoklopljen citat zavrsi kao NEPROVJERIV, ne kao
nalaz. Da je ta granica krivo postavljena, 141 skenirano pravilo dalo bi desetke laznih optuzbi; dalo
je NULA (108 potvrdjeno, 33 neprovjerivo). Kvaliteta izvlacenja se ne pretpostavlja nego mjeri OMJEROM: 187 novoprocitanih `.doc`
pravila dalo je 6 nalaza (97 posto cisto), a 202 `.docx` pravila 34 nalaza (83 posto). Ostecen
izvlacen tekst dao bi desetke.

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
