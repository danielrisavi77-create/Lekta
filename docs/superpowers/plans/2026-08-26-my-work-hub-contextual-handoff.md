# Moji radovi hub i kontekstualni handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Any Supabase-facing task also requires the supabase skill and current official documentation verification before code changes.

**Goal:** Pretvoriti /moji-radovi/ u stvarni osobni prostor s dvije strogo odvojene police, "Na ovom uređaju" i "Na računu", te u rezultatu nuditi najviše dva relevantna besplatna alata bez gubitka postojećih workspace funkcija.

**Architecture:** Lokalni session store ostaje jedini izvor nastavka dokumenta, a lokalna povijest ostaje samo zapis metapodataka. Postojeći history kod iz app.ts izvlači se u tipizirani storage servis koji koriste workspace i hub. Account shelf ponovno koristi isti Supabase OTP session zapis i postojeći repair-history klijent, s RLS identitetom iz user JWT-a, potpisanim downloadom i trajnim brisanjem preko postojećeg Edge endpointa. Result handoff centralno deduplicira alatne prijedloge i renderira najviše dva, umjesto neograničenih linkova po nalazu.

**Tech Stack:** TypeScript strict, IndexedDB, safe browser storage, postojeći Supabase REST auth klijent, PostgREST i Storage sign API, route shell, Vitest, Playwright i axe.

**Spec:** docs/superpowers/specs/2026-08-26-global-route-shell-navigation-design.md

## Global Constraints

- Raditi isključivo u istom izoliranom worktreeu feature/intake-first-live.
- Planovi 1 do 3 moraju biti zeleni.
- Ne stvarati migracije, ne mijenjati RLS, Storage policyje ili Edge funkcije u ovom planu.
- Prije Supabase klijentskih izmjena provjeriti aktualni Supabase changelog i službene Auth, RLS, Storage signed URL i session refresh dokumente.
- U browseru je dopušten samo public/anon ključ. service_role ili secret key nikada ne ulazi u klijent.
- Autorizaciju repair poslova i objekata i dalje odlučuju postojeći RLS i server, nikad labela, path ili user metadata iz DOM-a.
- Lokalna povijest nikada se ne opisuje kao spremljeni dokument.
- Server repair nikada se ne opisuje kao lokalni.
- Brisanje sesije, metapodatka i server repaira imaju različit copy i različitu potvrdu.
- Ne uvoditi obveznu prijavu za upload, lokalnu analizu, lokalnu povijest ili nastavak sesije.
- Ne uklanjati stare workspace kontrole prije ponašajnog testa zamjenskog puta.
- Bez novih any, @ts-nocheck, localStorage hackova, em ili en crtica.
- Prije commita obvezni su npm run check, classification scan i git diff --check.

---

### Task 1: Dijeljeni production config, auth store i lokalna povijest

**Files:**

- Create: src/config/browser-production-config.ts
- Create: src/auth/browser-session-store.ts
- Create: src/history/analysis-history.ts
- Create: tests/browser-production-config.test.ts
- Create: tests/analysis-history.test.ts
- Modify: src/ui/app.ts in small focused patches
- Modify: src/auth/session.ts
- Modify: tests/session.test.ts
- Modify: tests/analysis-progress.test.ts

**Interfaces:**

~~~ts
export interface BrowserProductionConfig {
  readonly enabled: boolean;
  readonly submissionMode: string;
  readonly orderEndpoint: string;
  readonly paymentProvider: string;
  readonly paymentLinks: Readonly<{
    format: string;
    panic: string;
    premium: string;
  }>;
  readonly businessName: string;
  readonly contactEmail: string;
  readonly privacyController: string;
  readonly retentionDays: number;
  readonly uploadMaxBytes: number;
  readonly analyticsEndpoint: string;
  readonly serverAnalytics: string;
  readonly reportEndpoint: string;
  readonly fieldRenderEndpoint: string;
  readonly repairEndpoint: string;
  readonly profileRulesEndpoint: string;
  readonly checkoutEndpoint: string;
  readonly guaranteeEndpoint: string;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly waitlistEndpoint: string;
  readonly referralEndpoint: string;
  readonly errorEndpoint: string;
  readonly preflightStartEndpoint: string;
  readonly preflightResultEndpoint: string;
  readonly preflightMaxUploadMb: number;
  readonly adminStatsEndpoint: string;
}
export const DEFAULT_BROWSER_PRODUCTION_CONFIG: Readonly<BrowserProductionConfig>;
export function loadBrowserProductionConfig(): BrowserProductionConfig;

