# Ručne javne stranice, zajednički shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preseliti devet ručnih javnih stranica na isti lagani globalni shell, ukloniti stare ravne i hover navigacije te sačuvati svaki postojeći obrazac, izračun, kopiranje, uvoz, izvoz, reset, SEO podatak i privacy opis.

**Architecture:** Novi public-page entrypoint spaja već postojeći ui-boot stranice s route shellom iz Plana 1. Alatni entrypointi ga importiraju umjesto izravnog ui-boota, a sadržajne stranice ga koriste kao svoj module script. HTML zadržava statičke no-JS poveznice i sav feature markup. Link migracija koristi root-relative kanonska odredišta i eksplicitni analytics hook, bez ovisnosti o nestalom #analyzer fragmentu.

**Tech Stack:** Vite MPA, TypeScript strict, postojeći tool moduli, route shell, Vitest DOM i source contract testovi, Playwright i axe.

**Spec:** docs/superpowers/specs/2026-08-26-global-route-shell-navigation-design.md

## Global Constraints

- Raditi isključivo u istom izoliranom worktreeu feature/intake-first-live.
- Plan 1 mora biti zelen prije početka.
- Ne mijenjati domensku logiku citata, literature, brojanja, naslovnice, izjave, usporedbe ili benchmarka.
- Ne mijenjati ID-jeve formi, rezultata i gumba koje postojeći TypeScript koristi.
- Canonical, OG, Twitter, JSON-LD i FAQ sadržaj ostaju.
- Ne uvoditi drugi mobilni nav. Desktop i mobile koriste isti direktorij.
- Sticky mobile CTA "Provjeri rad" postoji samo na ovim content/tool stranicama.
- Nema kontinuirane animacije, novih mrežnih poziva ni promjene privacy tvrdnji.
- Prije commita obvezni su puni check, classification scan i git diff --check.

---

### Task 1: Zaključati funkcionalni paritet i markup granicu

**Files:**

- Create: tests/public-route-shell-markup.test.ts
- Modify: tests/ux/free-tools-pages.ts
- Verify: tests/citat-page.dom.test.ts
- Verify: tests/kartice-page.test.ts
- Verify: tests/kartice-page-guard.dom.test.ts
- Verify: tests/kartice-page-extras.dom.test.ts
- Verify: tests/naslovnica-page.dom.test.ts
- Verify: tests/literatura-page.dom.test.ts
- Verify: tests/izjava-page.dom.test.ts
- Verify: tests/tool-analytics.test.ts

**Target pages:**

- alati.html
- citat.html
- kartice.html
- naslovnica.html
- literatura.html
- izjava.html
- citati-i-literatura.html
- landing_usporedba.html
- landing_benchmark.html

- [ ] **Step 1: Inventory live controls before changing markup**

U test tablicu upisati entrypoint i stabilne feature hookove svake stranice. Za alatne forme asertirati njihove postojeće input, result, copy, export i reset ID-jeve. Za usporedbu i benchmark asertirati glavne tablice, dokazne izvore i CTA odredišta. Ovo je paritetni ugovor, ne samo popis linkova.

- [ ] **Step 2: Add failing shell markup tests**

Za svih devet HTML datoteka očekivati:

- route-header i data-route-directory-button
- statičke / i /moji-radovi/ linkove
- body data-public-route-id
- točno jedan module entrypoint
- bez header.topbar, .mobile-nav i hover-only .nav-tools-menu markupa
- bez document-relative .html hrefova
- bez index.html#analyzer, #how, #checks, #pricing ili #faq

Istodobno dokazati da feature hookovi iz Step 1 ostaju.

- [ ] **Step 3: Run RED**

Run:

~~~bash
npx vitest run tests/public-route-shell-markup.test.ts tests/citat-page.dom.test.ts tests/kartice-page.test.ts tests/kartice-page-guard.dom.test.ts tests/kartice-page-extras.dom.test.ts tests/naslovnica-page.dom.test.ts tests/literatura-page.dom.test.ts tests/izjava-page.dom.test.ts
~~~

Expected: novi shell test pada, postojeći behavior testovi ostaju zeleni.

---

### Task 2: Jedan public-page entrypoint bez gubitka feature boota

**Files:**

