# Korektorski stol demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Izraditi izolirani, interaktivni demo Lektinog toka od uploada do rezultata bez promjene glavne stranice ili stvarne analitičke logike.

**Architecture:** Demo je zaseban Vite MPA entry na `/demo.html`, s vlastitim `src/demo/` modulima i CSS-om. Koristi mock dokument, faze analize i nalaze, a stanje toka vodi mali deterministički state machine. Glavna stranica, `src/ui/app.ts`, parser i analiza ostaju netaknuti.

**Tech Stack:** Vite, TypeScript strict, vanilla DOM, CSS, Vitest.

**Spec:** Vizualni koncept dogovoren u razgovoru: dominantni fizički korektorski stol, ozbiljnost i povjerenje, lokalne interakcije umjesto stalnih animacija, transparentne faze, lanac dokaza i prilagođeni mobitel.

## Global Constraints

- Demo ne smije mijenjati postojeći landing, analizu, parser ili stvarne rezultate.
- Mock sadržaj smije opisivati samo formu rada, nikad generirati ili prepravljati sadržaj rada.
- Sve interakcije moraju imati klik/touch alternativu i statično stanje.
- Nema kontinuiranih page-wide animacija; animacije su lokalne, kratke i koriste transform/opacity.
- Hrvatski je default jezik i nema em/en crtica u novom tekstu.
- Tvrdi gate je `npm run check`; poznati lokalni Vitest/esbuild permission problem mora se prijaviti ako se ponovi.

---

### Task 1: Demo entry i state model

**Files:**
- Create: `demo.html`
- Create: `src/demo/main.ts`
- Create: `src/demo/demo-state.ts`
- Test: `src/demo/demo-state.test.ts`
- Modify: `vite.config.ts`

**Interfaces:**
- `DemoStage = 'upload' | 'analyzing' | 'result'`
- `DemoState = { stage: DemoStage; analysisPhase: number; selectedFindingId: string | null; advancedOpen: boolean }`
- `advanceDemo(state): DemoState`
- `selectFinding(state, id): DemoState`
- `toggleAdvanced(state): DemoState`

- [x] Write failing tests for stage progression, finding selection and advanced toggle.
- [x] Verify the initial missing-module failure with TypeScript; the focused Vitest command is blocked by the known local esbuild permission error.
- [x] Implement the minimal pure state helpers.
- [x] Run `npx tsc --noEmit --pretty false`.
- [x] Add `demo.html` and include it in the Vite MPA input without changing `index.html`.

### Task 2: Desktop korektorski stol shell

**Files:**
- Create: `src/demo/demo.css`
- Modify: `src/demo/main.ts`

- [x] Add static desk, paper sheet, side rail, top status and typography tokens.
- [x] Render upload, analyzing and result shells from the mock state.
- [x] Keep the first paint static and reserve layout space for every stage.
- [x] Add reduced-motion rules and avoid filters on large or fixed surfaces.

### Task 3: Transparent analysis and result interactions

**Files:**
- Modify: `src/demo/main.ts`
- Modify: `src/demo/demo.css`

- [x] Add clickable analysis phases with active phase and explanatory copy.
- [x] Add three mock findings with severity, location, reason and next action.
- [x] Add document annotations that select the corresponding finding.
- [x] Add the evidence chain `Pravilo → Mjesto → Zašto → Sljedeći korak`.
- [x] Add advanced details drawer for score, categories and methodology.
- [x] Keep one primary action per stage and all secondary actions visually subordinate.

### Task 4: Mobile and interaction QA

**Files:**
- Modify: `src/demo/demo.css`
- Modify: `src/demo/main.ts`

- [x] Stack the document and findings into a touch-first flow below 760px.
- [x] Make annotation targets at least 44px and preserve keyboard focus.
- [ ] Visual browser verification of overflow and responsive states, blocked because no browser runtime is available in this environment.
- [x] Add reduced-motion handling for each stage.

### Task 5: Verification and handoff

**Files:**
- No production files beyond the demo entry and demo modules.

- [x] Run `npx tsc --noEmit --pretty false`.
- [x] Run `npm run build` and verify `dist/demo.html` exists.
- [x] Confirm the local dev endpoint serves `/demo.html` with HTTP 200.
- [x] Run `git diff --check`.
- [x] Keep the main page out of the demo change and report the demo URL separately.
