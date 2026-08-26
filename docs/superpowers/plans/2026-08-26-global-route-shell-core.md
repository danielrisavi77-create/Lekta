# Global route shell, temeljne rute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uvesti lagani, pristupačni javni shell s panelom "Sve mogućnosti" na rutama /, /rad/, /saznaj-vise/ i /moji-radovi/, uz upload kao jedinu dominantnu radnju na početnoj stranici.

**Architecture:** Kanonski direktorij živi u malom PUBLIC JSON manifestu i prolazi kroz strogo tipizirani validator. route-shell.ts jedini renderira panel i upravlja fokusom, temom, breakpointom i idempotentnim remountom. Statički HTML zadržava brand i osnovne poveznice bez JavaScripta. Host ruta jedina smije shellu predati već potvrđenu lokalnu sesiju ili dostupnost postavki privatnosti. Shell nema import prema feature grafu.

**Tech Stack:** Vite MPA, TypeScript strict, JSON, CSS, Vitest, esbuild write:false, Playwright i axe.

**Spec:** docs/superpowers/specs/2026-08-26-global-route-shell-navigation-design.md

## Global Constraints

- Raditi samo u worktreeu feature/intake-first-live.
- Root ostaje upload-first, bez kartica, cijena, benchmarka ili alatne mreže u prvom viewportu.
- Shell ne čita IndexedDB, naziv dokumenta, auth sesiju, Supabase ni korisničke podatke.
- Ne mijenjati parser, audit, citation engine, scoring, profile, repair recepte, migracije ni Supabase funkcije.
- Ne uklanjati postojeće workspace radnje ni mount točke.
- Bez novih any, @ts-nocheck, localStorage hackova, em ili en crtica.
- Svaki task počinje padajućim testom i završava ciljanim zelenim testom.
- Prije commita obvezni su npm run check, classification scan i git diff --check.

---

### Task 1: Kanonski direktorij i klasifikacija

**Files:**

- Create: src/routes/shared/public-route-directory.json
- Create: src/routes/shared/public-route-directory.ts
- Create: tests/public-route-directory.test.ts
- Modify: data/classification.json

**Interfaces:**

~~~ts
export type PublicRouteGroupId =
  | 'your-work' | 'rules-trust' | 'free-tools' | 'proof-help';
export type PublicRouteRelease = 'core' | 'personal-space';

export interface PublicRouteDestination {
  readonly id: string;
  readonly label: string;
  readonly href: `/${string}`;
  readonly description: string;
  readonly release: PublicRouteRelease;
}
export interface PublicRouteGroup {
  readonly id: PublicRouteGroupId;
  readonly label: string;
  readonly destinations: readonly PublicRouteDestination[];
}
export const releasedPublicRouteGroups: readonly PublicRouteGroup[];
export function isPublicRouteId(value: string): boolean;
~~~

Skupine su ovim redom:

1. your-work: Nova provjera, Moji radovi i kasniji account ulaz.
2. rules-trust: Kako radi, Što se provjerava, Metodologija i dokazi, Pravila po fakultetu, Pokrivenost i Obrada dokumenata.
3. free-tools: Svi alati, Citat generator, Provjera citata i literature, Brojač kartica, Naslovnica, Literatura i Izjava.
4. proof-help: Usporedba, Benchmark, Paketi, FAQ, Garancija i Uvjeti i povrat.

account-repairs u ovom planu ima release personal-space i selektor ga izostavlja. Plan 4 ga objavljuje tek uz funkcionalni account shelf.

- [ ] **Step 1: Write the failing contract test**

Provjeriti redoslijed, jedinstvene ID-jeve, neprazne labele, root-relative hrefove i zabranu admin, verification, QA te starih root fragmenata. Dokazati da je account-repairs prisutan u JSON-u, ali ne u releasedPublicRouteGroups.

- [ ] **Step 2: Run RED**

Run: npx vitest run tests/public-route-directory.test.ts

Expected: FAIL jer datoteke ne postoje.

- [ ] **Step 3: Implement manifest and fail-fast validator**

Baciti Error na nepoznatu skupinu ili release, dupli ID, prazan label i nevaljan href. U data/classification.json dodati eksplicitno PUBLIC allowed pravilo za manifest, s bilješkom da nema korisničkih podataka, profila, cijena ili poslovne logike.

- [ ] **Step 4: Run GREEN**

Run: npx vitest run tests/public-route-directory.test.ts tests/classification.test.ts

Expected: PASS.

---

### Task 2: Idempotentni panel Sve mogućnosti

**Files:**