- Create: src/routes/public-page/main.ts
- Create: src/routes/public-page/public-page.css
- Modify: src/tools/citat-page.ts
- Modify: src/tools/kartice-page.ts
- Modify: src/tools/naslovnica-page.ts
- Modify: src/tools/literatura-page.ts
- Modify: src/tools/izjava-page.ts
- Modify: tests/public-route-shell-markup.test.ts
- Modify: tests/ui-app-smoke.test.ts

**Interface:**

~~~ts
export interface PublicPageDataset {
  readonly publicRouteId: string;
}
export function mountPublicPage(doc: Document): void;
~~~

main.ts mora importirati postojeći shared/ui-boot radi fontova, ikona, teme i lokalnih vizualnih poboljšanja, zatim mountati route shell s variant content i privacySettingsAvailable false. current dolazi isključivo iz body.dataset.publicRouteId, uz fail-fast provjeru isPublicRouteId.

- [ ] **Step 1: Write a failing entrypoint boundary test**

Dokazati da svaka alatna stranica učitava ui-boot točno jednom preko public-page entrypointa. Zabraniti import analize, profila i repaira iz samog public-page/main.ts. Tool entrypoint smije zadržati svoj postojeći feature graf.

- [ ] **Step 2: Run RED**

Run: npx vitest run tests/public-route-shell-markup.test.ts tests/ui-app-smoke.test.ts

- [ ] **Step 3: Implement entrypoint and replace imports**

Specifični tool moduli mijenjaju samo prvi side-effect import:

~~~ts
import '../routes/public-page/main';
~~~

Stranice koje su prije izravno učitavale /src/shared/ui-boot.ts sada učitavaju /src/routes/public-page/main.ts. Ne dodavati paralelni drugi module script.

- [ ] **Step 4: Run GREEN**

Run:

~~~bash
npx vitest run tests/public-route-shell-markup.test.ts tests/citat-page.dom.test.ts tests/kartice-page.test.ts tests/kartice-page-guard.dom.test.ts tests/kartice-page-extras.dom.test.ts tests/naslovnica-page.dom.test.ts tests/literatura-page.dom.test.ts tests/izjava-page.dom.test.ts tests/ui-app-smoke.test.ts
~~~

Expected: PASS.

---

### Task 3: Zamijeniti stari chrome na devet stranica

**Files:**

- Modify: svih devet ciljnih HTML datoteka
- Modify: src/ui/modal-utils.ts
- Modify: tests/modal-inert.test.ts
- Modify: tests/public-route-shell-markup.test.ts

**Route IDs:**

- alati.html: all-tools
- citat.html: citation-generator
- kartice.html: card-counter
- naslovnica.html: title-page
- literatura.html: bibliography
- izjava.html: declaration
- citati-i-literatura.html: citation-audit
- landing_usporedba.html: comparison
- landing_benchmark.html: benchmark

- [ ] **Step 1: Replace only header, mobile nav and footer chrome**

U svakoj datoteci umetnuti isti statički content header iz Plana 1, data-route-directory-layer i no-JS footer mapu. Ukloniti stari topbar, mobile-nav i nav-tools markup. Sav main sadržaj, obrasci, JSON-LD i lokalni modal markup ostaju na istom mjestu.

- [ ] **Step 2: Remove only dead chrome CSS**

U inline style blokovima ukloniti selektore koji služe isključivo starom topbaru, mobilnom navu i hover dropdownu. Ne mijenjati feature CSS. public-page.css daje sticky mobile CTA i content variant razmake.

- [ ] **Step 3: Preserve modal isolation**

modal-utils mora inertirati .route-header uz main i footer. Test prvo mora pasti na starom selectoru header.topbar, zatim proći uz novu kompatibilnu listu. Ako neka stranica još izvan ovog plana koristi topbar, podržati oba selektora dok i ona ne bude migrirana.

- [ ] **Step 4: Run markup and modal tests**

Run: npx vitest run tests/public-route-shell-markup.test.ts tests/modal-inert.test.ts

Expected: PASS.

---

### Task 4: Kanonska link migracija i analytics semantika

**Files:**

- Modify: svih devet ciljnih HTML datoteka
- Modify: src/tools/tool-analytics.ts
- Modify: src/tools/citat-page.ts
- Modify: src/tools/naslovnica-page.ts
- Modify: tests/tool-analytics.test.ts
- Modify: tests/citat-page.dom.test.ts
- Modify: tests/naslovnica-page.dom.test.ts
- Modify: tests/analyzer-workspace-comparison.test.ts
- Modify: tests/ux/free-tools-pages.ts

**Canonical mapping:**

