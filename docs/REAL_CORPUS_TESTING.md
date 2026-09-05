# Testiranje stvarnog DOCX korpusa

Harness za stvarne, nesintetičke `.docx` uzorke koristi sidecar datoteku istog imena:

```json
{ "profileId": "fer-diplomski" }
```

Pokretanje:

```bash
npm run repair-real-corpus
```

Izvještaj je u `docs/generated/repair-real-corpus.json`. U njega se ne zapisuju tekst rada,
citate ni osobni podaci. Sintetički fixturei sa `synthetic: true` automatski se izostavljaju.

Harness za svaki dokument:

1. analizira dokument odabranim profilom,
2. izvlači sigurne automatske stavke iz istog profilnog UI recepta,
3. primjenjuje popravak,
4. ponovno analizira DOCX,
5. provjerava čitljivost izlaza, očuvanje teksta, regresije i idempotenciju.

Ishodi su `pass`, `no-op`, `review` ili `fail`.

- `pass` znaci da je bilo sto mjeriti (barem jedna ciljana provjera je PRIJE popravka padala) i
  da je sve ciljano razrijeseno, bez regresije i uz ispravan paket.
- `review` znaci da dio ciljanog nije razrijesen, ili da se dokument promijenio a nijedna
  bodovana provjera tu promjenu ne potvrdjuje (npr. samo `toc-field-fixer`).
- `no-op` znaci da nije bilo ni sto popraviti ni sto mjeriti.
- `fail` znaci tehnicki problem: pad integriteta, regresija, izgubljen dio, neispravan XML,
  drugi prolaz koji nije no-op ili nedopustena promjena vidljivog teksta.

`manualReviewRequired` je ODVOJEN od ishoda: strojni `pass` ne ukida vizualni pregled u Wordu ili
LibreOfficeu (Tier 1.5/2), koji ostaje uvjet za razinu A u ledgeru.

Do 2026-08-22 `pass` nije bio dostizan: izraz je glasio `unresolved ? 'review' : changed ?
'review' : 'no-op'`, pa je svaki promijenjen dokument zavrsavao na `review` i `passCount` je
uvijek bio 0 (14/14 i 50/50). Uz to se ciljanost mjerila iz `matchKeys` SVIH ponudjenih stavki i
korelirala po hrvatskom naslovu, pa je nazivnik sadrzavao i neprekrsene bodovane stavke (nose
`matchKeys`, a `violated: false` ih izbacuje iz zahtjeva) i naslove koje analiza nikad ne
emitira. Danas se ciljano racuna iz ZATRAZENIH stavki i samo za provjere koje su prije padale,
korelirano po stabilnom `check.id` (`src/repair/repair-outcome.ts`), a neprepoznati naslovi se
imenuju u `unmappedMatchKeys` umjesto da tiho obaraju postotak.

Dodavanje novog uzorka:

1. dodaj anonimizirani `.docx` u `tests/fixtures/docx/`,
2. dodaj sidecar s točnim `profileId`,
3. pokreni `npm run repair-real-corpus`,
4. ručno pregledaj dokumente označene u `manualReviewRequired`.

## Četiri razine dokaza (Tier model)

Popravljeni paket se ne dokazuje jednom provjerom. Svaka razina hvata ono što prethodna ne može,
i svaka ima svoju cijenu, pa je i mjesto pokretanja različito.

| Tier | Alat | Gdje se vrti | Kad | Što hvata |
| --- | --- | --- | --- | --- |
| 0 | `src/repair/package-integrity.ts` + xmldom `onError` | `npm run check` | svaki commit | neispravan XML u bilo kojem dijelu, atribut iza `/`, nestali ili ispražnjeni dijelovi |
| 1 | python-docx + lxml (`npm run verify:strict-open`) | GitHub `docx-strict-open` | svaki push | strogi XML pod tuđim parserom, neispravan `[Content_Types].xml`, viseće `r:id` relacije |
| 1.5 | LibreOffice headless | ručno | pred izdanje | pad na render putanji |
| 2 | Word COM (`npm run verify:word`, `verify:word:worst`) | ručno, Windows | prije deploya repair motora | "Word je popravio dokument", stvarne izmjerene vrijednosti, očuvanje tablica/slika/fusnota |

Zašto Tier 0 nije omotač oko postojećeg `parseXml`: `@xmldom/xmldom` **ne baca i ne stvara
`parsererror` čvor** na neispravnom XML-u, nego grešku javi samo kroz `onError`, a neispravni dio
serijalizira kao tekst. Kako je xmldom runtime svih testova i Web Workera, takav omotač bio bi
lažno zeleno. Dokaz je u `tests/repair-package-integrity.test.ts`.

