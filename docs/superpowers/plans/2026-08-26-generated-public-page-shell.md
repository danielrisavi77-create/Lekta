# Generirane, dokazne i pravne stranice, zajednički shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ugraditi isti javni direktorij i vizualni shell u generirane fakultetske, citatne, naslovničke, coverage i pravne stranice, bez gubitka no-JS sadržaja, breadcrumbova, canonicala, JSON-LD-a, CSP-a ili honesty gateova.

**Architecture:** Jedan Node renderer čita isti public-route-directory.json kao browser shell i emitira statički header, panel mount i footer. Jedan esbuild korak nakon Vite builda proizvodi fiksne same-origin assete dist/assets/lekta-route-shell.js i .css iz tipiziranog browser entrypointa. Svi generatori koriste renderer i te vanjske assete, pa pravne stranice i dalje nemaju inline izvršnu skriptu. Build redoslijed izričito generira assete prije HTML generatora.

**Tech Stack:** Node ESM generatori, esbuild, Vite post-build lanac, TypeScript route shell, Vitest generator i CSP testovi, deploy artifact verifier.

**Spec:** docs/superpowers/specs/2026-08-26-global-route-shell-navigation-design.md

## Global Constraints

- Raditi isključivo u istom izoliranom worktreeu feature/intake-first-live.
- Planovi 1 i 2 moraju biti zeleni.
- Generatori čitaju kanonski JSON, ne održavaju vlastite popise odredišta.
- Ne mijenjati verified profile, citation spec, title-page template, coverage ili legal sadržajne podatke.
- Ne smije nestati nijedan breadcrumb, canonical, OG, Twitter, JSON-LD, noindex ili sitemap signal.
- Nema inline izvršne skripte. Vanjski same-origin ESM asset mora zadovoljiti postojeći CSP.
- Svaka pojedinačna generator naredba mora ostati upotrebljiva izvan Netlify lanca.
- Generated shell asset nema auth, analysis, profile, repair, history ili payment import.
- Prije commita obvezni su npm run check, puni generator lanac, deploy verifier, classification scan i git diff --check.

---

### Task 1: Zajednički Node renderer i fiksni browser asseti

**Files:**

- Create: scripts/public-route-shell.mjs
- Create: scripts/generate-public-route-shell-assets.mjs
- Create: src/routes/generated/main.ts
- Create: tests/generated-route-shell.test.ts
- Modify: package.json
- Modify: netlify.toml
- Modify: vite.config.ts

**Node interface:**

~~~js
export function loadPublicRouteDirectory(rootDir) {}
export function renderPublicRouteHeader(options) {}
export function renderPublicRouteFooter() {}
export function publicRouteShellHeadAssets() {}
export function publicRouteShellBodyAsset() {}
~~~

**Browser interface:**

~~~ts
const current = document.body.dataset.publicRouteId;
mountRouteShell(document, {
  current,
  variant: 'content',
  privacySettingsAvailable: false,
});
~~~

- [ ] **Step 1: Write failing renderer tests**

Test koristi privremeni PUBLIC manifest fixture i očekuje iste četiri skupine i redoslijed kao TypeScript selektor. Provjeriti HTML escaping labela, root-relative hrefove, statičke Nova provjera i Moji radovi linkove, data-route-directory-layer te izostavljanje personal-space odredišta.

- [ ] **Step 2: Write failing asset tests**

Pokrenuti generate-public-route-shell-assets s injektabilnim outdir argumentom. Očekivati točno lekta-route-shell.js i lekta-route-shell.css, bez hash drift-a. Gzip granice ostaju 8 KB JS i 12 KB CSS. Metafile ne smije sadržavati feature module uzorke iz Plana 1.

- [ ] **Step 3: Run RED**

Run: npx vitest run tests/generated-route-shell.test.ts

Expected: FAIL jer renderer i asset generator ne postoje.

- [ ] **Step 4: Implement renderer and esbuild command**

Renderer čita src/routes/shared/public-route-directory.json preko fs-a, radi jednaku fail-fast strukturnu provjeru i generira samo statički chrome. Ne importira TypeScript ni privatne podatke.

esbuild koristi:

~~~js
{
  entryPoints: { 'lekta-route-shell': 'src/routes/generated/main.ts' },
  outdir: 'dist/assets',
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2022',
  entryNames: '[name]',
  assetNames: '[name]',
}
~~~

- [ ] **Step 5: Wire build order**

Dodati package script generate-route-shell-assets. U netlify.toml ide odmah nakon npm run build i prije svih HTML generatora.

Vite citationTools dev i preview put prije generate-citation-tools pokreće isti asset generator. serveGenerated uz postojeći HTML i XML mora iz dist/ posluživati /assets/lekta-route-shell.js kao text/javascript; charset=utf-8 i /assets/lekta-route-shell.css kao text/css; charset=utf-8. Watcher uključuje manifest, route-shell.ts, route-shell.css i generated main entrypoint.

