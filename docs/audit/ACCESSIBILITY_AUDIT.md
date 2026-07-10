# Audit pristupačnosti (WCAG 2.2 AA), Lekta

Datum: 2026-07-10. Opseg: klijentski UI (statički HTML predlošci + `src/ui`,
`src/shared`). Analiza je statička (čitanje koda), bez pokretanja preglednika ni
testova (zadatak je read-only). Referentni standard: WCAG 2.2, razina AA.

## Mapa područja

- `index.html` (glavna aplikacija: hero, wizard za učitavanje, analizator,
  rezultati u tabovima, cjenik, FAQ, 8 modala). Sav dinamički rezultat crta
  `src/ui/app.ts`.
- Alatne stranice (MPA, svaka svoj HTML + `src/tools/*-page.ts`): `alati.html`
  (hub), `citat.html`, `kartice.html`, `izjava.html`, `literatura.html`,
  `naslovnica.html`, `landing_usporedba.html` (usporedna tablica).
- `verification.html` (interna QA konzola, `noindex`, `src/ui/verification-console.ts`).
- Zajednički boot: `src/shared/ui-boot.ts` (tema, mobilni izbornik, "Alati"
  disclosure, reveal-on-scroll, hero animacije) i `src/shared/motion.css`.
- Dinamički rezultat i modali: `src/ui/app.ts` (fokus-trap, tabovi, issues,
  check-tablice, progress).

Što je dobro postavljeno (da se ne regresira): jedan smisleni `<h1>` po javnoj
stranici; `<html lang="hr">` svugdje; `<label for>` gotovo na svim poljima;
tab pattern s `role="tablist"/tab/tabpanel`, `aria-selected`, roving `tabindex`
i strelica/Home/End tipkovnicom (`app.ts:140`, `app.ts:708`); modalni fokus-trap
na Tab + povrat fokusa + Escape (`app.ts:244`, `app.ts:143`); `role="alert"` na
grešci učitavanja datoteke (`index.html:288`); SR-only live regija za brojač
kartica (`kartice.html:183`); dosljedno gejtiranje gibanja s
`prefers-reduced-motion` (npr. `index.html:59,175,179`); zoom nije blokiran
(`initial-scale=1`, bez `maximum-scale`/`user-scalable=no`); nema `<img>` bez
`alt` (sve su ikone/SVG/CSS, ikone dobivaju `aria-hidden` u `ui-boot.ts:35`);
status u check-tablicama nosi tekst, ne samo boju (`app.ts:704`).

## Tablica nalaza po prioritetu

| ID | Prioritet | Nalaz | WCAG SC | Lokacija |
|----|-----------|-------|---------|----------|
| accessibility-01 | P1 | Nijedna stranica nema skip link (preskoči na sadržaj) | 2.4.1 (A) | svi HTML-ovi |
| accessibility-02 | P1 | Nakon analize/demo fokus se gubi (ostaje na skrivenom gumbu), rezultat se ne fokusira ni najavljuje | 2.4.3 (A), 4.1.3 (AA) | `app.ts:566,449,466` |
| accessibility-03 | P2 | Težina problema u popisu problema nosi se samo ikonom (aria-hidden) i bojom, bez tekstualne oznake za čitač ekrana | 1.4.1 (A), 1.1.1 (A) | `app.ts:705` |
| accessibility-04 | P2 | Fokus je nevidljiv u Windows High Contrast/forced-colors na 6 alatnih stranica (`outline:none`+box-shadow, bez forced-colors fallbacka) | 2.4.7 (A), 1.4.1 (A) | `citat.html:36` i dr. |
| accessibility-05 | P2 | Pozadina modala nije `inert`/`aria-hidden`; virtualni kursor čitača ekrana izlazi iz dijaloga | 1.3.1 (A), 2.4.3 (A) | `app.ts:244` |
| accessibility-06 | P2 | Nema automatske a11y provjere (axe) u CI-u ni u `npm run check` gate-u | proces | `package.json`, `.github/workflows` |
| accessibility-07 | P3 | Usporedna tablica bez `scope`/rednih zaglavlja/`caption` | 1.3.1 (A) | `landing_usporedba.html:188` |
| accessibility-08 | P3 | Spinner (beskonačna animacija) nije gejtiran `prefers-reduced-motion` | 2.2.2 (A) | `index.html:62` |
| accessibility-09 | P3 | "Alati" izbornik: `role="menu"/menuitem` na navigaciji + `aria-expanded` desinkroniziran s hover otvaranjem | 4.1.2 (A) | `index.html:240,41`, `ui-boot.ts:117` |
| accessibility-10 | P3 | Ciljevi manji od 24x24 px: `.remove-file` (~20 px) i `.wl-close` | 2.5.8 (AA) | `index.html:61,210` |
| accessibility-11 | P3 | Fokus prsten niskog kontrasta (box-shadow, 22% alfa) | 2.4.7 (A) | `index.html:31,39` |
| accessibility-12 | P3 | Preskok razine naslova (h2 pa h4) u popisu problema; `verification.html` bez statičnog h1 | 1.3.1 (A) | `app.ts:705`, `verification.html:40` |
| accessibility-13 | P3 | `dropzone` je `role="button"` s fokusabilnim potomcima (file input + gumb); sr-only file input je u tab redu bez vidljivog fokusa | 4.1.2 (A), 2.4.7 (A) | `index.html:288` |
| accessibility-14 | P3 | Preklopnik teme nema `aria-pressed` (stanje svijetlo/tamno nije izloženo) | 4.1.2 (A) | `index.html:241`, `ui-boot.ts:142` |

