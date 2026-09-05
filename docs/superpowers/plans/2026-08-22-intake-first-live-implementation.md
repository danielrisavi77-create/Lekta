# Intake-first live arhitektura i Korektorski stol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task with review checkpoints.

**Goal:** Pretvoriti postojeću Lektu u produkcijsku intake-first MPA aplikaciju u kojoj je `/` minimalan upload, `/rad/` stvarni Korektorski stol, `/saznaj-vise/` bogati landing, a `/moji-radovi/` povijest i račun, bez gubitka funkcija ili sigurnosnih zaštita.

**Architecture:** Zadržati Vite, vanilla TypeScript i postojeće analitičke, profilne, preview, repair, preflight, auth i report module kao jedine autoritete. Novi tanki route bootstrapi učitavaju samo potreban graf. Dokument između `/` i `/rad/` ostaje u pregledniku kroz verzioniranu IndexedDB sesiju s rokom od 24 sata i nasumičnim ID-jem samo u URL fragmentu. Postojeći `src/ui/app.ts` prvo dobiva čistu mount granicu, zatim se njegove postojeće funkcije raspoređuju u stabilne workspace panele bez promjene parsera, bodovanja ili repair enginea.

**Tech Stack:** Vite 8 MPA, TypeScript strict, DOM API, IndexedDB, Web Worker, Vitest s happy-dom, Playwright s Chromium desktop i Pixel 5 projektima, Netlify deploy preview i atomic deploy rollback.

**Spec:** `docs/superpowers/specs/2026-08-22-intake-first-product-architecture-design.md`

## Global Constraints

- Ovo je stvarni production candidate. Ne koristiti mock rezultat, demo score ili paralelnu poslovnu logiku za aktivni korisnički tok.
- Ne mijenjati `src/docx`, `src/audits`, `src/citations`, `src/analysis` ili repair fixere radi UX-a. Ako se ipak otkrije nužna promjena parsera, audita, citata ili fixera, zaustaviti ovaj plan i prvo dodati golden test koji dokazuje zatečeno ponašanje.
- Besplatna analiza mora ostati lokalna. Dokument ili njegov tekst ne smiju se poslati tijekom intakea, profila ili osnovne analize.
- Dokument, tekst, rezultat i sadržaj nalaza ne smiju završiti u `localStorage`, query stringu, telemetriji ili error reportingu.
- URL fragment smije sadržavati samo nasumični session ID. On nije autentikacija niti ovlast nad serverskim resursima.
- Ne kopirati stare sigurnosne i consent odluke u nove module. Novi UI mora zvati postojeće kanonske consent, auth, report, preflight, source-check i repair module.
- Ne mijenjati autoritativne repair parametre, redoslijed ponovne analize, regresijski fallback na izvornik, `storagePending` semantiku ili tvrdnju da promašaj u korpusu nije dokaz nepostojanja izvora.
- Ne uvoditi framework, WebGL, vanjski runtime, novi origin ili kontinuirane page-wide animacije.
- Svi korisnički i dokumentni stringovi idu kroz `textContent`, `createTextNode`, postojeći `escapeHtml` ili `safeHref`. Naziv datoteke je nepouzdan unos.
- Svaki commit mora prethodno imati zelen `npm run check`. Ako je gate crven, ne commitati.
- Deploy preview i produkcijski deploy su vanjske promjene. Izvesti ih tek nakon zasebne korisnikove potvrde u odgovarajućem koraku.
- Ne dirati ili odbacivati nepovezane korisnikove promjene. Production candidate mora nastati iz čistog, zelenog baselinea u zasebnom worktreeu.

## Ciljana struktura datoteka

```text
index.html
rad/index.html
saznaj-vise/index.html
moji-radovi/index.html

src/routes/shared/route-shell.ts
src/routes/shared/route-shell.css
src/routes/intake/main.ts
src/routes/intake/intake-controller.ts
src/routes/intake/intake.css
src/routes/workspace/main.ts
src/routes/workspace/workspace-runtime.ts
src/routes/workspace/workspace-shell.ts
src/routes/workspace/workspace-state.ts
src/routes/workspace/analysis-progress.ts
src/routes/workspace/result-summary.ts
src/routes/workspace/primary-action.ts
src/routes/workspace/document-pane.ts
src/routes/workspace/advanced-panel.ts
src/routes/workspace/feature-actions.ts
src/routes/workspace/workspace.css
src/routes/learn-more/main.ts
src/routes/learn-more/learn-more.css
src/routes/my-work/main.ts
src/routes/my-work/my-work-controller.ts
src/routes/my-work/my-work.css

src/session/local-document-session.ts
src/session/indexeddb-document-session-store.ts
src/shared/browser-storage.ts
src/analytics/event-sanitizer.ts
src/history/local-analysis-history.ts
src/config/browser-production-config.ts

scripts/route-bundle-budget.mjs
docs/deploy/INTAKE_FIRST_PARITY.md
docs/deploy/INTAKE_FIRST_ROLLBACK.md
```

Datoteke se uvode samo kada njihov zadatak dođe na red. Ako postojeći modul već daje istu granicu, proširiti njega umjesto stvaranja duplikata.

## Ključni ugovori

### Lokalna sesija

```ts
export const LOCAL_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const LOCAL_DOCUMENT_TTL_MS = 24 * 60 * 60 * 1000;

export interface ConfirmedProfileSnapshot {
  profileDefinitionId: string;
  selectionIds: Record<string, string>;
  confirmedAt: number;
}

export interface StoredAnalysisSnapshot {
  schemaVersion: 1;
  createdAt: number;
  payload: unknown;
}

export interface LocalWorkspaceSnapshot {
  stage: 'profile' | 'results' | 'repairPlan' | 'comparison' | 'submission';
  selectedFindingId?: string;
  analysis?: StoredAnalysisSnapshot;
}

export interface LocalDocumentSessionV1 {
  schemaVersion: typeof LOCAL_DOCUMENT_SCHEMA_VERSION;
  id: string;
  createdAt: number;
  expiresAt: number;
  document: {
    name: string;
    type: string;
    lastModified: number;
    bytes: ArrayBuffer;
  };
  intake: IntakeOk;
  profile?: ConfirmedProfileSnapshot;
  workspace?: LocalWorkspaceSnapshot;
}

export interface LocalDocumentSessionUpdate {
  profile?: ConfirmedProfileSnapshot | null;
  workspace?: LocalWorkspaceSnapshot | null;
}

export interface LocalDocumentSessionSummary {
  id: string;
  name: string;
  createdAt: number;
  expiresAt: number;
  stage: LocalWorkspaceSnapshot['stage'] | 'profile';
}

export interface LocalDocumentSessionStore {
  put(session: LocalDocumentSessionV1): Promise<void>;
  get(id: string, now?: number): Promise<LocalDocumentSessionV1 | null>;
  update(id: string, update: LocalDocumentSessionUpdate): Promise<LocalDocumentSessionV1>;
  list(now?: number): Promise<LocalDocumentSessionSummary[]>;
  delete(id: string): Promise<void>;
  deleteExpired(now?: number): Promise<number>;
}
```

`StoredAnalysisSnapshot.payload` ostaje `unknown` na storage granici i vraća se runtimeu samo nakon provjere verzije i minimalnog result ugovora. Ne pokušavati tipizirati cijeli postojeći engine kao dio ovog redizajna.

### Workspace stanje

```ts
export type WorkspaceStage =
  | 'restoring'
  | 'profile'
  | 'analyzing'
  | 'results'
  | 'repairPlan'
  | 'repairing'
  | 'comparison'
  | 'submission'
  | 'error';

export interface WorkspaceState {
  stage: WorkspaceStage;
  sessionId: string | null;
  profileConfirmed: boolean;
  selectedFindingId: string | null;
  lastSafeStage: Exclude<WorkspaceStage, 'restoring' | 'analyzing' | 'repairing' | 'error'> | null;
  error: { message: string; recovery: 'upload' | 'profile' | 'retry-analysis' | 'retry-network' } | null;
}
```

Reducer mora čuvati posljednje sigurno stanje i ne smije odbaciti dokument ili profil zbog prolazne greške workera ili mrežne napredne funkcije.