Drugi oblik lažnog zelenog, na istoj klasi problema (2026-08-16): kad vrata integriteta ODBIJU
isporuku, `applyFixers` vraća **ulazne bajtove** uz prazan changelog. Harness koji to ne provjeri
vidi `changed === false` i zaključi `no-op`, a sve ostale tvrdnje (`outputReadable`,
`secondPassNoOp`, `droppedEntryCount`, `passRegressionCount`) prolaze **vakuumski** nad
neizmijenjenim originalom. Zato "0 fail" bez izričite tvrdnje `integrityFailure === null` nije
dokaz da gate nije okinuo. Svaki novi harness mora tvrditi i to.

**Deklarirano uklanjanje nije izgubljen zapis (2026-09-05).** `droppedEntryCount` broji samo zapise koje
NITKO nije prijavio; dijelove koje je fixer uklonio i prijavio kroz `ApplyFixersResult.removedPackageParts`
(danas samo `final-document-inspector-fixer`, npr. prazan `word/comments.xml` iz ne-Wordovih alata) harness
imenuje u `removedByFixers`. Izmjereno na 95 stvarnih radova: 15 padova, svih 15 isti potpis, i nijedan nije
bio gubitak. Gard: `tests/real-corpus-declared-removal.test.ts` (deklarirano se ne broji, nedeklarirano se i
dalje broji).

Zašto Tier 1 uz Tier 0: Tier 0 je naš vlastiti kod, pa dijeli pretpostavke s onim što provjerava.
lxml je tuđi, stroži parser, a python-docx uz to čita OPC relacijski graf. Vrti se na ubuntuu, za
razliku od Tier 2 koji je Windows-only.

Tier 1 lokalno traži `pip install python-docx lxml`. Na Windowsu s više Pythona koristi onaj koji
ih ima (`py -3 scripts/verify-docx/strict-open.py tests/fixtures/docx`).

Provjerava se i **izlaz**, ne samo ulaz, jer je izlaz ono što ide korisniku:

```bash
npm run repair-real-corpus:review
python scripts/verify-docx/strict-open.py .artifacts/lekta-real-corpus-review
```

## Koliko fixera je stvarno dokazano

Mjeri se agregacijom `tests/__snapshots__/repair-golden.test.ts.snap`: koliko od 31 registriranog
fixera nikad nije bilo `applied: true` ni na jednom dokumentu, gledajući sve grane (zadanu, `deep`
i `(potvrdjeno)`).

Polazište je bilo **18 od 31 bez ijedne primjene**. Danas ih je **6**. Ostatak se ne može riješiti
novim fixturom, i to je važno znati prije nego netko pokuša:

| skupina | fixeri | zašto fixture ne pomaže |
| --- | --- | --- |
| nema pravila ni u jednom od 368 profila | `element-caption`, `legal-footnote-repair`, `table-figure-rescue` | builder gate-a na `profile.ruleEntries`; `element-caption-rules`, `legal-footnote-repair-rules` i `table-figure-rescue-rules` nema nijedan profil u `data/profiles/repair-map.json`. Rupa je u podacima, ne u testovima. |
| traži drugi dokument | `submission-metadata` | neslaganje se računa između `.docx` i PDF-a predaje; jednodokumentno je `dc:title` uspoređen sam sa sobom, dakle uvijek `consistent`. |
| no-op i uz potvrdu | `citation-bibliography-sync`, `consistency` | obrazac popunjava zamjenski tekst jednak izvornom, pa nema što zamijeniti dok korisnik ne odabere drugu vrijednost. Stvarne grane pokrivaju `tests/repair-closed-loop-citations.test.ts` i `-typography.test.ts`. |

Tri stvari koje su podizale broj nisu bile u dokumentima nego u samom harnessu, pa ih vrijedi
zapamtiti kao obrazac: golden nije gradio parametre asistiranih fixera iz analize, nije slao
`unitId` (pa naslovnica nikad nije provjeravana) i imao je ručne kopije gateova koje su se
razišle sa živim panelom. Kad god golden i panel računaju isto na dva mjesta, jedno od njih tiho
zastari.

## Lokalni korpus i nalaz o idempotentnosti (2026-08-17)

Korpus je prosiren s 12 na **50 stvarnih radova**. Trideset osam novih su pravi studentski
radovi (vecinom FPZG) i **ne commitaju se**: tudji osobni podaci trajno bi usli u povijest
gita. Zive u `tests/fixtures/docx-local/` (gitignoriran), a mjerenje ide u
`docs/generated/repair-real-corpus.local.json` (takodjer gitignoriran). Commitani
`repair-real-corpus.json` i dalje opisuje ISKLJUCIVO commitane fixture, da ostane
reproducibilan u CI-ju.

