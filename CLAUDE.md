# CLAUDE.md â ThesisReady

Operativni vodiÄ za rad na ovom repozitoriju. ProÄitaj prije bilo kakve izmjene.

## Å to je ovo

Klijentska web aplikacija (Vite + TypeScript) koja u pregledniku analizira `.docx`
akademske radove i provjerava oblikovanje, strukturu, opseg i citiranje prema
sluÅ¾benim profilima fakulteta (FPZG i Pravni fakultet u Zagrebu). Sva analiza je
lokalna: dokument se ne Å¡alje na posluÅ¾itelj. Postoji i monetizacija (paketi,
narudÅ¾be, payment linkovi), GDPR pravni tekstovi i ugraÄena QA dijagnostika.

Stack: Vite, TypeScript (strict), vitest + happy-dom. Bez frameworka, bez backenda.
Ovo NIJE Next.js projekt i nema veze s maturiraj.hr; ne mijeÅ¡aj konvencije.

## Tvrdo pravilo: build gate

Svaka promjena mora proÄi prije commita:

```bash
npm run check   # tsc --noEmit && vitest run && vite build
```

Ako `check` pada, promjena nije gotova. Ne commitaj crveno.

## Arhitektura (stanje i smjer)

- `data/` je tipiziran i modularan: profili, izvori, rokovi, katalog, coverage,
  metodologija, svaki u svom JSON-u. Loaderi u `src/*` ih hidriraju i tipiziraju.
- `src/main.ts` je joÅ¡ monolit (~540 redaka, `@ts-nocheck`): DOCX parser, svi auditi,
  Legal Citation Engine, UI, narudÅ¾be i plaÄanje su u toj jednoj datoteci. Cilj je
  postupno ga razbiti u tipizirane module bez promjene ponaÅ¡anja (vidi backlog).

## Option A: ruleEntries su izvor istine

Pravila profila postoje u dva oblika:

- `rules` â naslijeÄeni agregirani objekt koji engine povijesno Äita.
- `ruleEntries` â granularna pravila s identitetom, autoritetom, izvorom,
  `sourcePage`, `machineCheckable` i datumom verifikacije. Ovo je AUTORSKI izvor istine.

`src/profiles/rule-compiler.ts` na uÄitavanju raÄuna `effectiveRules`:

```
effectiveRules = clone(rules baseline) + svaki prepoznati ruleEntry preko njega
```

Engine (`currentProfile` u `src/main.ts`) Äita `definition.effectiveRules`, uz fallback
na `definition.rules`. Test `tests/rule-compiler.test.ts` dokazuje da je za trenutne
podatke `effectiveRules` deep-equal `rules`, dakle ukljuÄenje kompajlera ne mijenja
ponaÅ¡anje.

### Kako se od sada ureÄuje pravilo

1. Uredi odgovarajuÄi `ruleEntry` u JSON profilu (ne `rules`).
2. Ako `ruleEntry` za to pravilo ne postoji, dodaj ga s ispravnim `checkId`
   (popis prepoznatih `checkId`-jeva je `COMPILED_CHECK_IDS` u `rule-compiler.ts`).
3. Migracijski cilj: jednom kad je kljuÄ izraÅ¾en kao `ruleEntry`, OBRIÅ I ga iz `rules`.
   Overlay ga i dalje proizvodi pa engine ne vidi promjenu. Time nestaje dvostruko
   odrÅ¾avanje. Nakon brisanja prilagodi faithfulness test (viÅ¡e neÄe biti pune
   jednakosti za taj kljuÄ; tada se oslanjamo na ânula diagnosticsâ + golden testove).
4. Novi `checkId` koji joÅ¡ nije podrÅ¾an: dodaj mapiranje u `applyEntry` u `rule-compiler.ts`
   i pokrij testom. Bez mapiranja kompajler vraÄa diagnostic i pravilo se NE primjenjuje.

### Hijerarhija pravila i uloga repozitorija

Ne izmiÅ¡ljaj pravila. Bodovana pravila smiju doÄi samo iz navedenih sluÅ¾benih izvora.
Hijerarhija: aktualna odluka/pravilnik za godinu i vrstu rada > aktualna sluÅ¾bena
stranica studija > opÄe FPZG upute i citiranje > pisana uputa mentora/kolegija.
Studentski radovi iz repozitorija sluÅ¾e ISKLJUÄIVO regresijskom testiranju parsera,
nikada kao izvor pravila. `sourcePage` koji nije potvrÄen ostaje `null`, ne nagaÄaj ga.

## Parser: ne diraj bez golden testa

