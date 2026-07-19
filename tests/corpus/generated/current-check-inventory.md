# Lekta - inventar provjera (auto-generirano)

> Izvor istine je KOD, ne prompt. Hibridno: staticki (makeCheck/issue) + runtime (analyzeDocx).

Hibridni inventar: STATICKI (makeCheck/issue izvor) UNIJA RUNTIME (analyzeDocx nad reprezentativnim profilima). Intake kodovi runtime-dokazani. Nije izvor pravila (CLAUDE.md).

## Brojke

- Provjere ukupno: **71** (bodovane 54, informativne 11, dinamicne/neokinute 6)
- Jedinstveni naslovi nalaza (issue): **92**
- Intake reject kodovi: **6** (+ suspicious signal)
- COMPILED_CHECK_IDS: **17**
- Profili u registru: **395**
- Provjere bez stabilnog ID-a (faza 1): **71** (svi; ID dolazi u fazi 2)

## Provjere

| Kategorija | Naslov | Bodovano | Statusi | Izvor(i) |
|---|---|---|---|---|
| citations | Abecedni poredak literature | da | pass | src/analysis/analyze-docx.ts:167 |
| citations | Automatizacija citatnog stila | da | warn | src/analysis/analyze-docx.ts:163 |
| citations | Citirano → literatura | da | pass/fail | src/analysis/analyze-docx.ts:161 |
| citations | Datumi pristupa mrežnim izvorima | da | pass | src/analysis/analyze-docx.ts:170 |
| citations | Dosljednost interpunkcije citatnica | da | pass | src/analysis/analyze-docx.ts:166 |
| citations | Fusnote ↔ bibliografija | da | warn | src/citations/legal-citation.ts:28 |
| citations | Isti autor i godina (a/b/c) | da | pass | src/analysis/analyze-docx.ts:168 |
| citations | Klasifikacija pravnih izvora | da | fail | src/citations/legal-citation.ts:28 |
| citations | Kratica id. u istoj bilješci | info | pass | src/citations/legal-citation.ts:28 |
| citations | Literatura → citirano | da | warn | src/analysis/analyze-docx.ts:161 |
| citations | Lokator uz izravne citate | da | pass | src/analysis/analyze-docx.ts:165 |
| citations | Minimalan broj izvora profila | da | warn | src/analysis/analyze-docx.ts:169 |
| citations | op. cit. → prvo navođenje | da | pass | src/citations/legal-citation.ts:28 |
| citations | Potpunost bibliografskih zapisa | da | pass | src/analysis/analyze-docx.ts:164 |
| citations | Potpunost prvog navođenja | da | pass | src/citations/legal-citation.ts:28 |
| citations | Pravne fusnote | da | pass/fail | src/citations/legal-citation.ts:28 |
| citations | Prepoznate citatnice | da | pass | src/analysis/analyze-docx.ts:161 |
| citations | Propisi i uvedene kratice | info | pass | src/citations/legal-citation.ts:28 |
| citations | Slijed Ibid. | da | pass | src/citations/legal-citation.ts:28 |
| citations | Sudska praksa | info | pass | src/citations/legal-citation.ts:28 |
| elements | Izvori ispod slika i tablica | da | pass | src/analysis/analyze-docx.ts:173 |
| elements | Naslovi slika i grafikona | da | pass | src/analysis/analyze-docx.ts:172 |
| elements | Naslovi tablica | da | pass | src/analysis/analyze-docx.ts:171 |
| elements | Oblik poveznica | da | pass | src/analysis/analyze-docx.ts:175 |
| elements | Popisi slika i tablica | da | pass | src/analysis/analyze-docx.ts:174 |
| elements | Prazni odlomci | info | pass | src/analysis/analyze-docx.ts:176 |
| formatting | Automatske fusnote | da | pass/fail | src/analysis/analyze-docx.ts:137 |
| formatting | Dominantni font | da | pass/fail | src/analysis/analyze-docx.ts:131 |
| formatting | Format stranice (A3/A0) | da | warn | (samo runtime) |
| formatting | Format stranice A4 | da | pass/warn | src/analysis/analyze-docx.ts:136 |
| formatting | Margine dokumenta | da | pass/fail/warn | src/analysis/analyze-docx.ts:134 |
| formatting | Oblikovanje fusnota | da | warn/pass | src/analysis/analyze-docx.ts:137 |
| formatting | Položaj i stil oznaka fusnota | da | pass | src/analysis/analyze-docx.ts:140 |
| formatting | Poravnanje osnovnog teksta | da | pass/warn | src/analysis/analyze-docx.ts:135 |
| formatting | Prored osnovnog teksta | da | pass/fail | src/analysis/analyze-docx.ts:133 |
| formatting | Razmak prije i poslije fusnota | da | pass | (samo runtime) |
| formatting | Razmak prije i poslije odlomka | da | pass | (samo runtime) |
| formatting | Veličina osnovnog teksta | da | pass/fail | src/analysis/analyze-docx.ts:132 |
| structure | Broj glavnih poglavlja | dinamično | - | src/analysis/analyze-docx.ts:152 |
| structure | Brojevi stranica | da | pass | src/analysis/analyze-docx.ts:144 |
| structure | Brojevi stranica u sadržaju | da | pass | src/analysis/analyze-docx.ts:25 |
| structure | Detalji automatskog sadržaja | dinamično | - | src/analysis/analyze-docx.ts:25 |
| structure | Dijelovi verificiranog profila | da | pass/warn | src/analysis/analyze-docx.ts:147 |
| structure | Dubina decimalnog numeriranja | da | pass | src/analysis/analyze-docx.ts:142 |
| structure | Elementi naslovne stranice | da | warn/pass | src/analysis/analyze-docx.ts:157 |
| structure | Etički aspekti empirijskog istraživanja | dinamično | - | src/analysis/analyze-docx.ts:148 |
| structure | Font i veličina sadržaja | da | pass | src/analysis/analyze-docx.ts:25 |
| structure | Hijerarhija naslova | da | pass | src/analysis/analyze-docx.ts:141 |
| structure | Ključne riječi u samom radu | da | pass/warn | src/analysis/analyze-docx.ts:154 |
| structure | Metodološka varijanta rada | dinamično | - | src/analysis/analyze-docx.ts:148 |
| structure | Naslovi dokumenta ↔ sadržaj | da | pass | src/analysis/analyze-docx.ts:25 |
| structure | Naslovnica bez broja stranice | info | pass | src/analysis/analyze-docx.ts:144 |
| structure | Numeriranje naslova | da | pass | src/audits/structure.ts:13 |
| structure | Numeriranje od prve stranice Uvoda | info | pass | src/analysis/analyze-docx.ts:144 |
| structure | Oblikovanje naslova po razinama | da | warn/pass | src/audits/structure.ts:13 |
| structure | Omjer Uvoda i Zaključka | da | warn/pass | src/analysis/analyze-docx.ts:156 |
| structure | Opseg u autorskim karticama | dinamično | - | src/analysis/analyze-docx.ts:151 |
| structure | Opseg u stranicama | info | pass | src/analysis/analyze-docx.ts:150 |
| structure | Osnovni dijelovi rada | da | pass/warn | src/analysis/analyze-docx.ts:146 |
| structure | Položaj broja stranice | info | pass | src/analysis/analyze-docx.ts:144 |
| structure | Poravnanje naslova slijeva | da | pass | src/audits/structure.ts:13 |
| structure | Profilni opseg riječi | da | warn | src/analysis/analyze-docx.ts:155 |
| structure | Raspored naslovne stranice | info | pass | src/analysis/analyze-docx.ts:27 |
| structure | Redoslijed elemenata naslovnice | info | pass | src/analysis/analyze-docx.ts:157 |
| structure | Sadržaj dokumenta | da | pass | src/analysis/analyze-docx.ts:143 |
| structure | Sažeci u samom radu | da | pass/warn | src/analysis/analyze-docx.ts:153 |
| structure | Shema numeriranja stranica | da | warn | src/analysis/analyze-docx.ts:145 |
| structure | Struktura metodološkog profila | dinamično | - | src/analysis/analyze-docx.ts:148 |
| structure | Tipografija korica i naslovnice | info | pass | src/analysis/analyze-docx.ts:27 |
| structure | Uporaba Word stilova naslova | da | pass | src/analysis/analyze-docx.ts:159 |
| structure | Zahtjevi za ručnu završnu provjeru | da | warn | src/analysis/analyze-docx.ts:158 |