Pokreni: `npx vite-node scripts/repair-real-corpus.mts -- --local`

### Sto je mjerenje pokazalo

**Korpus nije bio usko grlo.** Prvo prosirenje na 50 dokumenata NIJE pomaknulo pokrivenost
(ostala 4 fixera), jer je harness sastavljao stavke NA SVOJ NACIN i zvao samo dva graditelja
(`buildRepairableItems` + `universalRepairableItems`) od dvadesetak koje sucelje koristi.
Mjerio je, dakle, uzi tok od onoga koji korisnik dobije. Rijeseno izdvajanjem zajednickog
sastavljaca `src/ui/repair-item-assembly.ts`, koji sada koriste i UI i harness.

Nakon toga, nad 50 radova:

| mjera | prije | poslije |
|---|---|---|
| fixera koji se stvarno pokrenu | 4 | **15** |
| padova integriteta | 0 | 0 |
| PASS -> FAIL regresija | 0 | 0 |
| neispravnih paketa / izgubljenih dijelova | 0 | 0 |

### RIJESENO: popravak je naslovnicku oznaku pretvarao u NASLOV

Isti obrazac kao zapis literature nize: detektor je predlagao ne-naslov. "ZAVRSNI RAD" na
naslovnici je oznaka VRSTE RADA, a ne dio strukture dokumenta, ali ju je detektor prepoznavao kao
naslov visoke pouzdanosti (velika slova, veci font, kratka) i PREDODABIRAO. Popravak bi joj upisao
`Heading1`, pa bi oznaka usla u sadrzaj rada.

Izmjereno na `corpus-0221` (fpzg-politologija-zavrsni): jedini predodabrani kandidat bio je
p12 "ZAVRSNI RAD". `looksLikeTitlePageLabel` sada iskljucuje oznake vrste rada, oznake uloga
("Student:", "Mentor:", "Kandidat:"), akademsku godinu, JMBAG i OIB. Uvjet je poklapanje CIJELOG
odlomka, pa naslov poglavlja koji tu rijec samo sadrzi ("Diplomski rad kao zanr") ostaje kandidat;
gard to drzi negativnom kontrolom.

Ishod: `corpus-0221` 6/6 -> 5/6 postalo je 6/6 -> **6/6**.

Golden se promijenio na TOCNO JEDNOM dokumentu, `mef-doktorski-disertacija`, i to na BOLJE:
izbacivanje naslovnicke oznake iz naslova omogucilo je `section-surgery-fixeru` da umetne prijelom
sekcije prije Uvoda (rimski na prednjim listovima, arapski od Uvoda, naslovnica bez broja).
Commitani korpus nakon toga: 16 dokumenata, **0 padova, 0 regresija**, `mef-doktorski` 84 -> 93 uz
drugi prolaz no-op.

### RIJESENO: popravak je zapis literature pretvarao u NASLOV

Ovo je zavrsetak nalaza koji je dugo bio zaveden kao "drugi prolaz nije no-op". Ne-idempotentnost
je bila SIMPTOM, a ne kvar: `local-37-zavrsni` je u drugom prolazu dobivao jos jednu izmjenu, i tek
je trazenje uzroka pokazalo sto se stvarno dogadja.

`REF_SECTION` u `src/analysis/heading-structure.ts` iskljucuje samo NASLOV popisa ("Literatura"),
ne i pojedine zapise. Zapis literature pocinje brojem kao i poglavlje ("8. ..."), a
`MAX_TEXT_LENGTH` je 180 znakova, pa je zapis prolazio kao kandidat za naslov, i to
`selectedByDefault`. Izmjereno: kandidat p355 bio je
`"8. Lezaic A. Komunikacija u zdravstvenom timu. Ses..."`, a popravak je jednom zapisu doista
upisao `Heading1`.

Posljedica nije kozmeticka. Takav "naslov" ulazi u SADRZAJ (TOC) i u hijerarhiju naslova, dakle
kvari upravo ono sto popravak treba srediti, i to u dokumentu koji korisnik placa.

`looksLikeBibliographyEntry` sada iskljucuje takav odlomak. Uvjet je KUMULATIVAN i namjerno uzak,
da ne pojede stvaran naslov: mora biti numeriran (`^\d{1,3}\. `), dug barem 40 znakova, i nositi
potpis bibliografije (inicijali autora tipa "Prezime A." ili "Prezime AB,", DOI, URL, raspon
stranica, ili godina uz volumen). Numerirano poglavlje ("8. Rasprava o rezultatima istrazivanja")
i dalje jest kandidat; gard to drzi negativnom kontrolom.