export interface AccountClientConfig {
  readonly auth: AuthConfig;
  readonly repairHistory: RepairHistoryConfig;
}
export function accountClientConfig(config: BrowserProductionConfig): AccountClientConfig;

export const AUTH_SESSION_KEY = 'lekta.session';
export function createBrowserSessionStore(): SessionStore;

export type SignOutResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly locallyCleared: true;
      readonly message: string;
    };
export async function signOutSession(
  config: AuthConfig,
  session: Session,
  store: SessionStore,
  fetchImpl?: typeof fetch,
): Promise<SignOutResult>;

export interface AnalysisHistoryEntry {
  readonly id: string;
  readonly generatedAt: string;
  readonly fileName: string;
  readonly score: number | null;
  readonly issueCount: number;
  readonly errors: number;
  readonly warnings: number;
  readonly profile: string;
  readonly fingerprint: string | null;
  readonly docFingerprint: string | null;
  readonly selectionIds: Readonly<Record<string, string>>;
}
export function readAnalysisHistory(): readonly AnalysisHistoryEntry[];
export function prependAnalysisHistory(entry: AnalysisHistoryEntry): void;
export function deleteAnalysisHistoryEntry(id: string): void;
export function clearAnalysisHistory(): void;
~~~

- [ ] **Step 1: Verify current Supabase contracts before implementation**

Read the current changelog and official docs for email OTP verify, refresh token behavior, logout, PostgREST authorization with user JWT and Storage signed URLs. Record only implementation-relevant findings in the task review, not in product UI. If current docs conflict with src/auth/session.ts or src/report/repair-history.ts, stop and resolve before refactor.

- [ ] **Step 2: Write failing storage tests**

Test malformed, legacy and valid history arrays. Sanitizer mora izostaviti nepoznata polja, ograničiti listu na 20 i nikada čitati dokument bytes. Test auth storea očekuje isti AUTH_SESSION_KEY i da save(null) uklanja lokalni zapis. Test signOutSession očekuje logout zahtjev autoriziran user access tokenom, nikada secret ili service_role ključem, te lokalno uklanjanje sesije i nakon uspjeha i nakon mrežne ili serverske pogreške. Config test očekuje cijeli postojeći DEPLOYMENT_CONFIG default skup plus postojeći lekta.production.v2.1 dev override, bez izostavljenih polja i bez privatnih ključeva.

- [ ] **Step 3: Run RED**

Run: npx vitest run tests/browser-production-config.test.ts tests/analysis-history.test.ts tests/session.test.ts tests/analysis-progress.test.ts

- [ ] **Step 4: Implement services and migrate app.ts**

Premjestiti postojeći DEFAULT_PRODUCTION_CONFIG u DEFAULT_BROWSER_PRODUCTION_CONFIG bez promjene ili gubitka ijednog polja, payment linka, DEPLOYMENT_CONFIG endpointa ili lekta.production.v2.1 dev override ponašanja. accountClientConfig radi samo tipiziranu projekciju supabaseUrl i public anon ključa u postojeće AuthConfig i RepairHistoryConfig oblike.

app.ts prestaje imati vlastite STORAGE_KEYS.history, SESSION_KEY i duplicate loadProductionConfig logike. Adapter koji iz Analyzer result gradi AnalysisHistoryEntry ostaje uz app.ts, ali čitanje, brisanje i perzistencija idu kroz novi servis. signOutSession prema ugovoru potvrđenom u Step 1 šalje user access token, a lokalni store čisti u finally grani. Povratna vrijednost razlikuje potvrđenu serversku odjavu od lokalno dovršene odjave nakon mrežnog ili serverskog kvara. Ne raditi široki rewrite monolita.

- [ ] **Step 5: Run GREEN**

