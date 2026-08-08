# Analyzer workspace, five visual variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodati pet vizualnih varijanti istog upload-first analyzer demoa i galeriju za njihovu usporedbu.

**Architecture:** Jedan HTML i TypeScript demo ostaju izvor sadržaja i ponašanja. Query parametar postavlja naziv varijante, a CSS scoped tokeni mijenjaju samo vizualni sloj. Galerija učitava pet iframeova i ne uvodi novu poslovnu logiku.

**Tech Stack:** Vite static HTML, TypeScript DOM glue, CSS custom properties, Vitest contract test, Playwright i axe.

## Global Constraints

- Live `index.html` i `src/ui/app.ts` ne mijenjaju se.
- Ne mijenjaju se parser, analiza, pravila ni citation engine.
- Sve varijante koriste iste demo podatke i isti upload-first tok.
- Sve animacije poštuju `prefers-reduced-motion`.
- Hrvatski tekst koristi dijakritiku i nema em ili en crtice.

### Task 1: Zaključati galerijski i query ugovor

**Files:**
- Create: `prototype/analyzer-workspace-variants.html`
- Modify: `prototype/analyzer-workspace-demo.html`
- Modify: `tests/analyzer-workspace-five-variants.test.ts`

- [ ] **Step 1: Write the failing test**

Test treba zahtijevati galerijski marker, točno pet iframeova, pet query naziva i `data-demo-variant` hook na demo mainu.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analyzer-workspace-five-variants.test.ts`

Expected: FAIL jer galerija i query hook još ne postoje.

- [ ] **Step 3: Add minimal HTML contract**

Dodati galeriju s nazivima `editorial`, `blueprint`, `magazine`, `cockpit`, `tactile`, a demo mainu dodati stabilan `data-demo-variant` fallback.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/analyzer-workspace-five-variants.test.ts`

Expected: PASS.

### Task 2: Implementirati query-based varijantni sloj

**Files:**
- Modify: `prototype/analyzer-workspace-demo.ts`
- Modify: `prototype/analyzer-workspace-demo.css`

- [ ] **Step 1: Write the failing browser assertions**

Test treba učitati svih pet query URL-ova i provjeriti da svaki ima očekivani `data-demo-variant`, vidljiv upload, skriven kontekst na početku i rezultat nakon pokretanja.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/ux/analyzer-workspace-five-variants.spec.ts`

Expected: FAIL jer TypeScript još ne čita query parametar, a CSS nema varijantne tokene.

- [ ] **Step 3: Implement minimal variant resolver**

Uvesti whitelist tip `DemoVariant`, čitati `new URLSearchParams(location.search).get('variant')`, koristiti `editorial` kao fallback i postaviti `demoSurface.dataset.demoVariant`.

- [ ] **Step 4: Add scoped visual tokens**

Dodati overridee pod `[data-demo-variant="..."]` za pozadinu, papir, ink, red, blue, line, shadow i dekorativni treatment. Ne kopirati sadržajni markup po varijanti.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx playwright test tests/ux/analyzer-workspace-five-variants.spec.ts`

Expected: PASS za svih pet varijanti.

### Task 3: Browser accessibility i responsive galerija

**Files:**
- Create: `tests/ux/analyzer-workspace-five-variants.spec.ts`
- Modify: `prototype/analyzer-workspace-variants.html`
- Modify: `prototype/analyzer-workspace-demo.css`

- [ ] **Step 1: Write the failing gallery audit**

Provjeriti da galerija prikazuje pet panela, da na mobitelu nema overflowa i da axe nema critical ili serious probleme. Axe za galerijski wrapper mora isključiti iframe sadržaj jer se pojedinačni demoi auditiraju zasebno.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/ux/analyzer-workspace-five-variants.spec.ts`

Expected: FAIL dok galerija i responsive CSS nisu dovršeni.

- [ ] **Step 3: Implement gallery shell**

Dodati naslov, legendu, pet označenih panela, link za otvaranje pojedinačnog demoa i responsive grid koji prelazi u jednu kolonu ispod 900 px.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/ux/analyzer-workspace-five-variants.spec.ts`

Expected: PASS.

### Task 4: Završna provjera

**Files:**
- Verify: `prototype/analyzer-workspace-demo.html`
- Verify: `prototype/analyzer-workspace-demo.css`
- Verify: `prototype/analyzer-workspace-demo.ts`
- Verify: `prototype/analyzer-workspace-variants.html`
- Verify: `tests/analyzer-workspace-five-variants.test.ts`
- Verify: `tests/ux/analyzer-workspace-five-variants.spec.ts`

- [ ] **Step 1: Run focused contract test**

Run: `npx vitest run tests/analyzer-workspace-five-variants.test.ts`

- [ ] **Step 2: Run typecheck and build**

Run: `npx tsc --noEmit` and `npm run build`

- [ ] **Step 3: Run localhost smoke check**

Open: `http://localhost:5173/prototype/analyzer-workspace-variants.html`

Provjeriti pet smjerova, upload-first stanje, prijelaz u rezultat, mobile prikaz i reduced-motion.