### Primarna akcija

```ts
export type WorkspacePrimaryAction =
  | { kind: 'repair-plan'; label: 'Otvori plan ispravaka' }
  | { kind: 'manual-review'; label: 'Prikaži ručne provjere' }
  | { kind: 'submission'; label: 'Provjeri spremnost za predaju' }
  | { kind: 'comparison'; label: 'Usporedi prije i poslije' }
  | { kind: 'download-original'; label: 'Preuzmi izvorni dokument' };
```

Prioritet odluke je: regresija, dovršeni popravak, otvoreni automatski popravljivi nalazi, otvoreni ručni nalazi, zatim predaja.

---

## Task 0: Osigurati zeleni baseline i stvarnu povratnu točku

**Files:**

- Read: `.git/`, `package.json`, `netlify.toml`
- Do not modify application files in this task.

Pri pisanju plana radno stablo sadrži nepovezane staged promjene, a posljednji poznati `npm run check` ima dva pada: `tests/repair-closed-loop-structural.test.ts` za `pravo-socijalni-rad-zavrsni` i timeout u `tests/ffzg-pmf-synthetic.test.ts` za `ffzg-informacijske-zavrsni`. To nije prihvatljiv baseline i ti se padovi ne popravljaju usput kroz UX rad.

1. Pregledaj stanje bez izmjena.

   ```powershell
   git status --short
   git branch --show-current
   git rev-parse HEAD
   ```

2. Zaustavi se ako postoje nepovezane promjene. Vlasnik ih mora završiti, commitati na njihovoj grani ili drugačije sigurno izolirati. Ne koristiti `git reset --hard`, `git checkout --` ili brisanje datoteka.

3. Pokreni tvrdi gate na reviziji koja točno predstavlja trenutačni live proizvod.

   ```powershell
   npm run check
   ```

   Očekivanje: TypeScript, svi Vitest testovi i Vite build prolaze. Ako bilo što pada, nema taga, worktreea ni implementacije.

4. U Netlify Deploys prikazu zabilježi ID trenutačno objavljenog deploya i potvrdi da je akcija za ponovno objavljivanje tog deploya dostupna. Samo pregledaj, ne objavljuj ništa.

5. Označi točan zeleni commit anotiranim tagom.

   ```powershell
   git tag -a pre-intake-first-live-2026-08-22 -m "Baseline prije intake-first live redizajna"
   git show pre-intake-first-live-2026-08-22 --no-patch
   ```

6. Učitaj skill `superpowers:using-git-worktrees` i iz tog taga otvori zaseban worktree i granu `feat/intake-first-live`. Ne koristiti trenutačni prljavi worktree kao production candidate.

**Review gate 0:** Čist worktree, zeleni `npm run check`, potvrđen Git tag i zapisan prethodni Netlify deploy ID. Bez toga se Task 1 ne pokreće.

---

## Task 1: Izdvojiti sigurnu browser pohranu i sanitizaciju telemetrije bez promjene UI-ja

**Files:**

- Create: `src/shared/browser-storage.ts`
- Create: `src/analytics/event-sanitizer.ts`
- Create: `tests/browser-storage.test.ts`
- Create: `tests/event-sanitizer.test.ts`
- Modify: `src/ui/app.ts`

1. Napiši testove za postojeće ponašanje `safeStorageGet` i `safeStorageSet`: JSON zapis, fallback, memorijski fallback kada je `localStorage` odbijen i migracija starih `thesisready.*` ključeva.

2. Napiši test koji dokazuje da sanitizator dopušta samo postojeću listu primitivnih polja, a odbacuje `fileName`, `document`, `text`, `excerpt`, `citation`, `bytes`, ugniježđene objekte i nizove.

3. Pokreni testove i potvrdi da padaju jer javni moduli još ne postoje.

   ```powershell
   npx vitest run tests/browser-storage.test.ts tests/event-sanitizer.test.ts
   ```

4. Premjesti postojeći memorijski fallback i migraciju ključeva iz `src/ui/app.ts` u `src/shared/browser-storage.ts`. Zadrži iste ključeve i isto ponašanje. Novi API mora biti generički i ne smije uvoditi dokumentnu pohranu.

5. Premjesti postojeću allowlistu iz `sanitizeEventData` u `src/analytics/event-sanitizer.ts`. `trackEvent` u `app.ts` mora pozivati taj modul i nikada ne smije dobiti dokumentni sadržaj.

6. Pokreni ciljane testove, zatim puni gate.

   ```powershell
   npx vitest run tests/browser-storage.test.ts tests/event-sanitizer.test.ts tests/tool-analytics.test.ts tests/ui-app-smoke.test.ts
   npm run check
   ```

7. Commitaj samo ovu ekstrakciju.

   ```powershell
   git add src/shared/browser-storage.ts src/analytics/event-sanitizer.ts src/ui/app.ts tests/browser-storage.test.ts tests/event-sanitizer.test.ts
   git commit -m "refactor: extract browser storage and telemetry guards"
   ```

---

## Task 2: Pretvoriti postojeći analyzer u route-safe, mountable runtime

**Files:**

- Create: `tests/analyzer-app-mount.test.ts`
- Modify: `tests/ui-app-smoke.test.ts`
- Modify: `src/ui/app.ts`

1. Napravi minimalni happy-dom fixture s `#analyzer` i samo obaveznim workspace mount točkama. Napiši test da inicijalizacija ne pokušava pristupiti landing, pricing ili marketing elementima koji ne postoje.

2. Napiši test za javnu granicu:

   ```ts
   export interface AnalyzerDocumentAdmission {
     file: File;
     source: 'workspace-session' | 'memory-only';
   }

   export interface AnalyzerResultEvent {
     result: unknown;
     profile: unknown;
   }

   export function initAnalyzerApp(doc?: Document): void;
   export async function loadAnalyzerDocument(input: AnalyzerDocumentAdmission): Promise<void>;
   export function subscribeAnalyzerResult(listener: (event: AnalyzerResultEvent) => void): () => void;
   ```

   `loadAnalyzerDocument` mora proći kroz postojeći `setFile` i `inspectDocxIntake`; ne smije vjerovati samo spremljenom IndexedDB zapisu.

3. Napiši test da `data-analysis-start="after-profile-confirmation"` sprječava `startSpeculativeAnalysis`, dok postojeća stranica bez atributa zadržava zatečeno ponašanje do cutovera.

4. Pokreni ciljane testove i potvrdi početni pad.

   ```powershell
   npx vitest run tests/analyzer-app-mount.test.ts tests/ui-app-smoke.test.ts
   ```

5. Podijeli postojeći `init()` u male mount funkcije prema prisutnom korijenu: analyzer, landing, commerce modali, history modali i dev alati. Opcionalni panel ne smije srušiti rutu na kojoj ga nema.

6. Dodaj javnu analyzer granicu iz koraka 2 i idempotentnu inicijalizaciju. Listeneri se ne smiju registrirati dvaput ako se isti runtime ponovno mounta u memory-only toku.

7. U `admitFile`, promjenama wizard selecta i povratku iz rezultata uvjetuj spekulativnu analizu vrijednošću route atributa. Puna analiza i dalje koristi isti `analyzeDocxOffThread` i iste profile.

8. Na završetku stvarne analize emitirati `AnalyzerResultEvent`. Ne emitirati demo rezultat i ne slati rezultat kroz `window.postMessage`, URL ili storage iz ovog modula.

9. Pokreni ciljane testove i puni gate.

   ```powershell
   npx vitest run tests/analyzer-app-mount.test.ts tests/ui-app-smoke.test.ts tests/intake-gate.test.ts
   npm run check
   ```

10. Commitaj mount granicu.

   ```powershell
   git add src/ui/app.ts tests/analyzer-app-mount.test.ts tests/ui-app-smoke.test.ts
   git commit -m "refactor: make analyzer runtime route safe"
   ```

---

## Task 3: Implementirati verzioniranu lokalnu dokumentnu sesiju

**Files:**

- Create: `src/session/local-document-session.ts`
- Create: `src/session/indexeddb-document-session-store.ts`
- Create: `tests/local-document-session.test.ts`

