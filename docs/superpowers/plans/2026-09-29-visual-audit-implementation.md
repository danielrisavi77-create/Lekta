# Lekta — plan implementacije vizualnog audita

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Jedan implementator; bez automatskog delegiranja ili pozivanja drugih modela.

**Goal:** Otkloniti svih devet nalaza F01–F09 uz dokaz stvarnog ponašanja i usporedive snimke prije/poslije.

**Architecture:** Zadržati postojeći vizualni identitet i arhitekturu Vite/TypeScript aplikacije. Stanje koraka izvoditi kroz postojeći `renderView`, popraviti uvjete prikaza uspjeha u UI adapterima alata, a odgođeno montiranje dokumenta voditi u `mountDesk`. Bez novog simulatora, design systema ili promjene akademskih pravila.

**Tech Stack:** TypeScript, postojeći CSS/HTML, Vitest + happy-dom, Playwright, axe-core, lokalne sintetičke DOCX fixture datoteke.

**Spec:** `docs/AUDIT_MASTER.md`, odjeljak 18; detaljni lokalni dokaz: `output/playwright/visual-audit-2026-09-29/report.html`, `findings.json` i `manifest.json`. Lokalni output je ignoriran u Gitu: prije prijenosa zadatka na drugi stroj prenijeti i paket dokaza.

**Base / provjereni HEAD:** `07ae8dd502900c4dd3741211012bb022929c3587`.

**Radno stablo:** `C:\Users\PC\.codex\worktrees\lekta-visual-audit-2026-09-29\Lekta`, grana `codex/visual-audit-2026-09-29`. U trenutku planiranja postoji dokumentacijska izmjena audita; aplikacijski kod nije promijenjen. Ako se base promijeni prije izvedbe, prvo revalidirati nalaze i prilagoditi lokacije.

## Global Constraints

- Plan je odobren i provodi se u ovoj grani. Statusi i svježi dokazi su u `docs/AUDIT_MASTER.md`, odjeljak 18.4; samo plan nije dokaz prolaza.
- Jedan pisac u izoliranom worktreeu. Sačuvati postojeći audit i tuđi WIP; bez automatskog commita, pusha, mergea ili deploya.
- Zadržati tipografiju, papir, crveni naglasak i hrvatski jezik. Ne preuređivati cijelu aplikaciju.
- Ne mijenjati parser, akademska pravila, rezultate analize, repair eligibility, cijene, backend ni obvezni pristanak radi vizualnog popravka.
- Koristiti sintetičke podatke. Browser dokaz ne smije slati dokument na serverski repair ili pokretati kupnju.
- Postojeće ovisnosti su dovoljne. Nove biblioteke nisu planirane; Deno i preglednici provjeravaju se prije gatea, a nedostajuće nužne komponente instaliraju iz službenih izvora.
- Teški poslovi idu kroz `scripts/with-gate-lock.mjs`, jedan istodobno; npm skripte koje već imaju omotač ne omatati dvaput.
- Prema `docs/agents/ROUTING.md:206`, lokalni Playwright traži dodjelu koordinatora; inače ga izvesti na odobrenoj radnoj stanici/CI-ju. Bez gašenja tuđih procesa ili zaobilaženja locka.
- `npm run check` obvezan je prije tvrdnje da su promjene gotove; prije eventualnog commita vrijede i orphan-scan te projektni zahtjev pregleda drugog providera. Drugi provider traži odgovarajuću autorizaciju; ne pozivati ga automatski.

## Review Focus

1. Promjena profila i povratak u spremljenu sesiju: bez tihe potvrde novog profila ili gubitka odabira; testovi T2.
2. Sporo učitavanje fakultetskog stila/predloška: konačni status odgovara posljednjem unosu, ne zastarjelom async rezultatu; testovi T3.
3. Skriven pregled dokumenta, brza promjena širine i dispose prije završetka importa: bez dvostrukog mounta ili naknadnog pisanja u odbačeni DOM; testovi T5.
4. Dugi hrvatski tekstovi i povećanje prikaza na 200%: radnje i datum ostaju dostupni tipkovnici i čitljivi; provjere T4/T6/T7.
5. Nula izvedivih zahvata i povratak iz repaira: nema obećanja izvršenja, skrivenog slanja ili izgubljenog fokusa; testovi T1/T2/T7.

## Redoslijed i granice cjeline