---

## Detaljni nalazi

### accessibility-01 (P1): Nema skip linka ni na jednoj stranici

- Problem: Svaka stranica ima ljepljivu (`position:sticky`) navigaciju s 6 do 8
  ponovljenih poveznica prije glavnog sadržaja. Ne postoji "Preskoči na sadržaj"
  poveznica kao prvi fokusabilni element, pa korisnik tipkovnice i čitača ekrana
  mora na svakoj navigaciji ponovno prolaziti kroz cijeli nav prije nego dođe do
  analizatora/alata. To je klasičan Bypass Blocks propust (razina A).
- Lokacija: `index.html:236-258` (prvi fokusabilni element je `.logo`, odmah zatim
  nav poveznice, pa `<main id="top">` bez cilja preskoka); isti obrazac na
  `citat.html:110-147`, `kartice.html`, `izjava.html`, `literatura.html`,
  `naslovnica.html`, `alati.html`, `landing_usporedba.html`.
- Dokaz/reprodukcija: Grep za `skip|preskoči|href="#main"` po `*.html` daje pogotke
  samo u harvestiranim izvorima pod `data/sources/**`, nijedan u vlastitim
  stranicama. Tabom od vrha stranice prvi je stop `.logo`, nema ranijeg cilja na
  `<main>`.
- Posljedica: Korisnici tipkovnice i čitača ekrana troše dodatnih 6 do 8 Tab
  pritisaka po stranici; ozbiljno usporava primarni tok (učitaj pa analiziraj).
- Preporuka: Dodati kao prvi element u `<body>` skip link, npr.
  `<a class="skip-link" href="#analyzer">Preskoči na sadržaj</a>` (na alatima ciljati
  `#main` ili glavni `<section>`). Postoji već `<main id="top">`; dodati `id`
  primarnom cilju i CSS koji link drži `.sr-only` dok nije `:focus` (tada vidljiv,
  fiksiran gore lijevo, kontrastan). Idealno ubaciti kroz `src/shared/ui-boot.ts`
  da vrijedi za sve MPA stranice jednim izvorom.
- Acceptance: Prvi Tab na svakoj stranici fokusira vidljivi "Preskoči na sadržaj"
  koji Enterom pomiče fokus na glavni sadržaj (`<main>`/analizator). Provjereno
  tipkovnicom u light i dark temi te u forced-colors.
- Regresijski rizik: Vrlo nizak. Aditivni element; ako se ubacuje u `ui-boot`,
  paziti da meta cilja (`#analyzer`/`#main`) postoje na svakoj stranici pa da
  Enter ne skoči u prazno.

### accessibility-02 (P1): Fokus se gubi nakon analize; rezultat se ne fokusira ni najavljuje