Ishod: `local-37-zavrsni` 1. prolaz 6 izmjena, **2. prolaz 0**, 3. prolaz 0. Golden suite
(`docx-golden`, `repair-golden`, `real-corpus`, `heading-style`) prolazi NEPROMIJENJEN.

Gard: `src/analysis/heading-structure.test.ts` (cetiri testa, s negativnim kontrolama nad
poglavljem i nad kratkom kraticom).

### Povijesni zapis: drugi prolaz nije no-op (bilo 38 od 50)

Ne-idempotentnost (primjena ISTOG recepta drugi put ponovno mijenja dokument) bila je najsiri
razlog pada. Radi se o INTERAKCIJI vise fixera u istom prolazu, ne o pojedinom fixeru:
pojedinacno primijenjeni fixeri JESU idempotentni (dokazano nad `fer-diplomski-puna-struktura`).

Mjereno 2026-08-22 nad `docs/generated/repair-real-corpus.local.json` (52 dokumenta, 38 stvarnih
studentskih radova + 14 commitanih): **1 od 52** pada `secondPassNoOp`, dokument
`local-37-zavrsni` (`fpzg-politologija-zavrsni`). Drugi prolaz ponovno mijenja dokument tocno
jednom izmjenom, i to `heading-style-fixer`.

Provjereno da NIJE posljedica `deep` zastavice: isti dokument ponovno se mijenja i uz
`buildDefaultRepairRequests(items, { deep: false })`, dakle uz stari, plitki recept. Raniji
lokalni izvjestaj koji je tvrdio 0 od 50 nastao je prije trenutnih podataka profila.

Zasto to nije samo kozmetika: korisnik koji dvaput klikne Popravi dobiva dva razlicita dokumenta.
Nije opasno po integritet (paket ostaje ispravan, nema regresija), ali jest neodredjenost koju
placeni proizvod ne bi smio imati.

Commitani korpus (14 dokumenata) je cist, pa `npm run check` ostaje zelen; gard je
`tests/real-corpus.test.ts`, koji tvrdi `secondPassNoOp` po dokumentu.

### Rijeseno u istom prolazu

- `link-doi-fixer` je rusio provjeru "Datumi pristupa mreznim izvorima": kanonizacijom golog
  DOI-ja u `https://doi.org/...` referenca bi TEK TADA usla u `urlRefs`, pa bi se za nju
  trazio datum pristupa. DOI je trajan identifikator i nijedan stil za njega ne trazi
  "pristupljeno", pa je popravljena PROVJERA (`IS_DOI_REF` u `analyze-docx.ts`), ne fixer.
- `toc-field-fixer` mijenja vidljivi tekst (5 od 12 commitanih radova). Odlukom vlasnika
  upisan je kao cetvrti dopusteni mehanizam (CLAUDE.md), jer tekst sadrzaja generira Word iz
  polja. **Uvjet koji jos nije ispunjen:** potvrda Tier 2 oraclem (`npm run verify:word`).

## Provenijencija: generiranje PRAVIM alatima (F2)

Do 2026-08-23 provenijencijska os korpusa bila je prazna. Izmjereno: svih 38 stvarnih radova
(`tests/fixtures/docx-local/`) i svih 17 tadasnjih commitanih fixtura nosilo je
`Microsoft Office Word`. LibreOffice, Google Docs i Pages imali su NULA dokumenata, a jedini
"LibreOffice" svjedok (`synthetic-libreoffice-standard-default.docx`) bio je RUCNO sastavljen XML,
ne izlaz alata.

    npm run corpus-gen:libreoffice -- --out .artifacts/corpus-gen-lo

`scripts/corpus-gen/libreoffice.mjs` gradi Flat ODF (`.fodt`), pa ga PRAVI `soffice --headless`
pretvara u `.docx`. Sadrzaj je izmisljen (bezlicne recenice, nepostojeci autori i izdavaci), pa
nema osobnih podataka i fixture se smiju commitati. Vrijednosti oblikovanja NISU izmisljene nego
dolaze iz pravila profila, pa "uskladjen" znaci uskladjen s onim sto fakultet stvarno propisuje.

Gard je `tests/corpus-provenance.test.ts`: svaki `lo-*.docx` mora imati
`docProps/app.xml` `<Application>` koji pocinje s `LibreOffice/`. Bez toga je dovoljna jedna
zamjena datoteke dokumentom iz Worda da os tiho nestane, dok ime datoteke i dalje tvrdi suprotno.
Test nosi i negativnu kontrolu (Word fixture MORA pasti isti predikat).