| Korak | Nalazi | Isporuka | Ovisnost |
| --- | --- | --- | --- |
| T1 | F01 | Točan naziv i objašnjenje ulaza u popravak | Nema |
| T2 | F06, F07 | Usklađeni koraci i jedna primarna radnja analize | Nakon T1 zbog istog toka i datoteke app.ts |
| T3 | F04 | Prazno / nacrt / popunjeno stanje alata | Neovisno o T1–T2 |
| T4 | F02, F03 | Mobilni CTA i čitljiv datum | Nakon T3 za stabilne snimke stanja alata |
| T5 | F05 | Oporavak prikaza dokumenta nakon širenja | Nakon T1–T2 radi zajedničkog cockpit modula |
| T6 | F08, F09 | Jasan preduvjet roka i kompaktne postavke | Neovisno o T5 |
| T7 | Svi | Regresija, snimke, pristupačnost i završni gate | Nakon T1–T6 |

Ovo su tri povezane radne cjeline unutar jednog plana: tok analize/popravka (T1/T2/T5), alati (T3/T4) i ulaz/postavke (T6). Mogu se zasebno pregledati, ali izvode se serijski. Ne stvarati nove apstrakcije između cjelina.

## T0 — priprema izvedbe

- [x] Potvrditi HEAD, status, granu, projektne upute i prisutnost svih auditu pripadajućih snimki. Sačuvati izvorni manifest; ne prepisivati snimke „prije”.
- [x] Provjeriti Node, Deno, dostupnost postojećih npm ovisnosti, slobodan RAM/disk, gate lock i termin za pregledničke provjere. Ako uvjet nedostaje, označiti ga kao blokadu dokaza, ne kao prolaz.
- [x] Pregledati `docs/UX_PRINCIPLES.md` za zahvate toka. Za T3 ostati u UI adapterima; ako je stvarno nužna promjena `src/citations` ili repair domene, prvo učitati domenske upute i izdvojiti proširenje opsega.

## T1 — pošten ulaz u popravak (F01)

**Datoteke:** `src/ui/results/results-cockpit.ts`, `src/ui/app.ts`; testovi `tests/results-cockpit-dom.test.ts`, `tests/ux/repair-cta-opens-panel.spec.ts`. Lokacije postojećih sažetaka pronaći kroz proizvođača `model.signals.automaticFixes`; ne mijenjati njegovu vrijednost radi usklađivanja natpisa.

**Sučelje:** Zadržati `ResultsCockpitAction`, `isGeneralRepairEntry` i postojeću predaju `findingId`/`ruleIds`. Interni `simulate-repair` ostaje kompatibilan događaj; ne radi se novo simulacijsko izvršenje.

- [x] Dodati regresiju za nula automatskih zahvata: primarni gumb glasi **„Pregledaj mogućnosti popravka”**, otvara pregled/panel i ne pokreće repair. Test mora pasti na starom natpisu/ponašanju. Zadržati postojeći slučaj s dostupnim zahvatom i metu izvan prva tri nalaza.
- [x] Pokrenuti ciljani Vitest i zabilježiti očekivani pad prije izmjene.
- [x] Promijeniti korisnički natpis i objašnjenje. Uz nulu koristiti **„Nema potvrđenih automatskih popravaka. Pregledaj dostupne mogućnosti.”**; ne tvrditi da je 5/12 ista jedinica kao broj automatskih nalaza.
- [x] Pratiti porijeklo broja 0 i odabira 5/12 te oznaka AUTO. Svaki vidljivi brojač mora imenovati što broji: nalaze, ponuđene zahvate ili odabrane stavke. Ako se otkrije pogreška eligibility/logike, zabilježiti zaseban funkcionalni nalaz; ne prikrivati je tekstom i ne označiti taj dio F01 riješenim.
- [x] Ponoviti test; u pregledniku kliknuti ulaz, potvrditi odredište, sačuvan odabir, neoznačen pristanak i izostanak repair zahtjeva. Sačuvati usporedbu sa snimkom 13.

**Prihvat:** korisniku se ne obećava simulacija koja ne postoji; ulaz, brojke i odredište imaju jasno značenje; klik sam ne šalje dokument.

## T2 — dosljedan tok i primarna radnja (F06, F07)

