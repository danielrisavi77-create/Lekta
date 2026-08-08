# Besplatni alati, vizualni i UX audit, izvedbeni plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ujednačiti vizualni i UX doživljaj pet besplatnih alata i stranice `alati.html`, uz očuvanje postojeće domenske logike i privatnosnih obećanja.

**Architecture:** Postojeći `design-system.css` ostaje izvor tokena, a zajedničko ponašanje besplatnih alata ide u postojeći `tool-page.css`. Stranice zadržavaju vlastite specifičnosti, ali dobivaju isti workspace ritam: jasan ulaz, stabilan pregled rezultata, vidljivo stanje prazno/radi/gotovo i dobar mobilni redoslijed.

**Tech Stack:** Vite, TypeScript strict, postojeći Playwright, Vitest, `@axe-core/playwright` za browser accessibility audit, CSS bez novog frameworka.

## Global Constraints

- Ne mijenjati parser, citation engine, auditnu jezgru ni generatore sadržaja rada.
- Besplatni alati ostaju lokalni, osim već postojeće DOI/Crossref radnje koju korisnik izričito pokrene.
- Hrvatski je default, bez em i en crtica u novom tekstu.
- Svaka promjena mora proći `npm run check`.
- Ne prepisivati nepovezane postojeće promjene u radnom stablu.

---

### Task 1: Browser audit harness

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `tests/ux/free-tools-audit.spec.ts`
- Create: `tests/ux/free-tools-pages.ts`

**Interfaces:**
- `FREE_TOOL_PAGES`: popis ruta, naslova i ključnih selektora za svih šest javnih stranica.
- Test suite provjerava desktop i mobilni viewport, ključne landmarke, vidljivost glavne akcije, mobile menu, theme toggle i axe violations.

- [ ] Instalirati `@axe-core/playwright` kao dev dependency.
- [ ] Dodati test koji otvara `alati.html`, `citat.html`, `kartice.html`, `naslovnica.html`, `literatura.html` i `izjava.html`.
- [ ] Dodati provjere da svaka stranica ima jedan `main`, jedan `h1`, primarnu akciju, funkcionalnu temu i mobilni izbornik.
- [ ] Dodati axe provjeru za critical/serious kršenja.
- [ ] Pokrenuti suite i zabilježiti postojeće nalaze prije CSS izmjena.

### Task 2: Shared free-tool workspace polish

**Files:**
- Modify: `src/shared/tool-page.css`
- Modify: `src/shared/design-system.css` only if a missing token is proven by the audit

**Interfaces:**
- Existing page classes `.shell`, `.grid`, `.card`, `.out-panel`, `.out-bar`, `.field` remain compatible.
- New shared utility classes, if needed, must be presentational only and must not change tool logic.

- [ ] Ujednačiti širinu sadržaja, razmak hero/workspace zone i desktop omjer ulaz/rezultat.
- [ ] Uvesti dosljedan vizualni odnos između form kartice i rezultatske kartice, uključujući prazno stanje.
- [ ] Poboljšati focus, hover, disabled i active states bez uklanjanja postojeće reduced-motion podrške.
- [ ] Uvesti mobilni sticky action pattern samo ondje gdje ne zaklanja rezultat ili tipkovnicu.
- [ ] Smanjiti konflikt između zajedničkog CSS-a i inline page-specific overridea bez prepisivanja funkcionalnih selektora.

### Task 3: Page-specific UX refinements

**Files:**
- Modify: `alati.html`, `citat.html`, `kartice.html`, `naslovnica.html`, `literatura.html`, `izjava.html`
- Modify: corresponding `src/tools/*-page.ts` only when a visible state cannot be fixed with markup/CSS

**Interfaces:**
- Existing element IDs and event contracts remain unchanged.
- Existing output text and document-generation behavior remain unchanged unless a copy correction is required for visual hierarchy.

- [ ] `alati.html`: jasnije istaknuti pet glavnih alata, razlikovati preporučeni sljedeći korak od pomoćnih poveznica.
- [ ] `citat.html`: smanjiti osjećaj zida od polja, grupirati metadata i zadržati rezultat vidljivim tijekom unosa.
- [ ] `kartice.html`: rezultat i cilj staviti u jasniji vizualni fokus, s dobrim empty/loading/ready stanjima.
- [ ] `naslovnica.html` i `izjava.html`: jasnije odvojiti podatke, službeni predložak/status i pregled dokumenta.
- [ ] `literatura.html`: metrike, popis i upozorenja složiti kao zadatak s jasnim završnim CTA-om.
- [ ] Provjeriti 375/390 px prikaz, 768 px prijelom i 1440 px desktop bez horizontalnog overflowa.

### Task 4: Verification and audit report

**Files:**
- Modify: `tests/ux/free-tools-audit.spec.ts`
- Create: `docs/audit/FREE_TOOLS_VISUAL_UX_AUDIT_2026-08-06.md`

- [ ] Pokrenuti ciljane Vitest testove i Playwright audit.
- [ ] Pokrenuti `npm run check` kao završni gate.
- [ ] U audit zapisati baseline nalaze, promjene, ograničenja i preostale preporuke.
- [ ] Pregledati `git diff` i potvrditi da nema izmjena izvan vizualnog/UX opsega.