Run: npx vitest run tests/browser-production-config.test.ts tests/analysis-history.test.ts tests/session.test.ts tests/analysis-progress.test.ts tests/ui-app-smoke.test.ts tests/repair-history.test.ts

Expected: PASS i postojeći storage keyevi ostaju kompatibilni.

---

### Task 2: Polica Na ovom uređaju i siguran profil handoff

**Files:**

- Create: src/routes/my-work/my-work-controller.ts
- Create: src/routes/intake/workspace-query-handoff.ts
- Create: tests/my-work-controller.test.ts
- Create: tests/workspace-query-handoff.test.ts
- Modify: moji-radovi/index.html
- Modify: src/routes/my-work/main.ts
- Modify: src/routes/my-work/my-work.css
- Modify: src/routes/intake/main.ts
- Modify: src/routes/intake/intake-controller.ts
- Modify: tests/intake-controller.test.ts
- Modify: tests/local-document-session.test.ts

**Controller dependencies:**

~~~ts
export interface MyWorkLocalDependencies {
  readonly sessionStore: Pick<LocalDocumentSessionStore, 'list' | 'delete'>;
  readHistory(): readonly AnalysisHistoryEntry[];
  deleteHistory(id: string): void;
  now(): number;
}
export function mountMyWorkController(
  doc: Document,
  dependencies: MyWorkLocalDependencies,
): Promise<void>;
~~~

- [ ] **Step 1: Write failing local shelf tests**

Pokriti loading, prazno stanje, IndexedDB unavailable, valjanu sesiju, isteklu sesiju, povijest metapodataka i obje vrste brisanja. Session kartica smije prikazati naziv dokumenta jer ostaje na istom uređaju, ali test stubira fetch i očekuje nula mrežnih poziva.

Nastavak koristi /rad/#session=ID. Brisanje sesije kaže da uklanja privremenu lokalnu kopiju dokumenta. Brisanje history entryja kaže da uklanja samo zapis rezultata.

- [ ] **Step 2: Add profile handoff tests**

Povijest nudi "Nova provjera s ovim profilom". workspace-query-handoff dopušta samo unit i kanonski work slug iz LEVEL_SLUGS. Intake controller prima opcionalni workspaceSearch i nakon stvarnog uploada navigira na /rad/?unit=...&work=...#session=ID. Ne prenosi file name, fingerprint, score ili proizvoljne query parametre.

- [ ] **Step 3: Run RED**

Run: npx vitest run tests/my-work-controller.test.ts tests/workspace-query-handoff.test.ts tests/intake-controller.test.ts

- [ ] **Step 4: Implement local shelf**

HTML ima section#uredaj s odvojenim podnaslovima "Radovi za nastavak" i "Zapis prethodnih provjera". Nema lažnog gumba "Otvori dokument" za history entry bez session bytesa. sessionStore.list već briše/sakriva nevaljane zapise i ostaje izvor istine.

- [ ] **Step 5: Run GREEN**

Run: npx vitest run tests/my-work-controller.test.ts tests/workspace-query-handoff.test.ts tests/intake-controller.test.ts tests/local-document-session.test.ts tests/memory-workspace.test.ts

Expected: PASS.

---

### Task 3: Polica Na računu, OTP i Moji popravci

**Files:**

- Create: src/routes/my-work/account-shelf.ts
- Create: tests/my-work-account-shelf.test.ts
- Modify: moji-radovi/index.html
- Modify: src/routes/my-work/main.ts
- Modify: src/routes/my-work/my-work.css
- Modify: src/report/repair-history.ts
- Modify: tests/repair-history.test.ts
- Modify: tests/session.test.ts

**Account dependencies:**

~~~ts
export interface AccountShelfDependencies {
  readonly authConfig: AuthConfig;
  readonly repairConfig: RepairHistoryConfig;
  readonly sessionStore: SessionStore;
  requestOtp(email: string): Promise<OtpResult>;
  verifyOtp(email: string, token: string): Promise<SessionResult>;
  getAccessToken(): Promise<string | null>;
  signOut(): Promise<SignOutResult>;
  fetchJobs(token: string): Promise<RepairJob[]>;
  signDownload(token: string, path: string): Promise<string>;
  deleteJob(token: string, id: string): Promise<DeleteRepairOutcome>;
}
export function mountAccountShelf(
  doc: Document,
  dependencies: AccountShelfDependencies,
): void;
~~~