**Datoteke:** `src/ui/wizard-view.ts`, `src/ui/results/results-cockpit.ts`, `src/routes/workspace/main.ts`, `src/ui/profile-card.ts`, `src/ui/app.ts`, `rad/index.html`; testovi `tests/wizard-view-single-writer.test.ts`, `tests/repair-phase.test.ts`, `tests/profile-card-sample-summary.test.ts`, `tests/ux/workspace-entry.spec.ts`.

**Sučelje:** `renderView(stanje: WizardState, doc: Document = document): void` postaje i jedino mjesto postavljanja gornjeg pokazivača za stanja wizard toka. Koristiti postojeći `setSiteChromeStage(doc, stage)`; bez novog paralelnog state storea.

| WizardState | Gornji SiteChromeStage |
| --- | --- |
| dokument, profil, provjera, analiza | scanning — postojeći prikaz bez aktivnih rezultatskih koraka |
| rezultat | findings |
| popravak | plan |

- [x] Dodati test niza dokument → profil → analiza → rezultat → popravak → rezultat → dokument: gornji i glavni pokazivač ne smiju proturječiti, a nakon povratka na dokument nema zastarjelog „Nalazi”. Nedopušten prijelaz ne mijenja DOM. Dokazati pad prije popravka.
- [x] Uvezati mapiranje u `renderView` i ukloniti konkurentna postavljanja `scanning/findings` iz workspace/cockpit mjesta. Sačuvati score, globalnu navigaciju i postojeći fokus pri ulasku/izlasku iz popravka. Ovo ne uvodi dokaz plaćanja ni stanje „gotovo”.
- [x] Kao jedinu primarnu kontrolu analize zadržati `#analyzeBtn`, zbog postojećeg disabled/cancel/focus životnog ciklusa. Iz profilne kartice ukloniti zasebni `data-confirm-profile` gumb; **„Promijeni profil”** ostaje sekundarna radnja uz vidljivo upozorenje nesigurne detekcije.
- [x] Za nepotvrđen profil `#analyzeBtn` prikazuje **„Potvrdi profil i analiziraj”**; njegov izričit klik potvrđuje prikazani profil i poziva postojeći `runAnalysis`. Za potvrđen profil glasi **„Analiziraj dokument”**. Ne potvrđivati profil tijekom rendera. Ostaviti postojeće zabrane nevaljanog/sumnjivog dokumenta, busy stanje i otkazivanje.
- [x] Dodati testove za predloženi, potvrđeni, promijenjeni i vraćeni profil: jedna primarna radnja; potvrda se odnosi na aktualni profil; ponovljeni klik ne pokreće duplu analizu; docgate i dalje traži svoju potvrdu. Preusmjeriti postojeće test pomoćnike koji ciljaju uklonjeni gumb, bez slabljenja assertiona.
- [x] Pokrenuti ciljane testove te provjeriti Tab/Enter, povrat fokusa i isti tok na mobitelu. Usporediti snimke 13 i 30.

**Prihvat:** jedno stvarno stanje upravlja pokazivačima; korisnik ne bira između dvije konkurentne potvrde/analize.

## T3 — jasno prazno, nacrt i popunjeno stanje (F04)

**Datoteke:** `src/tools/citat-page.ts`, `src/tools/naslovnica-page.ts`, `citat.html`, `naslovnica.html`; testovi `tests/citat-page.dom.test.ts`, `tests/naslovnica-page.dom.test.ts`.

**Sučelje:** Zadržati postojeće formatere, `readInp()`, `formatWithCurrent(...)`, `readInput()` i `buildTitlePage(...)`. Stanje je lokalna UI odluka iz stvarnog unosa i postojećeg `missing` popisa; ne uvoditi novi registar fakultetskih zahtjeva.

