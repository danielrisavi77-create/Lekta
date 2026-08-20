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

### P4-1. Generator namjerno neuskladjenog dokumenta iz profila
- Datoteke: `tests/helpers/violating-docx.ts` (nov), oslonjen na `docx-builder`.
- AC: za dani profil generira dokument koji krsi svako bodovano, strojno provjerljivo pravilo
  tog profila (invertirane vrijednosti: drugi font, kriva margina, krivi prored, krivo
  poravnanje, kriv format stranice, plus strukturne varijante gdje ih profil ima).
  Deterministicki bajtovi (fiksni DOS timestamp, isti obrazac kao `gen-composite-fixtures`).
- Velicina: L. Prioritet: P2. Ovisi o: P2-2.

### P4-2. Closed-loop harness
- Petlja po profilu: generiraj krsitelja, `analyzeDocx`, `buildDefaultRepairRequests`,
  `applyFixers`, ponovno `analyzeDocx`.
- AC (tri odvojene tvrdnje, ne jedna):
  1. svaki `auto` check je RIJESEN (100%, bez iznimke);
  2. svaki `assisted` check je ISPRAVNO PRIPREMLJEN za potvrdu (ponudjen, s ciljem, i nije
     primijenjen bez potvrde);
  3. nijedan `manual` nalaz nije automatski promijenjen.
  Plus: `integrityFailure === null`, nula pass-regresija, idempotencija drugog prolaza.
- Datoteke: `scripts/run-closed-loop.mts` (nov), `docs/generated/closed-loop.json`,
  `tests/closed-loop.test.ts` (uzorak u `npm run check`, puni skup u `test:slow`).
- AC izvjestaja: `syntheticClosedLoopNotRunCount` pada s 407 prema 0; ledger os `proof`
  prelazi u `synthetic-pass`.
- Velicina: XL. Prioritet: P2. Ovisi o: P4-1.

### P4-3. Ratchet umjesto velikog praska
- AC: broj profila koji NISU prosli closed-loop je commitani gornji prag koji se smije samo
  smanjivati. Faza daje vrijednost od prvog dana i ne blokira ostatak razvoja.
- Velicina: S. Prioritet: P2.

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

### P6-3. Izjave: `declarations.json` iz `[]` u stvarne podatke
- Arhitektura vec razlikuje `official` / `guidance` / `generic`
  (`src/declarations/declaration-schema.ts`) i validator zabranjuje izmisljen tekst uz
  `guidance`. Fali samo sadrzaj.
- AC: pocetni cilj 30 najvecih jedinica s `official` formulacijom; svaka ostala jedinica
  dobiva `guidance` s izvorom ili ostaje `generic` uz vidljivu napomenu. Pokriti izjavu o
  izvornosti, o koristenju AI alata, o autorskim pravima i suglasnost za objavu, uz propisano
  mjesto, potpis, datum i JMBAG.
- Velicina: XL (podatkovni rad). Prioritet: P3.

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
