# Lekta: usklađivanje koda s dizajn-sustavom

Za Claude Code. Izvor istine je `design/tokens.json` i `design/README.md` (kopija ovog paketa u repou).
Svaki zadatak: (1) pročitaj navedene datoteke, (2) primijeni promjenu, (3) pokreni `tests/` (a11y-css, route-shell-budget), (4) commit po zadatku.

Pravilo iznad svih: ne mijenjaj `design-system.css` primitive bez odobrenja. Sve ostalo se svodi na njih.

---

## Z1. `--route-*` paleta → primitive iz `design-system.css`

**Problem.** `src/routes/shared/route-shell.css` definira vlastitu paletu (`--route-red #9d2f29 / #e36a60`, `--route-green`, `--route-bg #e8dfcd`, `--route-ink #27231e`...) koja se ne poklapa s `--red #C4372E/#E4573D`, `--pass`, `--desk`, `--desk-ink`. Dva crvena tona na istoj stranici.

**Rješenje.** Zamijeni definicije u `:root` i `:root[data-theme="dark"]` aliasima na postojeće primitive; obriši literale:

```css
:root {
  --route-bg: var(--desk);
  --route-surface: var(--desk-2);
  --route-paper: var(--paper);
  --route-ink: var(--desk-ink);
  --route-muted: var(--desk-muted);
  --route-line: var(--desk-line);
  --route-red: var(--red);
  --route-green: var(--pass);
  --route-primary-bg: var(--red);
  --route-primary-fg: var(--on-red);
  --route-shadow: var(--paper-sh);
  --route-directory-paper: var(--paper);
  --route-directory-ink: var(--paper-ink);
  --route-directory-muted: var(--paper-muted);
  --route-directory-line: var(--paper-line);
}
```
Ukloni `:root[data-theme="dark"]` blok (primitive već nose obje teme). Dodatno u istoj datoteci:
- `.route-brand` i `[data-route-directory] > h2` koriste `Georgia`; zamijeni s `var(--display-serif)`.
- `.route-mark` koristi `ui-monospace`; zamijeni s `var(--mono)`.
- Literali `#8f302b`, `#f6ecda`, `#fffdf8`, `#ded2bd`, `#eee5d6`, `#fff8e9` u direktoriju → `var(--red-deep)`, `var(--paper-2)`, `var(--paper)`, `var(--paper-line)`, `var(--paper-line)`, `var(--on-red)`.
- `.route-button--primary` ima `box-shadow: 4px 4px 0 var(--route-red)` (tvrda offset sjena): zamijeni s `box-shadow: var(--paper-sh-sm)`. Isto za `.intake-brand-mark`.

**Provjera.** `grep -n "#[0-9a-f]\{6\}" src/routes/shared/route-shell.css` vraća 0 redaka osim komentara.

---

## Z2. Radiusi gumba: 2px (jezik pečata; pill samo za značke)

**Problem.** Gumbi imaju 2px (`page-chrome.css:135`, `tool-page.css:145,152`, `page-app.css:640`), 9px (`intake.css .intake-cta`), 12px (`route-shell.css .route-button`, `tool-page.css:72`), 14px (`page-app.css:153 .btn-lg`). ODLUKA (2026-09-19, `design/base-buttons.html`): gumb je pečat i dijeli rub s papirom, dakle 2px svugdje; pill ostaje samo za značke, korake i čipove.