Nedostupan alat se imenuje kao NEPOKRIVEN, nikad tiho preskace: bez LibreOfficea skripta izlazi
kodom 2 i ispisuje gdje ga je trazila.

### Sto je LibreOffice traka odmah nasla

**1. RE-03 svjedok ne odgovara stvarnom LibreOfficeu.** Sinteticki
`synthetic-libreoffice-standard-default.docx` modelira default stil `Standard` uz `w:default="1"`.
Stvarni LibreOffice 26.2 pise `Normal` i NIJEDAN paragraph stil ne oznacava kao default. Kvar koji
taj svjedok opisuje danasnji LibreOffice ne proizvodi na taj nacin.

**2. Popravak tvrdi izmjenu koje nema kad tijelo NIJE u stilu `Normal`.** Fixeri fonta, velicine,
proreda i poravnanja rasudjuju iskljucivo o stilu `Normal` i o `docDefaults`
(`src/repair/fixers.ts`, "Normal stil: provjera nadjacava li cilj"). LibreOffice tijelo rada stavlja
u stil `BodyText`, koji sam definira font i velicinu i time nadjacava oboje.

Izmjereno na `lo-fpzg-zavrsni-neuskladjen.docx`:

| | vrijednost |
| --- | --- |
| changelog tvrdi | `Font: Arial -> Font: Times New Roman` |
| `docDefaults` poslije | Times New Roman, 24 half-pointa |
| stil `BodyText` poslije | **Arial, 22 half-pointa** (nepromijenjen) |
| `format.font.dominant` | **1/8 -> 1/8**, dakle nista |

Nije rijec o tihom no-opu nego o LAZNOJ TVRDNJI: korisnik dobiva stavku u changelogu za izmjenu
koja se nije dogodila. Isto vrijedi za velicinu, prored i poravnanje.

**Popravljeno 2026-08-23.** Kvar je imao TRI sloja, ne jedan:

1. `patchDefaultFont`, `patchDefaultSpacing` i `patchDefaultAlignment` pisali su cilj u
   `docDefaults` i u zadani paragraf stil. Dodan je cetvrti korak nad stilom kojim je tijelo
   STVARNO oblikovano (`resolveBodyParagraphStyleId`, `src/repair/xml-patch.ts`). Stil se bira po
   TEZINI TEKSTA, isti kriterij koji analiza koristi za `dominantFont`, uz iskljucene naslove
   (ime stila ili `w:outlineLvl`), natpise, sadrzaj i fusnote, i uz najmanji udio od 20 posto.
2. Deep ciscenje je PRESKAKALO cijeli odlomak cim mu `w:pStyle` nije bio doslovno dozvoljeni id
   (`hasNonTargetStyle`, `src/repair/run-level.ts`), pa je izravno oblikovanje ostajalo: 59
   odlomaka je zadrzalo `w:line="240"` i nakon popravka na 1,5. `allowedStyleId` sada prima POPIS
   (zadani stil plus stil tijela); naslovi i dalje ostaju netaknuti.
3. Poravnanje se nije naslijedilo. `readPPr` (`src/docx/parser.ts`) vraca `align: null` kad `w:jc`
   ne postoji, a `merge` je `Object.assign`, pa stil koji ima `w:pPr` bez `w:jc` PREPISE
   naslijedjenu vrijednost s null. `merge` NIJE mijenjan (dirao bi cijelu povrsinu bodovanja i
   svaki golden), nego popravak sada svojstvo upisuje izricito na stil tijela, kao sto to i Word radi.

Ishod na `lo-fpzg-zavrsni-neuskladjen.docx`: font 1/8 -> 8/8, velicina 1/6 -> 6/6, prored 1/6 -> 6/6,
poravnanje 2/4 -> 4/4, format stranice 1/3 -> 3/3. Ocjena 76 -> 92 (prije popravka kvara: 76 -> 77),
ishod `pass`, drugi prolaz no-op, nula regresija.

Doseg promjene, mjeren usporedbom golden snapshota prije i poslije: promijenila su se TOCNO DVA
dokumenta, oba LibreOffice fixture. Nijedan Word dokument u korpusu nije se promijenio.

Gard: `tests/repair-body-style.test.ts` (10 testova, s negativnim kontrolama da naslovi nikad ne
postanu "stil tijela" i da bez stila tijela na popisu deep i dalje preskace odlomak).