Legal Citation Engine i OOXML parser su teÅ¡ki regexi nad hrvatskim pravnim i
akademskim formama i lako se kvare. Pravilo: ne mijenjaj parser, audit ni citation
engine bez golden-file testa koji PRVO dokazuje zateÄeno ponaÅ¡anje.

- Golden harness: `tests/docx-golden.test.ts` + `tests/fixtures/docx/`.
- Ubaci realne `.docx`, snimi baseline s `npm test -- -u`, pa refaktoriraj.
- Suite se sam preskaÄe dok nema fixtura, da build ostane zelen.

## Mapa datoteka

- `src/main.ts` â monolitni runtime (parser, auditi, UI, narudÅ¾be). Meta: razbiti.
- `src/profiles/profile-loader.ts` â registar profila, hidracija izvora, kompilacija.
- `src/profiles/rule-compiler.ts` â Option A: ruleEntries -> effectiveRules.
- `src/profiles/profile-schema.ts` â tipovi profila i pravila.
- `src/profiles/profile-validator.ts` â strukturna validacija profila.
- `src/{catalog,submission,coverage,methodology,config}/*` â tanki loaderi.
- `data/**` â autorski podaci (profili, izvori, rokovi, katalog, coverage).
- `tests/**` â vitest: registar, regresija, UI smoke, rule-compiler, docx-golden.

## Provenijencija fieldValidation (PID je identitet, ne sha256)

Javni PDF uzorci u `fieldValidation.publicSources` identificiraju se PID-om
(npr. `fkit:1301`), nikada preko sha256. nsk.hr repozitoriji (zir.nsk.hr,
dr.nsk.hr, repozitorij.<fak>.unizg.hr) utiskuju jedinstveni watermark (~63 bajta
u repu PDF-a) pri svakom preuzimanju, pa ponovni dohvat istog PID-a daje drugaciji
sha. Zabiljezeni sha256 je otisak konkretne preuzete kopije u trenutku harvesta,
ne reproducibilan integritetski hash. PDF-ovi se ne commitaju.

Doktorska razina: jedini pouzdan izvor je dr.nsk.hr driver (openAccess) set
(100% dc:type=Doktorski rad) ili dc.type/naslovnica po objektu. Institucijski
`repozitorij.<fak>.unizg.hr` namespace je mijesan po razini (diplomski, zavrsni,
doktorski) pa PID sam po sebi ne jamci doktorsku razinu; provjeri je iz PDF-a.
Dohvat trazi pune browser headere (Accept, Accept-Language, Sec-Fetch-*), inace
ModSecurity vraca HTTP 418.

## Konvencije

- Hrvatski je default jezik sadrÅ¾aja i komentara u domenskim datotekama.
- Bez em i en crtica u tekstu; koristi zarez, dvotoÄku, zagrade ili zasebne reÄenice.
- TypeScript strict. Ne uvodi `any` osim na granici prema monolitu dok traje split.
- Bez localStorage hackova u novim modulima; postojeÄi `safeStorageGet/Set` ostaje.
- Produkcijski kod, ne primjeri. Male, fokusirane promjene, svaki korak zelen.

## Backlog (svaki je Äist, samostalan task; Definition of Done = `npm run check` zelen)

1. Golden harness s podacima: ubaci 5 do 10 realnih `.docx` fixtura i snimi baseline.
   DoD: golden suite aktivan i zelen, snapshoti commitani.
2. (GOTOVO) Option A kompajler i `effectiveRules` wiring. SljedeÄi korak unutar ovoga:
   ukloni iz `rules` kljuÄeve koji su veÄ u `ruleEntries`, profil po profil, i prilagodi
   faithfulness test. DoD: nema dvostrukog voÄenja za migrirane kljuÄeve, check zelen.
3. Razbijanje `src/main.ts`: izvuci redom parser (`ZipReader`, `parseStyles`, OOXML
   helperi), pa audite, pa author-year i legal citation engine, pa UI, pa ordering.
   Makni `@ts-nocheck` modul po modul. DoD: golden snapshoti se ne mijenjaju, check zelen.
4. Popuni `sourcePage` za sve `ruleEntries` iz `source-registry` (ruÄno potvrÄeno;
   nepotvrÄeno ostaje `null`). DoD: validator bez novih greÅ¡aka, check zelen.
5. DovrÅ¡i preostale profile iz jednog tipiziranog izvora (ruleEntries). DoD: coverage
   matrica i QA dijagnostika bez regresija, check zelen.
6. (Proizvodna odluka, kad zatreba naplata) pravi backend za narudÅ¾be i plaÄanje
   (Supabase), umjesto klijentskog JSON-a i Netlify forme.