**Rješenje.** U `design-system.css` dodaj dva tokena uz postojeće radiuse (jedina dopuštena izmjena primitiva u ovom paketu):
```css
--radius-btn: 2px;      /* = --radius; zaseban token da se kasnije može odvojiti */
--radius-btn-lg: 2px;
```
Zatim:
- `page-chrome.css:135` `.btn{border-radius:2px}` → `var(--radius-btn)`
- `tool-page.css:72` `.btn{border-radius:12px}` → `var(--radius-btn)`; `:145` → `var(--radius-btn)`; `:152 .btn-secondary` → `var(--radius-btn)`
- `page-app.css:153 .btn-lg{border-radius:14px}` → `var(--radius-btn-lg)`; `:640 .btn-secondary` → `var(--radius-btn)`
- `intake.css .intake-cta{border-radius:9px}` → `var(--radius-btn-lg)`; `.intake-memory-action` → `var(--radius-btn)`; `.intake-error` (10px) → `var(--radius-btn)`
- `route-shell.css .route-button{border-radius:12px}` → `var(--radius-btn)`
- `.lampa-btn` (2px) → `var(--radius-btn)`

Ne diraj: `--radius-pill` (značke, `.intake-nav-help`, `.route-links a`), `--radius` 2px na `.intake-paper`, karticama nalaza i listovima.

**Provjera.** `grep -rn "border-radius" src --include=*.css | grep -i "btn\|button\|cta"` pokazuje samo `var(--radius-btn*)` ili `var(--radius-pill)`.

---

## Z3. `border-left` akcent na karticama → eyebrow boja + točka

**Problem.** Presuda nalaza nosi se obojenim lijevim rubom. Dizajn-sustav to zabranjuje (README, pravilo 3); referentni oblik je `design/result-finding-card.html`.

**Popis mjesta (sve `src/`):**
- `ui/results/result-visuals.css:165-169` `.cockpit-hero__copy` + 4 varijante tona
- `ui/results/result-visuals.css:394-401` `.cockpit-finding` + `--error/--warning/--info`
- `ui/results/result-visuals.css:782-794` `.outlook__tile` + `--auto/--assisted/--manual`
- `shared/page-app.css:601 .guarantee-note`, `:645 .result-guide` (i literal `#c9364f`), `:699 .repair-entry-recommended` (literali `#1a7a54`, `#f2f8f5`), `:705-707 .triage-item--*` (literali `#1a7a54`, `#d08b00`, `#246fb8`), `:874 .result-readiness`, `:1095 .ks-koment`, `:1231 .toast`, `:1315 .finding-card`, `:1460 .ap-nesigurno`, `:155/:373 .metric-jump`, `:465 .override-box`
- `preflight/preflight-panel.css:85,123`
- `shared/tool-page.css:258 .out-doc`

Ne diraj `border-left: 1px solid var(--line)` separatore (`.pv-mode`, `.wizard-col`, `result-visuals.css:861`, `page-app.css:1493`, `tool-page.css:90 .note`): to su razdjelnici, ne presuda.

**Rješenje (uzorak).** Za svaku karticu s tonom:
```css
.cockpit-finding{border:1px solid var(--paper-line);border-left-width:1px;padding-left:<vrati na simetričan padding>}
.cockpit-finding__eyebrow{display:inline-flex;align-items:center;gap:7px;font:500 11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase}
.cockpit-finding__eyebrow::before{content:"";width:7px;height:7px;border-radius:999px;background:currentColor}
.cockpit-finding--error .cockpit-finding__eyebrow{color:var(--red-on-soft)}
.cockpit-finding--warning .cockpit-finding__eyebrow{color:var(--warn-strong)}
.cockpit-finding--info .cockpit-finding__eyebrow{color:var(--scan)}
```
Ako kartica nema eyebrow element u markupu (`.toast`, `.ks-koment`, `.guarantee-note`), dodaj `<span class="…__eyebrow">` s postojećim statusom (npr. "Spremljeno", "Napomena") umjesto da ton nosi rub. `.metric-jump` i `.override-box` gube rub bez zamjene (nisu presuda). Literalne boje iz Z3 zamijeni tokenima (`#1a7a54`→`--pass`, `#d08b00`→`--warn`, `#246fb8`→`--scan`, `#c9364f`→`--red-deep`).

**Provjera.** `grep -rn "border-left" src --include=*.css` vraća samo 1px separatore.

---

## Z4. Skala razmaka kao tokeni

