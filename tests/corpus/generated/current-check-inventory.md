# Lekta - inventar provjera (auto-generirano)

> Izvor istine je KOD, ne prompt. Hibridno: staticki (makeCheck/issue) + runtime (analyzeDocx).

Hibridni inventar: STATICKI (makeCheck/issue izvor) UNIJA RUNTIME (analyzeDocx nad reprezentativnim profilima). Intake kodovi runtime-dokazani. Nije izvor pravila (CLAUDE.md).

## Brojke

- Provjere ukupno: **73** (bodovane 47, informativne 17, dinamicne/neokinute 9)
- Jedinstveni naslovi nalaza (issue): **87**
- Intake reject kodovi: **6** (+ suspicious signal)
- COMPILED_CHECK_IDS: **31**
- Profili u registru: **423**
- Provjere bez stabilnog ID-a (faza 1): **73** (svi; ID dolazi u fazi 2)

## Provjere

| Kategorija | Naslov | Bodovano | Statusi | Izvor(i) |
|---|---|---|---|---|
| citations | Abecedni poredak literature | da | pass | src/analysis/analyze-docx.ts:302 |
| citations | Automatizacija citatnog stila | info | unmeasurable | (samo runtime) |
| citations | Citirano → literatura | da | pass/fail | src/analysis/analyze-docx.ts:290 |
| citations | Datumi pristupa mrežnim izvorima | da | pass | src/analysis/analyze-docx.ts:305 |
| citations | Dosljednost interpunkcije citatnica | da | pass | src/analysis/analyze-docx.ts:301 |
| citations | Fusnote ↔ bibliografija | da | warn | src/citations/legal-citation.ts:28 |
| citations | Isti autor i godina (a/b/c) | da | pass | src/analysis/analyze-docx.ts:303 |
| citations | Klasifikacija pravnih izvora | da | fail | src/citations/legal-citation.ts:28 |
| citations | Kratica id. u istoj bilješci | info | informational | src/citations/legal-citation.ts:28 |
| citations | Literatura → citirano | da | warn | src/analysis/analyze-docx.ts:290 |
| citations | Lokator uz izravne citate | info | informational | src/analysis/analyze-docx.ts:300 |
| citations | Minimalan broj izvora profila | da | warn | src/analysis/analyze-docx.ts:304 |
| citations | op. cit. → prvo navođenje | da | pass | src/citations/legal-citation.ts:28 |
| citations | Potpunost bibliografskih zapisa | da | pass | src/analysis/analyze-docx.ts:295 |
| citations | Potpunost prvog navođenja | da | pass | src/citations/legal-citation.ts:28 |
| citations | Pravne fusnote | da | pass/fail | src/citations/legal-citation.ts:28 |
| citations | Prepoznate citatnice | da | pass | src/analysis/analyze-docx.ts:290 |
| citations | Propisi i uvedene kratice | info | informational | src/citations/legal-citation.ts:28 |
| citations | Slijed Ibid. | da | pass | src/citations/legal-citation.ts:28 |
| citations | Sudska praksa | info | informational | src/citations/legal-citation.ts:28 |
| elements | Izvori ispod slika i tablica | da | pass | src/analysis/analyze-docx.ts:308 |
| elements | Naslovi slika i grafikona | da | pass/informational | src/analysis/analyze-docx.ts:307 |
| elements | Naslovi tablica | da | pass/informational | src/analysis/analyze-docx.ts:306 |
| elements | Oblik poveznica | da | pass/informational | src/analysis/analyze-docx.ts:310 |
| elements | Popisi slika i tablica | da | pass | src/analysis/analyze-docx.ts:309 |
| elements | Prazni odlomci | info | informational | (samo runtime) |
| formatting | Automatske fusnote | da | pass/fail | (samo runtime) |
| formatting | Dominantni font | da | pass/fail/informational | (samo runtime) |
| formatting | Format stranice (A3/A0) | da | warn | (samo runtime) |
| formatting | Format stranice (A4) | da | pass/warn | (samo runtime) |
| formatting | Format stranice A4 | da | pass/warn | (samo runtime) |
| formatting | Margine dokumenta | da | informational/pass/fail/warn | (samo runtime) |
| formatting | Oblikovanje fusnota | da | warn/unmeasurable | (samo runtime) |
| formatting | Položaj i stil oznaka fusnota | da | pass | (samo runtime) |
| formatting | Poravnanje osnovnog teksta | da | pass/warn/informational | (samo runtime) |
| formatting | Prored osnovnog teksta | da | pass/unmeasurable/informational/fail | (samo runtime) |
| formatting | Razmak prije i poslije fusnota | da | pass | (samo runtime) |
| formatting | Razmak prije i poslije odlomka | da | pass | (samo runtime) |
| formatting | Veličina osnovnog teksta | da | pass/fail/informational | (samo runtime) |
| structure | Broj glavnih poglavlja | dinamično | - | src/analysis/analyze-docx.ts:267 |
| structure | Brojevi stranica | da | pass/fail/informational | (samo runtime) |
| structure | Brojevi stranica u sadržaju | dinamično | - | src/analysis/analyze-docx.ts:78 |
| structure | Detalji automatskog sadržaja | dinamično | - | src/analysis/analyze-docx.ts:78 |
| structure | Dijelovi verificiranog profila | da | pass/warn | src/analysis/analyze-docx.ts:262 |
| structure | Dubina decimalnog numeriranja | da | pass/informational | (samo runtime) |
| structure | Elementi naslovne stranice | da | warn/pass | src/analysis/analyze-docx.ts:282 |
| structure | Etički aspekti empirijskog istraživanja | dinamično | - | src/analysis/analyze-docx.ts:263 |
| structure | Font i veličina sadržaja | dinamično | - | src/analysis/analyze-docx.ts:78 |
| structure | Hijerarhija naslova | da | pass/informational | (samo runtime) |
| structure | Ključne riječi u samom radu | da | pass/warn | src/analysis/analyze-docx.ts:269 |
| structure | Metodološka varijanta rada | dinamično | - | src/analysis/analyze-docx.ts:263 |
| structure | Naslovi dokumenta ↔ sadržaj | dinamično | - | src/analysis/analyze-docx.ts:78 |
| structure | Naslovnica bez broja stranice | info | informational | (samo runtime) |
| structure | Numeriranje naslova | da | pass | src/audits/structure.ts:23 |
| structure | Numeriranje od prve stranice Uvoda | info | informational | (samo runtime) |
| structure | Oblikovanje naslova po razinama | da | warn/informational | src/audits/structure.ts:23 |
| structure | Omjer Uvoda i Zaključka | info | informational | src/analysis/analyze-docx.ts:277 |
| structure | Opseg u autorskim karticama | dinamično | - | src/analysis/analyze-docx.ts:266 |
| structure | Opseg u stranicama | info | informational | (samo runtime) |
| structure | Osnovni dijelovi rada | da | pass/warn/informational | src/analysis/analyze-docx.ts:261 |
| structure | Položaj broja stranice | info | informational | (samo runtime) |
| structure | Poravnanje naslova slijeva | da | pass | src/audits/structure.ts:23 |
| structure | Profilni opseg riječi | da | warn | src/analysis/analyze-docx.ts:276 |
| structure | Raspored naslovne stranice | info | informational | src/analysis/analyze-docx.ts:80 |
| structure | Redoslijed elemenata naslovnice | info | informational | src/analysis/analyze-docx.ts:282 |
| structure | Sadržaj dokumenta | da | fail/informational | (samo runtime) |
| structure | Sažeci u samom radu | da | pass/warn | src/analysis/analyze-docx.ts:268 |
| structure | Shema numeriranja stranica | info | informational | src/analysis/analyze-docx.ts:260 |
| structure | Struktura metodološkog profila | dinamično | - | src/analysis/analyze-docx.ts:263 |
| structure | Tipografija korica i naslovnice | info | informational | src/analysis/analyze-docx.ts:80 |
| structure | Uporaba Word stilova naslova | da | pass/informational | src/analysis/analyze-docx.ts:288 |
| structure | Zahtjevi za ručnu završnu provjeru | info | unmeasurable | (samo runtime) |
| typography | Tehničko-tipografska dosljednost | info | informational | src/analysis/analyze-docx.ts:321, src/analysis/analyze-docx.ts:325 |

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