- [ ] **Step 1: Write failing signed-out and OTP tests**

Signed-out stanje jasno kaže da prijava vrijedi samo za račun i spremljene popravke. Pokriti slanje koda, promjenu e-maila, krivi kod, uspjeh, refresh failure i signOut dependency. Nakon neuspjele serverske odjave UI potvrđuje da je lokalna sesija uklonjena, ali pošteno upozorava da serversko opozivanje nije potvrđeno. Ne logirati email, JWT ili refresh token.

- [ ] **Step 2: Write failing repair list tests**

S user JWT-om učitati samo output postojeće fetchRepairJobs funkcije. Pokriti loading, empty, network error, status, datum, veličinu i broj izmjena. Download sinkrono otvara prazan tab prije await signed URL-a, zatim postavlja URL. Path se tretira kao neprozirna server vrijednost i ne koristi za odluku vlasništva.

Trajno brisanje ima copy: original i popravljeni dokument uklanjaju se sa servera. Uspjeh uklanja karticu tek nakon server ok odgovora. Neuspjeh je ostavlja.

- [ ] **Step 3: Run RED**

Run: npx vitest run tests/my-work-account-shelf.test.ts tests/repair-history.test.ts tests/session.test.ts

- [ ] **Step 4: Implement account shelf with existing clients**

Koristiti requestEmailOtp, verifyEmailOtp, getValidAccessToken, signOutSession, fetchRepairJobs, signRepairDownload i deleteRepairJob. Ne dodavati supabase-js. Ne koristiti user_metadata za autorizaciju. account-shelf ne radi SELECT bez user JWT-a i nikad ne šalje naziv lokalnog dokumenta.

U repair-history.ts izvući i testirati repairDownloadName kako hub i workspace ne driftaju.

- [ ] **Step 5: Run GREEN**

Run: npx vitest run tests/my-work-account-shelf.test.ts tests/repair-history.test.ts tests/session.test.ts

Expected: PASS.

---

### Task 4: Objaviti account odredište i zamijeniti stare utility slijepe ulice

**Files:**

- Modify: src/routes/shared/public-route-directory.json
- Modify: tests/public-route-directory.test.ts
- Modify: rad/index.html
- Modify: src/ui/app.ts in small focused patches
- Modify: tests/intake-first-routes.test.ts
- Create: tests/my-work-parity.test.ts

- [ ] **Step 1: Write failing release and parity tests**

Promijenjeni test očekuje account-repairs u released direktoriju s hrefom /moji-radovi/#racun. Paritet test mapira stare radnje:

- Povijest otvara /moji-radovi/#uredaj
- Moji popravci otvara /moji-radovi/#racun
- Učitaj profil ima ekvivalent "Nova provjera s ovim profilom"
- lokalno i server brisanje imaju ponašajne testove
- download koristi isti signed URL klijent

- [ ] **Step 2: Run RED**

Run: npx vitest run tests/public-route-directory.test.ts tests/my-work-parity.test.ts tests/intake-first-routes.test.ts

- [ ] **Step 3: Release destination and migrate controls**

Tek sada account-repairs mijenja release u core. Workspace utility gumbi postaju jasni linkovi prema hub sidrima. Stari history i repair modal markup smije se ukloniti samo ako svi paritetni testovi prolaze. app.ts binding funkcije koje više nemaju DOM cilj prvo ostaju no-op; mrtvi kod uklanjati zasebnim malim patchom uz ui-app-smoke i behavior testove.

- [ ] **Step 4: Run GREEN**

Run: npx vitest run tests/public-route-directory.test.ts tests/my-work-parity.test.ts tests/intake-first-routes.test.ts tests/ui-app-smoke.test.ts tests/repair-history.test.ts tests/analysis-history.test.ts

Expected: PASS.

---

### Task 5: Najviše dva kontekstualna alatna prijedloga

**Files:**

