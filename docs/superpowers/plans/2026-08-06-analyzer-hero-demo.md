# Analyzer Hero Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Izraditi izolirani, interaktivni demo nove naslovnice analizatora koji se moze pregledati na `/prototype/analyzer-hero-demo.html` bez promjene live `index.html`.

**Architecture:** Demo je samostalna Vite stranica u `prototype/` mapi. HTML definira semanticku scenu i kontrolne tocke, zasebni CSS koristi postojece Lekta tokene i papirne slojeve, a mali TypeScript modul kontrolira jednokratnu animaciju, replay, fokus na upload i reduced-motion finalno stanje. Demo ne ucitava stvarni dokument i jasno je oznacen kao demonstracija.

**Tech Stack:** Vite, TypeScript strict, CSS/SVG, postojece `motion` konvencije, postojece Lekta design tokene, Vitest, Playwright i axe.

## Global Constraints

- Demo ne smije mijenjati `index.html`, parser, audit, citation engine, pravila ni backend.
- Ne uvoditi Three.js, WebGL ni novu chart biblioteku.
- Demo vrijednosti moraju biti jasno oznacene kao demonstracijske i ne smiju izgledati kao rezultat korisnickog dokumenta.
- Sve animacije moraju imati `prefers-reduced-motion` fallback.
- Sve kontrole moraju biti tipkovnicki dostupne i imati vidljiv fokus.
- Hrvatski jezik je zadani jezik, bez em ili en crtica u novom tekstu.
- Svaki korak mora ostati kompatibilan s `npm run check` gateom.

---

### Task 1: Dodati testni ugovor za izolirani demo

**Files:**
- Create: `tests/analyzer-hero-demo.test.ts`
- Test: `tests/analyzer-hero-demo.test.ts`

**Interfaces:**
- Consumes: `prototype/analyzer-hero-demo.html`, `prototype/analyzer-hero-demo.ts`, `prototype/analyzer-hero-demo.css`
- Produces: staticki ugovor za ID-jeve, atribute pristupacnosti i izolaciju od live stranice

- [ ] **Step 1: Write the failing test**

Dodati test koji cita demo datoteke i provjerava:

```ts
it('demo postoji izvan live stranice i ima kontroliranu semanticku scenu', () => {
  const html = read('prototype/analyzer-hero-demo.html');
  const script = read('prototype/analyzer-hero-demo.ts');
  const css = read('prototype/analyzer-hero-demo.css');

  expect(html).toContain('<main data-demo-surface="analyzer-hero">');
  expect(html).toContain('id="demoReplay"');
  expect(html).toContain('id="demoUploadCta"');
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain('data-demo-only="true"');
  expect(script).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
  expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  expect(read('index.html')).not.toContain('data-demo-surface="analyzer-hero"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test -- --run tests/analyzer-hero-demo.test.ts
```

Expected: FAIL because the isolated prototype files do not exist yet.

- [ ] **Step 3: Keep the test limited to the artifact contract**

Ne provjeravati implementacijske detalje animacije u Vitestu. Runtime i vizualno ponasanje pripadaju Playwright testu u Tasku 4.

- [ ] **Step 4: Re-run after Task 2 and Task 3**

Expected: PASS with one test file and no promjene u live `index.html`.

### Task 2: Izgraditi semanticki artifact markup

**Files:**
- Create: `prototype/analyzer-hero-demo.html`

**Interfaces:**
- Consumes: postojeci vizualni smjer iz `docs/superpowers/specs/2026-08-06-analyzer-hero-redesign-design.md`
- Produces: landmark `main[data-demo-surface="analyzer-hero"]`, CTA `#demoUploadCta`, replay `#demoReplay`, demo stage `#demoStage`, status `#demoStatus`

- [ ] **Step 1: Add the page shell**

Stranica mora imati:

```html
<main data-demo-surface="analyzer-hero" data-demo-only="true">
  <section class="demo-hero" aria-labelledby="demoTitle">
    <div class="demo-copy">
      <p class="demo-kicker">Korektorski stol+</p>
      <h1 id="demoTitle">Mirniji zadnji sat prije predaje.</h1>
      <p>Ucitaj rad i prvo vidi formu, strukturu i citiranje na jednom mjestu.</p>
      <div class="demo-actions">
        <button id="demoUploadCta" type="button">Ucitaj rad</button>
        <button id="demoReplay" type="button">Ponovi demonstraciju</button>
      </div>
      <div class="demo-trust" aria-label="Svojstva Lekte">
        <span>Lokalna analiza</span>
        <span>Bez racuna</span>
        <span>Stvarne provjere</span>
      </div>
    </div>
    <div class="demo-stage-wrap">
      <div id="demoStage" class="demo-stage" data-demo-state="intro" aria-label="Demonstracija analize rada">
        <!-- paper layers, document, scan line, marks, score panel -->
      </div>
      <p id="demoStatus" class="demo-status" aria-live="polite">Priprema demonstracije...</p>
    </div>
  </section>
  <section id="demoAnalyzerPreview" class="demo-analyzer-preview" aria-labelledby="demoAnalyzerTitle">
    <h2 id="demoAnalyzerTitle">Isti tijek prelazi u stvarnu analizu</h2>
    <!-- three staged steps, explicitly marked as preview -->
  </section>
</main>
```