**Problem.** Ne postoji `--space-*`; padding/gap su literali (`.45rem`, `.7rem`, `8px`, `14px`, `24px`...).

**Rješenje.** U `design-system.css` dodaj:
```css
--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:24px;--space-6:32px;--space-7:48px;--space-8:64px;
```
Ovaj zadatak je **potvrda, ne migracija**: prije nego išta zamijeniš, izmjeri stvarnu distribuciju vrijednosti (`grep -rhoE "(gap|padding|margin)[^;]*" src --include=*.css | sort | uniq -c | sort -rn | head -40`) i ako se >70% poklapa sa skalom, uskladi `tokens.json` u `design/` i zamijeni literale u **samo** `intake.css` i `route-shell.css` (nove rute) kao pilot. `page-app.css` (176 KB) ne diraj u ovom prolazu. Ako se skala ne poklapa, javi izmjerene vrijednosti umjesto da mijenjaš.

---

## Z5. Tipografska ljestvica kao tokeni

**Problem.** Veličine su `clamp()` po komponenti; `design/tokens-typography.html` prikazuje ljestvicu sastavljenu ručno.

**Rješenje.** U `design-system.css` dodaj imenovane korake koji već postoje u `intake.css` i `result-visuals.css`:
```css
--fs-display:clamp(1.95rem,5.6vw,3.25rem);   /* .intake-title */
--fs-h2:clamp(1.8rem,4vw,2.7rem);            /* route directory h2 */
--fs-lead:clamp(1rem,1.75vw,1.16rem);        /* .intake-lead */
--fs-kicker:clamp(.84rem,1.7vw,.98rem);      /* .intake-kicker */
--fs-ui:.9rem; --fs-ui-sm:.82rem; --fs-ui-xs:.76rem;
--fs-mono-label:11px;                        /* eyebrow, rule kodovi */
```
Zamijeni literale u `intake.css` i `route-shell.css`. Isto pravilo kao Z4: pilot na novim rutama, `page-app.css` se ne dira. Nakon toga uskladi `design/tokens.json` `typography.scale` s tim imenima.

---

## Z6. Panel "Prilagodi prikaz"

**Referenca.** `design/state-display-settings.html` i README, odjeljak "Prilagodba prikaza".

**Rješenje.** Novi modul `src/shared/display-settings.ts` + `display-settings.css`, montiran na `/` i `/rad/` (gumb u navigaciji uz lampu). Panel je `<aside>` širine 440px koji klizne s desne strane (`transform`, poštuje `prefers-reduced-motion`). Kontrole i što postavljaju na `<html>`:
- Osvjetljenje: `data-theme="dark|light"` ili prati `prefers-color-scheme` (postojeći `lekta.theme` ključ; dodaj vrijednost `system`).
- Pismo za čitanje: `data-reading-font="default|serif|sans|dyslexic"` → preslika `--display-serif` (default Newsreader; serif = `Georgia, "Times New Roman"`; sans = `var(--ui)`; dyslexic = `"OpenDyslexic", "Atkinson Hyperlegible", var(--ui)`, bez učitavanja webfonta, `local()` only).
- Veličina teksta: `data-text-size="s|m|l"` → `html{font-size:15px|16px|18px}`.
- Gustoća: `data-density="compact|normal|airy"` → množitelj za `--space-*` iz Z4 (0.8 / 1 / 1.25).
- Pojačan kontrast: `data-contrast="high"` → `--paper-muted:#4A4438; --desk-muted:var(--desk-ink); --paper-line:#B8AE96`.
- Manje pokreta: `data-motion="reduce"` → isti CSS kao `@media (prefers-reduced-motion)`.
Sve u `localStorage` pod `lekta.display` (jedan JSON). Panel ne nudi izbor boja ni pomicanje elemenata (README pravilo).

**Provjera.** Svaka kombinacija prolazi `tests/a11y-css.test.ts`; posebno `high contrast + light`.

---

## Z7. Ulazni ekran `/` po novom predlošku

