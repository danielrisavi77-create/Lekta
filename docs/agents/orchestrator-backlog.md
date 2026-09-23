# Lekta — backlog orkestratora

**Vlasnik:** Grok Bot / Lekta Orchestrator (van T00–T47 implementacijskih sesija)  
**Datum:** 2026-09-20  
**Svrha:** pokriti posao koji `plan-do-live` / `tasks.json` **ne** tretira kao stalan: higijenu, PR triage, drift i slijepe točke.  
**Granica:** ne dira staging, migracije, Edge deploy, naplatu ni grane na kojima već netko aktivno piše (T18→T23 lanac).

## Aktivni ugovor

1. Postojeći program do livea ostaje u `docs/agents/tasks.json` i `docs/agents/plan-do-live-2026-09-12.md`.
2. Ovaj dokument je **dopuna**, ne treći sustav statusa produkta.
3. Orkestrator predlaže i radi higijenu/review; merge/deploy samo uz eksplicitni OK vlasnika (ili već dani standing order).

## Track A — Higijena plana

| Stavka | Status | Bilješka |
|---|---|---|
| T19 → `done` nakon PR #89 | u ovom PR-u | merge `701e122c` |
| Bilješka u AUDIT_MASTER / statusu za T19 rez 1 | pending | jedan red, bez dupliciranja cijelog plana |
| Nakon svakog bitnog mergea: sync `tasks.json` | standing | orkestrator |

## Track B — Vrt open PR-ova

Prioritet (ne P0 lanac):

| PR | Namjera | Status |
|---|---|---|
| #95 Dizajn-sustav (Z1–Z7) | review → merge ili lista blockerа | triage |
| #93 Autonomni kontroler | review; ne blokira live | triage |
| #88 / #40–#42 Dependabot | T41-adjacent; siguran bump | triage |
| #85, #59, stari draftovi | close ili rebase | kasnije |

## Track C — Drift radar

Ponavljajuće, samo report (bez deploya):

- javni `/build-info.json` vs `origin/master` SHA
- `RELEASE_PROOF` fresh/stale/unknown
- Edge „repo vs deployed“ za kritične funkcije (kad ima pristup)
- gitleaks fingerprint drift na PR granama

## Track D — Slijepe točke (nema T-paketa)

1. **Koordinacija sesija** — tko drži koju granu / worktree (AGENTS.md zahtijeva, nema boarda).
2. **Lekta ↔ Katedra ustav kao gard** — zabranjeni smjer istine / sadržaj u Lekti.
3. **Iskrenost copyja** — lokalna analiza vs backend claimovi.
4. **WordReplica / Academic IR ugovor** — dodirne točke, ne novi proizvod.
5. **Portfolio sync** — Maturiraj, katedra-pkg, pisac-editor (izvan T16–T47).
6. **Proizvodne SKU odluke** — T23 mapira; orkestrator bilježi nelogičnosti za vlasnika.
7. **„Što Lekta nije“** — acceptance za ograničenja proizvoda.

## Track E — Namjerno ne

Novi framework, novi agent sustav, pisanje sadržaja, 407 fakulteta, konkuriranje T18/T20/T21 sesijama.

## Ritam

- **Dnevno (rutina):** portfolio digest + GitHub alarmi.
- **Tjedno:** 1–2 PR triage; gap memo ako ima novo što T-plan ne vidi.
- **Nakon mergea:** sync ovog dokumenta + `tasks.json` gdje treba.

## Stanje 2026-09-20

- Spojeno: katedra-pkg #51 (Lite 2.0), Lekta #89 (T19 rez 1).
- T18+ rade **druge sesije** — orkestrator ne ulazi bez OK.
- Maturiraj #4 otvoren (billing RLS) — nije P0; čeka.

## Track F: dizajn-paket (design/handoff/ALIGNMENT.md), pitanja gdje nalog i kod proturjece

Pravilo vlasnika 2026-09-22: kad nalog i kod proturjece, kod se ne mijenja nego se pitanje zapisuje ovdje.
Grana: `design/pack3` (iz mastera 4c9b1400). Zapisuje orkestrator dizajn-paketa.

