# CLAUDE.md - ThesisReady

Operativni vodič za rad na ovom repozitoriju. Pročitaj prije bilo kakve izmjene.

## Što je ovo

Klijentska web aplikacija (Vite + TypeScript) koja u pregledniku analizira `.docx`
akademske radove i provjerava oblikovanje, strukturu, opseg i citiranje prema
službenim profilima fakulteta (FPZG i Pravni fakultet u Zagrebu). Sva ANALIZA je
lokalna: dokument se pritom ne šalje na poslužitelj. Postoji i monetizacija (paketi,
narudžbe, payment linkovi), GDPR pravni tekstovi i ugrađena QA dijagnostika.

Stack: Vite, TypeScript (strict), vitest + happy-dom, bez frontend frameworka.
Za razliku od besplatne analize, repozitorij VIŠE NIJE bez backenda: placeni
automatski popravak (`src/repair`, kad je `repairEndpoint` konfiguriran), narudžbe,
waitlist i rokovi/podsjetnici idu na živi Supabase backend (`supabase/migrations`,
`supabase/functions`). "Bez backenda" vrijedi samo za samu analizu, ne za proizvod
u cjelini.
Ovo NIJE Next.js projekt i nema veze s maturiraj.hr; ne miješaj konvencije.

## Tvrdo pravilo: Lekta nikad ne generira niti ne prepravlja sadržaj rada

Lekta smije mjeriti, provjeravati, uspoređivati s pravilima i determinističkim putem
popravljati FORMU (font, prored, margine, numeracija, format citata i slično). Lekta
nikad ne piše, ne prepravlja i ne ocjenjuje rečenice, argumentaciju ili sadržaj rada,
ni preko AI modela ni na bilo koji drugi način. Ovo nije samo namjera nego već
arhitektonska činjenica: popravak nema model ni prompt (vidi "Popravak" niže),
gramatika i pravopis su lokalni lintovi, savjetodavni, provjera citata je provjera
postojanja preko CrossRefa, nikad generiranje teksta. Svaka nova značajka mora ostati
unutar te granice.