**Referenca.** `design/templates/intake/Intake.dc.html` (otvori u pregledniku; svi stilovi su inline, prepiši ih u `intake.css`).

**Što se mijenja u `index.html` + `intake.css`:**
- Papir dobiva zaglavlje obrasca (mono 11px: "Lekta · Ulazni list" / "Nº 0001 · Nepregledano", hairline ispod) i pečat "Čeka provjeru" (2.5px crveni okvir, rotate -9deg, gore desno). Broj lista može biti stvaran redni broj iz `moji-radovi` pohrane; ako nema, "Nº 0001".
- Naslov "Ubaci rad." raste na `clamp(40px,7vw,120px)`, line-height .92.
- Tri koraka NA papiru ispod CTA-a (01/02/03, mono broj u `--red-on-soft`, tekst 13px), odvojena hairlineom. Tekstovi su u predlošku, prepiši doslovno.
- Podnožje papira: "Dokument ostaje na uređaju" / "Provjeravamo formu, ne sadržaj" (zamjenjuje `.intake-brava`).
- CTA: radius `var(--radius-btn-lg)`, mono 14px, `letter-spacing:.02em`.

**Fontovi: ODLUČENO, opcija (a).** Instrument Serif (`--display-serif`), Geist Mono (`--ui` i `--mono`, isti font), Georgia ostaje `--font-doc`. Ukloni Newsreader, Inter Tight, IBM Plex Mono i Source Serif iz učitavanja. Instrument Serif ima samo 400 + kurziv: svaki `font-weight:500/600` na `--display-serif` postavi na 400. Prijašnji tekst odluke ostaje ispod radi konteksta: predložak koristi `Instrument Serif` (govor) + `Geist Mono` (oznake, gumb, UI). To odstupa od 4 glasa u `design-system.css` (Newsreader / Inter Tight / IBM Plex Mono). Dvije opcije:
- (a) zamijeniti obitelji na razini tokena (`--display-serif`, `--ui`, `--mono`) za cijeli proizvod; Instrument Serif nema optičke veličine ni težine osim 400, pa provjeri sve naslove koji koriste 500/600;
- (b) zadržati postojeće obitelji, a predložak preuzeti samo kao raspored.
Ne kreni u Z7 dok autor ne odabere (a) ili (b).

---

## Z8. Ekran `/rad/` kao vodič u 4 koraka

**Referenca.** `design/templates/results/Results.dc.html`; tweak `state` prebacuje 6 stanja (scanning, blocked, clear, plan, payment, done). Otvori u pregledniku i prepiši inline stilove u `result-visuals.css` (nove klase), stari kokpit ostaje dostupan iza `?resultRenderer=legacy` dok novi ne prođe testove.

**Informacijska arhitektura (što se mijenja u `results-cockpit.ts`):**
- Zaglavlje dobiva **stepper** `01 Nalazi · 02 Plan · 03 Plaćanje · 04 Rezultat` (mono pill, aktivan korak inverzan). Nema ga u stanju analize.
- **Jedan list presude** zamjenjuje `cockpit-header` + `cockpit-hero` + `cockpit-actions`: eyebrow (ime datoteke · profil · autoritet izvora), presuda kao H1 u display serifu, sažetak "N stvari traže tvoju pažnju" s tri točke po ozbiljnosti (postojeći `findingSummary`), redak "od toga N mogu popraviti automatski, automatika može doseći najviše M" (spaja `fsum-auto` i `repairOutlook.ceilingScore`), **jedan** primarni gumb "Napravi plan popravka" + tekstualna poveznica "Pregledaj nalaze". Prsten ocjene desno, 132px, conic-gradient, boja prstena = ton presude. Pečat presude dolje desno ispod prstena.
- **Stol** (`desk-mount`) ostaje 58/42, ali kartica nalaza je JEDNA s pagerom "Nalaz 1 od 6" (← →), a ne popis: eyebrow s točkom (Z3 oblik), naslov u serifu, redak izmjereno → pravilnik, citat izvora, gumbi "Uključi u plan" / "Zanemari".
- **DNA i kategorije** su dva mala lista u jednom redu ispod stola, sekundarni. `dna__bar` ostaje grid, boje po dominantnoj ozbiljnosti. Poveznica "Sve provjere (24)" zamjenjuje gumb "Detalji provjere" i otvara postojeći napredni panel.
- Uklanja se: `cockpit-actions` s tri gumba, `cockpit-authority` blok (tekst autoriteta ide u eyebrow), `repair-outlook` kao zasebna sekcija (jedna rečenica u sažetku).