`font`, `font-size`, `line-spacing`, `margins`, `citation-style`, `required-sections`, `reference-count`, `word-count`, `page-count`, `toc`, `page-numbers`, `page-number-title-suppression`, `page-number-start-at-intro`, `paper-size`, `justify`, `footnote-font`, `footnote-size`, `footnote-spacing`, `footnote-justify`, `heading-rules`, `element-caption-rules`, `bibliography-rules`, `citation-sync-rules`, `legal-footnote-repair-rules`, `table-figure-rescue-rules`, `section-surgery-rules`, `croatian-typography-rules`, `consistency-rules`, `required-section-rules`, `link-rules`, `cross-file-submission-rules`

## Nalazi (issue naslovi)

| Kategorija | Naslov | Severity | Izvor(i) |
|---|---|---|---|
| citations | Citatnice koriste nedosljednu interpunkciju | warning | src/analysis/analyze-docx.ts:301 |
| citations | Četiri Ibid. bilješke nemaju jasnu prethodnu bilješku | warning | src/ui/app.ts:1044 |
| citations | Dva propisa navedena su bez broja Narodnih novina | warning | src/ui/app.ts:1044 |
| citations | Fusnote i bibliografija nisu potpuno povezane | warning | src/citations/legal-citation.ts:28 |
| citations | Ibid. nema valjanu prethodnu poveznicu | error | src/citations/legal-citation.ts:28 |
| citations | Isti autor i godina možda nisu razlučeni slovima | warning | src/analysis/analyze-docx.ts:303 |
| citations | Jedna citatnica nije pronađena u literaturi | warning | src/ui/app.ts:1048 |
| citations | Mnogo fusnota nije klasificirano | warning | src/citations/legal-citation.ts:28 |
| citations | Moguća nepravilna uporaba kratice id. | warning | src/citations/legal-citation.ts:28 |
| citations | Moguće premalo izvora prema verificiranom profilu | warning | src/analysis/analyze-docx.ts:304 |
| citations | Mogući izravni citati bez broja stranice | info | src/analysis/analyze-docx.ts:300 |
| citations | Mogući nepotpuni izvori u literaturi | warning | src/analysis/analyze-docx.ts:295 |
| citations | Mogući nepotpuni navodi sudske prakse | warning | src/citations/legal-citation.ts:28 |
| citations | Mogući nepotpuni prvi navodi | warning | src/citations/legal-citation.ts:28 |
| citations | Mrežni izvori bez datuma pristupa | warning | src/analysis/analyze-docx.ts:305 |
| citations | Neispravno ili nejasno upućivanje op. cit. | error | src/citations/legal-citation.ts:28 |
| citations | Neke citatnice nisu pronađene u literaturi | error | src/analysis/analyze-docx.ts:290 |
| citations | Neki izvori iz literature nisu pronađeni u tekstu | warning | src/analysis/analyze-docx.ts:290 |
| citations | Nema pravnih fusnota | error | src/citations/legal-citation.ts:28 |
| citations | Nisu prepoznate autor-godina citatnice | info | src/analysis/analyze-docx.ts:290 |
| citations | Nisu pronađene automatske fusnote | error | (samo runtime) |
| citations | Odabrani citatni stil nije u potpunosti automatiziran | info | src/analysis/analyze-docx.ts:294 |
| citations | Pet citatnica nije pronađeno u literaturi | error | src/ui/app.ts:1038 |
| citations | Popis literature možda nije abecedno poredan | warning | src/analysis/analyze-docx.ts:302 |
| citations | Provjeri navođenje pravnih akata | - | src/citations/legal-citation.ts:28 |
| citations | Tri izvora iz fusnota nisu u popisu literature | error | src/ui/app.ts:1044 |
| citations | Tri mrežna izvora nemaju datum pristupa | warning | src/ui/app.ts:1038 |
| elements | Dvije gole poveznice | info | src/ui/app.ts:1048 |
| elements | Dvije tablice nemaju prepoznat naslov | warning | src/ui/app.ts:1038 |
| elements | Mogu nedostajati izvori uz grafičke elemente | warning | src/analysis/analyze-docx.ts:308 |
| elements | Mogu nedostajati popisi ilustracija | warning | src/analysis/analyze-docx.ts:309 |
| elements | Moguće neispravno zapisane poveznice | warning | src/analysis/analyze-docx.ts:310 |
| elements | Neke tablice nemaju prepoznat naslov | warning | src/analysis/analyze-docx.ts:306 |
| elements | Neki grafički elementi nemaju prepoznat naslov | warning | src/analysis/analyze-docx.ts:307 |
| elements | Povećan udio praznih odlomaka | info | src/ui/app.ts:1044 |
| formatting | Desna margina odstupa od profila | warning | src/ui/app.ts:1038 |
| formatting | Dominantni font ne odgovara profilu | error | (samo runtime) |
| formatting | Font nije ujednačen kroz dokument | warning | src/ui/app.ts:1048 |
| formatting | Format stranice možda nije A4 | warning | (samo runtime) |
| formatting | Format stranice ne odgovara profilu | warning | (samo runtime) |
| formatting | Fusnote odstupaju od pravnog profila | warning | (samo runtime) |
| formatting | Margine nisu jednake očekivanim postavkama | warning | (samo runtime) |
| formatting | Osnovni tekst nije dominantno obostrano poravnat | warning | (samo runtime) |
| formatting | Prored nije usklađen s profilom | error | (samo runtime) |
| formatting | Veličina osnovnog teksta odstupa | error | (samo runtime) |
| structure | Broj riječi je izvan raspona odabranog profila (uz ±10% toleranciju) | warning | src/analysis/analyze-docx.ts:276 |
| structure | Dokument ne izgleda kao završni ili diplomski rad | error | src/ui/app.ts:1026 |
| structure | Dokument nema automatske brojeve stranica | error | src/ui/app.ts:1048 |
| structure | Dva naslova možda su ručno oblikovana | info | src/ui/app.ts:1038 |
| structure | Elementi naslovnice nisu centrirani | warning | src/analysis/analyze-docx.ts:80 |
| structure | Informativno: Broj stranice nije postavljen desno | info | (samo runtime) |
| structure | Informativno: Nisu prepoznati svi osnovni dijelovi rada | info | (samo runtime) |
| structure | Informativno: Omjer Uvoda ili Zaključka odstupa od FPZG smjernice | info | (samo runtime) |
| structure | Informativno: Provjeri je li naslovnica bez broja stranice | info | (samo runtime) |
| structure | Informativno: Provjeri početak numeriranja na Uvodu | info | (samo runtime) |
| structure | Informativno: Provjeri rimsku i arapsku numeraciju | info | (samo runtime) |
| structure | Korice ili naslovnica odstupaju od predloška | warning | src/analysis/analyze-docx.ts:80 |
| structure | Metodološku varijantu nije moguće pouzdano prepoznati | info | src/analysis/analyze-docx.ts:263 |
| structure | Naslovi ne prate profil razina | warning | src/audits/structure.ts:23 |
| structure | Naslovi nisu poravnani slijeva | warning | src/audits/structure.ts:23 |
| structure | Naslovna stranica možda nije potpuna | warning | src/analysis/analyze-docx.ts:282 |
| structure | Nedostaju dijelovi odabranog metodološkog profila | warning | src/analysis/analyze-docx.ts:263 |
| structure | Nedostaju mogući obvezni dijelovi verificiranog profila | warning | src/analysis/analyze-docx.ts:262 |
| structure | Neke stavke sadržaja nemaju broj stranice | warning | src/analysis/analyze-docx.ts:78 |
| structure | Neki naslovi možda nisu označeni Word stilom | warning | src/analysis/analyze-docx.ts:288 |
| structure | Nije prepoznat osvrt na etičke aspekte | warning | src/analysis/analyze-docx.ts:263 |
| structure | Nije pronađen sadržaj | error | (samo runtime) |
| structure | Nisu prepoznati svi osnovni dijelovi rada | warning | src/analysis/analyze-docx.ts:261 |
| structure | Nisu pronađeni automatski brojevi stranica | error | (samo runtime) |
| structure | Numeriranje naslova nije dosljedno | warning | src/audits/structure.ts:23 |
| structure | Odabrana metodološka varijanta možda ne odgovara dokumentu | warning | src/analysis/analyze-docx.ts:263 |
| structure | Omjer Uvoda ili Zaključka odstupa od FPZG smjernice | info | src/analysis/analyze-docx.ts:277 |
| structure | Opseg je izvan katedarskog raspona | - | src/analysis/analyze-docx.ts:266 |
| structure | Profil ograničeno terenski testiran | info | src/analysis/analyze-docx.ts:232 |
| structure | Provjeri ključne riječi u samom radu | warning | src/analysis/analyze-docx.ts:269 |
| structure | Provjeri rimsku i arapsku numeraciju | info | src/analysis/analyze-docx.ts:260 |
| structure | Provjeri sažetke u samom radu | warning | src/analysis/analyze-docx.ts:268 |
| structure | Rad ima više glavnih poglavlja od katedarske preporuke | info | src/analysis/analyze-docx.ts:267 |
| structure | Redoslijed naslovne stranice nije očekivan | warning | src/analysis/analyze-docx.ts:282 |
| structure | Ručna završna provjera verificiranog profila | info | src/analysis/analyze-docx.ts:287 |
| structure | Sadržaj (tablica sadržaja) nije pronađen | warning | src/ui/app.ts:1048 |
| structure | Sadržaj možda nije ažuriran | warning | src/analysis/analyze-docx.ts:78 |
| structure | Sadržaj nije oblikovan kao glavni tekst | warning | src/analysis/analyze-docx.ts:78 |
| structure | Službene tehničke provjere | info | (samo runtime) |
| structure | Tri naslova možda su ručno oblikovana | warning | src/ui/app.ts:1044 |
| structure | Tri naslova preskaču razinu hijerarhije | warning | src/ui/app.ts:1038 |
| typography | Pronađene su tehničko-tipografske nedosljednosti | warning | src/analysis/analyze-docx.ts:321, src/analysis/analyze-docx.ts:325 |