1. Napiši čiste testove za stvaranje zapisa, maksimalni TTL od 24 sata, validaciju UUID-a, parsiranje `#session=<uuid>`, rekonstrukciju `File` objekta, nepoznatu verziju i istek.

2. Napiši test da `sessionFragment` sadrži samo ključ `session` i UUID, bez naziva datoteke, profila ili rezultata.

3. Napiši test store ugovora s injektabilnim adapterom: `get` briše istekli zapis, `deleteExpired` je idempotentan, `update` ne može produljiti `expiresAt` preko izvornog 24-satnog stropa i `list` vraća samo sažetak.

4. Pokreni test i potvrdi početni pad.

   ```powershell
   npx vitest run tests/local-document-session.test.ts
   ```

5. Implementiraj čisti model u `local-document-session.ts`. Baza mora imati vlastito ime, primjerice `lekta-local-documents`, shemu `1`, object store `sessions` i indeks `expiresAt`.

6. Implementiraj IndexedDB store s eksplicitnim `readonly` i `readwrite` transakcijama. Grešku kvote, blokirani IndexedDB ili nedostupan API vratiti pozivatelju kao tipiziranu grešku. Ne uvoditi `localStorage` fallback.

7. Implementiraj `MemoryDocumentSessionStore` s istim ugovorom samo za isti tab. Taj store se ne smije predstavljati kao trajno spremljen.

8. `StoredAnalysisSnapshot` mora imati zasebnu verziju i minimalni validator. Nepoznat ili oštećen payload ukloniti iz sesije, ali zadržati valjani dokument i profil kada je to sigurno.

9. Pokreni ciljane testove i puni gate.

   ```powershell
   npx vitest run tests/local-document-session.test.ts
   npm run check
   ```

10. Commitaj session sloj.

   ```powershell
   git add src/session/local-document-session.ts src/session/indexeddb-document-session-store.ts tests/local-document-session.test.ts
   git commit -m "feat: add private local document sessions"
   ```

---

## Task 4: Dodati konačne MPA route shellove bez promjene javnog `/`

**Files:**

- Create: `rad/index.html`
- Create: `saznaj-vise/index.html`
- Create: `moji-radovi/index.html`
- Create: `src/routes/shared/route-shell.ts`
- Create: `src/routes/shared/route-shell.css`
- Create: `src/routes/workspace/main.ts`
- Create: `src/routes/workspace/workspace-runtime.ts`
- Create: `src/routes/workspace/workspace-shell.ts`
- Create: `src/routes/workspace/workspace.css`
- Create: `src/routes/learn-more/main.ts`
- Create: `src/routes/learn-more/learn-more.css`
- Create: `src/routes/my-work/main.ts`
- Create: `src/routes/my-work/my-work.css`
- Create: `tests/intake-first-routes.test.ts`
- Modify: `vite.config.ts`

1. Napiši test koji zahtijeva Vite inpute `rad`, `saznajVise` i `mojiRadovi`, točne canonical URL-ove, hrvatski jezik, skip link, vanjski module script i bez novih inline skripti osim identične postojeće theme restore skripte.

2. Napiši test da `/rad/` ima stabilne mount točke za status, profil, progress, dokument, nalaze, primarnu akciju, repair, comparison, submission i advanced panel.

3. Pokreni test i potvrdi početni pad.

   ```powershell
   npx vitest run tests/intake-first-routes.test.ts
   ```

4. Dodaj tri HTML ulaza i Vite inpute. Javni `index.html` u ovom tasku ostaje netaknut.

5. `route-shell.ts` smije inicijalno učitati samo temu, skip link, fokus i osnovnu navigaciju. Ne uvoziti `ui-boot.ts`, Lucide registry, premium vizuale, motion, analyzer, profile, repair ili landing medije u minimalni shared shell.

6. `workspace/main.ts` odmah renderira lagani restoring shell, zatim dinamički uvozi `workspace-runtime.ts`. Runtime rekonstruira datoteku iz sesije, mounta postojeći analyzer i poziva `loadAnalyzerDocument`.

7. Mehanički premjesti potreban analyzer, preview, repair, report, auth, order, legal i consent markup u `/rad/`. Privremena duplikacija markupa s još uvijek javnim starim `index.html` dopuštena je samo na candidate grani do Taska 5. Ne stvarati `/legacy/` rutu.

8. Na `/saznaj-vise/` privremeno preseli postojeće landing sekcije i atraktivne vizuale bez izmjene njihove funkcije. Optimizacija i završno uređivanje dolaze u Tasku 13.

9. `/moji-radovi/` u ovoj fazi dobiva semantički shell i poruku učitavanja, ali se ne povezuje iz javnog `/` dok Task 12 ne dovrši funkcije.

10. Pokreni ciljani test, build i puni gate.

   ```powershell
   npx vitest run tests/intake-first-routes.test.ts tests/analyzer-app-mount.test.ts
   npm run build
   npm run check
   ```

11. Provjeri da postoje `dist/rad/index.html`, `dist/saznaj-vise/index.html` i `dist/moji-radovi/index.html`.

12. Commitaj route shellove.

   ```powershell
   git add rad saznaj-vise moji-radovi src/routes vite.config.ts tests/intake-first-routes.test.ts
   git commit -m "feat: add intake-first application routes"
   ```

---

## Task 5: Zamijeniti `/` minimalnim stvarnim intakeom

**Files:**

- Create: `src/routes/intake/main.ts`
- Create: `src/routes/intake/intake-controller.ts`
- Create: `src/routes/intake/intake.css`
- Create: `tests/intake-controller.test.ts`
- Create: `tests/intake-entry-boundary.test.ts`
- Modify: `src/docx/intake-gate.ts`
- Modify: `tests/intake-gate.test.ts`
- Modify: `index.html`

1. Proširi test `IntakeOk` rezultata tako da očekuje `capability: DocxCapability | null`. Za valjan ZIP izračun mora koristiti `ZipReader.entryCount()`, `ZipReader.declaredUncompressedTotal()` i postojeći `docxCapability()` bez drugog ZIP parsera.

2. Napiši controller testove za klik, drag and drop, Enter, Space, krivu ekstenziju, preveliku datoteku, intake reject, uspješan IndexedDB zapis, grešku kvote i memory-only izbor.

3. Napiši import-boundary test. Statički graf `src/routes/intake/main.ts` ne smije sadržavati `src/analysis`, `src/profiles`, `src/repair` osim malenog `docx-budget`, `src/preflight`, `src/preview`, `src/history`, `motion`, `premium` ili landing medije. `intake-gate` mora biti dinamički import nakon odabira datoteke.

4. Pokreni testove i potvrdi početni pad.

   ```powershell
   npx vitest run tests/intake-gate.test.ts tests/intake-controller.test.ts tests/intake-entry-boundary.test.ts
   ```

5. Proširi `inspectDocxIntake` bez mijenjanja njegovih reject kodova ili fail-open politike. `OK_CLEAN` pri neočekivanoj internoj grešci nosi `capability: null`, pa worker i dalje ostaje završni sigurnosni autoritet.

6. Zamijeni `index.html` finalnim prvim viewportom:

   - Lekta identitet
   - diskretan link `Moji radovi`
   - naslov i jedna velika `.docx` upload zona
   - format i granica iz `DOCX_MAX_UPLOAD_BYTES`
   - kratka tvrdnja da besplatna analiza ostaje na uređaju
   - link `Želiš saznati više?` na `/saznaj-vise/`
   - status i greška povezani s `aria-live`

7. Implementiraj fizički i taktilni intake bez bitmap asseta: slojevi papira, statične korektorske oznake i kratka transformacija od upload zone prema dokumentu tek nakon uspješnog intakea. Reduced-motion odmah pokazuje završno stanje.

8. Nakon uspješnog `store.put`, navigiraj na `/rad/#session=<uuid>`. Ne stavljati ništa drugo u URL. Ako zapis ne uspije, ne navigirati i ne tvrditi da je spremljeno.

