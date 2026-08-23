# Revizija bodovanih pravila: sto alat mjeri i sto je ostalo

Stanje 2026-08-23. Zaseban dokument, ne primopredaja sesije: opisuje `scripts/audit_scored_quotes.py`
i redove nalaza koje proizvodi. Primopredaja je `docs/NASTAVAK_SLJEDECA_SESIJA.md`.

Pokretanje: `npm run audit:scored-quotes`. NIJE u `npm run check` (cita PDF-ove, treba Python), ali
OD 2026-08-23 JEST u obaveznom CI-ju: `.github/workflows/rule-claims.yml` regenerira artefakt i pada
ako se razlikuje od commitanog (`docs/generated/scored-quote-audit.json`), plus vrti negativne
kontrole suzenja (`npm run audit:selftest`) PRIJE svega ostaloga.

---

## 1. Brojke

| | pocetak (2026-08-22) | sada (2026-08-24) |
|---|---|---|
| bodovanih pravila | 1934 | 1930 |
| revidirano | 1391 | **1930** |
| nerevidirano (izvor se ne cita) | 543 | **0** |
| neprovjerivo (skenirano ili ostecen tekstualni sloj) | 9 | **0** |
| pravila s NOVIM nalazom | 319 | **0** |
| priznato (procitano pa ostavljeno) | 37 | **57** |

**Sva tri reda sutnje su prazna.** Svako bodovano pravilo ima izvor koji se stvarno cita i citat
koji se u tom izvoru pokaze. Nijedan red provjere (parafraza, brojevi, odsjecen citat, kvalifikator,
vrijednost izvan citata, predlozak) ne prijavljuje nista neodluceno. Mjerodavan je artefakt
(`docs/generated/scored-quote-audit.json`), ne ovaj zapis.

Pad s 1934 na 1930 nije iz ove revizije: cetiri pravila demotirao je drift alat
(`vuka-strojarski-*--margins` i dalje dva u presudi raskoraka).

Prazno NIJE isto sto i "sve je bilo tocno". Od oko 320 zatvorenih nalaza tocno JEDAN je bio kvar u
bodovanju (forenzika, nize) i jedan je svjesno odstupanje koje ostaje (`unizd-pomorski`, nize).
Ostalo je bilo MJERENJE, ne podaci: citat je bio vjeran a provjera ga nije znala pokazati.

Pad bodovanih pravila s 1934 na 1932 nije iz ove revizije:
`vuka-strojarski-{diplomski,zavrsni}--margins` demotirao je drift alat paralelne sesije.

`nerevidirano` je palo na NULU: svaki izvor iza bodovanog pravila sada se stvarno cita. `neprovjerivo`
je 2026-08-23 palo s 72 na 35 suzenjem potiskivanja skeniranih dokumenata (`text_layer_covers_axis`):
prije je jedna stranica-slika opravdavala tisinu nad CIJELIM dokumentom, sada samo nad osima o kojima
citljivi sloj ne govori nista. Tih 37 otkljucanih pravila proslo je SVE, pa se artefakt nije
promijenio ni za bajt; detalji i negativne kontrole u `docs/PLAN_POTPUNA_POKRIVENOST.md`. S 35 na 31
palo je 2026-08-24 uvodjenjem drugog citanja (odjeljak 3.1), a s 31 na NULU istog dana, kad je
sutnja prvi put POPISANA umjesto samo prebrojana:

- Popis je pokazao da iza 31 pravila stoje samo CETIRI izvora, a ne 31 zaseban slucaj. Dok je stajala
  gola brojka, izgledalo je kao trideset i jedan problem.
- `unipu-zavrsni-izmjene-2021` (18 pravila) i `forenzika-pravilnik-diplomski` (7) nisu imali OCR
  pratitelja. Nakon dva pokretanja `scripts/ocr_pdf.py` svih 25 je POTVRDJENO, bez ijednog nalaza.
  Dokaz nije pretpostavljen: sloj `unipu` daje "Zavr5ni rad ... u formatu 44; ... podrubne bilje5ke
  10", a OCR "Zavrsni rad ... u formatu A4; ... podrubne biljeske 10". `forenzika` OCR doslovno nosi
  "rubovi ... moraju biti siroki najmanje 2,5 cm", odredbu zbog koje je nastao jedini stvarni kvar
  bodovanja u cijeloj reviziji.
- `ffri-povum` (6 pravila) je imao pratitelja, pa je ostatak bio autorski, ne tehnicki: citat je bio
  SPOJEN IZ DVA DOKUMENTA. Vidi 2.1, tocku 8.

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

6. **Dva stvarna kvara citata, nadjena 2026-08-24** kad je popravljena mjera pustila provjeru da se
   uopce izvede. Oba su spajala tudje rijeci u jednu tvrdnju:

   - `sois-ft-vojno-*-diplomski--page-count` (3 profila): citat je glasio "Opseg diplomskog rada
     (...) **treba biti** najmanje 50 stranica". Izvor te recenice nema. "treba biti najmanje" stoji
     uz **30** stranica za ZAVRSNI rad, a diplomski dobiva samo "(...) najmanje 50 stranica". Citat
     je dakle uzeo glagolski dio jedne odredbe i broj druge. Prepisana je cijela odredba, pa se sada
     vidi koji broj kojoj vrsti rada pripada.
   - `ffri-germanistika-{diplomski,zavrsni}` (14 pravila): citat je bio REKONSTRUIRAN, ne prepisan.
     Njemacki umlauti su bili pretipkani u ASCII ("Schriftgrosse", "Fussnoten", "Seitenrander"), a
     odredbe iz Layout tablice slozene u jednu recenicu koje u dokumentu nema. Izvor je pritom posve
     citljiv. Zamijenjeno obvezujucom izjavom sa str. 5 plus doslovnim Layout blokom sa str. 21.

