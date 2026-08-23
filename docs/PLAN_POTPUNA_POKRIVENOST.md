# PLAN_POTPUNA_POKRIVENOST.md

Plan zatvaranja jaza izmedju "407 registriranih profila" i tvrdnje "Lekta provjerava i
popravlja svaki akademski rad u Hrvatskoj". Datum: 2026-08-19. Osnovica: `master` @ cb74b5d.

Format zadatka: problem, datoteke, AC (acceptance criteria), testovi, velicina, prioritet.
Tvrdo pravilo za svaki: `npm run check` zelen; parser/repair izmjene nikad bez golden testa
koji PRVO dokazuje zateceno ponasanje; nijedno novo bodovano pravilo bez sluzbenog izvora.

---

## 0. Izmjereno stanje (ne prepisano iz audita)

Sve brojke ispod ponovno su izmjerene nad zivim repozitorijem 2026-08-19, ne preuzete.
Cetiri se razlikuju od ulaznog audita i te razlike mijenjaju plan.

| Velicina | Audit tvrdi | Izmjereno | Izvor mjerenja |
|---|---:|---:|---|
| Registrirani profili | 407 | **407** | `data/manifest.json` |
| Jedinice (fakulteti) u matrici | 131 | **131** | `docs/generated/faculty-matrix.json` |
| Scored coverage redci | 386 | **386** | `data/coverage/scored-coverage.json` |
| Profili BEZ coverage retka | 21 | **24** | registar minus `cells[].profileId` |
| Profili s nula bodovanih pravila | 17 | **17** | `cells[].scored === 0` |
| Pravila koja cekaju ljudski audit | 26 | **38** (8 profila) | `npm run worklist` |
| Bodovanih pravila (matrica) | 2135 | **2135** | `scoredMachineCheckable` |
| Bodovanih pravila (worklist) | 2150 | **2208** | ziva regeneracija worklista |
| Profili bez fakultetskog repaira | 34 | **40** | `repair-coverage.json`, `offeredOptionCount === 0` |
| Programa bez `expectedProfileIds` | 2 | **3** | `institutional-coverage-matrix.json` |
| Stvarni DOCX uzorci / profili | 12 / 9 | **12 / 9** | `faculty-matrix.json` |
| Stvarni DOCX na PASS | 0 | **0** (12 review) | `repair-real-corpus.json` |
| Synthetic closed-loop izveden | 0 | **0 od 407** | `syntheticClosedLoopNotRunCount` |
| Registrirani fixeri / profilni | 31 / 5 | **31 / 5** | `repair-coverage.json.summary` |
| Predlosci naslovnica | 198 | **198** | `templates-index.json` |
| Verificirani citatni specovi | 71 | **71** | `data/tools/citation-specs/verified/` |
| Fakultetske izjave | 0 | **0** (`[]`) | `data/declarations/declarations.json` |

### 0.1 Cetiri ispravka koja mijenjaju posao

**(a) "Razlika 2135 vs 2150" NIJE nepomirena razlika od 15 pravila.** Dva broja mjere dvije
razlicite stvari i oba su tocna:

- `scored-coverage.json` je pod poljem `totalScored` (od P0-2: `scoredMachineCheckable`) drzao 2135, sto
  broji **samo `machineCheckable`** bodovana pravila
  (`scripts/recompute-coverage.mjs`, isti uvjet kao `src/verification/coverage-report.ts`).
- Worklist broji **sva** bodovana pravila. Ziva vrijednost danas je **2208**, ne 2150.
- Razlika je **73 pravila** koja su bodovana ali nisu strojno provjerljiva: `citation-style`,
  `required-sections`, `reference-count`.

Pravi kvar je drugi: **`data/verification/dossiers/INDEX.md` je USTAJAO**. Commitani kaze
2150/26, regeneracija istog skripta daje 2208/38 i tri nova dosjea (`effectus-seminarski` 10,
`effectus-diplomski` 1, `effectus-zavrsni` 1). `scored-coverage.json` ima drift gard
(`tests/coverage-report.test.ts`), dosjei ga nemaju. Zato P0-1 nije "objasni razliku" nego
"stavi svaki generirani artefakt pod isti drift gard i imenuj metriku".

**(b) Rupa oko `section-surgery-fixer` je vec zatvorena.** Audit ju navodi kao otvorenu, ali
commit cb74b5d (`src/analysis/check-fixer-map.ts:165-186`) ju je IZMJERIO: 4 profila koja
emitiraju tu provjeru nemaju `section-surgery-rules`, a svih 22 profila koja te rules imaju
nikad tu provjeru ne emitiraju. `manual` je tocna klasifikacija, mapiranje bi bilo lazno
obecanje. Zadatak ispada iz plana; ostaje samo tripwire ako ikad neki profil dobije oboje.

**(c) Cetiri assisted provjere bez `fixId` OSTAJU stvarna rupa** i to je uzi, tocniji nalaz od
"25 fixera se ne koristi": `structure.heading.word-styles`, `element.table.caption`,
`element.figure.caption`, `element.lists` (`src/analysis/check-fixer-map.ts:133-137`). One
imaju `groupKey` ali ne i fixer, pa `repairCeiling` za njih ostaje ispod 100.

**(d) 40, ne 34, profila nema nijednu ponudjenu repair opciju**, a 24, ne 21, nema coverage
redak. Skupovi se preklapaju ali nisu isti: coverage redak izostaje kad profil nema NIJEDAN
draft entry, repair opcija izostaje i kad draftovi postoje ali nijedan nije bodovan.

---

## 1. Nacelo plana: jedan gate, ne devet izvjestaja

Danas devet generiranih artefakata (`scored-coverage`, `faculty-matrix`, `repair-coverage`,
`repair-real-corpus`, `real-corpus-backlog`, `repair-recipe`, dosjei, citatni dosjei,
`institutional-coverage-matrix`) opisuju isti sustav iz razlicitih kuteva, s razlicitim
brojevima i razlicitom svjezinom. Nijedan pojedinacno ne odgovara na jedino pitanje koje
zanima kupca: **"je li MOJ studij, MOJA vrsta rada, dokazano pokrivena i do koje razine".**

Zato plan uvodi jedan izvedeni artefakt, `docs/generated/completion-ledger.json`, s
**jednim retkom po (programId, workType)** i sest ortogonalnih osi po retku:

| Os | Vrijednosti | Izvor |
|---|---|---|
| `program` | `official` / `derived` / `missing` / `unsupported` | Upisnik (P1) |
| `rules` | `verified` / `bulk-pending` / `advisory-only` / `none` / `no-technical-rules` | scored coverage + ledger |
| `repair` | `faculty-specific` / `universal-hygiene` / `manual-only` | repair-coverage |
| `proof` | `real-docx-pass` / `synthetic-pass` / `review` / `not-run` | closed loop + real corpus |
| `assets` | `exact-official` / `exact-derived` / `reused` / `generic` / `unavailable` / `conflict` | naslovnice, citati, izjave |
| `claim` | javna formulacija koju smijemo prikazati | izvedeno iz gornjih pet |

Nijedan zadatak ispod nije gotov dok njegov ucinak nije vidljiv kao promjena osi u tom
ledgeru. Time nestaje "1752 od 1752 mapirano" kao lazno stopostotni signal: taj broj postaje
jedna celija jedne osi, ne naslov.

---

## FAZA P0: gard istine (temelj, blokira sve ostalo)

Cilj: nijedan generirani broj vise ne smije biti ustajao ili dvosmislen. Bez ovoga svaka
sljedeca faza mjeri sama sebe.