9. Za IndexedDB grešku ponuditi eksplicitan gumb `Nastavi samo u ovom tabu`. Tek njegov klik dinamički uvozi `workspace-runtime.ts`, mounta workspace na postojećoj stranici i prikazuje upozorenje da refresh gubi dokument.

10. Maliciozni naziv datoteke prikazivati isključivo kroz `textContent`. Ne koristiti ga u `innerHTML`, logovima ni analitici.

11. Pokreni ciljane testove i puni gate.

   ```powershell
   npx vitest run tests/intake-gate.test.ts tests/docx-capability.test.ts tests/intake-controller.test.ts tests/intake-entry-boundary.test.ts
   npm run check
   ```

12. Commitaj stvarni root cutover na candidate grani. Live deploy još uvijek ostaje nepromijenjen.

   ```powershell
   git add index.html src/routes/intake src/docx/intake-gate.ts tests/intake-gate.test.ts tests/intake-controller.test.ts tests/intake-entry-boundary.test.ts
   git commit -m "feat: make upload the only root task"
   ```

---

## Task 6: Uvesti eksplicitno workspace stanje, potvrdu profila i stvarne faze analize

**Files:**

- Create: `src/routes/workspace/workspace-state.ts`
- Create: `src/routes/workspace/analysis-progress.ts`
- Create: `tests/workspace-state.test.ts`
- Create: `tests/analysis-progress.test.ts`
- Modify: `src/routes/workspace/workspace-runtime.ts`
- Modify: `src/routes/workspace/workspace-shell.ts`
- Modify: `src/routes/workspace/workspace.css`
- Modify: `src/ui/app.ts`

1. Napiši reducer testove za sve prijelaze: restore, profile, analyzing, results, repair plan, repairing, comparison, submission i error recovery. Greška analize mora vratiti korisnika na profil ili retry bez gubitka datoteke.

2. Napiši testove koji mapiraju stvarne engine poruke u faze:

   - `Otvaram Word strukturu`
   - `Čitam stilove i odlomke`
   - `Provjeravam font, prored i margine`
   - `Provjeravam naslove, sadržaj i numeriranje`
   - `Uspoređujem citatnice i literaturu`
   - `Provjeravam tablice, slike i poveznice`
   - `Izračunavam ocjenu usklađenosti`
   - `Gotovo`

   Nepoznata poruka smije prikazati samo neodređeni aktivni status, bez izmišljanja dovršene faze.

3. Pokreni testove i potvrdi početni pad.

   ```powershell
   npx vitest run tests/workspace-state.test.ts tests/analysis-progress.test.ts
   ```

4. Pri ulasku u `/rad/` validiraj fragment, učitaj sesiju, obriši istekle zapise i rekonstruiraj `File`. Za nepoznatu shemu, oštećen zapis ili istek prikaži jasnu poruku i link na `/`, bez pokušaja analize.

5. Ponovno provuci rekonstruirani `File` kroz postojeći intake gate. Spremljeni verdict je UX cache, ne način zaobilaženja sigurnosne provjere.

6. Postavi `data-analysis-start="after-profile-confirmation"`. Koristi postojeću detekciju profila i `needsProfileConfirmation`; profil se mora potvrditi ili ručno odabrati prije `analyzeDocxOffThread` poziva.

7. Prikaži prijedlog profila, izvor i datum validacije u sažetku. Ne prikazivati nepotvrđeni profil kao činjenicu.

8. Progress UI ažuriraj iz stvarnog callbacka workera. Dovršenu fazu označi tek kada stigne sljedeća poznata faza ili `Gotovo`. Postojeći broj postotka može ostati pomoćni samo ako dolazi iz callbacka, ne iz timera.

9. Na potvrdu profila i završetak analize ažuriraj IndexedDB session snapshot. Ako update pohrane ne uspije, rezultat ostaje u memoriji i UI jasno kaže da se neće obnoviti nakon refresha.

10. Refresh valjane `results` sesije vraća spremljeni rezultat nakon validacije snapshot ugovora. Ako rezultat nije valjan, zadržava datoteku i potvrđeni profil te nudi ponovnu lokalnu analizu.

11. Pokreni ciljane testove i puni gate.

   ```powershell
   npx vitest run tests/workspace-state.test.ts tests/analysis-progress.test.ts tests/profile-detect.test.ts tests/result-a11y.test.ts
   npm run check
   ```

12. Commitaj workspace tok.

   ```powershell
   git add src/routes/workspace src/ui/app.ts tests/workspace-state.test.ts tests/analysis-progress.test.ts
   git commit -m "feat: add transparent workspace analysis flow"
   ```

---

## Task 7: Preurediti rezultat oko nalaza i jedne primarne akcije

**Files:**

- Create: `src/routes/workspace/result-summary.ts`
- Create: `src/routes/workspace/primary-action.ts`
- Create: `tests/workspace-result-summary.test.ts`
- Create: `tests/workspace-primary-action.test.ts`
- Modify: `src/routes/workspace/workspace-shell.ts`
- Modify: `src/routes/workspace/workspace-runtime.ts`
- Modify: `src/routes/workspace/workspace.css`
- Modify: `src/ui/app.ts`

1. Napiši testove sa stvarnim oblikom `issues`, `checks`, `triage` i repair dostupnosti. Sažetak mora dati broj otvorenih dokumentnih nalaza, broj automatski popravljivih i broj ručnih, bez brojanja `limitation` stavki kao pogrešaka dokumenta.

2. Napiši potpunu tablicu testova primarne akcije. Regresija uvijek pobjeđuje sve ostalo, zatim dovršeni popravak, auto-fix nalazi, ručni nalazi i predaja.

3. Pokreni testove i potvrdi početni pad.

   ```powershell
   npx vitest run tests/workspace-result-summary.test.ts tests/workspace-primary-action.test.ts
   ```

4. Koristi postojeće `buildFindingViewModels`, `topFindings`, `resultReadiness` i repair mapiranje. Ne stvarati novi identitet nalaza i ne korelirati popravke po prevedenom naslovu ako već postoji `check.id` ili `matchKeys` ugovor.

5. Gornji status mora prvo reći koliko stvari traži pažnju i što je sljedeće. Tehnička ocjena, readiness formulacija i kategorijske trake premjesti u zatvoreni napredni sloj. Spremnost za predaju postaje glavni status tek u `submission` stanju.

6. Desni panel početno prikazuje kompaktan prioritetni red i puni detalj odabranog nalaza:

   - što nije u redu
   - gdje je pronađeno
   - izmjereno stanje
   - očekivano stanje
   - zašto je označeno
   - što korisnik treba napraviti
   - može li se automatski popraviti
   - izvor pravila samo kada je veza doista izravna

7. Prikaži točno jedan vizualno dominantan CTA. Sekundarne akcije stavi u nenametljivu akcijsku grupu ili izbornik, ali ih ne uklanjaj.

8. `confirmed` i `ignored` ostaju korisničko stanje, ne mijenjaju automatsku ocjenu. Zanemarivanje i dalje traži razlog.

9. Fokus nakon rezultata postavi postojećim `focusResult`, a završetak najavi preko postojećeg `aria-live` ugovora.

10. Pokreni ciljane testove i puni gate.

   ```powershell
   npx vitest run tests/workspace-result-summary.test.ts tests/workspace-primary-action.test.ts tests/finding-view-model.test.ts tests/finding-identity.test.ts tests/result-readiness.test.ts tests/result-a11y.test.ts
   npm run check
   ```

11. Commitaj novu hijerarhiju rezultata.

   ```powershell
   git add src/routes/workspace src/ui/app.ts tests/workspace-result-summary.test.ts tests/workspace-primary-action.test.ts
   git commit -m "feat: focus results on findings and next action"
   ```

---

## Task 8: Ugraditi dominantan dokument i dvosmjernu vezu s nalazima

**Files:**

- Create: `src/routes/workspace/document-pane.ts`
- Create: `tests/workspace-document-pane.test.ts`
- Modify: `src/routes/workspace/workspace-runtime.ts`
- Modify: `src/routes/workspace/workspace-shell.ts`
- Modify: `src/routes/workspace/workspace.css`
- Modify: `src/preview/render-preview.ts` only if an additive accessibility hook is required
- Modify: `tests/render-preview.test.ts` only if that hook is added