- [x] Dodati padajuće DOM testove: prazno i whitespace-only u FPZG citatu ne prikazuje uspjeh ni kopirljiv rezultat sastavljen samo od interpunkcije; naslovnica s naslijeđenom ustanovom bez autora/naslova ne prikazuje uspjeh.
- [x] Citat: prazno znači da nema sadržajnog unosa u primjenjivim bibliografskim poljima; odabrani stil/vrsta izvora ne računaju se kao sadržaj. Prikazati postojeću uputu, isključiti copy/add i sakriti success CTA. Djelomični stvarni unos ostaje kopirljiv nacrt uz **„Nacrt citata — provjeri podatke.”** i postojeći popis nedostataka.
- [x] Citat označiti popunjenim tek kada postoji sadržajni izlaz i `missing.length === 0`. Natpis **„Unesena su sva preporučena polja.”** ne smije obećavati provjeru izvora ili akademske točnosti. Fakultetski formatter ostaje neizmijenjen.
- [x] Naslovnicu bez autora/naslova označiti **„Prikaz predloška”**; djelomični unos **„Nacrt naslovnice”**. Spremnost prikazati samo uz nepraznog autora i naslov te `model.missing.length === 0`. Zadržati korisni prikaz predloška; dostupni izvoz nepotpunog sadržaja imenovati **„Kopiraj nacrt” / „Preuzmi nacrt”**, bez zelenog uspjeha.
- [x] Dodati testove djelomičnog i potpunog unosa, brisanja prethodno popunjenog unosa te promjene fakulteta tijekom odgođenog učitavanja. Završni DOM mora odgovarati posljednjem unosu; postojeća zaštita izvoza dok se predložak učitava ostaje.
- [x] Pokrenuti oba DOM testa te pregledati prazno/nacrt/popunjeno stanje na desktopu i mobitelu. Usporediti snimke 15 i 18.

**Prihvat:** generički redak ili interpunkcija nisu uspjeh; nacrt ostaje koristan bez lažne oznake provjerenosti.

## T4 — mobilni CTA i datum (F02, F03)

**Datoteke:** `src/shared/tool-page.css`, `izjava.html`; regresija u novom `tests/ux/free-tools-responsive.spec.ts`, uz postojeće pomoćnike `tests/ux/free-tools-pages.ts`.

**Sučelje:** Zadržati `.success-cta` i postojeće identifikatore polja. Dodati lokalnu CSS klasu retku mjesta/datuma, da promjena ne razbije ostale `.row2` mreže.

- [x] Dodati pregledničku regresiju s ugrađenim primjerima za brojač, citat, literaturu i naslovnicu na 320/375/390 px. Za `.success-cta a` zahtijevati `left >= 0`, `right <= innerWidth + 1` i odsutnost vlastitog odrezanog teksta; dokazati pad na starom CSS-u. Ne oslanjati se samo na body scrollWidth.
- [x] U zajedničkom CTA-u omogućiti normalno prelamanje, `min-width:0` i `overflow-wrap:anywhere` po potrebi. Dopustiti flex djeci da se skupe/prelome; ne skrivati sadržaj s `overflow:hidden` kao rješenje.
- [x] Za izjavu dodati scenarij unosa mjesta **„Slavonski Brod”** i datuma **„29. 9. 2026.”**. Na širini do 600 px mjesto i datum slagati u jedan stupac; unutarnji birač datuma i tekstualni datum također okomito, s kontrolama širine 100% i bez intrinsic overflowa.
- [x] Provjeriti da je tekstualno polje datuma široko najmanje 180 CSS px na 320/375/390 px te da su vrijednosti čitljive, bez prekrivanja i promjene sinkronizacije native/text datuma. Dodati i kontrolu na 768/1440 px.
- [x] Pokrenuti novi spec u Chromium/mobile-Chromium okruženju te ručno pregledati obje teme i 200% zoom. Sačuvati snimke cijelog relevantnog rezultata; usporediti 08, 16–19, 22, 23 i 25.

**Prihvat:** sve četiri CTA poveznice vidljive su u cijelosti; polja izjave imaju uporabivu širinu i rade tipkovnicom.

## T5 — prikaz dokumenta nakon promjene širine (F05)

**Datoteke:** `src/ui/results/desk-mount.ts`, `src/ui/results/desk-view.ts`, `src/ui/results/results-cockpit.ts`; testovi `tests/desk-mount.test.ts`, `tests/ux/workspace-viewports.spec.ts`.

**Sučelje:** Zadržati `mountDesk(section: HTMLElement, o: DeskMountOptions): DeskHandle` i `mountDocument(host, signal): Promise<DeskDocument | null>` (interni AbortSignal dodan nakon lifecycle pregleda). `DeskHandle.dispose()` mora zaustaviti promatranje veličine i spriječiti kasnije DOM upise.

