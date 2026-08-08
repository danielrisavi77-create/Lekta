# Analyzer workspace, upload-first demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preoblikovati izolirani analyzer workspace demo tako da upload bude prvi korak, a profil, obrada i rezultat ostanu u istom kompaktnom panelu.

**Architecture:** Demo ostaje samostalan u `prototype/`, bez promjene live analyzer logike. HTML daje početno, učitano, obrađeno i rezultatsko stanje, TypeScript mijenja ta stanja, a CSS koristi postojeće shared design tokene i vlastiti demo namespace.

**Tech Stack:** Vite static HTML, TypeScript DOM glue, CSS, Vitest contract test, Playwright i axe.

## Global Constraints

- Live `index.html` i `src/ui/app.ts` ne mijenjaju se u ovoj iteraciji.
- Ne mijenjaju se parser, analiza, pravila ni citation engine.
- Sve nove vrijednosti ostaju jasno označene kao demo podaci.
- Sve animacije poštuju `prefers-reduced-motion`.
- Hrvatski tekst koristi dijakritiku i nema em ili en crtice.

### Task 1: Zaključati upload-first ugovor

**Files:**
- Modify: `prototype/analyzer-workspace-demo.html`
- Modify: `tests/analyzer-workspace-demo.test.ts`

**Interfaces:**
- Produces: `data-demo-surface="analyzer-workspace"`, `data-demo-state="upload"`, `#workspaceDropzone`, `#workspaceContext`, `#workspaceStartButton`, `#workspaceProgress`, `#workspaceResult`.

- [ ] **Step 1: Write the failing test**

Dodati očekivanja da početni demo skriva kontekst, da je upload prvi vidljivi korak i da postoje eksplicitni state hookovi.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analyzer-workspace-demo.test.ts`

Expected: FAIL jer postojeći demo prikazuje kontekst odmah i nema upload-first state ugovor.

- [ ] **Step 3: Update minimal markup**

Premjestiti početni fokus na upload unutar istog workspacea, dodati `data-demo-state="upload"`, omotač `#workspaceContext` i zadržati postojeće ID-jeve koje koristi demo TypeScript.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/analyzer-workspace-demo.test.ts`

Expected: PASS.

### Task 2: Implementirati prijelaz kroz isti workspace

**Files:**
- Modify: `prototype/analyzer-workspace-demo.ts`
- Modify: `prototype/analyzer-workspace-demo.html`

**Interfaces:**
- Consumes: `#workspaceDropzone`, `#workspaceStartButton`, `#workspaceRestart`.
- Produces: `setDemoState(state: 'upload' | 'ready' | 'progress' | 'result')` i tipkovnički aktivan upload.

- [ ] **Step 1: Write the failing behavior assertion**

U browser testu provjeriti da početni prikaz nema vidljiv kontekst, aktiviranje uploada otkriva kontekst u istom panelu, a pokretanje prelazi u rezultat.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/ux/analyzer-workspace-demo.spec.ts`

Expected: FAIL jer postojeći demo ne skriva kontekst u početnom stanju.

- [ ] **Step 3: Implement state transition**

Dodati eksplicitno stanje na `<main>`, sinkronizirati rail i labelu s tim stanjem, sakriti kontekst u upload stanju i otkriti ga nakon aktiviranja uploada. Reduced-motion treba prijeći iz `progress` u `result` bez čekanja.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/ux/analyzer-workspace-demo.spec.ts`

Expected: PASS.

### Task 3: Vizualno zadržati isti viewport i pristupačan responsive fallback

**Files:**
- Modify: `prototype/analyzer-workspace-demo.css`
- Modify: `tests/ux/analyzer-workspace-demo.spec.ts`

**Interfaces:**
- Consumes: state hookove iz Taska 1 i 2.
- Produces: upload-first layout, compact ready layout, reduced-motion i mobile fallback.

- [ ] **Step 1: Write the failing visual assertions**

Dodati provjeru da početni upload panel zauzima glavni fokus, da mobilni prikaz nema overflow i da axe ne prijavljuje nove critical ili serious probleme.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/ux/analyzer-workspace-demo.spec.ts`

Expected: FAIL dok CSS ne uvede state-selective layout.

- [ ] **Step 3: Implement CSS**

Uvesti state selektore za skrivanje konteksta prije učitavanja, veći upload panel u početnom stanju, kompaktniji ready state, bez skoka stranice i bez overflowa na `max-width: 720px`. Dodati reduced-motion fallback.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/ux/analyzer-workspace-demo.spec.ts`

Expected: PASS.

### Task 4: Završna provjera artefakta

**Files:**
- Verify: `prototype/analyzer-workspace-demo.html`
- Verify: `prototype/analyzer-workspace-demo.css`
- Verify: `prototype/analyzer-workspace-demo.ts`
- Verify: `tests/analyzer-workspace-demo.test.ts`
- Verify: `tests/ux/analyzer-workspace-demo.spec.ts`

- [ ] **Step 1: Run focused contract and browser tests**

Run: `npx vitest run tests/analyzer-workspace-demo.test.ts` and `npx playwright test tests/ux/analyzer-workspace-demo.spec.ts`

- [ ] **Step 2: Run typecheck and build**

Run: `npx tsc --noEmit` and `npm run build`

- [ ] **Step 3: Inspect the demo route**

Open: `http://localhost:5173/prototype/analyzer-workspace-demo.html`

Check initial upload, ready state, progress, result, restart, mobile layout and reduced-motion state.