- Modify: src/ui/tool-suggestions.ts
- Modify: src/ui/finding-view-model.ts
- Modify: src/ui/triage-view.ts
- Modify: src/ui/app.ts in one focused render patch
- Modify: tests/tool-suggestions.test.ts
- Modify: tests/finding-view-model.test.ts
- Modify: tests/triage-view.test.ts
- Modify: tests/ux/roadmap-v2.spec.ts
- Create: tests/result-tool-suggestions.test.ts

**Interface:**

~~~ts
export function selectToolSuggestions(
  issues: readonly IssueLike[],
  context?: SuggestionContext,
  limit?: number,
): readonly ToolSuggestion[];
~~~

- [ ] **Step 1: Write failing selection tests**

Default limit je 2. Deduplicirati po canonical hrefu. Prioritet: literatura prije općeg citata, zatim naslovnica, opseg/kartice, citat i izjava. Nepovezani problem vraća prazno. Hrefovi su root-relative i zadržavaju podržani title-page query kontekst.

- [ ] **Step 2: Write failing render limit tests**

findingCardHtml više ne renderira action-tool na svakoj kartici. triage manual funnel ne duplicira Citat i Literatura linkove. resultGuide dobiva jednu grupu "Može pomoći" s najviše dva .result-tool-suggestion linka, target blank i rel noopener, tek nakon što rezultat postoji.

- [ ] **Step 3: Run RED**

Run: npx vitest run tests/tool-suggestions.test.ts tests/finding-view-model.test.ts tests/triage-view.test.ts

- [ ] **Step 4: Implement centralized handoff**

Koristiti otvorene nalaze istog result modela, ne raw tekst dokumenta. Prijedlog je pomoćni alat, ne popravak i ne dokaz spremnosti. Ne stavljati ga u globalni shell ili workspace rail.

- [ ] **Step 5: Run GREEN**

Run: npx vitest run tests/tool-suggestions.test.ts tests/finding-view-model.test.ts tests/triage-view.test.ts tests/result-tool-suggestions.test.ts

Expected: PASS i najviše dva linka.

---

### Task 6: UX, sigurnosni paritet i završni gate

**Files:**

- Create: tests/ux/my-work-hub.spec.ts
- Modify: tests/ux/global-route-shell.spec.ts
- Modify: tests/ux/roadmap-v2.spec.ts
- Verify: /, /rad/ i /moji-radovi/

- [ ] **Step 1: Add browser tests**

Na uređajnoj polici provjeriti empty, session continue, history metadata, profil handoff i obje lokalne delete potvrde. Na account polici stubirati OTP, repair list, signed download i delete ishode. Hash #racun fokusira account naslov. Iz svake temeljne rute iterirati sva released odredišta manifesta i dokazati da je svako dostupno u najviše dvije interakcije, bez disabled ili mrtvog linka. Keyboard, 390 px, 320 px, light, dark i axe moraju proći.

- [ ] **Step 2: Prove privacy boundaries**

Network recorder očekuje:

- nula zahtjeva pri čitanju lokalne police
- auth zahtjev tek nakon eksplicitnog OTP submit-a
- repair list tek s valjanim user JWT-om
- nema document bytes, file namea, scorea ili fingerprinta u auth/repair request bodyju
- lokalni upload i analiza i dalje rade bez prijave

- [ ] **Step 3: Run focused browser suite**

~~~bash
npx playwright test tests/ux/my-work-hub.spec.ts tests/ux/global-route-shell.spec.ts tests/ux/roadmap-v2.spec.ts tests/ux/repair-panel.spec.ts --workers=1 --reporter=line
~~~

- [ ] **Step 4: Run hard gate**

~~~bash
npm run check
node scripts/verify-dist-classification.mjs
git diff --check
~~~

- [ ] **Step 5: Final parity audit**

Ponovno proći upload, odabir profila, analizu, nalaze, details, repair, regression delivery order, izvještaje, preflight, report issue, order, waitlist, rok, privacy settings, local history, OTP, signed download i server delete. Nijedna funkcija se ne smatra sačuvanom samo zato što postoji link.

- [ ] **Step 6: Commit after scoped diff review**

Ponoviti git diff --stat nad config, auth store, history, my-work, intake handoff, route manifest, ciljanim app.ts patchom i testovima. Commit message: feat: deliver truthful my work hub.

Ne spajati u master, ne pushati i ne deployati u ovom planu.
