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

## Z2. Radiusi gumba: 8px (default), 10px (veliki)

**Problem.** Gumbi imaju 2px (`page-chrome.css:135`, `tool-page.css:145,152`, `page-app.css:640`), 9px (`intake.css .intake-cta`), 12px (`route-shell.css .route-button`, `tool-page.css:72`), 14px (`page-app.css:153 .btn-lg`). 2px ostaje isključivo za papir.

**Rješenje.** U `design-system.css` dodaj dva tokena uz postojeće radiuse (jedina dopuštena izmjena primitiva u ovom paketu):
```css
--radius-btn: 8px;
--radius-btn-lg: 10px;
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

**Fontovi (ODLUKA ZA AUTORA, ne implementiraj sam):** predložak koristi `Instrument Serif` (govor) + `Geist Mono` (oznake, gumb, UI). To odstupa od 4 glasa u `design-system.css` (Newsreader / Inter Tight / IBM Plex Mono). Dvije opcije:
- (a) zamijeniti obitelji na razini tokena (`--display-serif`, `--ui`, `--mono`) za cijeli proizvod; Instrument Serif nema optičke veličine ni težine osim 400, pa provjeri sve naslove koji koriste 500/600;
- (b) zadržati postojeće obitelji, a predložak preuzeti samo kao raspored.
Ne kreni u Z7 dok autor ne odabere (a) ili (b).

---

## Redoslijed i rizik
Z1 → Z2 → Z3 (vidljive promjene, niski rizik jer sve idu na postojeće primitive). Z4 i Z5 su tokenizacija bez vizualne promjene; radi ih zadnje i samo na pilotu. Z6 ovisi o Z4 (gustoća). Z7 čeka odluku o fontovima.

Nakon svakog zadatka snimi `/` i `/rad/` u obje teme i usporedi s `design/*.html`. Ako se neka razlika ne može riješiti bez promjene primitiva, zaustavi se i javi.