- [x] Dodati padajuće testove: skriven host ne zove renderer; nakon promjene širine iz 0 u pozitivnu montira se jednom; više obavijesti tijekom importa ne pokreće nove instance; dispose prije resolvea ne veže događaje niti mijenja DOM.
- [x] Premjestiti odluku o odgođenom mountu iz cockpit callbacka u `mountDesk`. Koristiti `ResizeObserver` hosta; stanje lokalno razlikuje waiting/loading/ready/error. Kada je host vidljiv, započeti najviše jedan mount; nakon uspjeha prekinuti promatranje. Bez petlje ili intervala ponovnih pokušaja.
- [x] Null/rejection pri stvarno vidljivom hostu prikazati kao **„Prikaz dokumenta nije dostupan. Pokušaj ponovno.”** s lokalnim retry gumbom. Retry ponavlja samo prikaz dokumenta, ne analizu, ne naplatu i ne server repair. Nalazi moraju ostati dostupni. Dodati test uspješnog retrya i čišćenja listenera pri disposeu.
- [x] Dodati browser scenarij: analiza sintetičkog dokumenta na 375 px → 1440 px bez reload → 375 → 1440. Stvarna stranica dokumenta mora biti vidljiva, poruka pripreme nestati, aktivni nalaz i broj renderiranih instanci ostati stabilni. Zadržati kontrolu izravne desktop analize.
- [x] Pokrenuti ciljane testove i snimiti mobilno-početno, desktop-nakon-resize i izravno-desktop stanje. Usporediti 12/14 s 24.

**Prihvat:** skriven pregled se lijeno učita kada postane vidljiv; pogreška ima oporavak; nema dvostrukog montiranja ili rada nakon disposea.

## T6 — preduvjet roka i postavke (F08, F09)

**Datoteke:** `index.html`, `src/routes/intake/intake.css`, `src/shared/display-settings.css`; po potrebi samo DOM povezivanje postojećih kontrola u `src/routes/intake/intake-live.ts`. Postojeće provjere: `tests/intake-layout.test.ts`, `tests/intake-live.test.ts`, `tests/display-settings.test.ts`, `tests/ux/intake-entry.spec.ts`.

**Sučelje:** Postojeći ID-evi roka, događaji i `onBlocked()` ostaju; nema dupliciranih inputa ni dva izvora vrijednosti roka.

- [x] Na mobilnom rasporedu smjestiti blok roka/nepoznatog roka neposredno prije upload radnje; zadržati smislen DOM i Tab redoslijed. Ne premještati cijeli ostali pribor iznad uploada ako je za preduvjet potreban samo rok. Prilagoditi postojeće layout assertione ako kodiraju stari redoslijed.
- [x] Ručno provjeriti prvi i povratnički ulaz na 375 × 667 px: rok ili „Još ne znam rok” dolazi prije radnje koja o njemu ovisi. Klik na blokirani upload i dalje fokusira rok; spremljeni izbor se vraća. Nije zahtjev da cijeli uvod uvijek stane u prvi ekran.
- [x] Segmentima osvjetljenja zamijeniti prored 38 px normalnim proredom približno 1,25; ciljnu visinu održati s najmanje 44 px i paddingom. Na uskoj širini dozvoliti uredno prelamanje ili slaganje, bez rezanja labela i bez dodatnog scroller kontejnera.
- [x] Pregledati sve oznake na 320/375/390 px, obje teme i ekvivalentni 200% reflow (720 × 500; browser toolbar zoom nije testiran). Tab/strelice/Space, zatvaranje panela i povrat fokusa moraju raditi. Proširiti automatizirani test samo ako se mijenja ponašanje; za čistu CSS korekciju ne dodavati test koji provjerava doslovni CSS string.
- [x] Sačuvati usporedive snimke za 04 i 29; pokrenuti postojeće relevantne provjere ako se mijenja DOM/vezivanje.

**Prihvat:** preduvjet prethodi uploadu u vizualnom i tipkovničkom slijedu; dugačke oznake postavki čitljive su i uredne.

## T7 — dokaz, regresija i završni pregled

**Datoteke:** prethodno navedeni testovi; `playwright.config.ts` samo za uključivanje novog `free-tools-responsive.spec.ts` u potrebne browser allowliste; `docs/AUDIT_MASTER.md` odjeljak 18; novi lokalni paket `output/playwright/visual-audit-implementation-<run-date>/`.

- [x] Ciljane Vitest datoteke pokretati po zadatku, zatim jednom objedinjeno nakon svih izmjena:

  ```text
  node scripts/with-gate-lock.mjs visual-audit-unit -- npx vitest run tests/results-cockpit-dom.test.ts tests/wizard-view-single-writer.test.ts tests/repair-phase.test.ts tests/profile-card-sample-summary.test.ts tests/citat-page.dom.test.ts tests/naslovnica-page.dom.test.ts tests/desk-mount.test.ts tests/intake-layout.test.ts tests/intake-live.test.ts tests/display-settings.test.ts
  ```

