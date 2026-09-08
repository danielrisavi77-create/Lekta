# v1.9.6 — registar kvarova postaje provjerljiv (kvarovi 113 i 114)

Dva otvorena pitanja iz PR-a #10, oba riješena tako da se **alat proširi, a sadržaj ne dira**.

* **Kvar 113 — `kvar.py` je poznavao samo jedan broj po unosu.** Zakrpa v1.9.5 upisala je četiri unosa koji pokrivaju po tri-četiri kvara (ista klasa, isti popravak, jedno mjerenje). Alat ih u izvornom obliku (`## Kvar 61–63 — …`) **nije vidio uopće**: brojao je 34 unosa, zadnji 57, „sljedeći slobodan: 58" — pa bi sljedeća zakrpa uzela već potrošene brojeve, uz zeleno od alata. Prepisani u oblik koji čita, davali su tri lažna preskoka. Podjela na po jedan broj **nije bila izvediva bez pogađanja**: poruka commita i katalog za skupinu 61–63 navode različite treće stavke, pa nigdje ne stoji koji broj pripada kojoj. Zato naslov sada prima raspon (`## 61–63. naslov`), numeracija se provjerava po **brojevima**, sadržaj po **unosu**, a `--novi` kreće od zadnjeg pokrivenog broja. Poslije: `44 unosa (od toga 4 s rasponom) · zadnji broj: 75 · sljedeći slobodan: 76`, exit 0. Ograda: raspon unatrag (`## 66–64.`) daje tvrdi nalaz.
* **Kvar 114 — katalozi nisu bili u `bin/testovi.sh`.** Isti repo davao je dvije istine: `kvar.py` exit 1 nad katalogom s tri tvrda nalaza, `bin/testovi.sh` „✅ svih 9 skupina prošlo". Pokretala se ona zelena. Dodane su tri skupine (katedra-lite, rad-audit, rad-docx), suite ide **9 → 12**. Ograda po pravilu 34: prepisan naslov `## 71.` u `## 75.` obara skupinu i cijeli suite.

**Zašto nije prenumerirano.** Brojevi 58–73 već su u opticaju: `test_gate.py` (58), `bolesni_rad.py` (68), `test_all.py` (61–71), `katedra-lite/SKILL.md` (58), poruke commita i `PROMJENE.md`. Prenumeracija bi ih sve razvezala; raspon ih zadržava i čini vidljivima.

# v1.9.5 — `VERSION` prestaje tiho zaostajati (kvar 57, ograda → popravak)

* **Zašto.** Kvar 57 je bio zapisan s ogradom, ne s popravkom: „`VERSION` i dalje piše rukom onaj tko radi commit". Izmjereno 5. 9. 2026. na ovom repou: datoteka je govorila **1.9.2**, a repo je bio **16 commita dalje**, s doktrinom v1.9.4 u `PROMJENE.md`. Svaka sesija koja je poslušala § 0.0 pravilo (4) ispisivala je tu brojku kao činjenicu — točno ona vrsta tihog kvara zbog koje pravilo 20 postoji, samo na razini isporuke.
* **Popravak.** `bin/env.sh` uz sadržaj datoteke sada računa i otisak commita te broj commita otkad se `VERSION` nije mijenjao, pa `KATEDRA_PKG_VERZIJA` nosi cijelu istinu. Ostale varijable (`KATEDRA_PKG_VERZIJA_DATOTEKA`, `KATEDRA_PKG_COMMIT`, `KATEDRA_PKG_ZAOSTAJE`) izvezene su odvojeno. § 0.0 se ne mijenja — ondje se ta varijabla samo ispisuje, pa popravak stiže u sve sesije bez dodavanja ijednog koraka.
* **Provjereno (3 stanja).** `VERSION` zaostaje → `1.9.2 (62c95f7 · ❗ VERSION zaostaje 16 commita, v. kvar 57)` · poslije podizanja na 1.9.4 → `1.9.4 (e5fda9e)`, bez upozorenja · raspakiran zip bez `.git` → `1.9.4 (bez gita — otisak se ne može provjeriti)`, jer nepoznato nije isto što i uredno.
* **Uz to `VERSION` 1.9.2 → 1.9.4**, da tekuće stanje odgovara doktrini koja je u repou od PR-a #8.
* **Granica.** Ovo ne veže `VERSION` uz commit nego ga čini **provjerljivim**. Broj se i dalje piše rukom; razlika je što se zaostajanje sada vidi bez pitanja.

# v1.9.4 — isporuka i doktrina: kvarovi 54–57, pravila 33 i 34

Zakrpa 1 popravljala je alate; ova popravlja **isporuku**. Pisana je nad `e57ac53`, dakle nad
stanjem koje je repo doista imao, pa je primijenjena bez ijednog sukoba — prvi put u ovom nizu.

* **Kvar 54 — kartica nosi samo `SKILL.md`.** U sesiji bez paketa agent učitava router koji
  imenuje 18 skripti, a nijedne nema. `drift.py` je to dosad prijavljivao kao ⚠️ *nije
  izmjereno*, blaže od obične razlike, iako je to najgori mogući ishod. Sada je ❗ nalaz s
  izlazom 1, i imenuje koliko skripti router traži a nema ih.