8. **`ffri-povum` (6 pravila): citat spojen iz DVA dokumenta.** Odsjecki dodatak je bio naveden kao
   izvor, a prva recenica citata ("Zavrsni rad otisnut je racunalnim pisacem na papiru formata A4")
   u njemu ne stoji: dodatak sam kaze da "nadopunjuje izneseno u Cl. 9 Pravilnika o zavrsnom radu
   FF". `font-size` i `justify` DOISTA stoje u dodatku ("Upotreba tipa slova Times New Roman,
   velicine 12 i proreda 1,5 u osnovnom tekstu"; "Poravnavanje teksta po obje margine") pa su dobili
   njegov doslovan tekst. `paper-size` u dodatku NE stoji, pa je vezan na akt koji ga propisuje
   (`ffri-pravilnik-{diplomski,zavrsni}-2023`, clanci 11. i 8.). Vrijednost se nije mijenjala.

   OTVORENO ZA VLASNIKA: registar ima i `ffri-pravilnik-zavrsni-2026`, koji koriste 2 pravila, dok
   ostalih 12 ffri pravila koristi izdanja iz 2023. Uzeo sam 2023 radi sklada unutar jedinice, ali
   ako 2026 zamjenjuje raniji akt, bumpati treba SVE zajedno, ne samo povum.

9. **63 retka tudjeg rada u `e44a69c`.** JEDINO sto ostaje otvoreno iz ovog odjeljka. Sweep je upao
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
- **`unizd-pomorski-zavrsni--font` je jedino svjesno odstupanje koje ostaje.** Izvor doslovno pise
  "fontom Marriweather", profil boduje "Merriweather". Razlika je jedno slovo i namjerna: font
  "Marriweather" ne postoji, pa bi bodovanje doslovnog imena palo na SVAKOM radu, ukljucujuci onaj
  koji uputu tocno slijedi. Citat je oznaku "[sic - tipfeler u izvoru]" nosio i prije revizije.
  Provjera to ne moze prestati prijavljivati ni uz najbolji citat, jer vrijednost po definiciji ne
  lezi u izvoru; zato je zapisano u `known-findings`, a ne popravljeno.

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

### 3.1 Drugo citanje: OCR pratitelj kao dokaz, ne kao tisina

Do 2026-08-24 se izvor citao JEDNOM. Kad je tekstualni sloj PDF-a pokvaren, tocno pravilo je
izgledalo kao izmisljeno. `evidence_text` zato spaja dva citanja istog dokumenta: tekstualni sloj
i OCR pratitelja (`<ime>-ocr.txt`). Citat koji potvrdi bilo koje od dva citanja jest potvrdjen.

- **Zasto nije dovoljna mjera ostecenja.** `ffri-pravilnik-diplomski-2023` daje "Velicina: I2pt" i
  "papiru 44 formata (2tO x 291 mm)", a otisnuta stranica (provjereno renderiranjem na 4x) glasi
  "12pt" i "A4 formata (210 x 297 mm)". Udio mijesanih tokena je ipak samo **0,8 posto**, ispod
  praga 3,5, jer je kvar zbijen bas u brojeve dok se ostatak dokumenta izvlaci uredno. Globalna
  mjera taj razred ne vidi i spustanje praga bi ju samo otupilo.
- **`document_text` NAMJERNO ostaje samo tekstualni sloj.** O njemu govore `text_layer_damaged` i
  `text_layer_covers_axis`. Kad bi i oni vidjeli OCR, skenirani izvor bi se poceo tretirati kao da
  ima tekstualni sloj i 141 skenirano pravilo bi opet postalo optuzba.
- **Ne moze utisati nalaz.** OCR ne zna sto pravilo tvrdi, pa ne moze proizvesti slaganje. Tvrdnje
  koje nema ni na otisnutoj stranici pada i dalje; to tvrdi negativna kontrola, ne obrazlozenje.
- **CI ne treba tesseract.** Pratitelji su commitane datoteke; OCR se vrti rucno kad se izvor doda.

Isti krug je otkrio jos dva kvara MJERE, oba nadjena tek kad je nesto drugo popravljeno:

- **`numbers_match` je preskakao lokalizaciju kad broj nosi JEDNA recenica.** Grana po recenicama
  imala je uvjet `len(parts) > 1`, pa je citat s brojem u drugoj od cetiri recenice padao natrag na
  prozor CIJELOG citata. Kod `apuri` se prozor slozio oko opisa popisa literature, gdje "1." iz
  "UVOD ... numerira se brojem 1." nije ni moglo stajati: rijeci su se poklapale 95 posto i ispalo
  je "BROJEVI ne stoje" nad doslovnim prijepisom.
- **OCR natuknicu (•) cita kao slovo "e" na pocetku retka.** To nije rijec dokumenta, a lomi sidro
  kroz popis: kod `ffri-pravilnik-zavrsni-2023` je oblikovanje u pet natuknica, pa je najdulje sidro
  padalo na "font times new roman", a "Prored: 1,5" ostajalo izvan svakog sidra. Skup je zatvoren na
  "e" jer ostali glifovi natuknice nisu slova pa ih `anchor_form` ionako mice, a hrvatske jednoslovne
  rijeci ("i", "a", "o", "u") se ne smiju dirati.

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