**Tok popravka postaje 4 rute/stanja istog ekrana:**
1. `blocked`/`clear` (postojeće).
2. `plan`: `buildRepairPlan` već daje `sigurni / odluka / rucni`; prikaz je lista s checkboxovima (sigurni uključeni, odluke isključene s tekstom potvrde, ručni bez kontrole s razlogom) + sticky kartica narudžbe desno (cijena iz `data/packages.json`, "što radimo / što ne radimo" doslovno iz `design/result-repair-card.html`, gumb "Nastavi na plaćanje").
3. `payment`: lijevo tri koraka što slijedi, desno obrazac na listu (Stripe Elements u polja s istim stilom; polja `width:100%; box-sizing:border-box`).
4. `done`: `repairDoneModel` → "N od N zahvata primijenjena · 0 novih problema" (ili tekst o nepoznatom broju kad je `null`), tablica prije/poslije, prsten sa `71 → 88`, primarni "Preuzmi popravljeni .docx", sekundarni "Ponovno provjeri novu verziju".
- `scanning`: naslov "Čitam formu rada.", popis kategorija provjere koje se kvačaju (✓ / treperi / čeka), faksimil s crvenom linijom skeniranja (`transform` only, gasi se pod `prefers-reduced-motion`).

**Copy** je u predlošku; prepiši doslovno, hrvatski s dijakritikom, bez crtica.

**Provjera.** Snimke 6 stanja u obje teme; `tests/repair-plan.test.ts`, `repair-done.test.ts` prolaze bez izmjene (mijenja se samo prikaz).

---

## Z9. Faksimil dokumenta (korektorski stol)

**Referenca.** `design/templates/facsimile/Facsimile.dc.html`; tweakovi `layerNotes`, `layerDots`, `layerRulers`, `compare`.

**Stol (`desk-view.ts`, `desk-document.ts`, `render-facsimile`):**
- Lijevi pano ima rezerviran **žlijeb 210px desno od stranice** za bilješke; stranica je `width:calc(100% - 210px); box-sizing:border-box`. Bilješke NIKAD ne prelaze preko teksta ni preko klizača panoa.
- **Bilješke (zadani sloj):** kurziv display serifa u boji presude (crvena/jantarna/plava, isti parovi kao eyebrow), svaka s preciznom oznakom na mjestu greške i ravnom spojnom linijom (1px, 55 % alpha) do bilješke u žlijebu. Oblici oznaka po vrsti nalaza:
  - razmak redaka: zagrada visine dva retka na desnom rubu odlomka;
  - nedostajući broj naslova: ovalni okvir na mjestu broja, iznad njega upisan očekivani broj;
  - fusnota: zaokružena oznaka u tekstu;
  - margina (cijeli rad): zagrada preko lijeve margine u gornjem rubu stranice, linija do bilješke.