* **Kvar 55 — spremanje kartice briše ono što se ne preda.** `rad-docx/SKILL.md` u repou je
  nosio opis *promjene* („Ažurira broj kvarova u katalogu zamki s 23 na 31") umjesto opisa
  skilla; description je vraćen na „Motor izrade predajnog .docx-a…". Odatle pravilo pri
  spremanju: predaje se **cijeli** `SKILL.md`, jer kartica ga zamjenjuje u cijelosti.
* **Kvar 56 — `rad-orchestrator` v1.2 u repou, v1.2.1 u kartici.** Presuda ide na različite
  strane: `SKILL.md` iz kartice, `scripts/rad-orchestrator.js` iz repoa (kartičin nema redak
  verzije koji njegov vlastiti SKILL.md nalaže). Ovdje je preuzet SKILL.md.
* **Kvar 57 — mjerila se kriva kopija.** Prva verzija pomirenja uspoređivala je karticu s
  lokalnim `~/.katedra-pkg` (v1.9.2), dok je remote već nosio v1.9.3; zakrpa pisana nad tom
  kopijom bila bi numerirana od 50 i sudarila se sa svime što je već u repou.
* **§ 0.0 kreće od priloga.** Redoslijed je sada: zip/bundle u chatu → git → kartica.
  Ispravljena je i tvrdnja o egressu: anonimni `clone` javnog repoa **prolazi** i u cloud
  sesiji; ono što pada je `push`. Doktrina je to prije spajala u jedno.
* **Pravila 33 i 34.** „Provjera koja ne može pasti nije provjera" i „Provjera se prima tek
  kad je pokazano da pada." Pravilo 34 platilo se prije isporuke: mutacijski test uhvatio je
  dva tiha kvara u samom popravku — `ls -d "$KATEDRA_PKG"/*/` ne vidi mapu koja počinje
  točkom (a zip iz `~/.katedra-pkg` nosi korijen `.katedra-pkg/`), i hrvatski zatvoreni
  navodnik zapisan kao ASCII `"` koji bi srušio cijeli blok § 0.0 u svakoj sesiji.

## Provjereno pri primjeni

```
bash -n nad blokom § 0.0                       ✅ (14 bash blokova u SKILL.md-u; provjeren onaj koji se izvršava)
drift A) stvarno stanje                        ❗ KARTICA NEMA scripts/ — 18 imenovanih skripti · izlaz 1
drift B) kartica ima scripts/, sve isto        ✅ 72 datoteke · izlaz 0
drift C) iz kartice obrisan gate.py            ❌ 1 samo u repou (gate.py) · izlaz 1
drift D) u kartici izmijenjena rubrika.py      ❌ 1 različitih (rubrika.py) · izlaz 1
kvar.py zamke.md --provjeri                    34 unosa · zadnji 57 · exit 0
pravila u SKILL.md                             30, 31, 32, 33, 34
rad-docx description                           „Motor izrade predajnog .docx-a…"
rad-orchestrator                               v1.2.1
test suite rad-audita                          82/82 · zakrpa.py --provjeri-tvrdnje ✓ ✓
```

Mutacije B–D nisu prepisane iz uputa nego ponovljene ovdje, nad lažnom karticom sagrađenom
iz repoa; D je dodana, jer B i C pokrivaju samo *nedostajuću* datoteku, ne izmijenjenu.

## Zipovi kartica

Pet zipova u `kartice/` uspoređeno je s ovim repoom datoteku po datoteku: **nijedna zajednička
datoteka se ne razlikuje** (katedra-lite 144, rad-audit 27, rad-docx 16, katedra 8,
rad-orchestrator 2). Zipovi su strogi podskup repoa — izostavljaju `docs/`, `assets/` i
`tests/fixtures/`, što kartica ne treba. Učitavanje dakle ne može ništa vratiti unatrag.

**Drugi korak nije opcionalan i ne može se napraviti odavde:** dok zipovi ne odu u uređivač
skillova, kvar 54 stoji, a `drift.py` s pravom vraća izlaz 1.

# v1.9.3 — kako je zakrpa primijenjena, i dva popravka u njoj

Zakrpa je nastala na bazi `fd253b6` (PR #4), pa ne poznaje ni PR #5 ni PR #6. Isporučena je
i kao bundle, pa je spojena **trosmjerno** umjesto prepisivanjem: `common.py`,
`provjeri_predaju.py`, `primjerci.py`, `tempo.py`, `hr_text.py` i `check_argument.py` git je
pomirio sam, a ručno je riješeno sedam sukoba.

* **Numeracija.** Zakrpa je svoje unose numerirala od brojeva koje su u međuvremenu potrošili
  PR #5 i PR #6. Kako su to različiti kvarovi, a ne verzije istih, pomaknuti su iza
  postojećih: katedra-lite **45–48 → 50–53**, rad-audit **3–5 → 9–11**, rad-docx
  **24–25 → 25–26**. Isto vrijedi za doktrinu: `main` već ima željezno pravilo 31 („Rad koji
  nitko nije pročitao nije provjeren rad"), pa je pravilo o uzorku kao riziku ponavljanja
  postalo **32**. Uz brojeve su poravnate i **13 unutarnjih referenci** u tekstu zakrpe —
  prenumeracija bez toga ostavlja upute koje pokazuju na tuđe unose, što je gore od sudara
  jer izgleda točno.
* **Otisak motora.** `engine_version` je sha256 nad `rad-audit/scripts/*.py`, pa poslije spoja
  nije točan nijedan od ponuđenih. Preračunat nad spojenim stablom: **`fb8ae4bb`**. To je
  ujedno korak koji zakrpa sama traži u svojem kvaru 11.

**Popravak 1 — `check_argument.py`, veličina slova u zastavici tuđeg autorstva.** Zakrpa
ispravno razdvaja popis imenica od strukturnog znaka, ali je novi uzorak `\bautor\w*\s+[A-Z…]`
u cijelosti osjetljiv na veličinu slova, pa mu je i **korijen** postao osjetljiv. Time
„Izvor: Autor Ivić (2020)", „Autori Ivić i Perić (2021)" i „Autorica Marić (2019)" prolaze kao
**studentov vlastiti prikaz**. Lažno zeleno na autorstvu skuplje je od lažno crvenog koje je
zakrpa uklonila. Zastavica se sada odnosi samo na slovo iza korijena
(`(?i:\bautor\w*)\s+[A-ZČĆŽŠĐ]`). Mjereno na šest redaka izvora: zakrpa 3 promašaja, poslije 0,
uz zadržan popravak („izrada autora prema ZPD, čl. 28." i dalje vlastito).

**Popravak 2 — nije popravak nego mjera koja ne stoji.** UPUTE tvrde „84 testa prolaze", a
`rad-audit/scripts/tests/test_all.py` **nije u zakrpi**: suite ima 82 testa i svih 82 prolazi.
Za dva rad-audit popravka (dijalekt lokatora, dijeljenje rečenica) u suiteu nema nijednog
testa. Po pravilu 8 skilla `katedra` to je tvrdnja bez pokrića; ovdje je zapisana, a ne
prešućena. Popravci su umjesto toga izmjereni ručno prije/poslije (v. niže).

**Izmjereno na ovom stroju, prije/poslije, nad verzijama iz gita:**

* `hr_text.recenice` — „Prema točki 4. MRS-a 12 odgođena porezna imovina…" prije je bila
  **dvije** rečenice, sada **jedna**; na fixtureu od četiri rečenice s pravnim referencama
  5 → 4.
* `check_argument._tudje_autorstvo` — „Izvor: izrada autora prema ZPD, čl. 28." prije **tuđe**,
  sada **vlastito** (to je kvar 52), uz zadržano prepoznavanje stvarnog tuđeg autorstva.
* Katalozi poslije prenumeracije: katedra-lite **30 unosa / zadnji 53**, rad-audit **11 / 11**,
  rad-docx **26 / 26**, sva tri `kvar.py --provjeri` exit 0.
* `zakrpa.py --provjeri-tvrdnje` nad `rad-audit` i `katedra-lite`: „✓ SKILL.md i kod se slažu".

**Nije provjereno ovdje:** `profile_resolver.py` ne može validirati razriješeni profil jer na
ovom stroju nema paketa `jsonschema`, pa je promjena overlaya (`administrativni_rep_dana: 0`
za seminarski) potvrđena čitanjem JSON-a, ne izvođenjem. Deklarirano ograničenje, ne nalaz.

# v1.9.3 — sesija „porezne olakšice" (5. 9. 2026.): mjerila koja su mjerila krivu stvar

Sve niže potječe iz jedne sesije u kojoj je seminarski rad prošao sve modove uz uzorak s
ocjenom 5 kao predložak. Zajedničko im je da nijedan nije srušio skriptu: svi su tiho dali
krivu brojku, a autor je po njoj mijenjao uredan rad.

* **Kvar 50 — `primjerci.py` mjerio je veličinu pisma iz natpisa prikaza.** Odlomak tijela
  koji veličinu nasljeđuje iz `docDefaults` vraća `None` i ispada iz moda; na uzorku je
  takvih bilo **59**, a jedinih pet s izričitom veličinom bili su natpisi od 11 pt. Mjereno
  `11.0` umjesto `12.0`. Kvar se širi jer po pravilu 17 primjerak nadjačava profil: 11 pt je
  ušlo u `resolved_profile.json` i `check_rules` je zatim blokirao vlastiti generirani rad.
  Popravak izbacuje `Caption`, `table of figures`, `TOC*`, zaglavlja i fusnote iz uzorka
  tijela i čita `docDefaults` kad odlomak nema izričitu veličinu.
* **Kvar 51 — `hr_text.recenice` lomio je rečenicu na rednom broju pravne reference.**
  `prema članku 6. ZPD-a` postajalo je dvije rečenice. Na fixtureu pravne proze: 6 rečenica,
  medijan 9,5 i 50 % kratkih prije, 4 rečenice, medijan 15,5 i 0 % kratkih poslije.
  `check_ai_style` je zbog toga javljao staccato na tekstu iznad praga. Ograda se izgovara:
  `To stoji u članku 6. Sljedeće poglavlje…` sada se spaja u jednu rečenicu.
* **Kvar 52 — `re.IGNORECASE` gasio je strukturni znak u `check_argument.py`.**
  `\bautor\w*\s+[A-ZČĆŽŠĐ]` s `IGNORECASE` hvata i mala slova, pa je `izrada autora prema
  ZPD` davalo podudarnost `autora p` i cijeli izvor prijavljivalo kao tuđe autorstvo.
  Mjereno na radu sa šest autorskih prikaza: `vlastitih: 0 · prerađenih: 6` prije,
  `vlastitih: 6 · prerađenih: 0` poslije. Pogađa **svaki** izvor koji uz autorstvo imenuje
  podlogu, dakle oblik koji profil traži, i nagrađuje brisanje provenijencije — u toj je
  sesiji autor doista izbrisao „prema ZPD, čl. 28." iz dva izvora da zadovolji mjerilo.
* **Kvar 53 — rep predaje čitao se s razine fakulteta.** 14 dana iz `efzg.json` pokriva
  Turnitin, uvez i repozitorij, korake završnog rada; seminarski se predaje e-mailom.
  Svaki seminarski s rokom kraćim od 14 dana dobivao je „ROK JE PROŠAO ILI GA JEDE
  ADMINISTRATIVNI REP". Overlay `efzg-rfir-seminarski` dobiva vlastiti blok `predaja`
  (rep 0, dva stvarna koraka), a `tempo.py` uz brojku ispisuje i odakle je uzeta.
* **`scripts/slicnost.py`** (novo) — preklapanje rada s referentnim dokumentom po n-gramima
  nad riječima, uz podjelu na **nužno** (naziv propisa, broj NN, oznaka točke standarda) i
  **izbježivo** (proza). Mjereno na istom radu prije i poslije prepisivanja: 8-grami
  2,09 % → 0,91 %, izbježivih 43 → 5. Izlazni kod je uvijek 0: ovo je mjera, ne presuda.
* **Željezno pravilo 32** — uzorak s ocjenom je istovremeno mjerilo oblika i rizik
  ponavljanja. Pravila 17 i 24 pokrivaju oblik; sadržajno preklapanje s radom istog
  kolegija nije mjerio nitko, a mentor koji je oba rada čitao vidi ga bez alata.
* **Profil.** `efzg.json` dobiva primjerak `efzg-rfir-seminarski-ocjena5-2026` s izmjerenim
  vrijednostima obranjenog rada; dvije proturječe overlayu (`prijelom_pred_poglavljem`
  false naspram 8/8 izmjereno, opseg 3000–4000 riječi naspram 3990 riječi na 13 stranica) i
  obje ostaju zapisane, jer je primjerak opservacija, a Upute su norma.

# v1.9 — kvarovi 45–49 sa sesije „rad Paroci", uz pravilo 31

* **Kvar 45 — `check_rules.py`, format papira.** Margine su se mjerile, papir nije, a procjena broja stranica u tom istom modulu pretpostavlja A4. Rad na US Letteru prolazio je sve provjere jer su margine bile točne, iako je razlika 1,76 cm visine. Novo pravilo `format.stranica` čita format iz profila (`format.stranica`, zadano `a4`), tolerancija 0,2 cm, razina **kršenje**, i imenuje nađeni format. Mjereno: isti rad na A4 → 5 u skladu, **0 kršenja**; na Letteru → **1 kršenje**, „nađeno 21.59 × 27.94 cm — to je LETTER".
* **Kvar 46 — `rubrika.py`, metodologija i `_empirijski`.** `citac_dio_metodologija` davao je `djelomicno` i za `napravljeno` i za `provjereno`, pa razlika između „napisano" i „netko je provjerio osam odjeljaka" nije značila ništa i kriterij se nije mogao zatvoriti nijednim postupkom; sada `provjereno` → `ispunjeno`. `_empirijski` je pak izvodio odgovor iz statusa dijela `metodologija`, a taj dio time postaje uvjetno ključan — petlja u kojoj oznaka sama sebi stvara kriterij. Sada čita odluku autora iz `stanje.json` (`vlastito_istrazivanje`), a registar dijelova je rezerva preko `analiza`. Mjereno: teorijski rad s `metodologija: napravljeno` i `stanje: ne` prije `_empirijski=True`, sada **False**; empirijski rad sa `stanje: da` prije `False`, sada **True**.
* **Kvar 47 — lokator dokaza.** `claim_ledger.py` dopuštao je samo `kind: "page"`, pa točka standarda, članak propisa i izvor bez tiskane paginacije nisu mogli ući u lanac: tvrdnja koja se na njih oslanja izgledala je kao tvrdnja bez potpore. Sada `page`, **`clause`** (`clause_label`) i **`passage`**, svaki sa svojom provjerom i svojom porukom. `evidence_model.py` uzima `clause_label` u identitet **samo kad postoji**, pa se `ev_` identiteti postojećih `page` zapisa ne mijenjaju — provjereno: isti ulaz daje isti `ev_a80484e4f2e5c` prije i poslije. `evidence_gate.py` u ispisu razdvaja stranicu od točke standarda.
* **Kvar 48 — `provjeri_brojke_u_tekstu.py` (nova skripta).** `consistency_check.py` uspoređuje tvrdnje iz `claims.jsonl`, a brojka koju rad izvodi iz vlastite tablice ondje ne postoji, pa je nitko ne uspoređuje sa sobom. Nova skripta uspoređuje takve brojke međusobno i imenuje mjesto svake. Mjereno na sintetičkom radu: „5 od 7" u 4.3 naspram „6 od 7" u 4.4 i zaključku → sva tri navoda ispisana s odjeljkom; isti rad usklađen → čisto. U `gate.py --faza audit` ulazi kao **savjet**, ne blokada (fazа audit: 14 → **15** koraka).
* **Kvar 49 — `drift.py` gleda i `scripts/`.** Kartica i repo razilaze se i izvan SKILL.md-a. Kad jedne strane nema mapu `scripts/`, alat kaže **NIJE izmjereno**, ne „iste".
* **Željezno pravilo 31 — „Rad koji nitko nije pročitao nije provjeren rad."** Dva kruga alata završila su s „nijedna blokirajuća provjera nije pala", a čitanje je poslije njih našlo **sedam** grešaka, među njima proturječje u brojci koja nosi zaključak; **tri od sedam nastale su u prethodnome krugu, dok su se popravljale mjere**. Pravilo je provedivo: novi dio `citanje_tijela` (`obavezan: uvijek`, razina `rucno`) blokira `dijelovi.py --provjeri --faza predaja` dok se prolaz ne zabilježi — provjereno, izlaz **1** uz „Autorovo čitanje tijela rada" na popisu. To je jedina blokada u paketu koju alat ne može sam zadovoljiti, i to namjerno.

**Što iz zakrpe NIJE uzeto i zašto.** Zakrpa je rađena na bazi prije PR-a #4, pa je njezin `rad-docx/scripts/provjeri_predaju.py` naspram `main`-a imao **0 dodanih i 29 uklonjenih redaka** — točno `--json`, `P.zadatak` i strukturirani nalaz. Preuzimanje bi vratilo kvar 44 unatrag, pa je ta datoteka preskočena; njezin sadržaj (polje `provjereno`) u `main`-u je od PR-a #3. Iz istog razloga je iz `rubrika.py` uzet samo kvar 46, a čitanje `predaja.json` zadržano. `dijelovi.json` je uzet kao jedan novi zapis umjesto cijele datoteke, jer se zakrpina razlikuje i u formatiranju (674 retka šuma oko 20 redaka sadržaja).

**Prenumeracija kataloga.** Zakrpa numerira svoje unose 44–49, a `main` je 44 već potrošio. Zakrpin 45 je **isti kvar** kao 44 u `main`-u (ista funkcija, isti mehanizam, isti popravak) pa se ne upisuje drugi put; ostali su pomaknuti: 44 → 45, a 46–49 ostaju. `kvar.py --provjeri` daje 26 unosa, zadnji 49.

**Jedan popravak u samoj zakrpi.** Docstring `provjeri_brojke_u_tekstu.py` obećavao je „izlazni kod 1 kad postoji proturječje", a alat vraća 0 osim uz `--strogo` — i tako je i ispravno, jer u `gate.py` stoji kao savjet. Uskladeno s ponašanjem: alat pita, ne presuđuje.

# v1.9 — `rubrika.py` čita nalaz provjere umjesto da pretpostavlja da je prošla

* **Zašto.** Prethodni unos ostavio je zapisanu granicu: `rubrika.py` gledala je **je li komponenta pokrivena** provjerom, ne **je li provjera prošla**. Komponenta s `igle` ulazila je u „sve pokrivene" i onda kad tih igala u radu nema. Izmjereno nad istim `zadatak.json`-om: `provjeri_predaju.py` javlja `❌ zadatak traži, a u radu nema: kvantitativna analiza`, a `rubrika.py` istodobno `✅ ispunjeno`, pojas **5**. Dva alata, jedan artefakt, suprotan nalaz — i to na ključnom kriteriju, gdje je razlika između 3 i 5. Uzrok nije bila logika čitača nego to što nalaz gatea **nije postojao u obliku koji se dade pročitati**: `provjeri_predaju.py` je ispisivao za čovjeka i vraćao izlazni kod, ništa više.
* **`provjeri_predaju.py --json PUT`** (novo) — zapisuje nalaz kao JSON: `prosao`, `greske`, `upozorenja`, `ogranicenja` i `zadatak.komponente` sa statusom po komponenti (`u_radu`, `nema_u_radu`, `provjereno_alatom`, `nije_strojno_provjerljivo`) i dokazom uz svaki. Ispis za čovjeka ostaje nepromijenjen.
* **`citac_zadatak_komponente` sada čita `.katedra/predaja.json`.** Ako nalaz postoji: ijedna `nema_u_radu` → `neispunjeno` s imenima; `nije_strojno_provjerljivo` → `djelomicno` s imenima; inače `ispunjeno`. Ako nalaz **ne** postoji, komponente pokrivene samo iglama ne dižu kriterij iznad `djelomicno` — nedostatak dokaza nije dokaz, isto načelo po kojem `pojas()` odbija procijeniti pojas kad je ključni kriterij `nepoznato`. Komponenta sa zapisanim `provjereno` i dalje vrijedi kao pokrivena i bez gatea: ondje zapis nalaza **jest** dokaz koji postoji.
* **Ograda protiv zastarjelog nalaza.** Ako `predaja.json` ne poznaje komponentu koja stoji u `zadatak.json`, kriterij je `djelomicno` uz „nalaz je stariji od zadatka", a ne tiho zeleno po starom nalazu.
* **Provjereno (6 slučajeva + jedan pravi prolaz kroz `.docx`).** igle kojih u radu nema → prije `✅ ispunjeno` / pojas 5, sada `❌ neispunjeno` / pojas **3** · igle koje gate potvrđuje → `✅`, pojas 5 · igle bez pokrenutog gatea → `⚠️ djelomicno`, pojas 4 · pet komponenti s nalazom bez gatea (slučaj Paroci) → `✅`, pojas **5 nepromijenjeno** · `predaja.json` stariji od zadatka → `⚠️` · komponenta koja se ne da izraziti niskom → `⚠️`, nepromijenjeno. Integracijski: stvarni `.docx` s jednom prisutnom i jednom odsutnom iglom kroz `provjeri_predaju.py --json` pa u `rubrika.py` — oba alata nad istim projektom sada kažu isto (`nema_u_radu` → `neispunjeno`, pojas 3).
* **Granica.** `predaja.json` nema otisak dokumenta, pa se „stariji od rada" ne otkriva — samo „stariji od zadatka". Nalaz nad prethodnom verzijom rada, uz nepromijenjen `zadatak.json`, čita se kao aktualan. Dok se ne doda hash rada, gate pred predaju pokreće se ponovno, a `rubrika.py` ostaje agregator tuđih nalaza (pravilo 29), ne mjeritelj.

# v1.9 — pojas 5 postaje dosežljiv; nalaz provjere nije greška

* **Zašto.** `citac_zadatak_komponente` u `rubrika.py` nije imao granu `ispunjeno`: svaki projekt s `.katedra/zadatak.json` i barem jednom komponentom trajno je stajao na `djelomicno`. Kako je „Odgovor na zadatak predmeta" ključni kriterij, a `pojas()` na ključnom `djelomicno` vraća **4**, pojas 5 nije bio dosežljiv **nijednom radu koji uopće ima zadatak.json** — i to zbog svojstva alata, ne rada. Drugi dio istog kvara je u `rad-docx/scripts/provjeri_predaju.py`: komponenta bez `igle` tražila je doslovan tekst zahtjeva u tekstu rada (`igle = k.get("igle") or [k["naziv"]]`), pa je zahtjev poput „broj stranice i kod parafraze" uvijek padao kao greška „zadatak traži, a u radu nema". Takav se zahtjev ne da izraziti niskom u dokumentu; postoji samo kao **nalaz alata** koji ga je provjerio.
* **Popravak.** Uz komponentu smije stajati polje `provjereno` (`{alat, nalaz, datum}`). Komponenta je pokrivena ako je strojno provjerljiva (`igle`) **ili** ako uz nju stoji zapisan nalaz provjere. `rubrika.py` vraća `ispunjeno` kad su sve komponente pokrivene, a `djelomicno` uz **imenovanje** onih koje nisu. `provjeri_predaju.py` takvu komponentu prijavljuje kao ograničenje s nalazom i alatom, ne kao grešku; komponenta bez igala i bez nalaza ide u ograničenje „nije strojno provjerljivo", a greška ostaje samo za ono što je strojno provjerljivo i u radu ga nema.
* **Provjereno (10 slučajeva, prije/poslije nad dvjema stvarnim verzijama koda).** `rubrika`: tri komponente s iglama → `djelomicno` → **`ispunjeno`** · pet komponenti s nalazom (slučaj Paroci) → `djelomicno` → **`ispunjeno`**, „5 sa zapisanim nalazom provjere" · jedna bez igala i bez nalaza → ostaje `djelomicno` i imenuje se · bez komponenti i bez `zadatak.json` → `nepoznato`, nepromijenjeno. `provjeri_predaju`: igle prisutne → tiho (nepromijenjeno) · igle odsutne bez nalaza → greška (nepromijenjeno) · bez igala s nalazom → greška → **ograničenje s alatom i nalazom** · bez igala i bez nalaza → greška → **ograničenje „nije strojno provjerljivo"** · igle odsutne ali nalaz postoji → greška → ograničenje. Na `pojas()`: isti redci, ključni kriterij `djelomicno` → **4** („drži: Odgovor na zadatak predmeta"), `ispunjeno` → **5**.
* **Granica koju treba znati.** `rubrika.py` gleda **je li komponenta pokrivena provjerom**, ne **je li ta provjera prošla**. Komponenta koja ima `igle`, a tih igala u radu nema, ulazi u „sve pokrivene". Izmjereno nad istim `zadatak.json`-om: `provjeri_predaju.py` javlja `❌ zadatak traži, a u radu nema: kvantitativna analiza`, a `rubrika.py` istodobno `✅ ispunjeno` i pojas **5**. Dok `rubrika.py` ne čita nalaz gatea (a ne čita ga), zeleno na ovom kriteriju znači „komponente su zapisane i pokrivene načinom provjere", ne „rad ih ima". Mjerodavan je `provjeri_predaju.py`, i pred predaju se pokreće on.

# v1.9 — `drift.py` nalazi karticu i u desktop aplikaciji

* **Zašto.** Alat je synced karticu tražio samo na putovima Claude Code sesije (`~/.claude/skills/synced/*/`, `/root/.claude/skills/synced/*/`). Claude **desktop aplikacija** svoju kopiju drži drugdje — `<APPDATA|Library|.config>/Claude/local-agent-mode-sessions/skills-plugin/<sesija>/<workspace>/skills/<slug>/SKILL.md` — pa je goli poziv na desktopu uvijek vraćao **2 („NIJE izmjereno")**. Izlazni kod nije lagao (nije tvrdio da su verzije iste), ali pravilo (b) je ostalo nepokriveno baš ondje gdje se doktrina najčešće mijenja, a alat koji na jednoj cijeloj površini nikad ne izmjeri ništa razlikuje se od nepostojećeg alata samo po tome što se čini da postoji. Nađeno 4. 9. 2026., pri prvoj upotrebi na desktopu: kartica i repo bili su bajt-po-bajt identični, a to se moglo pokazati tek ručnim `--kartica`.
* **Popravak.** `kandidati_desktop()` pretražuje desktop stablo (Windows `%APPDATA%\Claude`, macOS `~/Library/Application Support/Claude`, Linux `~/.config/Claude`) i vraća nađene kopije **najnovijom prvom**; `kandidati_kartice()` dodaje tu najnoviju uz postojeće putove i vraća `(putovi, bilješka)`. Poruka „nije nađena" sada imenuje i desktop stablo, pa ne laže izostavljanjem o tome gdje se tražilo.
* **Zašto najnovija, a ne 2.** Aplikacija piše po jednu kopiju za svaku sesiju, pa stare sesije ostavljaju starije kopije **iste** kartice. Da se one broje kao „RAZLIČITE kartice", alat bi na desktopu s vremenom trajno vraćao 2 — ista neupotrebljivost, drugi razlog. Među njima, za razliku od dviju `synced/` instalacija, postoji poredak: aplikacija kopiju piše na početku sesije, pa je najnovija ona koja je učitana. Izbor se **izgovara** (`↳ desktop stablo ima više kopija kartice i one nisu iste (kopija: N, verzija: M) — uzeta najnovija …, starije sesije preskočene`), po pravilu 20. Kad se pak desktop kopija i klasična `synced/` kopija razilaze, poretka nema i alat i dalje vraća **2**, ne bira.
* **Provjereno (6 slučajeva).** stvarna desktop sesija, goli poziv → **0** (prije: 2), s putom kartice u dugom ispisu · dvije različite desktop kopije, novija = repo → 0 uz bilješku, i to dokazuje da je izabrana novija (starija bi dala 1) · dvije iste kopije → 0 bez bilješke · nijedne kartice → 2 s porukom koja imenuje sva tri mjesta · desktop kopija ≠ `synced/` kopija → 2 s popisom putova · `--kartica` i dalje nadjačava traženje (→ 1 na namjerno razlikovanoj datoteci).
* **Granice.** Poredak po `mtime` vrijedi za desktop stablo, ne za `synced/` instalacije. Alat i dalje vidi samo ono što je sinkronizirano na disk: kartica koja nije synced nigdje ne postoji za njega, i to je 2, ne 0. `SKILL.md` ovom zakrpom **nije** diran — svaka izmjena doktrine ovdje odmah bi ponovno otvorila drift koji je istog dana zatvoren.

# v1.9 — drift SKILL.md-a se mjeri (`scripts/drift.py`)

* **Zašto.** § 0.0 pravilo (b) („poslije svake izmjene doktrine kroz karticu ista verzija ide i u repo") nije imalo nijedan alat iza sebe — bilo je obećanje u prozi, a pravilo 20 zabranjuje baš to ostatku paketa: provjera koja se nije pokrenula izgleda identično kao provjera koja je prošla. Drift je zato dvaput otkriven tek ručnim `wc -c`, i to nakon što je već proizveo štetu (repo dva željezna pravila iza kartice).
* **`scripts/drift.py`** (novo) — uspoređuje synced karticu (`~/.claude/skills/synced/*/katedra-lite/SKILL.md`, `/root/.claude/skills/synced/*/…`, `~/.claude/skills/katedra-lite/…`, override `--kartica` ili `KATEDRA_KARTICA`) s repo kopijom pored same skripte. Normalizira BOM, CRLF, repove razmaka i prazne redce na kraju — razlika u njima nije doktrina. Izlaz: bajtovi i sha obiju strana, broj redaka koje ima samo jedna, sekcije koje postoje samo na jednoj strani, i **smjer** kad se dade dokazati: ako je sadržaj kartice identičan nekoj ranijoj verziji iz `git log` (do 300 commita), alat kaže „kartica zaostaje za repoom — verzija iz commita X (datum)"; inače ne pogađa nego broji retke. `--kratko` daje jedan redak za prvu poruku sesije, `--json` zapis.
* **Izlazni kodovi.** 0 = iste, 1 = razišle se, 2 = **NIJE izmjereno** (jedna strana nedostaje, ili je nađeno više RAZLIČITIH kartica pa se ne zna koja je učitana). Dvojka nikad ne znači „uredno" i poruka to kaže izrijekom — ograda iste vrste kao `_crteza_u_xml()` u kvaru 40.
* **Uvezano u § 0.0.** Pravilo (4) sada traži da uz `KATEDRA_PKG_VERZIJA` u prvu poruku ide i redak `drift.py --kratko`, pa se drift vidi prije nego sesija išta napiše, a ne poslije.
* **Provjereno (11 slučajeva).** iste → 0 · stvarni drift kartica 30 518 B / repo 31 708 B → 1 uz točan smjer („verzija iz commita `0935bd2`") · kartica ispred repoa (stvarni slučaj od 2. 9.: repo 24 519 B) → 1 uz „105 redaka samo u kartici, 19 samo u repou; sadržaj kartice NIJE nijedna ranija verzija" · nedostaje repo strana → 2 · nedostaje kartica → 2 · samo CRLF + repovi razmaka → 0 · tri ISTE kopije kartice → mjeri normalno · tri RAZLIČITE kartice → 2 s popisom putova · `KATEDRA_KARTICA` nadjačava traženje · `--json` · `--kratko`.
* **Granice.** Alat vidi samo ono što je sesija sinkronizirala na disk: ako kartica nije synced (druga površina, druga instalacija), javlja 2, ne 0. Ne spaja verzije, ne zna koja je točna i ne procjenjuje kvalitetu doktrine — pravila (a) i (b) i dalje izvodi čovjek. Smjer se dokazuje samo unatrag kroz `git log` za tu jednu datoteku; „kartica ispred repoa" ostaje brojka o retcima, ne tvrdnja.

# v1.9 — 403 na pushu: izvor sesije umjesto krivog klika (kvar 43)

* **`SKILL.md` § 0.0 — tablica površina.** Doktrina je za `403` s git proxyja ispravno govorila da je to egress politika koja se prijavljuje, a ne zaobilazi, pa je onda kao rješenje nudila „jedan klik korisnika (claude.ai → GitHub konekcija → Add repository, uz pravo pisanja)". Ta veza je po dokumentaciji **read-only sinkronizacija datoteka za chat i Projects** — sesija dobije imena i sadržaj datoteka s odabrane grane, a `push` pada na isti 403. Sada stoji tablica triju površina (chat/Projects — read-only; **Claude Code on the web** — repo kao izvor sesije, gura granu i otvara PR; Cowork zadatak — mape s korisnikova računala, push samo ako je repo izvor zadatka) i izričita rečenica da „GitHub konekcija u claude.ai" znači dvije različite stvari. Točka (5) u pravilima § 0.0 više ne imenuje klik nego pojam **izvor sesije** i upućuje na tablicu, pa se popravak ne može opisati bez površine na koju se odnosi.
* **Mjera.** 2 commita (`a633706`, `0935bd2`; 14 datoteka, +417/−21) bila su gotova i provjerena (svih 6 provjera iz HANDOFF-a prošlo), a isporuka je otišla ručnom rutom bundle + patch. Korisnik je zatim upitao mora li sesiju pokretati iz chata — točno u smjeru koji je doktrina sugerirala, a koji bi dao **manje** nego Cowork: datoteke bez prava pisanja.
* **Drift SKILL.md-a.** Repo je poravnat s account verzijom 3. 9. 2026. (`0935bd2`, 30 518 B); § 0.0 sada uz pravilo (b) traži i mjerenje razlike (`wc -c` nad objema verzijama) umjesto pamćenja brojke.
* **Granice.** Tablica opisuje ponašanje površina izmjereno 3. 9. 2026. iz službene dokumentacije; ako se ponašanje promijeni, mijenja se tablica, a ne zaključak da je 403 politika, a ne konfiguracija. Nijedan alat ovo ne provjerava — doktrina u routeru nema gate, pa je jedina ograda to što je popravak formuliran kao pojam („izvor sesije"), a ne kao putanja kroz sučelje.

# v1.9 — plutajuće slike, uzrok umjesto posljedice, prihvaćanje izmjena (kvar 40, 41, 42)

Nađeno na diplomskom radu FPZG-a (medijske studije, 45 str., 13 203 riječi) u modu 4.

* **`scripts/provjeri_prikaze.py` — plutajuće slike (kvar 40).** Prikazi su se skupljali samo iz `docx.Document(put).inline_shapes`, što je isključivo `<wp:inline>`. Slika kojoj je autor u Wordu postavio bilo koji „Wrap text" postaje `<wp:anchor>` i `python-docx` je ne vidi. Na radu sa **4 slike, sve `<wp:anchor>`, nula `<wp:inline>`**, alat je ispisao „nema nijednu umetnutu sliku — nema što mjeriti" i vratio **izlazni kod 0**, dok je `check_rules.py` nad istom datotekom javljao „dokument sadrži slike, ali nijedan prikaz nema natpis". Dodani su `_plutajuce()` (čita `<wp:anchor>`: `<wp:extent>` za mjere, `<a:blip r:embed>` za vezu na dio paketa) i `_crteza_u_xml()` kao **ograda**: kad je izmjerenih prikaza nula, a `<w:drawing>` ima, alat izlazi s kodom 1 i porukom „NIJE provjereno, nije uredno" umjesto s tihom nulom. Mjereno: `exit 0` bez ijednog retka → `exit 1`, 4 izmjerene slike, 4 kršenja (sve umetnute na 0,19–0,28× izvorne širine, pismo od 10 pt izlazi kao 1,9–2,8 pt).
* **`scripts/check_argument.py` — uzrok umjesto posljedice (kvar 41).** Poglavlja se grade samo iz `Heading 1`. Kad je „Uvod" ostao `Heading 2`, `uvod` je `None`, pa su dvije dimenzije javile „❌ TEZA — nema uvoda" i „❌ ZAKLJUČAK ZATVARA KRUG — nema: uvod". Poruka imenuje posljedicu i čita se kao presuda o kvaliteti rada: promjena stila **tog jednog naslova** i ništa drugo dala je `✅ TEZA — 3 kandidata` i `✅ ZAKLJUČAK ZATVARA KRUG — 100 % preklapanja (10/10)`. `poglavlja()` sada pamti sve naslove ispod razine 1 kao `(razina, tekst)`, a `_uvod_na_krivoj_razini()` ih pretraži prije nego se javi „nema uvoda"; poruka glasi „„Uvod” je na razini 2, ne 1" i izrijekom kaže **„Ovo NIJE nalaz o tezi — dok je razina naslova kriva, teza se ne mjeri."** Regresija: rad s Uvodom na `Heading 1` i dalje daje zeleno na obje dimenzije.
* **`SKILL.md` § 0.7a (nova sekcija) + željezno pravilo 30 + routing mod 4; `references/audit.md` korak 0.** Sekcija § 0.7a bila je **referencirana u routing tablici, a nije postojala** — ista klasa kao kvar 36. Sada postoji i vrijedi za sve modove nad gotovim `.docx`-om: snapshot → `revizije.py prihvati` → tek onda ekstrakcija. Mjereno: rad sa **125 `w:ins` i 13 `w:del`** (4149 znakova) kroz `python-docx` izgledao je kao rad **bez sažetka, bez ključnih riječi, bez abstracta i bez izjave o autorstvu** — sve četiri stavke bile su upravo taj neprihvaćeni sloj; opseg 12 602 umjesto 13 203 riječi.
* **`katedra/scripts/dokaz.py` — zastavica `--tihi` (kvar 42).** Popravak tihog kvara po naravi ide iz lažnog zelenog u istinito crveno (`0 → ≠0`), a `dokaz.py` je taj smjer imao tvrdo označen kao grešku („⚠ obrnuto od očekivanog… Provjeri jesu li naredbe zamijenjene", exit 1) — pa je odbijao dokaz za kvar 40, jedinu vrstu kvara koju vlastita doktrina (`katedra/SKILL.md` § 1.4) stavlja na prvo mjesto. `--dopusti-isto` tu ne pomaže jer se kodovi razlikuju. Nova zastavica obrće očekivanje i javlja „✅ dokazan tihi kvar: 0 → 1"; kad smjer nije takav, `--tihi` pada, pa se njome ne može ništa progurati. Provjereno: `--tihi` nad `1 → 0` pada, zadano ponašanje `1 → 0` i dalje prolazi. Treća potvrda pravila iz § 0.8 (v. kvarove 36 i 37).
* **Granice.** `_plutajuce()` čita `<wp:anchor>`, ali ne i naslijeđeni `<w:pict>` (VML) ni OLE objekte — za njih ograda javi „NIJE provjereno" i traži ručnu provjeru, što je namjerno: bolje crveno nego tiha nula. `_uvod_na_krivoj_razini()` traži samo naslov koji sadrži „uvod"; rad koji uvodno poglavlje zove drukčije i dalje dobiva staru poruku.

# v1.9 — zahtjevi za čovjeka; passage lokator kao gotov lokator (kvar 38, 39)

* **`scripts/verify_sources.py --zahtjevi-covjeka PUT`** (novo) — markdown checklista za izvore koji nisu `verified`. Do sada je izvještaj za ⚠️/⏸ davao simbol i obrazloženje pa stao, pa je skupina koja po pravilu 18 ispravno NE blokira (izlazni kod 0) u praksi ispadala iz tablice „RUČNO PROVJERI" iz pravila 7. Radnja se izvodi iz onoga što jedinica ima: DOI → `doi.org/<doi>`, usporedi autora, godinu i naslov; URL → otvori adresu, ali 200 nije dokaz o sadržaju (isti oprez kao `verification.scope: locator` u sažetku); bez oba → NSK, Hrčak, CroRIS, pa mentor. `conflict`/`invalid` → `HITNO` (blokira predaju), ostalo → `PROVJERI RUČNO`; ⏸ prvo traži ponovljenu provjeru jer je nalaz o mreži, ne o izvoru. Izlazni kod se ne mijenja — zastavica opisuje, ne blokira. Mjereno na `assets/fixture_zahtjevi_covjeka.md` (5 jedinica, `--offline`): 5 redaka bez radnje → 5 redaka s radnjom.
* **Pravilo 28 (`SKILL.md`) + `references/pisanje.md` §2 i §2.1** — doktrina sada razlikuje **„stranica postoji, nepotvrđena"** (privremeno: `[PROVJERI STR.]`, ide u tablicu „RUČNO PROVJERI") od **„izvor stranicu nema"** (trajno: citira se po odlomku, `(N, odl. P)`, gotov lokator, ne ide u tablicu). `evidence_ingest.py` je `page_label: null` + `passage: N` vraćao još od Q19 i **nije mijenjan** — kvar je bio isključivo u tome što doktrina taj lokator nije priznavala, pa se trajno stanje označavalo privremenim placeholderom i mrežni izvještaji, HTML članci i `.txt`/`.md` bez prijeloma ispadali su iz dokaznog sloja.
* **`assets/fixture_zahtjevi_covjeka.md`, `assets/fixture_izvor_bez_paginacije.txt`** (novo) — testna građa za obje provjere. Prvi pokriva sva tri puta kroz `radnja_za_izvor()` i složen je po hrvatskoj abecedi da ne proizvodi nevezan nalaz; drugi ima točno pet odlomaka, pa je `grep -c 'page_label": null' → 5` provjera koja pukne ako se fixture promijeni.
* **Granice.** Checklista ne provjerava izvore umjesto čovjeka i ne zna postoji li jedinica — zna samo da je ona nije našla, pa radnja nikad ne glasi „makni izvor". Izvori potvrđeni samo na razini adrese (`scope: locator`) NISU u checklisti: oni su `verified`, a upozorenje o njima ostaje u sažetku i u zaglavlju checkliste. `--pokrivenost` i `--json` nisu dirani.

# v1.9 — provjera zamki proze; pisanje.md dijalekti

* **`scripts/provjeri_zamke_proze.py`** (novo; SKILL.md §3 ga je obećavao, a paket ga nije imao) — šest tihih zamki uz `check_ai_style.py`: (a) rečenice spojene zarezom uz veliko slovo (heuristika: riječ iza zareza nije ime/kratica — ne vidi se velikim slovom drugdje u sredini rečenice, postoji i malim slovom, iza nje ne ide još jedna velika riječ ili navodnik; veznici „Međutim/Stoga/Naime…" uvijek nalaz), (b) interpunkcijski tik — dvotočka na 1000 riječi po poglavlju i po radu (prag iz `references/glas_fpzg.md` §7: 3/1000, pod 4 pojave kao Q6d) i spojna crtica po radu (≤ 2; „—" uvijek, „ – " s razmacima osim oznaka „H1 – …", legendi „n – broj; % – postotak" i raspona „0 – 12 bodova"; „2019–2024" nije tik) te „isti kostur triput zaredom" (3 uzastopne rečenice s dvotočkom/crticom), (c) ponovljen kostur odlomka (iste prve tri riječi u ≥3 odlomka poglavlja; ista shema „Prvo, … Drugo, … Treće, …" ili isti par prvih riječi u ≥3 uzastopna odlomka), (d) jedinice (decimalni udio i postotak u istom odlomku — decimala je udio samo kad stoji sama, ne „0,5 boda", „0,8 službi na 100 000", „p = 0,05", „korelacija iznosi 0,53"; ista veličina u dvjema vremenskim jedinicama ili valutama u rečenici; „od 3 do 5 %" kao ℹ️), (e) ℹ️ jednokratne brojke uz citat (broj u rečenici s citatom bez odjeka u drugoj rečenici ili ćeliji tablice; godine, redni brojevi, jednoznamenkasti, tisućice „3 504"/„30.000" normalizirane), (f) kvantifikator dosega uz citat („jedini/svi/prvi/nikad/uvijek/nitko/najveći/nijedan" → pravilo 28; „prvi put/korak/dio…" i „Prvo, …" enumeratori isključeni). Ulaz `.docx` (Heading 1 kao `check_ai_style.po_poglavljima`, ali kroz `hr_text.tekst_odlomka` + ćelije tablica), `.md` ili `.katedra/poglavlja/` (redoslijed iz `rukopis.poglavlja`, popis literature preskočen); citate daje isključivo `citation_dialects.py` (dijalekt: `--stil` → `--profil` → pogađanje iz teksta uz ⚠️; placeholder „: [PROVJERI STR.]" i lokatori „odj./čl." skidaju se prije parsera jer ih `LOKATOR` ne zna). Izlazni kod 0 uvijek, 2 samo za grešku ulaza — zamke nisu blokirajuće; `--json out.json` + `--usporedi prije.json` daje „prije → poslije" po provjeri i broji pogoršane. Izmjereno: HKS-FZS diplomski (8527 riječi, Vancouver) a 0 · dvotočka 4,9/1000 (42×) · spojna crtica 4 · kostur zaredom 1 · kostur odlomka 1 · jedinice 0 · ℹ️ 31 · doseg 15; FPZG (3443 riječi, autor-godina) a 0 · 0,6/1000 · crtica 1 · 0 · 0 · 0 · ℹ️ 8 · doseg 5. Nalazi (a)/(f) ručno provjereni: četiri kandidata „, Hospicij/Hrvatskoj/Splitu/Fakultet" ispravno isključeni kao imena, „prva rezolucija posvećena…", „prvi je upotrijebio…", „jedina pregledana istraživanja" stvarni nalazi dosega.
* **`references/pisanje.md` §2** — red `autor-godina (FPZG)` nosio je `(Lindblom, 1959, str. 81)`, a profil `fakulteti/fpzg.json` (`citiranje.u_tekstu`, provenance explicit iz Uputa) traži dvotočku bez „str." i godinu bez točke: sada `(Lindblom, 1959: 81)`; red `vancouver` na `(12)`, `(12, 15)`, `(12–15)` s pravilima razmaka/en-crtice; uvodna napomena da dijalekt i oblik UVIJEK dolaze iz `resolved_profile.json`, a tablica je ilustracija koja se ispravlja prema profilu, ne obratno.
* **Granice zamki proze.** Heuristike, ne pravila: (a) ime koje se u radu piše i malim slovom kao opća imenica („hospicij") prolazi samo zbog konteksta (sljedeća velika riječ/navodnik); (d) ne zna je li „0,53" udio ili koeficijent bez riječi ispred; (f) hvata i „uvijek" kao odgovor u anketi („medije uvijek koristi") — to je podsjetnik na doseg, ne dokaz kršenja; (e) je popis za oko, ne nalaz. Pragovi (b) su FPZG-ovi i vrijede kao zadani za sve profile dok drugi fakulteti ne dobiju svoje.

# v1.9 — Upute → profil, opseg po dijelovima (nalaz 9)

* **Što.** Profil je nosio samo ukupni opseg (`struktura.opseg.<tip>.stranice|rijeci`), a pravila HKS-FZS-a „Uvod ≥ 3000 riječi i ≤ 1/3 teksta", „Rasprava ≥ 1000", „Sažetak ≤ 1800 znakova", redoslijed podsekcija Metoda, razmak odlomaka 6 pt živjela su u `napomene` i u ručno pisanoj `provjeri_hks_fzs.py`. Profil se k tome pisao ručno iz PDF-a Uputa.
* **Shema (`_schema.json` = `_resolved_schema.json`).** `struktura.opseg.<tip>.dijelovi.<slug>` (definicija `dioOpsega`): `rijeci_min|max`, `udio_min|max` (0–1 od tijela teksta), `znakovi_max`, `obavezan`, `redoslijed` (samo poredak je normativan), `podsekcije` (slugovi redoslijedom), `napomena`; `format.odlomak.razmak_pt`. Sve opcionalno, unatrag kompatibilno — fpzg/efzg/libertas × esej/seminarski/zavrsni/diplomski daju isti rezultat kao prije (efzg esej/diplomski i libertas padaju kao i prije: tip izvan `tipovi_radova` odn. nema rute).
* **`hks-fzs.json`.** 18 dijelova u `dijelovi` (redoslijed = točka odj. 3 Uputa; `zahvala` i `kratice` s `obavezan: false` samo radi redoslijeda), `razmak_pt: 6`, provenance po lokatorima iz postojećih napomena. Resolver (`--profil-datoteka`) propušta `dijelovi` bez izmjena; `profile_resolver.py` nije diran.
* **`scripts/provjeri_dijelove.py`** — generalizacija `provjeri_hks_fzs.py` za bilo koji profil: prepoznaje dijelove po Heading 1 ili ALL-CAPS naslovima preko `SINONIMI_DIJELOVA`, Wordov TOC (`<w:sdt>`) kao `sadrzaj`, podsekcije po Heading 2/3 ili početku odlomka („Metode: …"); provjerava riječi, udio, znakove, obaveznost, redoslijed dijelova i podsekcija, `razmak_pt` nad stilom Normal (izričiti razmaci na odlomcima su ℹ️). Pravilo 18: profil `nepotvrdeno` → ⚠️, exit 0. Na `rad-danijela/rad.docx` daje iste zaključke kao `provjeri_hks_fzs.py` za sve dijelove koje obje gledaju (Uvod 3174 ✅ / 37 % ⚠️, Rasprava 1464 ✅, sažetak 1887 zn. ⚠️, podnaslovi sažetka i Summaryja ✅, Metode: Ustroj prije Etike ⚠️, Rasprava podsekcije ✅, TDK/BDC/Sažetak/Summary/Sadržaj ✅, Normal 6 pt ✅) i jedan koji stara skripta ne vidi: `POPIS KRATICA` stoji PRIJE sadržaja, a Upute ga stavljaju iza (točka 9). Ostalo (font tablica, „Tablica N." s točkom, Vancouver interpunkcija, N u sažetku, MeSH, redni brojevi Zaključka, PAGE polje) ostaje u `provjeri_hks_fzs.py` — podjela je dokumentirana na vrhu obiju skripti.
* **`scripts/upute_u_profil.py`** — Upute (PDF: `pdftotext -layout` → pypdf → pdfplumber; .docx; .txt) → `--out kandidati.json` (putanja, vrijednost, citat ≤ 300 zn., lokator str./odl., confidence, pravilo) → `--profil-skica` po `_schema.json` (≥ 0.7 ulazi ako prolazi shemu; ostalo u `napomene` `[ZA POTVRDU]` + sidecar `.kandidati_za_potvrdu.json`; `status` uvijek `nepotvrdeno`; provenance `explicit` s lokatorom) → `--usporedi <slug>.json`. Ništa se ne izmišlja: bez citata nema kandidata; bez detektiranog stila skica traži `--stil`.
* **Test.** `tests/fixtures/upute_hks_fzs.txt` + `.docx` su **rekonstrukcija** Uputa iz napomena/lokatora profila (izvorni PDF nije dostupan — egress 403), označeni kao takvi. `--usporedi` na fixtureu: **60/62 = 96,8 %** usporedivih listova (strože, bez `redoslijed`/`obavezan` iz popisa: 92,3 %); isto na .docx, na PDF-u kroz pdftotext i kroz pypdf. Nedostaju `citiranje.tocka_iza_godine` i `uvlaka_u_popisu` (Upute ih ne spominju — ručni profil ih je izveo). Brojka je gornja granica jer fixture i profil dijele formulacije; na stvarnom PDF-u očekuj manje.
* **Granice.** Skica ne ulazi u `index.json` ni u `faculty_scale_gate.py`; put je opisan u `references/upute_u_profil.md`. Samostojni put resolvera i dalje ne validira ulaz shemom (validirano ovdje ručno: `hks-fzs.json` i skica prolaze `_schema.json`, jezgra resolved profila `_resolved_schema.json`).

# v1.9 — Vancouver dijalekt (nalaz 6)

* **Što.** Novi citatni stil `vancouver` (dijalekt `vancouver`, član `NUMERIC_DIALECTS` uz `ieee`): citati u ovalnim zagradama `(1)`, `(2, 5)`, `(3–7)`, `(12,13)` s ekspanzijom raspona, popis literature numeriran `N.`/`N)`/`[N]`. Rad HKS-FZS (75 referenci) dosad je prolazio kao rad BEZ citata, a rad-audit davao lažni kritični nalaz iz „Rec(2003)24".
* **Gdje.** `citation_dialects.py` (jedino mjesto s regexima, B10): `VANCOUVER_GROUP`, `vancouver_groups`/`parse_vancouver`, filtar decimala i tabličnih `n (%)` (`158 (77,8)`, `(12,35)` iza brojke) i svezak(broj) `53(3-4)`, `numeric_list_items`, `split_reference_list`, `numeric_report[_file]` (siročad, citat bez reference, redoslijed prvog pojavljivanja, spojnica u rasponu, razmak iza zareza, nabrajanje umjesto raspona — ista pravila kao `provjeri_vancouver.py`, potvrđeno 96/75/0 na testnom radu). `hr_text.NASLOV_LIT` prepoznaje i „Popis citirane literature", „Citirana literatura", „Literatura i izvori", „Popis referenci", „Reference(s)", „Korištena literatura". `check_argument.py`: citatna gustoća vidi Vancouver citate + nova dimenzija „pokrivenost popisa" (u `arg.json` pod `citati.pokrivenost`). `rubrika.py`: kriterij „Izvori i dokazna potpora" bez ledgera/izvori.json čita tu pokrivenost umjesto `nepoznato`. `profile_rules.ENUM_RULES`, `stanje_init.STILOVI`: enum. `verify_rewrite.py` bez izmjene — otisak kroz `citation_fingerprint_text` sada vidi `(12)`→`(13)` (101 → 101, izgubljeno 12 / dodano 13). Profil `hks-fzs.json` (+ dodaci/patches) prebačen s `ieee` na `vancouver`.
* **Granice.** Ne pokriva: citate u eksponentu, `(1)–(3)` kao raspon dviju zagrada, format polja same reference (skraćeni časopis, „i sur." — to ostaje u rad-audit fazi B i kućnom stilu), `verify_sources.py --pokrivenost` (i dalje autor-godina; za numeričke dijalekte pokrivenost daje `check_argument`). Odlomak s enumeracijom `(1)`, `(2)` u autor-godina radu se NE dira (dijalekt dolazi iz profila, ne iz teksta). `check_rules.py` na HKS-FZS profilu pada na `pravilo_potvrdeno` (provenance kao string) — neovisno o ovom nalazu.

# v1.9 — popravci nalaza 2/4/5/7 (rujan 2026.)

* **Nalaz 4, `check_rules.py`** — izlazni kod 1 samo zbog ❌; na profilu `nepotvrdeno` ❌ zadržavaju samo pravila s provenance `explicit` (iz resolvera ili sidecara `<profil>.provenance.json`), ostala kršenja daju ⚠️ i ne blokiraju (pravilo 18).
* **Nalaz 7, `provjeri_literaturu.py`** — prepoznaje i naslove „Popis citirane literature", „Citirana literatura", „Literatura i izvori", „Reference", „Bibliografija", „Korištena literatura" (lokalni `NASLOV_LIT_PROSIREN` uz `H.NASLOV_LIT`).
* **Nalaz 2, `vjestine.py`** — sateliti se traže i u `~/.claude/skills/synced/*/<slug>` i `/root/.claude/skills/synced/*/<slug>` (Cowork); env `<SLUG>_HOME` i dalje ima prednost.
* **Nalaz 5, `vjestine.json` + `vjestine.py`** — `uvjet.tipovi` (novo, unatrag kompatibilno): `stil.kucni`/fpzg-diplomski vrijedi za `zavrsni|diplomski`; za seminarski/esej .docx ide kroz `izrada.docx` (rad-docx) odn. rezervu `build_docx.py` + `rad-docx/scripts/arhiva.py`; tip iz `--tip` ili `.katedra/stanje.json`.

# v1.8 — jezik rada, trag nalaza, fusnote (kolovoz 2026.)

> Tri stavke iz zadnjeg pregleda rupa. Certificirani release ostaje **v1.0.1**.

## 1. Jezik rada — pravilo 26

Nijedan profil nije imao polje `jezik`, a `hr_text`, `provjeri_jezik`, `check_ai_style`,
`provjeri_sazetak`, hrvatska kolacija i citatni dijalekti tiho su pretpostavljali hrvatski.

Rad pisan **na engleskom** na hrvatskom fakultetu nije dobivao poruku „ne mogu” nego
**izvještaj lažnih nalaza**. Razlika prema običnoj rupi je bitna: rupa šuti, a ovo je
govorilo krivo — što je gore, jer se ne vidi kao izostanak nego kao nalaz.

`scripts/jezik.py` razrješava jezik (stanje → profil → zadano `hr`) i nosi `guard()` koji
pet alata vezanih uz hrvatski **isključuje** na drugom jeziku: izlazni kod **0 uz
deklarirano ograničenje**, ne 1 uz nalaze. Nepokrivenost nije nalaz — isto načelo po kojem
izostanak satelita nije kršenje.

Kad jezik nije deklariran, alati rade dalje uz **upozorenje**, da izostanak polja ne ostane
nevidljiv na postojećim projektima.

## 2. Trag nalaza — pravilo 27

Nakon sedam verzija: 27 pravila, 27 dijelova, 13 kriterija, 17 koraka u gateu. Veći rizik
više nije provjera koja fali nego **izvještaj koji se prestane čitati**.

`scripts/nalazi_trag.py` bilježi svaki prolaz gatea u `.katedra/gate_povijest.jsonl` i
uspoređuje ih kroz krugove:

* **popravljeno** — bio nalaz, sad je `ok`;
* **šum** — `nalaz` u 3+ uzastopna prolaza, netaknut.

Nalaz koji toliko stoji nije nalaz nego šum: kriv, nerazumljiv ili nevažan. Spušta se iz
blokirajućeg u savjetodavno, ili miče.

**Ovo je prvo pravilo u paketu koje postoji da bi paket rastao SPORIJE, a ne brže.** Dvije
ograde: alat ne zna *zašto* je nalaz preskočen (razlog dolazi iz razgovora), i šum se prvo
spušta, tek onda miče.

## 3. Fusnote

`citation_dialects.py` poznaje `legal-footnote`, `check_citations` skenira fusnote — ali
**disciplinu nije provjeravao nitko**. Libertas profil izrijekom traži fusnote i njegova
napomena već bilježi da je Pravilnik u tome nedosljedan.

`scripts/provjeri_fusnote.py` čita `word/footnotes.xml` i mjeri četiri stvari: prvo puni pa
skraćeni oblik, `ibid.` uz neposredno prethodnu fusnotu, kontinuitet numeracije, i
razrješava li se prezime iz fusnote u popisu literature. Propisi i NN-oznake se izuzimaju.

Rad bez fusnota **nije nalaz** — alat kaže da nema što provjeriti. Je li fusnota trebala
postojati zna profil, ne alat.

## Dokaz

| | |
|---|---|
| rad deklariran kao `en` | `provjeri_jezik`, `check_ai_style`, `provjeri_sazetak` se isključe uz ograničenje, kod **0** |
| jezik nedeklariran | alati rade + upozorenje „pretpostavlja se hrvatski” |
| `stanje_init.py --set jezik=klingonski` | odbijeno ❌ |
| trag nalaza, 3 simulirana prolaza | 2 popravljena, 2 označena kao **šum (3 kruga)**, 1 „prati — 2 kruga”, 1 novo |
| fusnote, fixture sa 7 fusnota | ❌ rupa u numeraciji · ❌ `ibid.` u prvoj · ❌ skraćeni prije punog · ❌ sirotan izvor · ⚠️ lanac `ibid.` · ⚠️ ponovljen puni oblik |
| uredan slijed od 5 fusnota | **0 kršenja**, kod 0 |

## Namjerna ograničenja

* Jezik se **ne zaključuje iz teksta** — rad s engleskim sažetkom i hrvatskim tijelom iz
  uzorka slova izgleda kao obrnuti slučaj, a cijena krivog zaključka je cijeli izvještaj.
* Podržan je samo hrvatski. Drugi jezici **nisu implementirani nego isključeni**; to je
  razlika koju alat izgovara.
* `nalazi_trag.py` mjeri učestalost, ne razlog. Tri kruga na **jednom** radu nisu dokaz —
  isti prenagli zaključak kao dodavanje provjere na temelju jedne sesije.
* `provjeri_fusnote.py` ne zna je li fusnota trebala postojati.

## Što ostaje otvoreno

Šest stavki iz pregleda rupa, svjesno: sedam dijelova `nepokriveno` (izjava o AI alatima,
zahvala, popis kratica, prilozi, prijava teme, repozitorij, ispravci nakon obrane),
terminološka dosljednost u hrvatskom, Turnitin izvještaj → lista zahvata, anonimizacija
priloga, changelog za mentora.

**Ostaju otvorene namjerno.** Sljedeći potez o njima ne bi trebao biti procjena nego podatak
iz `nalazi_trag.py` na stvarnom radu.

---

# v1.7 — ugovor o učitavanju (kolovoz 2026.)

> Optimizacija s dva zahtjeva koji vuku na suprotne strane: učitaj samo ono što treba, i
> nikad ne preskoči ono što se mora znati. Certificirani release ostaje **v1.0.1**.

## Dijagnoza — mjereno, ne procijenjeno

Nakon šest verzija: 46 referenci, 24 pravila, 15 koraka u gateu. Router se učitava u
**svakoj poruci**, a nosio je i ono što vrijedi samo za jedan mod:

| | |
|---|---|
| `SKILL.md` ukupno | **25 085 B ≈ 8 361 token, svaka poruka** |
| § 1 željezna pravila | 7 806 B — vrijede svugdje, ostaju |
| § 2 tijek po modovima | **4 579 B — sadržaj pojedinih modova** |
| § 0.4 datoteke po modovima | **2 149 B — isto** |

Provjereno je i preklapanje među referencama: **gotovo ga nema** (najviše 3 zajedničke
rečenice, i to naredbe). Gubitak nije bio u ponavljanju nego u tome gdje sadržaj stoji.

## Popravak, dio prvi — manje

Sadržaj pojedinog moda preseljen je u referencu tog moda: popis datoteka pod „Datoteke koje
trebam”, tijek pod „Tijek moda — sažeto”. Ondje stiže u istom trenutku, ali samo kad se taj
mod stvarno koristi.

**Router: 25 085 → 20 070 B (−20 %, ≈ 1 670 tokena po poruci.)**

## Popravak, dio drugi — ne manje nego što treba

Fiksan popis po modu ne rješava ništa: ili je prekratak pa se nešto preskoči, ili predug pa
se učitava `metodologija.md` na radu koji nema istraživanje.

`references/ucitavanje.json` + `scripts/ucitavanje.py` izvode popis **iz stanja projekta**.
Uvjeti (`nema:`, `ima:`, `dio:`, `tip:`, `prazno:`) evaluiraju se protiv `.katedra/`, pa je
popis točan za ovaj rad, danas. Tri kategorije:

| | |
|---|---|
| **mora se pročitati** | obavezno za mod + uvjetno kad je uvjet ispunjen |
| **ne učitavaj** | uvjet nije ispunjen — s razlogom („razina.json postoji”) |
| **ne učitavaj sada** | otvori tek na **imenovan okidač** |
| **nikad tijekom rada** | `mapa.md`, `zasto.md`, `razvoj.md`, `stanje_schema.md`, JSON registri, `docs/` — preko 55 KB koje registre čitaju skripte, ne agent |

Treća kategorija uvedena je **nakon mjerenja**: prva verzija ugovora dala je modovima 4 i 5
*više* nego prije, jer je učitavala `rad_audit_contract.md` i `metodologija.md` unaprijed.
Učitati 8 KB reference da bi se iz nje izvukao jedan popis isti je gubitak kao i preskočiti
ju — u prvom slučaju plaća se kontekst, u drugom točnost.

## Dvije odluke koje vrijede više od alata

1. **Uvjet koji se ne razumije NE izbacuje referencu.** Nepoznat uvjet vraća „učitava se za
   svaki slučaj”. Ista asimetrija na kojoj stoji pravilo 20.
2. **Alat ne tvrdi da je išta pročitano.** Nijedan to ne može. Vrijednost nije u prisili
   nego u tome što je popis izračunat, imenovan i obrazložen — pa se ne pamti.

## Mjereno na stvarnom projektu usred rada

| mod | prije | poslije | |
|---|---|---|---|
| 1 Novi rad | 75 324 B | 64 294 B | −15 % |
| 2 Pisanje | 76 904 B | 63 817 B | −17 % |
| 3 Poboljšanje | 59 017 B | 51 977 B | −12 % |
| 4 Audit | 45 769 B | 43 996 B | −4 % |
| 5 Obrana | 29 130 B | 24 641 B | −15 % |
| 6 Predaja | 66 524 B | 55 060 B | −17 % |
| 7 Povratak | 32 679 B | 28 402 B | −13 % |
| **prosjek** | **55 049 B** | **47 455 B** | **−14 %** |

Na **praznom** projektu popis je namjerno veći: bez stanja svi se uvjeti razrješavaju u
korist učitavanja. To nije regresija nego fail-safe — mod 1 na svježem projektu doista treba
razinu, pretragu, primjerke i os dijelova.

`gate.py` svaku fazu sada otvara korakom `ucitavanje` (savjetodavan): ide prije provjera jer
je jeftin i mijenja ono što slijedi — provjera pokrenuta bez pročitanog protokola daje nalaz
koji nitko ne zna protumačiti.

## Pravilo 25 — štivo se izračuna, ne pamti

## Namjerna ograničenja

* Popis se **ne provodi silom**. Alat ga izračuna i ispiše; čitanje ostaje na agentu.
* Ušteda u routeru je stvarna po poruci; ušteda po modu ovisi o stanju projekta.
* Uvjeti su namjerno jednostavni (pet vrsta). Složeniji izraz značio bi vlastiti jezik
  uvjeta, a to je nov izvor istine uz registre koji već postoje.

---

# v1.6 — primjerci, izračuni, pozicioniranje (kolovoz 2026.)

> Tri zahvata iz jednog pitanja: treba li poseban modul za matematiku, mod koji gleda slične
> radove, i način da repozitorijski radovi posluže kao tehnička referenca.
> Certificirani release ostaje **v1.0.1**.

## 1. Primjerci — pravilo 24

Željezno pravilo 17 („uzorak je jači od profila”) postojalo je od ranije, a **nabava uzorka
nije**: ovisila je o tome ima li student slučajno rad koji mu je mentor dao. Obranjeni
radovi hrvatskih ustanova javno stoje u repozitorijima.

`scripts/primjerci.py` mjeri obranjeni rad: margine, font i veličinu tijela, prored,
poravnanje, naslove obiju razina, numeraciju pododjeljaka, redoslijed naslova, primjere
citata, oblik jedinice u popisu, uvlaku i završnu točku, opseg. Zatim ga uspoređuje s
profilom.

**Razlika nije kršenje.** Obranjeni rad je opservacija, Upute su norma, i obje ostaju
zapisane — točno kako pravilo 17 propisuje. Alat izrijekom kaže kad ima manje od dva
primjerka: jedan rad nije uzorak.

Ne skida ništa s interneta — student skine, alat mjeri. Ne upisuje u instalirani skill nego
u `.katedra/primjerci.json`, a blok za profil ispisuje maintaineru (isto pravilo kao
`profile_registry.py`).

## 2. Izračuni — izbor formule, ne aritmetika

Aritmetika je bila pokrivena na tri mjesta (pravilo 13, `brojke.md`, `replikacija-pspp`).
Ostala je kategorija koju nitko nije hvatao: **brojka aritmetički točna, formula kriva.**
Takva pogreška prođe svaku postojeću provjeru jer nijedan zbroj nije pogrešan — pogrešno je
što je zbrojeno.

Šest pogrešaka, svaka s testom (`references/izracuni.md`): postotak umjesto postotnog boda,
nedeklarirana osnovica rasta, udjeli koji ne daju sto, CAGR naspram prosječne godišnje
stope, bazni naspram lančanog indeksa, nominalno naspram realnog.

❌ dobiva samo ono što se ne da drukčije protumačiti; ostalo je ⚠️ i traži da se izbor
**deklarira**, jer alat ne zna koji je pokazatelj trebao biti upotrijebljen.

## 3. Pozicioniranje — „što je tu novo?”

`pretraga.py pozicija` bilježi tri najbliža postojeća rada i razliku prema svakome. To je
prvo pitanje komisije i rečenica u uvodu koja razlikuje rad koji zna gdje stoji od rada koji
je samo pročitao literaturu.

Razlika se piše konkretno: drugi predmet, drugi podaci, druga metoda, druga razina analize
ili suprotan nalaz. „Noviji podaci” sama za sebe nije razlika. Bez zapisa rečenica o
doprinosu ispadne „o ovoj je temi malo pisano” — najslabija moguća tvrdnja, obara se jednim
naslovom.

## Dokaz

| | |
|---|---|
| `primjerci izmjeri` nad radom u Garamondu 11 pt | ≠ font, ≠ veličina; margine, prored i popis se slažu — i uz izričitu napomenu da razlika nije kršenje |
| profil s VIŠE dopuštenih fontova (`[Times New Roman, Calibri]`) | uzorak koji pogađa bilo koji nije odstupanje |
| `provjeri_izracune` na „s 20 % na 24 %, dakle za 4 %” | **❌ postotni bod** |
| isti alat na „za 4 postotna boda, odnosno za 20 % relativno … realni prihod … bazni indeks … CAGR” | **0 kršenja, 0 upozorenja** |
| udjeli 41,2 + 33,5 + 24,9 | ❌ „daju 99,60, ne 100” |
| `pretraga pozicija` s tri rada | ispis s razlikom po radu i uputom kamo ide |

**Tri zamke nađene pri izradi**, sve u uzorcima, i sve bi tiho propustile pravu pogrešku:

1. `povećal\w*` ne hvata „povećao” — muški rod jednine gubi „l”, a to je najčešći oblik u
   kojem se pogreška i piše.
2. `\b` iza `%` nikad ne stoji: `%` je neslovni znak, pa iza njega nema granice riječi.
   Uzorak `(%|posto)\b` nije se podudarao ni s čim što završava postotkom.
3. `razina_naslova` vraća **0** za tijelo, ne `None` — pa je mjerenje fonta i proreda
   vraćalo prazno na svakom radu.

## Namjerna ograničenja

* `primjerci.py` radi nad `.docx`; PDF nosi izgled, ali ne stilove, pa se margine i prored
  iz njega mjere nepouzdano.
* Automatsko dohvaćanje iz repozitorija **nije** dio lanca i neće biti — rad skida student.
* `provjeri_izracune.py` ne zna koji je pokazatelj primjeren temi i ne vidi u grafikon
  (grafikon je slika).
* Pozicioniranje je **unos**, ne pretraga: alat ne nalazi najbliže radove nego bilježi one
  koje si našao.

---

# v1.5 — jezik, tempo, pretraga (kolovoz 2026.)

> Tri rupe koje su nakon v1.4 ostale najskuplje. Certificirani release ostaje **v1.0.1**.

## 1. Hrvatski jezik — `provjeri_jezik.py`

Lanac je mjerio ritam, koheziju, prazne fraze i tipografiju, a **nijednu pravopisnu ni
gramatičku pogrešku**. Rad je mogao proći svih 27 dijelova, imati pojas 5 i vratiti se jer
je na tri mjesta „sa” umjesto „s”.

**Odluka: pravila, ne rječnik.** Rječnička provjera nad akademskim hrvatskim prijavi svaki
stručni termin, svako prezime iz literature i svaku kraticu — nekoliko stotina lažnih
nalaza, a lažni nalaz je kvar jednake težine kao promašeni (pravilo 18). Jezgra je 21
pravilo visoke preciznosti; rječnik je neobavezan sloj (`--rjecnik`), uvijek savjetodavan, i
kad ga nema to se **kaže**.

Pokriveno: `sa`/`s`, „ne” uz glagol, `da li`, „modalni + da + prezent”, „obzirom na”,
„u vezi toga”, enklitika na početku rečenice, redni broj bez točke, datum bez razmaka,
razmak pred interpunkcijom, ravni navodnici, spojnica u rasponu, „postotaka”; te registar —
„od strane”, „isti” kao zamjenica, „vršiti”, „putem”, „radi toga što”.

**Tri odluke protiv lažnih nalaza**, svaka nađena testiranjem na urednom tekstu:
`sam` i `te` izbačeni iz popisa enklitika („Sam rad pokazuje…”, „Te je godine…” su
ispravni); „Je li…”/„Bi li…” izuzeti; početak rečenice prepoznaje se **samo** po prethodnoj
rečeničnoj interpunkciji, ne po početku retka, jer prelomljena rečenica u markdownu inače
daje nalaz na svakom prijelomu.

## 2. Tempo — `tempo.py`

Hodogram računa unatrag od roka i **postoji tek u modu 6**. Sve za raniji odgovor već je
bilo u projektu: `plan.json` nosi `stranice`, `status` i `rijeci` po potpoglavlju,
`stanje.json` nosi `rok`. Nijedan alat te dvije datoteke nije spojio.

Mjeri preostale **planirane stranice** naspram dana do roka, umanjeno za administrativni rep
iz profila (Turnitin, ispravci, uvez, referada — tipično 14 dana, i redovito se zaboravi).
Ocjena: u planu / napeto / zaostatak / nerealno. `--strogo` daje izlazni kod 1.

Zašto stranice, a ne napisane riječi: student misli da je „na pola” jer je napisao pola
poglavlja, a preostala poglavlja nose dvije trećine stranica.

## 3. Pretraga i plan čitanja — `pretraga.py` + `references/istrazivanje.md`

Sve **nizvodno** od „imaš izvore” bilo je pokriveno; **uzvodno ništa**. Odakle izvori
dolaze, koje su baze pretražene, kojim riječima, što je odbačeno i zašto.

Dvije datoteke: `.katedra/pretraga.json` (pitanje, kriteriji, upiti s brojem pogodaka i
zadržanih, snowball u oba smjera, zasićenje) i `.katedra/citanje.json` (uloga i status po
izvoru).

**Uloga određuje koliko se čita, ne koliko izvor vrijedi** (to je taksonomija A/B/C/D/E/X):
`jezgra` cijelo · `metoda` metodološki dio · `potpora` odjeljak koji nosi tvrdnju ·
`kontekst` sažetak i zaključak · `odbaceno` s **obaveznim razlogom**. Izvor koji proturječi
tezi čita se prvo, ne zadnji.

**Pravilo 23:** pretraga se bilježi dok traje. Rekonstrukcija po sjećanju tri mjeseca
poslije ne postoji, a na obrani se to pita.

## Ožičeno

| Faza gatea | Novo |
|---|---|
| `plan` | `pretraga.py status` (savjet) |
| `pisanje` | `provjeri_jezik.py`, `tempo.py` (savjet) |
| `audit` | `provjeri_jezik.py` (savjet) |
| `predaja` | `provjeri_jezik.py` (**blokira**) |

Rubrika dobiva kriterij `jezik` (težina 3). `plan.md` § 1.2b, `pisanje.md` self-check,
`predaja.md` § 2a2.

## Dokaz

| | |
|---|---|
| loš tekst (13 podmetnutih pogrešaka) | **13 ❌ + 4 ⚠️**, izlazni kod 1 |
| uredan akademski tekst sa zamkama („Sam rad”, „Te je godine”, „Je li”, „Bi li”, „sa Zavoda”, „s terena”, „2019.–2024.”, „3,4 postotna boda”, „27,4 %”) | **0 nalaza**, izlazni kod 0 |
| tempo, 10/36 str., rok +46 dana | 32 dana pisanja → 0,81 str./dan → ⚠️ NAPETO |
| isti plan, rok +20 dana | ❌, `--strogo` izlazni kod 1 |
| pretraga, 3 baze | 264 pogotka → 20 zadržano, snowball 4, zasićenje da; plan čitanja po ulogama s predloženim redoslijedom |

## Namjerna ograničenja

* Jezična jezgra **ne pokriva slaganje roda i broja** ni padežnu rekciju — za to treba
  morfološka analiza, a plitka bi heuristika ovdje davala upravo lažne nalaze.
* Rječnik se **ne isporučuje**: hrvatski hunspell nije dostupan preko pipa. Ako ga korisnik
  ima na sustavu, `--rjecnik` ga koristi; inače alat to kaže.
* `tempo.py` mjeri **opseg naspram vremena**, ne kvalitetu i ne obećava dovršetak.
* `pretraga.py` **ne pretražuje baze** — brojeve upisuje čovjek. Zapis je onoliko točan
  koliko je unos pošten. Zasićenje je prosudba, ne izračun.

---

# v1.4 — razina rada, popis literature, prikazi, boja tablica (kolovoz 2026.)

> Certificirani release ostaje **v1.0.1**. Četiri zahvata iz jednog pitanja: *kako se
> zapravo rade i provjeravaju prikazi, kako se pazi na ritam, može li se odrediti razina
> rada, i gleda li se uputa samo za citiranje ili i za popis literature.*

## 1. Razina rada — pravilo 22

Skill je skalirao samo po **tipu** rada (opseg, poglavlja, `izvori_min`) i imao tri radna
moda. Nijedno polje nije nosilo ono što odlučuje kako rečenica izgleda: **koliko čitatelj
već zna.** Isti pojam za prvu godinu traži definiciju, izvor i primjer; za povjerenstvo koje
tim pojmom radi dvadeset godina ista je definicija gubitak prostora.

| Datoteka | Što |
|---|---|
| `references/razina.json` | 4 razine × 4 tipa čitatelja; za svaku: što se smije pretpostaviti, što se definira, omjer teorije i analize, očekivani doprinos, tip izvora, duljina rečenice |
| `scripts/razina.py` | `--postavi` / `--citatelj` / `--tema-poznata` / `--tip` (prijedlog, ne odluka); ispisuje šest obveza za pisanje |
| `references/razina.md` | protokol, sudari s Uputama i glasom autora, što kad se razina promijeni usred rada |

**Načelo koje se pri ovome najlakše izokrene, pa stoji u registru, skripti i referenci:**
niža razina NIJE lošiji rad nego rad koji **više objašnjava i manje tvrdi**. Ništa u razini
ne dopušta manje izvora ni slabiju provjeru — željezna pravila 2, 3 i 4 vrijede na svakoj
razini jednako. Razina se **deklarira**, kao citatni stil (§ 0.8): rad koji mnogo objašnjava
može biti prvi semestar ili loš diplomski, a alat tu razliku ne vidi.

Ožičeno: mod 1 ju postavlja (`plan.md`), mod 2 ju čita prije prve rečenice (`pisanje.md`
§ 3.0) i provjerava u self-checku („je li ijedan pojam definiran **suprotno razini**"),
rubrika ju nosi kao kriterij `razina` (težina 3).

## 2. Popis literature — `provjeri_literaturu.py`

Profil je **već nosio** `popis_primjer`, `uvlaka_u_popisu`, `razmak_izmedu_jedinica`,
`tocka_iza_godine`. Provjeravala su se točno dva pravila i oba u TEKSTU
(`citiranje.stil`, `citiranje.tocka_iza_godine`). Oblik same jedinice nije provjeravao nitko.

Novi alat mjeri nad `.docx`-om: **oblik imena** (inicijal naspram punog imena, izvedeno iz
`popis_primjer`), **završnu točku**, **godinu s točkom ili bez**, **uvlaku** i **razmak** iz
oblikovanja odlomka, te **abecedni red po hrvatskoj kolaciji** (C < Č < Ć, S < Š, Z < Ž,
D < Đ).

Svaka jedinica završi u jednoj od tri skupine — u skladu / odstupa / **nije provjereno** —
a treća se ispisuje. Popis literature je najšarolikiji dio rada (propisi, mrežni izvori,
institucijski autori) i tiho preskakanje dalo bi lažno zeleno.

## 3. Prikazi kao slike — `provjeri_prikaze.py`

Provjeravala se **struktura** prikaza (natpis, izvor, spomen u tekstu, lomljenje), nikad
sama slika. Novi alat mjeri: efektivni **dpi** u dokumentu, **širinu** naspram širine
teksta, **razvučen omjer**, **kolabiranu visinu**, i **skaliranje** — grafikon izvezen na
6,1 in a umetnut na 12 cm ima svako pismo u sebi manje za 23 %, pa oznake osi od 9 pt
izlaze kao 7 pt.

**Ne crta grafikone i ne ocjenjuje je li grafikon dobro odabran** — to traži podatke i
kontekst, pa se ne pretvara da može (pravilo 8). Novi dio `prikazi` u
`references/dijelovi.json` (27 dijelova).

## 4. `tablice_boja` — mrtvo polje spojeno

Intake je od § 0.4 pitao boju tablica, `stanje_init.py` ju zapisivao, i **nijedna skripta ju
nikad nije pročitala**; `build_docx.py` je hardkodirao `Table Grid`. Pitati korisnika za
nešto što nigdje ne djeluje gore je nego ne pitati.

Sada: pet paleta (`bez boje`, `sivo`, `rozo-sivo`, `plavo`, `zeleno`), zebra na zahtjev,
vrijednost se čita iz `stanje.json` ili nadjačava sa `--tablice-boja`. Tonovi su namjerno
blijedi — jaka boja u crno-bijelom ispisu postaje siva mrlja.

**Zamka nađena pri izradi:** „sivo" je podniz od „rozo-sivo", pa je kraći ključ jeo dulji i
korisnik koji je tražio rozo-sivo dobivao sivo, bez ijedne poruke. Podudaranje ide točno,
pa djelomično od najduljeg ključa.

## Dokaz

| Provjera | Rezultat |
|---|---|
| paleta tablica, 6 vrijednosti | `bez boje` → bez sjenčanja · `sivo` → D9D9D9 · `rozo-sivo` → EDE3E3 · `plavo` → DCE6F1 · nepoznato → sivo |
| `provjeri_literaturu.py`, EFZG fixture | 6 jedinica: 2 u skladu, **3 odstupa** (puno ime, godina bez točke, završna točka), 1 propis neprovjeren, abecedni red ⚠️; kod 1 |
| isti alat, **FPZG** fixture (obrnute konvencije) | 4 jedinice: 1 u skladu, **2 odstupa** (inicijal, godina s točkom); kod 1 — **isti alat, suprotan kućni stil, točno u oba smjera** |
| `provjeri_prikaze.py`, fixture s 4 slike | 1:1 grafikon ✅ · skaliran 0,77× → pismo 7,7 pt ❌ · preširok + razvučen 54 % + 70 dpi ❌❌❌ · kolabiran 0,4 cm ❌; kod 1 |
| `razina.py` | postavljanje, ispis šest obveza, prijedlog iz tipa, odbijanje nepoznate razine |
| `gate.py --faza predaja` | 12 koraka, nova dva uključena, 0 „alat pukao" |
| rubrika bez `razina.json` | kriterij ❔ `nepoznato` — nikad se ne broji kao ispunjen |

## Namjerna ograničenja

* **Nitko i dalje ne crta grafikone.** Ni Katedra ni `rad-docx` nemaju crtački kod; grafikon
  dolazi kao gotov PNG. To je odluka, ne propust — crtanje traži podatke, a lanac radi s
  dokumentom.
* `provjeri_prikaze.py` **ne zna je li grafikon prikladan tvrdnji** ni je li os odsječena.
* Skaliranje i veličina pisma mjere se samo ako PNG nosi zapisan dpi; bez njega alat to
  kaže i preskače, umjesto da pretpostavi 100 dpi.
* `provjeri_literaturu.py` traži `.docx` — uvlaka i razmak se u markdownu ne vide.
* Razina **nije izlika**: ne mijenja zahtjeve na točnost, izvore ni argument.
* Nijedan od četiri zahvata nije prošao formalni B01–B20 audit lanac.

---

# v1.3-os-dijelova — druga os: od čega se rad sastoji (kolovoz 2026.)

> Certificirani release ostaje **v1.0.1**. Ovaj sloj ne mijenja nijedan blocking contract
> (PLAN GATE, evidence gate, rad-audit boundary) i nije prošao formalni B01–B20 lanac.

## Dijagnoza

Katedra je bila organizirana isključivo po **vremenu**: sedam modova, svaki sa svojom
referencom. Os **dokumenta** — od čega se rad sastoji — nije postojala nigdje. Pokrivenost
je zato bila emergentna: postojala je samo kao nuspojava toga koji je mod odabran, pa
nijedna datoteka nije mogla odgovoriti na pitanje *„koji dio rada nitko ne provjerava"*.

Tri mjerljive posljedice, nađene pri uvođenju osi:

1. **Engleski summary nije dodirivao nijedan alat.** `provjeri_sazetak.py` radi nad
   hrvatskim, `check_rules.py` gleda samo postoji li naslov. Dio koji nakon predaje ostaje
   javan u repozitoriju bio je jedini potpuno neprovjeren.
2. **Rasprava se nije spominjala nijednom riječi** ni u jednoj referenci, iako je to
   poglavlje koje razlikuje četvorku od petice. Isto vrijedi za metodologiju: postojao je
   *policy za validator* (`argument_methodology.py`), ali nijedna uputa kako se poglavlje
   piše.
3. **Tri fakulteta isti dio zovu trima imenima**, a dijelovi kojih u profilu nema —
   prilozi, izjava o korištenju AI alata, prijava teme, unos u repozitorij, ispravci nakon
   obrane — nisu postojali nigdje.

Uz to, `references/predaja.md` je tražio da agent zapamti desetak naredbi u točnom
redoslijedu. **Preskočena naredba nije proizvodila nikakvu poruku** — jedini kvar u paketu
koji se ne vidi ni na jednom izlaznom kodu.

## Što je dodano

| Datoteka | Što |
|---|---|
| `references/dijelovi.json` | registar 26 kanonskih dijelova rada: skupina, redoslijed, obaveznost, nazivi u profilima, tko proizvodi, **tko provjerava i na kojoj razini** |
| `scripts/dijelovi.py` | `--sij` iz resolved profila, `--status`, `--set`, `--provjeri --faza pisanje\|predaja` |
| `references/dijelovi.md` | protokol osi, kako se čita izvještaj, kako se dodaje dio |
| `scripts/gate.py` | jedan ulaz za provjere faze: `--faza plan\|pisanje\|audit\|predaja`, `--suho` |
| `scripts/provjeri_engleski.py` | engleski summary/ključne riječi protiv hrvatskog sažetka |
| `references/metodologija.md` | osam odjeljaka, uzorak, instrument, operacionalizacija, etika, ograničenja |
| `references/rasprava.md` | četiri poteza po nalazu, kontratumačenje, granica prema zaključku |
| `references/engleski.md` | naslov, summary, ključne riječi, blok metapodataka za Dabar |
| `references/zasto.md` | obrazloženja pravila 11–20, izvučena iz routera |

Tri razine provjere (`strojno` / `rucno` / `nepokriveno`) su ono zbog čega registar postoji.
**`nepokriveno` nije propust nego deklarirana granica** — pravilo 8 traži da se granica kaže,
a registar je oblik u kojem se dade prebrojati umjesto obećati. Na dan uvođenja: 12 strojno,
7 ručno, 7 nepokriveno.

Registar **uvozi** `norm`, `SINONIMI` i `je_neobavezan_dio` iz `check_rules.py` umjesto da ih
prepiše. Dva popisa sinonima razišla bi se unutar tjedna — pravilo 13 primijenjeno na tekst.
Granica je stroga: `check_rules.py` odgovara na *je li dio prisutan u .docx-u*, `dijelovi.py`
na *koje dijelove rad uopće treba i tko ih provjerava*.

## Nova željezna pravila

**19 — pokrivenost se broji, ne pretpostavlja.** Os dijelova se sije u modu 1 i blokira u
modu 6. Novi dio je jedan zapis u registru, ne novi odlomak proze.

**20 — alat koji je pukao nije provjera koja je prošla.** `gate.py` svaki korak svrstava u
`ok` / `nalaz` / `preskočeno` / `alat pukao`, i zadnja se dva **izgovaraju**. Skripte
koriste kod 1 za nalaz i 2 za odbijen ulaz, pa je u ručnom prolazu `check_rules.py` nad
`.md` datotekom izgledao kao običan nalaz umjesto kao provjera koja se nije dogodila.

## Popravljeni kvarovi

**Mod 7 nije postojao za svježu sesiju.** Frontmatter je tvrdio „sedam modova", izbornik
§0.2 nudio šest opcija, routing tablica §0.3 imala šest redaka. `references/povratak.md` bio
je dosežan samo ako korisnik slučajno pogodi frazu. Dodan je redak u oba.

**Router je nosio obrazloženja.** Pravila 13–18 imala su inline „*Zašto pravilo:*" narative,
a zaglavlje dva bloka release-notesa i `metadata.extensions` od ~900 znakova — sve to u
svakoj poruci. Preseljeno u `references/zasto.md` i `docs/PROMJENE.md`; `SKILL.md` je manji
unatoč dva nova pravila i cijelom novom odjeljku o `gate.py`.

## Što nije u paketu (bilo u SKILL.md, sada ovdje)

`tests/` (88 datoteka) i `evals/` (13) — razvojni materijal koji se pri radu na radu nikad
ne čita; izostavljen zbog ograničenja broja datoteka. U razvojnom checkoutu postoji i vrijedi
`references/razvoj.md`.

## Uklonjeno

`interaction_policy.py`, `agent_policy.py`, `eval_runner.py`, `benchmark_runner.py`,
`originality_eval.py`. Nijednu nije pozivao runtime (provjereno grepom import grafa), a
`tests/` i `evals/` se ne isporučuju pa su bez svojih gold-setova bile mrtve. Nezavisni
audit (`docs/audit.md`, Q16) preporučio je brisanje prve dvije izrijekom. U razvojnom
checkoutu ostaju; `references/razvoj.md` je prepisan da to kaže.

## Dokaz

| Provjera | Prije | Poslije |
|---|---|---|
| `dijelovi.py --sij` nad efzg/fpzg/libertas | — | 26 dijelova, **0 nepoznatih naziva** na sva tri profila |
| `provjeri_engleski.py` nad radom s „šest poglavlja"/„eight chapters" i 27,4/24,1 | nema alata | ❌ brojke, ❌ ključne riječi, ⚠️ ispisani brojevi; kod 1 |
| isti alat nakon ispravka | — | 0 kršenja, kod 0 |
| `gate.py --faza predaja` s `.md` podmetnutim kao rad | tiho izgledalo kao nalaz | 💥 **alat pukao**, izrijekom |
| isti gate nad `.docx` | — | 3 prošlo, 3 nalaza, 3 preskočeno, 0 pukao |
| `--suho` | — | ispisuje plan bez pokretanja |

## Rubrika — kriteriji ocjenjivanja (isti sloj)

Cijeli je paket optimiran prema petici, a nigdje nije stajalo prema čemu se ta petica mjeri.
Posljedica: „rad je spreman" značilo je „prošao je formalne provjere". Rad bez teze prolazi
svaku formalnu provjeru u paketu — pravilo 11 to kaže od početka, ali nijedan alat nije
zbrajao posljedicu.

| Datoteka | Što |
|---|---|
| `references/rubrika.json` | 10 kriterija: težina, je li ključni, i **iz kojeg artefakta se status čita** |
| `scripts/rubrika.py` | agregator nad `arg/pravila/dijelovi/evidence_gate/zamjerke/stil/sazetak/engleski/zadatak` |
| `references/rubrika.md` | kako se čita pojas, kako se rubrika prilagođava, **što alat ne vidi** |

**Pravilo 21 — ciljana ocjena se mjeri, ne obećava.** Tri odluke koje su namjerne:

* **Pojas, ne broj.** „Ocjena 4,2" je lažna preciznost. Pojas je gornja granica koju rad u
  ovom stanju može doseći, uz imenovan popis onoga što ju drži.
* **Jedan pali ključni kriterij obara sve** — nema zbrajanja bodova preko praga. Nema teze,
  nema petice, ma koliko uredna forma; zato forma nosi težinu 2, a teza i doprinos po 5.
* **Artefakt kojega nema je `nepoznato`, nikad `ispunjeno`.** Kad `nepoznato` padne na
  ključni kriterij, pojas se **ne procjenjuje uopće**. Alat koji bi tada rekao „pojas 4"
  naučio bi studenta da mu vjeruje kad za to nema razloga — isti kvar kao lažni nalaz.

Rubrika **ne uvodi nijednu novu prosudbu**: svaki kriterij čita artefakt koji već postoji.
Kad bi sama ocjenjivala, ista bi vrijednost postojala na dva mjesta (pravilo 13 primijenjeno
na prosudbu umjesto na brojku). Registar se validira i **odbija kriterij s nepoznatim
čitačem**, da nijedan ne ostane bez izvora.

U `gate.py` je uvršten kao **zadnji, savjetodavni** korak faza `audit` i `predaja` — agregira
artefakte koje su prethodni koraci upravo napisali. Zbog toga `check_rules.py` u gateu sada
piše i `--json .katedra/pravila.json`.

**Dokaz:**

| Stanje | Pojas | Drži ga |
|---|---|---|
| rad bez teze, bez `zadatak.json` i bez izvora | **`nepoznato`** — pojas se odbija procijeniti | Odgovor na zadatak, Izvori |
| rad s tezom, zadatkom i izvorima, 13/13 dijelova | **4** | Odgovor na zadatak, Vlastiti doprinos, Izvori |
| `--cilj 5 --strogo` nad drugim | izlazni kod **1** | |
| `--cilj 4 --strogo` nad drugim | izlazni kod **0** | |

## Namjerna ograničenja

* Sedam dijelova ostaje `nepokriveno`. To je **stanje stvari, ne regresija** — svaki od njih
  u registru nosi zapisano što čovjek gleda, jer nepokriveno ne smije značiti neopisano.
* `provjeri_engleski.py` **ne ocjenjuje kvalitetu prijevoda.** Mjeri suglasje s izvornikom.
  Provjera ispisanih brojeva je ⚠️, ne ❌, jer jezici drukčije slažu rečenicu — lažni nalaz
  je kvar jednake težine kao promašeni.
* `gate.py` **ne pokreće fazu G** ni bilo koju mutaciju. Mutation capability i dalje traži
  eksplicitni `--allow-mutation` i snapshot (pravilo 12).
* Nova os nije prošla formalni B01–B20 audit lanac.
* **Rubrika je generička.** Nijedan profil u registryju nema ključ `ocjenjivanje`, pa
  kriteriji vrijede „na hrvatskim fakultetima općenito", a ne za konkretan kolegij. Mentorova
  stvarna rubrika je jača (pravilo 17) i predaje se s `--registar ./.katedra/rubrika.json`.
* **Rubrika ne vidi četiri stvari** i to se izgovara uz svaki nalaz: je li teza zanimljiva,
  je li literatura relevantna (a ne samo postojeća), zna li mentor o temi više, i je li
  rasprava rasprava. Pojas 5 nije ocjena 5 — to je rad kojemu se na temelju postojećih
  artefakata ne može prigovoriti ništa od onoga što se dade izmjeriti.
* Kriterij `zadatak` provjerava samo da su komponente **zapisane**; njihovu prisutnost u
  dokumentu i dalje mjeri `rad-docx/provjeri_predaju.py --zadatak`, pa bez tog satelita
  ostaje `djelomicno`.
* **Frozen release zapis sada pokazuje na testove kojih u paketu nema.**
  `references/release_v1_audit.json` (v1.0.1, 44/44) veže nalaze AUD-026 i AUD-038 uz
  `tests/regression/test_benchmark_agent_policy.py`, a `benchmark_runner.py` i
  `agent_policy.py` su uklonjeni iz isporuke. Zapis se **namjerno ne dira** — to je frozen
  release-gate contract i njegova vrijednost je upravo u tome da se ne mijenja naknadno.
  Posljedica: ta dva nalaza ostaju provjerljiva samo u razvojnom checkoutu, i to se ovdje
  kaže umjesto da se prešuti.

---

# Što je novo (kolovoz 2026.)

## Praćene izmjene, redline, zatvaranje zamjerki, TOC procjena (v1.2-advisory)

> Certificirani release ostaje **v1.0.1**. Ovo je advisory sloj preko `metadata.extensions`,
> kao i v1.1. Za razliku od v1.1, ovaj nije prošao formalni B01–B20 audit lanac — proizašao
> je iz **jedne** stvarne radne sesije (poboljšanje diplomskog/završnog rada s 66 komentara
> mentorice i 218 neprihvaćenih Track Changes) i validiran je na tom jednom stvarnom radu,
> ne na frozen gold-setu. Tretiraj kao korisno, ne kao jednako čvrsto certificirano.

**Što je dodano, i zašto:**

- **`scripts/revizije.py prihvati`** — otkriveno je da `python-docx`-ov `Paragraph.text`
  tiho preskače tekst unutar `<w:ins>`/`<w:del>` (praćene izmjene nisu izravna djeca `<w:p>`
  u XML-u). Rad s neprihvaćenim izmjenama izgledao je krnj kroz svaku dosadašnju dijagnozu
  — nedostajale su riječi, rečenice su se raspadale usred misli — a to se nije vidjelo dok se
  nije usporedilo sa stvarnim dokumentom u Wordu. Sad je to 0.7a: obavezan korak prije
  `extract_comments.py`/`check_ai_style.py`/bilo kojeg čitanja teksta, kad god rad ima
  neprihvaćene izmjene.
- **`scripts/revizije.py redline`** — korisnik je nakon veće revizije eksplicitno tražio
  vizualni prikaz svega što se promijenilo. `diff_versions.py` postoji, ali proizvodi
  interni tekstualni sažetak, ne dokument za čitanje. Novi izlaz boji izbrisano crveno i
  precrtano, dodano crveno bez precrtavanja — izravno preko fonta, ne Wordovim
  `<w:ins>`/`<w:del>` mehanizmom (čija boja ovisi o postavkama recenzenta).
- **`scripts/revizije.py toc`** — TOC polje pamti posljednji izračunati rezultat kao obične
  odlomke dok korisnik ručno ne pritisne Update Field u Wordu; to je točno rizik na koji je
  mentorica u sesiji izrijekom upozorila. Novi alat procjenjuje brojeve stranica preko
  LibreOffice headless renderiranja + pretrage teksta po stranicama (razlika prema Wordu
  tipično ±1 stranica) — ne zamjenjuje stvarni Update Field, samo sprječava da Sadržaj bude
  očito zastario u međuvremenu.
- **`scripts/zamjerke.py`** — `extract_comments.py` zamjerke otvara, ali do sada nije
  postojao CLI da se zamjerka dokumentirano zatvori s tragom zašto i gdje je riješena;
  zatvaranje se radilo ručnim pisanjem u JSON. `resolve`/`provjeri`/`grupiraj`, plus treći
  status `djelomicno` za zamjerke koje su adresirane ali ostavljaju odluku koju alat ne
  smije donijeti umjesto autora. `grupiraj --po mjesto` gradi kartu premještanja prije nego
  se izvede hrpa strukturnih pomaka odjednom — izvođenje jedne po jedne, redoslijedom iz
  dokumenta, prijašnji je uzrok nove zbrke (premještanje #3 mijenja kontekst koji je #1 već
  pretpostavljao).

**Namjerno spojeno u dvije datoteke, ne četiri.** Paketni proračun broja datoteka
(`tests/unit/test_kontekstni_proracun.py`) bio je već pri stropu prije ovog dodatka; tri
zasebne skripte (prihvati/redline/toc) spojene su u `revizije.py` s tri podnaredbe da stanu u
raspoloživi prostor, a ne zato što bi to bio prirodniji dizajn od tri zasebne datoteke.

**Što NIJE napravljeno:**

- Nijedan formalni regression test (`tests/regression/`) za `revizije.py` ili `zamjerke.py` —
  provjereno je ručno, na jednom stvarnom radu, ne na fixture korpusu.
- `toc` procjena ne zna za prijelome sekcija niti za profilom propisanu rimsku/arapsku
  numeraciju — pretpostavlja jednostavan raspored stranica od prve pronađene stavke nadalje.
- Ne postoji automatska detekcija „ima li rad Track Changes" u 0.1 guardu — korak 0.7a je
  uputa koju treba primijeniti svjesno, ne provjera koja sama okine.

Regression dokaz: nema — v. gore.

## Motor izrade odvojen od kućnog stila (v1.1-motor)

> Certificirani release ostaje **v1.0.1**: `metadata.version` je frozen
> release-gate contract koji `tests/unit/test_release_v1_gate.py` čuva bit-za-bit.
> Sve niže je zapisano u `metadata.extensions`, kao i prethodni advisory slojevi.

`izrada.docx` je do sada bila **jedna** sposobnost vezana na fakultet (`uvjet.fakultet:
fpzg`). To je značilo da drugi fakultet zahtijeva kopiju cijelog motora izrade — točno ono
što željezno pravilo 10 zabranjuje. Sada su dvije:

| Sposobnost | Što nosi | Vezano na fakultet |
|---|---|---|
| `izrada.docx` | motor: petlja do fiksne točke, živa polja, nedjeljivi prikazi, unakrsne reference | **ne** (`rad-docx`) |
| `stil.kucni` | kućni stil: referentni `.docx`, redoslijed dijelova | da (`fpzg-diplomski`) |

Zapis `izrada.docx` nosi i **ugovor s graditeljem**: motor graditelja poziva kao naredbu i
preko okoline mu predaje stanje petlje (`RAD_SADRZAJ`, `RAD_TOC`, `RAD_PRELOMI`). Graditelj
koji o tom stanju ne ovisi natjera petlju da konvergira na brojevima koje dokument ne nosi.

Potvrđeno prihvatnim testom na diplomskom radu od 58 stranica: stari lanac i motor daju
identičan broj stranica, identične brojeve u sadržaju (36 naslova) i identične brojeve u
popisu prikaza. Test je pritom našao deset kvarova u motoru i tri u satelitu.

**Drugi fakultet se od sada dodaje kao novi zapis `stil.kucni`, ne kao novi motor.**

## Četiri formalne odluke u intakeu (v1.1-motor)

Novo u 0.4, za modove 1, 2 i 6, i samo za ono što profil ostavlja otvorenim:
`numeracija`, `sadrzaj`, `tablice_boja`, `unakrsne_reference`. Sve četiri mijenjaju
**paginaciju**, a promjena paginacije poništava stilski prolaz. U sesiji u kojoj su nastale,
sve su četiri bile sadržaj **drugog kruga revizije** koji bi jedno pitanje izbjeglo.

Polja su neobavezna (stanje bez njih radi kao prije), ali ako postoje, moraju biti iz
dopuštenog skupa — izrada ih čita kao naredbu, ne kao prijedlog.

## Savjetodavni put za neadmitiran profil (v1.1-motor)

`faculty_scale_gate.py` odbija fakultet bez dovoljno qualification caseva i **to je
ispravno**. Ali posljedica je bila da `check_rules.py` uopće ne može raditi, `stanje_init.py`
odbija zapisati stanje, i formalne provjere se pišu **rukom** — što željezno pravilo 8
izrijekom ne dopušta. Gate zato ostaje binaran za **admisiju**, ali ne za **uporabu**:

```bash
python3 scripts/profile_resolver.py --fakultet <slug> --profil-datoteka <put>   # nepotvrdeno
python3 scripts/stanje_init.py … --fakultet-izvan-registryja <slug> --ogranicenje "…"
python3 scripts/check_rules.py rad.docx --profil … --strogo   # kad se traži blokiranje
```

Tri uvjeta: profil sam sebe deklarira `nepotvrdeno`, barem jedno zapisano ograničenje, i
nalazi su savjetodavni (izlazni kod 0). Prijelaz na pravi profil je **admisija, ne
prepisivanje**.

## Ograda strukture u planu (v1.1-motor)

`plan_state.py import` je čitao cijeli plan, pa je hodogram (`| 1 | Odobrenje plana |`) i
popis „ručno provjeri" ulazio kao poglavlja rada — pet krugova ispravljanja. Bolji regex
nije rješenje, jer hodogram **jest** tablica s brojem i naslovom; razlika je semantička.
Uvoz sada čita samo područje između `<!-- STRUKTURA:POCETAK -->` i `<!-- STRUKTURA:KRAJ -->`,
a plan bez ograde radi kao prije, uz upozorenje.

## Dva nova željezna pravila (v1.1-motor)

**13. Nijedna izvedena brojka ne postoji na dva mjesta.** `model.py` → `model.json` → proza,
tablice, grafikoni. Udjeli i zbrojevi iz **prikazanih** vrijednosti. `model.prije.json` je
obavezan, jer bez prethodne verzije nema crne liste zastarjelih vrijednosti. Nastalo iz
slučaja u kojemu su dvije vrijednosti u tablici bile matematički pogrešne, a rad je do tada
prošao vizualnu provjeru.

**14. Provjerava se i odgovor na zadatak, ne samo kućni stil.** `.katedra/zadatak.json`
piše mod 1 dok je uputa pred očima, čita ga mod 6.

## Rukopis u markdownu je izvor istine (kolovoz 2026.)

Pisanje ide u `.katedra/poglavlja/NN-naziv.md`, jedno poglavlje po datoteci, a
`.docx` se iz njih SASTAVLJA (`build_docx.py --rukopis`). Obrnuti smjer — Word kao
izvor istine — tražio bi da svaki upis nađe mjesto u tuđem XML-u i pritom ne razbije
unakrsne reference, a to puca na svakom ručnom oblikovanju. Ovako je upis običan
zapis datoteke: verzionira se u gitu, diff se vidi, prekinuta sesija nastavlja se
ondje gdje je stala.

Cijena je poštena i mora se izgovoriti studentu: **ono što dotjera rukom u Wordu
gubi se pri sljedećem sastavljanju.** Tko hoće Word kao izvor istine, ne generira
poglavlja nego dokument samo provjerava i popravlja (`check_rules`, `fix_rules`).

Konvencije su NAMJERNO iste kao u skillu `fpzg-diplomski` (`[[PB]]`, poglavlje po
datoteci), pa se isti rukopis može predati i njemu — on zna kućni stil, Katedrin
generator je rezerva. Dvije konvencije za istu stvar bile bi dvije verzije istine.
Redoslijed poglavlja dolazi iz broja u imenu datoteke; bez njega bi abeceda stavila
zaključak pred uvod, i to je tiha greška koju nitko ne primijeti dok ne otvori
dokument.

Round-trip je pinan testom: rad sastavljen iz rukopisa mora proći `check_rules` po
ISTOM profilu, s tablicom, natpisom, retkom `Izvor:`, popisom i citatom — i prolazi
s nula kršenja.

**Što je sastavljanje odmah otkrilo.** Čim je Katedra počela proizvoditi radove s
popisima i citatima, pravilo „najmanje dvije rečenice po odlomku" počelo je
prijavljivati kršenje na svakom takvom radu: natuknica je jedna rečenica, blok-citat
također. Ni jedno ni drugo nije prozni odlomak. Geometrija proze sada ih izuzima po
STRUKTURNOM signalu (`w:numPr`, stil „List …"/„Quote"), a potrošači koji mjere
sadržaj ih i dalje dobivaju — natuknica jest tekst rada. Isto vrijedi za najavni
redak koji završava dvotočkom: on uvodi popis ili citat i po naravi je jedna
rečenica. Na stvarnom radu nijedan nalaz se nije promijenio.


## Router 4.800 tokena, paket 196 datoteka (kolovoz 2026.)

Mehanika intakea (razrješavanje profila, oblik zapisa stanja, evidence lanac,
defaulti, snapshot, profil autora) treba **jednom, na početku**, a plaćala se u
svakoj poruci jer je stajala u routeru. Naredbe koje moraju okinuti ostale su u
`SKILL.md`; objašnjenja, oblik zapisa i rubni slučajevi otišli su u
`references/intake.md`. Router: **6.590 → 4.822 tokena** (prije cijele runde 10.400).

Stvarni trošak po modu, jer se učitava samo referenca odabranog moda:
audit 7.820, predaja 7.150, pisanje 8.970, novi rad 11.930 tokena.

**Broj datoteka.** Isporuka ne podnosi više od 200; paket ih je imao 201. Spojeno je
ono što je bilo artefakt KRUGOVA rada, ne strukture: `test_rep2_*` u pripadni klaster
(pet datoteka manje) i tri dijela jednog auditnog izvještaja u jedan (dvije manje).
Nijedan test nije izgubljen — broj prikupljenih testova je prije i poslije spajanja
bio identičan, 1187, i to je bila provjera koja je uhvatila dvije pogreške u samom
spajanju: izgubljene `@parametrize` dekoratore i preimenovanje koje je zahvatilo
`subprocess.run`. Oba proračuna — tokeni i datoteke — sada su zamrznuta testom.


## Popravak postojećeg rada (kolovoz 2026.)

`scripts/fix_rules.py` je prvi alat u paketu koji MIJENJA studentov dokument — sve
dosad je samo mjerilo i prijavljivalo. Šest kršenja je čisto mehaničkih (font,
veličina, prored, poravnanje, margine, prijelom pred poglavljem) i student ih je
ispravljao rukom, klik po klik, na dokumentu od pedeset stranica.

Zahvati su tablica `rule_id → funkcija`, a `rule_id` dolazi iz strojnog ugovora
`check_rules.py` — novo pravilo je novi zapis, bez grananja po hrvatskoj prikaznoj
niski. Tri svojstva nisu udobnost nego uvjet postojanja i svako je mutacijski
dokazano:

- **Tekst se ne dira.** Poslije zahvata tekst rada mora biti znak po znak isti; to
  se provjerava, i ako se razlikuje, zapis se odbija i izlazna datoteka briše.
- **Preko izvornika se ne piše bez snapshota.** Koristi se ISTI `review_policy`
  koji već čuva fazu G, dakle provjera ide na hash trenutnog dokumenta, ne na ime
  datoteke — snapshot napravljen pa rad poslije mijenjan nije dokaz nego uspomena.
- **Autorstvo se odbija izrijekom.** Nedostajuće poglavlje, natpis prikaza, izvor
  ispod tablice i oblik citata alat ne dira i kaže zašto, umjesto da prešuti.

Naslovi zadržavaju svoju veličinu (`naslov_poglavlja_pt`): opseg zahvata je isti
onaj koji `check_rules` mjeri kao prozu, pa ujednačavanje ne pojede ono što profil
traži. Na stvarnom EFZG radu: jedino istinito kršenje (11 pt u 16 runova) ispravljeno,
prored i poravnanje upisani u stil, tekst nepromijenjen, preostalih kršenja 0.


## Kontekstni proračun (kolovoz 2026.)

`SKILL.md` se pri aktivaciji učitava **cijeli, svaki put**; reference se učitavaju
tek na zahtjev i po jedna po modu. Router je bio na ~10.400 tokena i rastao je
sustavno, a razlog nije bila neurednost nego test: devet je testova javni ugovor
tražilo baš u `SKILL.md`, pa je svaka nova mogućnost ondje morala dodati odlomak.

Ugovor je premješten s DATOTEKE na DOSTUPNOST (`tests/dokumentacija.py`): sadržaj
smije stajati u bilo kojoj referenci, ali do nje mora voditi put iz `SKILL.md` — i
to se sada provjerava, što prije nije. Router je pao na **≈6.400 tokena**, a
održavateljski sadržaj (routing evali, faculty gate) i mapa paketa otišli su u
`references/razvoj.md` i `references/mapa.md`.

Povijest je izašla iz `references/`: `PROMJENE.md` (≈19.800 tokena, dvostruko više
od cijelog routera) i auditni izvještaji sada su u `docs/`. Dok su stajali među
referencama, jedno slučajno otvaranje pojelo bi petinu konteksta na sadržaj koji za
vođenje rada ne znači ništa.

Granica je zamrznuta testom (`tests/unit/test_kontekstni_proracun.py`): 8.000 tokena
za `SKILL.md`, 6.000 po referenci, changelog ne smije natrag u `references/`, i
nijedna referenca ne smije ostati bez puta iz routera.


## Satelitski skillovi: registar sposobnosti (kolovoz 2026.)

Katedra od početka ima načelo da tuđi kod ne kopira nego poziva. Dok je satelit bio
jedan (`rad-audit`), to je živjelo kao ručno pisan adapter u `engine.py`. S drugim i
trećim (`replikacija-pspp`, `fpzg-diplomski`) isti bi se adapter pisao iznova, a
najvažnije pitanje — **je li satelit uopće instaliran** — ostalo bi obećanje u prozi.
Kad odgovora nema, agent improvizira: napiše brojke bez replikacije ili dokument bez
kućnog stila, i nigdje ne stoji da je nešto izostalo.

`references/vjestine.json` je zato registar sposobnosti koje Katedra treba a ne
posjeduje, a `scripts/vjestine.py` ih razrješava s izlaznim kodom (0 razriješeno,
3 nema satelita, 4 satelit je nepotpun). Načelo 10 je time postalo strojno provjerljivo.
Četvrti satelit je jedan zapis u JSON-u — test drži da se ime satelita ne smije pojaviti
u izvršnom kodu razrješitelja.

Dvije razine povjerenja, jer nisu sve granice iste: `strojno` (Katedra rezultat
interpretira — bez valjanog machine contracta kandidat je nekompatibilan) i `radno`
(satelit proizvodi artefakte koje čita čovjek; provjerava se da deklarirani entrypointi
postoje). Puni opis: `references/vjestine.md`.

**Tko radi `.docx`.** Satelit ima prednost, Katedrin `build_docx.py` je rezerva, a
odluka se donosi pretragom sposobnosti — ne imenom fakulteta u kodu. Dvije skripte koje
pišu `.docx` postoje namjerno; ono što ne smije postojati je nezapisana granica.

**Replikacija brojki.** Redak `usporedba.csv` koji se ne poklapa je nalaz razine A —
jednako težak kao izmišljen izvor, jer je riječ o istoj vrsti pogreške: rad tvrdi nešto
što se ne može pokazati. „PSPP to ne ispisuje" nije neslaganje nego ograničenje.

### Zakrpe koje su stigle iz `fpzg-diplomski`

Uz taj skill dolazi izvještaj o šest kvarova nađenih na obranjenom FPZG radu. Tri se
tiču `rad-audita` (tuđa datoteka, prijavljeno njegovu vlasniku), jedan je bio zatvoren
ranije (opseg se mjerio nad svim odlomcima), a dva su bila otvorena i sada su zatvorena.
Svi imaju isti oblik: **alat je kalibriran na jedan dijalekt, pa rad koji radi nešto
drukčije, ali ispravno, prijavljuje kao pogrešan.**

- **Natpis s dvotočkom.** `hr_text.NATPIS` tražio je samo točku, pa je rad s
  „Tablica 1: Naziv" javljao da nema nijedan prikaz — a onda se ni izvor ni poziv u
  tekstu nisu mogli provjeriti. `check_rules` je razdjelnike već bio proširio, pa su
  dvije datoteke istog paketa različito čitale isti natpis.
- **„Izvor: autor".** Popis vlastitih prikaza bio je doslovan i sadržavao „autora", a
  „autor" mu nije podniz — najkraći i najčešći hrvatski oblik ispadao je iz njega, pa je
  rad u kojem su svi prikazi autorski dobivao tvrdnju da nema nijedan vlastiti. Pravilo
  je sada na korijenu riječi, uz iznimku za tuđe autorstvo („autorski tim HNB-a").
- **Sinonimi su vrijedili samo u jednom smjeru.** Tablica je pisana kao „ključ profila →
  drugi oblici", pa profil koji dio zove „izjava o autorstvu" nije nalazio rad naslovljen
  „Izjava o akademskoj čestitosti" — par koji u tablici postoji, samo obrnuto.
- **„(ako postoje)" se odbacivalo zajedno sa zagradom** i dio se tražio kao obavezan:
  profil je govorio jedno, alat drugo.
- **Ime dijela koje nabraja stavke** („sažetak i ključne riječi") uspoređivalo se u
  cijelosti, a naslov u radu nosi jednu („SAŽETAK").
- **„Tijelo teksta"** traženo je kao doslovan naslov kojeg nijedan rad nema; sada se
  prepoznaje po poglavljima, kao i „razrada".

Mjereno na FPZG rukopisu ispravne strukture: **6 ❌ → 0 ❌** (ostaje ⚠️ za dvije
naslovnice koje se iz teksta ne mogu utvrditi). Stvarni EFZG rad: nepromijenjen, redak
po redak.

**FPZG margine su uklonjene iz profila.** Vrijednost „lijevo 3 cm" nije u Uputama —
profil je to i sam pisao u provenanceu — a obranjeni rad ima 2,54 cm sa sve četiri
strane, pa je svaki ispravan rad dobivao lažno kršenje. Raniji krug je tome ispravio
provenance, ali presuda je i dalje bila pogrešna, samo pošteno objašnjena. Ključ kojeg
nema znači „fakultet ne propisuje"; `null` bi značio „propisuje, ali je vrijednost
neupotrebljiva" i davao ⚠️.

Usput se pokazalo zašto je izmišljena vrijednost preživjela: **zamrznuti gold skup znao
je tvrditi samo vrijednosti**, pa je slučaj `fpzg-left-margin` zamrzavao margine od 3 cm
kao ispravne i gate ih je štitio od ispravka. Gold skup koji ne može izraziti „ovo
pravilo ne postoji" tjera profil da izmisli vrijednost. `faculty_scale_gate` sada
prihvaća i `expected_absent`.

---

## Nezavisni audit i sanacija (kolovoz 2026.)

Paket je prošao nezavisnu adversarijsku reviziju u 20 dimenzija (43 agenta,
svaki nalaz reproduciran pokretanjem koda, zatim skeptik po dimenziji s uputom
da nalaz obori). Od 149 sirovih nalaza 17 je odbačeno, a težina ostatka je
znatno korigirana naniže — završni skup je 132 nalaza, od toga 1 kritičan i 16
visokih. Zatim je 12 izoliranih klastera popravaka, svaki s vlastitim
recenzentom koji je poništavao popravak i provjeravao pada li test bez njega.
**Nijedan od dodanih testova nije bio lažan** (0/51).

Puni izvještaji: `docs/audit.md` (nalazi, strategija, kritika samog audita).

### Što je popravljeno — blokirajuće

- **Mentorove zamjerke istog teksta više ne kolabiraju** (`mentor_feedback_state.py`).
  Dva komentara „Izvor?" spajala su se po normaliziranom tekstu, pa je zatvaranje
  jednoga označavalo oba riješenima i preflight je izlazio s 0. Spajanje sada ide
  po Word `w:comment/@w:id`.
- **`verify_rewrite` čita tablične ćelije i fusnote** — obrisan citat i preokrenuta
  brojka u tablici prolazili su kao „sadržaj očuvan".
- **`geometrija` odlučuje o blokadi nad cijelim skupom, ne nad prvih 5 razlika** —
  rečenica izgubljena nakon pete tiho je prolazila na svakom stvarnom prepisivanju.
- **Lokator sa završnom točkom više ne briše citat** (`str. 41.`) — zamjena autora
  prolazila je kao „citati identično".
- **Obavezni dijelovi traže naslov, ne bilo koji kratki redak** — rad bez Zaključka
  javljao je „0 fali".
- **PLAN GATE**: odobrenje je vezano uz sadržaj plana (hash), `import` ga izričito
  ukida, a nečitljivo `stanje.json` sada zatvara vrata umjesto da ih otvori.
- **`stanje_init` više ne briše nečitljivo stanje bez `--force` i bez kopije.**
- **`engine.py`** ne interpretira zastarjeli `nalazi.json` nakon pada motora, i
  eksplicitan `RAD_AUDIT_HOME` koji ne postoji je greška, a ne tiha zamjena drugim
  motorom (to je bio uzrok dugogodišnjeg pada `test_aud_010`).
- **Crossref**: hrvatski članci s engleskim naslovom u `title[0]` više ne padaju u
  blokirajući `conflict`.
- **Pokrivenost**: dvoautorski unosi više ne daju kontradiktorne nalaze. Na stvarnom
  EFZG radu lažni nalazi su pali s **44 na 14**.
- **Strict evidence gate** ne degradira tiho u „bez provjere izvora".
- **`check_paragraphs`** ne broji zaglavlje i broj stranice kao retke odlomka.
- **`originality_check` računa UNIJU preklapanja** preko svih passagea — doslovno
  prepisan odlomak razlomljen granicom passagea matematički nikad nije mogao doseći
  prag (maksimum `0.5 − 3.5/(n−7)`), pa je mozaično prepisivanje prolazilo kao čisto.

### Regresije uhvaćene u vlastitim popravcima

Recenzenti su u prvom krugu popravaka našli tri nove regresije, sve popravljene:
početak tijela otpuštao se samo na Heading 1 (dokument bez Word Heading stilova
vraćao je NULA odlomaka, na što svaka provjera javlja „uredno"); ćelije tablica
curile su iz naslovnice u tijelo i obarale geometriju proze; pravilo o rednim
brojevima spajalo je obične rečenice. Ćelije su sada eksplicitan kanal
(`ucitaj(..., ukljuci_tablice=True)`) — dobivaju ih provjere očuvanja sadržaja,
ne dobivaju ih mjerenja geometrije.

### Testovi koji nisu mogli pasti

- Release gate je za svaki AUD nalaz provjeravao samo postoji li `def <ime>(` u
  datoteci. Sada node mora biti **stvarno prikupljen** i ne smije nositi
  `skip`/`xfail` marker. Dokazano mutacijom.
- AUD-030 CLI census bio je ručna lista od 27 imena; četiri v1.1 CLI-ja nisu bila
  u njoj, a `export_bibliography.main()` nije pokretao nijedan test (zamjena
  cijelog tijela s `return 0` ostavljala je paket zelen). Census se sada izvodi iz
  datotečnog sustava.

### Novo

- **`scripts/check_placeholders.py`** — `references/predaja.md` je „nijedan
  `[TREBA IZVOR]` ni `[PROVJERI STR.]` nije ostao u tekstu" navodio kao
  blokirajuću stavku, a nijedna skripta to nije provjeravala. Sada provjerava, i
  to u odlomcima, tabličnim ćelijama i fusnotama.

- **`scripts/build_docx.py`** — Katedra do audita nije imala nijedan `Document()`
  ni `.save()`: znala je ocijeniti rad, ali ga nije znala napraviti. Generator radi
  kostur usklađen s profilom (naslovnica, sadržaj kao **Wordovo TOC polje**, popisi
  prikaza, podnožja s poljem `PAGE`, prijelom pred poglavljem, font postavljen i u
  `w:hAnsi` slotu koji pokriva č/ć/ž/š/đ). `--provjeri` pusti `check_rules.py` po
  ISTOM profilu preko vlastitog izlaza; round-trip je pinan testom, pa se razilaženje
  generatora i provjere vidi odmah.

### Drugi krug: što su recenzenti našli u samim popravcima

- **Strojni ugovor `check_rules.py`** — jedini ugovor prema agentu bila je hrvatska
  prikazna niska s vrstom rada interpoliranom u nju („broj poglavlja (seminarski)").
  Testovi su retke tražili po prozi i tiho prestajali provjeravati čim se poruka
  preformulira. Svaki redak sada nosi `rule_id` (putanja u profil, isti ključ koji
  koristi provenance sloj), `severity` kao enum i `lokacije`; rječnik je zamrznut.
- **Numeracija i prikazi dolaze iz profila, ne iz koda.** Generator je bezuvjetno
  radio rimsko-pa-arapsku podjelu i uvijek ubacivao primjer tablice. Prvo je EFZG
  pravilo koje je nametao FPZG-u (čiji profil ga nema), drugo je nametanje tablice
  radu kojem po metodologiji ne treba (B09 već zna da teorijski, doktrinarno-pravni,
  povijesni i pregledni rad ne moraju imati autorov prikaz). `format.numeracija` je
  sada **strukturirano polje** (`prednji_dio`/`tijelo`/`tijelo_pocinje_od`); slobodan
  tekst ostaje podržan kao naslijeđeni oblik, ali propis koji generator ne razumije
  više ne završava u tišini nego u ⚠️ pri gradnji.
- **Klasifikacija naslova je strukturna, ne rječnička.** Tri kruga zaredom pokušavao
  se popis riječi („POPIS LITERATURE", „SAŽETAK"…) i svaki je put ispao ili preuzak
  ili preširok. Sadržajna poglavlja se sada prepoznaju po tome što su **numerirana**
  kad rad numerira poglavlja; aparat nije. Pinano s 26 testova čija su imena namjerno
  izvan svakog dosadašnjeg rječnika.
- **Zasun „popis prikaza" otpušta se po obliku odlomka** (stvarni naslov ili prva
  prozna rečenica), pa rad pisan bez Word stilova više ne guta vlastite natpise, a
  predložak koji unose grupira pod „TABLICE" / „SLIKE" i dalje ne otpušta zasun
  nasred popisa.
- **Praćenje brojki u `diff_versions` vraćeno je na token-lokalno pravilo.** Popravak
  „broj u nabrajanju prati se bez obzira na prag" ovisio je o interpunkciji OKO broja,
  pa je bio asimetričan između dviju uspoređivanih verzija: obično prestrukturiranje
  rečenice javljalo je IZGUBLJENE BROJKE za brojke koje doslovno stoje u novom tekstu.
  Male brojke ostaju dokumentirano ograničenje `diff_versions`, a hvata ih
  `verify_rewrite`, koji je vratar prepisivanja i uspoređuje sve brojke.
- **Putanja izvora u evidence zapisu** (`source_path`) prošla je tri kruga i tek je
  treći ispravan. Doslovan argument s naredbenog retka bio je slijep na drugi cwd;
  apsolutna putanja bila je slijepa na preimenovan, premješten ili kloniran projekt —
  a to je gore, jer je preimenovanje projektne mape normalna radnja. Ishod je u oba
  slučaja bio isti i najgori mogući: podmetnuta datoteka prolazi tiho (exit 0). Sidro
  je sada **sam ledger**: putanja se zapisuje relativno prema projektu koji
  `evidence.jsonl` implicira i čita natrag prema istom korijenu. Izvor izvan projekta
  ostaje apsolutan. Ista rupa bila je i u strict evidence gateu; oba smjera su pinana.

### Podaci fakulteta

FPZG profil je ispravljen prema stvarnim službenim Uputama (opseg diplomskog,
oblik citata, obavezni dijelovi, margine, izvori_min 15 umjesto 30). EFZG i dalje
nema `diplomski` blok — resolver to sada odbija na razini razrješavanja umjesto da
tiho posluži pravila prijediplomskog studija.

### Treći krug: rep od 64 low + 14 nit nalaza

Rep je obrađen po klasterima vlasništva nad datotekama, svaki sa svojim recenzentom.
Od **112 pojedinačnih stavki** 64 su bile zatvorene ranijim krugovima (svaka dokazana
izvođenjem, ne čitanjem), 22 su popravljene, 26 su svjesno odbijene kao skuplje od
kvara. Recenzenti su odbili četiri od pet klastera; ono što su našli bilo je ozbiljno
i nijedan prigovor nije bio formalnost.

Popravljeno u samim popravcima — **sve tri su prekorekcije koje je uveo prethodni krug**:

- **Wordov automatski sadržaj (`w:sdt`)** ulazio je u provjere kao izvor naslova, pa je
  rad kojemu obavezni dijelovi stvarno nedostaju prolazio kao uredan (prije ❌ istinito,
  poslije ✅ lažno). Popravak toga otišao je predaleko u drugu stranu: odlomak sa STILOM
  naslova mogao je ispasti iz svih provjera samo zato što mu tekst sadrži tri točke ili
  tabulator pa broj. Sada stil naslova nadjačava izgled retka.
- **Obrezivanje rednog broja** („gola znamenka ispred točke je redni broj") spajalo je
  „1. dio" i „2. dio" istog djela u isti naslov, pa su dva sveska kolidirala na
  `stable_source_id` — ključu identiteta cijelog evidence modela. Popravak toga počeo je
  odsijecati nazive skupova („Zbornik radova s 3. Hrvatskog kongresa ekonomista" →
  „Zbornik radova s 3"). Pravilo je okrenuto u siguran smjer: znamenka je redni broj osim
  ako iza točke ne počinju podaci o izdavanju (URL/DOI ili „Mjesto: Nakladnik").
- **Odbijanje simboličkih poveznica** proširilo se s alatova `.katedra` na svaki
  roditeljski direktorij, pa je pao posve legitiman studentski setup — `--out
  izvjestaji/gate.json` gdje je „izvjestaji" poveznica na drugi disk. Granica je
  vlasništvo, ne dubina putanje.

Uz to: strop veličine `.docx` dijelova pokriva **sve** XML dijelove paketa (zatvoren
popis od četiri značio je da ista bomba samo preseli u `word/numbering.xml`), a
poništeno pojedino pravilo u profilu (`format.margine_cm.gore: null`) više ne ruši alat
neuhvaćenom iznimkom prije nego što sloj nepoznatih pravila stigne reći svoje — svih 63
poništivih pointera sada daje ⚠️.

### Mrtav kod: što je obrisano, a što nije

Vlasnik je tražio da se obriše sve što doista nema koristi. Sweep to nije radio grepom
nego brisanjem: kopirao je repozitorij, stvarno obrisao svaku kandidat-skriptu i pokrenuo
puni set. Rezultat za četiri imenovana kandidata — `interaction_policy` ruši 9 testova,
`benchmark_runner` 6, `agent_policy` 8, `consistency_check` **27** — i sve četiri nose
zamrznute AUD čvorove. **Nijedna se ne briše.**

Obrisano je ono što je doista bilo mrtvo: `diff_versions._u_nabrajanju` s pripadnim
uzorcima (implementacija povučenog pravila koja je preživjela jedan krug predugo, dok je
uvodni komentar i dalje tvrdio suprotno od koda), `extract_comments.kljuc_teksta`
(spajanje zamjerki po tekstu komentara — uzrok najtežeg nalaza cijelog audita),
`verify_sources.crossref_doi`, `check_argument.broj_citata` i osam zaostalih `.gitkeep`
datoteka. `citation_dialects.SOURCE_TYPES` je **ožičen**, ne obrisan: deklariran i
nekorišten skup je ili ugovor ili smeće, a ovaj je ugovor.

Najteži nalaz sweepa nije mrtav kod nego **benchmark koji nije mogao pasti**.
`benchmark_runner` je naslijeđeni v1 baseline IZVODIO pozivom istog živog
`route_interaction` koji koristi i kandidat, pa su pri kvaru routera oba subjekta padala
zajedno, `comparison.regressions` ostajao je prazan i alat je izlazio 0. Izmjereno na
mutaciji: sa živim baselineom `regressions=0, exit 0` (baseline tiho pao sa 17/26 na
10/26), sa zamrznutim `regressions=7, exit 1`. Baseline se sada čita kao podatak
(`evals/benchmark/legacy_v1_predictions.json`), vezan uz hash gold skupa; zamrznuti
izvještaj AUD-038 ostao je bajt-identičan.

**Suite: 1128 prošlo, 0 palo** (prije audita: 297 prošlo, 1 palo). Uključujući
`test_aud_010`, koji je tri puta ranije odbačen kao „environment-specific", a bio je
stvarna tiha zamjena motora.

### Poznata ograničenja koja ostaju svjesno otvorena

- Ručno otipkan popis sadržaja bez ijednog strukturnog traga (bez `w:sdt`, bez stila
  „TOC N", bez brojeva stranica) ne razlikuje se od popisa naslova bez leksičkog
  pravila. Prepoznaju se svi ostali oblici.
- `diff_versions` ne prati jedno- i dvoznamenkaste brojeve (token-lokalan prag). Njih
  hvata `verify_rewrite`, koji je vratar prepisivanja.
- Rečenica koja počinje znamenkom („…gotova. 45 % njih…") ne dijeli se. Audit je
  izričito odbio predloženi popravak i naložio rješavanje lijevim kontekstom, što je
  implementirano za redne brojeve i propise.
- `plan.json.prikazi` čita se, a nijedna podnaredba ga ne piše; `stanje_schema.md` to
  sada izrijekom kaže, pa je polje objavljeno kao mrtvo umjesto da se pretvara.

---

## Katedra v1.1-advisory — dodaci preko certificiranog v1.0.1 releasea

> `metadata.version` u SKILL.md frontmatteru namjerno **ostaje "1.0.1"** —
> to je frozen release-gate broj koji `tests/unit/test_release_v1_gate.py`
> provjerava. Preciznije rečeno (ispravljeno nakon nezavisne revizije, v.
> `docs/v1_1_dodaci.md` #nezavisna-revizija nalaz 19): gate provjerava
> verzijske stringove i da svaki AUD nalaz u `release_v1_audit.json` ima
> živi `pytest_node` — NE hashira sadržaj certificiranih skripti. Ne može,
> dakle, strukturno primijetiti da je `scripts/verify_sources.py` u ovom
> paketu core-patchan tri puta (v. `#core-patch` niže) — to ostaje vidljivo
> jedino kroz ovaj changelog i git/diff povijest, ne kroz sam gate. Dodaci
> ispod su označeni zasebno preko `metadata.extensions` i **nemaju AUD broj**
> jer nisu provedeni kroz B01–B20 audit/eval gate. Ne mijenjaju nijedan
> postojeći blocking contract. Puni opseg, motivacija i namjerna ograničenja:
> `docs/v1_1_dodaci.md`.

- **NEW-101 (advisory)** — `scripts/originality_check.py`: heuristička provjera
  preklapanja odlomaka rada s ingestiranim B12 evidence izvorima (8-gram
  shingle overlap). Read-only, nikad ne vraća blocking exit kod, nije zamjena
  za institucionalnu plagijat-detekciju.
- **NEW-102 (advisory)** — `scripts/export_bibliography.py`: izvoz
  `.katedra/izvori.json` u BibTeX (.bib) i RIS (.ris). Format-adapter nad
  postojećim `verify_sources.py` izlazom; blocking (invalid/conflict/discovery
  -service) unosi su po defaultu isključeni iz izvoza.
- **NEW-103 (advisory)** — CROSBI/CroRIS dodan kao priznat discovery kanal u
  `source_semantics.py` (alias `crosbi`/`croris`) i u `verify_sources.py`
  HTTP-only provjeri (analogno postojećem Hrčak tretmanu — nema javnog API-ja).
- **NEW-104 (advisory)** — `scripts/grill_me.py` + `references/grill_me.md`:
  opcionalni sokratski stress-test plana prije `plan_state.py odobri`. Ne dira
  `plan_gate.py`; PLAN GATE (B14, AUD-004/AUD-024) ostaje jedini blocking
  preduvjet za odobrenje.

Validacija na stvarnom EFZG završnom radu (61 izvor) i core patch
(`verify_sources.rastavi()`, korisnički autoriziran, tri kruga — v. niže):
v. `docs/v1_1_dodaci.md` #core-patch.

**Krug 2 self-review nalazi (kolovoz 2026., isti dan) — tri dodatna buga
otkrivena samostalnom provjerom vlastitog v1.1 paketa:**

- **Bug A (core, autoriziran)** — `verify_sources.rastavi()` je za
  višeautorske unose vraćao samo prvog autora (`"Payne, J. E., Gil-Alana,
  L. A. i Mervar, A."` → `"Payne"`), tiho gubeći koautore. Potvrđeno na
  stvarnom EFZG radu: **30 od 61 izvora** je imalo izgubljene koautore prije
  patcha. Popravljeno (ovaj popravak je zatim SAM bio djelomična regresija —
  v. krug 3 niže).
- **Bug B (v1.1 vlastiti kod)** — `export_bibliography._bibtex_escape()` je
  escapeao samo `{`/`}`; naslovi sa `%`, `&`, `#`, `_`, `$`, `~`, `^` bi tiho
  slomili LaTeX kompilaciju. Popravljeno punim escapingom.
- **Bug C (test-coverage gap)** — CROSBI/CroRIS footnote grana u
  `verify_sources.provjeri_url()` nikad nije bila izvršena automatskim
  testom. Popravljeno s 3 nova `monkeypatch`-tempeljena testa.

**Krug 3 — nezavisna adversarial revizija (drugi model, izoliran kontekst,
bez uvida u ovu sesiju).** Korisnik je odobrio pokretanje svježeg agenta da
samostalno traži bugove u cijelom v1.1 paketu. Rezultat: **13 potvrđenih
nalaza**, uključujući da je krug 2 Bug A popravak sam bio djelomična
regresija (regex za prezime prihvaćao je samo malu hrvatsku dijakritiku —
strana dijakritika u drugom/trećem koautoru se tiho gubila, a „van der
Berg" je davao „Berg" umjesto punog imena, suprotno tadašnjoj dokumentaciji).
Puni popis svih 13 nalaza i popravaka: `docs/v1_1_dodaci.md`
`#nezavisna-revizija`. Sažetak:

- Core patch #3 u `verify_sources.py`: potpuno prepisan `_izvuci_autore()`
  kao sekvencijalni tokenizator, Unicode-svjestan (hrvatska + strana
  dijakritika rade identično bez posebnog nabrajanja), s podrškom za čestice
  ("van der Berg"), spojena/višerječna prezimena, apostrofe, "i dr."/"et al.".
  Ponovna validacija na istom EFZG radu: broj ispravno prepoznatih
  višeautorskih unosa porastao s 30 na **33**; 12 od 61 autor-polja
  promijenjeno, sve 12 provjereno kao ispravak, nula regresija.
  `_izvuci_autore()` sada vraća i strukturirano `autori: list[str]` polje
  (uz prikazni `autor` string), koje `rastavi()` upisuje u izlazni dict.
  Popravljena i `len(autor) > 60` guard logika (bila je odsijecala ispravno
  parsirane duge popise autora) i naslov-ekstrakcija (tri odvojena propusta:
  naslov s vlastitim ":", časopisni Vol./No./str. rep, višerječni gradovi).
- `export_bibliography.py`: BibTeX/RIS export sada koristi novo `autori`
  polje (BibTeX spaja s `" and "`, RIS piše jedan `AU` redak po autoru — prije
  je spojeni prikazni string pisan doslovno, što se pod stvarnom BibTeX
  gramatikom parsira kao JEDAN autor). `doi`/`url` polja sada prolaze kroz
  `_bibtex_escape()` (prije mrtav-kod ternary nije eskejpao ništa — stvaran
  URL s `%`/`&` je lomio `.bib` kompilaciju). `bibtex_key` dedup sufiks
  popravljen na base-26 (prijašnja `chr()` aritmetika je nakon 26. kolizije
  proizvodila `{`/`|`/`}`, strukturno nevaljan ključ). Docstring/CLI help
  ispravljeni — CROSBI/CroRIS NIJE discovery-service entitet (bio je
  pogrešno naveden kao primjer uz Google Scholar).
- `originality_check.py`: `matched_excerpt` sada centriran oko stvarno
  preklapajućeg shinglea u originalnom tekstu (prije uvijek `text[:200]`,
  tipično vrh cijele-stranice passagea, nepovezano sa stvarnim preklapanjem).
  `--prag` izvan `[0, 1]` sad se odbija s exit 2 (prije: `--prag 50` je tiho
  onemogućio SVAKI nalaz i kršio vlastitu JSON shemu). Dokument s 0
  prepoznatih odlomaka (npr. rimski brojevi umjesto "1. Uvod") sad eksplicitno
  upozorava umjesto tihog "✅ čisto" nakon analize ničega.
- `grill_me.py`: korumpiran/krivo oblikovan `plan_stress_test.json` sad vraća
  kontroliran "❌ ... Što napraviti: ..." (exit 2) umjesto sirovog Python
  tracebacka — usklađeno s `plan_state.py ucitaj()` konvencijom koju je ova
  skripta jedina od četiri v1.1 alata prije kršila.
- Dokumentacijska čišćenja: netočni brojevi testova i međusobno
  kontradiktorne izjave o regresijskom dokazu ispravljeni u ovom dokumentu i
  u `v1_1_dodaci.md`; dodana eksplicitna napomena da promjena `autor` formata
  mijenja `stable_source_id` za izvore bez DOI-ja/URL-a (core B12
  `evidence_model.py` nije diran — ovo je operativna napomena za korisnika,
  ne kod-popravak, v. `v1_1_dodaci.md` nalaz 14).

Regression dokaz (kumulativno, sva tri kruga): `tests/regression/test_efzg_comma_style_citations.py`
(11 testova) + novi `tests/regression/test_independent_review_v1_1_findings.py`
(14 testova) + `tests/unit/test_export_bibliography.py` (14 testova ukupno,
10 novih preko krugova 2-3) + `tests/unit/test_originality_check.py` (8
testova ukupno, 3 nova) + `tests/unit/test_grill_me.py` (5 testova ukupno, 2
nova). Pun pytest nakon sva tri kruga: **297 prošlo**, isti jedan
pre-postojeći nepovezan fail (`test_aud_010_missing_engine_returns_exit_3`,
prisutan i u originalnom v1.0.1 uploadu — nepovezan s bilo kojim od ovih
patcheva).

Formalni JSON schema dodan za oba v1.1 izlaza: `references/originality_schema.json`,
`references/plan_stress_test_schema.json`. Validirano u
`tests/unit/test_v1_1_schema_contract.py` (4 testa) po istom obrascu
kao core B12 evidence/claim sheme u `test_evidence_model_contract.py`.

Frozen gold-set za `originality_check.py`: `evals/quality/originality_cases.jsonl`
(10 slučajeva: doslovno, doslovan citat, lagana izmjena, parafraza, nepovezano,
prekratko, zamijenjeni podaci, djelomično, višestruki izvori, prazan ledger) +
`scripts/originality_eval.py` runner. Regression dokaz:
`tests/unit/test_originality_eval.py` (5 testova, 10/10 gold slučajeva
prošlo). Konkretan nalaz: "lagana izmjena", "zamijenjeni podaci" i "djelomično
ugrađeno prepisivanje" imaju nenulti overlap i uhvatili bi se snižavanjem
`--prag` (bez diranja SHINGLE_N); prava parafraza (overlap 0.000) ostaje izvan
dosega bilo kojeg `--prag`. V. `docs/v1_1_dodaci.md` #eval-set.

---

## Katedra v1.0.1 — production deployment hotfix

- **NEW-014** zatvoren: fresh `Novi rad` workflow sada eksplicitno pokreće `plan_state.py init` prije `plan_state.py import`; dokumentirani slijed više ne pada na čistom projektu.
- **NEW-015** zatvoren: runtime naredbe zadržavaju **project cwd**. Instalirani skill se adresira preko `<KATEDRA_SKILL>/scripts/...`, dok `./rad.docx`, `./.katedra/...` i ostali korisnički artefakti ostaju vezani uz projekt, ne uz install direktorij.
- **NEW-016** zatvoren: puni `SKILL.md` više ne tvrdi da je wizard bezuvjetan; body, frontmatter i B17 routing policy sada imaju isti conditional-wizard contract.
- **NEW-017** zatvoren: production CLI output više ne ispisuje bare `python3 foo.py` ni `../` project putanje; guidance ostaje vezan uz project cwd i eksplicitno adresira `<KATEDRA_SKILL>/scripts/...`.
- Hotfix ne mijenja canonical academic rules ni 44/44 AUD ponašanja; riječ je o deployment/integration korekciji v1.0.0.

Regression dokaz: T-NEW-014-FRESH-PLAN-INIT → `tests/e2e/test_production_deployment_gate.py::test_new_014_fresh_big_work_docs_initialize_plan_before_import`

Regression dokaz: T-NEW-015-PROJECT-CWD → `tests/e2e/test_production_deployment_gate.py::test_new_015_runtime_docs_keep_project_cwd_and_address_skill_scripts_explicitly`

Regression dokaz: T-NEW-016-CONDITIONAL-WIZARD-BODY → `tests/e2e/test_production_deployment_gate.py::test_new_016_full_skill_body_matches_conditional_wizard_policy`

Regression dokaz: T-V1-DEPLOYMENT-SPEC → `tests/e2e/test_production_deployment_gate.py::test_production_agent_skills_spec_discovery_contract`

Regression dokaz: T-NEW-017-CLI-GUIDANCE → `tests/e2e/test_production_deployment_gate.py::test_new_017_production_cli_guidance_never_assumes_skill_cwd`

## Katedra v1.0.0 — final release/audit gate

- Svih **44/44 AUD nalaza** imaju machine-readable status i live pytest node u `references/release_v1_audit.json`.
- **NEW-009** zatvoren: `profile_resolver.py --project-override` help sada točno kaže da prima putanju do JSON datoteke.
- **NEW-010** zatvoren: `references/fakulteti/_resolved_schema.json` formalizira functional resolved profile bez provenancea; provenance ostaje zaseban sidecar, dok canonical input koristi `_schema.json`.
- **NEW-013** zatvoren: release manifest vraća izgubljenu B01/B02 audit traceability i release-known-findings ledger.

Regression dokaz: T-NEW-009-CLI-HELP → `tests/unit/test_release_v1_gate.py::test_new_009_profile_resolver_help_describes_project_override_as_file_path`

Regression dokaz: T-NEW-010-RESOLVED-SCHEMA → `tests/unit/test_release_v1_gate.py::test_new_010_resolved_profile_has_dedicated_schema_contract`

Regression dokaz: T-NEW-013-RELEASE-MATRIX → `tests/unit/test_release_v1_gate.py::test_new_013_release_matrix_covers_all_44_aud_findings_and_live_tests`

Regression dokaz: T-V1-RELEASE-VERSION → `tests/unit/test_release_v1_gate.py::test_v1_release_version_and_known_findings_are_explicit`

## B19 — review safety + reviewer simulation + cross-chapter consistency (0.27.0)

- **AUD-042** — review i mutation capability su strojno odvojene. `consistency_check.py` i `reviewer_simulation.py` su read-only; `engine.py --faza G` zahtijeva eksplicitni `--allow-mutation` i trenutni snapshot/hash dokaz prije poziva motora.
- **AUD-039** — dodan je deterministički reviewer-lens simulator koji spaja argument, evidence gate, cross-chapter consistency i otvorene mentorove zamjerke. To nije LLM/peer-review presuda, nego reproducibilan read-only popis pitanja i rizika.
- **AUD-040** — dodan je cross-chapter claim graph. Trenutni v1 checker prijavljuje dokazive signale: isti claim-anchor s različitim brojkama i isti anchor s obrnutom eksplicitnom negacijom kroz različita poglavlja. S manje od dva poglavlja odbija lažno zelen rezultat.

Regression dokaz: T-AUD-042-MUTATION-BOUNDARY → `tests/regression/test_review_safety_reviewer_consistency.py::test_aud_042_phase_g_runs_only_after_snapshot_and_explicit_authorization`

Regression dokaz: T-AUD-039-REVIEWER-LENSES → `tests/regression/test_review_safety_reviewer_consistency.py::test_aud_039_reviewer_simulation_combines_four_review_lenses_deterministically`

Regression dokaz: T-AUD-040-CROSS-CHAPTER → `tests/regression/test_review_safety_reviewer_consistency.py::test_aud_040_cross_chapter_checker_detects_numeric_and_polarity_conflicts`

## B16 — CLI consistency (0.24.0)

- **AUD-030** — `hr_text.py` je prebačen na standardni `argparse` `main()` contract. `--help` i `-h` sada vraćaju help s exit 0, missing positional i unknown option vraćaju kontrolirani usage error s exit 2, bez tracebacka. Regression census provjerava svih 21 korisničkih CLI entrypointa; library/helper moduli bez korisničkog CLI-ja nisu umjetno pretvoreni u komandne alate.

Regression dokaz: T-AUD-030-CLI-HELP → `tests/regression/test_cli_consistency.py::test_aud_030_every_user_cli_supports_help_without_traceback`

## B15 — State schema + artifact tracking + mentor feedback versioning (0.23.0)

- **AUD-034** — `stanje.json` je sada schema v2 s formalnim `project_state_schema.json`. `state_migrations.py` radi monotoni v1→v2 migration uz byte-for-byte backup u `.katedra/migrations/`; future/unknown schema se odbija bez mutacije. `stanje_init.py --show/--validate/--set` koristi isti migration contract.
- **AUD-035** — dodan je `.katedra/artifacts.json`, `artifact_state.py` i formalni `artifact_manifest_schema.json`. Artifact ID je stabilan po project-relative putanji, svaka sadržajna promjena dobiva novu hash/verziju, a `diff_versions.py --snapshot` sinkronizira snapshot ID s artifact version ID-em. `artifact_state.py status` detektira drift.
- **AUD-006** — `zamjerke.json` je v2 revisioned state s `source_artifact` hash/version metapodacima i history eventima. Ponovni mentorov dokument povećava revision bez gubitka ID/statusa, a `--zatvori` zapisuje `resolved` event. Legacy v1 feedback migrira se pri sljedećoj mutaciji.

Regression dokaz: T-AUD-034-STATE-MIGRATION → `tests/regression/test_state_artifact_mentor_versioning.py::test_aud_034_v1_state_auto_migrates_with_backup`

Regression dokaz: T-AUD-034-FUTURE-SAFETY → `tests/regression/test_state_artifact_mentor_versioning.py::test_aud_034_future_state_version_is_rejected_without_mutation`

Regression dokaz: T-AUD-035-ARTIFACT-VERSIONS → `tests/regression/test_state_artifact_mentor_versioning.py::test_aud_035_snapshots_create_versioned_artifact_manifest_and_detect_drift`

Regression dokaz: T-AUD-006-MENTOR-REVISION → `tests/regression/test_state_artifact_mentor_versioning.py::test_aud_006_mentor_feedback_tracks_source_versions_revision_and_resolution_history`

Regression dokaz: T-AUD-006-LEGACY-MIGRATION → `tests/regression/test_state_artifact_mentor_versioning.py::test_aud_006_legacy_feedback_v1_migrates_on_resolution_without_losing_comment`

Dvije stvari: **rekonstrukcija** onoga što je nedostajalo instaliranoj verziji, i
**alati** izvedeni iz jedne stvarne izrade završnog rada (EFZG, hrvatski APA,
38 stranica, 16 prikaza, 61 izvor).

---

## B14 — Perspective map + plan gate (0.22.0)

- **AUD-024** — završni/diplomski sada imaju project-local `.katedra/perspectives.json` prije outlinea. `perspective_map.py` traži najmanje dvije međusobno različite, sadržajno opisane perspektive; `plan_state.py import` blokira strukturu dok mapa nije spremna. Perspective map može nositi `source_ids` i `evidence_ids`, ali ne zamjenjuje B12/B13 evidence ledger/gate.
- **AUD-004** — uveden je zajednički `plan_gate.py` koji koriste `plan_state.py` i `stanje_init.py`. Neuspješan gate ne može postaviti `plan.json.odobren=true`; izravni `--set plan_odobren=true` više ne zaobilazi machine approval, a završni/diplomski ne mogu u `mod=pisanje` prije odobrenja. `--actor user|full-auto` bilježi autorizaciju tek nakon prolaska gatea; full auto nije bypass.

Regression dokaz: T-AUD-024-PERSPECTIVE-BEFORE-OUTLINE → `tests/regression/test_perspective_map_plan_gate.py::test_aud_024_big_work_outline_import_blocked_before_ready_perspective_map`

Regression dokaz: T-AUD-024-DISTINCT-PERSPECTIVES → `tests/unit/test_perspective_map_policy.py::test_aud_024_perspective_map_requires_two_distinct_perspectives_for_big_work`

Regression dokaz: T-AUD-004-APPROVAL-GATE → `tests/regression/test_perspective_map_plan_gate.py::test_aud_004_approval_does_not_flip_true_when_plan_gate_incomplete`

Regression dokaz: T-AUD-004-STATE-BYPASS → `tests/regression/test_perspective_map_plan_gate.py::test_aud_004_state_true_cannot_bypass_unapproved_plan`

Regression dokaz: T-AUD-004-WRITING-TRANSITION → `tests/regression/test_perspective_map_plan_gate.py::test_aud_004_writing_mode_cannot_be_entered_before_approval`

## B13 — Evidence gates + rewrite safety (0.21.0)

- **AUD-023** — dodan je `evidence_gate.py` i `references/evidence_gate_schema.json`. Gate generira **Source Analysis Matrix** (`claim → evidence → source → page`) bez mutiranja B12 ledgera. `--policy advisory` samo izvještava; `--policy strict` blokira `unsupported`, `conflicted`, `contradicted`, linked `conflict/invalid` source, prazni strict ledger i stale source snapshot.
- **AUD-005** — `verify_rewrite.py` sada može provesti dva neovisna safety preconditiona: `--evidence-gate` koristi B13 strict gate, a `--require-snapshot` potvrđuje SHA-256 pre-rewrite datoteke u project-local `.katedra/verzije.json`. Full-document rewrite contract je: strict evidence gate → snapshot → rewrite → `verify_rewrite --evidence-gate --require-snapshot`.
- B12 `claim_ledger.py validate/report` namjerno ostaje read-only i `unsupported` tamo nije strukturna greška; enforcement pripada samo B13 gateu.

Regression dokaz: T-AUD-023-STRICT-GATE → `tests/regression/test_evidence_gates_rewrite_safety.py::test_aud_023_strict_gate_blocks_unsupported_claim`

Regression dokaz: T-AUD-023-SOURCE-MATRIX → `tests/regression/test_evidence_gates_rewrite_safety.py::test_aud_023_matrix_exposes_source_and_page_locator`

Regression dokaz: T-AUD-005-REWRITE-EVIDENCE → `tests/regression/test_evidence_gates_rewrite_safety.py::test_aud_005_verify_rewrite_blocks_when_evidence_gate_fails`

Regression dokaz: T-AUD-005-SNAPSHOT-PRECONDITION → `tests/regression/test_evidence_gates_rewrite_safety.py::test_aud_005_require_snapshot_blocks_unsnapshotted_document`

## B12 — Page-level evidence + Claim Ledger (0.20.0)

- **AUD-043** — dodani su `evidence_ingest.py`, `evidence_model.py` i `references/evidence_schema.json`. PDF/TXT/MD izvor se veže na B11 `source_id`, a svaki evidence zapis ima deterministički `evidence_id`, fizičku 1-based stranicu, optional page label, passage/char locator, hash teksta i hash source datoteke. Blank/image-only PDF ne prolazi kao uspješan ingest bez teksta.
- **AUD-022** — dodan je persistent `.katedra/claims.jsonl` i `claim_ledger.py` (`add`, `link`, `validate`, `report`). Veze su `supports`, `contradicts`, `contextualizes`; dangling evidence ID i hash-integrity mismatch su strukturne greške. `unsupported` je u B12 report status, ne blocking evidence gate — enforcement ostaje B13.
- `verify_sources.py` sada svakom aktualnom source recordu dodaje stabilni `source_id`. Polje je additive u B11 source schema v1 kako bi stari v1 JSON snapshotovi ostali čitljivi.

Regression dokaz: T-AUD-043-PAGE-LOCATOR → `tests/regression/test_page_evidence_claim_ledger.py::test_aud_043_pdf_ingest_emits_stable_page_level_locators`

Regression dokaz: T-AUD-043-EVIDENCE-INTEGRITY → `tests/regression/test_page_evidence_claim_ledger.py::test_aud_043_tampered_evidence_record_fails_integrity_validation`

Regression dokaz: T-AUD-022-CLAIM-LINK → `tests/regression/test_page_evidence_claim_ledger.py::test_aud_022_claim_ledger_can_link_claim_to_existing_evidence`

Regression dokaz: T-AUD-022-UNSUPPORTED-NOT-GATE → `tests/regression/test_page_evidence_claim_ledger.py::test_aud_022_report_marks_unlinked_claim_unsupported_without_blocking_structure`

## B11 — Source verification semantics + source quality (0.19.0)

- **AUD-021** — `verify_sources.py` sada ima stabilni semantic contract `verified / unverified / conflict / invalid`. `unverified` i provider nedostupnost nisu blocking; `conflict` i `invalid` jesu. DOI koji se razrješava na očito drugo djelo je `conflict`, a offline formalna urednost više se ne predstavlja kao potvrđeno postojanje izvora. JSON output je verzioniran (`schema_version: 1`) i validira se preko `references/source_verification_schema.json`.
- **AUD-025** — uvedena je konzervativna quality taxonomy `A/B/C/D/E/X` i odvojen `discovered_via`. Google Scholar je discovery servis, ne bibliografski source entity. Automatika ne dodjeljuje akademsku klasu ako je ne može dokazati (`needs_classification`).
- **NEW-011 (P1, zatvoren u B11)** — `plan.md` je source verification pokretao s `cd scripts`, pa je `.katedra/izvori.json` mogao završiti uz instalirani skill. Primjer sada zadržava project cwd i poziva `<KATEDRA_SKILL>/scripts/verify_sources.py`.
- **NEW-012 (P1, zatvoren u B11)** — Crossref `type=journal-article` ne dokazuje peer review. Takav izvor može biti `verified` po identitetu, ali quality ostaje `needs_classification` dok nema eksplicitnog dokaza kvalitete.

Regression dokaz: T-AUD-021-SOURCE-STATUS → `tests/regression/test_source_verification_semantics.py::test_aud_021_offline_croatian_book_is_unverified_not_invalid`

Regression dokaz: T-AUD-021-CONFLICT → `tests/regression/test_source_verification_semantics.py::test_aud_021_resolved_doi_with_mismatched_title_is_conflict`

Regression dokaz: T-AUD-025-DISCOVERY-NOT-SOURCE → `tests/regression/test_source_verification_semantics.py::test_aud_025_google_scholar_is_discovery_channel_not_source_entity`

Regression dokaz: T-AUD-025-QUALITY-TAXONOMY → `tests/regression/test_source_verification_semantics.py::test_aud_025_quality_taxonomy_is_explicit_and_complete`

Regression dokaz: T-NEW-011-PROJECT-CWD → `tests/regression/test_source_verification_semantics.py::test_new_011_source_workflow_keeps_project_cwd`

Regression dokaz: T-NEW-012-NO-PEER-REVIEW-GUESS → `tests/regression/test_source_verification_semantics.py::test_new_012_crossref_journal_type_does_not_imply_peer_review`

---
## B10 — Citation architecture (0.18.0)

- `scripts/citation_dialects.py` je jedini parser za `author-year`, `ieee` i
  `legal-footnote`; `hr_text.py` zadržava legacy API kao compatibility wrapper.
- `check_argument.py`, `check_rules.py` i `verify_rewrite.py` više nemaju paralelne
  author-year regexe. IEEE `[1]`, grupe i rasponi ulaze u citatnu gustoću i rewrite
  invariant; pravne DOCX fusnote se broje te tipiziraju kao `law`, `regulation`,
  `court_decision` ili `eu_act`. Tipizacija nije potvrda postojanja izvora — to je B11.
- `citiranje.stil` sada dopušta `legal-footnote`, a resolved profil određuje dialect
  u argument/rewrite workflowu.

Regression dokaz: T-AUD-019-CITATION-DIALECTS → `tests/regression/test_citation_architecture.py::test_aud_019_ieee_document_is_counted_in_argument_density`

Regression dokaz: T-AUD-019-REWRITE-IEEE → `tests/regression/test_citation_architecture.py::test_aud_019_verify_rewrite_blocks_lost_ieee_reference`

Regression dokaz: T-AUD-020-LEGAL-FOOTNOTE → `tests/regression/test_citation_architecture.py::test_aud_020_legal_footnote_is_counted_and_typed`

## 1. Rekonstruirano

Instalirana `katedra` sadržavala je **samo `SKILL.md`**. Mape `references/` i
`scripts/` nisu postojale, pa modovi 1, 2, 4, 5 i 6 nisu imali što učitati ni
pokrenuti — routing tablica upućivala je na datoteke kojih nema.

Sadržaj je rekonstruiran iz triju skillova koji su ionako pokrivali isti posao
(`plan-i-program`, `fpzg-skill-pisanje`, `radpilot`), pa su ta tri pretvorena u
tanke aliase.

| datoteka | odakle |
|---|---|
| `references/plan.md` | `plan-i-program` (sekcije 0–11, metoda, skaliranje) |
| `references/pisanje.md` | `fpzg-skill-pisanje` (struktura odlomka, citiranje, radni modovi, self-check) |
| `references/obrana.md` | novo (12 slajdova, tempirani scenarij, 15 pitanja, slabe točke, 5 brojki) |
| `references/predaja.md` | novo (preflight, hodogram unatrag, Turnitin) |
| `references/stanje_schema.md` | novo (točan oblik `stanje.json`, `plan.json`, `zamjerke.json`, `verzije.json`) |
| `references/fakulteti/` | novo: `_schema.json`, `index.json`, `efzg.json` (**potvrđeno**), `fpzg.json` (**nepotvrđeno**) |

**`fpzg.json` ima `status: nepotvrdeno`** — pravila su prenesena iz starog skilla, nisu
pročitana iz službenog PDF-a. Dok se ne potvrde, svako formalno pravilo u isporuci ide
uz oznaku „za potvrdu". Skripte to same rade.

### Nove skripte

| skripta | čemu služi |
|---|---|
| `stanje_init.py` | stvara i **validira** `.katedra/stanje.json`; slug fakulteta protiv registryja, `mod=audit` bez rada se odbija |
| `plan_state.py` | `plan.json` — `import` iz plan.md, `next`, `mark`, `status`, `odstupanje`, `odobri` |
| `check_rules.py` | .docx protiv profila fakulteta: font kroz 4 sloja, margine, prijelomi, obavezni dijelovi, prikazi, oblik citata |
| `check_argument.py` | teza, zatvaranje kruga uvod↔zaključak, proporcije, vlastiti doprinos, deskriptivnost, citatna gustoća |
| `verify_sources.py` | DOI → Crossref, naslov → Crossref uz sličnost, URL → HTTP; `--offline`, `--pokrivenost` |
| `extract_comments.py` | komentari i tracked changes iz `word/comments.xml` → `zamjerke.json`, bez gubitka ručno zatvorenih |
| `diff_versions.py` | snapshot sa sha256, usporedba po odlomcima, **izgubljeni citati i brojke** |
| `user_profile.py` | `~/.katedra/profil.json`, samo nazivi nalaza i brojači — nikad tekst rada |

---

## 2. Alati iz stvarne izrade rada

| datoteka | čemu služi |
|---|---|
| `scripts/hr_text.py` | zajednički sloj: segmentacija rečenica koja poštuje hrvatske redne brojeve i kratice, hrvatska kolacija (C < Č < Ć, D < Đ, S < Š, Z < Ž), prepoznavanje zagradnih i narativnih citata |
| `scripts/check_ai_style.py` | tragovi generiranog teksta u 4 dimenzije: fraze, ritam, kohezija, glagoli atribucije |
| `scripts/check_paragraphs.py` | geometrija odlomaka u **stvarnom prijelomu** (render docx→pdf), ne po procjeni znakova |
| `scripts/verify_rewrite.py` | harness za delegirano prepisivanje; 3 načina (`stil`, `lomljenje`, `geometrija`) |
| `references/stil_pipeline.md` | pipeline, pragovi, predložak za subagenta |

### Ispravljen bug u `hr_text.py`

`CITAT_ZAGRADNI` nije prepoznavao **nijedan citat s oznakom stranice** —
`(Čavlek, 1998., str. 41)`, `(Hall i sur., 2018.: 7)` — jer uhvaćena skupina mora
završiti godinom. To je najčešći oblik citata u hrvatskim radovima i doslovno propisani
oblik u EFZG profilu.

Posljedica je bila ozbiljnija nego kriva statistika: `verify_rewrite.py` **ne bi
prijavio da je takav citat nestao tijekom prepisivanja**, a upravo to je razlog zbog
kojeg harness postoji (pravilo 4).

Popravljeno centralno: `kljucevi_citata()` i `godine_u_citatima()` sada tekst propuštaju
kroz novu `bez_lokatora()`. Provjereno: uklanjanje `(Čavlek, 1998., str. 41)` iz odlomka
sada daje blokirajući nalaz umjesto tihog prolaza.

Regression dokaz: T-AUD-007-HR-CITATION-LOCATOR → `tests/regression/test_hr_text_regressions.py::test_locator_citation_is_counted_and_keyed`

---

## 3. Arhitektura: motor i ljuska

Faze A–G (citati, brojke, tipografija, Word polja) **nisu u Katedri**. Vlasnik im je
skill `rad-audit`, koji radi u dva načina:

- **SOLO** — vlastiti wizard, korisnik ga zove izravno
- **MOTOR** — zove ga Katedra kroz `scripts/engine.py`, wizard se preskače, izvještaj ide u `.katedra/nalazi.json`

`engine.py` razrješava gdje je motor (`RAD_AUDIT_HOME` → susjedni skill → `~/.claude/skills/`
→ plugin), a od B05 kompatibilnost provjerava **isključivo verzioniranim contractom**:

| izlazni kod | značenje |
|---|---|
| 0 | motor nađen i kompatibilan s contractom v1 |
| 4 | kandidat postoji, ali `engine_contract.json` / capabilities / `DocumentAuditResult` nisu kompatibilni |
| 3 | motora nema → smanjeni opseg, deklariran u stanju |

Katedra više ne traži implementacijske stringove unutar Python sourcea motora.

Podjela: **rad-audit provjerava dokument, Katedra provjerava rad.** Motor ne zna ništa
o profilu fakulteta, tezi ni planu; Katedra ne dira XML.

---

## 4. Ovisnosti

`python-docx` (obavezno), `pdftotext` iz Popplera i LibreOffice (za render pri mjerenju
odlomaka), mreža za `verify_sources.py`. Bez rendera `check_paragraphs.py` prelazi na
procjenu (84 znaka po retku za TNR 12 / prored 1,5 / margine 2,54 cm) i to izrijekom javlja.
Bez mreže `verify_sources.py --offline` radi formalnu provjeru.

## 5. Brza provjera nakon instalacije

```bash
cd scripts
python3 engine.py --provjeri                                  # je li rad-audit dostupan i contract-kompatibilan
python3 <KATEDRA_SKILL>/scripts/stanje_init.py --validate                             # ako .katedra/ već postoji
python3 check_rules.py ../rad.docx --fakultet efzg --tip zavrsni
python3 check_argument.py ../rad.docx
python3 check_ai_style.py ../rad.docx
```

---

## B01 — testability bootstrap

- **AUD-015** — unit/integration/regression/e2e/fixtures i eval lanes su obavezni release contract.
- **AUD-031** — `pyproject.toml` deklarira runtime i dev dependencyje za reproducibilan setup.
- **AUD-032** — SKILL frontmatter ima semver, schema, runtime i compatibility metadata usklađenu s `pyproject.toml`.

Regression dokaz: T-AUD-015-TEST-EVAL-LANES → `tests/unit/test_bootstrap_contract.py::test_aud_015_test_and_eval_lanes_exist`

Regression dokaz: T-AUD-031-DEPENDENCY-MANIFEST → `tests/unit/test_bootstrap_contract.py::test_aud_031_pyproject_declares_runtime_and_dev_dependencies`

Regression dokaz: T-AUD-032-VERSION-SCHEMA → `tests/unit/test_bootstrap_contract.py::test_aud_032_skill_frontmatter_has_version_schema_and_compatibility_contract`

---

## 6. B02 — architecture regression contracts

Batch B02 ne mijenja runtime ponašanje. Dodani su automatski contracts koji čuvaju
tri postojeće arhitektonske odluke:

- **AUD-001** — `SKILL.md` ostaje mali orkestrator; detaljni workflowi ostaju u `references/`, a izvršiva logika u `scripts/`.
- **AUD-002** — Katedra ostaje ljuska/adaptor oko `rad-audit`; poznate pipeline datoteke motora ne smiju se kopirati u Katedru.
- **AUD-007** — zatvoreni regression bugovi u ovom changelogu dobivaju stabilan test ID i konkretan pytest node koji se automatski provjerava.

Structural contracts: `tests/unit/test_architecture_invariants.py`.

Regression dokaz: T-AUD-001-PROGRESSIVE-DISCLOSURE → `tests/unit/test_architecture_invariants.py::test_aud_001_progressive_disclosure_remains_modular`

Regression dokaz: T-AUD-002-RAD-AUDIT-BOUNDARY → `tests/unit/test_architecture_invariants.py::test_aud_002_rad_audit_pipeline_is_not_duplicated_in_katedra`
---

## 7. B03 — project state isolation

Project-local state više se ne derivira iz instalacijske putanje skilla. Novi
`scripts/context.py` centralizira rezoluciju s precedenceom:

`--kat` → `--project-root` → `KATEDRA_PROJECT_ROOT` → `cwd/.katedra`.

`stanje_init.py`, `plan_state.py`, `diff_versions.py` i default state putanje u
`extract_comments.py` koriste isti resolver. `user_profile.py` ostaje namjerna
iznimka: `~/.katedra/profil.json` je profil autora između radova, ne projektni state.

Workflow dokumentacija više ne mijenja `cwd` u instalirani `scripts/` prije poziva
project-state alata; primjeri koriste `<KATEDRA_SKILL>/scripts/...` dok `cwd` ostaje
korijen rada.

Regression dokaz: T-AUD-008-PROJECT-ISOLATION → `tests/integration/test_project_state_isolation.py::test_default_state_is_isolated_per_project`

Regression dokaz: T-AUD-003-STATE-RESUME → `tests/integration/test_project_state_isolation.py::test_existing_project_state_resumes_from_cwd`


---

## 8. B04 — profile correctness quick wins

Tri auditna correctness problema sada imaju jedan zajednički flat-profile adapter
`scripts/profile_rules.py` (`ResolvedRules`). Ovo nije B07 compositional resolver: čita samo
već odabrani JSON profil i uklanja različite tihe defaultove između alata.

- **AUD-009** — `engine.py` čita `format.odlomak` i `format.prijelom_pred_poglavljem`,
  umjesto pogrešne top-level razine.
- **AUD-011** — ako profil definira više vrsta rada, `check_rules.py` zahtijeva eksplicitni
  `--tip`; jedini tip iz profila i dalje se može sigurno inferirati. Copy-paste workflowi
  sada uvijek šalju `--tip`.
- **AUD-029** — `check_paragraphs.py` nema globalni tihi 5/12 default. Pragovi dolaze iz
  `--profil` → `format.odlomak`, dok su `--min/--max` samo eksplicitni override.

Regression dokaz: T-AUD-009-NESTED-FORMAT → `tests/regression/test_profile_correctness.py::test_aud_009_engine_reads_nested_format_rules`

Regression dokaz: T-AUD-011-WORK-TYPE → `tests/regression/test_profile_correctness.py::test_aud_011_multiple_work_types_require_explicit_tip`

Regression dokaz: T-AUD-029-PARAGRAPH-PROFILE → `tests/regression/test_profile_correctness.py::test_aud_029_paragraph_thresholds_come_from_profile`

---

## 9. B05 — rad-audit interface contract

Granica prema zasebnom `rad-audit` motoru više ne ovisi o source-code markerima ni
hardkodiranom `generate_report.py`. Motor mora izložiti `scripts/engine_contract.json`
s `contract_version`, `engine`, `engine_version`, `capabilities` i entrypointima.
Katedra zahtijeva contract v1 i deklarirane hrvatske reliability capabilities.

Puni `--json` audit mora proizvesti verzionirani `DocumentAuditResult` s istim
engine identitetom te poljima `capabilities`, `findings`, `counts` i
`phase_exit_codes`. Legacy/malformed rezultat se ne interpretira i završava exitom 4.

`--profil` ostaje Katedrin kontekst i ne prosljeđuje se motoru. Formalna
specifikacija: `references/rad_audit_contract.md`; runtime validator:
`scripts/rad_audit_contract.py`.

Regression dokaz: T-AUD-010-RAD-AUDIT-CONTRACT → `tests/regression/test_rad_audit_contract.py::test_aud_010_valid_document_audit_result_is_interpreted`

Regression dokaz: T-AUD-033-CAPABILITY-HANDSHAKE → `tests/regression/test_rad_audit_contract.py::test_aud_033_manifest_capabilities_replace_source_marker_scanning`

---

## 10. B06 — EFZG known false-positive regressions

Tri prethodno dokumentirana EFZG false positivea u `check_rules.py` sada su
reproducirana stvarnim DOCX fixtureima i popravljena bez gašenja true-positive detekcije:

- **AUD-014 / poglavlja** — `POPIS LITERATURE`, `POPIS TABLICA`, `POPIS SLIKA` i srodni završni popisi više se ne broje kao sadržajna Heading 1 poglavlja.
- **AUD-014 / prikazi** — retci poput `Tablica 1. ...` unutar regije popisa tablica/slika/grafikona više se ne tretiraju kao stvarni natpisi koji zahtijevaju vlastiti redak `Izvor:`.
- **AUD-014 / veličina fonta** — ocjenjuje se efektivna glavna proza; naslovnica, naslovi, tablične ćelije, `Izvor:` retci i potpuno nadjačani `docDefaults` više ne proizvode false-positive kršenje veličine proznog fonta.

Regression dokaz: T-AUD-014-CHAPTER-LISTS → `tests/regression/test_efzg_known_false_positives.py::test_aud_014_content_chapter_count_excludes_back_matter_lists`

Regression dokaz: T-AUD-014-DISPLAY-LISTS → `tests/regression/test_efzg_known_false_positives.py::test_aud_014_list_entries_are_not_treated_as_real_display_captions`

Regression dokaz: T-AUD-014-FONT-CONTEXT → `tests/regression/test_efzg_known_false_positives.py::test_aud_014_legitimate_non_body_font_sizes_do_not_fail_body_font_rule`


---

## 11. B07 — compositional profile resolver

Flat `faculty.json + ručno održavan index.json` model zamijenjen je determinističkim
resolverom. Canonical faculty profil ostaje baza, a specifična pravila dolaze iz
`references/fakulteti/overlays/*.json` po precedenceu:

`global → institution → faculty → programme → work_type → course → mentor → project_override`.

- **AUD-012** — `profile_rules.py` sada ima composition API; RFIR seminarski je prvi
  production overlay i strojno nadjačava EFZG bazu za citatni oblik, page-break i
  seminarsku strukturu. Više overlayja iste razine za isti kontekst je greška.
- **AUD-027** — `RFIR` je programme route (`faculty=efzg`, `programme=rfir`), ne
  ručno kopirani faculty alias. `check_rules.py --fakultet RFIR --tip seminarski`
  koristi resolved profil.
- **AUD-028** — `index.json` je generated registry v2. `profile_registry.py --check`
  otkriva drift, a `--write` ga deterministički regenerira iz canonical profila i
  overlay aliasa. `status`, `provjereno`, naziv i aliasi više se ne održavaju ručno
  na dva mjesta.
- **NEW-008 (P1, zatvoren u B07)** — stari ručni registry sadržavao je javne aliase
  `Poslovna ekonomija` i `novinarstvo` koji nisu bili u canonical profilima. Dodani
  su u odgovarajuće canonical alias liste prije prelaska na generated registry.

Regression dokaz: T-AUD-012-PRECEDENCE → `tests/regression/test_compositional_profile_resolver.py::test_aud_012_composition_uses_declared_layer_precedence`

Regression dokaz: T-AUD-012-RFIR-OVERLAY → `tests/regression/test_compositional_profile_resolver.py::test_aud_012_rfir_seminarski_is_machine_readable_override`

Regression dokaz: T-AUD-027-RFIR-ROUTE → `tests/regression/test_compositional_profile_resolver.py::test_aud_027_generated_registry_routes_rfir_to_programme_context`

Regression dokaz: T-AUD-028-GENERATED-REGISTRY → `tests/regression/test_compositional_profile_resolver.py::test_aud_028_registry_is_exactly_generated_from_canonical_sources`

Regression dokaz: T-NEW-008-LEGACY-ALIASES → `tests/regression/test_compositional_profile_resolver.py::test_new_008_legacy_public_aliases_remain_routable_after_generated_registry`


---

## 12. B08 — rule provenance + freshness

Faculty i overlay vrijednosti ostaju običan functional JSON; dokazni sloj je zaseban
`provenance` sidecar. `provenance.default` pokriva rule leaves, a
`provenance.rules` može preciznije označiti najbliži JSON Pointer. Resolver prenosi
vrijednost i provenance zajedno kroz isti precedence.

- **AUD-013** — svaki production rule leaf pod `citiranje`, `format`, `struktura`,
  `predaja` i `obrana` ima source/type/confidence provenance. EFZG
  `/format/odlomak/min_redaka` je eksplicitno `derived` (confidence 0.65), a FPZG
  default je `inferred` jer je profil prenesen iz ranijeg skilla. RFIR overlayi imaju
  vlastiti provenance umjesto nasljeđivanja EFZG izvora za nadjačana pravila.
- **AUD-041** — `provenance_report.py` je read-only freshness gate. `stale`, `unknown`
  i `untracked` signaliziraju ručnu provjeru; report nikada sam ne mijenja
  `status`, `verified_at` ni profil. Policy je eksplicitan preko `--as-of` i
  `--max-age-days`.

Regression dokaz: T-AUD-013-PROVENANCE-COVERAGE → `tests/regression/test_rule_provenance_freshness.py::test_aud_013_production_resolved_profiles_have_full_rule_provenance_coverage`

Regression dokaz: T-AUD-013-DERIVED-RULE → `tests/regression/test_rule_provenance_freshness.py::test_aud_013_known_efzg_derived_rule_is_not_presented_as_explicit`

Regression dokaz: T-AUD-041-STALE-READONLY → `tests/regression/test_rule_provenance_freshness.py::test_aud_041_freshness_cli_marks_old_rules_stale_without_mutating_profile`

Regression dokaz: T-AUD-041-PUBLIC-CONTRACT → `tests/regression/test_rule_provenance_freshness.py::test_aud_041_public_contract_flags_stale_without_reclassifying_profile_status`

---

## B09 — methodology-aware argument validation

`check_argument.py` više ne pretpostavlja da svaki završni/diplomski mora imati empirijsko poglavlje ili autorovu tablicu/grafikon.
Metodološki policy resolvea se `--metodologija` → `profil.metodologija.type` → neutralni `generic`.
Teorijski, doktrinarno-pravni, povijesni i pregledni radovi mogu imati tekstualni/konceptualni doprinos bez negativnog nalaza zbog odsutnosti prikaza. Kvantitativni/mixed radovi zadržavaju relevantan empirijski signal, ali odsutnost prikaza je samo ⚠️ i nikad dokaz da je rad „seminar”.

`deskriptivnost` je od B09 soft leksički signal: uzročnost nije jedini oblik analize; kontrast, usporedba, konceptualno razlikovanje, inferencija i evaluacija također se priznaju. Jedan takav signal sam nikad ne daje ❌.

Regression dokaz: T-AUD-017-METHODOLOGY-POLICY → `tests/regression/test_methodology_aware_argument_validation.py::test_aud_017_theoretical_work_without_displays_is_not_penalized_as_missing_contribution`

Regression dokaz: T-AUD-017-QUANTITATIVE-SIGNAL → `tests/regression/test_methodology_aware_argument_validation.py::test_aud_017_quantitative_work_keeps_method_relevant_empirical_signal`

Regression dokaz: T-AUD-018-SOFT-DESCRIPTIVENESS → `tests/regression/test_methodology_aware_argument_validation.py::test_aud_018_high_absence_of_analytical_signals_is_soft_warning_not_hard_failure`


---

## B17 — trigger + workflow eval system

- **AUD-016** — frontmatter i runtime više ne proturječe: wizard je obavezan samo za fresh + neodređen ulaz; postojeće stanje, direktni mod i dovoljno kompletan kontekst ga preskaču.
- **AUD-036** — `evals/triggers/cases.jsonl` je frozen gold skup za `activate`, `delegate` i `ignore`; `scripts/eval_runner.py --lane triggers` je strojni regression gate.
- **AUD-037** — `evals/workflows/cases.jsonl` pokriva svih šest modova, existing-state resume, sufficient-context skip, delegation i ignore; očekivanja uključuju mode, wizard, referencu i first action.
- `scripts/interaction_policy.py` je deterministički intended-behavior oracle. B17 ne tvrdi da je host LLM benchmarkiran; B18 smije isti gold skup koristiti za model/cross-version benchmark.

Regression dokaz: T-AUD-016-CONDITIONAL-WIZARD → `tests/regression/test_trigger_workflow_evals.py::test_aud_016_frontmatter_and_policy_agree_wizard_is_conditional`

Regression dokaz: T-AUD-036-TRIGGER-EVALS → `tests/regression/test_trigger_workflow_evals.py::test_aud_036_trigger_eval_lane_is_nonempty_and_machine_runnable`

Regression dokaz: T-AUD-037-WORKFLOW-EVALS → `tests/regression/test_trigger_workflow_evals.py::test_aud_037_workflow_eval_lane_covers_wizard_skip_and_all_six_modes`

---

## B18 — cross-version benchmark + agent complexity gate

- **AUD-038** — B17 frozen trigger/workflow gold skup sada ima reproducibilan
  `deterministic_contract` benchmark. `legacy_v1_frontmatter_contract` modelira
  auditiranu staru kontradikciju „aktivirani zahtjev uvijek prvo prikazuje wizard”,
  dok `current_v2_contract` koristi aktualni `interaction_policy.py`. Frozen report
  `evals/benchmark/v1_vs_v2_contract.json` mora biti identičan svježem runu na istom
  dataset hashu. B18 rezultat: legacy **17/26**, current **26/26**, 9 recovered, 0 regresija.
  Ovo nije tvrdnja o host-LLM performansama.
- **AUD-026** — default ostaje `single_orchestrator`. `scripts/agent_policy.py` odbija
  agentic/swarm prijedlog bez zasebnog benchmarka protiv single-orchestrator baselinea,
  materijalnog dobitka, najmanje dva recovered slučaja, nula regresija te izmjerenih
  cost/latency omjera unutar versioned policyja `evals/benchmark/agent_policy.json`.
  Trenutni v1→v2 report nije agentic benchmark i zato `current_agent_decision.json`
  ostaje eksplicitno `reject_agentic`.

Regression dokaz: T-AUD-038-V1-V2-BENCHMARK → `tests/regression/test_benchmark_agent_policy.py::test_aud_038_cross_version_contract_benchmark_is_machine_runnable`

Regression dokaz: T-AUD-038-FROZEN-REPORT → `tests/regression/test_benchmark_agent_policy.py::test_aud_038_frozen_benchmark_report_matches_fresh_runner`

Regression dokaz: T-AUD-026-AGENT-GATE → `tests/regression/test_benchmark_agent_policy.py::test_aud_026_agent_policy_rejects_swarm_without_benchmark`

Regression dokaz: T-AUD-026-MATERIAL-GAIN → `tests/regression/test_benchmark_agent_policy.py::test_aud_026_agent_policy_accepts_only_measured_material_gain`


---

## B20 — faculty scale-out gate

- **AUD-044** — novi faculty profil više ne ulazi u production routing samim dodavanjem JSON-a. `_support_catalog.json` je admission allowlist, a svaki admitted profil nosi hash cijelog faculty bundlea (base + pripadni overlayi), tier i hash readiness dokaza.
- `scripts/faculty_scale_gate.py` provjerava profile schema, status, provenance coverage/freshness, alias/routing, frozen faculty-specific quality slučajeve i stabilnost B18 core benchmarka. `production` traži potvrđen profil; `pilot` može ostati nepotvrđen, ali ne smije imati untracked provenance.
- `evals/quality/faculty_cases.jsonl` je frozen qualification lane. Trenutni bootstrap je napravljen kroz isti gate: **EFZG = production**, **FPZG = pilot**. B20 ne dodaje novi fakultet samo radi scale demonstracije.
- `profile_registry.py` odbija stale admission ako se nakon gatea promijeni base profil ili pripadni overlay; novi neadmitted `<slug>.json` ne pojavljuje se u generated registryju.

Regression dokaz: T-AUD-044-ADMISSION-GATE → `tests/regression/test_faculty_scale_out_gate.py::test_aud_044_production_profiles_are_admission_gated`

Regression dokaz: T-AUD-044-PRODUCTION-READINESS → `tests/regression/test_faculty_scale_out_gate.py::test_aud_044_efzg_passes_production_readiness`

Regression dokaz: T-AUD-044-NO-JSON-SCALEOUT → `tests/regression/test_faculty_scale_out_gate.py::test_aud_044_new_json_alone_does_not_enter_registry`

Regression dokaz: T-AUD-044-STALE-ADMISSION → `tests/regression/test_faculty_scale_out_gate.py::test_aud_044_admission_becomes_stale_after_profile_bundle_change`

## Nakon eseja Milidragović (kolovoz 2026.)

Izvor je usporedba isporučenog rada i verzije koju je studentica uredila u Wordu: pet
ručnih zahvata, tri tipografske regresije, jedna netočna referenca stranice — i jedina
poruka koju je lanac proizveo bila je lažna.

- **mod 7 — povratak iz Worda** (`references/povratak.md`). Modovi 1–6 vode rad do predaje
  i tu ga ispuštaju; sve postojeće provjere gledaju dokument sam za sebe, pa regresiju
  nastalu ručnim uređivanjem ne mogu vidjeti. Motor je `rad-docx/scripts/provjeri_povratak.py`.
- **glas autora** (`references/stil_autora.md`, `.katedra/stil_autora.json`). Ono što autor
  svaki put popravi za nama pamti se i čita prije pisanja. Sve su izmjene na tom radu išle
  u istom smjeru: jednostavnija interpunkcija, manje ograda.
- **`scripts/provjeri_sazetak.py`** (kvar 30). Sažetak protiv rada: broj poglavlja, pojmovi,
  brojke, ključne riječi, parnjak u zaključku. Proturječje ne mjeri nego ispisuje paritetnu
  tablicu; duge se rečenice sažetka razlažu na tvrdnje jer bi inače pogodak uvijek padao na
  prvu i najčešću.
- **željezna pravila 15–18**: rad se prati i nakon isporuke; glas se pamti, ne pogađa;
  uzorak mentora jači je od profila; korisnikov zadani opseg jači je od nepotvrđenog
  raspona iz profila.
- **`fpzg.json`**: vrsta rada „esej"; `/primjerci` s dvije stvarne opservacije koje si
  proturječe (margine); `_razina_nalaza` — nepotvrđen raspon daje ⚠️, ne ❌.
- **`check_rules.py`**: `provjeri_opseg` prima `zadano_korisnikom` i poštuje razinu nalaza.

- **Preimenovanje u `katedra-lite`.** Paket je objavljen pod novim imenom da ne prepiše postojeću instalaciju skilla `katedra`. Stanje projekta ostaje u `.katedra/`, pa se započeti radovi nastavljaju. `tests/` i `evals/` nisu u paketu (ograničenje broja datoteka); za razvoj skilla uzmi puni paket.

## v1.9.1 — lokator [PROVJERI STR.] je citat (2. 9. 2026.)

- `citation_dialects.LOKATOR` prepoznaje `(Autor, 2020: [PROVJERI STR.])` i `, str. [PROVJERI STR.]` kao lokator; `check_argument` je na FPZG seminarskom s 24 citata javljao „3 citata, RASPRAVA i ZAKLJUČAK bez citata" samo zato što stranice još nisu bile potvrđene. Mjereno: 3 → 24 citata, 0 poglavlja bez citata; HKS (Vancouver) i FPZG autor-godina regresija nepromijenjeni.

## v1.9.1 — build_docx: SEQ natpisi, popis tablica, docDefaults (2. 9. 2026., nalaz iz orchestrator testa na EFZG završnom)

- `_rukopis_ima`: svaki „popis*" prolazio je kao popis literature → popis tablica se nikad nije gradio, `check_rules` blokirao na „obavezni dijelovi". Sad: natpisi prikaza su `SEQ` polja, POPIS TABLICA je `TOC \c` polje, popis prikaza kojih u rukopisu nema se ne gradi prazan (⚠ na stderr).
- `docDefaults` i stil `Caption` dobivaju font/veličinu profila (tema Cambria/Calibri više ne „curi" u tablice i polja) — `check_rules` font ⚠→✅.
- `citiranje.razmak_izmedu_jedinica` → 12 pt među jedinicama literature; navodnik u generiranoj izjavi hrvatski. Popravak je napisao audit-agent unutar workflowa (rad-orchestrator §3 sada to zabranjuje — nalazi paketa idu u `.katedra/nalazi_paketa.md`).