**Doseg PRECONDICIJE, izmjereno na 57 dokumenata (17 commitanih + 38 lokalnih + 2 nova):** 6 dokumenata ima
tijelo u stilu koji nije `Normal` i koji sam definira font ili velicinu. Cetiri od njih su STVARNI
studentski radovi iz Worda: `NormalWeb` (Wordov stil za sadrzaj zalijepljen s weba) u tri rada i
`Standardno` (hrvatski lokaliziran naziv) u jednom. Na ta cetiri rada kvar se danas NE ocituje jer
im te osi ionako prolaze, pa nema sto popravljati; precondicija ipak postoji i jedna promjena
oblikovanja dijeli ih od istog ishoda.

## Ulaz stvarnih radova: `corpus-ingest` (F1)

    npx vite-node scripts/corpus-ingest.mts -- --in <izvor> --out <odrediste> --consent <zapis>

Cita izvor SAMO ZA CITANJE, pseudonimizira u memoriji i pise iskljucivo u odrediste. Nema zastavice
za rad na mjestu. Vrata su izlazni kodovi, ne upozorenja: **2** nema ili nije valjan zapis o
dopustenju, **3** `--in` i `--out` se preklapaju ili je `--out` unutar repozitorija, **1** barem
jedan dokument je odbijen.

Odrediste MORA biti izvan repozitorija, a harness ga cita preko `LEKTA_CORPUS_SOURCE`. Razlog je
mjeren: gitignoriran direktorij unutar stabla je jedan `git add -f` daleko od objave, a
`tests/fixtures/docx-local/_mapping.json` je vec nosio prezimena u citljivom obliku.

### Doseg pseudonimizacije, i sto ona NE jamci

Rjecnik se gradi iz dva izvora: metapodataka i atributa (`dc:creator`, `cp:lastModifiedBy`,
`Company`, `Manager`, `w:author`, `w:initials`, `w15:author`) te naslovnice, po dvije
visokopouzdane sheme (ime iza oznake uloge tipa `Mentor:`, i odlomak koji se SAM sastoji od dvije
ili tri velike rijeci). Zamjena ide po granici rijeci definiranoj preko NE-slova, a ne preko `\b`,
jer je `\b` u JS-u ASCII pojam i pred hrvatskom dijakritikom pada.

Nakon zamjene se pokrece leak scan nad SVIM dijelovima paketa; dokument s ijednim preostalim
pojmom se ODBIJA, ne isporucuje.

**Ogranicenje koje se mora izgovoriti.** `leaks: 0` znaci samo da nije preostao nijedan PREPOZNAT
pojam. Ime koje nije u metapodacima i ne stoji ni u jednom od dva navedena oblika moze preostati.
Prva izvedba je gradila rjecnik SAMO iz metapodataka, pa je na 182 od 246 stvarnih radova rjecnik
bio prazan, a tvrdnja "0 procurjelih pojmova" vakuumska: mjereno je da 218 od 246 dokumenata i
dalje nosi uzorak "Ime Prezime" na naslovnici. Nakon dodavanja naslovnice rjecnik je narastao sa
132 na 883 pojma, a dokumenata bez ijednog prepoznatog pojma je sa 182 palo na 76.

Zato sidecar NE tvrdi vise nego sto zna: nosi `completeness` i `vacuous`, a dokument kojem nije
prepoznato nista izricito je oznacen (`vacuous: true`, `completeness: "nista-nije-prepoznato"`).
Uz `scope: local-testing` (dokument nikad ne napusta disk, ne commita se i ne dijeli) taj preostali
rizik je prihvatljiv; uz bilo koji siri scope nije.

### RIJESENO (dio) i OTVORENO (dio): naslovi na stvarnim radovima

**Rijeseno: predlozena razina je preskakala hijerarhiju.** `inferUnnumberedLevels`
(`src/analysis/heading-structure.ts`) razinu izvodi iz RANGA velicine fonta, neovisno o susjedima:
naslov s trecom najvecom velicinom dobivao je razinu 3 i kad mu je prethodnik razina 1. Popravak je
taj prijedlog doslovno upisivao, pa je `structure.heading.hierarchy` padao IZ prolaza u upozorenje.
Kod je pritom SAM prijavljivao `skipped-level` upozorenje, a svejedno predlagao skok.

`normalizeProposedLevels` sada spusta razinu tako da nijedan predlozeni naslov ne preskace. Tri
granice, sve tri izmjerene a ne pretpostavljene:

- Racuna se samo nad naslovima koji ce STVARNO postojati u popravljenom dokumentu (postojeci Word
  naslovi + PREDODABRANI kandidati). Prva izvedba je hodala po svim kandidatima, pa je neodabran
  kandidat drzao `previous` visoko i spustanje se nije dogodilo.