- [x] U odobrenom okruženju postaviti slobodni `LEKTA_UX_PORT`, ostaviti reuse tuđeg servera isključenim i pokrenuti ciljane browser provjere s jednim radnikom:

  ```text
  npm run test:ux -- tests/ux/repair-cta-opens-panel.spec.ts tests/ux/workspace-entry.spec.ts tests/ux/workspace-viewports.spec.ts tests/ux/free-tools-responsive.spec.ts tests/ux/intake-entry.spec.ts --workers=1
  ```

- [x] Provjeriti prikupljanje testova (`--list`) za Chromium/mobile-Chromium te WebKit/mobile-WebKit na CI-ju ili radnoj stanici. Novi spec dodati u postojeće allowliste potrebnih projekata; rezultat „0 testova” nije prolaz. Ne pokretati sve motore na ograničenom laptopu bez dodjele.
- [x] Izvesti postojeći axe paket i provjeru pristupačnosti radnog prostora; za novi responsive spec dodati axe provjeru stvarno popunjenog mobilnog stanja alata. Ne ukidati sve stare skipove naslijepo niti ovo nazivati punom WCAG potvrdom. Novi relevantni serious/critical nalaz mora biti riješen ili jasno blokirati prihvat svog zahvata.
- [x] Snimiti svih devet ispravljenih stanja i kontrole na 320/375/390/768/1440 px, prema matrici pojedinog zadatka, u obje teme gdje nalaz zahvaća temu. Pričekati fontove i stabilan završetak radnje; koristiti viewport snimke, bez prikrivanja greške cropom. Uz snimke zapisati rutu, stvarni viewport, temu, fixture i HEAD/diff.
- [x] Vizualno pregledati parove prije/poslije. Svaki F01–F09 dobiva status: popravljeno s dokazom, djelomično ili otvoreno. Broj prolaznih testova sam nije dovoljan za zatvaranje vizualnog nalaza.
- [x] Pokrenuti `npm run check` (već koristi lock). Očekivanje: exit 0 i svi obvezni koraci završeni, uključujući Deno. Prekid zbog resursa ili preskočen korak je neprovjeren rezultat, ne zelen.
- [x] Pokrenuti `node scripts/with-gate-lock.mjs visual-audit-orphans -- npm run orphan-scan` i `git diff --check`; pregledati točan diff i neočekivane promjene. Ako su doista mijenjani generatori/podaci, primijeniti projektni zahtjev dva prolaza i drugog no-op; ne regenerirati nepovezane artefakte.
- [x] Prije eventualnog commita provesti projektom tražen neovisan pregled uz prethodno autoriziranog providera; popraviti nalaze razmjerno dosegu i ponoviti pogođene provjere. Bez automatskog pozivanja drugog modela, commita ili pusha kao nuspojave plana.
- [x] Ažurirati audit s točnim HEAD/base, naredbama, rezultatima, putovima dokaza i preostalim ograničenjima. Ugasiti samo vlastite preview procese i osloboditi vlastiti lock; sačuvati audit dokaze.

## Definicija dovršenosti

Svih devet nalaza ima ispunjen kriterij prihvata, svježu pregledanu snimku i relevantnu provjeru ponašanja. Ciljane regresije i `npm run check` prolaze bez prikrivenih skipova za obavezne scenarije; mobilni dokument nakon resizea radi, prazni alati ne tvrde uspjeh, a popravak čuva pristanak i odabir. Izvještaj jasno razlikuje lokalni dokaz od browser-matrix/produkcionog dokaza. Neriješen obvezni gate znači djelomično dovršeno, ne gotovo.

## Samopregled plana

- F01 → T1; F02/F03 → T4; F04 → T3; F05 → T5; F06/F07 → T2; F08/F09 → T6; zajednička regresija → T7.
- Svih pet Review Focus rubnih slučajeva imaju vlasnika i provjeru.
- Nema novih javnih API-ja, promjene pravila analize, repair ugovora ili backend rada.
- Preporučena izvedba: jedan implementator u ovoj grani, serijski po zadacima. Neovisni završni pregled primijeniti prema projektnim pravilima prije eventualnog commita.