- **Točke (sloj):** numerirani krugovi 16px na samom lijevom rubu (2,5 %), broj = redni broj u redu čekanja.
- **Mjerne linije (sloj):** izmjereno crveno isprekidano, pravilnik zeleno isprekidano, brojke u cm mono 9px u rubovima.
- **Traka stranica** pod dokumentom: jedan stupac po stranici, točke boje presude iznad stranica s nalazom, trenutna stranica istaknuta; poruka "N nalaza vrijede za cijeli rad".
- **Alatna traka iznad dokumenta:** preklopnici slojeva (pill), broj stranice, zoom. Isti preklopnici i u panelu "Prilagodi prikaz" (Z6), spremaju se.
- **Prije / poslije (`compare`):** crveni pill; kad je uključen, preko SVAKE stranice legne "poslije" sloj (isti tekst, pravilnikom zadani font, prored, margine, numeracija naslova), rezan `clip-path: inset(0 0 0 X%)`, jedna ručica (34px, `--red`) zajednička svim stranicama, vuče se pointer eventima bilo gdje po panou; bilješke se u tom načinu sakrivaju. "Poslije" se gradi iz istog modela koji koristi popravak (deterministički), ne iz slike; ako popravak nije dostupan, pill se ne prikazuje.
- **Desni pano:** kartica jednog nalaza s pagerom "Nalaz N od M", gumbi "Uključi u plan" / "Pokaži u dokumentu" / "Zanemari"; **isječak pravilnika** kao `<figure>` (bijeli list, broj članka, rečenica na koju se nalaz poziva označena `<mark>`, poveznica "Otvori PDF" na `source.url` sa stranicom); ispod red čekanja (broj, točka, naslov, mjesto ili "cijeli rad").
- Klik na oznaku/bilješku/točku odabire taj nalaz u kartici (isti `data-desk-go`); "Pokaži u dokumentu" skrola pano na oznaku.
- Uski ekran: faksimil se ne crta (postojeće pravilo), ostaju kartica, red čekanja i traka stranica.

**Provjera.** Pri 900px širini nema vodoravnog klizača u panou; sve bilješke unutar `clientWidth`; `prefers-reduced-motion` gasi prijelaz klizača.

---

## Z10. Ekran "Moji radovi"

**Referenca.** `design/templates/my-works/MyWorks.dc.html`; tweakovi `share`, `empty`.

- Ruta `/moji-radovi/` čita postojeću lokalnu pohranu; nikakav podatak ne ide na server osim po izričitoj radnji dijeljenja.
- **Aktivni rad = veliki list:** eyebrow (profil, vrsta, zadnja provjera), naslov rada u display serifu, ime datoteke; **vremenska crta verzija** (čvorovi na hairlineu, ocjena u serifu, datum mono, presuda s točkom; zadnja verzija veća i tamna); gumbi "Otvori korektorski stol", "Podijeli s mentorom", poveznica "Ukloni s stola".
- **Kartica roka** (paper-2, rotirana 1°): "N dana" u serifu 44px, datum, preklopnik "Podsjeti me 3 dana prije" (postojeći `deadline-reminder-toggle.ts`), "Promijeni rok". Bez roka: "Dodaj rok".
- **Predani radovi = uži listovi** s ocjenom i "Otvori".
- **Dijeljenje s mentorom (dialog):** dva stupca "Mentor vidi / Mentor ne vidi" (doslovno iz predloška), poveznica s rokom 14 dana, Kopiraj, Poništi. Dijeli se isključivo `contentFreeMetadata` + popis nalaza; nikad tekst ni datoteka.
- **Prazno stanje:** jedan list "Još nema nijednog rada."
- NE prikazivati usporedbu s drugim radovima (nema podataka).

---

## Z11. Jedan cjenik, jedan izvor

**Referenca.** `design/templates/pricing/Pricing.dc.html` (tweakovi `personal`, `live`) i `design/pricing-card.html` (zamijeniti novim oblikom).

**Problem.** Tri neusklađena izvora cijene: `src/report/pricing.ts` (stvarna naplata: diplomski 9,99 €, doktorski 24,99 €, 14 dana ponovnih provjera), `src/config/pricing-tiers.ts` ("od 3,99 €" na `/saznaj-vise/`), `data/packages.json` (9/39/69/99 €, stari koncept; `config-loader.ts` ga još hidrira).