- Modify: src/routes/shared/route-shell.ts
- Modify: tests/route-shell.test.ts

**Interface:**

~~~ts
export type RouteShellVariant = 'intake' | 'workspace' | 'content' | 'my-work';
export interface RouteContinuation {
  readonly href: `/${string}`;
  readonly label: string;
}
export interface RouteShellOptions {
  readonly current: string;
  readonly variant: RouteShellVariant;
  readonly continuation?: RouteContinuation;
  readonly privacySettingsAvailable: boolean;
}
export function mountRouteShell(doc: Document, options: RouteShellOptions): void;
~~~

Koristiti WeakMap<Document, AbortController>. Novi mount aborta stare listenere, zatvara panel i vraća overflow, inert i fokus stanje.

- [ ] **Step 1: Write failing behavior tests**

Fixture ima data-route-directory-button, aria-controls route-directory, data-route-directory-layer i main-content. Pokriti četiri skupine, otvaranje, aria-expanded, fokus, Escape, Zatvori, backdrop, klik unutar papira, povrat fokusa, aria-current, mobilne skupine, temu, continuation, privacy utility i remount bez dvostrukih listenera.

- [ ] **Step 2: Run RED**

Run: npx vitest run tests/route-shell.test.ts

Expected: FAIL na novom options ugovoru i panelu.

- [ ] **Step 3: Implement minimal lifecycle**

Dozvoljeni importi: browser-storage, skip-link, javni direktorij i dva shell CSS-a. Zabranjeni su statički i dinamički importi prema ui-boot, lucide, premium, motion, analysis, profiles, repair, auth, history, preflight, preview i landing.

Renderirati DOM metodama i textContentom. Otvaranje sprema fokus, izolira pozadinu s inert, zaustavlja scroll i fokusira naslov. Zatvaranje vraća prethodno stanje. Desktop otvara sve skupine, mobilni prikaz samo your-work.

- [ ] **Step 4: Prove no network or late module load**

Stubati fetch i očekivati nula poziva. Broj script i modulepreload elemenata prije i poslije klika mora ostati jednak.

- [ ] **Step 5: Run GREEN**

Run: npx vitest run tests/route-shell.test.ts tests/public-route-directory.test.ts

Expected: PASS.

---

### Task 3: Statički shell i host integracija

**Files:**

- Modify: index.html
- Modify: rad/index.html
- Modify: saznaj-vise/index.html
- Modify: moji-radovi/index.html
- Modify: src/routes/intake/main.ts
- Modify: src/routes/workspace/main.ts
- Modify: src/routes/learn-more/main.ts
- Modify: src/routes/my-work/main.ts
- Modify: src/routes/intake/memory-workspace.ts
- Modify: tests/intake-first-routes.test.ts
- Modify: tests/memory-workspace.test.ts

Svaka ruta ima brand, no-JS primarne linkove, data-route-directory-button i data-route-directory-layer. Root ima samo Lekta, Moji radovi i Sve. Ostale rute imaju Lekta, Nova provjera, Moji radovi i Sve.

- [ ] **Step 1: Add failing route assertions**

Provjeriti variant intake, workspace, content i my-work, statičke hrefove, jedinstvene ID-jeve i odsutnost starog data-route-menu sustava. Svaki header ima najviše tri korisničke odluke uz brand. Root mora zadržati upload mountove i ispod stola samo /saznaj-vise/#how te /alati.html.

- [ ] **Step 2: Run RED**

Run: npx vitest run tests/intake-first-routes.test.ts tests/memory-workspace.test.ts

Expected: FAIL na starim headerima.

- [ ] **Step 3: Migrate only global chrome**

U rad/index.html ne dirati analyzer, rail Dokument, Profil i Nalaz, modale, forme ni workspace mountove. Postavke privatnosti preseliti u shell utility samo gdje consent runtime postoji. Zadržati id privacySettingsBtn.

- [ ] **Step 4: Mount variants and continuation**

Workspace: current workspace, variant workspace, privacy true. Learn-more: current learn-more, variant content, privacy true. My-work: current my-work, variant my-work, privacy false.

Root host, ne shell, poziva persistentStore.list(). Najnoviju sesiju pretvara u:

~~~ts
{
  href: `/rad/${sessionFragment(session.id)}`,
  label: 'Nastavi trenutačni rad',
}
~~~

Kvar IndexedDB-a samo izostavlja continuation. Nema mrežnog fallbacka.

- [ ] **Step 5: Preserve memory-only ordering**

U memory-workspace.ts mountati shell prije mountWorkspaceRuntime kako bi runtime vezao privacySettingsBtn. Test mora dokazati da remount ne ostavlja listener na starom intake headeru.