- Problem: `runAnalysis` (`app.ts:449`) sakriva `#wizardView` (u kojem je gumb
  "Analiziraj dokument" koji je upravo bio fokusiran) i prikazuje `#progressView`,
  a `renderResult` (`app.ts:566`) sakriva progress i otkriva `#resultView`. Nigdje
  se fokus ne premješta na rezultat. Kad se kontejner s fokusiranim gumbom sakrije
  (`display:none`), fokus pada na `<body>`, pa korisnik tipkovnice gubi mjesto i
  mora Tabom od vrha. Čitač ekrana ne dobiva obavijest da je rezultat spreman:
  `#progressView` jest `role="status" aria-live="polite"` (`index.html:329`), ali
  `#resultView` nije živa regija niti se fokusira, pa se prijelaz "gotovo" ne
  najavljuje. Isti obrazac je u `runDemo` (`app.ts:466`).
- Lokacija: `app.ts:449-457` (runAnalysis), `app.ts:566` (renderResult, kraj ne
  poziva `.focus()`), `app.ts:466` (runDemo).
- Dokaz/reprodukcija: Tipkovnicom pokreni analizu (Enter na "Analiziraj"). Po
  završetku `document.activeElement` je `<body>` (gumb je u sada skrivenom
  `#wizardView`). Sljedeći Tab kreće od vrha dokumenta, ne od rezultata.
- Posljedica: Gubitak konteksta fokusa (2.4.3) i izostanak najave promjene stanja
  (4.1.3) za najvažniji korak proizvoda; korisnik čitača ekrana ne zna da je
  analiza gotova.