| # | Zadatak | Nalog kaze | Kod kaze | Sto je napravljeno | Pitanje za vlasnika |
|---|---|---|---|---|---|
| F1 | Z1 | "Nepoceto: Z1" (Stanje nakon synca) | `route-shell.css` na masteru vec zadovoljava provjeru iz Z1 (nula hex literala osim komentara, nema Georgia ni ui-monospace, nema tvrde offset sjene); PR #95, commit c51c8fee | Nista; Z1 tretiran kao gotov | Treba li Sync ponovo procitati route-shell.css, ili nalog pod Z1 misli na nesto drugo? |
| F2 | Z24 naspram Z11 | Jedna cijena: popravak 9,99 EUR po dokumentu, `slots_total 1`, `slot_window_days 7`; institucija na upit; migracija `products` | `src/report/pricing.ts` (izvor koji Z11 ucvrscuje) nosi cijene PO VRSTI RADA: seminarski 3,99 / zavrsni 5,99 / diplomski 9,99 / doktorski 24,99 EUR, prozor 7 ili 14 dana; racun na stolu (Z11) crta cijenu po vrsti rada; `packages.json` je Z11 vec obrisao | Z11 prenesen na pack3 bez izmjene; Z24 NE zapocet | ODGOVORENO (vlasnik, 2026-09-22): cijena PO VRSTI RADA, ne jedna: seminarski 4,99 / zavrsni 9,99 / diplomski 14,99 / SPECIJALISTICKI 19,99 / doktorski 24,99 EUR. Posljedice za Z24: (a) `pricing.ts` WORK_TYPE_TIERS dobiva nove iznose i PETU vrstu `specijalisticki` (tip `ReportWorkType`, `slotProductForWorkType`, katalog, testovi); (b) tablica `products` u Supabaseu (izvor zive cijene na naplati) mora nositi iste iznose i novi slot proizvod za specijalisticki: migracija s prefiksom od 0200 kroz `supabase db push`, ili `set_product_price` za postojece; (c) dizajn (Pricing.dc.html "9,99 po dokumentu") i Stanje nakon synca su time zastarjeli, prijaviti pri Syncu. windowDays za specijalisticki: 14 (vlasnik, 2026-09-22), isto kao diplomski i doktorski. |
| F3 | Z8 pager | "Nalaz 1 od 6" doslovno iz predloska | `tests/desk-mount.test.ts` i `tests/desk-view.test.ts` prikivali "N / M" | ODLUCENO (orkestrator): natpis promijenjen na "od", dva testa PRIKAZA prilagodjena; modeli netaknuti | Potvrda da je to bio ispravan smjer (testovi su mjerili prikaz, ne model) |
| F4 | Z6 | Panel nudi gustocu i velicinu teksta | Gustoca nema tokene (Z4 odbijen mjerenjem, 25 %); velicina teksta jedva djeluje jer je 436 px naspram 17 rem deklaracija u page-app.css | Obje kontrole izostavljene/uklonjene, zabiljezeno u PR #95 | Migracija px -> rem u page-app.css kao zaseban zadatak, ili kontrole ostaju vani? |
| F5 | bisect-higijena | - | Commit `1848ca91` je crven kad se izolirano provjeri (nosi testove koji trazе `findingId` prije nego ga popravak stvarno doda) | Popravak stize tek u `95a12405`; rebase je zabranjen, pa `1848ca91` ostaje crven u izolaciji zauvijek | Nema pitanja; zabiljesceno da se povijest NE prepisuje zbog ovoga (bisect na ovoj grani mora preskociti 1848ca91) |
| F6 | Z15 podnozje | Pravni minimum nosi poveznicu "Sve pravno →" | Stranica koja nabraja SVE pravne dokumente ne postoji: `scripts/generate-legal-pages.mjs` pise osam samostalnih stranica, a popis svih stoji u PODNOZJU svake od njih, bez vlastite rute | ODLUKA PROVEDENA 2026-09-23: "Sve pravno →" vodi na `/privatnost.html` na svih 13 stranica, uz HTML komentar koji najavljuje Z20 `/pravno/` indeks. Gard `tests/site-chrome.test.ts` tvrdi da je odrediste medju slugovima koje `legalDocuments()` daje a `scripts/generate-legal-pages.mjs` pece, dakle da stranica STVARNO postoji; prije je vodilo na `/uvjeti-koristenja.html` | ODLUCENO (vlasnik delegirao orkestratoru, 2026-09-23): (a) do Z20 "Sve pravno" vodi na /privatnost.html; Z20 uvodi /pravno/ indeks. (bilo: Treba li `/pravno/` indeks kao vlastita generirana stranica (Z20 "Pravne stranice kao svezak"), ili poveznica ostaje na jedan od dokumenata?) |
| F7 | Z15 pisma, opcija (b) | Geist Mono -> `var(--mono)` na rutama koje mono ucitavaju (/rad/, alati), inace `var(--ui)` 11 do 11.5px | `site-chrome.css` je JEDAN list za SVE rute, a ulaz `/` mono namjerno ne ucitava (`tests/entry-fonts.test.ts`: tocno dva glasa). Uvjetovanje obitelji atributom bi bilo zeleno samo zato sto gard ne vidi klase koje JS dodaje, dakle zeleno iz slijepe tocke | Cijela traka koristi `var(--ui)` uz mjeru 11 do 11.5px i razmak slova, na SVIM rutama; mono varijanta nije uvedena | ODLUCENO 2026-09-23: (a) jedan glas u traci (Inter Tight) na svim rutama; mono ostaje za oznake u tijelu na /rad/ i alatima. (bilo: Je li jedan glas u traci prihvatljiv, ili traka na mono rutama treba drugi list (npr. `site-chrome-mono.css` koji uvoze samo te rute)?) |
| F8 | Z15 plocica profila | Mjedena plocica nosi "FPZG · Dipl." | Kratica ustanove i razine dolazi iz registra profila (194 KB, lazy chunk); traka se ucitava na svakoj stranici, a `lekta.preferences.v2` nosi samo `unit` id i `workType`, bez kratica | ODLUKA PROVEDENA 2026-09-23: `scripts/gen-site-stats.mts` pece `units` (unitId -> kratica) i `workTypes` (pohranjeni id -> kratica razine) u `data/coverage/site-stats.json`; plocica cita ISTI staticki uvoz tog JSON-a kojim ga cita `site-stats-strip.ts` i `lekta.preferences.v2` (`unit`, `workType`), pa na `/` i svugdje drugdje pise "FPZG · Dipl.". Bez preferenci, uz nepoznat unit i uz pokvaren zapis daje "Odaberi profil" i NE baca. Kratica je deterministicki IZVEDENA iz `unitId`-a (registar i katalog polje s kraticom ne nose, provjereno), pravilo je u `src/coverage/site-stats.ts`, a gard reproducira svaku pecenu kraticu istim pravilom. Klik ostaje `aria-disabled` i "Uskoro" do Z13. Dvije razlike prema nalogu su zapisane kao F15 i F16 | ODLUCENO 2026-09-23: (a) pecen indeks unit -> kratica (ustanova, razina) u data/coverage/site-stats.json; plocica cita iz njega. (bilo: Treba li lagan izvor kratica (npr. pecen `unit -> kratica` indeks u `site-stats.json`), ili plocica ostaje bez imena profila do Z13?) |
| F9 | Z15 montaza | "i u generatorima (generate-coverage-page, generate-legal-pages, generate-citation-tools, generate-title-page-tools, generate-faculty-pages, generate-competitor-pages)" | Te skripte pisu SAMOSTALNE stranice: vlastiti inline `<style>` ili zaseban `.css`, bez Vite bundlea, pa ne mogu uvesti `site-chrome.ts` ni `site-chrome.css`. Emitiraju `<header class="lekta-brand">` (brend redak), ne navigaciju s cetiri odredista; `generate-competitor-pages` i `generate-title-page-tools` ne emitiraju nikakvo zaglavlje | Generatori NISU dirani; traka je montirana na 13 statickih stranica koje bundle nose | ODLUCENO 2026-09-23: (b) generirane stranice ostaju na brend retku dok se ne presele na bundle; bez server-side kopije markupa. (bilo: Smiju li generirane stranice dobiti server-side ispisanu traku iz istog predloska (dvostruko odrzavanje markupa), ili ostaju na brend retku ) |
| F10 | Z15 mobilni list | Podnozje lista nosi "Aa · Prikaz" | Panel "Prilagodi prikaz" (Z6) zivi SAMO na `/` i `/rad/`, a dva elementa s `id="displayBtn"` su nevaljan HTML | U listu stoji POSREDNIK (`data-site-chrome-display-proxy`) koji proslijedi klik na `#displayBtn`; na stranicama bez panela se pri montazi ukloni | ODLUCENO 2026-09-23: (a) panel "Prilagodi prikaz" (Z6) montira se na SVE rute kroz ui-boot; #displayBtn jedinstven, mobilni list zove isti panel. (bilo: Treba li panel Z6 doci na sve rute (tada posrednik postaje obican gumb), ili kontrola ostaje samo na dvije rute?) |
| F11 | Z15 naspram Z16 na mobitelu | Z15: mobilna traka je "logo, lampa, hamburger" | Z16 (mobilni prolaz) za `/rad/` izricito kaze "stepper na /rad/ prelama u dva reda", dakle sredina OSTAJE; dva Playwright garda (`workspace-entry`, `workspace-viewports`) na 390 px mjere `#radDocBar` kao vidljiv i znacku "Lokalno" kao skrivenu | Sredina na `/rad/` pada u DRUGI RED mreze, a prvi red je logo + lampa + hamburger; znacka i ocjena odlaze na 720px, kako je bilo i prije Z15. ISPRAVAK 2026-09-23 (krug popravka): prva izvedba je tvrdila isto, ali je auto-placement davao TRI reda (lampa i hamburger ISPOD trake dokumenta) i zaglavlje od 177 px na 390 px. Redovi su sad izricito postavljeni (`grid-area`), tanko stanje na mobitelu ne dodaje 16 px, a natpisi koraka se vizualno skrivaju: izmjereno u Chromiumu 113 px (uz gumb nove verzije), 110 px nakon skrola, 88 px bez tog gumba. Proracun 124 px mjeri `tests/ux/workspace-viewports.spec.ts` | ODLUCENO 2026-09-23: (a) "logo, lampa, hamburger" vrijedi za marketinske rute; /rad/ na mobitelu zadrzava identitet dokumenta u sredini. (bilo: Vrijedi li pravilo "logo, lampa, hamburger" samo za marketinsku traku (kako je izvedeno), ili i radna povrsina na mobitelu treba izgubiti id) |
| F12 | Z15 sredina na `/rad/`, desktop | "Na `/rad/` sredina nosi ime dokumenta + ocjenu + stepper" (jedan red trake) | Pilula dokumenta nosi i znacku "Lokalno na ovom uredaju" (odluka prije Z15, gard `tests/ux/workspace-entry.spec.ts:131` je na sirokom zaslonu mjeri kao VIDLJIVU), a stepper s natpisima je 330 px. Sredini u mrezi `auto minmax(0,1fr) auto` na 1180 px ostaje 335 px, pa dokument i stepper ne stanu u isti red | ISPRAVAK 2026-09-23 (krug popravka): uzrok nije bila sirina steppera nego mrtav blok u `page-app.css` (`.nav-rad .local-badge`) koji je ostao mrtav nakon sto je traku preuzeo `site-chrome.ts`. S njim je otisao zbijeni oblik znacke (5px/10px padding, 11px natpis); znacka je bez njega padala na osnovni `.local-badge` iz `page-chrome.css` (13px kurziv, padding 8px 13px), koji je siri i visi. Zbijeno pravilo je preseljeno u `site-chrome.css` pod `.site-chrome__doc .local-badge`; strukturna tvrdnja u `tests/site-chrome.test.ts` cuva da `.site-chrome__mid` nema `flex-wrap: wrap` bez zbijene znacke. Vizualnu visinu na 1180 px (jedan red naspram dosadasnja dva) jos treba potvrditi u pravom pregledniku, izvan happy-dom gatea | ODLUCENO 2026-09-23: otpada; uzrok je bio mrtav .nav-rad blok koji je odnio zbijeno pravilo znacke (popravljeno u ebcfe771). (bilo: Potvrditi vizualno (Playwright/rucno) da je zaglavlje `/rad/` na 1180 px sada jedan red; ako i dalje nije, F12 ostaje otvoren s pitanjem o z) |
| F13 | Z16 stepper na mobitelu | Z16: "stepper na /rad/ prelama u dva reda" | Dva reda pilula na 390 px dizu zaglavlje preko proracuna (mjereno 177 px), a Z16 je NEPOCET zadatak | Na mobitelu su natpisi koraka vizualno skriveni (`clip-path`, ostaju u pristupacnom imenu), pa stepper stoji u JEDNOM redu uz ime dokumenta; gard `tests/site-chrome.test.ts` cuva da natpis ne ode i iz pristupacnog drveta | ODLUCENO 2026-09-23: (a) na < 820px koraci bez natpisa ("01 02 03 04", natpis u aria-label) do Z16; Z16 odlucuje konacno mjesto. (bilo: Je li "01 02 03 04" bez natpisa prihvatljiv mobilni stepper do Z16, ili Z16 treba odluciti drugo mjesto za korake na uskom zaslonu?) |
| F14 | Z15 pecat "Provjeri rad" na `/` | Desna skupina trake nosi pecat "Provjeri rad" svugdje osim na `/rad/` (korisnik ondje vec provjerava rad) | Implementator je pecat izostavio i na `/`, jer bi ondje vodio na istu stranicu (ulaz jest provjera), i ucvrstio to testom (`tests/site-chrome.test.ts`: "Ulaz `/` je isti slucaj: pecat bi vodio na sam sebe, a ekran ima jednu radnju (papir)"), ali odluka nije bila zapisana ovdje prije ovog retka. Pravilo vlasnika: kod se ne mijenja mimo naloga bez zapisa | Odluka orkestratora (krug popravka 2026-09-23): izostavljanje na `/` je razumno (poveznica na samu sebe ne bi bila radnja), kod NIJE mijenjan, samo zabiljezeno ovdje | Je li izostavljanje pecata na `/` ispravno citanje naloga, ili `/` ipak treba pecat (npr. kao potvrda odabranog papira, ne kao navigacija)? |
| F15 | F8 kljucevi razina rada | Indeks razina je u nalogu imenovan hrvatskim kljucevima: `workTypes: { diplomski: 'Dipl.', zavrsni: 'Zavr.', seminarski: 'Sem.', specijalisticki: 'Spec.', doktorski: 'Dokt.' }` | `lekta.preferences.v2.workType` cuva vrijednosti `<select id="workType">`, dakle `seminar`, `final`, `graduate`, `specialist`, `doctoral` (tip `WorkType`, `src/ui/work-selection.ts`); `src/report/pricing.ts` zasebno koristi hrvatska imena (`ReportWorkType`) za NAPLATU, i to su dva razlicita rjecnika u istom proizvodu | Pecen je indeks s POHRANJENIM kljucevima i kraticama doslovno iz naloga (`seminar: Sem.`, `final: Zavr.`, `graduate: Dipl.`, `specialist: Spec.`, `doctoral: Dokt.`). S hrvatskim kljucevima plocica se ne bi NIKAD poklopila s pohranom, pa bi uvijek pisala "Odaberi profil": zeleno u gardu, mrtvo na ekranu. Tip je `Partial<Record<WorkType, string>>`, pa preimenovan identifikator pada u TypeScriptu | Treba li proizvod ujediniti rjecnik vrsta rada (jedan set identifikatora za pohranu, naplatu i profile), ili dva rjecnika ostaju uz izricito mjesto prevodjenja? |
| F16 | F8 `naziv` u pecenom indeksu | Nalog trazi `units: { <unitId>: { kratica, naziv } }` | Naziv jedinice VEC ima izvor (`data/catalog/zagreb-catalog.json`, polje `name`), pa bi pecen duplikat bio DRUGI izvor iste tvrdnje; uz to `src/shared/site-chrome.ts` taj JSON uvozi na svakoj stranici, a `tests/route-shell-budget.test.ts` mjeri granicu od 8 KB gzip: izmjereno 2026-09-23, indeks S nazivima digao je traku na 7842 B (350 B od granice), a BEZ njih na 6505 B. Naziv pritom nema potrosaca: plocica pise kraticu, a `title` ostaje "Uskoro" do Z13 | Pecen je samo `kratica`; `SiteStatsUnit` je objekt (ne gol string) pa Z13 smije dodati polja bez promjene oblika. Obrazlozenje i izmjerene brojke stoje u `src/coverage/site-stats.ts` | Kad Z13 zatreba naziv, uzima ga iz kataloga na ruti koja katalog vec ucitava, ili se ipak pece u indeks uz dizanje proracuna trake? |