- [ ] **Step 6: Run GREEN**

Run: npx vitest run tests/intake-first-routes.test.ts tests/intake-controller.test.ts tests/memory-workspace.test.ts tests/local-document-session.test.ts

Expected: PASS.

---

### Task 4: Taktilni responsive stil

**Files:**

- Modify: src/routes/shared/route-shell.css
- Modify: src/routes/intake/intake.css
- Modify: src/routes/workspace/workspace.css
- Modify: src/routes/learn-more/learn-more.css
- Modify: src/routes/my-work/my-work.css
- Create: tests/ux/global-route-shell.spec.ts

**Contract:** Desktop je podignuti papir u dva stupca. Mobile je modalni sheet. Animiraju se samo opacity i transform do 180 ms. Reduced motion uklanja prijelaz. Papir ostaje svijetao u dark temi. Touch mete su najmanje 44 x 44 px. Nema overflowa na 320 px.

- [ ] **Step 1: Add failing browser assertions**

Na rootu otvoriti Sve, provjeriti dialog, fokus, Escape i backdrop. Na 390 x 844 provjeriti jednu kolonu. Na 320 px očekivati scrollWidth <= clientWidth. Ponoviti light, dark, forced-colors i reduced-motion te pokrenuti axe bez novih critical ili serious nalaza. Spremiti stabilne Playwright screenshotove zatvorenog i otvorenog panela na 1200 x 800 i 390 x 844.

- [ ] **Step 2: Run RED**

Run: npx playwright test tests/ux/global-route-shell.spec.ts --workers=1 --reporter=line

- [ ] **Step 3: Implement CSS**

route-shell.css je jedino mjesto za header, panel, backdrop, focus, mobile sheet i reduced-motion. Route CSS podešava samo gustoću preko data-route-variant. Bez motion biblioteke, čestica, petlji i animiranja layout svojstava.

- [ ] **Step 4: Run GREEN**

Run: npx playwright test tests/ux/global-route-shell.spec.ts --workers=1 --reporter=line

Expected: PASS.

---

### Task 5: Performance i import gate

**Files:**

- Create: tests/route-shell-budget.test.ts
- Modify: tests/intake-first-routes.test.ts
- Modify: tests/intake-entry-boundary.test.ts

~~~ts
const MAX_SHELL_JS_GZIP = 8 * 1024;
const MAX_SHELL_CSS_GZIP = 12 * 1024;
~~~

- [ ] **Step 1: Write the failing budget test**

Koristiti esbuild.build s bundle, minify, write:false, format esm i metafile:true. Gzip računati s gzipSync nad emitiranom JS i CSS memorijom. Poruka pada ispisuje stvarne byte vrijednosti. Metafile ne smije sadržavati feature module uzorke iz Taska 2.

- [ ] **Step 2: Run and satisfy budget**

Run: npx vitest run tests/route-shell-budget.test.ts tests/intake-entry-boundary.test.ts

Expected: JS <= 8192 gzip bajta, CSS <= 12288 gzip bajta i bez zabranjenih inputa.

---

### Task 6: Paritet i završni gate

- [ ] **Step 1: Run focused tests**

~~~bash
npx vitest run tests/public-route-directory.test.ts tests/route-shell.test.ts tests/route-shell-budget.test.ts tests/intake-first-routes.test.ts tests/intake-controller.test.ts tests/memory-workspace.test.ts tests/local-document-session.test.ts tests/intake-entry-boundary.test.ts
~~~

- [ ] **Step 2: Run browser parity**

~~~bash
npx playwright test tests/ux/global-route-shell.spec.ts tests/ux/roadmap-v2.spec.ts tests/ux/repair-panel.spec.ts --workers=1 --reporter=line
~~~

Dokazati upload, profil, analizu, rezultate, detalje, popravak, povijest, Moji popravci, preflight, izvještaje, prijavu pogreške, narudžbu, waitlist, rok i privacy settings. Kontrolu bez zamjenskog ponašajnog testa ne uklanjati.

- [ ] **Step 3: Run hard gate**

~~~bash
npm run check
node scripts/verify-dist-classification.mjs
git diff --check
~~~

- [ ] **Step 4: Inspect dist outputs**

Provjeriti četiri odvojena entryja i odsutnost feature importa iz shell chunka.

- [ ] **Step 5: Commit after fresh evidence**

Ponoviti git diff --stat samo nad planiranim putanjama. Commit message: feat: deliver global shell on core routes.

Ne spajati u master, ne pushati i ne deployati u ovom planu.