Razlog je poslovni, ne samo etički: institucionalna prodaja fakultetima (B2B, po
ustanovi) i AI generiranje sadržaja studentskog rada se međusobno isključuju. Alat koji
samo mjeri formu prema fakultetovim vlastitim, već objavljenim pravilima, fakultet može
odobriti brzo, analogno alatu za provjeru izvornosti. Alat koji piše ili prepravlja
argumentaciju je pitanje akademskog poštenja: ide na etičko povjerenstvo, sporo se
odobrava ili se odbija. Ta granica čuva mogućnost prodaje instituciji, ne samo
pojedinačnom studentu, i vrijedi i za copy i marketing (ne obećavaj "AI piše umjesto
tebe").

### Gdje je granica: test vidljivog teksta

Pravilo iznad ne zabranjuje sve što dira dokument, nego ono što mijenja SADRŽAJ. Razlika
je mjerljiva, pa se ne rješava procjenom:

> Zahvat je dopušten ako tekst koji korisnik vidi na ekranu i u ispisu ostane isti,
> **i prije i poslije osvježavanja polja u Wordu**. Mehanika ispod smije se mijenjati:
> polja, sidra (bookmarkovi), stilovi, numeracija, relacije, dijelovi paketa.

Provjera je doslovna, ne teorijska: otvori dokument Wordom, pozovi `Fields.Update()`,
usporedi tekst prije i poslije (`scripts/word-verify/`, Tier 2 u
`docs/REAL_CORPUS_TESTING.md`). Testovi zato čitaju SPOJENI tekst odlomka, ne sirovi XML,
jer se dio ovih kvarova u XML-u uopće ne vidi (RE-57, RE-58).

Tri postojeća popravka SMIJU mijenjati vidljivi tekst i to je namjerno, jer je svaki od
njih format, ne argumentacija: velika slova naslova (`heading-case-fixer`), hrvatska
tehnička tipografija (`croatian-typography-fixer`) i kanonizacija DOI-ja
(`bibliography-repair-fixer`, `link-doi-fixer`). Svaki traži izričitu potvrdu i nijedan ne
dira rečenice tijela rada.

### Dopušteno bez fakultetskog pravila (preporuke)

Popravak se smije nuditi i kad ga nijedan profil ne propisuje, ali samo kao PREPORUKA:
`violated: false`, `recommended: true`, BEZ `matchKeys`. Time se ne veže ni na jedan bodovan
check i ne može pomaknuti ocjenu. Izmišljeno pravilo je ono koje OCJENJUJE; preporuka koju
korisnik bira nije, i ne ruši argument za institucionalnu prodaju.

Uvjeti su kumulativni: prolazi test vidljivog teksta, traži potvrdu, ne umeće nov tekst
(bez profila se ne izmišljaju natpisi ni sekcije, nego se popravlja ono što već postoji), i
jasno kaže korisniku da nije zahtjev fakulteta. Presedan su `empty-paragraph-fixer` i
`croatian-typography-fixer`; noviji primjer su unakrsne upute na tablice i slike
(`element-caption-fixer`, RE-59).

Što OSTAJE zabranjeno bez obzira na sve gore: pisanje ili prepravljanje rečenica i
argumentacije, generiranje sadržaja bilo kojim modelom, i bodovanje po pravilu koje nema
službeni izvor.

Ako proizvod ikad zatreba AI asistirano pisanje ili coaching (primjer: sestrinski
proizvod Katedra, zaseban proizvod istog vlasnika), to ide u odvojen proizvod i
repozitorij, nikad u Lektu. Podaci smiju teći iz Lekte prema drugom proizvodu
(izvezena, informativna, neautoritativna projekcija Lektinih verificiranih pravila),
nikad obrnuto, i taj drugi proizvod nikad ne smije tvrditi da je njegova provjera
formalno mjerodavna: to ostaje isključivo Lektin posao. Vidi `src/integrations/`
za konkretan, jednosmjeran izvoz podataka prema Katedri (`katedra-pack`).

## Tvrdo pravilo: build gate

Svaka promjena mora proći prije commita:

```bash
npm run check   # tsc --noEmit && vitest run && vite build
```

Ako `check` pada, promjena nije gotova. Ne commitaj crveno.

## Arhitektura (stanje i smjer)

- `data/` je tipiziran i modularan: profili, izvori, rokovi, katalog, coverage,
  metodologija, svaki u svom JSON-u. Loaderi u `src/*` ih hidriraju i tipiziraju.
- `src/ui/app.ts` je UI orkestrator (~1530 redaka, tipiziran, VISE NIJE `@ts-nocheck`):
  UI, narudzbe, placanje i QA. Analiticka jezgra je izvucena: `analyzeDocx` + auditni
  helperi zive u `src/analysis/analyze-docx.ts` (tipizirano), a analiza u pregledniku radi
  u Web Workeru (`analyze-docx.worker.ts` + most `analyze-docx-client.ts` s inline
  fallbackom; worker koristi isti @xmldom/xmldom DOMParser kao testovi, pa golden pokriva
  worker putanju). Tipizacija app.ts je pragmaticna: `$`/`$$` i uvezene lookup-mape su `any`
  na granici prema DOM-u/podacima, tijelo je vecinom `any`. CIJELI `src/` je sada bez ijedne
  `@ts-nocheck` direktive (i generator-alati `src/tools/*-page.ts` i `src/shared/ui-boot.ts`
  su tipizirani); tsc strict prolazi bez supresije.
  Ulaz je `src/main.ts` (tanki bootstrap koji uvozi ui-boot i ui/app), NE monolit.

## Option A: ruleEntries su izvor istine

Pravila profila postoje u dva oblika:

- `rules` - naslijeđeni agregirani objekt koji engine povijesno čita.
- `ruleEntries` - granularna pravila s identitetom, autoritetom, izvorom,
  `sourcePage`, `machineCheckable` i datumom verifikacije. Ovo je AUTORSKI izvor istine.

`src/profiles/rule-compiler.ts` zna izračunati `effectiveRules`:

```
effectiveRules = clone(rules baseline) + svaki prepoznati ruleEntry preko njega
```

### STVARNO STANJE (izmjereno 2026-08-08, riješeno 2026-08-09)

Kompajler NIKAD nije bio ožičen: `loadProfiles()` / `compileProfile()` nisu imali
nijednog pozivatelja, `effectiveRules` se nikad nije pridružio profilu, a
`verified-profiles.json` nosi **0 `ruleEntries` na 407 profila**, pa bi i ožičen
kompajler vratio goli `clone(rules)`. `currentProfile()` je oduvijek klonirao
`definition.rules`.

Zato su `compileProfile()` i `src/profiles/profile-loader.ts` **obrisani**: mrtav kod
koji izgleda kao mehanizam sinkronizacije opasniji je od nepostojanja mehanizma, jer je
upravo on opravdavao (pogrešnu) uputu "obriši ključ iz `rules`, overlay ga proizvodi".

`compileEffectiveRules` i `collectCompileDiagnostics` OSTAJU (koriste ih
`src/verification/published-rules.ts`, QA konzola i testovi), a `COMPILED_CHECK_IDS`
je i dalje kanonski popis prepoznatih `checkId`-jeva.

Sinkronizaciju sada jamči **build-time invarijanta**, ne runtime overlay:
`tests/repair-draft-rules-divergence.test.ts` traži da `rules` bude jednak vrijednosti
iz izvorom potkrijepljenog drafta, uz nultu toleranciju.

### Gdje `ruleEntries` STVARNO utječu na proizvod

Ne kroz `effectiveRules`, nego kroz dvije PEČENE mape (`scripts/gen-profile-runtime-maps.mts`):

```text
data/profiles/**/drafts/*.json   (autorski ruleEntries, sa sourceId/sourcePage/quote)
        |
        +--> data/profiles/advisory-map.json --> applyBakedAdvisory()  --> demotira bodovanje
        +--> data/profiles/repair-map.json   --> repairEntriesFor()    --> buildRepairableItems
```

Analiza mjeri prema `rules` iz `verified-profiles.json`, a popravak cilja prema
`ruleEntry.value` iz `repair-map.json`. **Draft je mjerodavan** jer jedini nosi
`sourceId`, `sourcePage` i doslovan `quote`; `rules` mu je zrcalo.

`scripts/approve-profile.mjs` mijenja samo STATUSE draftova i nikad ne upisuje vrijednost
u `rules`, pa se te dvije strane mogu razići. Dva mjerenja i dvije zaštite:

- **Popravak koji obara ocjenu.** 368 profila / 1844 zapisa dalo je jedan slučaj
  (`unizd-povijest-zavrsni`, prored 2 naspram bodovanih 1,5). Čuva
  `recommendationBreaksScoredRule` (`src/ui/repair-items.ts`) uz
  `tests/repair-recommendation-safety.test.ts`: popravak koji bi oborio bodovani check
  koji prolazi se NE nudi.
- **Labela iz drafta, vrijednost iz `rules`.** Pečenje je do 2026-08-09 izbacivalo `value`
  za verificirane zapise, pa je popravak uvijek uzimao vrijednost iz `rules`: korisnik je
  vidio "Margine (lijeva 3,5cm)", a dobivao 2,5 cm. Zatečeno na 19 pravila / 14 profila,
  u svakom je draft doslovno odgovarao citatu, a `rules` mu proturječio. Riješeno tako što
  je vrijednost iz drafta upisana u `rules`, a pečenje sada čuva `value`. Čuva
  `tests/repair-draft-rules-divergence.test.ts` uz nultu toleranciju.

### Kako se od sada uređuje pravilo

1. Uredi odgovarajući `ruleEntry` u draft datoteci profila (`data/profiles/**/drafts/`).
2. Ako `ruleEntry` za to pravilo ne postoji, dodaj ga s ispravnim `checkId`
   (popis prepoznatih `checkId`-jeva je `COMPILED_CHECK_IDS` u `rule-compiler.ts`).
3. Ako pravilo treba BODOVATI, moraš uz draft urediti i `rules` u
   `verified-profiles.json` na ISTU vrijednost, pa pokrenuti
   `node scripts/gen-verified-split.mjs`. Nema overlaya koji bi to napravio umjesto tebe.
   **NE briši ključ iz `rules` "jer ga overlay proizvodi" - ne proizvodi ga.**
   Brisanje tiho izbacuje pravilo iz žive analize, a `npm run check` ostaje zelen.
4. Regeneriraj pečene mape (`npx vite-node scripts/gen-profile-runtime-maps.mts`) pa
   `npm run check`. Divergenciju hvataju `tests/repair-draft-rules-divergence.test.ts`
   (draft vs `rules`, nulta tolerancija) i `tests/repair-recommendation-safety.test.ts`
   (popravak ne smije oboriti bodovani check).
5. Novi `checkId` koji još nije podržan: dodaj mapiranje u `applyEntry` u `rule-compiler.ts`
   i pokrij testom. Bez mapiranja kompajler vraća diagnostic i pravilo se NE primjenjuje.

### Hijerarhija pravila i uloga repozitorija

Ne izmišljaj pravila. Bodovana pravila smiju doći samo iz navedenih službenih izvora.
Hijerarhija: aktualna odluka/pravilnik za godinu i vrstu rada > aktualna službena
stranica studija > opće FPZG upute i citiranje > pisana uputa mentora/kolegija.
Studentski radovi iz repozitorija služe ISKLJUČIVO regresijskom testiranju parsera,
nikada kao izvor pravila. `sourcePage` koji nije potvrđen ostaje `null`, ne nagađaj ga.

## Parser: ne diraj bez golden testa

Legal Citation Engine i OOXML parser su teški regexi nad hrvatskim pravnim i
akademskim formama i lako se kvare. Pravilo: ne mijenjaj parser, audit ni citation
engine bez golden-file testa koji PRVO dokazuje zatečeno ponašanje.

- Golden harness: `tests/docx-golden.test.ts` + `tests/fixtures/docx/`.
- Ubaci realne `.docx`, snimi baseline s `npm test -- -u`, pa refaktoriraj.
- Suite se sam preskače bez fixtura; sada je AKTIVAN sa 6 realnih fixtura u tests/fixtures/docx/ (snapshoti commitani), izlozen kroz src/analysis/golden-entry.ts.

## Popravak: deterministican, per-fakultet kroz PODATKE

U popravku nema modela ni prompta. "Recept" je niz `{fixerId, ruleId, params}` koji klijent slozi
iz profila (`paramsForCheck` u `src/ui/repair-items.ts`); server pravila NE izvodi, nego provjeri
je li fixer poznat i ziv, sanira parametre i izvrsi. Zato je pravilo po fakultetu izrazeno kao
podatak (`data/profiles/**`), nikad kao tekst upute.

- Recept je zapisan u `docs/REPAIR_RECIPE.md`, GENERIRAN iz koda i profila (`npm run repair-recipe`,
  izvor `src/repair/recipe.ts`). Ne uredjuj ga rucno; `tests/repair-recipe.test.ts` pada na drift.
- Tok: dokument ide na server SAMO za popravak. Provjera izvora ide ZASEBNIM, usporednim pozivom
  (`source-check`), a pohrana u "Moji popravci" dovrsava se u pozadini (`EdgeRuntime.waitUntil`),
  pa odgovor nosi samo popravljeni docx.
- Postenje: dok pohrana traje (`storagePending`), sucelje NE smije tvrditi da je spremljeno;
  promasaj u korpusu NIKAD nije dokaz da izvor ne postoji.
- ISPORUKA TEK NAKON VERIFIKACIJE (lokalni panel, od 2026-08-09). Do tada se preuzimanje okidalo
  prije ponovne analize, pa je `detectPassRegressions` mogao samo PRIJAVITI pogorsanje, nikad ga
  izbjeci ("dokument je vec kod korisnika"). Sada `performRepair` prvo pokrene re-check, pa
  automatski preuzima SAMO ako nema dokaza o pogorsanju; kad ga ima, nudi izricit izbor
  (`renderDeliveryChoice`). Granica je namjerna i mora ostati: verifikacija smije ODGODITI i
  zamijeniti automatsko preuzimanje, ali ga NIKAD ne smije sprijeciti, pa svaki nesiguran ishod
  (analiza nedostupna, `null`, bacanje, istek `RECHECK_TIMEOUT_MS`) isporucuje odmah. Serverski
  put (`app.ts`) ionako trazi klik na gumb, pa tamo nema automatske isporuke koju bi trebalo
  zadrzavati.
- Popravljeni paket se dokazuje u CETIRI razine (`docs/REAL_CORPUS_TESTING.md`, Tier model).
  `npm run check` je samo Tier 0 (vlastiti strogi skener `src/repair/package-integrity.ts`) i NE
  otvara dokument nijednim stvarnim uredivacem. Prije deploya repair motora rucno pokreni i
  `npm run verify:strict-open` (python-docx) te `npm run verify:word` / `verify:word:worst`
  (Word COM, `OpenAndRepair=false`, Windows). Oracle POSTOJI u `scripts/word-verify/`, ne gradi ga
  ispocetka. KLJUC: `@xmldom/xmldom` ne baca i ne stvara `parsererror` na neispravnom XML-u, pa
  provjera oslonjena na `parseXml` daje lazno zeleno (dokaz: `tests/repair-package-integrity.test.ts`).

## Mapa datoteka

- `src/ui/app.ts` - UI orkestrator (UI, narudzbe, placanje, QA). Meta: dovrsiti split.
- `src/analysis/analyze-docx.ts` - analyzeDocx + auditni helperi (jezgra analize).
- `src/analysis/analyze-docx-client.ts` - most prema Web Workeru, inline fallback.
- `src/profiles/profile-loader.ts` - registar profila, hidracija izvora, kompilacija.
- `src/profiles/rule-compiler.ts` - Option A: ruleEntries -> effectiveRules.
- `src/profiles/profile-schema.ts` - tipovi profila i pravila.
- `src/profiles/profile-validator.ts` - strukturna validacija profila.
- `src/{catalog,submission,coverage,methodology,config}/*` - tanki loaderi.
- `src/citations/*` - Legal Citation Engine i korpusna/CrossRef verifikacija citata.
- `src/repair/*` - Repair Engine: XML fixeri (`fixers.ts`, `xml-patch.ts`), zip codec,
  `apply-fixers.ts` (jezgra dijeljena s serverskim putem). Golden-zasticeno kao parser.
  `recipe.ts` je build/docs sloj (NIJE u bundleu): iz njega se generira `docs/REPAIR_RECIPE.md`.
- `src/report/*` - klijenti prema Supabase backendu (repair-client, source-check-client,
  repair-history, auth).
- `supabase/migrations/**`, `supabase/functions/**` - zivi backend (repair-docx, source-check,
  waitlist, deadline-reminders, narudzbe); NIJE "bez backenda" iznad, vidi "Sto je ovo".
- `data/**` - autorski podaci (profili, izvori, rokovi, katalog, coverage).
- `tests/**` - vitest: registar, regresija, UI smoke, rule-compiler, docx-golden.

Pravne stranice (`privatnost.html`, `uvjeti-koristenja.html` i dr.) generira
`scripts/generate-legal-pages.mjs`, koji se u `netlify.toml` pokrece TEK NAKON
`vite build`. Provjera tih linkova (goli `<a href>` na svim alat-stranicama i
landingu, bez JS presretanja/modala kao na `index.html`) zahtijeva puni build
lanac (`vite build && generate-citation-tools && generate-legal-pages`); sam
`npm run dev` ili goli `vite build && vite preview` ce 404-ati jer datoteke jos
ne postoje. `scripts/verify-deploy-dist.mjs` cuva da su u stvarnom `dist/` uvijek
prisutne prije deploya.

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

- Hrvatski je default jezik sadržaja i komentara u domenskim datotekama.
- Bez em i en crtica u tekstu; koristi zarez, dvotočku, zagrade ili zasebne rečenice.
- TypeScript strict, cijeli `src/` bez `@ts-nocheck`. `any` je dopusten na granici prema
  DOM-u i labavim podacima (UI glue: `$`/`$$`, lookup-mape); u novom logickom kodu izbjegavaj.
- Bez localStorage hackova u novim modulima; postojeći `safeStorageGet/Set` ostaje.
- Produkcijski kod, ne primjeri. Male, fokusirane promjene, svaki korak zelen.

## Codex (drugo misljenje)

Instaliran je Codex plugin (codex@openai-codex). Podjela uloga: Claude Code je
primarni driver (implementacija, orkestracija, memorija, domensko znanje), Codex
je neovisno drugo misljenje drugog modela.

- `/codex:review` prije commita netrivijalnih promjena; `/codex:adversarial-review`
  za parser/citation/security kod i arhitektonske odluke (npr. backlog 6 backend).
- Nalazi su ADVISORY: hard gate ostaje `npm run check` + golden testovi. Svaki
  nalaz re-verificiraj prije primjene, ne preuzimaj tudje expecte.
- `/codex:rescue` je default write-capable: za parser/citation kod trazi read-only
  ili prvo snimi golden baseline; sve rescue izmjene moraju proci `npm run check`.
- `AGENTS.md` je kompaktni derivat tvrdih pravila ovog vodica (Codex cita njega,
  ne CLAUDE.md); kad mijenjas tvrdo pravilo, azuriraj obje datoteke.
- Codexov Stop review gate je namjerno iskljucen (rucni review na commit-tockama).

## Backlog (svaki je čist, samostalan task; Definition of Done = `npm run check` zelen)

1. Golden harness s podacima: ubaci 5 do 10 realnih `.docx` fixtura i snimi baseline.
   DoD: golden suite aktivan i zelen, snapshoti commitani.
2. (OTVORENO, ranije pogrešno označeno GOTOVO) Option A kompajler POSTOJI ali NIJE ožičen:
   `compileProfile` nema pozivatelja, `effectiveRules` se nikad ne pridruži profilu, a
   `verified-profiles.json` ima 0 `ruleEntries` (mjereno 2026-08-08, vidi "STVARNO STANJE"
   iznad). Odluka koja stoji: ili ožičiti kompajler u živi put, ili obrisati mrtvi
   `profile-loader.ts` i priznati da su pečene mape (`repair-map`, `advisory-map`) jedini
   put kojim `ruleEntries` utječu na proizvod. **NE brisati ključeve iz `rules` dok ovo
   stoji otvoreno** - overlay ih ne bi nadomjestio. DoD: jedan izvor istine po pravilu,
   `tests/repair-recommendation-safety.test.ts` zelen, check zelen.
3. (GOTOVO) Razbijanje `src/ui/app.ts`: parser i citation engine su vec u
   `src/{docx,audits,citations,scoring}`, `analyzeDocx` + auditni helperi u
   `src/analysis/analyze-docx.ts`, a `@ts-nocheck` je skinut sa samog app.ts I sa svih
   preostalih modula (5 generator-alata `src/tools/*-page.ts` + `src/shared/ui-boot.ts`);
   CIJELI `src/` prolazi tsc strict bez supresije. Golden netaknut, check zelen.
4. Popuni `sourcePage` za sve `ruleEntries` iz `source-registry` (ručno potvrđeno;
   nepotvrđeno ostaje `null`). DoD: validator bez novih grešaka, check zelen.
5. Dovrši preostale profile iz jednog tipiziranog izvora (ruleEntries). DoD: coverage
   matrica i QA dijagnostika bez regresija, check zelen.
6. (Proizvodna odluka, kad zatreba naplata) pravi backend za narudžbe i plaćanje
   (Supabase), umjesto klijentskog JSON-a i Netlify forme.