1. Napiši DOM test da se readable preview gradi postojećim `renderPreview` i `collectAllPreviewFlags`, da dokumentni tekst ostaje identičan u `textContent` i da nijedan dokumentni string ne postaje HTML.

2. Napiši test da odabir nalaza s anchor scopeom skrola i kratko označava odgovarajući `[data-p-index]` ili `[data-fn-id]`, a odabir oznake u dokumentu aktivira odgovarajući nalaz.

3. Napiši test za više nalaza na istom anchoru i za nalaz bez pouzdane lokacije. U oba slučaja lista nalaza ostaje potpuna.

4. Napiši test da se faksimil modul ne uvozi prije korisnikova klika.

5. Pokreni test i potvrdi početni pad.

   ```powershell
   npx vitest run tests/workspace-document-pane.test.ts tests/render-preview.test.ts tests/render-facsimile.test.ts
   ```

6. Na desktopu implementiraj stabilan grid: status preko pune širine, zatim približno 58 posto dokument i 42 posto nalazi. Dokument je papir na korektorskom stolu, ne dekorativna minijatura.

7. Readable preview učitaj u glavni document pane. Faksimil dinamički učitaj tek na akciju. Zoom, stranice i način prikaza čuvaj u lokalnom workspace stanju bez ponovnog stvaranja cijelog rezultata.

8. Pri promjeni odabranog nalaza ažuriraj samo klase, `aria-current`, detalj i scroll target. Ne rerenderirati cijeli dokument ili repair panel.

9. Na mobitelu redoslijed mora biti status, CTA, nalazi, detalj i `Otvori dokument`. Dokument se otvara preko cijelog zaslona s fokus trapom, vidljivim zatvaranjem i povratkom fokusa na gumb koji ga je otvorio.

10. Sve mete moraju biti najmanje 44 puta 44 CSS piksela. Dodaj reduced-motion granu bez smooth scrolla i bez odgođenog završnog stanja.

11. Pokreni ciljane testove i puni gate.

   ```powershell
   npx vitest run tests/workspace-document-pane.test.ts tests/render-preview.test.ts tests/render-facsimile.test.ts tests/a11y-css.test.ts
   npm run check
   ```

12. Commitaj dokumentni pane.

   ```powershell
   git add src/routes/workspace src/preview/render-preview.ts tests/workspace-document-pane.test.ts tests/render-preview.test.ts
   git commit -m "feat: connect findings to the document workspace"
   ```

---

## Task 9: Preseliti stvarni repair tok u stabilan plan i usporedbu

**Files:**

- Create: `src/routes/workspace/feature-actions.ts`
- Create: `tests/workspace-repair-integration.test.ts`
- Modify: `src/routes/workspace/workspace-runtime.ts`
- Modify: `src/routes/workspace/workspace-shell.ts`
- Modify: `src/routes/workspace/workspace-state.ts`
- Modify: `src/ui/app.ts`

1. Napiši integracijski test da CTA `Otvori plan ispravaka` samo otvara plan. Popravak ne počinje prije odabira stavki, potrebnih pojedinačnih potvrda i postojećeg repair pristanka.

2. Napiši test da nalaz otvara točnu repair stavku preko postojećeg `pickTargetItem` ugovora.

3. Napiši test za četiri završna stanja: uspjeh, `storagePending`, neuspjeh integriteta i detektirana regresija. Kod regresije glavna akcija mora biti `Preuzmi izvorni dokument`, a popravljeni dokument ostaje jasno označen sekundarni izbor.

4. Pokreni testove i potvrdi početni pad.

   ```powershell
   npx vitest run tests/workspace-repair-integration.test.ts tests/repair-delivery-order.test.ts
   ```

5. Zadrži postojeće `buildRepairableItems`, `renderRepairPanel`, `buildDefaultRepairRequests`, `uploadRepair`, server param authority i reanalysis callback. Ne kopirati niti pojednostaviti repair recept.

6. Repair panel mountati jednom u stabilnu točku. Otvaranje i zatvaranje mijenja stanje i vidljivost, ne briše odabrane stavke ili ponovno registrira listenere.

7. Ako mjerenje pokaže da repair ulazi u početni workspace graf, promijeni njegov import u dinamički import na otvaranje plana. Type-only ugovori mogu ostati statični.

8. Nakon uspješnog repaira prijeći u `comparison`, prikazati postojeću before/after usporedbu i ažurirati primarnu akciju. Session snapshot smije spremiti samo serializabilno UI stanje i rezultat, ne server token ili potpisani download URL.

9. Pokreni sve repair sigurnosne testove i puni gate.

   ```powershell
   npx vitest run tests/workspace-repair-integration.test.ts tests/repair-delivery-order.test.ts tests/repair-param-authority.test.ts tests/repair-package-integrity.test.ts tests/repair-package-structure.test.ts tests/repair-history.test.ts
   npm run check
   ```

10. Ne pokretati Word oracle jer se repair engine i fixeri ne mijenjaju. Ako implementacija ipak dotakne fixer ili paketni izlaz, ovaj task se više ne smatra UI-only i obavezni su postojeći golden test, `npm run verify:strict-open`, `npm run verify:word`, `npm run verify:word:worst` i po potrebi `npm run verify:word:toc`.

11. Commitaj workspace repair integraciju.

   ```powershell
   git add src/routes/workspace src/ui/app.ts tests/workspace-repair-integration.test.ts
   git commit -m "feat: integrate repair plan and safe comparison"
   ```

---

## Task 10: Premjestiti tehničke detalje, izvore i izvoz u napredni sloj

**Files:**

- Create: `src/routes/workspace/advanced-panel.ts`
- Create: `tests/workspace-advanced-parity.test.ts`
- Modify: `src/routes/workspace/workspace-shell.ts`
- Modify: `src/routes/workspace/workspace-runtime.ts`
- Modify: `src/ui/app.ts`

1. Napiši parity test koji zahtijeva novu dostupnu lokaciju za:

   - tehničku ocjenu i kategorije
   - oblikovanje, citiranje, strukturu i profilnu validaciju
   - metodologiju i ograničenja
   - metrike dokumenta
   - tipografiju, pravopis, gramatiku i registar
   - Legal Citation Engine
   - provjeru postojanja izvora i CrossRef
   - lokalni i puni izvještaj
   - print, HTML, JSON, dijeljenje i prijavu pogrešnog nalaza

2. Napiši test da je advanced panel zatvoren na prvom rezultatu, da otvaranje ne briše odabrani nalaz i da zatvaranje vraća fokus otvaraču.

3. Pokreni test i potvrdi početni pad.

   ```powershell
   npx vitest run tests/workspace-advanced-parity.test.ts
   ```

4. Premjesti postojeće result tabove u stabilan advanced drawer ili panel. Zadrži postojeće DOM ID-jeve gdje ih `app.ts` i testovi već koriste, ili uvedi jedno centralno mapiranje, ne ad hoc query selektore na više mjesta.

5. Score i category trake prikaži samo u naprednom sažetku. Ne duplicirati prstenove ili readiness status u osnovnom workspaceu.

6. Source i CrossRef radnje ostaju kontekstualne uz relevantan nalaz te u naprednom panelu. Vanjskim servisima i dalje se šalju samo bibliografski podaci.

7. Izvoz i report moraju koristiti postojeće sanitizirane projekcije i auth gate. Ne spremati cijeli rezultat ili dokument na novu lokaciju.

8. Napredne podmodule učitaj na zahtjev gdje god nemaju utjecaj na početni rezultat. Njihove mount točke ostaju stabilne nakon prvog učitavanja.

9. Pokreni ciljane testove i puni gate.

   ```powershell
   npx vitest run tests/workspace-advanced-parity.test.ts tests/finding-view-model.test.ts tests/network-proof.test.ts tests/report-boundary.test.ts tests/report-sanitize.test.ts tests/report-modal.test.ts
   npm run check
   ```

10. Commitaj advanced sloj.

   ```powershell
   git add src/routes/workspace src/ui/app.ts tests/workspace-advanced-parity.test.ts
   git commit -m "feat: move technical results into advanced panels"
   ```