U završnom browser testu otvoriti jednu generiranu citatnu stranicu preko Vite localhosta, potvrditi status 200 za oba asseta i otvoriti panel. Time se hvata slučaj u kojem produkcijski build radi, a dev stranica ostaje bez ponašanja ili stila.

- [ ] **Step 6: Run GREEN**

Run: npx vitest run tests/generated-route-shell.test.ts tests/route-shell-budget.test.ts

Expected: PASS.

---

### Task 2: Citatne stranice i generirani brojač kartica

**Files:**

- Modify: scripts/generate-citation-tools.mjs
- Modify: tests/generate-citation-tools-csp.test.ts
- Modify: tests/generate-citation-tools-seo-claims.test.ts
- Modify: tests/generate-citation-tools-brojac.test.ts
- Modify: tests/citation-tools-effective-rules.test.ts

**Routes:**

- /alati/citati/
- /alati/citati/*.html
- /alati/brojac-kartica.html

- [ ] **Step 1: Add failing generator assertions**

Generirani HTML mora sadržavati novi statički header, body data-public-route-id, direktorij mount, CSS asset i module JS asset. Index i pojedinačne citatne stranice koriste citation-generator kao aktivno odredište, brojač koristi card-counter.

Istodobno asertirati postojeće tool forme, faculty picker, generated config, canonical, JSON-LD, OG, Twitter, robots i sitemap ponašanje.

- [ ] **Step 2: Run RED**

Run:

~~~bash
npx vitest run tests/generate-citation-tools-csp.test.ts tests/generate-citation-tools-seo-claims.test.ts tests/generate-citation-tools-brojac.test.ts tests/citation-tools-effective-rules.test.ts
~~~

- [ ] **Step 3: Replace only generator chrome**

pageShell i buildCharCounterHtml koriste public-route-shell renderer. Zadržati citation-tool.js, brojac-kartica.js, citation-style.css, inertni config JSON i cijeli feature markup. Ne inlineati route shell bundle niti config kao izvršnu skriptu.

- [ ] **Step 4: Generate and run GREEN**

~~~bash
npm run generate-route-shell-assets
npm run generate-citation-tools
npx vitest run tests/generate-citation-tools-csp.test.ts tests/generate-citation-tools-seo-claims.test.ts tests/generate-citation-tools-brojac.test.ts tests/citation-tools-effective-rules.test.ts
~~~

Expected: PASS.

---

### Task 3: Fakultetske i naslovničke generirane stranice

**Files:**

- Modify: scripts/generate-faculty-pages.mjs
- Modify: scripts/generate-title-page-tools.mjs
- Modify: tests/generate-faculty-pages.test.ts
- Modify: tests/faculty-page-razina-slug-drift.test.ts
- Modify: tests/generate-title-page-tools-csp.test.ts
- Modify: tests/generate-title-page-tools-honesty-gate.test.ts
- Modify: tests/generate-title-page-tools-seo-claims.test.ts

**Routes:**

- /fakulteti/
- fakultetske i work-type stranice koje generator emitira
- /alati/naslovnica/
- /alati/naslovnica/*.html

- [ ] **Step 1: Add failing shell plus honesty assertions**

Fakultetske stranice koriste faculty-rules route ID, naslovničke title-page. Novi shell mora koegzistirati s postojećim breadcrumbom. Testovi i dalje dokazuju:

- svaka kataloška jedinica je vidljiva na hubu
- work-type slugovi ostaju kanonski
- samo official naslovnički predlošci dobivaju javnu stranicu
- noindex i sitemap odluke ostaju
- dokazni izvor i verified date ostaju vidljivi
- cross-link prema citatnom alatu stvarno postoji

- [ ] **Step 2: Run RED**

Run:

~~~bash
npx vitest run tests/generate-faculty-pages.test.ts tests/faculty-page-razina-slug-drift.test.ts tests/generate-title-page-tools-csp.test.ts tests/generate-title-page-tools-honesty-gate.test.ts tests/generate-title-page-tools-seo-claims.test.ts
~~~

- [ ] **Step 3: Integrate renderer**

Zamijeniti samo globalni header/footer i dodati asset reference. Lokalni breadcrumb, search, faculty status, source cards, title-page forma i postojeći JS asseti ostaju.

Svi CTA-ovi prema nestalom #analyzer postaju root-relative /. Query unit i work zadržati samo gdje root-to-workspace handoff ima ponašajni test.

- [ ] **Step 4: Generate and run GREEN**

~~~bash
npm run generate-route-shell-assets
npm run generate-faculty-pages
npm run generate-title-page-tools
npx vitest run tests/generate-faculty-pages.test.ts tests/faculty-page-razina-slug-drift.test.ts tests/generate-title-page-tools-csp.test.ts tests/generate-title-page-tools-honesty-gate.test.ts tests/generate-title-page-tools-seo-claims.test.ts
~~~

Expected: PASS.

---

### Task 4: Pokrivenost i pravne stranice

**Files:**

- Modify: scripts/generate-coverage-page.mjs
- Modify: scripts/generate-legal-pages.mjs
- Modify: tests/coverage-page-claims.test.ts
- Modify: tests/deploy-gate-legal.test.ts
- Modify: tests/legal-content.test.ts
- Modify: tests/no-inline-chrome-script.test.ts

**Routes:**

- /pokrivenost.html
- /privatnost.html
- /obrada-dokumenata.html
- /uvjeti-koristenja.html
- /pravila-povrata.html
- /odricanje-od-odgovornosti.html
- /garancija.html i ostali slugovi iz legal-contenta

- [ ] **Step 1: Add failing output tests**

Coverage koristi coverage route ID. Pravne stranice koriste odredište koje odgovara slugu ili neutralni legal-content ID. Provjeriti novi shell, postojeći uski editorial layout, puni no-JS tekst, canonical i legal cross-nav.

no-inline-chrome-script test mora i dalje dokazivati nula izvršnih inline scriptova. Dopušteni su samo application/ld+json i vanjski module src.

- [ ] **Step 2: Run RED**

Run: npx vitest run tests/coverage-page-claims.test.ts tests/deploy-gate-legal.test.ts tests/legal-content.test.ts tests/no-inline-chrome-script.test.ts

- [ ] **Step 3: Integrate renderer without changing claims**

Coverage tablica, statusne klase i pošteni coverage copy ostaju. Legal body dolazi isključivo iz src/legal/legal-content.ts i provider podataka. Route shell renderer ne smije preoblikovati niti skraćivati pravni tekst.

- [ ] **Step 4: Generate and run GREEN**

~~~bash
npm run generate-route-shell-assets
npm run generate-coverage-page
npm run generate-legal-pages
npx vitest run tests/coverage-page-claims.test.ts tests/deploy-gate-legal.test.ts tests/legal-content.test.ts tests/no-inline-chrome-script.test.ts
~~~

Expected: PASS.

---

### Task 5: Globalni link i deploy artifact gate

**Files:**

- Modify: scripts/verify-deploy-dist.mjs
- Modify: scripts/generate-competitor-pages.mjs
- Create: tests/generated-public-link-contract.test.ts
- Modify: public/_headers only if the existing CSP test proves the external module asset is blocked

- [ ] **Step 1: Write a failing source and output scanner**

Skenirati javne ručne HTML datoteke i izvore generatora. Zabraniti index.html#analyzer, /#analyzer, /#how, /#checks, /#pricing i /#faq. Skenirati dist generated HTML i očekivati route shell assete, statičke no-JS linkove te nijedan admin, verification ili QA href.

- [ ] **Step 2: Update remaining generator links**

generate-competitor-pages nije u shell migraciji ovog plana, ali njegovi legacy analyzer linkovi moraju postati /. Ne mijenjati competitor facts ili dokazne claimove.

- [ ] **Step 3: Extend deploy verifier**

Za citatne, title-page, fakultetske, coverage i legal stranice provjeriti:

- /assets/lekta-route-shell.js i .css postoje
- svaka ciljna stranica ih referencira
- CSP dopušta vanjski same-origin module bez unsafe-inline
- canonical, JSON-LD, breadcrumb i postojeći honesty marker ostaju
- nema mrtvih public route hrefova

- [ ] **Step 4: Run full production artifact chain**

~~~bash
npm run build
npm run generate-route-shell-assets
npm run generate-citation-tools
npm run generate-legal-pages
npm run generate-coverage-page
npm run generate-faculty-pages
npm run generate-title-page-tools
npm run generate-competitor-pages
node scripts/verify-deploy-dist.mjs
node scripts/verify-dist-classification.mjs
~~~

Expected: PASS i čist artifact scan.

---

### Task 6: Završni gate Plana 3

- [ ] **Step 1: Run focused generator suite**

~~~bash
npx vitest run tests/generated-route-shell.test.ts tests/generated-public-link-contract.test.ts tests/generate-citation-tools-csp.test.ts tests/generate-citation-tools-seo-claims.test.ts tests/generate-citation-tools-brojac.test.ts tests/generate-faculty-pages.test.ts tests/faculty-page-razina-slug-drift.test.ts tests/generate-title-page-tools-csp.test.ts tests/generate-title-page-tools-honesty-gate.test.ts tests/generate-title-page-tools-seo-claims.test.ts tests/coverage-page-claims.test.ts tests/deploy-gate-legal.test.ts tests/legal-content.test.ts tests/no-inline-chrome-script.test.ts
~~~

- [ ] **Step 2: Run hard gate and artifact chain**

Run npm run check, zatim cijeli lanac iz Taska 5 i git diff --check.

- [ ] **Step 3: Inspect representative output**

Vizualno i tipkovnicom provjeriti jedan faculty hub, jednu pojedinačnu faculty stranicu, jedan citation tool, jednu title-page stranicu, coverage i svaku vrstu legal layouta na 1200, 390 i 320 px.

- [ ] **Step 4: Commit after scoped diff review**

Ponoviti git diff --stat samo nad generatorima, generated route entryjem, build konfiguracijom i njihovim testovima. Commit message: feat: unify generated public page navigation.

Ne spajati u master, ne pushati i ne deployati u ovom planu.
