# Testovi i CI (D10)

Build gate, vitest konfiguracija, GitHub Actions. Kljucni nalaz: passWithNoTests tihi zeleni prolaz.

Nalaza u ovoj skupini: 5.

### AUD-46 — passWithNoTests:true pretvara nul-kolekciju testova u tihi zeleni prolaz kroz tvrdi build gate

- Severity (finder -> konacni): Medium -> **Medium** | Verdikt: **CONFIRMED**
- Lokacija: `vitest.config.ts:9`
- Dokaz: passWithNoTests: true,  // unutar test:{} bloka; gate je `check: tsc --noEmit && vitest run && vite build`
- Reprodukcija: `npm run check` = ... && `vitest run` && ... ; ako `vitest run` skupi 0 test-datoteka (npr. izmjena include glob-a, preimenovanje tests/, ili toolchain incident: MEMORY dokumentira vitest 2.1.9 na Node 24 koji zna skupiti 0 testova) vitest izlazi s kodom 0 umjesto 1, pa `vite build` prodje i cijeli gate je zelen bez ijednog izvrsenog testa. Lokalni Node je 24.14.1, sto je upravo dokumentirana krhka kombinacija.
- Preporuka: Postavi passWithNoTests: false (default) da prazna kolekcija obori gate; opcionalno dodaj sentinel test koji tvrdi minimalan broj skupljenih datoteka, ili u CI koraku provjeri `vitest run --reporter=json` broj testova > 0.
- Verifikacija: vitest.config.ts:9 'passWithNoTests: true' unutar test:{} bloka; gate je tsc && vitest run && vite build. Nul-kolekcija (izmjena include/exclude glob-a, preimenovanje tests/, ili Node-24 vite-node incident iz MEMORY) daje exit 0 pa gate prolazi zeleno bez ijednog testa. Lokalni Node je 24.14.1. Realan tihi prolaz.

### AUD-47 — CI nema skeniranje tajni ni SAST; jedini sigurnosni workflow je npm audit produkcijskih ovisnosti

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-07
- Lokacija: `.github/workflows/security-audit.yml:31`
- Dokaz: run: npm audit --omit=dev --audit-level=high  (jedini security job; nema gitleaks/trufflehog za tajne ni CodeQL/Semgrep za kod)
- Reprodukcija: Staticki. Repo sadrzi supabase/ Edge funkcije, migracije i (po MEMORY) hardkodirane zive Supabase/waitlist endpointe; commitana tajna ili injection/XSS obrazac ne bi bili uhvaceni nijednim CI korakom jer audit pokriva samo CVE-ove ovisnosti.
- Preporuka: Dodaj CI job za skeniranje tajni (gitleaks ili trufflehog) na push/PR i SAST job (CodeQL za JS/TS ili Semgrep), oba kao gate na PR-u.
- Verifikacija: security-audit.yml:31 'npm audit --omit=dev --audit-level=high' je jedini security job; grep gitleaks/codeql/semgrep/trufflehog po .github/workflows -> 0 pogodaka. Repo ima supabase/ Edge funkcije i migracije; tajna ili injection obrazac ne bi bili uhvaceni. Potvrdjeno, ali Low (klijentska app, CVE-audit ipak postoji).

### AUD-48 — Tri gate-workflowa ne postavljaju eksplicitni permissions blok pa nasljeduju default GITHUB_TOKEN dozvole

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `.github/workflows/check.yml:12`
- Dokaz: check.yml, docx-smoke.yml i security-audit.yml nemaju `permissions:` (grep nasao samo training-pipeline.yml:34 `permissions:` -> `contents: read`).
- Reprodukcija: Staticki. Bez eksplicitnog least-privilege bloka token dobiva default dozvole repozitorija/organizacije (kod starijih repo/org postavki read-write-all), sto je nepotreban supply-chain povrsina jer ti workflowi nista ne pisu (nema deploya).
- Preporuka: Dodaj `permissions: contents: read` na vrh check.yml, docx-smoke.yml i security-audit.yml (isti obrazac kao training-pipeline.yml).
- Verifikacija: grep 'permissions:' po workflowima: samo training-pipeline.yml:34 (contents: read). check.yml, docx-smoke.yml, security-audit.yml nemaju permissions blok pa nasljeduju default GITHUB_TOKEN dozvole. Ti workflowi nista ne pisu pa je to nepotrebna povrsina. Potvrdjeno, Low.

### AUD-49 — CI pinira Node 20 dok se projekt vrti na Node 24; nema version matrice pa gate ne pokriva verziju koju developeri koriste

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `.github/workflows/check.yml:22`
- Dokaz: node-version: 20  (isto u docx-smoke.yml:22, security-audit.yml:24). Lokalno okruzenje: node v24.14.1, vitest 2.1.9.
- Reprodukcija: Staticki (usporedba verzija). MEMORY dokumentira Node-24-specificne probleme s kolekcijom vitesta; CI zelen na Node 20 ne dokazuje zeleno na verziji koju developer stvarno pokrece lokalno, a u kombinaciji s passWithNoTests:true Node-24 nul-kolekcija bi lokalno prosla nezapazeno.
- Preporuka: Dodaj Node matricu (20 + 24) u check.yml, ili pinaj podrzanu verziju kroz engines + .nvmrc i uskladi CI s njom.
- Verifikacija: check.yml:22, docx-smoke.yml:22 'node-version: 20', security-audit.yml:24 isto (training-pipeline.yml:49 '20'). Lokalno Node 24.14.1. CI ne pokriva verziju koju developer koristi; u kombinaciji s AUD-46 Node-24 nul-kolekcija bi lokalno prosla tiho. Potvrdjeno, Low.

### AUD-50 — Zastarjeli docstring sintetickog goldena tvrdi da Legal Citation Engine (fusnote) NIJE pokriven, iako case pravo-integrirani-fusnote postoji i tjera engine

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `tests/synthetic-golden.test.ts:12`
- Dokaz: Komentar: 'docx-builder zasad ne radi fusnote, pa Legal Citation Engine (fusnote, op. cit., Ibid.) NIJE pokriven ovdje.' -- ali datoteka definira pravoLegalSpec() s poljem footnotes, CORPUS ukljucuje 'pravo-integrirani-fusnote', docx-builder emitira word/footnotes.xml (helpers/docx-builder.ts:107,227) i snapshot ima 87 pogodaka za ibid/op.cit/fusnot.
- Reprodukcija: Staticki (komentar vs kod). Rizik: odrzavatelj koji vjeruje komentaru misli da golden ne stiti citation engine pa ga refaktorira bez svijesti da ga snapshot cuva, cime krsi CLAUDE.md pravilo 'ne diraj parser bez golden testa'.
- Preporuka: Azuriraj ili ukloni odlomak docstringa (retci 12-14) tako da odrazava da su fusnote i Legal Citation Engine sada pokriveni case-om pravo-integrirani-fusnote.
- Verifikacija: synthetic-golden.test.ts:12 komentar 'docx-builder zasad ne radi fusnote, pa Legal Citation Engine ... NIJE pokriven ovdje' je zastario: ista datoteka ima pravoLegalSpec():75 s poljem footnotes:92, CORPUS 'pravo-integrirani-fusnote':153, a tests/helpers/docx-builder.ts:227 emitira word/footnotes.xml. Snapshot ima 41 ibid/opcit/fusnot pogodaka (finder rekao 87 - broj precijenjen, ali engine JEST pokriven). Zavaravajuci komentar.