---

## Task 11: Premjestiti predaju, preflight, rokove i komercijalne tokove

**Files:**

- Create: `tests/workspace-submission-parity.test.ts`
- Modify: `src/routes/workspace/feature-actions.ts`
- Modify: `src/routes/workspace/workspace-shell.ts`
- Modify: `src/routes/workspace/workspace-runtime.ts`
- Modify: `src/ui/app.ts`

1. Napiši parity test za submission checklist, PDF, metadata DOCX, antivirusni zapis, preflight, rokove, podsjetnike, cloud integritet, entitlement, checkout, povratak s plaćanja, jamstvo i ručnu narudžbu.

2. Napiši test da svaka mrežna svrha zadržava svoj gate. Preflight privola ne otključava repair, repair pristanak ne otključava cloud integritet, checkout privola ne uključuje analitiku.

3. Pokreni test i potvrdi početni pad.

   ```powershell
   npx vitest run tests/workspace-submission-parity.test.ts tests/preflight.test.ts tests/preflight-client.test.ts tests/consent-text.test.ts
   ```

4. `Provjeri spremnost za predaju` prebacuje workspace u `submission`. Tek tada readiness može postati glavni status.

5. U submission panel premjesti postojeće pomoćne datoteke, checklist, deadline i reminder kontrole. Ne spajati ih s lokalnim intakeom i ne slati ništa prije postojeće eksplicitne radnje.

6. Preflight koristi postojeći `buildPreflightConsent`, postojeći start/result klijent i postojeće rokove čuvanja. Cloud integritet koristi svoj zasebni `IntegrityConsent`.

7. Checkout, entitlement, jamstvo, manual order i payment return koriste postojeće endpoint konfiguracije i auth/rate-limit granice. Ne uvoditi novu migraciju ili novi Supabase put u ovom redizajnu.

8. Mrežna greška napredne funkcije ne smije ukloniti lokalni dokument, rezultat ili nalaze. Ponudi retry samo za pogođenu svrhu.

9. Pokreni ciljane testove i puni gate.

   ```powershell
   npx vitest run tests/workspace-submission-parity.test.ts tests/preflight.test.ts tests/preflight-client.test.ts tests/pdf-preflight.test.ts tests/consent-text.test.ts tests/network-proof.test.ts
   npm run check
   ```

10. Commitaj submission i commerce premještanje.

   ```powershell
   git add src/routes/workspace src/ui/app.ts tests/workspace-submission-parity.test.ts
   git commit -m "feat: organize submission and consented services"
   ```

---

## Task 12: Izgraditi stvarnu stranicu `/moji-radovi/`

**Files:**

- Create: `src/history/local-analysis-history.ts`
- Create: `src/config/browser-production-config.ts`
- Create: `src/routes/my-work/my-work-controller.ts`
- Create: `tests/local-analysis-history.test.ts`
- Create: `tests/my-work-controller.test.ts`
- Modify: `src/routes/my-work/main.ts`
- Modify: `src/routes/my-work/my-work.css`
- Modify: `moji-radovi/index.html`
- Modify: `src/ui/app.ts`

1. Napiši test koji zamrzava postojeći `lekta.history.v2` format, limit od 20 zapisa, spremanje samo sažetka i izostavljanje demo rezultata.

2. Napiši controller testove za tri odvojene cjeline: privremene lokalne dokumentne sesije, lokalne sažetke provjera i serversku povijest popravaka.

3. Napiši test da neprijavljeni korisnik može vidjeti lokalne stavke, ali serverski popravci traže postojeći OTP/auth tok. Session ID ne služi kao serverska ovlast.

4. Pokreni testove i potvrdi početni pad.

   ```powershell
   npx vitest run tests/local-analysis-history.test.ts tests/my-work-controller.test.ts tests/repair-history.test.ts tests/admin-auth.test.ts
   ```

5. Izdvoji postojeći history model iz `app.ts` u `local-analysis-history.ts` bez promjene ključa ili pohranjenog sadržaja. Dokumentni bajtovi i tekst ne ulaze u ovu povijest.

6. Izdvoji učitavanje postojeće production konfiguracije u `browser-production-config.ts`, uz isti `DEFAULT_PRODUCTION_CONFIG`, iste spremljene override vrijednosti i bez izlaganja dev setupa u produkciji.

7. `/moji-radovi/` prikazuje:

   - aktivne lokalne sesije na ovom uređaju, s istekom i akcijama `Otvori` i `Obriši lokalni dokument`
   - postojeće lokalne sažetke provjera
   - prijavu i serversku povijest popravaka preko `fetchRepairJobs`, `signRepairDownload` i `deleteRepairJob`

8. Eksplicitno brisanje lokalne sesije odmah briše IndexedDB zapis i uklanja stavku iz UI-ja. Potvrda jasno kaže da se lokalni dokument nakon toga ne može obnoviti.

9. Linkove `Moji radovi` na `/` i `/rad/` usmjeri na novu rutu. Postojeći history modal može ostati samo kao kratkotrajni compatibility ulaz do završnog parity pregleda, zatim ga ukloni ako nema jedinstvenu funkciju.

10. Pokreni ciljane testove i puni gate.

   ```powershell
   npx vitest run tests/local-analysis-history.test.ts tests/my-work-controller.test.ts tests/repair-history.test.ts tests/admin-auth.test.ts
   npm run check
   ```

11. Commitaj stranicu povijesti.

   ```powershell
   git add src/history/local-analysis-history.ts src/config/browser-production-config.ts src/routes/my-work moji-radovi/index.html src/ui/app.ts tests/local-analysis-history.test.ts tests/my-work-controller.test.ts
   git commit -m "feat: add my work and repair history page"
   ```

---

## Task 13: Dovršiti `/saznaj-vise/` kao bogati, ali odvojeni landing

**Files:**

- Create: `tests/learn-more-route.test.ts`
- Modify: `saznaj-vise/index.html`
- Modify: `src/routes/learn-more/main.ts`
- Modify: `src/routes/learn-more/learn-more.css`
- Modify: existing landing visual modules only where needed

1. Napiši test da ruta sadrži sve postojeće vrijedne cjeline: način rada, profile i fakultete, lokalnu privatnost, službena pravila, primjer nalaza, repair granice, pripremu predaje, alate, waitlist/referral i povratne CTA-ove na `/`.

2. Napiši import-boundary test da landing ne uvozi `src/ui/app.ts`, analyzer worker, repair runtime ili preflight runtime. Vizualni demo smije koristiti sanirani statični primjer, ali ne smije postati aktivni rezultat korisnikova dokumenta.

3. Pokreni test i potvrdi početni pad.

   ```powershell
   npx vitest run tests/learn-more-route.test.ts
   ```

4. Presloži postojeći sadržaj u kraće uredničke cjeline. Svaka veća sekcija završava jasnim CTA-om za novu provjeru, bez konkuriranja uploadu na `/`.

5. Ponovno koristi postojeće atraktivne elemente: papir, crvene oznake, privacy scenu, metodološke dokaze, vizualni demo i relevantne alate. Ne kopirati iste teške assete na `/` ili u početni workspace shell.

6. Wow trenuci smiju biti samo kratke reakcije na ulazak sekcije ili korisnikov klik. Postojeći `createFrameCoalescer`, `shouldDeferReveal`, offscreen pause i reduced-motion politika ostaju obavezni.

7. Video i velike slike učitati `loading="lazy"` ili dinamički tek kada su blizu viewporta. Ne uvoditi autoplay video sa zvukom ili stalni background loop.

8. Uskladi title, description, Open Graph, canonical i interne linkove za `/saznaj-vise/`. Root SEO poruka mora ostati usmjerena na upload i lokalnu provjeru.

9. Pokreni ciljane testove i puni gate.

   ```powershell
   npx vitest run tests/learn-more-route.test.ts src/shared/reveal-policy.test.ts src/shared/frame-coalescer.test.ts
   npm run check
   ```

10. Commitaj landing.

   ```powershell
   git add saznaj-vise/index.html src/routes/learn-more tests/learn-more-route.test.ts
   git commit -m "feat: rebuild the learn more landing"
   ```