### P0-1. Drift gard za SVE generirane artefakte : GOTOVO (2026-08-19)
- Problem: `dossiers/INDEX.md` commitan kao 2150/26, ziva regeneracija daje 2208/38. Uz to je 70
  od 71 citatnog dosjea bilo ustajalo (naslovi stilova bez dijakritike, npr. "FER numericko
  navodenje" umjesto "FER numeričko navođenje"). `scored-coverage.json` je gard imao, oboje ovo nije.
- Zajednicki uzrok: obje su logike zivjele u `.mjs` skriptama koje vitest ne moze uvesti (jedna
  zbog CRLF zavrsetaka, druga jer je TS motor ucitavala kroz esbuild-IIFE trik), pa se izlaz nije
  MOGAO staviti pod gard. Lijek nije bio novi test nego premjestanje logike u `src/`.
- Izvedeno:
  - `src/verification/worklist.ts` + `scripts/verification-worklist.mts` (`npm run worklist`);
    stara `.mjs` obrisana. Port dokazano vjeran: svih 5 postojecih dosjea regenerirano
    BAJT-IDENTICNO, mijenjaju se samo brojke u INDEX-u i tri nova `effectus` dosjea.
  - `src/verification/citation-dossier.ts` + `scripts/citation-spec-dossier.mts`
    (`npm run citation-dossiers`); esbuild vise ne treba, motor je obican import.
  - `tests/verification-worklist.test.ts`, `tests/citation-dossier.test.ts`: usporedjuju SVAKU
    commitanu datoteku sa svjezim izracunom, plus tvrdnja da u direktoriju nema datoteke koju
    generator vise ne pise (uklonjen audit inace ostavlja trag).
- Dokaz da gard grize: rucno postavljanje "Za audit (bulk): 26" u INDEX obara test s porukom
  `data/verification/dossiers/INDEX.md je ustajao`.
- Usporedba se radi normalizirano na `\n`, jer `core.autocrlf=true` te .md pretvara u CRLF na
  checkoutu; gard cuva sadrzaj, ne politiku zavrsetaka redaka.

### P0-2. Imenuj metriku, ukloni dvosmislenost 2135/2208 : GOTOVO (2026-08-19)
- Problem: dva razlicita broja citirala su se kao "bodovana pravila".
- Izvedeno: `CoverageCell.scored` preimenovan u `scoredMachineCheckable` (ime sada nosi svoju os),
  dodan `scoredTotal`. Matrica nosi `scoredMachineCheckable: 2135`, `scoredTotal: 2208`,
  `scoredNonMachineCheckable: 73` i razlaganje `nonMachineCheckableByCheckId`:
  `{citation-style: 49, required-sections: 23, reference-count: 1}`.
- Gard: `tests/coverage-report.test.ts` trazi da razlika bude IZRACUNATA (zbroj razlaganja ===
  razlika, i po celijama i ukupno) i da ne-strojne osi mogu biti samo te tri; svaka nova os rusi
  test dok je se ne objasni. `tests/verification-worklist.test.ts` zakljucava da je worklistov
  `scoredTotal` isti broj kao coverage `scoredTotal`, pa se dva izvjestaja vise ne mogu razici.
- Potrosaci azurirani: `scripts/recompute-coverage.mjs`, `scripts/generate-coverage-page.mjs`,
  `scripts/port-faculty.mjs`, `tests/agr-profile.test.ts`.

### P0-3. `completion-ledger.json` generator i shema : GOTOVO (2026-08-19)
- Izvedeno: `src/verification/completion-ledger.ts` (cista funkcija, bez fs i bez vremena) +
  `scripts/generate-completion-ledger.mts` (`npm run completion-ledger`) +
  `docs/generated/completion-ledger.json`. Ledger nista ne mjeri sam: SPAJA vec drift-gardirane
  artefakte (coverage, worklist, faculty-matrix, repair-coverage, institucijska matrica,
  naslovnice, citatni specovi, izjave) i iz njih IZVODI tvrdnju.
- Zatecena mjera (436 redaka, 410 profila):
  - program: derived 23, **missing 413** (sluzbeni Upisnik ne postoji, faza P1)
  - pravila: verified 380, bulk-pending 8, advisory-only 19, none 29
  - popravak: faculty-specific 346, universal-hygiene 37, manual-only 53
  - dokaz: review 9, **not-run 427**
  - tvrdnja: **C 346, D 42, E 48; A i B: nula**
  - pomocni sadrzaji (razlozeno, jer je zbirna os najslabiji clan): naslovnica exact-official 209 /
    exact-derived 131 / reused 33 / generic 60; citat exact-official 246 / generic 187;
    izjava generic 433 (P6-3 je jos prazan)
- Ljestvica je vodjena osima PRAVILA -> POPRAVAK -> DOKAZ, a NE osi programa. "Program nije
  evidentiran" ne znaci da je profil los, nego da nasa nacionalna matrica ima rupu; ta rupa blokira
  GLOBALNU tvrdnju i biljezi se zasebno (`programGaps`, `nationalClaimBlockers`), umjesto da tiho
  degradira svaki pojedini profil.
- Gard (`tests/completion-ledger.test.ts`) ima dvije skupine: drift (commitani === svjezi) i
  POSTENJE. Druga je vaznija: A i B traze `rules: verified` + `faculty-specific` + stvaran dokaz;
  samo A smije biti bez ijednog razloga blokade; bulk-pending nikad ne doseze A ni B; E znaci
  doista nula bodovanih pravila. Bez toga bi drift gard mirno propustio olabavljenu ljestvicu.
- NALAZ IZ IMPLEMENTACIJE: fakultetska matrica pokriva 407 verificiranih profila, ali NE i 3
  katedarska profila iz `data/profiles/legal-departments.json` (`trgovacko-pravo`,
  `radno-socijalno-pravo`, `sociologija`), iako svaki nosi 6 bodovanih pravila i uredan coverage
  redak. Da je ledger bio vodjen matricom, tiho bi izgubio tri profila. Zato ga vodi REGISTAR, a
  profil kojeg matrica ne pokriva dobiva izricit `blockedReason` umjesto da nestane. Zasebna
  posljedica je P2-6.

### P0-4. Javna tvrdnja se izvodi iz ledgera, ne iz copyja : GOTOVO (2026-08-19)
- Zatecen problem: `pokrivenost.html` je imala VLASTITU ljestvicu od cetiri razine, racunatu samo
  iz udjela bodovanih pravila. Najvisa se zvala "Potpuno pokriveno" i dodjeljivala se profilu
  kojemu automatski popravak nikad nije pokrenut ni na jednom dokumentu. Dvije ljestvice nad istim
  podatkom, od kojih jaca ne zna za dokaz, tocno su nacin na koji copy prestigne dokazano.
- Izvedeno: svaki redak ledgera nosi `claimLabel`, doslovnu formulaciju prepisanu iz
  `CLAIM_LADDER`. Generator stranice je PREPISUJE, nikad ne srice. Najvisa oznaka pokrivenosti
  preimenovana je u "Sva pravila bodovana" (sto i mjeri), a stranica uz svaki profil prikazuje
  razinu A-E s objasnjenjem da bodovana pravila ne znace izveden popravak.
- Gard (`tests/coverage-page-claims.test.ts`): nijedna formulacija razine ne smije postojati kao
  literal u generatoru; generator mora citati ledger; "Potpuno pokriveno" vise ne smije postojati u
  izvoru. Provjera generirane stranice sama se preskace dok `dist/` ne postoji.

---

## FAZA P1: sluzbena nacionalna matrica programa

Cilj: ne moze se tvrditi pokrivenost programa koji nikad nije evidentiran. Danas
`institutional-coverage-matrix.json` ima 35 programa (od kojih 3 vec bez profila) nasuprot
131 jedinici i 407 profila; to je uzorak, ne registar.

### P1-1. Shema sluzbenog identiteta programa : GOTOVO (2026-08-19)
- Izvedeno: `src/programs/program-schema.ts` (identitet, validator, `programNeedsProfile`) i
  `data/programs/program-registry.json`, seedan idempotentnom skriptom
  `scripts/seed-program-registry.mts` (`npm run seed-program-registry`).
- ZATECENO STANJE KOJE JE SEED OTKRIO: jedini dosadasnji zapis o programima,
  `data/coverage/institutional-coverage-matrix.json`, pokriva **35 programa nad TOCNO DVIJE
  jedinice** (fpzg, pravo) od 134 u katalogu - i **nijedan kod ga nije citao**. Nije bio
  nacionalna matrica nego uzorak dvaju pilot-fakulteta.
- Disciplina: polja koja zna samo Upisnik (`officialProgramCode`, jezik, nacin izvodjenja,
  jedno/dvopredmetnost, akademska godina) ostaju `null`. Validator TVRDO zabranjuje
  `officialProgramCode` bez `provenance.kind === 'upisnik'`, a `upisnikSynced` je `false`, pa
  nijedan zapis ne moze glumiti sluzbeni identitet. Seed nikad ne prepisuje postojeci zapis.

### P1-2. Harvest i snapshot Upisnika : GOTOVO (2026-08-19)
- Izvor je pronadjen mjerenjem, ne pretpostavkom: stari `mozvag.srce.hr/preglednik` vise ne
  postoji (redirect u 404). Ziva sluzbena evidencija je **Upisnik studijskih programa**,
  `https://hko.srce.hr/usp` (MZOM; programsku podrsku odrzava Srce).
- Izvedeno: `src/programs/upisnik-parse.ts` (cist parser) + `scripts/harvest-programs.mts`
  (`npm run harvest-programs`) + `tests/upisnik-parse.test.ts` nad uzorkom izrezanim iz STVARNOG
  odgovora, pa CI ne treba mrezu.
- IZMJERENO: **1312 akreditiranih programa kroz 151 sastavnicu**. Nas registar ima 35 programa
  nad 2 jedinice. Razmjer rupe je time prvi put brojka, a ne slutnja.
  - Sveucilisni diplomski 361, prijediplomski 294, specijalisticki 271, strucni prijediplomski
    167, doktorski 100, strucni diplomski 76, integrirani 42, strucni kratki 1.
- Tri stvari koje su se morale otkriti mjerenjem, i sve su zapisane u skripti da se ne moraju
  otkrivati ponovno:
  1. **Sesija je obavezna** - poziv na `/usp/pretrazivanje` bez kolacica sa `/usp/index` vraca
     aplikacijsku gresku, ne prazan rezultat.
  2. **Prazan parametar nije "sve"** - sentinela je `0` (`-1` za `strucniNaziv`), a checkbox grupe
     traze i svoj `_`-marker (Spring MVC obrazac): bez `_vrsta=on` i drugova pretraga puca.
  3. **Cijeli registar stane u JEDAN zahtjev** (~1 MB), pa nema paginacije ni 1312 pojedinacnih
     dohvata detalja; server se dira jednom.
- Shema iz P1-1 je time POTVRDJENA protiv stvarnog izvora: `sifraUpisnik` je tocno nas
  `officialProgramCode`, a `jezikIzvodenja`, `nacinIzvodenja`, `nacinImplementacije`,
  `jednopredmetni`, `akGodIzvodenja`, `nositelj` i `izvodac` postoje kao parametri pretrage.
- Sto NIJE pretpostavljeno: naziv u tablici uvijek pocinje jednom znamenkom (1 na 1239 programa,
  2 na 72, 5 na jednom). To je strukturni marker sucelja i ostaje NEPROTUMACEN u `nameMarker`.
  Izgleda kao oznaka jezika naziva, ali dok to nije potvrdjeno iz izvora, `language` se iz njega
  ne izvodi. Skida se tocno jedna znamenka, pa program koji se doista zove "3D dizajn" ostaje
  citav (test to dokazuje).
- AC ispunjeni: puni preglednicki headeri; snapshot hashiran i spremljen u gitignoriran
  `.artifacts/` (ne commita se, isto pravilo kao za PDF-ove); harvest pise u
  `data/programs/drafts/`, NIKAD u registar; ponovni dohvat nad nepromijenjenim izvorom ne stvara
  diff (provjereno usporedbom dva uzastopna dohvata).
- Zamka koju skripta izricito hvata: aplikacija na neispravan upit vraca **HTTP 200 sa stranicom
  greske**, pa status sam po sebi nije dokaz uspjeha.

### P1-3. Reconcile: program <-> profil : GOTOVO (2026-08-19)
- Izvedeno: `src/programs/reconcile.ts` + `scripts/reconcile-programs.mts`
  (`npm run reconcile-programs`) + `docs/generated/program-reconcile.json`.
- Kljucna podjela koju izvjestaj radi, a naivno "profil nema program" ne bi:
  - **jedinica uopce nije u registru** (danas 384 profila) - rupa je u NASEM registru;
  - **jedinica jest u registru, a profil nijedan program ne trazi** (danas 6) - uzak, stvaran nalaz.
  Bez te podjele bi se drugi, koristan nalaz utopio u prvom.
- Izmjereno: 35 programa (32 povezana, 0 ceka profil, 3 izvan opsega), 410 profila (20 povezanih),
  **132 od 134 jedinice bez ijednog programa**. Jedinice su IMENOVANE u izvjestaju, ne samo
  prebrojane.

### P1-4. CI gate na sluzbenu matricu : GOTOVO (2026-08-19)
- `data/programs/reconcile-ratchet.json` + `tests/program-reconcile.test.ts`.
- Ratchet trazi JEDNAKOST, ne samo gornju granicu: regresija pada, ali i napredak mora biti upisan,
  pa se poboljsanje ne moze dogoditi tiho (obrazac "no silent caps").
- Uz ratchet idu i strukturne tvrdnje: nijedan program ne nosi sluzbenu sifru dok Upisnik nije
  sinkroniziran, program bez profila uvijek ima izricit razlog, i polja koja zna samo Upisnik
  ostaju `null` umjesto da ih seed "popuni" nagadjanjem.

### P1-6. Prijenos harvestiranih programa u registar : PRIJEDLOG GOTOV (2026-08-19)
- Izvedeno: `src/programs/unit-match.ts` + `scripts/match-upisnik-units.mts`
  (`npm run match-upisnik-units`) + `docs/generated/upisnik-unit-match.json` +
  `tests/unit-match.test.ts`. Modul NIKAD nista ne upisuje u registar: svakom izvoditelju daje
  najbolju jedinicu, razinu pouzdanosti, RAZLOG i alternative, pa covjek potvrdjuje.
- IZMJERENO: 131 pojedinacni izvoditelj naspram 134 nase jedinice.
  **exact 72, strong 1, weak 37, bez para 21.** Nasih jedinica upareno 108, bez ijednog
  izvoditelja 26. Programa cija nijedna sastavnica nije uparena: 74.
- Dvije strukturne cinjenice izvora koje se ovdje tumace (parser ih cuva sirove):
  1. `$` razdvaja VISE izvoditelja kod zdruzenih programa (44 od 1312).
  2. Zarez NIJE pouzdana granica "ustanova, sastavnica" ("Istarsko veleuciliste, Pula" iza zareza
     ima MJESTO), a Upisnik koristi i crticu ("Sveuciliste u Splitu - Sveucilisni odjel...").
- Dvije greske uhvacene mjerenjem, obje zakljucane testom:
  - goli naziv sveucilista je preklapanjem rijeci zavrsavao na proizvoljnom odjelu
    ("Sveuciliste Josipa Jurja Strossmayera u Osijeku" -> `biolos`, 0.80). Program koji izvodi
    CIJELO sveuciliste ne pripada jednom odjelu, pa takav izvoditelj sada ostaje neuparen uz
    alternative. Posljedica je postena, ne bolja brojka: programa bez jedinice poraslo je s 10 na
    74, jer je 64 njih prije imalo lazno uvjerljiv par.
  - taj isti gard je zatim 28 ispravnih `exact` nalaza spustio na `strong` (samostalna ustanova s
    jednom jedinicom istog naziva); vraceno, pa `exact` ostaje 72.

#### Tri nalaza za ljudsku odluku
1. **Geotehnicki fakultet (Varazdin) uopce nije u nasem katalogu** - nula pogodaka na "Geoteh"
   medju 134 jedinice, a Upisnik mu pripisuje 3 programa. Stvarna rupa, ne problem uparivanja.
2. **Splitski odjel je preimenovan**: Upisnik ga vodi kao "Sveucilisni odjel zdravstvenih
   studija" (7 programa), a nas katalog kao `ozs` = "Fakultet zdravstvenih znanosti (Split)".
   Isti entitet, drugo ime; matcher ga ne moze vidjeti, covjek moze.
3. **Pula (42 programa) i Slavonski Brod (13)** navode kao izvoditelja GOLO sveuciliste, iako
   njihove sastavnice u nasem katalogu postoje. Za tih 55 programa se veza program -> jedinica iz
   ovog izvora ne moze izvesti; treba drugi izvor ili ljudska dodjela.

#### Alat za potvrdjivanje (2026-08-19)
- `src/programs/unit-match-decisions.ts` + `scripts/approve-unit-match.mts`
  (`npm run approve-unit-match`) + `tests/unit-match-decisions.test.ts`.
- Odluke zive u `data/programs/unit-match-decisions.json` (AUTORSKI sloj), pa regeneracija
  prijedloga u `docs/generated/` NIKAD ne pregazi ljudsku odluku.
- Validator ne dopusta: odluku bez potpisa, odluku bez jedinice i bez razloga, razlog izvan
  zatvorenog skupa (`foreign-institution`, `whole-institution`, `unit-not-in-catalog`,
  `ambiguous`), jedinicu koja ne postoji u katalogu, ni odluku za izvoditelja kojeg vise nema u
  harvestu (preimenovanje u Upisniku se tako ne provuce tiho).
- Svaka odluka pamti STO JE STROJ PREDLAGAO (`proposed`), pa se kasnije vidi gdje je covjek
  odstupio (`overrides` u pokrivenosti).
- POUKA IZ P2-1 UGRADJENA UNAPRIJED: skupno odobrenje (`--accept-exact`) je dopusteno, ali ostaje
  VIDLJIVO kao skupno (`bulk: true`). Verifikacijski worklist je zatekao 38 pravila koja su
  izgledala potvrdjeno a bila su odobrena skupno; ta se razlika mora zapisati u trenutku odluke
  jer se kasnije ne moze rekonstruirati.
- Ispis `--list` sortira po broju programa, pa se prvo rjesava ono sto najvise nosi; za splitski
  slucaj alat sam nudi `ozs` medju alternativama.

#### Sto jos ostaje
- AC za dovrsetak: svaki prenesen zapis nosi `provenance.kind = 'upisnik'` i
  `officialProgramCode`; registar dobiva `upisnikSynced: true` tek kad prijenos zavrsi;
  `reconcile-ratchet.json` se azurira, a completion ledger tada prvi put smije prikazati
  `program: 'official'`.
- Velicina: L. Prioritet: P1.

### P1-5. Dva studija Pravnog fakulteta koja nijedan program ne trazi
- Nadjeno pri P1-3 (2026-08-19): od 6 profila koje u pokrivenim jedinicama nijedan program ne
  trazi, cetiri su OPCI (rezervni) profili i to je po prirodi tocno - hvataju rad kojem korisnik ne
  zna tocan studij. Preostala dva nisu: `pravo-socijalne-djelatnosti-doktorski` i
  `pravo-socijalne-djelatnosti-specijalisticki` izgledaju kao stvarni studiji kojih u matrici nema.
- AC: oba dobiju zapis u registru programa (uz izvor), ili se dokaze da su podskup vec postojeceg
  programa pa se vezu na njega. Test tada ocekuje samo cetiri opca profila.
- Velicina: S. Prioritet: P1.

---

## FAZA P2: zatvaranje pravila

### P2-1. 38 bulk-pending pravila kroz ljudski pass
- Profili: `effectus-seminarski` 10, `kif-specijalisticki` 9, `efos-doktorski` 5,
  `efos-specijalisticki` 5, `pravri-specijalisticki` 5, `kif-diplomski` 2,
  `effectus-diplomski` 1, `effectus-zavrsni` 1.
- Datoteke: `data/verification/dossiers/*`, `scripts/approve-profile.mjs`.
- AC: `verifiedBy !== 'owner-bulk-approval'` za svih 38; INDEX.md pokazuje 0 bulk.
- Napomena: rad je ljudski (otvaranje PDF snapshota na lokatoru), alat samo priprema dosje.
- Velicina: M (ljudski sat, ne kod). Prioritet: P1. Bez kodne ovisnosti, moze odmah.

### P2-2. 24 profila bez coverage retka dobivaju eksplicitan zapis : GOTOVO (2026-08-19)
- Zatecen kvar: coverage matrica je preskakala profil bez ijednog staging pravila, pa 24 profila
  nisu postojala ni u jednom izvjestaju. Tiho odsustvo je izgledalo isto kao da profila nema.
- Izvedeno: matrica sada ima **410 celija umjesto 386** (svaki registrirani profil), a svaka
  celija nosi `state`:
  - **`scored` 369** - ima bodovanih pravila;
  - **`advisory-only` 17** - pravila postoje, nijedno nije bodovano (to je tocno skup iz P2-3);
  - **`no-rules-sourced` 24** - nema nijednog pravila i jos nije istrazeno zasto.
- Kljucna razlika koja se NE smije skratiti: `no-rules-sourced` znaci "jos nismo istrazili", a ne
  "pravila nema". Zakljucak o odsutnosti pravila (`no-technical-rules`, `source-not-found`) smije
  doci ISKLJUCIVO iz `data/profiles/no-rules-reasons.json`, gdje ga je covjek potpisao nakon
  pretrage izvora; test to tvrdo cuva.
- `ratio` je sada `number | null`: nula bi lazno sugerirala izmjeren promasaj tamo gdje mjerenja
  uopce nije bilo.
- `npm run recompute-coverage` ispisuje obje radne liste IMENOM (24 za P2-2, 17 za P2-3), pa je
  posao odmah izvediv umjesto da se izvodi iz brojke.
- Manifest `SCORED_COVERAGE` 386 -> 410; completion ledger cita `state` umjesto da zakljucuje iz
  odsutnosti retka.

### P2-3. 17 profila s nula bodovanih pravila
- Profili: `alu-diplomski`, `efzg-seminarski`, `fer-diplomski`, `fer-zavrsni`,
  `ffos-informatologija-{diplomski,zavrsni}`, `foozos-diplomski`,
  `fsb-{diplomski,zavrsni,opci-akademski-rad}`, `muza-diplomski`, `pmf-geofizika-graduate`,
  `unidu-sestrinstvo-zavrsni`, `unizd-filozofija-{diplomski,zavrsni}`,
  `unizd-francuski-diplomski`, `unizd-talijanistika-diplomski`.
- Za svaki tocno jedan ishod: (1) nadjeno sluzbeno pravilo pa port kroz `ruleEntries`;
  (2) dokazano da fakultet ne propisuje tehnicke zahtjeve pa `no-technical-rules` s citatom
  ili biljeskom o iscrpljenoj pretrazi; (3) pravila postoje ali nisu javna pa
  `source-not-found` s popisom provjerenih lokacija.
- Prioritetno FER (`fer-zavrsni`, `fer-diplomski`): jedini profili koji imaju STVARNE DOCX
  fixture a nemaju nijedno bodovano pravilo. To je dokaz da "imamo dokument" i "imamo
  pravila" nisu spojeni u jedan gate; ledger iz P0-3 ih spaja.
- Velicina: L. Prioritet: P1. Ovisi o: P2-2.

### P2-4. Profili bez fakultetskog repaira : IZMJEREN, backlog je 5 a ne 40 (2026-08-19)
- Audit je prijavio 34 takva profila, mjerenje je dalo 40. Oba broja mjere ISTU, preusku stvar:
  `offeredOptionCount` broji samo PROFILNU granu (`buildRepairableItems`), koja pokriva sest osi
  (font, velicina, prored, format papira, poravnanje, margine). Asistirane stavke ulaze kroz
  vlastite ulazne tocke i u tom brojacu se ne vide.
- Izvedeno: `src/programs/repair-gap.ts` + `scripts/repair-gap-report.mts` (`npm run repair-gap`)
  + `docs/generated/repair-gap.json` + `tests/repair-gap.test.ts`. Klasifikacija ide IZ PODATAKA.
- **Cetiri razlicite pojave, cetiri razlicita ishoda:**

| Vrsta | Broj | Sto zapravo znaci |
|---|---:|---|
| `no-scored-rules` | 24 | Posljedica P2-2/P2-3, ne zaseban kvar. Isti onaj skup od 24 profila. |
| `assisted-profile-gated` | 6 | Profil nosi gate (`requireToc`, `headingRules`), pa se popravak KORISNIKU NUDI. Rupa je u MJERENJU, ne u proizvodu. |
| `not-repairable-by-nature` | 5 | Jedina pravila su `page-count` i `citation-style`. Opseg se ne postize oblikovanjem, stil se ne izmislja. **Ispravna nula.** |
| `rule-shape-unusable` | 5 | `required-sections` je slobodan popis naziva; fixer treba kanonske kljuceve (`required-section-rules`). **Podatkovni posao.** |

- STVARNI P2-4 BACKLOG su dakle **5 profila** (`dizajn-diplomski`, `par-zavrsni`, `par-diplomski`,
  `umas-zavrsni`, `umas-diplomski`): njihovo `required-sections` pravilo treba prevesti u
  `required-section-rules` oblik, uz izvor. Plus popravak mjere za 6 profila.
- Provjereno usput, da se ne prijavi lazan kvar: gejt `requiredSectionsRepairableItem` trazi
  `checkId === 'required-section-rules'` dok 130 pravila nosi `required-sections`. To NIJE mrtav
  gejt: `required-sections` je `machineCheckable: false` slobodan popis, a `required-section-rules`
  nosi `order` + `labels` s kanonskim kljucevima. Samo drugi oblik moze voditi fixer.
- `toc-field-fixer` je ziv (`TOC_FIELD_LIVE = true`) i gejtan s `profile.requireToc === true`;
  `heading-format-fixer` s `profile.headingRules`. Oba se dakle nude tim profilima.

### P2-5. `pravo`: dva doslovna citata nisu u snapshotiranoj ekstrakciji
- Nadjeno pri P0-1 (2026-08-19), zatecen kvar: citatni spec `pravo` je `verified`, ali quoteRaw za
  vrstu izvora `clanak` ("Koske, I.; Naru, F.; Beiter, P.; Wanner, I., Regulatory Management
  Practices in OECD") i za pravni izvor ("Primjer za navoenje zakona u biljesci: Zakon o obveznim
  odnosima...") NE postoje u `data/tools/citation-specs/extractions/pravo.txt`. Provjereno: ni
  "Koske" ni "Regulatory Management" nema u ekstrakciji.
- Zasto je vazno: to je jedini blokator medju 71 specom i nije renderer nego PROVENIJENCIJA -
  covjek je potpisao citat koji se ne moze naci na lokatoru. Isti obrazac koji `sourcePage: null`
  disciplina inace sprjecava kod ruleEntries.
- AC: ili se citat nadje u pravom izvoru pa se ekstrakcija/sourcePage isprave, ili se spec vrati u
  `needs-recheck`. `tests/citation-dossier.test.ts` tada tvrdi prazan popis blokatora umjesto
  `['pravo']`.
- Napomena: do tada je popis ZAKLJUCAN na tocno taj jedan blokator, pa rupa ne moze ni utihnuti ni
  narasti. Velicina: S (ljudsko citanje izvora). Prioritet: P1.

---

## FAZA P3: potpun graf provjera i popravaka

### P3-1. Cetiri assisted provjere bez fixera : IZMJERENO, mapiranje NIJE opravdano (2026-08-20)
- Postupak je isti kao kod `section-surgery` (cb74b5d): mjerenje PRIJE koda. Ishod je OBRNUT od
  preporuke audita.
- Prvo, tvrdnja audita da im "repairCeiling ostaje ispod 100" NE STOJI: `groupKey` ih vec svrstava
  u `assisted`, a strop gleda samo `fixability === 'manual'` (`result-readiness.ts`). Stvarna
  posljedica je uza: `finding-view-model` racuna `autoRepairable: !!triage?.fixId`, pa kartica ne
  prikazuje gumb "Otvori mogucnost popravka".
- Mjerenje nad svih 15 stvarnih fixtura (`tests/heading-caption-fix-offer.test.ts`):
  - `structure.heading.word-styles` NE prijavi nalaz ni na jednom dokumentu. Nema dokaza da je
    provjera ikad vidljiva, pa se fixer ne smije obecati na temelju pretpostavke.
  - `element.table.caption` / `element.figure.caption` PRIJAVLJUJU nalaz, ali popravak natpisa tada
    NIJE ponudjen (`pravo-integrirani-fusnote.docx`). Provjera se javlja kad natpisa NEMA, a
    `elementCaptionRepairableItem` treba `elementStructure.candidates` - elemente na koje se natpis
    moze objesiti. Mapiranje bi obecalo gumb koji ne otvara nista.
  - `element.lists` SE emitira (`word-veliki-neuredan.docx`), ali fixer za njega ne postoji.
- USPUT OBORENA VLASTITA STATIKA: ranije brojanje `requireListsWhenElements` po
  `verified-profiles-heavy.json` dalo je 0 od 410 profila, a dokument pokazuje suprotno. Zastavica
  se dobiva KOMPILACIJOM `ruleEntries`, ne stoji u heavy datoteci. Statika nad pogresnim izvorom je
  izgledala uvjerljivo; samo je stvarni dokument to otkrio.
- ZAKLJUCAK: nijedan od cetiri fixId se ne dodaje. Sve cetiri ostaju `assisted` bez fixera, uz
  mjerenje zapisano u testu.

### P3-1b. Kartica nalaza bez ijedne radnje : POPRAVLJENO (2026-08-20)
- Kvar koji je mjerenje otkrilo usput, i koji je stvarniji od nalaza zbog kojeg se mjerilo: nalaz
  `assisted` bez `fixId` nije dobivao ni gumb za popravak (ovisi o `fixId`) ni gumbe za rucnu
  odluku (ovisili su o `fixability === 'manual'`). Kartica je ostajala BEZ IJEDNE radnje. Isto se
  dogadjalo svakom nalazu kad popravak nije dostupan.
- Lijek vezuje uvjet uz ono sto se STVARNO prikazuje: kad nema gumba za popravak, nudi se rucna
  odluka. Time se ne obecava popravak kojeg nema, ali se korisnika ne ostavlja bez izlaza.
- Gard: `tests/finding-view-model.test.ts` (tri nova slucaja).

### P3-2. Kombinacijski testovi fixera koji pomicu indekse : GOTOVO, uz izmjeren sudar (2026-08-20)
- Izvedeno: `src/repair/index-shift-pairs.test.ts`. Tri invarijante nad redoslijedom (svaki
  index-shifting fixer ima izricit rang; nema mrtvih rangova; rangovi su jedinstveni) plus mjerenje
  koje broji odlomke PRIJE i POSLIJE, pa clanstvo izvodi iz PONASANJA, ne iz pamcenja autora.
- Invarijante su prosle, ali su vrijedne: fixer koji nije u `INDEX_SHIFTING_ORDER` tiho dobiva rang
  0 i izvodi se medju prvima u strukturnoj fazi, dakle kao da radi na kraju dokumenta. Nista to
  dosad nije prijavljivalo.

#### Nadjen kvar, pa nadjeno da popravak nije u redoslijedu
- `element-caption-fixer` UMECE odlomke (natpis, "Izvor:", uz `lists` i cijeli "Popis tablica" s
  TOC poljem), a nije bio u `INDEX_SHIFTING_FIXERS`. Po RE-46 to znaci da se izvodi u prvoj fazi i
  pomice mete svim strukturnim fixerima iza sebe.
- Premjestanje u strukturnu fazu je IZMJERENO golden harnessom i dalo je GORE stanje na
  `fer-diplomski-puna-struktura.docx`: primijenjenih popravaka **6 -> 5**, a natpisi su TIHO ispali
  iz changeloga. Razlog: fixer je istovremeno ANCHOR-OSJETLJIV, pa ga bibliography i citation-sync,
  koji u toj fazi idu prije njega, oslijepe prepisivanjem odlomaka.
- Nijedan redoslijed ne rjesava sudar, isto kao RE-55 (link-doi vs bibliografija). Izmjena je zato
  VRACENA, a sudar je zapisan kao `INSERTS_BUT_ANCHOR_BOUND` u kodu i zakljucan testom: fixer mora
  biti u tocno jednom od dva skupa, nikad tiho ni u jednom. Pravo rjesenje je vlasnistvo nad
  odlomkom ili ponovni izracun sidara izmedju faza, ne redoslijed.
- Golden harness je ovdje odradio tocno ono zbog cega postoji: zaustavio je izmjenu koja je
  izgledala kao ocit popravak, a mjerljivo je stetila.

### P3-2b. `table-figure-rescue-fixer` : IZMJEREN i svrstan (2026-08-20)
- Isti obrazac kao `element-caption-fixer`, ali SUPROTAN ishod, sto je i bio razlog da se mjeri
  umjesto da se zakljuci po analogiji.
- Izmjereno: u `landscape` grani (rotacija siroke tablice, uz izricitu korisnikovu potvrdu) umece
  odlomak s portret sekcijom, pa pomice mete strukturnim fixerima iza sebe.
- Premjestanje u strukturnu fazu je provjereno golden harnessom: **nijedan `applied` broj se nije
  promijenio**, mijenja se samo redoslijed unosa u changelogu i u `skipped` (5 redaka premjesteno,
  bez ijedne promjene sadrzaja). Za razliku od `element-caption-fixera`, ovaj se u drugoj fazi NE
  oslijepi.
- Zato je svrstan u `INDEX_SHIFTING_FIXERS` s rangom 2 (tijelo rada, iza literature). Test iz P3-2
  sada trazi da bude u tocno jednom od dva skupa i za njega.
- ZAMKA ZABILJEZENA USPUT: `vitest -u` nad ovim testom pada u timeout od 60 s i pritom UKLONI
  snapshot datoteku kao zastarjelu (`1 files removed`), pa izgleda kao da je golden nestao. Ispravno
  je `npx vitest run tests/repair-golden.test.ts -u --testTimeout=600000`.

### P3-3. Idempotencija po fixeru : IZMJERENO, pokrice je 9 od 31 (2026-08-20)
- Zadatak je izgledao kao "napisi testove idempotencije". Mjerenje je pokazalo da test VEC postoji
  i vrti se nad svih 31 fixera (`tests/repair-golden.test.ts`), ali da preskace svaki fixer koji na
  sintetickom dokumentu nista ne promijeni - i to TIHO, jednim `continue`.
- IZMJERENO: **22 od 31 fixera se nikad ne aktivira**, pa je tvrdnja o idempotenciji za njih
  vakuumska. Stvarno je provjereno njih **9**. Test je izgledao kao gard nad cijelim motorom, a
  pokrivao je manje od trecine.
- Neaktivirani su, medju ostalima: `bibliography-repair`, `citation-bibliography-sync`,
  `consistency`, `croatian-typography`, `empty-paragraph`, `field-integrity`,
  `final-document-inspector`, `heading-format`, `link-doi`, `page-numbering`, `paper-size`,
  `submission-metadata`, `toc-field`, `title-page`, `required-section`, `section-surgery`,
  `element-caption`, `table-figure-rescue`.
- Izvedeno: popis je sada IZRICIT i zakljucan (`NOT_EXERCISED_ON_SYNTHETIC`), pa novi fixer koji se
  ne aktivira mora biti upisan umjesto da nestane u preskoku. Uz to je dodan prag koji se smije
  samo dizati: broj stvarno provjerenih fixera ne smije pasti ispod 9.
- ZATVORENO (2026-08-20): mjerenje je nastavljeno korak dalje i suzilo zadatak jos jednom. Od 22
  neaktivirana fixera, njih **16 ima idempotenciju u VLASTITOM testu** (bibliography, croatian
  typography, field-integrity, toc-field, title-page, required-section, table-figure-rescue i dr.),
  pa je njihovo odsustvo iz goldena uredno pokrice na drugom mjestu, a ne rupa. Stvarna rupa bila je
  **7 fixera bez ikakvog vlastitog testa**: `paper-size`, `empty-paragraph`, `heading-format`,
  `footnote-typography`, `footnote-spacing`, `page-numbering`, `page-number-alignment`.
- Za svih 7 napisan je `src/repair/idempotence-gaps.test.ts`, sa dokumentom koji fixer DOISTA
  aktivira. Svaki slucaj tvrdi tri stvari: paket ostaje ispravan, PRVI prolaz je nesto promijenio
  (inace bi tvrdnja bila vakuumska), i drugi prolaz vraca bit-identicne bajtove.
- Napomena o mjerenju: prvi pokusaj prebrojavanja dao je lazan rezultat (glob u petlji nije
  pogadjao datoteke s crticom u imenu), pa je ispalo da `required-section` i `table-figure-rescue`
  nemaju idempotenciju iako je imaju. Rucna provjera dvaju slucajeva to je otkrila prije nego je
  usla u zakljucak.
- Sto i dalje ostaje (nije nuzno): sinteticki dokument treba obogatiti (fusnote, literatura, polja, naslovnica, sekcije)
  da aktivira i ostale, ili im dodati vlastite ulaze. Svaki skinuti unos s popisa je mjerljiv
  napredak. To je tek sada vidljiv posao; prije je izgledalo da je vec gotov.
- Napomena: `no-pass-regression` dio zadatka NIJE ovdje. On je vec pokriven na razini isporuke
  (`detectPassRegressions` prije preuzimanja, `tests/repair-delivery-order.test.ts`), sto je
  ispravnija razina od pojedinog fixera.

### P3-4. Sedam neiskoristenih DOCX predlozaka u profilnoj matrici
- Danas se koristi 1 od 8 (`basic-text-styles`). AC: svaki predlozak ili ima profil koji ga
  gadja ili je uklonjen; matrica prestaje prikazivati mrtve predloske kao kapacitet.
- Velicina: M. Prioritet: P2.

---

## FAZA P4: synthetic closed-loop za svih 407 profila

Najveci pojedinacni skok u dokazu, a tehnicki je vec pripremljen: `tests/helpers/docx-builder.ts`
gradi deterministicki `.docx` iz specifikacije (koristi ga `scripts/gen-golden-fixtures.ts`), a
`src/repair/default-selection.ts` daje tocno onaj skup zahtjeva koji korisnik dobije klikom na
Popravi.

### P4-1 i P4-2. Closed-loop kroz profile : PRVI PROLAZ (2026-08-20)
- Zateceno: closed-loop harness (`runClosedLoopCase`) je ZREO, ima 29 slucajeva i tvrdi sve sto
  P4-2 trazi (stvarna analiza -> popravak -> ponovna analiza, tekst ocuvan, paket cjelovit, nema
  regresije, drugi prolaz no-op). Ali svi slucajevi rucno grade svoj dokument, pa pokrivaju
  **TOCNO DVA profila od 410**. Zadatak dakle nije bio izgraditi petlju nego je provrtjeti.
- Izvedeno: `tests/helpers/violating-docx.ts` gradi dokument iz PROFILOVIH vlastitih pravila
  (`paramsForCheck` je jedini izvor ciljane vrijednosti, isti koji koristi sucelje), i
  `tests/closed-loop-profiles.test.ts` vrti petlju nad uzorkom od 8 profila iz razlicitih obitelji.
- **Zamka koju je mjerenje otkrilo:** `buildDefaultRepairRequests` sam po sebi NE reproducira ono
  sto korisnik dobije. Deep preklopnik je u sucelju UKLJUCEN po zadanom
  (`<input type="checkbox" checked />` u `repair-panel.ts`), a zahtjevi iz `default-selection` ga
  nemaju. Bez njega font, prored i poravnanje ostaju neprimijenjeni i petlja mjeri put koji nitko
  ne izvodi. `DEEP_CAPABLE` je zato izvezen da ga test moze zrcaliti.
- **Druga zamka, u vlastitom generatoru:** prvi dokument nije imao `Normal` stil s proredom i
  poravnanjem. Deep ciscenje tada izravno oblikovanje NE SMIJE ukloniti (nema na sto pasti), pa su
  prored i poravnanje ostajali nerijeseni koliko god se popravak vrtio. Ispravan model je onaj koji
  Word i pise: stil nosi ciljanu vrijednost, autor je nadjaca izravnim oblikovanjem.
- Stanje nakon oba ispravka: font, prored, poravnanje, margine i format papira se RJESAVAJU,
  tekst ostaje netaknut, nema regresija, paket ostaje cjelovit.

#### ISPRAVAK: "velicina se ne rjesava" bio je kvar generatora, ne proizvoda
- Prvi prolaz je zabiljezio da "Velicina osnovnog teksta" ostaje nerijesena na svakom profilu i to
  je proglaseno nalazom nad proizvodom. **Netocno.**
- `stripDirectFormatting` cisti izravnu velicinu SAMO unutar +-3 polutocke od cilja, i to je
  namjerno: 10 pt uz cilj 12 pt vjerojatnije je potpis ispod slike nego greska. Za to postoji
  izricit test, `src/repair/run-level.test.ts`: *"namjerno sitniji tekst (10 pt uz cilj 12 pt) je
  izvan tolerancije i ostaje"*.
- Moj generator je birao `cilj - 2 pt`, dakle tocno taj CUVANI slucaj, pa je ispravno i testirano
  ponasanje izgledalo kao kvar popravka. Ispravak je u generatoru (`cilj + 1 pt`, unutar
  tolerancije = stvarna pogreska oblikovanja), ne u fixeru.
- Nakon ispravka velicina se RJESAVA na svim profilima iz uzorka. Test sada drzi obje strane
  granice, pa se ni tolerancija ne moze tiho promijeniti.
- Pouka koja se ponavlja kroz cijelu ovu fazu: prije nego se ponasanje proglasi kvarom, treba
  provjeriti postoji li test koji ga izricito brani. Ovdje je postojao, i bio je u pravu.

#### Sto ostaje za punu pokrivenost
- Uzorak je 8 profila, ne 410: puna petlja je preskupa za `npm run check` (dvije analize plus
  popravak po profilu). Sirenje ide kroz zaseban pogon s ratchetom (P4-3), ne kroz ovaj test.
- `fer-diplomski` je u uzorku imenovan kao profil BEZ ijednog popravka, jer nema bodovanih pravila
  (jedan od 17 iz P2-3). To je uredno stanje, ali mora biti imenovano da se ne cita kao kvar.

### P4-3. Pogon kroz katalog i ratchet : GOTOVO (2026-08-20)
- `scripts/run-closed-loop.mts` (`npm run closed-loop`) vrti petlju kroz SVIH 407 profila i pise
  `docs/generated/closed-loop.json`. Izvan `npm run check` je namjerno: svaki profil su dvije
  stvarne analize plus popravak.
- Isti korisnicki tok kao test (dokument iz profilovih pravila, `buildDefaultRepairRequests` +
  `deep` kao u panelu) i isti `DOMParser` koji koristi produkcijski Web Worker
  (`installXmlDomParser`), pa pogon mjeri putanju koju korisnik doista dobiva.
- SEST ishoda, ne dva: `pass`, `no-rules`, `no-repair`, `unresolved`, `regression`, `error`.
  Razlika izmedju "profil nema pravila", "pravila ima ali nema popravka" i "popravak nije rijesio
  nista" je razlika izmedju urednog stanja i kvara; spajanje u "fail" daje brojku koja vodi na
  krivi posao (kao ono "40 profila bez popravka" koje je zapravo bilo 5).
- **IZMJERENO nad svih 407 profila: 327 `pass`, 45 `no-repair`, 33 `no-rules`, 2 `unresolved`,
  0 `regression`, 0 `error`.**
- Gard: `data/profiles/closed-loop-ratchet.json` + `tests/closed-loop-report.test.ts`. `regression`
  i `error` su TVRDA granica na nuli, ne ratchet; broj `pass` ne smije pasti.

### P4-4. POVUCENO: "cilj popravka i cilj provjere se razilaze" nije bio kvar proizvoda
- Prvi prolaz petlje dao je dva `unresolved` profila (`vuka-strojarski-*`) i to je proglaseno
  proturjecjem izmedju popravka i ocjene, s prioritetom P0. **Netocno; povuceno.**
- Izmjereno do kraja: `rules.margins` kaze 2/2/2/2,5, ali `effectiveRules.margins` kaze **3/3/3/3**.
  Overlay JEST primijenjen. Zivi app cita `effectiveRules`, pa ondje provjera i popravak traze istu
  vrijednost i proturjecja nema.
- Uzrok laznog signala bio je u HARNESSU: `golden-entry.resolveProfile` namjerno klonira
  naslijedjeni `entry.rules` (golden mjeri sirovi engine), pa je analiza mjerila protiv mirrora dok
  je popravak postavljao vrijednost iz zapisa. Ista zamka je vec zabiljezena u projektnoj memoriji.
- Onih "22 neslaganja `ruleEntry` vs `rules`" nisu kvar nego OCEKIVANO stanje Option A migracije:
  zapis je izvor istine, mirror je naslijedjen, a `effectiveRules` ih spaja. CLAUDE.md kao cilj
  migracije i navodi brisanje kljuceva iz `rules` kad su izrazeni kao `ruleEntry`.
- Ispravak u harnessu: `analyzeFixture` je dobio ADITIVAN `profile` override (zadana putanja
  nepromijenjena, golden snapshoti netaknuti), a pogon gradi profil kao zivi app -
  `effectiveRules` uz normalizaciju NAKON overlaya (bez nje 144 profila puca na
  `profile.size.some is not a function`, jer `applyEntry` upisuje `size: 12` gdje analizator
  ocekuje `[12]`).
- Ishod nakon ispravka: **329 pass, 57 no-repair, 21 no-rules, 0 unresolved, 0 regression,
  0 error.** Oba `vuka` profila prolaze.
#### Samoprovjera petlje: dvije greske u vlastitom mjerenju
- **Razlicite jedinice.** `resolved` je brojao NASLOVE provjera, a `violated` OSI, pa je omjer bio
  neusporediv i `pass` je znacio samo "barem se nesto promijenilo": profil kojem je od sest osi
  rijesena jedna prolazio je kao uspjeh. Ispravljeno: svaka prekrsena os mjeri se kroz SVOJ stabilni
  `checkId` (`format.font.dominant`, `format.size.body`, `format.spacing.body`,
  `format.justify.body`, `page.margins`, `page.size.*`), i uveden je zaseban ishod `partial`.
  Brojka je pala **329 -> 282**, dakle bila je precijenjena za 47.
- **Harness nije mjerio proizvod.** Preostali `partial` bili su gotovo svi na osi `paper-size`.
  Mehanizam provjeren: `efzg-diplomski` IMA `paper-size` zapis, ali `advisory` bez `autoFixable` -
  fakultet ga savjetuje, ne propisuje. Zivi engine takve dimenzije demotira
  (`applyScoredAdvisory`, max 0), a harness nije, pa je kao "neuspjeh popravka" mjerio ono sto
  uopce nije zahtjev. Nakon primjene iste politike: **323 pass, 6 partial**.
- Preostalih sest (`efzg-*` x4, `grad-*` x2) svi su na `paper-size`: profil trazi format, ali za tu
  os nema zapisa s fixerom pa popravak nije ponudjen. Podatkovni posao, ne kvar motora; imenovani su
  u ratchetu.
- ZAPAZENO USPUT (dokumentacija, ne kod): `src/profiles/advisory-demotion.ts` u komentaru tvrdi da
  tu logiku koristi i `resolveProfile` u `golden-entry.ts`, a `golden-entry` izricito pise suprotno
  (namjerno mjeri sirovi engine). Jedan od dva komentara je zastario i navodi na krivi zakljucak.

- Pouka, treca ovog tipa u ovoj fazi: prije nego se razlika proglasi kvarom, treba provjeriti mjeri
  li harness istu osnovicu koju koristi proizvod.

### P4-5. Closed-loop ozicen u ledger : GOTOVO (2026-08-20)
- `proof` os je dosad bila `not-run` za 425 od 436 redaka, jer je fakultetska matrica polje
  `syntheticClosedLoop` uvijek drzala na `not-run`. Ledger sada cita `docs/generated/closed-loop.json`.
- Redoslijed je po JACINI dokaza, ne po izvoru: stvaran studentski rad (`real-docx-pass`) nadjacava
  generirani (`synthetic-pass`); `review` je slabiji od oba; `not-run` je odsutnost dokaza.
- `partial` iz petlje NAMJERNO nije dokaz nego `review`: dio prekrsenih osi ostaje nerijesen, pa je
  popravak nesto napravio, ali ishod trazi ljudski pogled. Svrstati ga u `pass` znacilo bi ponoviti
  tocno onu gresku koja je maloprije ispravljena (spajanje `partial` i `pass`).
- UCINAK, prvi put mjeren:

| Os | Prije | Poslije |
|---|---|---|
| `proof` | not-run 425, review 11 | **synthetic-pass 337**, review 7, not-run 92 |
| `claim` | A 0, B **0**, C 346, D 42, E 48 | A 0, **B 329**, C 17, D 42, E 48 |

- Brojke se medjusobno slazu: 337 redaka ima dokaz, ali 8 ih ostaje na C jer im pravila cekaju
  pojedinacni ljudski audit (`rules: bulk-pending`, isti broj). Ljestvica dakle radi kako je
  zamisljena - dokaz sam po sebi ne dize razinu ako je neka druga os slabija.
- Razina A ostaje 0 i to je tocno: trazi stvaran studentski rad, a nijedan od 12 dokumenata u
  korpusu jos nije na `pass` (svi su `review`).

### P2-3b. Dosjei kandidata za pravila : GOTOVO (2026-08-20)
- 41 profil je na razini E jer nema nijedno bodovano pravilo. Prva pretpostavka bila je da to trazi
  prikupljanje izvora; MJERENJE je pokazalo suprotno: **svih 13 njihovih jedinica vec ima izvore na
  disku** (2 do 50 datoteka po jedinici). Posao je rudarenje, ne prikupljanje - isti zakljucak kao
  kod izjava.
- `scripts/extract_rule_candidates.py` nalazi mjesta koja govore o fontu, velicini, proredu,
  marginama i formatu papira, i uz svako biljezi STRANICU i doslovan kontekst. Izlaz:
  `docs/generated/rule-candidates.json` + dosje po jedinici u `data/verification/rule-dossiers/`.
- IZMJERENO: **479 kandidata kroz 10 jedinica**. Primjer koliko je konkretno - za `fer`
  (2 profila na razini E) dosje sadrzi: *"Stranica treba biti A4 formata"*, *"Tekst treba od ruba
  biti udaljen barem 2.5 cm (do 3 cm)"*, *"Preporuceni font Times New Roman (ili slican) velicine
  12... Arial ... velicine 11"*, *"Tekst poravnati s obje strane (engl. justify)"*. Time se
  "istrazi FER" pretvara u "potvrdi sest citata".
- SKRIPT NE ODLUCUJE. Vrijednost pravila i `checkId` upisuje covjek: pogresno pravilo boduje
  studentov rad krivo, a dio nalaza trazi prosudbu koju stroj ne smije donijeti (npr. FER pise
  "PREPORUCENI font" - je li to obveza ili preporuka mijenja i autoritet i bodovanje).
- Tri jedinice nisu dale nijednog kandidata (`fsb`, `geof`, `pravst`): njihovi snapshoti ili nemaju
  tekstualni sloj ili ne sadrze pravila oblikovanja. Te ostaju za rucni pregled.

## VERIFIKACIJSKI LANAC: mehanicka provjera + adversarijalni trio (2026-08-20)

Zamjena za "covjek upisuje svaki checkId". Nacelo: tri agenta koja citaju isti tekst dijele iste
sljepoce, pa SLAGANJE NIJE TOCNOST. Zato lanac ima dva sloja koja ne dijele te sljepoce.

### Sloj 1: `scripts/verify_rule_claims.py` (deterministicki, bez modela)
- **SIDRO**: citat se mora doslovno nalaziti u tekstu NAVEDENE stranice.
- **IZVOD**: vrijednost se mora moci izvesti iz citata (broj/naziv se u njemu doista pojavljuje).
- **KVALIFIKATOR**: citat koji sadrzi ublazavanje (`preporuceni`, `barem`, `do 3`, `iznimno`) ili
  uvjet (`ukoliko`, `ako se`, `ovisno o`, `neka bude`) ide covjeku - odluka je li nesto obveza nije
  citanje nego politika bodovanja.
- Dokazano da grize: podmetnuta tri kvara (citat s krive stranice, IZMISLJEN citat, vrijednost koja
  se ne izvodi) - sva tri pala. Usput nadjen bug u samom verifikatoru: odbijao je ispravnu tvrdnju
  jer citat pise `2.5`, a trazio se samo `2,5`.
- Rupa nadjena gledajuci sto je PROSLO: "Ukoliko se koristi font Arial ... moze koristi i font
  velicine 11" proslo je bez zastavice iako vrijedi samo uvjetno. Dodani uvjetni kvalifikatori.

### Sloj 2: adversarijalni trio (ne tri potvrde)
1. **Izvlacenje** - predlaze vrijednost + citat + lokator.
2. **Slijepo ponovno izvlacenje** - isti izvor, bez uvida u prvi odgovor.
3. **Pobijanje** - pretpostavlja da su tvrdnje pogresne i trazi proturjecje, doseg i modalitet.

### Pilot na FER-u: 4 od 5 tvrdnji OBORENO
- Mehanicki: 7/7 citata doslovnih, nijedna kriva stranica, nijedan izmisljen. Greske NISU bile u
  prijepisu nego u TUMACENJU - tocno ono sto stroj ne smije odlucivati.
- Slijepo izvlacenje naslo je sto prvo nije: razliku izmedju obveze i vrijednosti (glagol
  obvezujuci, ali vrijednost RASPON), sest dodatnih osi (zabrana preslikanih margina, razmak
  izmedju odlomaka, naslovi po razinama, natpisi, tablice, font za kod) i zamku s numeracijom
  (fizicka stranica 8 = tiskana oznaka 3).
- Pobijanje je naslo ono najvaznije: dokument ima TRI RAZINE MODALITETA (`mora`/`ne smije` -
  `treba` - `preporuceni`/`neka bude`) i **nijedna od pet tvrdnji nije u najjacoj**. Dokument se i
  sam odredjuje: *"Ovaj rad daje preporuke za pisanje..."*, autor je jedan nastavnik (2013.), sto je
  po hijerarhiji iz CLAUDE.md NAJNIZA razina autoriteta.
- Konkretne stete koje bi bodovanje tih pravila napravilo:
  - `font = Times New Roman` prijavilo bi kao gresku SUKLADAN kod (mora biti Courier New);
  - `font-size = 12` prijavilo bi sukladne naslove (14/13/12), natpise (9/10), kod (11/10) i tablice;
  - `margins = 2.5` uniformno **kodira NESUKLADAN dokument kao sukladan**, jer lijeva margina mora
    biti veca zbog uveza;
  - `line-spacing = 1.2` obara rad s 1,0 ili 1,4, a 1,2 uopce nije propis nego opis predloska.

### Zakljucak koji mijenja plan
`fer-diplomski` i `fer-zavrsni` NISU rupa u pokrivenosti. Njihovih 8 pravila je vec `advisory`,
`scoredTotal: 0`, i to je TOCNO stanje: FER u ovom dokumentu doista ne propisuje oblikovanje.
Postojeci komentar u draftu to vec kaze. Isto mjerilo treba primijeniti na ostalih 16 profila iz
P2-3 prije nego ih se proglasi nepotpunima - dio njih je vjerojatno takodjer tocan.

### Nadjen kvar u zivim podacima (za odluku)
`fer-diplomski` i `fer-zavrsni` imaju `citation-style = "ieee"` (i `rules.recommendedCitation`),
a citat koji ga potkrepljuje glasi: *"Ako je jako bitno, u tekst se moze izravno staviti referenca
na neku literaturu..."* - sto o IEEE stilu ne govori nista. Provjereno neovisno, ne po agentu.
Status je `advisory` pa NE boduje, ali `recommendedCitation` odredjuje koji citatni motor radi nad
dokumentom, dakle ucinak postoji. Traba reverifikacija: ili naci pravi citat, ili spustiti tvrdnju.

### Drugi krug: pet jedinica, 28 tvrdnji (2026-08-21)

Lanac je pusten na `efzg`, `unidu`, `unizd`, `pmf` i `ffos`, s izmjerenim ocekivanjem iz FER pilota:
pitanje NIJE "koliko pravila dobivamo" nego "koliko ih je legitimno advisory".

| jedinica | prolazi | pada | trazi covjeka | ishod |
|---|---|---|---|---|
| `efzg`  | 5/5 | 0 | 0 | bodovljivo |
| `unidu` | 5/5 | 0 | 1 (`font`) | bodovljivo osim fonta |
| `pmf`   | 4/4 | 0 | 1 (`font-size`) | djelomicno; izvor je ODJELNI |
| `ffos`  | 8/9 | 1 (`margins`) | 0 | bodovljivo osim margina |
| `unizd` | 5/5 | 0 | 5 (cijeli dokument) | ostaje advisory |

Nalazi koje bi cisto agentski pregled propustio:

- **`efzg`: iste vrijednosti, tri razlicita modaliteta.** A4 / Calibri ili TNR / 12 / 2,5 cm / 1,5
  pojavljuju se na str. 3 pod *"moze imati"*, na str. 10 pod *"u pravilu iznosi"* i na str. 13 kao
  nehedgirano *"Radovi se pisu..."*. Samo trece je odredba, i jedino ono vrijedi za SVE vrste rada.
  Bez razlikovanja modaliteta uzeo bi se bilo koji od tri i dva puta pogrijesilo.
- **`unizd`: dokument se odrice sam.** Pet tvrdnji proslo je 5/5 BEZ ijedne zastavice, jer recenice
  glase *"Format rada je A4 (210 x 297 mm)."* - prezent indikativa, jaci od *"treba"*. Ali isti
  dokument o sebi kaze: *"Predstavljaju samo jednu od vise mogucnosti kako se pisu navedeni
  studentski radovi"*. Snaga recenice ne moze nadjacati odricanje dokumenta.
  **Zakljucak: 14 unizd profila na razini E je TOCNO stanje, drugi potvrdjen "nije rupa" nakon FER-a.**
- **`pmf` ne propisuje font uopce.** Nijedna rijec o obitelji slova. Bodovanje fonta za pmf bilo bi
  izmisljeno pravilo. Uz to je citat iz `pmf-biol-diplomski-2026.pdf`, dakle iz uputa JEDNOG odjela;
  pmf je po odjelima, pa se pravilo ne smije prosiriti na geog/geol/math bez vlastitog izvora.
- **`ffos` margine nisu simetricne** (lijeva 25, desna 20, gornja/donja 25 mm). Uniformno
  `margins = 2.5` kodiralo bi NESUKLADAN dokument kao sukladan, isti kvar kao na FER-u.

### Verifikator je narastao na PET provjera, i to iz izmjerenih promasaja

Svaka nova provjera dodana je tek nakon sto je propustila konkretan slucaj, nikad preventivno:

4. **DOKUMENT se odrice** - dodana nakon `unizd`. Cita SVE stranice, ne samo citiranu, jer je
   odricaj tipicno u uvodu, a tvrdnja u sredini dokumenta.
5. **IZBOR umjesto ciljane vrijednosti** - dodana nakon `pmf`: *"treba biti 11 ili 12 pt"* nije jedna
   vrijednost. Popravak koji postavi 12 srusio bi rad legitimno pisan u 11. Za `font` je skup
   normalan i ne oznacava se; za brojcane osi nije.

Prozor od DVIJE recenice za odricaj isproban je i **odbacen**: odmah je dao lazno pozitivan nalaz na
`pmf-biol` (*"To se posebice preporucuje u slucajevima pitanja o prihvatljivosti same teme"*
preporucuje savjetovanje s mentorom, a samoreferenca je bila u susjednoj recenici o necem drugom).
Cetiri valjane odredbe bile bi srusene tudjom recenicom. Sada se trazi ista recenica.

Kontrola razlucivosti (bitna, jer gard koji uvijek okida je beskoristan): odricaj okida na `unizd`,
a NE okida na `unidu`, `efzg`, `pmf` ni `ffos`.

### Sto je ovaj krug dokazao o samom lancu
Agenti su bili tocni na sidru: svih 25 pmf/ffos citata naslo se doslovno, i to na TOCNOJ stranici
(provjereno pretragom kroz sve datoteke jedinice, pa je izvedena i datoteka koju agent nije naveo).
Promasaji nisu bili u citanju nego u **statusu**: sto je obveza, na koga se odnosi i je li vrijednost
jedna. To je tocno ono sto mehanicka provjera hvata, a slaganje triju agenata ne bi.

### Sto zapravo stoji iza "17 profila s nula bodova" (2026-08-21)

Peceni artefakt daje tocnu podjelu 410 celija: **369 `scored`, 17 `advisory-only`, 24 `no-rules-sourced`**.
Onih 17 je ono sto revizija broji kao nula-bodovne profile. Po jedinicama:

- `advisory-only` (17): unizd 4, fsb 3, fer 2, ffos 2, alu 1, efzg 1, foozos 1, muza 1, pmf 1, unidu 1
- `no-rules-sourced` (24): unizd 10, adu 6, alu 2, ffos 2, pravst 2, geof 1, unidu 1

#### Taksonomija ne razlikuje dva suprotna ishoda
`advisory-only` je opisan kao *"pravila postoje u stagingu, ali nijedno nije bodovano (izvor ili
verifikacija NEDOSTAJU)"*. Za FER i unizd to je netocno: izvor postoji, procitan je, i **dokazano ne
obvezuje**. To je konacno stanje, ne rupa.

Mehanizam za "dokazano nema pravila" VEC postoji (`data/profiles/no-rules-reasons.json`, stanja
`no-technical-rules` i `source-not-found`), ali:
1. datoteka je **prazna**, nitko je nije popunio;
2. za tih 17 profila se **nikad ne konzultira**, jer `state` racuna `scored.length ? ... :
   entries.length ? 'advisory-only' : reasons[...]` - postojanje ijednog `ruleEntry` presijeca prije
   nego se do razloga dodje.

Nedostaje stanje "ima advisory pravila I presudjeno je da izvor ne obvezuje vise od toga". Bez njega
se ispravno stanje (FER, unizd = 16 profila) ne moze razlikovati od stvarnog zaostatka.

#### Nalaz koji je zaustavio prenagljen upis: efzg si proturjeci
Prva pretpostavka nakon modalne analize bila je da `efzg-seminarski` moze postati bodovan preko opce
odredbe sa str. 13 (*"Radovi se pisu ... margine 2,5 cm sa svih strana"*). Provjera zivog profila to
je oborila: `efzg-seminarski` crpi iz DRUGOG dokumenta (`efzg-upute-diplomski-seminarski`), gdje
stoji *"preporucuje se sljedece"* i margine su **2,54 cm (1 inch)**, ne 2,5.

Dakle efzg ima dva dokumenta koja isto pitanje uredjuju **razlicitom vrijednoscu i razlicitom
snagom**. Koji vrijedi za seminarski rad nije citanje nego odluka o hijerarhiji izvora. Pravilo NIJE
upisano; ide u opovrgavajuci prolaz.

#### `ffos`: cetiri profila vise na krivom aktu
- `ffos-zavrsni` -> `ffos-pravilnik-radovi` (Pravilnik, 6 pravila, `verified`)
- `ffos-diplomski` -> `ffos-upute-diplomski` (`verified`)
- `ffos-informatologija-zavrsni` i `-diplomski` -> `ffos-informatologija-upute`, a to su **"Upute za
  pisanje SEMINARSKIH radova"** odsjeka, uz formulaciju *"se preporuca"*. Vodic za seminarski rad
  koristi se kao izvor za zavrsni i diplomski, i to advisory.
- `ffos-povijest-zavrsni` i `-diplomski` -> nemaju draft uopce.

Fakultetski Pravilnik o zavrsnim i diplomskim radovima po hijerarhiji iz CLAUDE.md stoji IZNAD
odsjekove upute i pokriva tocno te vrste rada. Pitanje je opsega, ne verifikacije: vrijednosti su vec
ljudski verificirane u `ffos-zavrsni`. Ali sirenje na druge odsjeke je odluka i ide u opovrgavanje.

#### Uzgredna potvrda da mehanicka provjera radi
Verifikator je odbio agentovu tvrdnju o ffos marginama jer skraceni citat ne sadrzi "20". Neovisno o
tome, vec verificirani `ffos-zavrsni` nosi `{top: 2.5, right: 2, bottom: 2.5, left: 2.5}` - dakle
lijeva 25, desna 20 mm. Vrijednost je bila tocna, citat nije, i provjera je pogodila tocno to.

### Opovrgavajuci prolaz: 0 oboreno, 12 od 20 SUZENO (2026-08-21)

Dvadeset tvrdnji koje su prosle sve mehanicke provjere cisto poslano je agentu sa zadatkom da ih
OBORI, uz izricito "u dvojbi presudi oboreno". Ishod: nijedna vrijednost nije bila netocna NA SVOM
MJESTU, ali je dvanaest imalo krivo pripisan OPSEG. To je drukciji nalaz od FER pilota (gdje je
4 od 5 palo na sadrzaju) i mijenja tezisce: opasnost nije izmisljena vrijednost nego preseljena.

#### Tri obrasca kvara koja se ponavljaju

**1. Odsjecki dokument predstavljen kao fakultetski.**
- `pmf`: vrijednosti dolaze iz uputa **Bioloskog odsjeka**. Matematicki odsjek propisuje ZRCALJENE
  uvezne margine (*"za dvostrani tisak na lijevoj stranici: lijeva 35 mm, desna 23 mm, gornja 35 mm
  i donja 38 mm"*) i APSOLUTNI vodilac (*"fontom velicine 12pt s proredom od 15pt"*, sto uz 12 pt
  nije 1,5 nego oko 1,25). Uniformnih 2,5 cm i prored 1,5 kao PMF pravilo oborili bi svaki sukladan
  matematicki rad, a margins-fixer bi mu unistio uvezni prostor. Sam biolski dokument se k tome
  samoogradjuje: *"U tim slucajevima se za izradu njihovih diplomskih radova primjenjuju pravila
  izabranog odsjeka."*
- `ffos`: Odsjek za njemacki jezik NOVIJIM dokumentom (srpanj 2025., Pravilnik je iz 2019.) dopusta
  *"Times New Roman 12 oder Calibri 12 oder Arial 12"*. Ekskluzivni TNR oborio bi sukladan rad.
- `alu`: jedini potpuni skup dolazi iz uputa JEDNOG odsjeka (OKIRU), a Pravilnik po odsjecima daje
  razlicito: Kiparski trazi **polozeni (landscape) A4**, Graficki *"maksimalnoj velicini formata A4"*.
- `adu`: Pravilnik vrijedi izrijekom samo za diplomski studij **Montaze**; drugi ADU izvor nema
  nijednu odredbu o oblikovanju. Sest adu profila time ostaje nepokriveno, i to je tocno.

**2. Odsjecen citat koji krije iznimku u ISTOJ recenici.** Najopasniji razred, jer citat je doslovan,
vrijednost izvediva, kvalifikatora nema. `unidu`, str. 7, dva puta:
- *"velicina slova u tekstu (font size) treba biti 12 tocaka"* **[, dok naslovi i podnaslovi trebaju
  biti nesto veci (14 ili 16 tocaka)]*
- *"prored (line spacing) treba biti 1,5 u glavnom tekstu rada"* **[, jednostruki (1) u biljeskama]**

Prvo bi oborilo svaki sukladan naslov, drugo svaku sukladnu fusnotu. Iznimke su IMPERATIVNE
(*"trebaju biti"*), ne preporuke.

**3. Naslovnica kao tiha druga vrijednost za `font-size`.** Sva cetiri fakulteta: efzg 14/16 pt,
unidu 14/18 pt, ffos 14/16 pt, adu 14/16 pt, foozos 14/12/10. Nijedna od njih nije pravilo tijela rada.

#### Nalaz koji izvrce hijerarhiju iz CLAUDE.md
`ffos-pravilnik-radovi.pdf`, clanak 8. stavak 2.: *"Ako su upute u koliziji, student je duzan
pridrzavati se uputa mentora."* Fakultetski pravilnik SAM sebe podredjuje mentorovoj pisanoj uputi.
To ne obara nijedno pojedino ffos pravilo, ali sva ffos formatna pravila cini **oborivim defaultom**,
suprotno opcoj hijerarhiji (pravilnik > studij > opce upute > mentor). Vrijedi zapisati u profil.

#### Jedina cista dobit kruga
`efzg` `paper-size` danas je `advisory` u sva cetiri draft profila, jer je bio izveden iz recenice o
OPSEGU (*"stranica teksta formata A4"*). Citat sa str. 13 je samostalan i imperativan (*"Radovi se
pisu na papiru formata A4 (210 mm x 297 mm)"*), pa opravdava prelazak u `scored` za
`efzg-specijalisticki`. Ni jedan drugi efzg dokument ne navodi drugi format.

#### Upozorenje za popravak, ne samo za bodovanje
Suzenje "samo tijelo rada" odgovara zivom ponasanju motora: `check-fixer-map` vodi `font-size` na
`format.size.body`, a `fontFixer` krpa docDefaults/Normal, pa naslovi s vlastitom velicinom ostaju
netaknuti. IZNIMKA: `fontFixer` s `deep: true` silazi na runove i pregazio bi sukladne naslove od
14/16 pt. To je konkretan rizik, ne teorijski, jer je deep u sucelju PREDODABRAN.

### Sesta mehanicka provjera: odsjecen citat
Razred 2 je mehanicki uhvatljiv i sada se hvata: ako citat NE zavrsava na kraju recenice, a ostatak
te iste recenice sadrzi znamenku, tvrdnja ide covjeku. Provjera ne prosudjuje je li ostatak doista
iznimka, samo da je citat prekinut ondje gdje jos ima brojeva.

Prva izvedba lazno je prijavila 24 od 33 tocne tvrdnje, jer je za citat koji vec zavrsava tockom
mjerila SLJEDECU recenicu. Nakon grane "citat koji zavrsava na .!? nije odsjecen": 13 od 33, a oba
stvarna unidu slucaja i dalje su uhvacena.

Uz to su ispravljena tri lazna nalaza vlastite izrade:
- **NFC normalizacija.** Tekstualni sloj `muza-pravilnik-zavrsetak-2025.pdf` mijesa slozeni i
  rastavljeni oblik dijakritike (18 kombinirajucih znakova na str. 15). Ulomak koji IZGLEDA identicno
  u NFC obliku ne nalazi se u sirovom tekstu, pa bi svaki tocan prijepis bio odbijen.
- **"A-4" je A4.** Citat `alu-okiru` uputa glasi *"u formatu A-4"*; trazio se doslovno "A4".
- **Orijentacija je izmjena vrijednosti, ne ublazavanje.** *"u polozenom formatu A4"* je landscape,
  dakle zamijenjene dimenzije. Sada ide covjeku.

### POVUCENO: "14 unizd profila na razini E je tocno stanje" (2026-08-21)

Ta tvrdnja je bila prekoracenje i povlaci se. Obrazac je isti onaj koji je opovrgavajuci prolaz
nasao kod drugih (odsjecki dokument predstavljen kao jedinicni), samo sam ga ovaj put napravio ja.

Sto je stvarno izmjereno: `unizd` je po odjelima i ima **32 razlicita izvora**. Odricanje dokumenta
dokazano je na TOCNO JEDNOM (`unizd-turizam-upute`). Cetiri unizd profila koji su `advisory-only`
stoje na posve drugim dokumentima, i nijedan se ne odrice:

| izvor | odrice se? |
|---|---|
| `unizd-turizam-upute` | DA, str. 3 |
| `unizd-filozofija-preporuke-diplomski` | ne |
| `unizd-filozofija-preporuke-zavrsni` | ne |
| `unizd-francuski-upute-2018` | ne |
| `unizd-talijanistika-stranica` | ne |
| svi `fer-*` izvori | ne |

Provjereno mehanicki, `document_disclaimer` nad snapshotima iz registra. FER-ov slucaj i dalje stoji,
ali na SVOM temelju (sadrzajno opovrgavanje 4 od 5 tvrdnji, izvor je `fer-upute-diplomski-zemris`,
dakle zavodski), ne na odricanju dokumenta.

### Nalaz u zivim podacima: dokument koji se odrice BODUJE dva profila

Trazenje koga `unizd-turizam-upute` pokriva dalo je suprotno od ocekivanog. Ne pokriva nijedan profil
na razini E. Pokriva `unizd-turizam-diplomski` i `unizd-turizam-zavrsni`, oba su **`scored`**, i na
oba je SEST formatnih pravila (`paper-size`, `font`, `font-size`, `line-spacing`, `justify`,
`margins`) u statusu **`verified`**.

Predgovor tog dokumenta (str. 3) sustavno spusta vlastitu snagu, i subjekt je izricit:

> *"**Ove Upute** za izradu zavrsnoga i diplomskog rada **zamisljene su kao vodic** studentima/icama
> ... **Predstavljaju samo jednu od vise mogucnosti** kako se pisu navedeni studentski radovi. ...
> **preporucujemo** postivanje ovih Uputa ... Uz sve navedene upute, **najvaznije su one koje vam
> predlaze vas mentor**."*

Zadnja recenica je isti izvrnuti odnos kao `ffos` cl. 8 st. 2: dokument sam sebe podredjuje mentoru.

Kontrast koji pokazuje da autor razlikuje snagu kad hoce: u istom dokumentu `page-count` stoji na
*"Diplomski rad **mora** imati najmanje 70 stranica."* Dakle "mora" postoji ondje gdje se misli, a
formatne odredbe glase *"treba pisati"* uz predgovor koji ih proglasava jednom od mogucnosti.

**Ovo je odluka vlasnika, ne popravak.** Demotiranje sest `verified` pravila mijenja ocjenu stvarnim
korisnicima, a Upute JESU sluzbeno objavljene, sto ih po CLAUDE.md cini dopustenim izvorom. Nalaz je
zabiljezen s punim dokazom; nista nije promijenjeno.

### Sto ovo mijenja u metodi
Provjera odricanja mora citati SUBJEKT, ne samo prepoznati anaforu. Gard je ovdje pogodio ("Ove
Upute ... Predstavljaju samo"), ali je pogodio bez provjere, pa je isti mehanizam mogao jednako lako
uhvatiti recenicu o necem drugom. Vrijedi i sire: nalaz o odricanju je razlog da se dokument PROCITA,
ne presuda sama za sebe.

### Izvedeno: `efzg-specijalisticki` `paper-size` advisory -> scored (2026-08-21)

Jedina tvrdnja iz cijelog kruga koja je prosla sve provjere BEZ suzenja i bez zastavice. Vlasnik je
potvrdio recenicu sa str. 13.

Sto je bilo krivo: pravilo je citiralo recenicu o OPSEGU (*"opsega od 70 do 90 stranica teksta
formata A4, ..."*), u kojoj je A4 usputna oznaka, a ne odredba o formatu. Zato je i bilo `advisory`
uz `verifiedBy: owner-bulk-approval` i `reviewedBy: null`.

Sto je upisano: citat je zamijenjen samostalnom, imperativnom recenicom iz poglavlja *"3. PRAVILA I
UPUTE ZA PISANJE RADOVA"* (*"Radovi se pisu na papiru formata A4 (210 mm x 297 mm) ..."*), status je
`verified`, `scored: true`, `autoFixable` s `paper-size-fixer`, uz `verifiedHash` snapshota.

Izmjereni ucinak, sve pregradjeno iz izvora:

| mjera | prije | poslije |
|---|---|---|
| `efzg-specijalisticki` bodovanih | 7 | **8** |
| od toga strojno provjerljivih | 6 | **7** (od 8) |
| closed-loop `pass` | 323 | **324** |
| closed-loop `partial` | 6 | **5** |
| ledger tvrdnja B | 329 | **330** |
| ledger dokaz `synthetic-pass` | 337 | **338** |

`efzg-specijalisticki` je presao iz `partial` u `pass`, uz `axesRemaining: []` i `paper-size` medju
razrijesenima. Ratchet je azuriran (`closed-loop-ratchet.json`), promjena je u dopustenom smjeru.

**Namjerno NIJE prosireno.** Preostalih pet `partial` profila (`efzg-diplomski`,
`efzg-strucni-racunovodstvo`, `efzg-zavrsni`, `grad-diplomski`, `grad-zavrsni`) ima isti kvar
(paper-size izveden iz recenice o opsegu), ali opovrgavajuci prolaz je izricito zabranio sirenje p13
odredbe izvan specijalistickog studija: efzg-zavrsni i efzg-diplomski citiraju druge dokumente s
*"u pravilu iznosi"*, a efzg-strucni-racunovodstvo propisuje font 11 i samo Calibri. Svaki od njih
treba vlastiti imperativan citat ili ostaje advisory.

### Granica koja je ovdje drzana
`isRuleScored` trazi `status: 'verified'`, a konvencija uz njega nosi `confirmedVia: 'human-audit'` -
zapis da je COVJEK otvorio izvor. Zapis nije upisan dok vlasnik nije potvrdio recenicu; do tada je
promjena stajala. AI je pripremio dokaz i suzio odluku na jedno pitanje, potpis je ostao ljudski.

### Obradjena 43 bodovana pravila s ublazavanjem u vlastitom citatu (2026-08-21)

43 pravila svela su se na **8 razlicitih (izvor, citat) jedinica**; ostatak su ista recenica citirana
za vise osi ili vise profila. Svih 8 je procitano u izvoru.

Ishod: **35 od 43 je LAZNA zastavica, 8 je stvarno.** Obrazac laznih je jedinstven: citat obuhvaca
vise recenica, ublazavanje pripada onoj o OPSEGU, a odredba o obliku stoji u drugoj i nosi `mora`
ili goli indikativ.

| # | izvor | presuda |
|---|---|---|
| 1 | `fizri.pdf` | LAZNA. *"...MORA biti otisnut ... na papiru formata A4 ... PREPORUCA SE da diplomski rad ima najvise 100 stranica. Glavni tekst MORA imati velicinu slova 12 i ... prored 1,5."* Ublazavanje veze samo 100 stranica; sva tri bodovana pravila nose `mora`. |
| 2 | `logri-smjernice-studentski-radovi.pdf` | LAZNA. *"FONT: preporuca se upotreba fonta koji podrzava znakove hrvatske latinice ...; VELICINA FONTA: 12; PRORED: 1,5 pt; MARGINE: Normalne ...; PORAVNANJE: obostrano"*. Ublazavanje veze `font`, a `font` uopce NIJE medju bodovanim pravilima; ostale stavke su goli natuknicni navodi. |
| 3 | `unidu-komunikologija-upute-zavrsni.pdf` | LAZNA. *"Vrsta slova (fonta) MOZE biti Times New Roman ili Arial"* je izbor iz skupa, a `font` je i zapisan kao popis od dva clana, sto je ispravan nacin. Ostale osi nose `treba biti`. |
| 4, 5 | `unizd-povijest-upute-2012-{diplomski,zavrsni}.pdf` | LAZNA. *"Rad se pise ... na papiru formata A-4; PREPORUCA SE uporaba pisma velicine 12 tocaka, te da odlomci imaju dvostruki prored. Margine SU: 2,5 cm osim lijeve koja JE 3,5 cm. Kod biljezaka se bira velicina slova 10, a prored JE 1,5-struki."* Ublazavanje veze velicinu i prored TIJELA, koji nisu bodovani; bodovani su format, margine i fusnote, svi u indikativu. Margine su k tome ispravno ASIMETRICNE (lijeva 3,5). |
| 6 | `vsite-pravilnik-2014.pdf` | LAZNA. *"Zavrsni rad U PRAVILU ima 30-40 stranica ... Rad JE OPREMLJEN naslovnom stranicom, stranicom zadatka, SADRZAJEM ..."* Bodovan je samo `toc`, iz druge recenice. |
| 7 | `zsem-pravilnik-zavrsni-2023.pdf` | LAZNA. *"...u formatu A4 U PRAVILU na ne manje od 30 stranica sadrzaja. Prilikom pisanja KORISTI SE font Times New Roman, size 12, obostrano poravnavanje, razmak 1,5pt."* Ublazavanje veze broj stranica; oblik dolazi iz druge recenice s `koristi se`. |
| 8 | `zvu-pravilnik-zavrsni-2015.pdf` | **STVARNO.** Vidi nize. |

### Stvaran nalaz: `zvu`, 8 bodovanih pravila iz jedne ublazene recenice o opsegu

Cijela odredba glasi: *"Opseg zavrsnoga rada ovisi o vrsti i slozenosti teme koja se obradjuje, a
**U PRAVILU** iznosi izmedju 25 i 50 stranica osnovnog teksta rada na papiru A4 formata (bez
naslovnice, sadrzaja, popisa literature i priloga), proreda 1,5, velicine slova 12 i margina od
2,5 cm sa svih strana."*

Pretrazen je CIJELI dokument (20 stranica): **nijedna druga recenica ne spominje margine, prored ni
velicinu slova.** Nema neublazene alternative. To je razlika prema `efzg`, gdje je alternativa
postojala na str. 13, pa je ondje lijek bio ponovno citiranje, a ne demotiranje.

Pogodjeno je svih 5 bodovanih pravila na oba zvu profila (`paper-size`, `font-size`, `line-spacing`,
`margins`, `page-count`), dakle **cijeli bodovani skup obaju profila**.

Uz to, zaseban nalaz iste jedinice: `zvu-specijalisticki` boduje iz *"Pravilnika o zavrsnom radu"*,
dakle iz akta za drugu vrstu rada.

Napomena za odluku: za `page-count` je raspon SAMA odredba, pa je ono najmanje sporno od pet.

### Sesta provjera je suzena na temelju ovog citanja
Kvalifikator se sada prijavljuje samo ako stoji u ISTOJ recenici kao vrijednost pravila (127 -> 54).
Dalje mehanika ne ide: razlika izmedju *"u pravilu"* koje veze samo broj stranica i onoga koje vodi
cijelo nabrajanje je citanje, ne uzorak. To je i projektirana granica.

### ODLUKA: `zvu` i `unizd-turizam` ostaju bodovani uz zabiljezen nalaz (2026-08-21)

Vlasnik je procitao oba nalaza i odlucio NE demotirati. Odluka je zapisana u
`data/verification/known-findings.json`, s dokazom, datumom i potpisom.

Zapis NE mijenja bodovanje i NE tvrdi da nalaz nije tocan. Postoji zbog jednog razloga: da sljedeca
revizija isti nalaz ne prijavi kao nov. Bez toga se 21 vec odluceno pravilo vraca u svakom izvjestaju
i stvaran NOV nalaz se u tom sumu izgubi. Priznavanje je po VRSTI nalaza, ne po pravilu: nova vrsta
nalaza na istom pravilu i dalje je nova.

Ucinak na izvjestaj: 403 -> 382 pravila s novim nalazom, 21 priznato (kvalifikator 54 -> 46,
odricanje 51 -> 38).

### Provjera brojeva ispravljena: citat zna SPOJITI nesusjedne odlomke
Pri zapisivanju nalaza upalila je i druga zastavica na `unizd-turizam`, koju nisam provjerio prije
nego sam je htio zabiljeziti. Dobro je sto nisam: bila je lazna, i to iz razloga koji vrijedi sire.

`unizd-turizam-diplomski--margins` nosi citat od 297 znakova koji spaja DVA NESUSJEDNA odlomka bez
oznake izostavljanja: zadnjih 137 znakova (margine) stoji na jednom mjestu u dokumentu, prvih 160
(format, font, prored) na drugom. Provjera brojeva gledala je JEDAN prozor, pa je nuzno promasila
polovicu brojeva i prijavila da vrijednosti ne stoje, iako stoje sve.

Popravak: brojevi se provjeravaju PO RECENICI, jer unutar recenice tekst jest susjedan. Ucinak
181 -> 47, uz tri rucno provjerena citata (efzg str. 13, ffos, unizd-turizam) koji svi prolaze.

To je sesti put u ovom krugu da je prvo mjerenje bilo krivo, a podaci ispravni. Obrazac je uvijek
isti: profilni citat NIJE fotografija teksta nego uredan prijepis, i svaka pretpostavka o doslovnosti
prije ili kasnije padne.

### Sto je zapravo onih 197 "citat se ne nalazi" (2026-08-21)

Dva uzroka su izmjerena, i nijedan nije pogresno pravilo.

**1. Skenirane stranice (9 pravila).** `forenzika-pravilnik-diplomski.pdf` ima stranice 1-10 kao
SLIKE s nula znakova, a to su clanci Pravilnika; stranice 11-23 su strojno pisani prilozi
(PRILOG 1-9). Dokument time daje 12 tisuca znakova i prolazi kao "citljiv", dok su upravo stranice s
pravilima nevidljive. Osam bodovanih pravila citira te clanke preko OCR-a, posve ispravno, a provjera
ih je prijavila kao izmisljene. Brojac nerevidiranog hvatao je samo POSVE prazne dokumente, ne i
mjesovite; sada se takvi citati broje kao NEPROVJERIVO, ne kao nalaz.

**2. Parafraza umjesto doslovnog prijepisa (vecina ostatka).** `kif-diplomski--justify` citira
*"poravnanje – obostrano"*, a dokument kaze *"Poravnano obostrano"*. Sadrzaj je isti, pravilo je
tocno, ali `quote` po ugovoru treba biti DOSLOVAN. Tko taj niz potrazi u izvoru, nece ga naci.

To je nalaz o SLJEDIVOSTI, ne o bodovanju: pravilo ne ocjenjuje krivo, ali se ne moze provjeriti
onako kako verifikacijski lanac pretpostavlja. Raspodjela podudaranja to potvrdjuje: vecina je u
pojasu 60-84%, dakle blizu izvornika, a ne izmisljena.

### Sedam ispravaka mjerenja u jednom krugu
Redom: dijakritika, izostavljanje, interpunkcija, krivi broj uz tocne rijeci, prozor sastavljen od
tokena, spojeni nesusjedni odlomci, skenirane stranice. Svaki put je prvo mjerenje bilo krivo, a
podaci ispravni.

Zajednicki uzrok je jedan i vrijedi ga zapisati: **profilni `quote` nije fotografija teksta nego
uredan prijepis**. Svaka provjera koja pretpostavi doslovnost pada, i to tiho, u smjeru laznog
alarma. Zato revizija prijavljuje razrede i nikad ne presudjuje sama.

### Red od 68 "odsjecenih citata": 31 lazna, jedan stvaran razred (2026-08-21)

68 pravila svelo se na 53 jedinice. Citanje je pokazalo da provjera mjeri pogresnu stvar: u gotovo
svima je "nastavak" samo SLJEDECA STAVKA u popisu specifikacija (`ttf`: *"Prored: 1,5 redak"* pa
*"Lijeva i desna margina: 2,5 cm"*; `iv`: *"Font: Arial, 12 pt"* pa *"Prored: 1,5"*). Popisi nemaju
recenicne tocke, pa svaka stavka izgleda odsjecena, a rijec je o drugoj osi, ne o iznimci.

Opasan je samo slucaj u kojem nastavak daje **drugu vrijednost za drugi dio rada**. Ta dva stvarna
nalaza (unidu) glase: *"...font size treba biti 12 tocaka"* [**dok naslovi i podnaslovi** trebaju
biti 14 ili 16] i *"...prored treba biti 1,5 u glavnom tekstu"* [jednostruki **u biljeskama**]. Oba
nastavka IMENUJU DIO RADA, i po tome se prepoznaju. Provjera je suzena na to: 68 -> 37.

### Stvaran kvar: izuzece stoji u samom citatu, ali ga vrijednost ne odrazava

| pravilo | citat sadrzi | vrijednost |
|---|---|---|
| `grf-doktorski--margins` | *"Naslovnica ima drugacije margine."* | ravnih 2,5 sa svih strana |
| `fhs-doktorski--margins` | *"Naslovnica ima drugacije margine."* | ravnih 2,5 sa svih strana |
| `agr-doktorski--margins` | izvor nastavlja *"Naslovnica ima drugacije margine!"* | ravnih 2,5 sa svih strana |
| `fhs-diplomski--line-spacing` | *"Prored: 1,5 redak (sazetak ima jednostruki prored)"* | 1,5 |
| `fhs-zavrsni--line-spacing` | isto | 1,5 |

Da to nije teorijsko, potvrdjuje sam kod. `src/analysis/analyze-docx.ts:233` provjerava SVAKU sekciju
protiv jedne profilne vrijednosti:

```
sections.forEach((s,i)=>{ ... if(!near(s.margins[side],profile.margins[side],strict*3)) bad.push(...) })
marginEarn = bad.length ? Math.max(0, 6 - bad.length*1.5) : 6
```

Rad ciju naslovnicu izvor IZRICITO dopusta drukcije margine gubi bodove i dobiva upozorenje. Doseg
ovisi o strukturi dokumenta: kvar se javlja kad je naslovnica vlastita sekcija (`w:sectPr`), a ne kad
je rijesena preko `w:titlePg`, sto analiza vec biljezi kao `titlePageDifferent`.

Isti obrazac za prored pogadja sazetak (`fhs`), gdje bi sukladan jednostruki prored bio prijavljen.

### Vecina provjerenog je zapravo ISPRAVNA
Vrijedi zabiljeziti i suprotan smjer, jer bi inace popis izgledao gore nego sto jest:
- `grf-zavrsni--margins` = `{gore 2, desno 2,5, dolje 2, lijevo 3,5}` - tocno asimetricno, s uveznom
  marginom, iz citata *"Margine: vez 3,5 cm, vanjski rub 2,5 cm, glava i noge 2 cm"*.
- `mef-diplomski--font-size` = `[11, 12]` - ispravno zapisan SKUP, ne jedna ciljana vrijednost.

### Jedan pokvaren citat
`ffzg-etnologija-graduate--font-size` nosi `quote: "ine 12 to"`. To je krhotina, ne citat: izvor
`ffzg-etnologija-diplomski-2019.pdf` ima ostecen tekstualni sloj (*"velicine"* se cita kao
*"veliþine"*), pa je prijepis prekinut na ostecenju. Vrijednost 12 je vjerojatno tocna, ali citat ne
dokazuje nista i pravilo se po njemu ne moze provjeriti.

### IZMJERENO: naslovnica kao vlastita sekcija obara margine s 6/6 na 0/6 (2026-08-21)

Tvrdnja iz prethodnog commita ("rad gubi bodove") bila je IZVEDENA IZ KODA, ne izmjerena. Prvi
pokusaj mjerenja ju je prividno oborio: sva tri profila davala su `informational 0/0`. To je bio kvar
mog harnessa, ne nalaz - `analyzeFixture(file, opts)` prima OBJEKT `{ profileId }`, a ja sam predao
string, pa je svaki poziv pao na prvi profil u registru i tri puta mjerio isto.

Nakon ispravka kvar se reproducira odlucno:

| profil | bez zasebne naslovnice | s naslovnicom kao sekcijom |
|---|---|---|
| `grf-doktorski` | pass 6/6 | **fail 0/6** |
| `fhs-doktorski` | pass 6/6 | **fail 0/6** |
| `agr-doktorski` | pass 6/6 | **fail 0/6** |
| `efzg-specijalisticki` | pass 6/6 | **fail 0/6** |

Nije djelomicno oduzimanje nego PUN pad: odstupaju sve cetiri strane, 4 x 1,5 = 6 bodova.

Dva nalaza koja mijenjaju sliku:
1. **Ucinak nije vezan uz profilni podatak.** `efzg-specijalisticki` o naslovnici ne govori nista, a
   pada jednako. Rijec je o ponasanju motora, ne o pogresnom pravilu u profilu.
2. **Tri izvora to izricito dopustaju**, i to u istoj recenici iz koje je pravilo preuzeto:
   *"Naslovnica ima drugacije margine."* Rad koji tocno slijedi svoju uputu gubi svih 6 bodova.

Doseg: samo kad je naslovnica VLASTITA sekcija (`w:sectPr`). Kad je rijesena preko `w:titlePg`,
margine ostaju jedne i provjera prolazi.

Zatecено ponasanje je zakljucano u `tests/margins-title-page-section.test.ts` PRIJE bilo kakve
izmjene, po pravilu iz CLAUDE.md. Test ne tvrdi da je ponasanje ispravno.

#### POPRAVLJENO: odstupanje naslovnice je upozorenje, ne pad
Od tri razmatrana smjera odabran je treci. Izuzimanje prve sekcije tiho bi prestalo provjeravati
naslovnicu i ondje gdje uputa trazi jednake margine; izuzimanje po profilnom podatku ne bi pomoglo
`efzg`-u i slicnima koji o naslovnici sute a jednako padaju.

Izvedba: odstupanja PRVE sekcije skupljaju se odvojeno (`coverBad`) i nose jednu odbitnicu
(6 -> 5, status `warn`), umjesto 1,5 boda po strani. Prag `TITLE_PAGE_MAX_PARAGRAPHS = 5` postoji da
se pod "naslovnicu" ne bi moglo sakriti pola rada: prva sekcija dulja od praga boduje se normalno, i
to je pokriveno zasebnom tvrdnjom u testu.

Golden je ostao NETAKNUT (9 tvrdnji, bez ijedne promjene snapshota), dakle nijedan fixture nema taj
oblik i izmjena je za zatecen korpus aditivna. `tsc --noEmit` cist.

#### Umalo vracena ispravna izmjena
Nakon izmjene je `src/ui/repair-panel.test.ts` pao, i A/B usporedba (bez izmjene prolazi, s njom pada)
optuzila je izmjenu. To je bio kriv zakljucak iz JEDNOG uzorka nestabilnog testa: taj test STUBIRA
`reanalyze` i koristi jednosekcijski dokument, pa prava analiza u njemu uopce ne radi i izmjena na
njega logicki ne moze utjecati. Ponovljeno mjerenje: bez izmjene 27/27 uz `tests` 12-14 s, s izmjenom
27/27 uz 11,5 s, a globalni prag je 15 s. Test je dakle na rubu i u ovoj je sesiji DVAPUT dao lazno
crven gate. Prag mu je podignut na 60 s, uz zapis zasto.

---

### ZADNJA KARIKA: lanac dokaza zavrsavao je u stagingu, motor je bodovao drugdje (2026-08-22)

Sve dosad opisano provjerava odnos TVRDNJE i IZVORA. Nijedna provjera nije gledala odnos tvrdnje i
onoga sto motor stvarno boduje, a to je mjesto na kojem lanac puca.

- Tvrdnje zive u `data/profiles/<unit>/drafts/*.json` (1934 `verified` + `scored`).
- Motor boduje iz naslijedjenog `rules`: `composeAnalysisProfile` klonira `definition.rules`, a
  **svih 407 registriranih profila ima prazan `ruleEntries`**. `compileProfile`/`loadProfiles` se
  izvan vlastitih datoteka ne zovu nigdje u `src/`, pa je `effectiveRules` u produkciji mrtav kod.
- Jedina zica je `advisory-map.json`, koja odgovara samo na pitanje BODUJE LI SE dimenzija.

**IZMJERENO: 40 parova (profil, os) kroz 23 profila gdje motor boduje vrijednost koju njihova
vlastita `verified` tvrdnja s citatom opovrgava.** Uz to 24 `unapplied` (tvrdnja postoji, motor tu
dimenziju uopce ne provjerava) i 82 `unbacked` (bodovanje bez ijedne tvrdnje, svih 82 u 14 profila
koji nemaju nijedan `ruleEntry`).

| profil | izvor kaze (`verified`, potpisano) | motor je bodovao |
|---|---|---|
| `unizd-pomorski-zavrsni`/`-diplomski` | Merriweather, 10 pt (`authority: binding`) | TNR/Arial/Calibri, 11-12 pt |
| `unizd-povijest-zavrsni` | lijeva margina 3,5 cm | ravnih 2,5 cm |
| `vuka-strojarski-*` | 3,0 cm sa svih strana | 2,5/2/2/2 cm |
| `fpzpu-*` | Arial; margine ravnih 2,5 | TNR; 3,5/2,5/3/3 |

#### Kvar je bio i u POPRAVKU, ne samo u ocjeni
`data/generated/repair-params-by-profile.json` je za `unizd-pomorski-zavrsni--font` nosio
`{fontName: "Times New Roman"}` i za `--font-size` `{fontSizePt: 12}`. Dakle serverski autoritet je
upisivao TNR 12 u studentov dokument, pod ruleId-em cija provenijencija kaze Merriweather 10 pt.
Demotija bodovanja to ne bi dotakla, pa os s raskorakom sada ispada i iz `repair-map.json`.

#### Zasto to nijedan postojeci gard nije uhvatio
- `tests/rule-compiler.test.ts` tvrdi `effectiveRules deep-equals rules` nad zivim registrom, ali
  taj registar nema `ruleEntries`, pa usporedjuje `clone(rules)` s `rules`. Vakuumski prolaz.
- `tests/closed-loop-profiles.test.ts` i `scripts/run-closed-loop.mts` PREPISUJU zrcalo draftom prije
  analize, pa se analiza i popravak slazu po konstrukciji. Komentar u testu tu razliku imenuje na
  `vuka-strojarski-diplomski` i naziva je *"lazno proturjecje"*. Nije lazno: to je bio kvar, i
  harness ga je zaobisao umjesto da ga prijavi.
- `tests/verification-gate.test.ts` IMA usporedbu tocno tog oblika, ali je ogranicena na
  `unitId === 'pravo'` i izuzima `margins`. Mehanizam je postojao i primijenjen je na ~13 profila
  2026-07-27; na ostalih 383 nikad nije prosiren.
- Conformance je samoreferentan: `tests/helpers/conformance.ts` gradi testni .docx IZ
  `profile.font/size/spacing`, pa protiv njih i boduje.

#### Sto je uvedeno
- `src/verification/scored-value-binding.ts`: usporedba po OSI, ne po kljucu `rules`. Motor vecinu
  dimenzija cita kroz par (zastavica, vrijednost), pa usporedba po kljucu daje lazne nalaze: prvo
  mjerenje je tako dalo **227 laznih `unbacked`** (tvrdnja `paper-size: "A4"` proizvodi `paperSizes`,
  zrcalo nosi `requireA4`, ista odredba drukcije zapisana; isto za `justify` i `checkJustify`).
- Normalizacija je nuzna, ne kozmeticka: bez nje 183 nalaza umjesto 40, jer draft pise `value: 12`
  a zrcalo `size: [12]`, sto motor cita isto.
- `data/verification/scored-value-drift.json` (`npm run scored-value-drift`) +
  `data/verification/drift-dossiers/` (`npm run drift-dossiers`).
- `tests/scored-value-drift.test.ts`: artefakt = svjez izracun, ratchet koji smije samo padati, i
  pet negativnih kontrola koje dokazuju da provjera grize.

#### Odluka vlasnika: demotirati, ne prepisati
Os s raskorakom prestaje bodovati dok se slucaj ne presudi. Prijepis vrijednosti iz tvrdnje je
odbacen jer je opovrgavajuci prolaz 2026-08-21 pokazao da 12 od 20 tvrdnji ima krivo pripisan OPSEG:
tvrdnja koja se ne slaze sa zrcalom NIJE automatski ona tocna.

**KRUGA NEMA I TO JE PROJEKTIRANO.** Raskorak se racuna iskljucivo iz tvrdnji i `rules`, nikad iz
demotije. Provjera koja preskace vec demotirane osi sama sebe pobrise u sljedecem krugu: demotirana
os prestane biti nalaz, popis se isprazni, demotija nestane i kvar se vrati. Zato
`computeBaseDemotedAdvisory` stoji odvojeno od `computeDemotedAdvisory`.

#### Izmjeren ucinak, bez uljepsavanja
- `advisory-map.json`: 23 profila dobilo je nove demotirane osi (40 ukupno).
- closed-loop: `vuka-strojarski-zavrsni` i `-diplomski` pali su s **`pass` na `no-repair`**. To je
  NAZADAK i tako je zapisan: margine su im jedina bodovana os, pa nakon demotije nema sto popraviti.
- Isto mjerenje nosi i drugu, NEZAVISNU promjenu: pet `partial` profila (efzg x3, grad x2) preslo je
  u `pass`, a `arh-diplomski` i `muza-diplomski` u `no-rules`, i to zbog ranije izmjene poluge
  `paper-size` (demotija sada gasi i `paperSizes`). Artefakt na HEAD-u je bio ustajao pa se ta
  promjena tek sada vidjela. **Rast `pass` 324 -> 327 zato NIJE napredak u pokrivenosti.**
- `scored-coverage.json` ostaje 369 profila / 2209 bodovanih i to se NE poravnava: coverage mjeri
  tvrdnje sljedive do izvora, demotija mjeri sto motor boduje. Dvije populacije, imenuju se.
- Ledger tvrdnja B 330 -> 333, C 17 -> 13, i to je posljedica iste paper-size promjene, ne demotije.

### FER IEEE: vrijednost spustena na `custom` (2026-08-22)

Otvoreni nalaz iz FER pilota je zatvoren. `fer-diplomski--citation-style` i `fer-zavrsni--citation-style`
nosili su `"ieee"` na citatu koji o IEEE-u ne govori nista; iz njega se izvodi samo to da se izvor
navodi brojem u uglatim zagradama, a ne cijeli stil (redoslijed autora, interpunkcija, polja).

Vrijednost je `"custom"` (`citationMeta` label *"Prema posebnim uputama"*) u draftu i u sva tri
registra. **Bodovno je neutralno**: `ieee` (mode `numeric`) i `custom` (mode `custom`) idu u istu
granu `analyze-docx.ts`, pa se ocjena ne mice; mijenja se samo tvrdnja koju alat izgovara. Brisanje
polja je odbaceno jer bi tada vrijedio korisnikov zatecen odabir stila, sto je losije od izricitog
"ne znamo tocan stil". Zapisano u `data/verification/known-findings.json`.

Ostalo OTVORENO, s izmjerenim opsegom:
- Isti obrazac (advisory `citation-style` koji ipak konfigurira motor) ima **jos 8 profila**:
  `fsb-*` (3), `grad-*` (2), `grf-*` (2), `pmf-matematika-graduate`. Nisu dirani.
- `fer-doktorski--citation-style = "harvard"` stoji na fragmentu *"dominantna u pojedinoj struci
  (harvardski stil,"*, sto je delegiranje struci, ne propis.
- **26 tvrdnji o stilu nosi ljudski opis umjesto kanonskog tokena** (`"apa"` umjesto `apa7`,
  `"autor-godina"`, `"fusnote ili uglate zagrade s brojem"`), pa se uopce ne mogu usporediti s onim
  sto motor pokrece. Jos **6** tvrdnji postoji dok motor nema `recommendedCitation`, pa vrijedi
  korisnikov odabir (medju njima `vss-*` sa `vancouver` i `kifos-*`/`vsig-*`/`securus-*` sa `apa`,
  svi u statusu `scored`). Oboje je popisano u `scored-value-drift.json`, nijedno nije gateano jer
  trazi odluku o vokabularu koja je vlasnikova.

---

### MODALITET I OPSEG: dva polja koja su nedostajala cijelo vrijeme (2026-08-22)

Od deset polja koja strukturirana tvrdnja treba, osam je vec postojalo (hash izvora, stranica,
doslovan citat, vrijednost, autoritet, datum, `verifiedBy` + `reviewedBy` + `confirmedVia`).
Nedostajala su tocno ona dva na kojima su svi dosadasnji nalazi i pali:

- **modalitet**: FER pilot je oborio 4 od 5 tvrdnji, i nijedna nije pala na prijepisu nego na
  tumacenju (preporuka citana kao obveza, opis predloska kao propis).
- **opseg**: opovrgavajuci prolaz je nasao krivo pripisan opseg na 12 od 20 tvrdnji. Vrijednost nije
  bila netocna nego PRESELJENA.

#### Sest razina, ne pet
`obligation` | `directive` | `prohibition` | `recommendation` | `permission` | `condition`.
`directive` je dodan iznad uobicajenih pet zato sto je FER dokument izmjereno imao TRI razine
(`mora`/`ne smije` : `treba` : `preporuceni`/`neka bude`) i nijedna FER tvrdnja nije bila u
najjacoj. Da `treba` upadne u `obligation`, tocno taj nalaz bi nestao.

#### Jedinica rada je (izvor, citat, os), ne pravilo
1934 bodovana pravila svode se na **1310 jedinica**. Modalitet i opseg su svojstvo OSI unutar
recenice, ne recenice u cjelini: na `fizri` ista recenica nosi `mora` za format stranice i
`preporuca se` za broj stranica.

#### Sto je stroj smio upisati, a sto nije
| | jedinica | pravila |
|---|---|---|
| strojni izvod (upisano) | 962 | **1404** |
| ceka covjeka | 348 | 530 |

Upisano je samo `directive` (1248) i `obligation` (156). **Nijedan ublazen modalitet nije upisan
strojno**, i to je ugovor, ne slucaj: prva izvedba je 11 jedinica proglasila jednoznacnima, a citanje
uzorka je pokazalo da su sve lazne, uvijek istim obrascem (ublazavanje veze DRUGU imenicu):

- `ferit-*`: *"Rad se pise na racunalu (preporuca se MS Word) uz prored od 1,5"* - veze PROGRAM.
- `unizd-povijest`: *"na papiru formata A-4; preporuca se uporaba pisma velicine 12 tocaka"* - veze
  velicinu pisma, ne format papira.
- `vhzk`: *"prored 1,5 (preporuceni oblici fonta su Arial...)"* - veze font.

To je isti razred na kojem je revizija vec izmjerila 35 laznih od 43 nalaza. Mehanika dalje ne ide,
pa svako ublazavanje ide covjeku, u OBA smjera: ne upisuje se ni oslabljen modalitet (mogao bi
demotirati valjano pravilo) ni ojacan.

#### Razlozi zbog kojih 348 jedinica ceka covjeka
`recenica imenuje vise dijelova rada` 130, `vise modalnih biljega u istoj recenici` 68,
`imenuje 'bibliography' a os mjeri 'whole'` 39, `imenuje 'footnote' a os mjeri 'body'` 37,
`imenuje 'heading' a os mjeri 'whole'` 29, ostalo manje. Sest jedinica je LaTeX preambula
(`mathos-predlozak`), gdje modalitet ne postoji jer predlozak nista ne propisuje, on je vec
postavljen: tocno ono razlikovanje na kojem je FER pao (`line-spacing = 1.2` bio je OPIS predloska).

#### Alat i gard
- `npm run claim-modality` predlaze, `npm run claim-modality:apply` upisuje. Skript NE ODLUCUJE.
- `tests/claim-fields.test.ts`: vokabular, ugovor strojnog upisa (mehanika nikad ne pise ublazen
  modalitet), ratchet broja bodovanih pravila bez modaliteta (530, smije samo padati), i provjera da
  os za fusnote nikad ne nosi opseg tijela rada.
- Upis je LINIJSKI, ne kroz ponovnu serijalizaciju: osam draft datoteka drzi objekte u nizu u jednom
  retku, pa bi `json.dumps` dodao 55 redaka kozmeticke razlike po datoteci i zatrpao stvarnu izmjenu.

---

### TAKSONOMIJA: "dokazano nema pravila" konacno se razlikuje od "nitko nije pogledao" (2026-08-22)

Nalaz od 2026-08-21 (*"Taksonomija ne razlikuje dva suprotna ishoda"*) je zatvoren.

Mehanizam je postojao (`data/profiles/no-rules-reasons.json`), ali je bio prazan i **nikad se nije
konzultirao za profil koji ima ijedan `ruleEntry`**, jer je racun glasio
`scored.length ? ... : entries.length ? 'advisory-only' : reasons[...]` - postojanje ijednog zapisa
presijecalo je prije nego se do razloga dodje.

Sada potpisani razlog NADJACAVA izvedeno stanje, i to na oba mjesta koja taj racun rade
(`src/verification/coverage-report.ts` i `scripts/recompute-coverage.mjs`; ta dva moraju ostati
bit-identicna, drift hvata `tests/coverage-report.test.ts`).

- Novo stanje: `advisory-by-decision` - *izvor je PROCITAN i presudjeno je da ne obvezuje vise od
  preporuke*. Konacno stanje, ne zaostatak.
- Upisan je FER (`fer-diplomski`, `fer-zavrsni`), jedini slucaj koji je vec adversarijalno dokazan,
  s punim dokazom i popisom stete koju bi bodovanje napravilo.
- Zapis izricito ogranicava doseg: vrijedi za ZEMRIS-ov dokument, ne za cijeli FER. `fer-doktorski`
  ima vlastiti izvor i SEST bodovanih pravila. Ovo nije tvrdnja da FER nema pravila.

| stanje | prije | poslije |
|---|---|---|
| `scored` | 369 | 369 |
| `advisory-only` (zaostatak) | 17 | **15** |
| `advisory-by-decision` (presudjeno) | - | **2** |
| `no-rules-sourced` | 24 | 24 |

Preostalih 15 `advisory-only` i 24 `no-rules-sourced` OSTAJU zaostatak i moraju proci isti
adversarijalni postupak prije nego ih se proglasi tocnima. Povucena tvrdnja od 2026-08-21 ("14 unizd
profila na razini E je tocno stanje") se NE vraca na mala vrata: odricanje je dokazano na tocno
jednom od 32 unizd izvora, pa svaki profil treba vlastiti dokaz.

#### Napomena o brojkama koje su se pomaknule iz drugog razloga
Isto mjerenje pokazuje `tvrdnja A=1` (`pravo-socijalni-rad-diplomski`, `proof: real-docx-pass`),
cega na HEAD-u nije bilo. To NIJE ucinak ove izmjene: `docs/generated/faculty-matrix.json` bio je
ustajao od jutra, pa se rad na stvarnom korpusu vidio tek nakon regeneracije. Brojka se biljezi
onako kako jest, uz imenovan uzrok, i ne pripisuje se ovom poslu.

---

### VERIFIKATOR: izvod prosiren s pet osi na sesnaest (2026-08-22)

`value_tokens` je pokrivao pet osi (paper-size, font, font-size, line-spacing, margins), a za sve
ostale vracao prazno, sto je postavljalo `derivable = False` i tvrdnja je MEHANICKI PADALA.
Izmjereno: **628 od 1934 bodovanih pravila (32,5%)** stajalo je na osi koja kroz verifikator nije
mogla proci, i to ne zato sto je s njima bilo sto, nego zato sto pravila izvoda nije bilo.

- **PAD i NEPROVJERIVO su sada razlicite presude.** Os bez pravila izvoda dobiva `unsupported` i
  vlastiti brojac. Pad koji znaci "ne znam" trosi ljudsku paznju na sum.
- **Brojcane osi**: dodani `page-count`, `word-count`, `reference-count` (raspon je sama odredba, pa
  se traze OBJE granice), `footnote-size`, `footnote-spacing`, `heading-rules`.
- **Predikatne osi** su drugi razred: nisu broj nego tvrdnja, pa se trazi da citat tu odredbu uopce
  IZRICE (`justify`, `toc`, `page-numbers`, `footnote-font`). Za `required-sections` svaki nazvani
  dio mora se pojaviti u citatu; za `citation-style` naziv stila ili njegov nedvosmislen potpis.
- **Dva stvarna kvara ispravljena:**
  1. `paper-size` je IGNORIRAO vrijednost i uvijek trazio A4, pa se tvrdnja `value: "A3"` "izvodila"
     iz citata koji govori o A4. Negativna kontrola to sada hvata.
  2. `font-size`/`line-spacing` gledali su samo `value[0]` kad je vrijednost lista, pa drugi clan
     dopustenog skupa ("11 ili 12") nikad nije bio usidren.
- **34 negativne kontrole kroz 16 osi** (`npm run verify:claims:selftest`), svaka u paru: citat iz
  kojeg se vrijednost DOISTA izvodi i citat iz kojeg se NE izvodi. Gard bez dokaza da grize gori je
  od nikakvog; kad bi izvod bio prazan, oba bi prosla i to se odmah vidi.

Pokrivenost izvoda: **1306/1934 (67,5%) -> 1920/1934 (99,3%)**. Preostalih 14 je posteno
`unsupported`: 12 `heading-rules` cija vrijednost nema polje `size` i 2 `citation-style` s
vrijednoscu `custom`, koja po definiciji nema strojni potpis.

### CI: brzi sloj u `npm run check`, spori u vlastitom jobu (2026-08-22)

- **Brzi sloj (bez Pythona, bez PDF-ova), u tvrdom gateu:** `tests/scored-value-drift.test.ts`
  (tvrdnja vs. bodovana vrijednost, ratchet, negativne kontrole) i `tests/claim-fields.test.ts`
  (modalitet i opseg, vokabular, ugovor strojnog upisa, ratchet).
- **Spori sloj:** `.github/workflows/rule-claims.yml`. Python 3.12 + PyMuPDF; prvo se dokazuje da
  izvod GRIZE (`verify:claims:selftest`), pa tek onda da podaci prolaze. Obrnut redoslijed daje
  zeleno i kad je izvod prazan. Zatim drift guard nad `claim-modality-proposals.json` i
  `scored-quote-audit.json`, isti obrazac kao `tests/repair-recipe.test.ts`.
- Python alati vise nisu samo rucni: `npm run verify:claims`, `verify:claims:selftest`,
  `audit:scored-quotes`, `claim-modality`, `claim-modality:apply`.

#### Integritet snapshota: prvi put stvarno izmjeren
`VERIFICATION_PIPELINE.md` sekcija 6 trazi da nijedno bodovano pravilo nema izvor ciji se snapshot
promijenio nakon verifikacije. `runVerificationGate` je to provjeravao usporedbom DVA ZAPISANA BROJA
(`entry.verifiedHash` naspram `src.snapshotHash`); **sha256 stvarne datoteke na disku nije racunalo
nista**, pa je cijela tvrdnja o nepromjenjivosti 233 MB izvora pocivala na tome da ih nitko nije
dirao. Zapis koji nitko ne provjerava nije dokaz.

`npm run verify:source-hashes` (`scripts/verify-source-hashes.mjs`) racuna sha256 svake datoteke koju
bodovana pravila citaju. **Prvo mjerenje: 231 datoteka, 175,1 MB, sve se slaze.** Nad cijelim
registrom (`--all`, 289 datoteka / 233 MB) jedan izvor nema hash u registru
(`ffos-informatologija-upute`, HTML snapshot), i taj ne hrani nijedno bodovano pravilo.

Nije u `npm run check` zbog cijene (12,9 s), nego u `rule-claims.yml`, dakle pri svakom pushu.

---

### PRESUDA ZA 40 RASKORAKA: obje strane grijese, i to u razlicitim slucajevima (2026-08-23)

Demotija je zaustavila krivo bodovanje, ali nijedan slucaj nije rijesila. `scripts/adjudicate_drift.py`
cita snapshot i odgovara na jedno mehanicko pitanje: **koju od dvije vrijednosti izvor uopce nosi.**
Skript ne odlucuje koja je strana tocna; suzuje odluku na jedno pitanje.

| presuda | koliko | znacenje |
|---|---|---|
| `claim-supported` | 17 | izvor nosi vrijednost TVRDNJE -> zrcalo je krivo |
| `both-present` | 8 | izvor nosi obje -> pitanje opsega ili hijerarhije |
| `unreadable` | 8 | snapshot nije PDF ili nema tekstualni sloj |
| `neither` | 5 | izvor ne nosi nijednu -> reverifikacija |
| `engine-supported` | 2 | izvor nosi vrijednost MOTORA -> TVRDNJA je kriva |

To potvrdjuje da je vlasnikova odluka (demotirati, ne prepisati) bila ispravna: u 17 slucajeva bi
prijepis bio tocan, ali u 2 bi upisao krivu vrijednost preko tocne.

#### Najtezi nalaz: `verified` pravilo cije uporiste u izvoru ne postoji
`vuka-strojarski-zavrsni--margins` i `-diplomski--margins` nose citat *"Lijeva margina 3.0 cm Gornja
margina 3.0 cm ... Donja margina 3.0 cm Desna margina 3.0 cm"*, `status: verified`, potpisano
2026-07-27. U cijelom dokumentu niz "3,0 cm" **ne postoji nijednom**, a o marginama dokument kaze
tocno jedno: *"margine 2,0 cm (desno, gore i dolje) i 2,5 cm (lijevo)"* - dakle tocno ono sto motor
vec boduje.

Odakle onda 3,0 cm? Iz lokatora same tvrdnje: *"predlozak korica, oznake 'Lijeva/Gornja/Donja/Desna
margina'"*. Vrijednost je ocitana s PREDLOSKA NASLOVNICE, ne iz pravila za tijelo rada. To je
"naslovnica kao tiha druga vrijednost", isti obrazac koji je opovrgavajuci prolaz vec nasao na cetiri
fakulteta, i tocno ono sto polje `scope` postoji da sprijeci: da je tvrdnja nosila
`scope: 'title-page'`, nikad ne bi bodovala margine tijela rada.

**Posljedica za demotiju:** za ta dva profila demotija je skinula ISPRAVNO bodovanje (i kostala ih
`pass` -> `no-repair` u closed-loopu). Popravlja se tvrdnja, ne zrcalo, pa se demotija zatim skida.
Odluka je vlasnikova; dosje je spreman.

#### Rupa u reviziji citata koju je ovo otkrilo
`audit_scored_quotes.py` taj nalaz NIJE prijavio, iako mu je pokrivanje citata 0,21 (prag je 0,85).
Uzrok: `has_scanned_pages` vraca `true` cim dokument ima ijednu stranicu-sliku, pa se SVA pravila tog
dokumenta vode kao NEPROVJERIVA. `vuka-strojarski-upute-2025` ima 8 tekstualnih stranica (na kojima
su pravila) i 3 slikovne na kraju (prilozi s naslovnicama).

Gard je uveden za `forenzika-pravilnik-diplomski`, gdje su slikovne stranice upravo one s clancima
Pravilnika, pa je ondje ispravan. Razlika koju ne vidi: jesu li skenirane stranice one S PRAVILIMA ili
prilozi. Izmjereno, rupa je mala i imenovana: **9 pravila kroz 2 dokumenta**, od cega je 7
(`forenzika-*`) legitimno neprovjerivo, a 2 (`vuka-strojarski-*`) su stvaran promasaj.

Provjereni razlikovni signal koji NE radi: "usidruje li se ijedno drugo pravilo iz istog dokumenta" -
u oba dokumenta je 0 od N. Signal koji radi jest onaj koji `adjudicate_drift.py` vec racuna: govori li
tekstualni sloj uopce o toj osi. `audit_scored_quotes.py` NIJE mijenjan (paralelna sesija ga je
drzala otvorenim); nalaz je zabiljezen ovdje da se ne izgubi.

---

### MUTACIJSKO TESTIRANJE: dokaz da garda grizu, umjesto rucnog pregleda (2026-08-23)

Vlasnikov zahtjev je bio da provjere radi alat, ne on. Odgovor NIJE vise prolaza istim alatom, jer je
u ovom projektu vec izmjereno da to ne radi:

- FER pilot: 7 od 7 citata doslovno tocnih, nijedna kriva stranica, nijedan izmisljen, a **4 od 5
  tvrdnji svejedno oboreno**. Greska je bila u tumacenju; treci citac bi se samo slozio.
- `audit_scored_quotes` nije prijavio citat s pokrivanjem 0,21 uz prag 0,85, jer ga je
  `has_scanned_pages` proglasio neprovjerivim. **Drugi prolaz istim alatom bi ga opet propustio.**
  Uhvatio ga je drugi alat, koji gleda drugu stvar.

Zato `tests/gate-mutations.test.ts`: podmecu se POZNATI kvarovi i trazi se da ih gard prijavi. Ishod
je jedna brojka umjesto rucnog pregleda: **18 mutacija, 18 uhvaceno**, uz 4 dodatne tvrdnje. Trajno u
`npm run check`, pa gard koji netko kasnije oslabi odmah pada.

Dva pravila koja test drzi, oba iz izmjerenih promasaja:

1. **Svaka mutacija ima i BASELINE tvrdnju.** Nemutiran ulaz mora biti cist. Bez toga mutacija
   "prolazi" i kad gard vristi na sve, a ne zato sto je pogodio.
2. **Mutacija imenuje stvaran kvar koji imitira**, ne izmisljen. Pokriveno: bodovanje bez lokatora,
   bez citata, izmisljen `sourceId`, rucno postavljen `scored`, mentorov autoritet, obvezujuce bez
   drugog para ociju, promijenjen snapshot, zastarjela verifikacija, nepoznat `checkId`, sve tri
   vrste raskoraka vrijednosti, razlika sakrivena iza zastavice, potpisan razlog u coverageu, tri
   vrste kvara snapshot-hasha, i to da osnovna demotija ne ovisi o raskoraku (inace se sama pobrise).

### Boolean koji je zamalo oznacio devet ispravnih pravila kao izmisljena

Prva izvedba presude javljala je `claimQuoteInSource` kao BOOLEAN uz prag 0,85. Po njemu je
**11 tvrdnji** izgledalo kao da im citat ne postoji u izvoru koji citiraju.

Mjerenje pokrivanja pokazalo je da su samo **2** stvarno odsutne (0,21), a **9 ih je na 0,62-0,81**,
dakle parafraza ili urednicka napomena. Najjasniji primjer: `unizd-pomorski-*` gubi parove rijeci
ISKLJUCIVO na umetku *"[sic - tipfeler u izvoru]"* koji je autor sam stavio u citat, jer izvor pise
*"Marriweather"* umjesto *"Merriweather"*. Ostatak recenice stoji doslovno.

Da se oznacavalo po booleanu, devet ispravnih pravila bilo bi oznaceno kao izmisljena. Presuda sada
nosi BROJ (`claimQuoteCoverage`), ne samo zastavicu. To je deseti put u ovom projektu da je prvo
mjerenje bilo krivo, a podaci ispravni.

### Ispravljena dva pravila kojima citat doista ne postoji

`vuka-strojarski-zavrsni--margins` i `-diplomski--margins` oznaceni su `needs-recheck` (`scored:
false`). Dva NEOVISNA signala pokazuju na njih i ni na jedno drugo: presuda `engine-supported`
(izvor nosi vrijednost motora) i pokrivanje citata 0,21.

- Citat glasi *"Lijeva margina 3.0 cm Gornja margina 3.0 cm ..."*, a niz "3,0 cm" u cijelom
  dokumentu ne postoji nijednom. Dokument o marginama kaze tocno jedno: *"margine 2,0 cm (desno, gore
  i dolje) i 2,5 cm (lijevo)"*, dakle tocno ono sto je motor vec bodovao.
- Uzrok je u samom zapisu: `sourcePage` glasi *"predlozak korica"*. Vrijednost je ocitana s
  PREDLOSKA NASLOVNICE. Da je tvrdnja nosila `scope: 'title-page'`, nikad ne bi bodovala margine
  tijela rada.
- `confirmedVia` je bio `ai-1pass-batch`, ne `human-audit`, iako `verifiedBy` i `reviewedBy` nose
  ime vlasnika. To je razred koji `approve-profile.mjs` postoji da razlikuje.
- **Vazna posljedica koja se ne uljepsava:** margine su bile JEDINA bodovana dimenzija ta dva
  profila, i stajale su na neistinitoj tvrdnji. Uklanjanje je ispravno, ali ih spusta na nulu:

  | mjera | prije | poslije |
  |---|---|---|
  | `scored` celija | 369 | **367** |
  | `scoredTotal` | 2209 | **2207** |
  | `advisory-only` | 15 | **17** |
  | ledger tvrdnja E | 48 | **50** |
  | `vuka-strojarski-*` stanje | `scored` | **`advisory-only`** |

  Uz `autoFixable: false`: pravilo pod reverifikacijom ne smije ni bodovati ni pokretati popravak.
  To drugo je lako previdjeti, a znacilo bi da fixer i dalje upisuje 3,0 cm u studentov dokument po
  tvrdnji za koju je upravo utvrdjeno da joj citat ne postoji. Postojeci `profile-validator` je to i
  uhvatio kad je prvo oznacavanje bilo nepotpuno (autoFixable:true na ne-verified pravilu).

  Prijedlog ispravljene tvrdnje zapisan je u `note` samog pravila, pa je vlasnikova odluka jedan
  potez. Closed-loop se NIJE promijenio (327/57/23): ta dva profila su vec bila `no-repair`.

Granica koja je ovdje drzana: gasenje bodovanja je fail-safe i radi se strojno; UKLJUCIVANJE trazi
ljudski potpis, pa ispravljena vrijednost ceka vlasnika iako je dokaz jednoznacan.

---

### ADVERSARIJALNI PROLAZ NAD VLASTITIM GARDIMA: 16 nalaza (2026-08-23)

Nakon sto su gardi napisani, pusteni su na opovrgavanje, uz izricito "u dvojbi presudi oboreno".
Nasao je 16 kvarova, od kojih su cetiri ozbiljna. Popravljeno u istom prolazu:

| nalaz | sto je bilo | popravak |
|---|---|---|
| mutacije vjezbaju samo `font` | `readAxis` se mogao svesti na `if (checkId !== 'font') return undefined` i svih 18 mutacija bi ostalo zeleno, cime bi se vratio bas `paper-size` kvar iz zaglavlja | dodane mutacije za `paper-size` (alias i kriva vrijednost), `margins` (minimum) i `justify`; nova tvrdnja da mutacije pokrivaju vise osi. DOKAZANO: ta sabotaza sada obara 5 tvrdnji |
| mutacija o demotiji je bila prazna | koristila je izmisljen `mut-profil`, kojeg nema u `demotedByProfile`, pa su osnovna i puna verzija vracale isto | uzima profil koji STVARNO ima raskorak, iz artefakta; sada razlikuje `computeBaseDemotedAdvisory` od `computeDemotedAdvisory` |
| mutacija "skriveno iza zastavice" prolazila je na praznom | `[].every(...)` je `true`, pa bi prosla i da gard ne vraca nista | trazi OBOJE: uz ugasenu zastavicu nema nalaza, uz upaljenu ga ima |
| tri koda vrata bez ijedne tvrdnje | `scored-not-verified`, `scored-addsrc-drift`, `scored-no-lastverified` | dodane mutacije; dijagnostika kompajlera se sada trazi kroz sama vrata, ne izravno |
| **`marginsMinimum` slijepi kut** | ostavljen "dok se zastavica ne pojavi u podacima" - a **pojavila se** (`forenzika-diplomski`, `2c214fd`), i `readAxis` je nije pratio | ukljucen u kanonsku vrijednost margina; ispadanje zastavice iz zrcala sada je raskorak, a ne tisina |
| **gardi mjere krivu populaciju** | `claim-fields.test.ts` i `verify-source-hashes.mjs` selektirali su po POHRANJENOM `scored`, a motor veze po izvedenom `isRuleScored`. Razlika: **275 pravila** i **11 izvora** izvan svakog garda | oboje prebaceno na izvedeni uvjet; ratchet modaliteta 530 -> **805**, jer je populacija ispravljena s 1932 na 2207 |
| **ratchet raskoraka nosio je zalihu** | `RATCHET.drift` je stajao na 40 dok je artefakt vec pokazivao 38; dva nova raskoraka mogla su proci zeleno | spusten na 38 |
| ugovor o ublazenom modalitetu nije bio ozicen | zivio je samo u testu; `apply_claim_modality.py` nije imao allow-listu | dodana: mehanika smije upisati samo `obligation` i `directive` |

Brojka mutacija: **18 -> 26**, tvrdnji 22 -> 31.

#### Nalazi koji NISU popravljeni, i zasto

- **`audit_scored_quotes.py` cita OCR pratitelja samo kad je tekstualni sloj POSVE prazan.** Sedam
  mjesovitih PDF-ova ima neprazan sloj pa se pratitelj nikad ne konzultira, a `has_scanned_pages`
  ih salje u "neprovjerivo" bez obzira na pokrivanje. `forenzika-diplomski` je ondje sa **0,00-0,12**
  kroz 7 bodovanih pravila, dakle NIZE od `vuka` (0,21) koji je oznacen. Datoteku je paralelna sesija
  drzala otvorenom; nalaz je ovdje da se ne izgubi.
- **Demotija se moze ponistiti overlayem katedre.** `applyDemotion` preskace `protectedIds`, a
  `legal-departments.json` -> `sociologija.rules` imenuje 6 od 8 demotabilnih osi. Danas latentno
  (nijedan `pravo-*` profil nema raskorak), ali `tests/scored-value-drift.test.ts` provjerava samo
  da os stoji u `advisory-map.json`, a ponistavanje se dogadja POSLIJE tog citanja.
- **Tvrdnja "os NIJE obavezna" strukturno se ne moze izraziti** na 4 od 8 osi: `readAxis` svodi
  `justify`/`toc`/`page-numbers`/`paper-size(bool)` na `true | undefined`, pa tvrdnja s `value: false`
  nikad ne daje nalaz. Latentno za jedno polje: `ffzg-psihologija-diplomski--justify` vec nosi
  `value: false` u statusu `advisory`.
- **`readAxis` ne modelira `normalizeCheckFlags`**: `font: []`, `spacing: "1.5"` ili djelomicne
  margine motor NE boduje, a gard ih vidi kao bodovane. Nula zivih slucajeva danas.
- **Demotija `toc`/`page-numbers` ne gasi njihove podprovjere** (`pageNumberAlignment`,
  `checkPageNumberStartAtIntro`, `tocDetailedCheck` do 10 bodova) jer su vezane uz NALAZ u dokumentu,
  ne uz profilnu zastavicu. Isti razred kao vec popravljen `paper-size` lever.
- **Ratcheti se mogu tiho podici**: nijedan nije pokriven `CODEOWNERS` unosom, i nema meta-testa koji
  usporedjuje kapu s izmjerenom vrijednoscu. `closed-loop-ratchet.json` je iznimka: koristi `toBe`,
  dakle tocan pin u oba smjera.

---

### TRECI RAZRED CITATA: opis postavki paketa (2026-08-23)

Presuda za raskorake citala je samo PDF, pa je 8 slucajeva vodila kao "necitljivo". Revizija je u
medjuvremenu naucila citati `.docx` (zip s XML-om), naslijedjeni `.doc` i pratitelje `-ocr.txt` /
`-text.txt`; presuda sada posudjuje TO citanje umjesto da ga pise ponovno. **Necitljivih: 8 -> 0.**

Novi raspored presuda nad 38 raskoraka: `claim-supported` 23, `both-present` 8, `neither` 7.

#### Sest `ffst-*` pravila s pokrivanjem 0,08, a nijedno nije izmisljeno
Nakon sto je `.docx` postao citljiv, sest `ffst-*` tvrdnji ispalo je na pokrivanju **0,08**, dakle
NIZE od `vuka` (0,21) koji je doista bio izmisljen. Citanje je pokazalo suprotno.

Njihov citat glasi: *"Normal stil: font Times New Roman, velicina 12pt (w:sz=24), prored 1,5
(w:line=360 auto), obostrano poravnanje (w:jc=both). Stranica A4, margine 2,54cm sve strane."* To je
OPIS POSTAVKI PAKETA, ne recenica iz dokumenta. `document_text` cita VIDLJIVI tekst, a te postavke
zive u `word/styles.xml` i `<w:sectPr><w:pgMar>`, dakle u atributima.

Provjereno otvaranjem paketa, i sve se slaze do znamenke:

| tvrdnja | u paketu |
|---|---|
| Times New Roman | `w:ascii="Times New Roman"` (stil Normal) |
| 12 pt | `w:sz="24"` (pola tocke) |
| prored 1,5 | `w:line="360"` |
| obostrano | `w:jc="both"` |
| margine 2,54 cm | `pgMar 1440` twipsa sa svih strana |

Da se islo po brojci, sest ispravnih pravila bilo bi optuzeno za izmisljanje. Presuda zato nosi
`claimQuoteKind`: `text` naspram `package-settings`. Nad tekstualnim citatima sada **nijedan** raskorak
nema sumnjivo pokrivanje, dakle jedini dokazano izmisljeni citati su ona dva `vuka` pravila.

Zapazeno usput, za covjeka: treci `sectPr` u istom predlosku nosi margine 2,33/2,22/0,49/2,29 cm
(vjerojatno naslovnica ili podnozje), dakle predlozak nije jednoobrazan.

**Pitanje koje ostaje covjeku, i ono je vaznije od brojke:** predlozak OPISUJE, ne propisuje. FER
pilot je pao tocno na tome (`line-spacing = 1.2` bio je opis predloska, ne propis). Ove tvrdnje same
tvrde obveznost preko lokatora (*"obvezujuc preko Pravilnik Clanak 9 -> Upute"*), sto je odluka o
hijerarhiji izvora, ne citanje.

---

### FORENZIKA: sedam pravila koja nijedan alat ne moze provjeriti, provjerena citanjem (2026-08-23)

Adversarijalni nalaz D11 je i dalje otvoren i to je **stvarno lazno zeleno**: `forenzika-diplomski`
ima 7 bodovanih pravila s pokrivanjem citata **0,00 do 0,12**, dakle NIZE od `vuka` (0,21) koji je
oznacen kao izmisljen, a revizija za njih prijavljuje **nula nalaza**. Uzrok je `has_scanned_pages`:
stranice 1-10 tog PDF-a su slike (ondje su clanci Pravilnika), 11-23 su strojno pisani prilozi, pa
dokument daje 12 tisuca znakova i prolazi kao "citljiv" dok su stranice s pravilima nevidljive.
OCR pratitelja za taj izvor nema, a tesseract/ocrmypdf nisu na stroju.

Rijeseno onako kako je vec jednom rijesen `biolos`: stranice su RENDERIRANE (PyMuPDF, 3x) i
procitane kao slika. Ishod: **svih 7 citata je doslovno tocno, i lokatori su tocni.**

- Clanak 9, st. 1 (str. 5): *"Pisano djelo treba biti tiskano na papiru formata A4, s oznacenim
  stranicama na donjem (gornjem) desnom rubu teksta."* -> pokriva `paper-size` i `page-numbers`.
- Clanak 9, st. 3 (str. 5): *"Tekst se pise proredom od 1,5 reda, stilom Times New Roman i velicinom
  slova 12 pri cemu rubovi na obje strane, gore i dolje, moraju biti siroki najmanje 2,5 cm, uz
  obostrano poravnavanje teksta."* -> pokriva `font`, `font-size`, `line-spacing`, `margins`.
- Clanak 8, st. 3 (str. 3): *"Poglavlja diplomskog rada su: Uvod, Cilj rada, Izvori podataka i
  metode, Rezultati, Rasprava, Zakljucci, Sazetak na hrvatskom jeziku, Sazetak na engleskom jeziku,
  Literatura i Zivotopis."* -> pokriva `required-sections`.

#### Dvije potvrde koje su ispale usput

1. **`marginsMinimum` je tocan.** Izvor doslovno kaze *"moraju biti siroki NAJMANJE 2,5 cm"*, dakle
   donja medja, ne ciljana vrijednost. Rad s 3 cm sa svih strana je SUKLADAN. To neovisno potvrdjuje
   izmjenu iz `2c214fd`.
2. **`scope` je vec zapisan tocno.** Clanak 9, st. 5 istog dokumenta kaze *"Naslovi poglavlja se pisu
   velicinom slova 16, a pod-poglavlja velicinom 14"*, dakle 12 vrijedi samo za tijelo rada. Strojni
   izvod je `font-size` vec upisao kao `scope: body`, a `margins` kao `modality: obligation`. To je
   prva neovisna potvrda da polje `scope` hvata bas onaj razred kvara zbog kojeg je uvedeno
   ("naslovnica/naslov kao tiha druga vrijednost").

#### Sto ostaje
Nista: nalaz o `has_scanned_pages` je zatvoren istoga dana suzenjem opisanim u sljedecoj sekciji.
`forenzika` i dalje ostaje potisnuta (i mora), jer njezin citljivi sloj o tim osima ne govori nista;
razlika je u tome sto se to sada MJERI umjesto da se pretpostavlja iz prisutnosti ijedne slike.

---

### ALAT ZA PRESUDU: 38 raskoraka postaje 38 naredbi s potpisom (2026-08-23)

Demotija je zaustavila krivo bodovanje, ali nijedan slucaj nije rijesila. Rjesavanje rukom trazi
izmjenu u DVA registra (`verified-profiles.json` i `-heavy.json`; light indeks ne nosi pravila) plus
pregradnju sest artefakata, pa je 38 odluka zapravo bilo 38 visekoraknih zahvata i zato su stajale.

`npm run drift-apply -- --rule <ruleId> --decision claim|claim-wrong --by "Ime" [--note] [--write]`

- `claim`: izvor podupire TVRDNJU -> njezina vrijednost ide u `rules` oba registra. Raskorak nestaje
  i demotija se sama dize pri pregradnji.
- `claim-wrong`: izvor podupire ZRCALO -> tvrdnja ide u `needs-recheck`, `scored:false`,
  `autoFixable:false`, uz OBAVEZAN `--note`. Pravilo pod reverifikacijom ne smije ni bodovati ni
  pokretati popravak; drugo je lako previdjeti.

Cetiri garda, svaki iz izmjerenog razloga:

1. **`--by` je obavezan.** Ukljucivanje bodovanja je jedina stvar u ovom lancu koja trazi covjeka
   (gasenje je fail-safe i radi se strojno). Potpis je ono sto tu granicu drzi, pa bez njega alat
   odbija raditi.
2. **Suho je zadano.** `--write` se trazi izricito.
3. **Odluka koja proturjeci PRESUDI se odbija** bez `--force`. Nije birokracija: od 38 raskoraka
   `vuka` je bio jedini u kojem je zrcalo bilo u pravu, a takav se najlakse zamijeni s ostala 23 u
   kojima je u pravu tvrdnja. Alat ispisuje i pokrivanje citata na kojem presuda stoji.
4. **Zavrseci redaka se cuvaju** po datoteci (jedan registar je CRLF, drugi LF), inace jedna odluka
   proizvede diff od nekoliko tisuca redaka i zatrpa stvarnu izmjenu.

Svaka presuda se biljezi u `data/verification/drift-decisions.json` (tvrdnja, zrcalo, strojna
presuda, potpis), da se odluka ne izgubi i da je sljedeca revizija ne prijavi kao nov nalaz.

Zatecena raspodjela: **23 `claim-supported`** (zrcalo je krivo, ocekivano `--decision claim`),
**8 `both-present`** (izvor nosi obje, pitanje hijerarhije), **7 `neither`** (reverifikacija).

---

### TRECA POJAVA ISTOG KVARA: predlagac je birao po pohranjenoj zastavici (2026-08-23)

Adversarijalni prolaz je nasao da gardi mjere POHRANJENI `scored`, a motor veze po izvedenom
`isRuleScored` (razlika: 275 pravila). Popravljeno je na dva mjesta (`claim-fields.test.ts`,
`verify-source-hashes.mjs`), ali NE i na trecem: `propose_claim_modality.py` je i dalje birao po
zastavici, pa tih 275 pravila **nikad nije ni dobilo prijedlog modaliteta**. Trajno su sjedila u
zaostatku, iako je dio njih strojno razrjesiv.

Isti ispravak primijenjen i ondje. Ucinak:

| mjera | prije | poslije |
|---|---|---|
| jedinica (izvor, citat, os) | 1310 | **1401** |
| jednoznacnih | 962 | **1018** |
| pravila s modalitetom | 1402 | **1555** |
| bez modaliteta (ratchet) | 805 | **652** |

Ratchet je spusten u ISTOM commitu, kako njegovo vlastito pravilo i trazi. Rast pa pad iste brojke
(530 -> 805 -> 652) nije kolebanje nego dvije faze jednog ispravka: prvo je ispravljena populacija
koja se MJERI, pa populacija koja se OBRADJUJE.

Ugovor je izdrzao: **nula** mehanicki upisanih ublazenih modaliteta i nakon sirenja skupa.

`scored-value-drift.json` i `advisory-map.json` ostali su bit-identicni, sto je i bila namjera:
modalitet i opseg su OPIS citata, ne presuda o bodovanju, pa ne smiju pomaknuti ocjenu.

#### Pouka koja se ponavlja
Kad se nadje kvar u odabiru populacije, popravak nije gotov na mjestu gdje je nadjen. Ovaj je imao
TRI pojave (test, hash gard, predlagac), i trecu je otkrilo tek pitanje "gdje se jos bira po istom
uvjetu", ne ponovno citanje nalaza.

---

## FAZA P5: stvarni korpus i Word oracle

Danas: 12 dokumenata, 9 profila, 8 jedinica, 0 PASS, 12 review, 22 od 95 ciljanih checkova
rijeseno (23,2%), prosjek 85,25 na 88,83, nula pass-regresija.

### P5-1. Razdvoji "review" na tri kategorije
- Problem: 12/12 review skriva razliku izmedju "alat nije uspio" i "alat je tocno cekao
  korisnikovu potvrdu".
- AC: `repair-real-corpus.json` po dokumentu razdvaja `auto-unresolved` (kvar),
  `assisted-awaiting-confirmation` (ispravno ponasanje) i `manual-only` (izvan granice
  proizvoda). Tek nakon toga postotak 23,2% ima znacenje.
- Velicina: M. Prioritet: P2.

### P5-2. Ciljani rast korpusa po jedinicama, ne po broju
- AC: prioritet po prometu (najtrazenije jedinice iz `discovery/demand-signal`), zatim po
  riziku (profili s najvise bodovanih pravila bez ijednog dokumenta). Svaki dokument nosi
  sidecar s `profileId` i oznakom stanja (uskladjen / neuskladjen / slozen).
- Napomena: 526.370 iz `corpus-stats.json` je broj radova evidentiranih u Dabaru i Hrcku,
  NIJE broj testiranih dokumenata; ne smije se koristiti kao dokaz pokrivenosti.
- Velicina: XL (kontinuirano). Prioritet: P3.

### P5-3. Word i LibreOffice vizualni oracle u redovnom ciklusu
- Postojece: `scripts/word-verify/` (Word COM, `OpenAndRepair=false`),
  `npm run verify:strict-open` (python-docx). Nedostaje LibreOffice grana i redovnost.
- AC: Tier 2 se izvodi nad svakim novim dokumentom u korpusu prije nego udje u baseline;
  rezultat se biljezi u ledger kao `proof: real-docx-pass`.
- Velicina: L. Prioritet: P3.

---

## FAZA P6: pomocni sadrzaji (naslovnice, citati, izjave, paket)

### P6-1. Status naslovnice po profilu, ne tihi fallback
- Problem: loader uvijek vrati nesto (tocan fakultet i vrsta rada, pa fakultet bez razine, pa
  druga vrsta rada istog fakulteta, pa genericka), a korisnik ne zna sto je dobio.
- AC: svaki profil dobiva jedan od statusa `exact-official`, `exact-derived`,
  `reused-from-other-work-type`, `generic`, `official-template-unavailable`, `conflict`;
  status je vidljiv u UI i ulazi u ledger os `assets`. `derived` se NIKAD ne prikazuje kao
  sluzbena obveza (rekonstruiran je konsenzusom javnih radova).
- Datoteke: `src/title-pages/*`, `src/tools/naslovnica-page.ts`.
- Velicina: M. Prioritet: P3.

### P6-2. Citatni spec se veze na profil, ne samo na fakultet
- Danas 71 verificiran spec, kljucan po `facultyId`. AC: kljuc postaje profileId ili
  `officialProgramCode`, s fallbackom na fakultet; podrzane su dopustene alternative po vrsti
  rada, obvezne stranice kod izravnih citata, te noviji tipovi izvora (AI alati, podatkovni
  skupovi, softver). Fakultet bez speca ostaje na opcem stilu, ali to postaje EKSPLICITAN
  status u ledgeru, ne tihi izostanak.
- Velicina: L. Prioritet: P3.

### P6-3. Izjave: prvi zapisi, ali samo `guidance` (2026-08-20)
- `data/declarations/declarations.json` bio je prazan `[]`. Sada ima **9 zapisa nad 3 jedinice**
  (`ffzg`, `fpz`, `fpzg`), generiranih iz VEC VERIFICIRANOG dokaza:
  `scripts/seed-declarations.mts` (`npm run seed-declarations`).
- GRANICA KOJU SEED NE PRELAZI: shema dopusta `wording` (doslovnu sluzbenu formulaciju) samo uz
  `provenance.status === 'official'`. Doslovan obrazac nemamo: u repozitoriju je 255 PDF snapshota,
  ali samo 15 OCR tekstova, a OCR gubi dijakritiku - "sluzbeni" tekst izvucen iz njega bio bi
  netocan tamo gdje je najvazniji (ime, JMBAG, formulacija koju student potpisuje). Zato su SVI
  zapisi `guidance`: "fakultet izjavu propisuje, evo izvora i lokatora, provjeri obrazac".
- Dokaz se ne prikuplja iznova nego NASLJEDUJE iz `ruleEntries` koji su vec prosli verifikaciju
  (status `verified` + `sourceId` + `sourcePage` + doslovan citat, i to oni koji izjavu navode kao
  obavezan dio). Time zapis o izjavi ima istu razinu dokaza kao pravilo o strukturi rada.
- ODBIJENO PROSIRENJE: jos 2 jedinice (`ffri`, `unizd`) imaju dokaz s izvorom, ali status pravila
  nije `verified`. Ukljucivanje bi znacilo reci studentu "tvoj fakultet ovo propisuje" na temelju
  pravila koje ni sami nismo smatrali dovoljno jasnim za bodovanje. Uski i tocan skup je bolji od
  sireg i klimavog; 3 naspram 5 jedinica ionako ne mijenja razmjer.
- ISPRAVAK U LEDGERU koji je ovaj posao otkrio: `guidance` se mapirao na `exact-derived`, sto
  precjenjuje. `exact-derived` znaci "rekonstruirano konsenzusom", a `guidance` znaci "znamo da je
  propisana, nemamo tekst" - student i dalje dobiva OPCU formulaciju. Os mjeri vjernost SADRZAJA,
  pa `guidance` ostaje `generic`; vrijednost zapisa je napomena uz izvor, ne tocnost teksta. Bez
  ispravka bi izgledalo da je 27 redaka dobilo vjernu izjavu, a nije nijedan.
#### Doslovni obrasci ipak SU dohvatljivi strojno (2026-08-20, ispravak procjene)
- Prva procjena ("obrasci se moraju prikupiti rucno") bila je prebrza. Mjerenje: od 255 PDF
  snapshota **226 ima pravi tekstualni sloj** (ne skenirani), **104 spominju izjavu**, a **41 sadrzi
  sam obrazac** (naslov + prvo lice na istoj stranici). Tekstualni sloj cuva dijakritiku, za razliku
  od OCR-a - a to je presudno za tekst koji student POTPISUJE.
- `scripts/extract_declarations.py` izvlaci obrazac uz TVRDU kontrolu kvalitete: odbacuje tekst bez
  ijednog dijakritickog znaka, tekst sa znamenkom unutar rijeci ("Sveudili5ta" umjesto
  "Sveucilista") i tekst s premalo slova. Izmjereno odbaceno: 1.
- Rezultat: **15 zapisa s DOSLOVNIM obrascem** (`provenance: official` + `wording`) plus 3
  `guidance`, ukupno 18 kroz 17 jedinica. Prije je bilo 9 zapisa kroz 3 jedinice, svi bez teksta.
- Ucinak na ledger, prvi put stvaran: `izjava: exact-official 48` redaka (bilo 0), a 13 redaka ima
  SVA TRI pomocna sadrzaja na `exact-official`.
- SVI ostaju `status: 'draft'`. `provenance` govori ODAKLE tekst dolazi, `status` je li itko
  provjerio da je prepisan TOCNO: PDF u dva stupca zna izmijesati retke
  ("{Ime i prezime studenta, JMBAG)"). AI ne proglasava verified.
- Preskoceno i ostavljeno covjeku: **8 jedinica ima VISE razlicitih obrazaca** (agr, efzg, ffos,
  ffzg, fpz, pravo, unidu, unizd) - kojoj razini koji pripada se ne pogadja, jer je kriva sluzbena
  formulacija za krivu razinu gora od opceg teksta. Uz to 2 snapshota postoje na disku ali nisu u
  registru izvora, pa se ne mogu citirati.
- Gard: `tests/declaration-extraction.test.ts` (dijakritika, tragovi pokvarenog sloja, sljedivost do
  izvora i stranice, nijedan jos nije `verified`, guidance i dalje bez teksta).

- Sto OSTAJE: prikupljanje preostalih obrazaca je LJUDSKI posao (preuzeti sluzbeni PDF/DOCX obrazac
  po jedinici). Tek tada zapis prelazi u `official` i `assets` os se stvarno mice. Cilj iz prvotnog
  plana (30 najvecih jedinica) ostaje otvoren.

### P6-4. Prosirenje taksonomije vrsta rada
- Danas 7 (`seminar`, `final`, `graduate`, `specialist`, `doctoral`, `article`, `project`).
- AC: taksonomija postaje prosiriva podvrstama (strucni izvjestaj, izvjestaj s prakse,
  laboratorijski rad, klinicki prikaz slucaja, portfolio, umjetnicki projekt s elaboratom,
  audiovizualni rad, tehnicki elaborat, policy brief, istrazivacki prijedlog). Podvrsta se
  uvodi SAMO kad postoji profil koji ju stvarno propisuje, uz izvor; ne unaprijed.
- Napomena: `WORK_TYPE_PRIORITY` se ne dira (poznata zamka).
- Velicina: L. Prioritet: P3.

---

## 2. Redoslijed i ovisnosti

```
P0-1 -> P0-2 -> P0-3 -> P0-4          gard istine; sve ostalo mjeri se kroz P0-3
          |
          +-> P1-1 -> P1-2 -> P1-3 -> P1-4     sluzbena matrica programa
          |
          +-> P2-2 -> P2-3 -> P2-4             zatvaranje pravila
          |      |
          |      +-> P4-1 -> P4-2 -> P4-3      synthetic closed-loop 407
          |
          +-> P3-1, P3-2, P3-3, P3-4           graf provjera/popravaka, paralelno
          |
          +-> P5-1 -> P5-2 -> P5-3             stvarni korpus
          |
          +-> P6-1 .. P6-4                     pomocni sadrzaji, paralelno
```

P2-1 (38 ljudskih audita) nema kodnu ovisnost i moze teci usporedno od prvog dana.

---

## 3. Release gate: kada se smije sto tvrditi

Tvrdnja se izvodi iz ledgera, po profilu, nikad globalno:

| Razina | Uvjet (sve osi) | Dopustena javna formulacija |
|---|---|---|
| **A. Dokazano** | program `official`, rules `verified`, repair `faculty-specific`, proof `real-docx-pass` | "provjereno i popravljano prema sluzbenim uputama, dokazano na stvarnom radu" |
| **B. Potvrdjeno** | isto, ali proof `synthetic-pass` | "provjerava i popravlja prema sluzbenim uputama" |
| **C. Djelomicno** | rules `verified`, repair `universal-hygiene` | "provjerava prema sluzbenim uputama; automatski popravak pokriva opcu higijenu dokumenta" |
| **D. Evidentirano** | rules `none` ili `no-technical-rules` | "fakultet ne propisuje tehnicka pravila koja alat moze mjeriti" ili "pravila nisu javno objavljena" |
| **E. Nepokriveno** | program `missing` ili `pending-port` | ne prikazuje se kao pokriveno; nudi se lista cekanja |

**NO-GO ostaje** za "Lekta potpuno provjerava i popravlja svaki akademski rad u Hrvatskoj" sve
dok postoji ijedan aktivni program na razini D ili E. **GO** je za "najveca baza sluzbenih
pravila u Hrvatskoj, sa 407 profila i posteno oznacenim stupnjem pokrivenosti".

---

## 4. Sto ovaj plan NAMJERNO ne radi

- Ne dodaje nijedan fixer prije nego sto se izmjeri je li potreban (obrazac cb74b5d:
  pretpostavljena rupa je mjerenjem ispala ne-rupa).
- Ne pomice granicu iz CLAUDE.md: nista od navedenog ne pise ni ne prepravlja recenice,
  argumentaciju ni sadrzaj rada. Svaki novi zahvat mora proci test vidljivog teksta.
- Ne uvodi bodovana pravila bez sluzbenog izvora. Preporuka bez profila ostaje dopustena
  (`violated: false`, `recommended: true`, bez `matchKeys`), ali ne smije pomaknuti ocjenu.
- Ne izjednacava brojke iz razlicitih artefakata da bi "izgledale slozno": razlika 2135/2208
  je stvarna razlika dviju populacija i rjesava se imenovanjem, ne poravnavanjem.

---

### SUZENJE POTISKIVANJA: 37 pravila je izaslo iz "neprovjerivo" u stvarnu provjeru (2026-08-23)

Zadnji preostali oblik laznog zelenog u lancu tvrdnji (adversarijalni nalaz D11) zatvoren je u
`scripts/audit_scored_quotes.py`. Kvar nije bio u tome STO se potiskuje nego CIME se potiskivanje
opravdava: `has_scanned_pages` vraca `true` cim dokument ima ijednu stranicu-sliku, pa je SVAKO
pravilo iz tog dokumenta dobivalo indulgenciju, ukljucujuci i ona ciji je propis uredno u citljivom
sloju. Dokument s deset skeniranih stranica i trinaest strojno pisanih tako je bio jednako
"neprovjeriv" kao cisti skenirani faksimil.

Suzenje je jedan uvjet vise, a ne novi mehanizam: potiskivanje sada vrijedi samo ako citljivi tekst
o TOJ OSI ne govori nista (`text_layer_covers_axis`). Ako sloj sadrzi rjecnik osi (ime fonta uz
"font"/"pismo", broj uz jedinicu za margine, "prored", "obostran\w*", "oznac\w* stranic\w*" i
slicno), citat se provjerava kao i svaki drugi.

**Izmjereno, prije i poslije:**

| | prije | poslije |
|---|---|---|
| NEPROVJERIVO | 72 | **35** |
| pravila u stvarnoj provjeri | 1895 | **1932** |
| nalaza u artefaktu | 51 | **51** |

Trideset sedam pravila je izaslo iz tisine i **svih 37 je proslo**. To je najbolji moguci ishod i
ujedno najlakse krivo procitan: ne znaci da suzenje nije bilo potrebno, nego da je 37 tvrdnji bilo
tocno a da to nitko nije provjeravao. Artefakt se pritom nije promijenio ni za bajt, pa je promjena
CI-neutralna: `docs/generated/scored-quote-audit.json` ostaje identican.

Izvori koji su i dalje istinski neprovjerivi (35 pravila): `unipu-zavrsni-izmjene-2021` (18),
`forenzika-pravilnik-diplomski` (7), `ffri-povum-upute-diplomski` (3), `ffri-povum-upute` (3),
`efri-pravilnik-diplomski-2014` (2), `efri-pravilnik-zavrsni-2014` (2). Za njih vrijedi postupak iz
prethodne sekcije: renderiraj stranice i procitaj ih.

**Gard nad gardom.** Po tvrdom pravilu ovog repozitorija (`gard bez dokaza da grize ne racuna se`)
diskriminator ima vlastite negativne kontrole u OBA smjera, dostupne kao `npm run audit:selftest` i
ozicene u `.github/workflows/rule-claims.yml`: 10 sintetickih slucajeva (sloj koji os spominje mora
je pokriti, sloj koji je ne spominje ne smije) i 3 nad STVARNIM dokumentima koji su suzenje
motivirali (`vuka` mora biti pokriven na `margins`, `forenzika` ne smije biti pokrivena ni na jednoj
od pet osi). Prva izvedba je jednu kontrolu promasila (regex je trazio red rijeci "oznacene
stranice", a izvor kaze "stranice se oznacavaju"), sto je tocno razlog zasto kontrole postoje.