**Rješenje.**
- `pricing.ts` je jedini izvor; `pricing-tiers.ts` i `packages.json` se brišu (ili `packages.json` ostaje samo ako ga admin doista čita, uz komentar da NIJE cjenik). Popravi `config-loader.ts`.
- Cjenik (`/saznaj-vise/#cjenik` ili `/cjenik/`) se crta kao **račun na stolu** iz predloška: perforirani rub, stavke "Lokalna provjera forme 0,00" (uvijek) i "Popravak forme i puni izvještaj <cijena po vrsti rada>" (uključi/isključi), pod njom "Opseg · uključeno u cijenu" s redcima s točkastom linijom (zahvati bez cijene, izvještaj PDF, ponovne provjere 14 dana), ukupno u serifu, pečat "Ponovna provjera prije preuzimanja" uz ukupno (ne preko teksta), CTA mijenja natpis po stanju. Iznos NIKAD ne ovisi o broju odabranih zahvata (ista tvrdnja koju čuva ledger u `repair-price-slider.ts`).
- `personal`: kad postoji rezultat analize, račun se sastavlja iz njega (ime datoteke, vrsta rada iz profila, stvarni zahvati iz `buildRepairPlan`); bez rezultata je općenit s cijenama po vrsti rada.
- Dok je plaćeni sloj u soft launchu, gumb je "Uskoro" (onemogućen) s rečenicom "Provjera radi već sad, besplatno".
- **Institucija je pismo, ne kartica:** list u Georgiji s zaglavljem, tekst doslovno iz predloška, gumb "Zatraži ponudu" + e-adresa. Bez datuma u zaglavlju.
- Stari `.price-card` markup i CSS (`page-app.css:45, 1170-1182`, `learn-more/main.ts:48`) se uklanjaju.

**Provjera.** `grep -rn "3,99\|39 €\|69 €\|99 €" src data` vraća 0; jedan `priceEur` po vrsti rada.

---

## Z12. Stranica `/saznaj-vise/` kao svitak

**Referenca.** `design/templates/learn-more/LearnMore.dc.html`. Otvori u pregledniku; prepiši inline stilove u `src/routes/learn-more/learn-more.css`, logiku u `main.ts`. Zamjenjuje sadašnjih 8 sekcija i video.

**Struktura.** Jedan list papira (`min(960px,100%)`, perforacija gore, zaobljeni rub dolje) s 10 poglavlja. Svako poglavlje: `<section>` kao `flex-wrap` red, lijeva margina `flex:0 1 150px; position:sticky; top:24px` (broj u serifu 44px + naziv mono 11px uppercase), sadržaj `flex:1 1 480px`. Poglavlja 1–3 otvorena; 4–10 imaju gumb Otvori/Sklopi u zaglavlju, sklopljeno stanje pokazuje jedan redak "N stavki". Redoslijed i naslovi su u predlošku, prepiši doslovno.

**Izbor profila na vrhu** (ispod uvoda) je izvor podataka za cijeli svitak: dosje (1), brojke u demu (2), verdikti u registru (6), vrsta rada u cjeniku (7), primjer citata u priboru (8), sažetak na ulaznom listu (10). Profili dolaze iz stvarnog registra profila (`src/rules/` ili gdje je `profile registry`), ne iz predloška: predložak ima tri ogledna (FPZG diplomski, FFZG završni, EFZG seminarski). Odabir pamti `localStorage` `lekta.profile` i prenosi ga na `/` kao predodabrani profil.

