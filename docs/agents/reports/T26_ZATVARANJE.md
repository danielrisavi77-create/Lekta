# T26: potvrda točnosti lokalne DOCX analize, dosje zatvaranja

Datum: 2026-09-27. Baza: `origin/master` `cee4751`. Sva mjerenja su izvedena u izoliranom worktreeu nad tom
bazom, s `npm ci` iz locka. Ovaj dosje je prvi kriterij bete (T81, `docs/decisions/T50_OPSEG_LANSIRANJA_PRIJEDLOG.md`,
odjeljak 6, točka 1).

Kriterij iz `docs/agents/tasks.json` (T26):
1. reprezentativna matrica mjerenja i conformance prolaze;
2. nema sustavnog lažnog nalaza na poznato ispravnim dokumentima;
3. nemjerljive stavke označene su kao unknown ili ručna provjera.

Prijedlog statusa: **in_review**. Sva tri kriterija iz `tasks.json` imaju dokaz ispod. Stavke iz šireg plana
(`docs/agents/plan-do-live-2026-09-12.md`, T26) koje ovim nisu zatvorene navedene su u odjeljku 6. O njima
odlučuje koordinator ili vlasnik: jesu li uvjet za `done` ili zasebni zadaci.

## 1. Conformance matrica

```
npm run conformance
 Test Files  10 passed (10)
      Tests  552 passed (552)
   Duration  125.56s
CONFORMANCE EXIT 0
```

Matrica vrti svaki profil registra u 8 dijelova (56 + 7 x 55 = 441 profilni slučaj) i uz njih tripwire testove.
Za svaki profil gradi uskladjen i neuskladjen sintetički rad iz samih pravila profila. Uskladjen mora proći,
neuskladjen mora pasti na svakoj dimenziji koju profil definira. Nijedan slučaj nije pao.

## 2. Nalazi #14, #16 i #17 iz audita 22. 9.

| Nalaz | Status | PR | Testovi (zeleni na `cee4751`) |
|---|---|---|---|
| #14 oštećen XML dobiva ocjenu | zatvoren | #168 | `tests/docx-malformed-xml.test.ts` (29) |
| #16 lozinkom zaštićen .docx i stari .doc | zatvoren | #168 | `tests/docx-intake-cfb.test.ts` (10) |
| #17 skriveni tekst (`w:vanish`) u bodovanju | zatvoren za bodovanje oblikovanja | #168 | `tests/docx-hidden-text-scoring.test.ts` (19) |

```
npx vitest run tests/docx-malformed-xml.test.ts tests/docx-intake-cfb.test.ts \
  tests/docx-hidden-text-scoring.test.ts tests/analysis-false-findings.test.ts
 Test Files  4 passed (4)
      Tests  70 passed (70)
```

Mutacije za sva tri nalaza su u `tests/gate-mutations.test.ts`: `docx/xml-greska-tiho-boduje`,
`docx/zasticen-docx-kao-not-zip` i `docx/skriveni-run-bira-font`.

Za #17 vrijedi ograničenje: broj riječi i pregled i dalje vide skriveni tekst. Koordinator ga vodi kao zaseban
mali zadatak.

## 3. Nema sustavnog lažnog nalaza na poznato ispravnim dokumentima

### 3.1 Uzrok i popravak (#184)

`structure.heading.word-styles` je numerirane stavke literature brojao kao ručno oblikovane naslove. Na 12 od 14
poznato ispravnih fixtura to je stajalo 2 od 4 boda. Popravak je u `src/analysis/manual-heading-candidates.ts`.
Zaključava ga `tests/analysis-false-findings.test.ts`, koji svaki bodovani nalaz na ispravnom fixtureu veže uz
popis dopuštenih s dokazom iz samog paketa.

### 3.2 Stvarni korpus (koordinator, radna stanica, PR #184)

| Korpus | Radova | Greške analize | Uklonjeni kandidati | Pravi naslov | Promjene u drugim provjerama |
|---|---|---|---|---|---|
| docx-local | 127 | 0 | 114 ukupno, u 14 radova | 0 | 0 |
| 03-ingest | 187 | 0 | (zbirno gore) | 0 | 0 |