## Bilješke izvedbe — 2026-09-29

- Nema novih npm ovisnosti: potrebni Node, Deno, Playwright/Chromium i axe već su dostupni.
- Lokalni preglednik izvršen je serijski kroz gate lock, u izoliranom worktreeu, bez ponovne uporabe tuđeg servera. Firefox/WebKit imaju potvrđeno prikupljanje, ne izvršenje.
- Read-only završni pregled našao je kasni DOM upis nakon disposea. AbortSignal je zato prenesen do oba lazy importa; povrat ima idempotentno čišćenje zooma. Dvije regresije prvo su pale pa prošle; ponovni pregled nije našao preostali lifecycle kvar.
- Datum je nakon nalaza pri ekvivalentnom 200% reflowu složen okomito i na širim karticama. Reflow je mjeren CSS viewportom 720 × 500, ne kontrolom zooma u preglednikovoj alatnoj traci.
- Mobilni axe otkrio je još kontrast u success CTA-u, citatu u tekstu i oznakama literature. Minimalne izmjene koriste postojeći tekstualni token; nema isključivanja axe pravila.
- Brojač repair plana izričito kaže „Odabrano”. Računanje, eligibility, cijene, pristanak i backend nisu promijenjeni.
- Stavka pregleda prije eventualnog commita je uvjetna: commit nije izveden; read-only pregled ove sesije nije zamjena za budući projektni cross-provider gate.
- Povijesni RED prolazi i pogreške prvih testnih scenarija sačuvani su u ledgeru. Završni status određuju ponovljene pogođene provjere i puni gate, ne zbroj svih pokušaja.

- Build je otkrio tijesni početni bundle budžet: adapter `desk-document` sada se u appu uvozi dinamički tek za vidljiv host. Budžet 960 KB nije mijenjan. Build, 45/45 ciljanih testova i 2/2 + 1/1 pregledničkih provjera prolaze; novi screenshotovi pregledani.
- Postojeći CRLF test pogrešno dvaput pretvara Windows završetke redaka. Lokalni workflow normaliziran je na LF i potvrđen bajt-po-bajt jednak HEAD blobu; nema logičke promjene ni izmjene testa.

- Završni puni gate: `check-release-final.log`, exit 0, 670 datoteka prolazi; 8976 testova prolazi, 10 postojećih Windows skipova. Deno i Vite build prolaze. Završni orphan-scan čist; read-only pregled naknadnog importa nema nalaza.


## Dopuna zatvaranja testova — 2026-09-29

- F06 WebKit fokus zatvoren stvarnim openerom; TDD 91/91.
- Browser dokazi: 60 Chromium testova u prekinutom runu, zavrseni nastavak 89/90, zatim preostali test 10/10 nakon ispravke spremnosti. Nema tvrdnje o jednom cistom 150-testnom runu.
- Puni `check-completion-final.log`: exit 0, 670 datoteka, 8976 PASS, 10 postojecih Windows skipova.
- 16 dodatnih screenshotova pregledano; F10 red gumba citata na mobile-chromium 320 px ostaje zaseban otvoren nalaz.
- Potpuna granica dokaza i povijest u AUDIT_MASTER 18.6 i HTML izvjestaju. Nema commita ili deploya.

## Autorizirani nastavak F10/F11 — 2026-09-30

- [x] F10: prelamanje reda gumba citata i regresija sirine dokumenta/gumba na pet sirina, u obje teme i svih pet browser projekata.
- [x] F11: cekanje stvarnog prihvata dokumenta u testovima identiteta, dugog imena i indikatora spremanja; zadrzane sadrzajne provjere.
- [x] Reproducirano kasnjenje prihvata 12 s: 5/5; zaglavlje/spremanje 25/25; geometrija/axe 10/10 nakon korekcije redoslijeda cekanja renderiranja teme.
- [x] Svjezi puni `npm run check`: 670 datoteka, 8976 PASS, 10 postojecih Windows skipova, exit 0; orphan-scan i diff-check takoder exit 0.
- [x] 19 screenshotova izravno pregledano; sacuvan pocetni 84/85 run i njegov pad cekanja boje, bez tvrdnje o jednom cistom 85/85 runu.
- [x] Dokazi i granice zapisani u AUDIT_MASTER 18.7 i `output/playwright/visual-audit-fixes-2026-09-30/report.html`. Samo dokumentacijska dopuna nakon gatea; bez commita/deploya.