- Preporuka: Na kraju `renderResult` premjestiti fokus na naslov rezultata:
  dati `#resultTitle` (ili `.result-view`) `tabindex="-1"` i pozvati `.focus()`
  (uz `scrollIntoView`), te postaviti kratku najavu (npr. `#resultTitle` unutar
  regije s `aria-live` ili jednokratni SR-only status "Analiza gotova, rezultat
  je spreman"). Isto primijeniti na `runDemo`. Pri greški (`catch` u `app.ts:457`)
  vratiti fokus na dropzone/gumb i zadržati poruku (vidi i toast koji nestaje za
  3,5 s, `app.ts:119`).
- Acceptance: Nakon analize i nakon demo prikaza fokus je na naslovu rezultata;
  čitač ekrana pročita naslov/status; Tab nastavlja unutar rezultata, ne od vrha.
- Regresijski rizik: Nizak. Paziti na `preventScroll` da se ne bori s postojećim
  `scrollIntoView` (isti obrazac već korišten za demo chipove, `app.ts:492`).

### accessibility-03 (P2): Težina problema samo bojom i ikonom, bez teksta za čitač ekrana

- Problem: U popisu problema (`renderIssues`, `app.ts:705`) svaka kartica
  `<article class="issue error|warning|info">` razlikuje težinu isključivo preko
  `.issue-icon` koji sadrži Lucide SVG (`alert-circle`/`alert-triangle`/`info`) i
  boje pozadine. Sve Lucide ikone dobivaju `aria-hidden="true"` (`ui-boot.ts:35`),
  pa čitač ekrana ne pročita ništa o težini. U kartici se čitaju samo naslov
  (`<h4>`), opis i mjesto. Sighted korisnik razlikuje po boji/obliku; korisnik
  čitača ekrana ne dobiva oznaku "Važno/Upozorenje/Napomena". (Za razliku od toga,
  check-tablica na `app.ts:704` ima tekst uz ikonu, i to je ispravno.)
- Lokacija: `app.ts:705` (predložak `<div class="issue-icon">...ikona...</div>`
  bez tekstualne alternative težine); CSS `index.html:63` (`.issue.error/.warning/.info`).
- Dokaz/reprodukcija: Ikone su `aria-hidden`; kartica nema `aria-label` ni SR-only
  tekst težine. Čitač ekrana za tri kartice različite težine izgovara isti obrazac
  (naslov, opis, mjesto) bez razlike.
- Posljedica: Gubi se ključna informacija (koliko je nalaz važan) za korisnike
  čitača ekrana; oslanjanje na boju/ikonu bez teksta krši 1.4.1 i 1.1.1.
- Preporuka: U svaku karticu dodati SR-only oznaku težine (npr.
  `<span class="sr-only">Važno: </span>` za error, "Upozorenje: ", "Napomena: ")
  ili `aria-label`/`role="img"` s imenom na ikoni. Klase `sr-only` već postoje
  (`index.html:39`).
- Acceptance: Čitač ekrana za svaku karticu izgovori težinu (Važno/Upozorenje/
  Napomena) prije naslova; vizual nepromijenjen.
- Regresijski rizik: Vrlo nizak. Aditivni tekst; ne dira filtriranje ni brojače.

### accessibility-04 (P2): Fokus nevidljiv u forced-colors na 6 alatnih stranica

- Problem: Na `citat.html`, `izjava.html`, `literatura.html`, `naslovnica.html`,
  `alati.html`, `landing_usporedba.html` fokus je stiliziran kao
  `:focus-visible{outline:none;box-shadow:var(--focus)}`. U Windows High Contrast
  (forced-colors) načinu `box-shadow` se ne iscrtava, a `outline` je uklonjen, pa
  fokusni indikator potpuno nestaje. `index.html:39` i `kartice.html` imaju
  ispravan uzorak (forced-colors fallback ili puni `outline`), ostale stranice
  nemaju.
- Lokacija: `citat.html:36` (`:focus-visible{outline:none;box-shadow:var(--focus)...}`),
  isto u `izjava.html`, `literatura.html`, `naslovnica.html`, `alati.html`,
  `landing_usporedba.html`. Referentni ispravni uzorak: `index.html:39`
  (`@media (forced-colors:active){:focus-visible{outline:2px solid CanvasText;outline-offset:2px}}`)
  i `kartice.html` (`outline:2px solid var(--brand)` + forced-colors fallback).
- Dokaz/reprodukcija: Grep pokazuje `forced-colors` prisutan samo u `index.html` i
  `kartice.html`; ostalih 6 koristi `outline:none`+box-shadow bez fallbacka.
- Posljedica: Korisnici tipkovnice u forced-colors/WHCM ne vide gdje je fokus na 6
  javnih alatnih stranica (kršenje 2.4.7; box-shadow kao jedini indikator pada i
  pod 1.4.1).
- Preporuka: Poravnati sve stranice s `index.html`/`kartice.html` uzorkom:
  zadržati box-shadow za standardni prikaz, ali dodati
  `@media (forced-colors:active){:focus-visible{outline:2px solid CanvasText;outline-offset:2px}}`
  ili jednostavno svugdje koristiti stварni `outline` (kao `kartice.html`).
- Acceptance: U forced-colors načinu fokus je vidljiv (obris) na svim interaktivnim
  elementima na svih 8 stranica.
- Regresijski rizik: Vrlo nizak. Samo CSS; box-shadow ostaje za standardni prikaz.

### accessibility-05 (P2): Pozadina modala nije inert; čitač ekrana izlazi iz dijaloga

- Problem: `trapModal` (`app.ts:244`) hvata Tab unutar modala i vraća fokus, ali ne
  postavlja `inert` ni `aria-hidden="true"` na pozadinski sadržaj (`<main>`, header,
  footer). Virtualni kursor čitača ekrana (strelice, ne samo Tab) i dalje čita
  cijelu pozadinsku stranicu iako je vizualno prekrivena `.modal-backdrop`. Dijalozi
  imaju ispravan `role="dialog" aria-modal="true"` (npr. `index.html:345`), ali bez
  inertne pozadine `aria-modal` sam po sebi ne jamči izolaciju u svim čitačima.
- Lokacija: `app.ts:244` (trapModal, samo keydown Tab trap), `app.ts:245`
  (releaseModal). Modali: `index.html:345-353`.
- Dokaz/reprodukcija: Otvoren modal (npr. narudžba). Tab je zarobljen, ali čitanje
  strelicama gore/dolje nastavlja se kroz naslov, cjenik i footer iza modala.
- Posljedica: Zbunjujuća navigacija čitačem ekrana, moguća interakcija s
  pozadinskim kontrolama; slabi značenje "modalno".
- Preporuka: Pri otvaranju dijaloga postaviti `inert` (uz fallback
  `aria-hidden="true"`) na sve sestrinske landmarke izvan modala (npr. `<header>`,
  `<main>`, `<footer>`, `.consent-banner`, `.toast-wrap`), a ukloniti u
  `releaseModal`. Držati jedan wrapper koji se zajednički deaktivira.
- Acceptance: Dok je modal otvoren, čitač ekrana ne doseže sadržaj izvan modala ni
  strelicama; nakon zatvaranja pozadina je opet dostupna, fokus se vraća (već radi).
- Regresijski rizik: Srednji. `inert` treba primijeniti na sve pozadinske landmarke,
  ali ne na sam modal (i ne na `.toast-wrap` ako se toast mora najaviti tijekom
  modala; tada ostaviti toast izvan inertnog opsega). Testirati sve modale
  (`order`, `history`, `legal`, `auth`, `guarantee`, `checkoutConsent`, dev `qa`/`setup`).

### accessibility-06 (P2): Nema automatske a11y provjere u CI-u ni u build gate-u

- Problem: `npm run check` je `tsc --noEmit && vitest run && vite build`
  (`package.json`), bez ijedne pristupačnosne provjere. Jedini CI workflow je
  `.github/workflows/docx-smoke.yml`. Nema `axe-core`, `jest-axe`, `pa11y` ni
  Lighthouse u ovisnostima (grep: NONE). Zbog toga regresije poput ovih iz audita
  nemaju automatsku zaštitu.
- Lokacija: `package.json` (scripts `check`/`test`, devDependencies), `.github/workflows/`.
- Dokaz/reprodukcija: Grep `axe|pa11y|lighthouse|jest-axe` po `package.json` bez
  pogodaka; u `tests/` nema a11y testa.
- Posljedica: A11y kvaliteta ovisi samo o ručnom pregledu; laka tiha regresija
  (npr. netko doda modal bez trapa, ukloni label, promijeni fokus stil).
- Preporuka: Dodati lagani axe smoke test u postojeći vitest + happy-dom setup:
  učitati svaki statički HTML predložak (`index.html`, alati), montirati u
  happy-dom i pokrenuti `axe-core` (`@axe-core/*` radi i bez pravog preglednika za
  statičku strukturu: landmarci, labeli, dupli id, kontrast atributa, ARIA valjanost).
  Dodati skriptu `"a11y": "vitest run tests/a11y.test.ts"` i uključiti je u `check`.
  Za dinamičke tokove (rezultat, modali) dodati Playwright + `@axe-core/playwright`
  smoke kao zaseban, opcionalan CI korak (ne blokirajući dok se ne stabilizira).
  Pratiti postojeći stil golden testova (suite se sam preskače bez preduvjeta).
- Acceptance: `npm run check` (ili zaseban `a11y` korak) pada na uvedenoj a11y
  regresiji (npr. `<input>` bez labela, dupli `id`, nevaljan ARIA), zelen na
  trenutnoj bazi nakon popravaka.
- Regresijski rizik: Nizak za samu bazu; srednji za CI vrijeme (axe skeniranje je
  brzo za statiku). Prvo uvesti u "report-only" pa tek onda blokirajuće.

### accessibility-07 (P3): Usporedna tablica bez zaglavlja po opsegu

- Problem: Tablica usporedbe (`landing_usporedba.html:188`) ima stupčana zaglavlja
  kao `<th>` bez `scope="col"`, prvi stupac svakog retka (naziv značajke) je
  `<td class="dim">` umjesto `<th scope="row">`, i nema `<caption>`. Vrijednosti
  ćelija nose tekst ("Da"/"Ne"/"Djelomično", `landing_usporedba.html:201-216`), pa
  informacija nije izgubljena bojom, ali čitač ekrana ne povezuje ćeliju s njezinim
  zaglavljem (stupac/red).
- Lokacija: `landing_usporedba.html:188-216`.
- Dokaz/reprodukcija: `<th>` bez `scope`; redni "header" je `<td>`; bez `<caption>`.
- Posljedica: U tablici s 5 stupaca čitač ekrana izgovara vrijednosti bez konteksta
  ("Da", "Ne") pa korisnik gubi vezu s kolonom/značajkom (1.3.1).
- Preporuka: Dodati `scope="col"` svim `<th>` u `<thead>`, pretvoriti prvu ćeliju
  svakog retka u `<th scope="row">`, i dodati `<caption>` (može `.sr-only`) koji
  opisuje tablicu.
- Acceptance: Čitač ekrana pri kretanju po ćelijama najavljuje pripadni stupac i
  redni naziv; tablica ima naziv.
- Regresijski rizik: Vrlo nizak. Semantička izmjena; CSS ciljanje `td.dim` možda
  treba dopuniti na `th.dim`.

### accessibility-08 (P3): Spinner nije gejtiran prefers-reduced-motion

- Problem: `.spinner{animation:spin .9s linear infinite}` (`index.html:62`) vrti se
  beskonačno tijekom analize, a nije obuhvaćen nijednim
  `@media (prefers-reduced-motion:reduce)` blokom (za razliku od većine ostalih
  animacija u datoteci). Za korisnike osjetljive na gibanje kontinuirana rotacija
  može biti neugodna.
- Lokacija: `index.html:62` (definicija `.spinner` i `@keyframes spin`).
- Dokaz/reprodukcija: U datoteci postoje brojni reduced-motion blokovi
  (`index.html:59,159,175,179,231`), ali nijedan ne cilja `.spinner`.
- Posljedica: Kontinuirano gibanje bez alternative pri smanjenom gibanju (granični
  2.2.2; napredak je ključan pa je dopuštena statična alternativa).
- Preporuka: Pod `@media (prefers-reduced-motion:reduce)` zaustaviti rotaciju
  (`animation:none`) i dati statičan/pulsirajući indikator napretka; tekstualni
  napredak već postoji (`#progressMessage`, živa regija).
- Acceptance: Uz "reduce" postavku spinner ne rotira, a napredak je i dalje vidljiv
  i najavljen.
- Regresijski rizik: Vrlo nizak. Samo CSS.

### accessibility-09 (P3): "Alati" izbornik, pogrešna ARIA menu uloga i desink stanja

- Problem: Navigacijski "Alati" popup na `index.html:240` koristi
  `role="menu"` s `role="menuitem"` poveznicama, što je aplikacijski menu uzorak
  (očekuje navigaciju strelicama i upravljanje fokusom), a ovdje je zapravo
  disclosure s običnim linkovima. Uz to, na `index.html` CSS otvara popup na
  `:hover`/`:focus-within` (`index.html:41`), dok `ui-boot.ts:117` prebacuje
  `aria-expanded` samo na klik; hoverom se izbornik vizualno otvori, a
  `aria-expanded` ostaje "false" (i obrnuto), pa je stanje za čitač ekrana
  desinkronizirano. (Na `citat.html` CSS bar reagira i na `[aria-expanded="true"]`,
  ali hover desink ostaje.)
- Lokacija: `index.html:240` (`role="menu"/menuitem`, `aria-haspopup`),
  `index.html:41` (hover/focus-within CSS), `ui-boot.ts:117-137` (setupNavTools).
- Dokaz/reprodukcija: Hover mišem otvori izbornik dok `aria-expanded` gumba ostaje
  "false"; obratno, klik postavi "true" a odmicanje miša vizualno zatvori.
- Posljedica: Čitač ekrana pogrešno najavljuje "menu" i krivo stanje otvorenosti
  (4.1.2).
- Preporuka: Ukloniti `role="menu"/menuitem` (radi se o navigaciji: neka bude
  `<nav>`/lista linkova ili disclosure s `aria-expanded` na gumbu i regijom
  linkova). Uskladiti CSS i JS: otvaranje voditi preko `[aria-expanded="true"]`
  (kao na `citat.html`) umjesto isključivo hoverom, ili barem sinkronizirati
  `aria-expanded` s hover/focus stanjem.
- Acceptance: `aria-expanded` uvijek odgovara vidljivom stanju; čitač ekrana ne
  najavljuje "menu" nego navigaciju/disclosure; tipkovnica otvara/zatvara i na
  touch uređajima (bez hovera).
- Regresijski rizik: Nizak. Isti uzorak već postoji na `citat.html`; paziti da
  postojeći Escape handler (`ui-boot.ts:128`) i klik-izvan (`ui-boot.ts:133`)
  ostanu.

### accessibility-10 (P3): Ciljevi manji od 24x24 px

- Problem: WCAG 2.2 SC 2.5.8 (AA) traži minimalno 24x24 CSS px za pokazivačke
  ciljeve (uz iznimke). `.remove-file` je `border:0;background:transparent;
  font-size:20px` bez paddinga (SVG 20 px), dakle ~20x20 px (`index.html:61`).
  `.wl-close` je `padding:2px 6px;font-size:20px` (`index.html:210`), granično oko
  24 px. Oba su izolirani gumbi (X za uklanjanje dokumenta / zatvaranje trake), ne
  inline u tekstu, pa iznimka za "inline" ne vrijedi.
- Lokacija: `index.html:61` (`.remove-file`), `index.html:210` (`.wl-close`).
- Dokaz/reprodukcija: Izmjerene CSS dimenzije iz stilova; nema paddinga koji bi
  dogurao `.remove-file` na 24 px.
- Posljedica: Teže pogađanje na dodir/miš za motorički osjetljive korisnike.
- Preporuka: Postaviti `min-width:24px;min-height:24px` (idealno 44x44 s
  providnim paddingom/`inset` hit-area) na `.remove-file` i `.wl-close`.
- Acceptance: Oba cilja imaju barem 24x24 px klikabilnu površinu.
- Regresijski rizik: Vrlo nizak. Samo CSS; provjeriti da veći hit-area ne pomiče
  layout `.selected-file` retka.

### accessibility-11 (P3): Fokus prsten niskog kontrasta

- Problem: `--focus:0 0 0 4px rgba(51,64,126,.22)` (`index.html:31`) daje fokusni
  box-shadow pri samo 22% neprozirnosti brenda; na svijetloj toploj pozadini prsten
  je vrlo blijed. Indikator postoji (zadovoljava minimum 2.4.7), ali je slabo
  uočljiv (granično prema 2.4.13 Focus Appearance, AAA).
- Lokacija: `index.html:31` (`--focus`), `index.html:39` (`:focus-visible`).
- Dokaz/reprodukcija: Alfa 0.22 nad `--bg:#f5f2ea` daje nizak kontrast prstena
  prema susjednoj pozadini.
- Posljedica: Slabovidnim korisnicima tipkovnice teže je uočiti fokus.
- Preporuka: Povećati neprozirnost/kontrast (npr. puna brend boja ili 2px solid
  `outline` uz box-shadow), ciljajući barem 3:1 kontrast indikatora prema pozadini.
- Acceptance: Fokusni indikator ima kontrast >= 3:1 prema susjednoj pozadini u obje
  teme.
- Regresijski rizik: Vrlo nizak. Samo token/CSS.

### accessibility-12 (P3): Preskok razine naslova i nedostatak h1 u QA konzoli

- Problem: U panelu "Svi problemi" prva naslovna razina je `<h4>` naslova problema
  (`app.ts:705`), a najbliži prethodni naslov je `<h2>` rezultata (`index.html:332`);
  nema `<h3>` između, pa se preskače razina (h2 pa h4). Odvojeno, `verification.html`
  (interna QA konzola, `noindex`) nema statični `<h1>` u markupu (`verification.html:40`
  je prazan `<div>` koji puni `verification-console.ts`), pa dok se JS ne izvrši
  stranica nema h1.
- Lokacija: `app.ts:705` (`<h4>` problema), `index.html:332,335` (h2 rezultata,
  tabpanel bez h3), `verification.html:40`.
- Dokaz/reprodukcija: Struktura naslova u rezultatu: h1 (hero) pa h2 (rezultat) pa
  h4 (problem), bez h3 u toku problema. `verification.html` ima 0 statičnih h1.
- Posljedica: Navigacija po naslovima (čitač ekrana) preskače razinu; 1.3.1.
- Preporuka: Podići naslov problema na `<h3>` ili umetnuti h3 zaglavlje panela; u
  `verification.html` dodati statični `<h1>` (ili osigurati da ga JS uvijek ubaci
  kao prvi element). QA konzola je interni alat pa je niži prioritet.
- Acceptance: Nema preskoka razine naslova u rezultatu; svaka stranica (uklj. QA)
  ima točno jedan h1.
- Regresijski rizik: Nizak. Provjeriti CSS koji cilja `.issue h4`.

### accessibility-13 (P3): Dropzone kao gumb s fokusabilnim potomcima

- Problem: `#dropzone` je `role="button" tabindex="0"` (`index.html:288`) ali
  sadrži fokusabilne potomke: `<input type="file" class="sr-only">` i
  `<button id="browseBtn">`. ARIA zabranjuje fokusabilne potomke unutar elementa s
  `role="button"`. Uz to, sr-only file input je i dalje u tab redu (sr-only ga ne
  uklanja iz fokusa), pa korisnik tipkovnice dobije zaustavljanje na nevidljivom
  polju bez vidljivog fokusnog indikatora (klip ga skriva).
- Lokacija: `index.html:288` (dropzone + ugniježđeni `#fileInput` i `#browseBtn`).
- Dokaz/reprodukcija: Tab redoslijed: dropzone (role=button), zatim nevidljivi
  `#fileInput`, zatim `#browseBtn`, tri zaustavljanja za jednu radnju; drugo je
  bez vidljivog fokusa.
- Posljedica: Zbunjujuća semantika i tab-redoslijed; nevidljivi fokus na file
  inputu (2.4.7), nevaljana ugniježđena interaktivnost (4.1.2).
- Preporuka: Ili maknuti `role="button"`/`tabindex` s dropzone i osloniti se na
  vidljivi `#browseBtn` (dropzone ostaje samo drop meta), ili file input izuzeti iz
  tab reda (`tabindex="-1"`) i držati jednu jasnu fokusabilnu kontrolu s vidljivim
  fokusom. Zadržati postojeći Enter/Space handler koji otvara dialog (`app.ts:134`).
- Acceptance: Za učitavanje postoji jedna jasna, vidljivo fokusabilna kontrola; nema
  fokusabilnih potomaka unutar `role="button"`.
- Regresijski rizik: Srednji. Dropzone drag/drop i klik logika (`app.ts:134-138`)
  moraju nastaviti raditi; testirati miš, tipkovnicu i povuci-i-ispusti.

### accessibility-14 (P3): Preklopnik teme bez aria-pressed

- Problem: Gumb za temu (`#themeBtn`, `index.html:241` i alatne stranice) ima
  `aria-label="Promijeni temu"` ali ne izlaže stanje (svijetla/tamna). Za korisnika
  čitača ekrana nije jasno je li tamna tema uključena. `setupThemeToggle`
  (`ui-boot.ts:142`) mijenja `data-theme` ali ne postavlja `aria-pressed`.
- Lokacija: `index.html:241`, `ui-boot.ts:142-150`.
- Dokaz/reprodukcija: Gumb nema `aria-pressed` ni promjenu accessible name po stanju.
- Posljedica: Stanje preklopnika nije izloženo (4.1.2), niža je otkrivljivost.
- Preporuka: Postaviti `aria-pressed="true|false"` (ili mijenjati accessible name na
  "Uključi tamnu temu"/"Uključi svijetlu temu") pri inicijalizaciji i na svaki
  toggle u `setupThemeToggle`.
- Acceptance: Čitač ekrana najavljuje stanje teme; `aria-pressed` prati aktivnu temu
  pri učitavanju i nakon klika.
- Regresijski rizik: Vrlo nizak. Aditivno u zajedničkom boot kodu, vrijedi za sve
  stranice.

---

## Preporučeni redoslijed rada

1. accessibility-01 i accessibility-02 (P1): skip link + fokus/najava rezultata, to
   su temeljni tokovi.
2. accessibility-03, 04, 05 (P2): tekst težine problema, forced-colors fokus,
   inertna pozadina modala.
3. accessibility-06 (P2): uvesti axe smoke u vitest (report-only pa blokirajuće),
   da se sve ostalo zaključa protiv regresije.
4. Preostali P3: tablica, spinner, menu semantika, veličine ciljeva, kontrast
   fokusa, naslovi, dropzone, tema.

## Napomena o metodi

Nalazi su izvedeni statičkim čitanjem koda; kontrast tijela teksta (`--muted` na
`--bg`/`--panel-2`) izračunat je i prolazi AA u obje teme (oko 5.3:1 do 7.6:1), pa
kontrast teksta nije zaseban nalaz. Preporučuje se potvrda dinamičkih tokova
(rezultat, modali) alatom axe u pravom pregledniku prije zatvaranja P1/P2 stavki.