- [ ] **Step 2: Keep demo copy honest**

U sceni koristiti oznake `DEMO`, `Primjer prikaza` ili slican tekst da korisnik ne zamijeni score i nalaze s vlastitim dokumentom. Ne prikazivati stvarni fakultetski rezultat.

- [ ] **Step 3: Add accessible controls and status hooks**

CTA i replay moraju biti native `button` elementi. Stage mora imati opis, a status mora koristiti `aria-live="polite"`. Nijedna dekorativna SVG linija ne smije biti u accessibility stablu ako ne nosi informaciju.

### Task 3: Dodati premium scenu i kontroliranu animaciju

**Files:**
- Create: `prototype/analyzer-hero-demo.css`
- Create: `prototype/analyzer-hero-demo.ts`

**Interfaces:**
- Consumes: `#demoStage`, `#demoStatus`, `#demoReplay`, `#demoUploadCta`
- Produces: `data-demo-state` vrijednosti `intro`, `scanning`, `marked`, `result`; funkcije `runDemo()` i `resetDemo()` lokalne modulu

- [ ] **Step 1: Add the CSS paper system**

CSS mora definirati:

- tamni desk background i svijetle paper tokene kroz postojece CSS varijable
- najmanje tri sloja papira kroz pseudo-elemente
- CSS perspective i `transform-style: preserve-3d`
- dokument, tekstne linije, heading, korektorske oznake, scan line, score panel i post-it
- stanje `data-demo-state="intro"` bez finalnih oznaka
- stanje `scanning` sa scan line animacijom
- stanje `marked` s crvenim i zelenim oznakama
- stanje `result` s vidljivim score panelom
- mobile breakpoint ispod 720px bez horizontalnog scrolla

- [ ] **Step 2: Add the one-time runtime sequence**

Implementirati sekvencu bez trajnog intervala:

```ts
type DemoState = 'intro' | 'scanning' | 'marked' | 'result';

function runDemo(): void;
function resetDemo(): void;
```

`runDemo()` treba jednom postaviti `scanning`, zatim `marked`, zatim `result` kroz postojece browser timeoute. Nakon `result` status ostaje citljiv. `resetDemo()` cisti timeout ID-jeve, vraca `intro` i poziva `runDemo()`.

- [ ] **Step 3: Respect reduced motion**

Ako `window.matchMedia('(prefers-reduced-motion: reduce)').matches` vrati `true`, `runDemo()` odmah postavlja `result`, ne zakazuje timeout i azurira status na finalnu poruku. CSS u reduced-motion media queryju gasi transition, animation i transform tilt.

- [ ] **Step 4: Wire CTA behavior**

`#demoUploadCta` ne pokrece analizu i ne mijenja live stranicu. Na klik treba fokusirati `#demoAnalyzerPreview` ili njegov naslov, postaviti `tabindex="-1"` samo ako je potrebno i azurirati `#demoStatus` da je ovo prijelaz prema stvarnom upload flowu.

### Task 4: Dodati browser audit artifacta

**Files:**
- Create: `tests/ux/analyzer-hero-demo.spec.ts`
- Modify: `playwright.config.ts` only if the existing web server cannot serve the static prototype route

**Interfaces:**
- Consumes: `/prototype/analyzer-hero-demo.html`
- Produces: desktop, mobile, keyboard, reduced-motion i axe dokaz za artifact

- [ ] **Step 1: Add desktop and mobile smoke coverage**

Provjeriti:

- jedan `main` i jedan `h1`
- vidljivi `#demoUploadCta` i `#demoReplay`
- demo stage unutar viewporta bez horizontalnog overflowa
- demo status postoji i nije prazan

- [ ] **Step 2: Add motion and replay coverage**

Na normalnom motion modu provjeriti da state nakon cekanja zavrsi u `result`. Klik na replay mora vratiti state u `intro` ili `scanning`, a zatim opet u `result`.

Na reduced-motion modu provjeriti da stage odmah zavrsi u `result` i da computed transition i animation vrijednosti budu ugasene.

- [ ] **Step 3: Add keyboard and axe coverage**

Tab navigacija mora doseci CTA i replay. Nakon aktivacije CTA-a fokus mora otici prema preview dijelu. Axe rezultat ne smije imati critical ili serious violation.

- [ ] **Step 4: Run artifact-only verification**

```powershell
npm run test -- --run tests/analyzer-hero-demo.test.ts
npx playwright test tests/ux/analyzer-hero-demo.spec.ts --workers=1
npx tsc --noEmit
npm run build
```

Expected: artifact testovi i build prolaze, a `index.html` ostaje nepromijenjen.

### Task 5: Handoff za vizualni review

**Files:**
- No production files modified
- Optional screenshots: `test-results/analyzer-hero-demo/`

- [ ] **Step 1: Start the local dev server**

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

- [ ] **Step 2: Review the artifact route**

Open:

```text
http://localhost:5173/prototype/analyzer-hero-demo.html
```

- [ ] **Step 3: Stop before live integration**

Ne mijenjati `index.html` niti prebacivati demo CSS/TS u shared live boot dok korisnik ne potvrdi da scena, tipografija, motion i CTA odgovaraju ocekivanom wow efektu.