---

## Task 14: Zatvoriti privacy, CSP i consent gateove za sve nove rute

**Files:**

- Create: `tests/local-document-privacy.test.ts`
- Create: `tests/intake-first-csp.test.ts`
- Modify: `src/legal/legal-content.ts`
- Modify: `src/legal/terms-version.ts`
- Modify: `src/legal/consent-text.ts`
- Modify: `tests/legal-content.test.ts`
- Modify: `tests/consent-text.test.ts`
- Modify: `scripts/verify-deploy-dist.mjs`
- Modify: `tests/deploy-gate-legal.test.ts`
- Modify: `tests/csp-hash.test.ts`
- Modify: `public/_headers` only if existing wildcard coverage is insufficient

1. Napiši privacy test koji koristi maliciozni naziv datoteke i sentinel tekst. Nakon intakea i analize sentinel ne smije biti u URL-u, `localStorage`, telemetry payloadu ili error payloadu. Mora biti samo u memoriji ili IndexedDB session zapisu.

2. Napiši test za istek, eksplicitno brisanje, unknown schema i tvrdnju UI-ja. Copy mora reći da je dokument privremeno spremljen u preglednik do 24 sata, da se istek čisti pri sljedećem pokretanju ili pristupu i da zapis nije aplikacijski kriptiran.

3. Napiši build/CSP test da sva četiri MPA outputa dobivaju postojeća zaglavlja, da nemaju neodobren inline script i da safe build ne sadrži QA ili verification entry.

4. Pokreni testove i potvrdi početni pad.

   ```powershell
   npx vitest run tests/local-document-privacy.test.ts tests/intake-first-csp.test.ts tests/legal-content.test.ts tests/consent-text.test.ts tests/deploy-gate-legal.test.ts tests/csp-hash.test.ts
   ```

5. Ažuriraj privacy dokument jednim kanonskim odlomkom o lokalnoj IndexedDB sesiji. Jasno razlikuj lokalnu sesiju od serverske pohrane repaira, preflighta, narudžbi i analitike.

6. Budući da se pravni tekst materijalno mijenja, postavi novu `TERMS_VERSION` vrijednost i dodaj isti kanonski checkout tekst pod novu verziju u `CHECKOUT_CONSENT_TEXTS`. Stari unos ostaje radi povijesne provjerljivosti.

7. Kratki privacy signal na `/` i `/rad/` mora linkati na isti generirani privacy dokument. Ne duplicirati rokove čuvanja kao zasebne konstante u route kodu.

8. Proširi `verify-deploy-dist.mjs` tako da provjerava postojanje, canonical URL, vanjske skripte, sigurne linkove i zabranu dev alata za `/`, `/rad/`, `/saznaj-vise/` i `/moji-radovi/`.

9. Zadrži postojeći CSP origin allowlist. Ako nove rute rade samo s postojećim endpointima, `public/_headers` se sadržajno ne mijenja.

10. Pokreni ciljane testove, generiranje pravnih stranica i puni gate.

   ```powershell
   npx vitest run tests/local-document-privacy.test.ts tests/intake-first-csp.test.ts tests/legal-content.test.ts tests/consent-text.test.ts tests/deploy-gate-legal.test.ts tests/csp-hash.test.ts
   npm run build
   npm run generate-legal-pages
   npm run check
   ```

11. Commitaj sigurnosni i pravni sloj.

   ```powershell
   git add src/legal scripts/verify-deploy-dist.mjs public/_headers tests/local-document-privacy.test.ts tests/intake-first-csp.test.ts tests/legal-content.test.ts tests/consent-text.test.ts tests/deploy-gate-legal.test.ts tests/csp-hash.test.ts
   git commit -m "feat: document and enforce local session privacy"
   ```

---

## Task 15: Uvesti mjerene route bundle budžete i motion granice

**Files:**

- Create: `scripts/route-bundle-budget.mjs`
- Create: `tests/route-bundle-budget.test.ts`
- Create: `tests/intake-first-motion.test.ts`
- Modify: `vite.config.ts`
- Modify: route bootstraps and CSS only where measurement requires

1. Napiši unit test za helper koji iz Rollup bundlea prati samo statičke `imports` početnog entryja, zbraja svaki chunk i pripadajući CSS jednom te gzipa stvarne bajtove. `dynamicImports` ne pripadaju početnom budžetu.

2. Napiši test da root statički closure odbija module iz `src/analysis`, `src/profiles`, `src/ui/app.ts`, `src/repair`, `src/preflight`, `src/preview`, `src/history`, `motion`, premium vizuale i landing medije.

3. Napiši CSS/DOM test da nema page-wide beskonačne animacije, da se `will-change` postavlja samo tijekom interakcije i da reduced-motion uklanja transition/animation čekanje.

4. Pokreni testove i potvrdi početni pad.

   ```powershell
   npx vitest run tests/route-bundle-budget.test.ts tests/intake-first-motion.test.ts tests/intake-entry-boundary.test.ts
   ```

5. Proširi postojeći `bundleSizeGuard` umjesto dodavanja nepovezanog drugog Vite guarda. Root budžeti su:

   - statički JavaScript closure najviše 100 kB gzipano
   - statički CSS najviše 40 kB gzipano

6. Za `/rad/`, `/saznaj-vise/` i `/moji-radovi/` ispiši mjerene početne gzip baseline vrijednosti u buildu i čuvaj ih regresijskim limitom s malom, dokumentiranom rezervom. Ne podizati limit da bi se sakrio regresijski import.

7. Workspace shell mora se prikazati prije dinamičkog importa analyzer runtimea. Faksimil, repair, preflight, source check i veliki advanced moduli ostaju dinamički.

8. Ako root probije budžet, prvo ukloni statičke ikone, font varijante ili nepotrebni shared CSS. Ne odgađati intake validaciju koja je potrebna nakon korisničke radnje i ne slabiti sigurnosni gate.

9. Pregledaj animacije u Chrome Performance panelu na desktopu i mobilnoj emulaciji. Scroll i pointermove handleri moraju koristiti postojeći frame coalescer i ne smiju stvarati ponavljane duge taskove.

10. Pokreni build dvaput radi stabilnosti mjerenja, zatim puni gate.

   ```powershell
   npm run build
   npm run build
   npm run check
   ```

11. Commitaj izvedbene gateove.

   ```powershell
   git add scripts/route-bundle-budget.mjs vite.config.ts src/routes tests/route-bundle-budget.test.ts tests/intake-first-motion.test.ts
   git commit -m "perf: enforce intake-first route budgets"
   ```

---

## Task 16: Dokazati cijeli tok na desktopu, tabletu i mobitelu

**Files:**

- Create: `tests/ux/intake-first.spec.ts`
- Create: `tests/ux/workspace-findings.spec.ts`
- Create: `tests/ux/my-work.spec.ts`
- Create: `tests/ux/learn-more.spec.ts`
- Modify: `playwright.config.ts` only if a real route needs warmup, never to ignore a failing new test

1. Napiši desktop E2E s `tests/fixtures/docx/synthetic-hrvatski-naslov1-heading.docx`:

   - `/` odmah pokazuje upload i ne prikazuje landing sekcije
   - valjani upload stvara session fragment i vodi na `/rad/`
   - naziv datoteke nije u URL-u
   - profil se potvrđuje prije analize
   - prikazuju se stvarne faze
   - rezultat prvo prikazuje nalaze i jednu glavnu akciju
   - odabir nalaza vodi na dokumentnu oznaku
   - refresh obnavlja session
   - eksplicitno brisanje vraća na novi upload

2. U istom testu presretni mrežu. Tijekom uploada i besplatne analize ne smije postojati zahtjev koji nosi DOCX bytes, naziv datoteke, sentinel dokumentni tekst ili `application/vnd.openxmlformats-officedocument.wordprocessingml.document` body. Asset GET zahtjevi su dopušteni.

3. Napiši mobile E2E u postojećem `mobile-chromium` projektu. Provjeri redoslijed status, CTA, nalazi, detalj, dokument, 44 px mete, fullscreen dokument, povrat fokusa, bez horizontalnog overflowa i bez sticky prekrivanja.