- index.html#analyzer i /#analyzer postaju /
- #how postaje /saznaj-vise/#how
- #checks postaje /saznaj-vise/#checks
- #pricing postaje /saznaj-vise/#pricing
- #faq postaje /saznaj-vise/#faq

CTA koji vodi na provjeru dobiva data-tool-analyzer-link. tool-analytics više ne traži substring #analyzer, nego delegirano hvata taj data atribut. UTM query parametri smiju ostati na root URL-u.

- [ ] **Step 1: Write failing link and analytics tests**

Dokazati da klik na data-tool-analyzer-link šalje tool_to_analyzer_click samo uz postojeću privolu. Običan root link ili paket link ne šalje taj event. DOM testovi citata i naslovnice očekuju root-relative URL, uz postojeći fakultetski query gdje ga odredište još može konzumirati.

- [ ] **Step 2: Run RED**

Run: npx vitest run tests/tool-analytics.test.ts tests/citat-page.dom.test.ts tests/naslovnica-page.dom.test.ts tests/analyzer-workspace-comparison.test.ts

- [ ] **Step 3: Apply the mapping**

Koristiti root-relative linkove. Ne ostavljati privremeni disabled link. Ako query parametar više nema dokazivog potrošača na rootu, ukloniti ga umjesto lažne pretpostavke. Ne dirati analytics payload, consent gate ili event naziv.

- [ ] **Step 4: Run GREEN and scan**

Run:

~~~bash
npx vitest run tests/tool-analytics.test.ts tests/citat-page.dom.test.ts tests/naslovnica-page.dom.test.ts tests/analyzer-workspace-comparison.test.ts
rg -n "(index\.html|/)?#(analyzer|how|checks|pricing|faq)" alati.html citat.html kartice.html naslovnica.html literatura.html izjava.html citati-i-literatura.html landing_usporedba.html landing_benchmark.html src/tools
~~~

Expected: testovi prolaze, rg nema ciljnih legacy odredišta.

---

### Task 5: Responsive, accessibility i stvarni feature paritet

**Files:**

- Modify: tests/ux/free-tools-pages.ts
- Create: tests/ux/public-route-shell.spec.ts
- Verify: svih devet ciljnih ruta

- [ ] **Step 1: Add failing browser coverage**

Za svaku stranicu otvoriti panel Sve, provjeriti aktivno odredište, zatvoriti ga tipkovnicom i aktivirati glavni feature. Na alatima izvršiti najmanje jedan stvarni input do rezultata, copy ili export radnju te reset. Na landing dokaznim stranicama provjeriti tablicu/izvore i CTA prema /.

- [ ] **Step 2: Verify mobile rules**

Na 390 x 844 postoji jedan sticky CTA Provjeri rad. Na rootu, /rad/ i /moji-radovi/ taj CTA ne postoji. Na 320 px nema overflowa. axe nema novih critical ili serious nalaza.

- [ ] **Step 3: Run browser tests**

Run:

~~~bash
npx playwright test tests/ux/public-route-shell.spec.ts tests/ux/free-tools-audit.spec.ts --workers=1 --reporter=line
~~~

Expected: PASS bez regresije formi i navigacije.

---

### Task 6: Završni gate Plana 2

- [ ] **Step 1: Run all tool behavior tests**

Run:

~~~bash
npx vitest run tests/public-route-shell-markup.test.ts tests/tool-analytics.test.ts tests/citat-page.dom.test.ts tests/kartice-page.test.ts tests/kartice-page-guard.dom.test.ts tests/kartice-page-extras.dom.test.ts tests/naslovnica-page.dom.test.ts tests/literatura-page.dom.test.ts tests/izjava-page.dom.test.ts tests/modal-inert.test.ts tests/analyzer-workspace-comparison.test.ts
~~~

- [ ] **Step 2: Run hard gate**

~~~bash
npm run check
node scripts/verify-dist-classification.mjs
git diff --check
~~~

- [ ] **Step 3: Inspect built HTML**

Provjeriti svih devet dist stranica: jedan module entry, netaknuti canonical i JSON-LD, novi shell, bez legacy root fragmenata i bez dupliciranog mobilnog nav sustava.

- [ ] **Step 4: Commit after scoped diff review**

Ponoviti git diff --stat samo nad ciljnim HTML, public-page, tool i test putanjama. Commit message: feat: unify manual public page navigation.

Ne spajati u master, ne pushati i ne deployati u ovom planu.