- NUMERIRANI naslov se ne dira: "1.1.1" je autorova objava trece razine, pa bi spustanje
  proturjecilo tekstu u dokumentu. Takav preskok i dalje ide u `skipped-level` upozorenje
  (postojeci test to cuva).
- Spusta se samo NADOLJE, nikad nagore.

Ishod na `corpus-0147` (efzg-seminarski): 6/6 -> 5/6 postalo je 6/6 -> **6/6**; razina odlomka 12
je 3 -> 2, pa odlomak 18 na razini 3 vise ne preskace. Golden suite (`docx-golden`,
`repair-golden`, `real-corpus`) prolazi NEPROMIJENJEN, dakle zahvat ne dira dokumente kojima
izvedena razina ionako nije preskakala.

Gard: `src/analysis/heading-structure.test.ts` (tri nova testa, s negativnim kontrolama da se
razina nikad ne PODIZE i da neodabran kandidat ne moze "pokriti" skok).

**Otvoreno, ali NIJE kvar popravka: provjera hijerarhije prolazi vakuumski.**
`evaluateHeadingHierarchy` broji samo porast za vise od jedne razine izmedju UZASTOPNIH naslova.
Dokument kojem su SVI naslovi razine 3, bez ijednog roditelja, time prolazi 6/6: prvi naslov nema
prethodnika, a svi ostali su jednaki. Izmjereno na `corpus-0221`: nizovi `p5:L3 p6:L3 p7:L3
p11:L3 p13:L3 ...`. Kad popravak doda ispravan naslov rada na razini 1 (odlomak 12), odlomak 13
odjednom IMA prethodnika vise razine i provjera padne u upozorenje.

To je dakle IZLAGANJE zatecene mane dokumenta, ne steta koju je popravak napravio: popravljeni
dokument je objektivno bolji (ima naslov rada), a provjera je ta koja prije nije imala sto
usporediti. Posljedica u proizvodu je ipak stvarna: `detectPassRegressions` to vidi kao regresiju
i demotira popravljeni dokument na sporedan izbor. Ispravak bi trazio promjenu SAME PROVJERE
(kaznjavanje siroceg naslova bez roditelja), sto dira bodovanje svih dokumenata i nije napravljeno.

**Otvoreno: `toc.coverage` daje LAZNU regresiju kad popravak doda naslov.** Izmjereno na
`corpus-0084` (pravo-integrirani-diplomski):

| mjera | prije | poslije |
| --- | --- | --- |
| `toc.coverage` | 3/3 | **1/3** ("3 naslova nije pronadjeno u sadrzaju") |
| naslova u dokumentu | 42 | 45 |
| stavki sadrzaja | 41 | **41** |
| `hasTocField` | true | true (49 polja oznaceno `w:dirty`) |

Dokument ima ZIVO TOC polje, a popravak je polja oznacio za osvjezavanje pri otvaranju. Word ce
sadrzaj regenerirati i tri nova naslova ce se pojaviti; analiza cita POHRANJEN (ustajao) tekst
sadrzaja, pa vidi 41 stavku prema 45 naslova. To je isto rasudjivanje kojim CLAUDE.md opravdava
izuzece `toc-field-fixera` ("tekst sadrzaja GENERIRA Word iz polja").

Posljedica u proizvodu je stvarna: `detectPassRegressions` to broji kao regresiju i demotira
ISPRAVNO popravljen dokument na sporedan izbor, pa sucelje korisniku preporuci original koji je
losiji. Popravak bi bio uzak (izuzeti `toc.coverage` iz regresije kad je `hasTocField` istinit i
polja su oznacena `w:dirty`), ali dira ugovor isporuke, pa nije napravljen bez odluke vlasnika.
Tier 2 (`npm run verify:word:toc`) je alat koji to moze presuditi doslovno.

### Zatecen nalaz (prije popravka): `heading-style-fixer` obara provjere naslova

Prvo mjerenje nad prosirenim korpusom (102 dokumenta: 14 commitanih, 38 lokalnih, 50 novih iz
ingesta) dalo je **4 pada**, a `heading-style-fixer` sudjeluje u SVA CETIRI:

| dokument | profil | regresija | ocjena |
| --- | --- | --- | --- |
| `corpus-0147` | `efzg-seminarski` | Hijerarhija naslova -> warn | **100 -> 98** |
| `corpus-0221` | `fpzg-politologija-zavrsni` | Hijerarhija naslova -> warn | 82 -> 82 |
| `corpus-0084` | `pravo-integrirani-diplomski` | Naslovi dokumenta <-> sadrzaj -> warn | 75 -> 75 |
| `local-37` | `fpzg-politologija-zavrsni` | (ne-idempotentnost, drugi prolaz mijenja) | - |