Svih 114 uklonjenih kandidata su ručno označene stavke literature. Nijedan pravi naslov nije izgubljen.
Izvor je [komentar na #184](https://github.com/danielrisavi77-create/Lekta/pull/184#issuecomment-5858353678).
Tekst korpusa nije u repozitoriju.

### 3.3 Novi prolaz nad fixturima

```
npm run measure:false-findings -- snap --src . --dir tests/fixtures/docx-authored --out <lokalno>
snap: 24 dokumenata, 0 gresaka
```

Bodovani nalazi (earned < max) po `check.id`. "Ispravni" su 14 fixtura `*--uskladjen` i `*--word`, a "neuredni"
10 fixtura `*--neuredan`. Zvjezdica označava fixture bez `profileId`, analiziran sa zadanim profilom, pa njegov
nalaz ne mjeri usklađenost (vidi 3.4).

| `check.id` | Ispravni | Neuredni | Ispravni fixturi |
|---|---|---|---|
| `page.margins` | 4 | 4 | apuri, arh, effectus, fzsri (uskladjen) |
| `scope.words` | 3 | 2 | adu\*, ffzg\* (uskladjen, word) |
| `title.elements` | 3 | 2 | adu\*, ffzg\* (uskladjen, word) |
| `reference.uncited` | 3 | 4 | adu\*, ffzg\* (uskladjen, word) |
| `structure.sections.profile` | 2 | 0 | adu\*, effectus (word) |
| `toc.present` | 1 | 0 | adu\* |
| `format.spacing.body` | 1 | 0 | effectus (word) |
| `page.numbers.present` | 1 | 1 | fsb (uskladjen) |
| `structure.heading.hierarchy` | 0 | 8 | |
| `structure.heading.word-styles` | 0 | 8 | |
| `reference.alphabetical` | 0 | 4 | |

### 3.4 Tumačenje

- **Fixturi s profilom (11):** ostaje 7 nalaza i svi su stvarna odstupanja u DOCX paketu. `tests/helpers/false-findings.ts`
  svaki veže uz dokaz koji test strojno provjerava:
  - LibreOffice izvoz upisuje `w:bottom="1976"`, što je 3,49 cm;
  - Word varijanta effectusa ima prored 1,5 i nema odlomka "Sadržaj";
  - FSB ima podnožje bez PAGE polja.
- **Fixturi bez profila (3: adu, ffzg x2):** nemaju pravila prema kojima bi bili usklađeni. Nalazi za opseg,
  naslovnicu i citiranost mjere zadani profil, ne lažni nalaz analize. Test "nijedan od 14 nema kandidata za ručni
  naslov" ipak ih uključuje, jer ta heuristika ne ovisi o profilu.
- **Neuređeni fixturi** i dalje hvataju ono što trebaju (hijerarhija, ručni naslovi, redoslijed literature). Popravak
  iz #184 nije oslabio detekciju.

Zaključak: na ovom uzorku i korpusu nema sustavnog lažnog nalaza. Jedini koji je postojao uklonjen je i
zaključan testom.

## 4. Nemjerljive stavke

Nemjerljivo se ne boduje kao prolaz ni pad. Iz istog prolaza nad 24 fixturea, raspodjela statusa svih provjera:

| Status | Broj |
|---|---|
| `pass` | 379 |
| `warn` | 45 |
| `fail` | 6 |
| `informational` (max 0, ne ulazi u ocjenu) | 147 |
| `unmeasurable` (max 0) | 34 |

`unmeasurable` nastaje iz `unmeasurableCheck` (`src/scoring/checks.ts`). Ovdje su to `manual.checks` (ručni zahtjevi
profila, 10 pojava) i `citation.style-automation` (citatni stil koji nije potpuno automatiziran, 24 pojave).

## 5. Granice veličine i vremena

Granice veličine su u kodu i testovima:
- upload do 20 MB (`DOCX_MAX_UPLOAD_BYTES`);
- najviše 64 MB nakon raspakiravanja (`DOCX_MAX_TOTAL_DECOMPRESSED_BYTES`), oboje u `src/repair/docx-budget.ts`;
- niži proračun na slabom uređaju (`tests/memory-budget.test.ts`).

Otkazivanje i zastarjeli rezultat pokrivaju `tests/analyze-docx-cancel.test.ts` i `tests/analysis-staleness.test.ts`.

```
npx vitest run tests/analyze-docx-cancel.test.ts tests/analysis-staleness.test.ts \
  tests/memory-budget.test.ts tests/repair-limits.test.ts
 Test Files  4 passed (4)
      Tests  26 passed (26)
```

Vrijeme analize je izmjereno jednokratno: `analyzeFixture` u Nodeu 22, 4 vCPU, sintetički rad s naslovima svakih
25 odlomaka.

| Odlomaka | Riječi (približno) | Veličina .docx | Vrijeme |
|---|---|---|---|
| 500 | 30.000 | 251 KB | 1,4 s |
| 2.000 | 120.000 | 997 KB | 3,5 s |
| 8.000 | 480.000 | 3.982 KB | 18,0 s |

Tipičan završni ili diplomski rad (10 do 30 tisuća riječi) je u prvom retku. Mjerenje nije u pregledniku ni u
workeru, i nije gard: nijedan test ne ruši build ako analiza uspori.

## 6. Što ovim nije zatvoreno

Stavke iz šireg plana T26 koje nisu u kriteriju `tasks.json`:

1. **Tablica podržanih svojstava** (sekcije, margine, stilovi i nasljeđivanje, tablice, zaglavlja, fusnote i endnote,
   brojanje, bibliografija) ne postoji kao dokument.
2. **Više izvora dokumenata:** uzorak je Word i LibreOffice iz generatora te stvarni korpus. Google Docs i druge
   lokalizacije Worda nisu zasebno mjerene.
3. **Vrijeme obrade kao gard:** mjera iz odjeljka 5 je jednokratna, u Nodeu, bez praga u CI-ju.
4. **Skriveni tekst** u broju riječi i pregledu (#17, drugi dio) je zaseban mali zadatak.
5. **Rupa iz Codex F2 (#184):** naslov s godinom koji završava točkom, odmah iza zalutalog odlomka "Literatura", bio bi
   izuzet. Na korpusu takvog slučaja nije bilo.

Ako se neka od točaka 1 do 3 smatra uvjetom za `done`, T26 ostaje `in_progress` s tim popisom.
