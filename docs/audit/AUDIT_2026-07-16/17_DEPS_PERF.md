# Ovisnosti, bundle i performanse (D11)

package.json ovisnosti, velicina bundlea, demo asseti, npm audit delta.

Nalaza u ovoj skupini: 5.

### AUD-52 — netlify-cli i supabase kao devDependencies uvlace 179 @netlify/* paketa (od 1429) i sve dev-only moderate/low advisoryje, a netlify-cli se ne poziva ni iz jednog npm skripta

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `package.json:31`
- Dokaz: "netlify-cli": "^26.2.0", "supabase": "^2.109.1" (devDependencies). Lockfile: 179 node_modules/@netlify/* + netlify-cli od ukupno 1429 instaliranih paketa; +10 @opentelemetry/*.
- Reprodukcija: node -e lockfile count => total 1429, @netlify/*+netlify-cli = 179, @opentelemetry/* = 10. grep 'netlify-cli' scripts u package.json => 0 poziva. Svih 18 moderate/low advisoryja u auditu dolazi iz ovog lanca (@netlify/*, @opentelemetry/*, ipx, unstorage).
- Preporuka: Makni netlify-cli iz devDependencies i deployaj preko 'npx netlify-cli' (doc to vec navodi kao alternativu na liniji 60-62); time nestaje i @opentelemetry peer napetost pa vitest 4 postaje cist install. supabase CLI isto svesti na npx ako se ne koristi u skriptama. Rezultat: ~13% manje instaliranih paketa i vecina audit povrsine nestaje.
- Verifikacija: package.json:31-32 'netlify-cli ^26.2.0' i 'supabase ^2.109.1' u devDependencies. grep 'netlify' u package.json daje samo taj devDep redak - nijedan npm skript ne poziva netlify-cli. Lockfile brojanje (@netlify/*) nisam neovisno prebrojio, ali osnovna tvrdnja (tezak devDep bez skript-poziva) je potvrdjena. Low.

### AUD-53 — Sest demo video datoteka (15.95 MB) commita se u git, neto +8.7 MB naspram starih koje zamjenjuju, plus se dupliciraju u deploy artefakt

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `public/assets/demo-1440.webm:0`
- Dokaz: public/assets/demo-{720,1080,1440}.{mp4,webm} = 15.945.056 B (6 datoteka, netrackirano/ ?? u git status). Zamjenjuju demo.mp4 (3.629.465 B) + demo.webm (3.603.684 B) = 7.233.149 B koje su D (obrisane).
- Reprodukcija: du -cb public/assets/demo-*.mp4 public/assets/demo-*.webm => 15945056. git cat-file -s HEAD:public/assets/demo.mp4 => 3629465; HEAD:public/assets/demo.webm => 3603684. Neto git delta +8.71 MB trajno u historiji; iste datoteke se kopiraju i u dist/assets/ (deploy).
- Preporuka: Ne stavljaj nekomprimirane binarne izvore u git history: Git LFS ili posluzi iz CDN/Netlify. Varijante 720/1440/1080 su adaptivne (korektorski.ts Q_MAP, preload=none) pa nisu na kritičnom putu, ali 15.95 MB binarnog u repou i deploy artefaktu je izbjezivo.
- Verifikacija: 6 datoteka public/assets/demo-{720,1080,1440}.{mp4,webm} = 15.945.056 B, sve untracked ('??'). Stare tracked: HEAD:demo.mp4=3.629.465, demo.webm=3.603.684 (=7.233.149, oznacene D). Neto delta +8,71 MB. Potvrdjeno, ali jos NECOMMITANO (latentno dok se ne 'git add').

### AUD-51 — NPM_AUDIT_ACCEPTED.md je zastario: stvarni npm audit je 23 ranjivosti (17 moderate), a dokument tvrdi 20 (14 moderate)

- Severity (finder -> konacni): Low -> **Info** | Verdikt: **REJECTED**
- Lokacija: `docs/audit/NPM_AUDIT_ACCEPTED.md:7`
- Dokaz: "`npm audit` prijavljuje **20 ranjivosti** (1 critical, 1 high, 14 moderate, 4 low)." -- stvarnost 2026-07-16: {critical:1, high:1, moderate:17, low:4, total:23}
- Reprodukcija: npm audit --json | metadata.vulnerabilities => total 23 (+3 moderate vs doc). Nova moderate meta: '@opentelemetry/core: Unbounded memory allocation in W3C Baggage propagation' (propagira na @opentelemetry/resources|sdk-trace-base|sdk-trace-node, @netlify/otel|blobs) + esbuild dev-server request advisory. Doc datiran 2026-07-12.
- Preporuka: Azuriraj brojke i datum u docu na 23 (17 moderate). Odluka 'prihvatiti' i dalje stoji jer 'npm audit --omit=dev --audit-level=high' = 0, ali re-verifikacijski korak iz samog doca ('usporedi klastere s gornjim popisom') sad ne odgovara pa reviewer dobiva laznu neuskladjenost.
- Verifikacija: Protudokaz: 'npm audit --json' u trenutnom stablu daje {critical:1, high:1, moderate:14, low:4, total:20} - TOCNO ono sto NPM_AUDIT_ACCEPTED.md:7 tvrdi (20, 14 moderate). Finderova tvrdnja o 23/17 moderate se NE reproducira; doc je uskladjen sa stvarnoscu. Odbaceno.

### AUD-54 — Nema automatskog bundle-size guarda: dva chunka prelaze vite prag 500 kB, a nista ne cuva da verified-profiles-heavy (865KB) ostane lazy

- Severity (finder -> konacni): Info -> **Info** | Verdikt: **CONFIRMED**
- Lokacija: `vite.config.ts:193`
- Dokaz: build: { target: 'es2022', rollupOptions: { input } } -- bez chunkSizeWarningLimit / manualChunks. tests/memory-budget.test.ts pokriva upload caps (uploadCapBytes/decompressionBudgetBytes), NE velicinu bundlea; grep bundle-size assert u tests/ = 0.
- Reprodukcija: dist/assets/index-*.js = 501.590 B (>500k => vite chunk warn), verified-profiles-heavy-*.js = 886.396 B (>500k). Heavy je lazy samo preko profile-registry.ts:43 dynamic import; golden-entry.ts:13 i drafts-runtime.ts:20 ga staticki uvoze (samo test/verification-console putanje). Regresija koja ga vrati u glavni graf prosla bi CI tiho.
- Preporuka: Dodaj CI/test guard koji mjeri gzip glavnog entry chunka (cilj iz perf audita ~150 KB gzip) i pukne na regresiju; opcionalno postavi build.chunkSizeWarningLimit svjesno umjesto tihog defaulta.
- Verifikacija: grep chunkSizeWarningLimit/manualChunks/verified-profiles-heavy u vite.config.ts -> 0. Nema bundle-size guarda. Heavy je lazy preko dynamic import u profile-registry.ts:43 (verified-profiles-heavy.json). Tocne bajt-velicine (501KB/886KB) nisam gradio, ali strukturna tvrdnja (nema guarda protiv regresije koja vrati heavy u glavni graf) je potvrdjena. Info.

### AUD-55 — PERFORMANCE_AUDIT.md performance-01 opisuje glavni chunk kao 2,4 MB / 369 KB gzip, ali light/heavy split je vec izveden pa je stvarni index 489 KB / 97 KB gzip

- Severity (finder -> konacni): Info -> **Info** | Verdikt: **CONFIRMED**
- Lokacija: `docs/audit/PERFORMANCE_AUDIT.md:53`
- Dokaz: "performance-01 | P1 | Glavni entry chunk 2,4 MB / 369 KB gzip na kritičnom putu, dominira ga autorski podatkovni sloj"
- Reprodukcija: gzip -c dist/assets/index-*.js | wc -c => ~99.500 B (97 KB); raw 501.590 B (489 KB). verified-profiles-heavy (865KB raw/99KB gzip) je izdvojen u zaseban lazy chunk. To je -74% gzip naspram dokumentiranih 369 KB, iznad stated acceptance cilja (-40%). Doc opisuje stanje prije splita.
- Preporuka: Azuriraj PERFORMANCE_AUDIT.md: performance-01 je efektivno rijesen (light indeks + heavy lazy), da se optimizacijski trud ne usmjerava na vec rijeseno; ostatak (performance-02 draftovi/source-registry) provjeri zasebno.
- Verifikacija: PERFORMANCE_AUDIT.md:53 performance-01 opisuje 'Glavni entry chunk 2,4 MB / 369 KB gzip'. Light/heavy split JE izveden: postoje verified-profiles-index.json + verified-profiles-heavy.json, lazy import u profile-registry.ts:43. Doc opisuje pred-split stanje. Tocne aktualne velicine nisam mjerio (bez builda), ali staleness dokumenta je potvrdjen. Info.