`corpus-0147` je najgori slucaj: dokument koji je bio 100/100 popravak je pogorsao. Primjena Word
Heading stilova stvara hijerarhiju koju provjera `structure.heading.hierarchy` zatim obara.

**Doseg je uzi nego sto brojka sugerira, i to se mora reci.** Na sva tri dokumenta stavka ima
`requiresConfirmation: true`, dakle u sucelju trazi izricitu korisnikovu potvrdu. Harness ju
primjenjuje automatski (bira po `violated !== false` i ne modelira korak potvrde), pa njegov `fail`
precjenjuje ono na sto korisnik naidje zadanim tokom. Kvar je svejedno stvaran: korisnik koji
potvrdi dobiva losiji dokument, a tekst potvrde spominje samo uklanjanje izravnog fonta, velicine
i poravnanja, ne i moguce rusenje hijerarhije naslova.

Korisnika za sada stiti ugovor isporuke: `detectPassRegressions` se izvodi PRIJE preporuke, pa uz
regresiju glavna ponuda postaje IZVORNI dokument.

### Sto je izmjereno na prvom stvarnom ulazu (2026-08-23)

246 dokumenata iz `C:/Users/PC/Documents`, 58 MB, sve izvan repozitorija:

- 246 prihvaceno, 0 odbijeno; **245 od 246** prolazi Tier 1 (`strict-open.py`).
- Jedini pad NIJE posljedica ingesta: izvorni dokument sam nema `png` Default u
  `[Content_Types].xml`, pa ga python-docx odbija. Word takav paket tolerira. To je stvaran,
  neuredan ulaz kakav korpus i treba.
- **198 od 246 nema prepoznat profil** (trazi se i ustanova i vrsta rada i profil u registru), pa
  ne sudjeluju u mjerenju dok im se profil ne dodijeli rucno.
- Ondje gdje fakultet ima vise programa, dodjela uzima PRVI profil za par (jedinica, vrsta rada).
  Unutar FPZG-a su pravila prakticki ista, ali to je pogodak, ne dokaz, i tako je i oznaceno.

## Kompozitni fixturi

Izolirani predlošci u `tests/helpers/repair-templates.ts` pokrivaju po jednu sposobnost i imaju
točno 4 zip dijela. Takav dokument ne može proizvesti lančanu klasu buga, gdje jedan fixer obori
sve kasnije u istom prolazu (RE-47, RE-55). Zato postoje kompozitni dokumenti u
`tests/helpers/composite-docx.ts`, generirani u `tests/fixtures/docx/` skriptom
`npx vite-node scripts/gen-composite-fixtures.mts`.

Novi kompozitni fixture ide u tri commita, nikad u jednom:

1. **N**: generator + test koji gradi bajtove u memoriji i tvrdi Tier 0. Nula generiranih datoteka.
2. **N+1**: `.docx` + sidecar sa `"synthetic": true`, pa `npm test -- -u`. Mijenjaju se točno dva
   snapshota; **ovdje se čita diff**, jer se tek tu vidi što svaki fixer radi s novim strukturama.
3. **N+2**: makni `synthetic`, pa REDOM `npm run repair-real-corpus` →
   `npm run repair-faculty-matrix` → `npx vite-node scripts/generate-real-corpus-backlog.mts`.

Nikad ne mijenjaj semantiku harnessa i ne dodavaj fixture u istom commitu. Ako novi fixture otkrije
bug, bug dobiva vlastiti commit **prije** registracije; asercija se ne relaksira.

## Tier 2: Word kao orákul (`scripts/word-verify/`)

Jedina provjera koja odgovara na pitanje "hoće li se dokument otvoriti kod korisnika bez poruke
*Word je popravio dokument*". `Documents.Open` se zove s `OpenAndRepair = $false`, pa oštećen
dokument baca iznimku umjesto tihog oporavka.

```bash
npm run verify:word         # a/b/c: Wordov zadani, izravno oblikovanje, izmijenjen stil Normal
npm run verify:word:worst   # dokument najgoreg slučaja (naslovnica, tablica, slika, fusnote)
```

`check.ps1` mjeri **drugi odlomak** kao tijelo teksta, pa vrijedi samo za dokumente oblika
naslov + tijelo. Dokument najgoreg slučaja počinje naslovnicom čiji je drugi odlomak namjerno
centriran, pa ga `check.ps1` izričito preskače; njega provjerava `check-worst-case.ps1`.