**Interakcije po poglavlju** (svaka mora raditi bez JS-a barem kao statični prikaz):
1. Kako radi: tri lista s `animation-timeline: view()` ulaskom (fallback: bez animacije). Tekst koraka 2 uzima fakultet i citatni stil iz profila.
2. Živi demo: zamjenjuje `<video>`. Klik za start, petlja 8 s, `@keyframes` samo na `padding-left`, `row-gap`, `font-size` i `opacity` (nema layout thrash u tekstu); natpisi 01–03 i "Ponovna provjera" uzimaju brojke iz profila. Gasi se pod `prefers-reduced-motion`.
3. Podcrta: klik na problem podcrta mjesto (`lmDraw` širina 0→100%) i otisne komentar (`lmStamp`). Gumb "Popravi ovo, sigurno" primijeni ispravak na papir (umetne 3.1., doda zapis u literaturu, natpis tablice, pomakne marginu na vrijednost profila) i prekriži stavku; izjava o izvornosti je ručna i vodi na alat. Ovo je isti razred sigurni/ručni kao u `repair-plan.ts`; koristi iste oznake.
4. Privatnost: dokument se vuče `pointer` događajima; bez privole se odbije na granici (`transition: transform .45s cubic-bezier(.34,1.56,.64,1)`), uz ručni način prelazi i dobiva pečat. Brojač "poslano na internet" stoji na 0 B i skače tek kad dokument prijeđe granicu: veži ga na stvarni `fetch` sloj kad postoji.
5. Dokazi: 3×2 kartice, klik okreće (`lmFlip`), poleđina nosi izvor, datum provjere kao pečat i vezu. Datum dolazi iz `pokrivenost` podataka po profilu.
6. Registar: pretraga po nazivu/skupini/oznaci nad stvarnim popisom pravila (isti izvor koji puni `checkGrid`); predložak ima 24 ogledna. Dva polja "tvoja margina" i "tvoj prored" daju verdikt F-02/F-04 prema profilu prije učitavanja rada.
7. Cjenik: račun se ispiše red po red (`lmPrint` sa zakašnjenjima .1/.45/.8/1.15/1.5 s) pri promjeni vrste rada; redak "ručno bi trajalo" i kupon jamstva na dnu (hover ga "otkine"). Cijene i dani ponovnih provjera iz `data/packages.json` (Z11).
8. Pribor: šest listića na tamnoj podlozi, hover ih podigne. Brojač kartica ima živo polje (znakovi / 1800), citat generator pokazuje primjer u stilu profila.
9. FAQ: pitanja kao žute ceduljice (`#F3E6A8`, rotate -.4deg), odgovor se odlijepi (`lmPeel`). Pitanja 1 i 3 imaju "Zalijepi na ulazni list": rečenica ode na list u poglavlju 10.
10. Zadnja stavka: ulazni list upiše ime datoteke slovo po slovo kad uđe u vidno polje (`IntersectionObserver`, threshold .4), ispod profil, cijena, broj sigurnih zahvata iz 3 i zalijepljene ceduljice. Klik "Provjeri rad sada" nosi profil na `/`.

**Uklanja se.** `#video` sekcija i njezin player, `ks-priv-scena` s pečatima, `site-stats`, `landing_usporedba.html` i `landing_benchmark.html` iz navigacije.

**Provjera.** Snimke 10 poglavlja u obje teme, sklopljeno i otvoreno; `prefers-reduced-motion` gasi demo i sve `lm*` animacije; tipkovnica dolazi do svih gumba (ceduljice, kartice, koraci).

---

## Redoslijed i rizik (dopuna 4)
Z12 ovisi o Z11 (cijene) i o odluci o fontovima (Z7). Radi ga u četiri commita: svitak + margina + profil (1, 2, 10), podcrta i privatnost (3, 4), dokazi i registar (5, 6), cjenik, pribor, FAQ (7, 8, 9).

## Redoslijed i rizik (dopuna 3)
Z11 je neovisan o fontovima i može ići odmah nakon Z3.
Z9 ovisi o Z8 (nova kartica nalaza) i Z3 (oblik eyebrowa). Z10 je neovisan i mali. Redoslijed: Z1 → Z2 → Z3 → Z7 → Z8 → Z9 → Z10, pa Z4 → Z5 → Z6.

Nakon svakog zadatka snimi `/` i `/rad/` u obje teme i usporedi s `design/*.html`. Ako se neka razlika ne može riješiti bez promjene primitiva, zaustavi se i javi.