## Intake kodovi (runtime-dokazani)

| Kod | Dokazan | Poruka |
|---|---|---|
| too-small | da | Datoteka je premalena da bude pravi Word dokument. Ponovno spremi rad iz Worda k |
| not-zip | da | Datoteka nije pravi .docx dokument (nema Word ZIP potpis). Provjeri da nije prei |
| corrupt | da | Datoteka je oštećena ili nije valjan .docx. Ponovno je izvezi iz Worda (Spremi k |
| macros | da | Dokument sadrži makronaredbe (vbaProject) pa se ne može analizirati. U Wordu ga  |
| no-document | da | U datoteci nije pronađen glavni Word dokument. Ponovno je izvezi iz Worda. |
| empty | da | Dokument je prazan, nema teksta za analizu. Učitaj završni ili diplomski rad s t |
| suspicious | da | Word za ovaj dokument bilježi samo 42 riječi |

## COMPILED_CHECK_IDS

`font`, `font-size`, `line-spacing`, `margins`, `citation-style`, `required-sections`, `reference-count`, `word-count`, `page-count`, `toc`, `page-numbers`, `paper-size`, `justify`, `footnote-font`, `footnote-size`, `footnote-spacing`, `heading-rules`

## Nalazi (issue naslovi)

| Kategorija | Naslov | Severity | Izvor(i) |
|---|---|---|---|
| citations | Citatnice koriste nedosljednu interpunkciju | warning | src/analysis/analyze-docx.ts:166 |
| citations | Četiri Ibid. bilješke nemaju jasnu prethodnu bilješku | warning | src/ui/app.ts:621 |
| citations | Dva propisa navedena su bez broja Narodnih novina | warning | src/ui/app.ts:621 |
| citations | Fusnote i bibliografija nisu potpuno povezane | warning | src/citations/legal-citation.ts:28 |
| citations | Ibid. nema valjanu prethodnu poveznicu | error | src/citations/legal-citation.ts:28 |
| citations | Isti autor i godina možda nisu razlučeni slovima | warning | src/analysis/analyze-docx.ts:168 |
| citations | Jedna citatnica nije pronađena u literaturi | warning | src/ui/app.ts:625 |
| citations | Mnogo fusnota nije klasificirano | warning | src/citations/legal-citation.ts:28 |
| citations | Moguća nepravilna uporaba kratice id. | warning | src/citations/legal-citation.ts:28 |
| citations | Moguće premalo izvora prema verificiranom profilu | warning | src/analysis/analyze-docx.ts:169 |
| citations | Mogući izravni citati bez broja stranice | warning | src/analysis/analyze-docx.ts:165 |
| citations | Mogući nepotpuni izvori u literaturi | warning | src/analysis/analyze-docx.ts:164 |
| citations | Mogući nepotpuni navodi sudske prakse | warning | src/citations/legal-citation.ts:28 |
| citations | Mogući nepotpuni prvi navodi | warning | src/citations/legal-citation.ts:28 |
| citations | Mrežni izvori bez datuma pristupa | warning | src/analysis/analyze-docx.ts:170 |
| citations | Neispravno ili nejasno upućivanje op. cit. | error | src/citations/legal-citation.ts:28 |
| citations | Neke citatnice nisu pronađene u literaturi | error | src/analysis/analyze-docx.ts:161 |
| citations | Neki izvori iz literature nisu pronađeni u tekstu | warning | src/analysis/analyze-docx.ts:161 |
| citations | Nema pravnih fusnota | error | src/citations/legal-citation.ts:28 |
| citations | Nisu prepoznate autor-godina citatnice | info | src/analysis/analyze-docx.ts:161 |
| citations | Nisu pronađene automatske fusnote | error | src/analysis/analyze-docx.ts:137 |
| citations | Odabrani citatni stil nije u potpunosti automatiziran | info | src/analysis/analyze-docx.ts:163 |
| citations | Pet citatnica nije pronađeno u literaturi | error | src/ui/app.ts:615 |
| citations | Popis literature možda nije abecedno poredan | warning | src/analysis/analyze-docx.ts:167 |
| citations | Provjeri navođenje pravnih akata | - | src/citations/legal-citation.ts:28 |
| citations | Tri izvora iz fusnota nisu u popisu literature | error | src/ui/app.ts:621 |
| citations | Tri mrežna izvora nemaju datum pristupa | warning | src/ui/app.ts:615 |
| elements | Dokument sadrži mnogo praznih odlomaka | info | src/analysis/analyze-docx.ts:176 |
| elements | Dvije gole poveznice | info | src/ui/app.ts:625 |
| elements | Dvije tablice nemaju prepoznat naslov | warning | src/ui/app.ts:615 |
| elements | Mogu nedostajati izvori uz grafičke elemente | warning | src/analysis/analyze-docx.ts:173 |
| elements | Mogu nedostajati popisi ilustracija | warning | src/analysis/analyze-docx.ts:174 |
| elements | Moguće neispravno zapisane poveznice | warning | src/analysis/analyze-docx.ts:175 |
| elements | Neke tablice nemaju prepoznat naslov | warning | src/analysis/analyze-docx.ts:171 |
| elements | Neki grafički elementi nemaju prepoznat naslov | warning | src/analysis/analyze-docx.ts:172 |
| elements | Povećan udio praznih odlomaka | info | src/ui/app.ts:621 |
| formatting | Desna margina odstupa od profila | warning | src/ui/app.ts:615 |
| formatting | Dominantni font ne odgovara profilu | error | src/analysis/analyze-docx.ts:131 |
| formatting | Font nije ujednačen kroz dokument | warning | src/ui/app.ts:625 |
| formatting | Format stranice možda nije A4 | warning | src/analysis/analyze-docx.ts:136 |
| formatting | Format stranice ne odgovara profilu | warning | src/analysis/analyze-docx.ts:136 |
| formatting | Fusnote odstupaju od pravnog profila | warning | src/analysis/analyze-docx.ts:137 |
| formatting | Margine nisu jednake očekivanim postavkama | warning | src/analysis/analyze-docx.ts:134 |
| formatting | Osnovni tekst nije dominantno obostrano poravnat | warning | src/analysis/analyze-docx.ts:135 |
| formatting | Oznake fusnota nisu pravilno postavljene | warning | src/analysis/analyze-docx.ts:140 |
| formatting | Prored nije usklađen s profilom | error | src/analysis/analyze-docx.ts:133 |
| formatting | Veličina osnovnog teksta odstupa | error | src/analysis/analyze-docx.ts:132 |
| structure | Broj riječi je izvan raspona odabranog profila | warning | src/analysis/analyze-docx.ts:155 |
| structure | Broj stranice nije postavljen desno | warning | src/analysis/analyze-docx.ts:144 |
| structure | Dokument ne izgleda kao završni ili diplomski rad | error | src/ui/app.ts:603 |
| structure | Dokument nema automatske brojeve stranica | error | src/ui/app.ts:625 |
| structure | Dva naslova možda su ručno oblikovana | info | src/ui/app.ts:615 |
| structure | Elementi naslovnice nisu centrirani | warning | src/analysis/analyze-docx.ts:27 |
| structure | Informativno: Broj stranice nije postavljen desno | info | (samo runtime) |
| structure | Informativno: Nisu prepoznati svi osnovni dijelovi rada | info | (samo runtime) |
| structure | Informativno: Provjeri je li naslovnica bez broja stranice | info | (samo runtime) |
| structure | Informativno: Provjeri početak numeriranja na Uvodu | info | (samo runtime) |
| structure | Korice ili naslovnica odstupaju od predloška | warning | src/analysis/analyze-docx.ts:27 |
| structure | Metodološku varijantu nije moguće pouzdano prepoznati | info | src/analysis/analyze-docx.ts:148 |
| structure | Naslovi ne prate profil razina | warning | src/audits/structure.ts:13 |
| structure | Naslovi nisu poravnani slijeva | warning | src/audits/structure.ts:13 |
| structure | Naslovi preskaču razinu hijerarhije | warning | src/analysis/analyze-docx.ts:141 |
| structure | Naslovna stranica možda nije potpuna | warning | src/analysis/analyze-docx.ts:157 |
| structure | Nedostaju dijelovi odabranog metodološkog profila | warning | src/analysis/analyze-docx.ts:148 |
| structure | Nedostaju mogući obvezni dijelovi verificiranog profila | warning | src/analysis/analyze-docx.ts:147 |
| structure | Neke stavke sadržaja nemaju broj stranice | warning | src/analysis/analyze-docx.ts:25 |
| structure | Neki naslovi možda nisu označeni Word stilom | warning | src/analysis/analyze-docx.ts:159 |
| structure | Nije prepoznat osvrt na etičke aspekte | warning | src/analysis/analyze-docx.ts:148 |
| structure | Nije pronađen sadržaj | error | src/analysis/analyze-docx.ts:143 |
| structure | Nisu prepoznati svi osnovni dijelovi rada | warning | src/analysis/analyze-docx.ts:146 |
| structure | Nisu pronađeni automatski brojevi stranica | error | src/analysis/analyze-docx.ts:144 |
| structure | Numeriranje naslova nije dosljedno | warning | src/audits/structure.ts:13 |
| structure | Odabrana metodološka varijanta možda ne odgovara dokumentu | warning | src/analysis/analyze-docx.ts:148 |
| structure | Omjer Uvoda ili Zaključka odstupa od FPZG smjernice | warning | src/analysis/analyze-docx.ts:156 |
| structure | Opseg je izvan katedarskog raspona | - | src/analysis/analyze-docx.ts:151 |
| structure | Previše razina numeriranja naslova | warning | src/analysis/analyze-docx.ts:142 |
| structure | Profil ograničeno terenski testiran | info | src/analysis/analyze-docx.ts:130 |
| structure | Provjeri je li naslovnica bez broja stranice | warning | src/analysis/analyze-docx.ts:144 |
| structure | Provjeri ključne riječi u samom radu | warning | src/analysis/analyze-docx.ts:154 |
| structure | Provjeri početak numeriranja na Uvodu | warning | src/analysis/analyze-docx.ts:144 |
| structure | Provjeri rimsku i arapsku numeraciju | warning | src/analysis/analyze-docx.ts:145 |
| structure | Provjeri sažetke u samom radu | warning | src/analysis/analyze-docx.ts:153 |
| structure | Rad ima više glavnih poglavlja od katedarske preporuke | info | src/analysis/analyze-docx.ts:152 |
| structure | Redoslijed naslovne stranice nije očekivan | warning | src/analysis/analyze-docx.ts:157 |
| structure | Ručna završna provjera verificiranog profila | info | src/analysis/analyze-docx.ts:158 |
| structure | Sadržaj (tablica sadržaja) nije pronađen | warning | src/ui/app.ts:625 |
| structure | Sadržaj možda nije ažuriran | warning | src/analysis/analyze-docx.ts:25 |
| structure | Sadržaj nije oblikovan kao glavni tekst | warning | src/analysis/analyze-docx.ts:25 |
| structure | Službene tehničke provjere | info | (samo runtime) |
| structure | Spremljeni broj stranica je izvan profilnog raspona | info | src/analysis/analyze-docx.ts:150 |
| structure | Tri naslova možda su ručno oblikovana | warning | src/ui/app.ts:621 |
| structure | Tri naslova preskaču razinu hijerarhije | warning | src/ui/app.ts:615 |