4. Napiši E2E za `/moji-radovi/`: lokalna sesija bez prijave, auth prompt za serverske popravke i lokalno brisanje.

5. Napiši E2E za `/saznaj-vise/`: ključne sekcije, lazy mediji, tipkovnička navigacija i CTA povratak na `/`.

6. Dodaj axe provjeru bez novih critical ili serious nalaza na sve četiri rute i u workspace rezultatu. Reduced-motion test mora dobiti stabilno završno stanje bez timeouta.

7. Pokreni svaki novi spec izolirano na desktopu, zatim na mobitelu.

   ```powershell
   npx playwright test tests/ux/intake-first.spec.ts --project=chromium
   npx playwright test tests/ux/workspace-findings.spec.ts --project=chromium
   npx playwright test tests/ux/intake-first.spec.ts --project=mobile-chromium
   npx playwright test tests/ux/workspace-findings.spec.ts --project=mobile-chromium
   ```

8. Pokreni puni UX suite. Novi test ne dodavati u `testIgnore` radi zelenog rezultata.

   ```powershell
   npm run test:ux
   npm run check
   ```

9. Pregledaj stvarni localhost u browseru na 1440 px, 1024 px, 768 px, 430 px i 320 px. Snimi pregledne screenshotove u `.artifacts/intake-first-review/`, ne u produkcijski bundle.

10. Commitaj E2E dokaze.

   ```powershell
   git add tests/ux playwright.config.ts
   git commit -m "test: cover intake-first user journeys"
   ```

---

## Task 17: Zatvoriti parity registar i pripremiti deploy preview

**Files:**

- Create: `docs/deploy/INTAKE_FIRST_PARITY.md`
- Create: `docs/deploy/INTAKE_FIRST_ROLLBACK.md`
- Modify: any route only for defects found by this review

1. U `INTAKE_FIRST_PARITY.md` prepiši svaku stavku iz specifikacijskog odjeljka 10 i za svaku zapiši:

   - konačnu rutu i panel
   - konkretan source modul
   - automatizirani test
   - ručni pregled ako je vizualan
   - status `prolazi`

   Ne ostavljati nedorečenu stavku, odgođeni posao ili stavku bez vlasnika.

2. U `INTAKE_FIRST_ROLLBACK.md` zapiši stvarni baseline tag, baseline commit, prethodni Netlify deploy ID, candidate commit, smoke korake i točnu ručnu Netlify akciju za ponovno objavljivanje prethodnog deploya.

3. Pokreni sve release gateove lokalno.

   ```powershell
   npm run check
   npm run test:ux
   npx netlify build
   npm run release:check
   ```

4. Pregledaj završni `dist/`:

   - četiri glavne HTML rute postoje
   - `verification.html` ne postoji
   - CSP i legal provjera prolaze
   - root bundle je unutar 100 kB JS i 40 kB CSS gzip budžeta
   - analyzer, repair i landing media nisu u root statičkom closureu

5. Učitaj skill `superpowers:requesting-code-review` i zatraži review cijelog candidate diffa, s naglaskom na privatnost, consent granice, repair isporuku, route bundleove i mobilni tok. Svaki nalaz prvo reproducirati prije izmjene.

6. Nakon zelenog reviewa i zasebne korisnikove potvrde objavi draft deploy preview, ne production deploy.

   ```powershell
   npx netlify deploy --dir=dist
   ```

7. Na stvarnom preview URL-u ponovi desktop, tablet i mobilni smoke. Besplatna analiza mora raditi sa stvarnom DOCX fixturom i bez dokumentnog mrežnog prijenosa.

8. Popuni stvarni preview URL i deploy ID u rollout dokumentu. Ponovno pokreni `npm run check` prije docs commita.

9. Commitaj dokaze i rollback runbook.

   ```powershell
   git add docs/deploy/INTAKE_FIRST_PARITY.md docs/deploy/INTAKE_FIRST_ROLLBACK.md
   git commit -m "docs: record intake-first parity and rollback"
   ```

**Review gate 17:** Svi automatizirani gateovi zeleni, parity 100 posto, stvarni preview odobren na desktopu, tabletu i mobitelu, rollback podaci potpuni. Bez toga nema produkcijskog cutovera.

---

## Task 18: Izvesti odobreni atomski cutover i zadržati rollback prozor

**Files:**

- No source changes expected.
- Update: `docs/deploy/INTAKE_FIRST_ROLLBACK.md` only with final production deploy ID and smoke outcome.

1. Prije bilo kakve produkcijske promjene traži izričitu potvrdu korisnika za merge i production deploy. Ranije odobrenje plana ili previewa nije isto što i odobrenje produkcije.

2. Provjeri da candidate HEAD odgovara pregledanom preview deployu i da je radno stablo čisto.

   ```powershell
   git status --short
   git rev-parse HEAD
   git show pre-intake-first-live-2026-08-22 --no-patch
   ```

3. Integriraj candidate kroz uobičajeni repozitorijski postupak kao jedan kontrolirani merge. Ne squashati preko baseline taga i ne brisati tag.

4. Pokreni produkcijski deploy postojećim Netlify Git tokom ili, ako je to potvrđeni projektni način, eksplicitnim produkcijskim deployem. Ne improvizirati drugi hosting put.

5. Odmah nakon objave provjeri:

   - `/` vraća minimalni intake
   - `/rad/`, `/saznaj-vise/` i `/moji-radovi/` vraćaju 200
   - upload i lokalna analiza stvarne fixture datoteke rade
   - tijekom besplatne analize nema prijenosa dokumenta
   - profil, nalaz, dokument i advanced panel rade
   - auth ekran i repair povijest se otvaraju
   - privacy i legal linkovi rade
   - root bundle i sigurnosna zaglavlja odgovaraju pregledanom artefaktu

6. Ako postoji kritična funkcionalna, sigurnosna, privacy, consent, accessibility ili izvedbena regresija, u Netlify Deploys odmah odaberi prethodni zabilježeni deploy i ponovno ga objavi. Ne pokušavati hitno krpati live dok postoji potvrđena povratna verzija.

7. Nakon rollbacka potvrdi da je stari `/` ponovno aktivan. Nova IndexedDB baza ostaje neaktivna i stara aplikacija je ignorira. Korisniku se ne obećava migracija te privremene lokalne sesije.

8. Ako smoke prođe, zapiši novi production deploy ID i rezultat u `INTAKE_FIRST_ROLLBACK.md`. Zadrži prethodni deploy i Git tag tijekom dogovorenog stabilizacijskog razdoblja.

9. Tek nakon stabilizacije ukloni dokazano neaktivne compatibility ulaze i privremeno duplicirani markup. Svako uklanjanje je zaseban zeleni task s parity dokazom, ne dio hitnog cutovera.

---

## Završni Definition of Done

- `/` sadrži samo brendirani upload, privacy signal, `Moji radovi` i `Želiš saznati više?`.
- Valjani dokument prolazi postojeći intake, sprema se lokalno i otvara `/rad/#session=<uuid>`.
- Profil je vidljivo predložen i potvrđen prije pune analize.
- Analiza prikazuje samo stvarne engine faze.
- Rezultat prvo odgovara što je pogrešno, gdje, zašto i što napraviti.
- Dokument dominira desktopom, nalazi i CTA dominiraju mobitelom.
- U svakom stanju postoji samo jedna dominantna akcija.
- Repair, usporedba, predaja, izvori, izvještaji, naplata, povijest i svi napredni moduli imaju novu testiranu lokaciju.
- Sve postojeće consent, auth, RLS, rate-limit, CSP, package integrity, param authority, regression i delivery zaštite ostaju aktivne.
- Lokalni dokument i rezultat nisu u `localStorage`, URL-u, telemetriji ili logovima.
- Root je unutar 100 kB JavaScripta i 40 kB CSS-a gzipano.
- `npm run check`, puni Playwright suite, Netlify build i deploy verifier su zeleni.
- Stvarni deploy preview je pregledan na desktopu, tabletu i mobitelu.
- Produkcijski cutover je zasebno odobren, a povratak je dokazan prethodnim Netlify deployem i Git tagom.
