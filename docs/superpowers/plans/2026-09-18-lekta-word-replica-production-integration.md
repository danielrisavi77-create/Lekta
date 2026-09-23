# Lekta + WordReplica Production Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pustiti u produkciju jedan stabilan, trusted Authenticode-potpisan `LektaRepair.exe` koji za jedan placeni Lekta posao sigurno claimuje potpisani Repair Contract, lokalno izradi novi DOCX, posalje potpisani zavrsni dokaz i ukloni vlastite osjetljive artefakte nakon uspjeha.

**Architecture:** Lekta ostaje autoritet za placanje, entitlement, izvorni i serverski popravljeni DOCX, P-256 Repair Contract, claim i lifecycle. WordReplica ostaje lokalni Pure-DOCX engine u jednom portable PyInstaller EXE-u; isti binarni artefakt se svakom poslu samo preuzima pod tokeniziranim imenom. Produkcijski release je disabled-first: prvo dokazuje identitet koda, artefakta, publishera i contract kljuca, zatim objavljuje migracije, Edge funkcije, web i runner, a kill switch uklanja posljednji.

**Tech Stack:** Vite, TypeScript strict, Vitest, Deno Edge checks, Supabase CLI 2.109.1, Netlify CLI, Python 3.12, PyInstaller, `cryptography`, pytest, PowerShell 5.1, Microsoft Authenticode, Windows 10/11, Microsoft Word kao zavrsni oracle i aplikacija za otvaranje izlaza.

**Spec:** `docs/superpowers/specs/2026-09-11-lekta-wordreplica-release-key-binding-design.md`

## Global Constraints

- Primarni distribucijski kanal je izravni portable EXE, ne MSIX i ne Microsoft Store.
- Distribuira se jedan stabilan `LektaRepair.exe`; novi EXE po korisniku ili poslu nije dopusten.
- Repair Contract i device/status potpisi ostaju ECDSA P-256. Ed25519 migracija nije u opsegu.
- WordReplica runtime koristi Pure-DOCX za popravak. Microsoft Word nije serverska ovisnost niti se automatizira na serveru.
- Izvorni dokument ostaje nepromijenjen. Rezultat se zapisuje kao novi DOCX u mapu koju odabere korisnik.
- Claim token je jednokratan, kratkotrajan i nakon prvog valjanog claima vezan uz P-256 device key za trenutnog Windows korisnika.
- Recoverable kvar ne trosi drugi placeni slot i ne brise stanje potrebno za nastavak. Entitlement se smatra dovrsenim tek nakon valjanog `completed` statusa.
- Nakon uspjeha brisu se runnerovi app-owned tokeni, kljucevi, ugovor, workspace, privremeni dokumenti i trenutni EXE. Ne tvrdi se da se brisu browser history, Windows Prefetch, Defender evidencija, NTFS journal, crash dumpovi ili Word MRU.
- Produkcijski EXE mora imati `Get-AuthenticodeSignature(...).Status == Valid`, RFC 3161 timestamp i publisher koji odgovara neovisno pregledanom thumbprintu.
- Self-signed certifikat, nepotpisani EXE i Store-potpis koji nije rezultat odobrenog MSIX kanala nisu produkcijski identitet.
- Ako je vlasnik verificirana organizacija s EU Azure tenantom i pretplatom, dopusten je Artifact Signing. Za fizicku osobu u Hrvatskoj zadani put je OV code-signing certifikat od CA-a u Microsoft Trusted Root Programu.
- Sve Supabase migracije idu iskljucivo kroz `supabase db push`, nikad kroz MCP `apply_migration`.
- Privatni contract kljuc, DB lozinka, Supabase token, Netlify token i signing PIN nikad ne idu u Git, argumente procesa, plan, standardni izlaz ili izvjestaj.
- Lekta gate se mjeri u cistom izoliranom worktreeju. WordReplica release build se radi samo iz cistog `automation-dev` stabla.
- Produkcijski release ne pocinje dok su Lekta feature commitovi ili WordReplica release commit samo lokalni. Oba repozitorija moraju imati pregledane i pushane tocne SHAs.
- Izvrsenjem je WordReplica kandidat promaknut na `81f1f420de0e71b7c853059790bec7bf665ead53`. Lekta jezgra integracije vec je squash-mergeana u `master` commitom `164dd160`; zavrsni pravni i release patch gradi se na aktualnom `origin/master` `98e905c0f4cba9065143144a0e8f970652515fbc`. Konacni Lekta release SHA ponovno se snima nakon PR mergea i zelenog CI-ja na merge commitu.

## File and Responsibility Map

### WordReplica, `C:\WordReplica-Automation\repo`

- `BUILD_LEKTA_REPAIR_RUNNER.ps1`: jedini produkcijski build i signing ulaz za `LektaRepair.exe` i manifest v2.
- `src/word_replica/runner/portable_entry.py`: tokenizirano ime, izbor izlazne mape i samobrisanje nakon uspjeha.
- `src/word_replica/runner/one_shot.py`: claim, izvrsenje, potpisani statusi, checkpoint, retry i completion receipt.
- `src/word_replica/runner/secure_retry.py`: DPAPI-zasticeni claim/retry state i app-owned workspace cleanup.
- `src/word_replica/runner/lekta_claim.py`: fail-closed claim ugovor i P-256 device identitet.
- `src/word_replica/runner/lekta_status.py`: kanonski potpisani lifecycle eventovi.
- `src/word_replica/runner/trust_store.py`: ugradeni javni contract kljuc i kanonski SPKI fingerprint.
- `tests/unit/test_lekta_*.py`, `tests/unit/test_repair_package_service.py`: runner, release, retry, cleanup i package regresijski gateovi.

### Lekta

- `supabase/migrations/0200_repair_local_claims.sql`: local-job identitet, claimable stanje i atomski claim.
- `supabase/migrations/0201_repair_local_lifecycle.sql`: monotoni potpisani lifecycle i completion dokazi.
- `supabase/migrations/0202_repair_local_claim_recovery.sql`: idempotentni oporavak izgubljenog claim odgovora i ciscenje bearer materijala.
- `supabase/functions/repair-docx/index.ts`: izdavanje placenog local-repair posla i Repair Contracta.
- `supabase/functions/repair-local-claim/index.ts`: javni bearer claim endpoint iza kill switcha.
- `supabase/functions/repair-local-status/index.ts`: javni P-256 autentificirani status endpoint iza kill switcha.
- `src/report/local-repair-runner-download.ts`: provjera javnog runner hash-a, tokenizirano lokalno ime i korisnicke upute.
- `src/ui/local-repair-confirmation-flow.ts`: eksplicitna potvrda korisnika prije lokalnog toka.
- `scripts/local-repair-release-gate.mts`: manifest, artifact, publisher, source commit i contract-key trust policy.
- `scripts/local-repair-secret-staging.mts`: ograniceni privremeni `env` za Supabase tajne.
- `scripts/local-repair-migration-workspace.mts`: izolirani fetch, identitet, dry-run i `db push` migracija.
- `scripts/local-repair-runner-publish.mts`: Netlify site pinning, build env i provjereni runner u `dist`.
- `scripts/run-local-repair-release.mts`: kanonski disabled-first produkcijski orkestrator.
- `scripts/run-repair-runner-e2e.mts`: stvarni cross-repo razvojni EXE E2E.
- `docs/LOCAL_REPAIR_RELEASE.md`: operatorski release ugovor.
- `tests/repair-local-*.test.ts`, `tests/repair-runner-*.test.ts`: SQL, Edge, UI, release i cross-language dokaz.

---

### Task 1: Freeze and promote the exact source candidates

**Repositories:** Lekta and WordReplica.

**Produces:** Dva pregledana, pushana i nepromjenjiva source SHA-a koja ulaze u svaki sljedeci dokaz.

- [ ] **Step 1: Snimi pocetno stanje bez promjena**

Run in Lekta integration worktree:

```powershell
git status --short --branch
git rev-parse HEAD
git log origin/master..HEAD --oneline
npm run master-ci
```

Run in WordReplica:

```powershell
git status --short --branch
git rev-parse HEAD
git log origin/automation-dev..HEAD --oneline
```

Expected: oba stabla su cista. Svaki lokalni commit je imenovan u release zapisu. `master-ci` je zelen ili release zapis izricito kaze `CRVENO`/`NE ZNAM`; ta dva ishoda ne smiju biti predstavljena kao zelen master.

- [ ] **Step 2: Pregledaj nepushane commitove po sadrzaju**

Run:

```powershell
git diff --stat origin/master...HEAD
git diff --check origin/master...HEAD
git -C C:\WordReplica-Automation\repo diff --stat origin/automation-dev...HEAD
git -C C:\WordReplica-Automation\repo diff --check origin/automation-dev...HEAD
```

Expected: nema whitespace pogresaka, nema tajni, privatnih dokumenata, generiranih EXE-ova ni nepovezanih promjena.

- [ ] **Step 3: Pokreni ciljane pre-promotion testove**

Run in Lekta:

```powershell
npx vitest run tests/repair-local-claim-sql.test.ts tests/repair-local-lifecycle-sql.test.ts tests/repair-local-claim-http.test.ts tests/repair-local-status-http.test.ts tests/repair-local-release-gate.test.ts tests/repair-local-release-cli.test.ts tests/repair-local-secret-staging.test.ts tests/repair-local-runner-publish.test.ts tests/repair-local-release-entrypoint.test.ts tests/repair-local-runner-e2e.test.ts tests/repair-runner-executable-e2e.test.ts
```

Run in WordReplica:

```powershell
C:\WordReplica-Automation\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider tests/unit/test_lekta_one_shot_runner.py tests/unit/test_lekta_one_shot_status_reporting.py tests/unit/test_lekta_portable_entry.py tests/unit/test_lekta_runner_claim.py tests/unit/test_lekta_runner_http.py tests/unit/test_lekta_runner_review_regressions.py tests/unit/test_lekta_runner_status.py tests/unit/test_lekta_runner_trust_store.py tests/unit/test_lekta_secure_retry_store.py tests/unit/test_lekta_word_preflight.py tests/unit/test_repair_package_service.py tests/unit/test_lekta_runner_release_build.py
```

Expected: nula palih testova. Svaki pad zaustavlja freeze; popravak dobiva zaseban TDD ciklus i novi SHA.

- [ ] **Step 4: Push and protect candidates**

Pushaj WordReplica samo na `automation-dev`. Lekta zavrsni patch pushaj na novu PR granu izvedenu iz aktualnog `origin/master`, bez ponovnog spajanja stare feature povijesti. Nakon pusha ponovno procitaj oba remote SHA-a i zapisi ih kao `WORDREPLICA_RELEASE_SHA` i `LEKTA_INTEGRATION_SHA` izvan repozitorija.

Expected: lokalne grane odgovaraju svojim pushanim remote granama i `git -C C:\\WordReplica-Automation\\repo log origin/automation-dev..HEAD` je prazan.

### Task 2: Obtain the production publisher identity and build one stable runner

**Human gate:** Vlasnik mora dovrsiti identitetsku provjeru signing providera i omoguciti upotrebu kljuca/HSM-a. Codex ne moze sam izdati pravni publisher identitet.

**Produces:** `LektaRepair.exe`, manifest v2 i neovisni release zapis s hashom i publisher identitetom.

- [ ] **Step 1: Zakljucaj signing put**

Default za fizicku osobu u Hrvatskoj: OV code-signing certifikat u Windows certificate storeu ili podrzanom cloud HSM-u. Artifact Signing koristi se samo ako je dostupan verificiranoj EU organizaciji s aktivnom Azure pretplatom.

Acceptance:

- certifikat se veze uz stvarni publisher identitet;
- privatni kljuc nije izvoziv kao nezausticeni PFX;
- dostupan je RFC 3161 SHA-256 timestamp server;
- `Get-AuthenticodeSignature` na probnom potpisu vraca `Valid`;
- thumbprint je spremljen u neovisni release zapis, ne kopiran iz buduceg manifesta.

- [ ] **Step 2: Generiraj ili potvrdi produkcijski P-256 Repair Contract par**

Private key ostaje samo u odobrenom secret storeu. Public key ide WordReplica buildu. Iz public SPKI-ja izracunaj i neovisno spremi lowercase SHA-256 fingerprint i key ID. Ne rotiraj ovaj kljuc u istom koraku u kojem se mijenja Repair Contract format.

- [ ] **Step 3: Izgradi i potpisi stabilni EXE iz cistog `automation-dev` SHA-a**

Run in WordReplica after setting the release environment variables:

```powershell
$releaseDir = 'C:\WordReplica-Automation\release\lekta-repair-0.1.0'
& .\BUILD_LEKTA_REPAIR_RUNNER.ps1 `
  -PublicKeyPath $env:LEKTA_REPAIR_PUBLIC_KEY_PATH `
  -KeyId $env:LEKTA_REPAIR_EXPECTED_CONTRACT_KEY_ID `
  -GeneratedTrustStorePath (Join-Path $releaseDir 'trusted_keys.json') `
  -OutputDirectory $releaseDir `
  -SigningMode CertificateStore `
  -SigningCertificateThumbprint $env:LEKTA_REPAIR_EXPECTED_PUBLISHER_THUMBPRINT `
  -TimestampServer $env:LEKTA_REPAIR_TIMESTAMP_SERVER
```

If and only if the approved provider is Artifact Signing, run the same script with `-SigningMode ArtifactSigning` and the three Artifact Signing path arguments required by the build script.

Expected: build script itself runs the focused runner suite, produces exactly one stable `LektaRepair.exe`, verifies the embedded trust store, signs and re-verifies `Valid`, then writes `lekta-repair-runner-manifest.json` schema v2.

- [ ] **Step 4: Independently verify the artifact**

Run:

```powershell
$releaseDir = 'C:\WordReplica-Automation\release\lekta-repair-0.1.0'
Get-AuthenticodeSignature -LiteralPath (Join-Path $releaseDir 'LektaRepair.exe') | Format-List Status,StatusMessage,SignerCertificate,TimeStamperCertificate
Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $releaseDir 'LektaRepair.exe')
Get-Content -Raw -LiteralPath (Join-Path $releaseDir 'lekta-repair-runner-manifest.json')
```

Expected: signature `Valid`; stvarni hash, velicina, publisher thumbprint, source SHA, branch, engine version, key ID i public-key fingerprint potpuno odgovaraju manifestu i neovisnom release zapisu.

### Task 3: Prove the exact cross-repo pair before production

**Consumes:** `WORDREPLICA_RELEASE_SHA`, `LEKTA_INTEGRATION_SHA`, potpisani EXE i manifest v2.

**Produces:** Puni lokalni dokaz da isti par commitova prolazi oba repozitorija i stvarni EXE tok.

**Execution checkpoint, 2026-09-22:** tocni par prije mergea je Lekta `2808cc381e4df0c4a27c2b0b528241ae7c5b4ad0` i WordReplica `81f1f420de0e71b7c853059790bec7bf665ead53`. WordReplica CI na tom SHA-u prosao je Linux i Windows non-Word suite. Golden runovi `20260922T094907Z_81f1f420` i `20260922T104855Z_81f1f420` imaju isti source SHA `2cf2207f673f0ff1613176c9ac696fc1d935b4760331df132a1ef3ca238c56d8`, G0-G9 `FULL PASS` i zavrsno stanje `FULL PASS x2 - PROMOTION READY`. Oba runa dokazala su namjerni checkpoint recovery nakon iscrpljenog kratkog COM retry budgeta na velikoj tablici. Cross-repo E2E prosao je dvaput na istim SHA-ovima, s atomarnim claimom, `processing -> completed`, punim QA prolazom, nepromijenjenim stablima i bez zaostalih Word procesa. Lekta izolirani `npm run check` prosao je s 604 test files i 6861 testova, a ponovljeni GitHub Foundation check je zelen. Adversarijalni pregled nije nasao novi actionable defect; ogranicenje dokaza je isti-provider self-review jer drugi agent nije bio dopusten u ovoj sesiji.

- [x] **Step 1: Run the complete WordReplica suite**

```powershell
C:\WordReplica-Automation\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --basetemp C:\WordReplica-Automation\diagnostics\pytest-production-release
```

Expected: nula failures i nula errors. Preskoceni Windows/Word test nije dokaz za Word sloj i mora biti posebno evidentiran.

- [x] **Step 2: Run two same-commit WordReplica Golden oracles**

Pokreni kanonski Golden #1/oracle iz WordReplica `AGENTS.md` dvaput bez promjene commita, izvornog DOCX-a, Word builda ili fontova.

Expected: oba izvjestaja imaju isti source SHA, isti `WORDREPLICA_RELEASE_SHA`, isti environment fingerprint i G0-G9 `FULL PASS`; drugi izvjestaj potvrduje promotion readiness. Ne zatvaraj nijedan Word proces koji nije dokazano vlasnistvo testa.

- [x] **Step 3: Run the complete Lekta gate in an isolated clean worktree**

Before starting, verify at least 1 GB free RAM. Then run:

```powershell
npm run orphan-scan
npm run check
```

Read the `Test Files` summary, not only process exit code. Expected: nula failed test files, Deno Edge check green, Vite build green and no private-layer classification leak.

- [x] **Step 4: Run the real cross-repo executable E2E twice**

```powershell
npm run repair:runner:e2e
npm run repair:runner:e2e
```

Expected on both runs, on unchanged SHAs:

- `LektaRepairDev.exe` or the harness-selected exact runner launches as a separate process;
- exactly one claim succeeds;
- source and target are downloaded exactly once;
- status order is `processing` followed by `completed`, or a tested `retryable` then resumed `processing/completed` path;
- every status signature verifies against the claimed P-256 device key;
- output and report hashes equal independently recomputed hashes;
- second claim is rejected;
- original bytes remain unchanged;
- output opens without Word repair;
- diagnostics contain no claim token or private contract key.

- [x] **Step 5: Adversarially review the security boundary**

Review claim replay, lost response recovery, sequence rollback, stale signed URL, wrong project/site, wrong key, wrong artifact, token disclosure, temporary secret ACL, cleanup target validation and kill-switch ordering. Every actionable finding is reverified and fixed through RED/GREEN before release SHAs are re-frozen.

### Task 4: Merge the final Lekta release patch into `master` and prove the merge commit

**Produces:** A clean, CI-green Lekta `master` commit from which production is built.

- [ ] **Step 1: Build the final patch directly from current `origin/master` in an isolated worktree**

Core local-repair integration is already present in `master` through squash commit `164dd160`. Do not merge the old 15-commit feature history a second time. The final PR contains only reviewed production-readiness changes based on current master.

- [ ] **Step 2: Re-run focused tests, `npm run orphan-scan`, and full `npm run check` on the resulting merge candidate**

Expected: same requirements as Task 3. A green feature SHA does not substitute for proof of the final merge SHA.

- [ ] **Step 3: Open and merge the reviewed PR into `master`**

Required merge evidence:

- remote CI green on the exact merge candidate;
- no unrelated files;
- no migration identity drift;
- no deploy drift introduced by stale Edge sources;
- reviewer confirms direct portable EXE architecture, P-256 contract, kill switch and no MSIX scope.

- [ ] **Step 4: Record `LEKTA_PRODUCTION_SHA` and verify `npm run master-ci`**

Expected: `origin/master` points to the approved merge commit and `master-ci` returns green. If it returns red or unknown, deployment stops.

### Task 5: Complete production readiness and legal/user-facing gates

**Produces:** Production environment and user copy that truthfully describe the local executable and document handling.

- [ ] **Step 1: Verify access without displaying secrets**

Confirm availability of `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and either the approved Netlify token/site pair or the already authenticated and correctly linked CLI. Confirm Supabase project `zrrjttizjyfcxmcpgzml` and Netlify site `1e7526f5-7f0a-480e-8589-d79ee91ff7b0` / `https://lektahr.netlify.app`.

- [ ] **Step 2: Verify database and deployed-function identity before mutation**

```powershell
npm run migration-identity
npm run deploy-drift
```

Expected: known state only. Any new remote-only migration is reviewed, tied to origin evidence and added to the migration allowlist before release. Do not regenerate an allowlist merely to make the check green.

- [ ] **Step 3: Review visible copy and generated legal pages**

Verify that `src/report/local-repair-runner-download.ts` and generated privacy/terms pages state all of the following truthfully:

- the EXE is for Windows 10/11 and one paid repair;
- the original document is not overwritten;
- a new DOCX is produced locally;
- WordReplica is an internal engine, not a separate purchased license;
- copy razlikuje Pure-DOCX runtime od release/canary Word oraclea i ne tvrdi da Microsoft Word verificira svaki korisnicki run ako to produkcijski kod stvarno ne radi;
- recoverable failure can require rerunning the same EXE;
- runner-owned sensitive artifacts are removed after success;
- no promise says that all Windows/browser traces are erased;
- server retention and erasure copy still matches the existing `repair_jobs`/Storage behavior.

If copy or legal sources change, add/update their tests first, regenerate only through the canonical legal generator, then re-run `npm run check`.

- [ ] **Step 4: Close the paid-commerce legal gate**

Before paid GA, populate the confirmed provider OIB and phone in `data/legal/provider.json`; while they are absent, the application must continue to state that registration is incomplete and the service is not charged. Verify that the Merchant of Record sends durable confirmation of the contract and the recorded express consent. Croatian Consumer Protection Act Article 81.a requires an easily available online withdrawal function while the statutory withdrawal period exists. Provide that function wherever the right remains, or obtain and record Croatian legal review confirming why the immediate digital-content exception in Article 86(1)(13) removes it for this exact checkout and delivery flow. Do not infer the exception from code alone.

- [ ] **Step 5: Prepare independent trust inputs**

Set these in the operator's process from the reviewed release record, not by parsing the adjacent manifest:

```powershell
$env:LEKTA_REPAIR_EXPECTED_PUBLISHER_THUMBPRINT
$env:LEKTA_REPAIR_EXPECTED_CONTRACT_KEY_ID
$env:LEKTA_REPAIR_EXPECTED_CONTRACT_PUBLIC_KEY_SHA256
$env:LEKTA_REPAIR_REVIEWED_WORDREPLICA_COMMIT
$env:LEKTA_REPAIR_REVIEWED_ARTIFACT_SHA256
$env:LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL
```

Expected: first five are public release evidence; the sixth remains private and absent from shell history, logs and child environments.

### Task 6: Run the fail-closed production preflight

**Produces:** A dry proof that every local and remote prerequisite matches before the first mutation.

- [ ] **Step 1: Run preflight from clean `LEKTA_PRODUCTION_SHA`**

```powershell
npm run release:repair:preflight -- --artifact C:\WordReplica-Automation\release\lekta-repair-0.1.0\LektaRepair.exe
```

Expected:

- manifest schema v2 accepted;
- actual EXE hash and size match manifest and independent reviewed hash;
- actual signer, manifest signer and expected publisher thumbprint agree;
- private P-256 key, expected public fingerprint and manifest fingerprint agree;
- key ID, WordReplica commit, clean source branch and engine version agree;
- local migrations 0200, 0201 and 0202 are present and approved;
- no Supabase link, secret write, migration, function deploy or Netlify deploy occurs.

- [ ] **Step 2: Preserve a redacted preflight record outside Git**

Record `LEKTA_PRODUCTION_SHA`, `WORDREPLICA_RELEASE_SHA`, artifact SHA-256, manifest SHA-256, publisher thumbprint, contract public fingerprint, key ID, engine version, timestamp certificate identity, operator time and preflight result. Never record private keys, bearer tokens, DB passwords or temporary secret paths.

### Task 7: Execute the disabled-first production release

**Produces:** Migracije, Edge funkcije, web i runner objavljeni na kanonskim produkcijskim odredistima, s aktivacijom kao zadnjim korakom.

- [ ] **Step 1: Start the canonical release**

```powershell
npm run release:repair:deploy -- --artifact C:\WordReplica-Automation\release\lekta-repair-0.1.0\LektaRepair.exe
```

- [ ] **Step 2: Verify the exact remote order from logs**

Required order:

1. link only to Supabase `zrrjttizjyfcxmcpgzml`;
2. run Lekta integration gate and Netlify production build with pinned runner URL/hash;
3. copy and re-hash runner inside final `dist/downloads/LektaRepair.exe`;
4. run final `verify-deploy-dist` over that exact `dist`;
5. set `REPAIR_LOCAL_DISABLED=true` as the first remote mutation;
6. stage private key, key ID and `REPAIR_LOCAL_ENABLED=false` while disabled remains true;
7. fetch/verify full migration history, dry-run exactly 0200, 0201, 0202, then `supabase db push`;
8. deploy `repair-local-claim`, `repair-local-status`, then `repair-docx`;
9. deploy the already-built `dist` to the pinned Netlify production site;
10. set `REPAIR_LOCAL_ENABLED=true` while disabled remains true;
11. set `REPAIR_LOCAL_DISABLED=false` as the last mutation.

Expected: every secret phase uses one restricted temporary `--env-file` and deletes it on success or failure. Any failure stops later phases. No automatic rollback may pretend unknown remote state was restored.

- [ ] **Step 3: Verify deployed artifact and endpoints**

Download `https://lektahr.netlify.app/downloads/LektaRepair.exe` to a fresh path and independently compare its SHA-256 and Authenticode signer with the release record. Verify claim/status endpoints return the documented disabled/authentication response for malformed or unauthorized requests and never disclose whether an arbitrary job exists.

### Task 8: Run controlled production canaries

**Produces:** Evidence that payment-to-output works on real production infrastructure and that failure recovery does not consume a second repair.

- [ ] **Step 1: Normal paid canary on a clean Windows user profile**

Use a real test customer account and one real paid/test-mode entitlement. Keep one unrelated Word document open. Complete the Lekta repair flow and verify:

- one local job is issued for one slot;
- downloaded bytes equal the reviewed stable EXE even though the local filename contains job ID/token;
- Windows shows the expected verified publisher;
- user chooses only the output folder, not a replacement source document;
- original source SHA-256 is unchanged;
- output filename is distinct and output opens successfully;
- unrelated Word document remains open and unchanged;
- database state reaches `completed` once;
- stored output/report hashes match independently recomputed values;
- app-owned retry/job directory is removed after the acknowledged completion;
- current portable EXE self-deletes after process exit;
- serverska repaired copy remains available through the existing Lekta recovery/download path.

- [ ] **Step 2: Crash/retry canary**

Use a second paid test slot. Interrupt the runner after claim but before completion, then run the same downloaded EXE again.

Expected: same DPAPI-bound device identity resumes; no second claim or second paid slot is consumed; checkpoint is validated; final sequence is monotonic; one `completed` receipt is accepted; cleanup happens only after confirmed success.

- [ ] **Step 3: Abuse and expiry canary**

Verify all cases fail closed:

- same token from a different device key after claim;
- second claim after completion;
- expired unclaimed token;
- changed EXE bytes;
- wrong contract signature/key ID;
- replayed lower sequence status;
- same sequence with different event hash;
- output path outside the selected directory.

- [ ] **Step 4: Word fidelity canary**

Open the produced DOCX with `OpenAndRepair=false`, update fields where the contract permits it and compare visible author text with the source under the repository's Tier 2 rules. Expected: no unexpected repair prompt, no unauthorized visible-text change, and every allowed exception is already covered by its named oracle.

### Task 9: Observe, decide GA, and retain a fast rollback

**Produces:** Limited rollout promoted to general availability only with measured evidence.

- [ ] **Step 1: Observe for 24 hours with the local kill switch ready**

Monitor aggregate counts only:

- issued, claimed, processing, retryable, completed, local_failed and expired jobs;
- issue-to-completed conversion;
- median and p95 claim-to-completed duration;
- duplicate/replay rejection count;
- signature/contract rejection count;
- EXE download hash mismatch count;
- cleanup failures reported by the runner;
- SmartScreen reports by publisher/hash and Windows version.

Do not log document content, claim tokens, private keys, signed download URLs or local paths.

- [ ] **Step 2: GA gate**

General availability requires:

- two same-commit development E2E passes;
- two WordReplica same-commit Golden FULL PASS reports;
- one normal production canary;
- one crash/resume production canary;
- one abuse/expiry production canary;
- zero unexplained source mutations, duplicate consumption, hash mismatch or unauthorized completion;
- 24 hours without new severity-1 security/privacy finding;
- live privacy/terms pages and support instructions;
- confirmed rollback operator and access.

- [ ] **Step 3: Immediate rollback procedure**

On any integrity, privacy, signing, payment-consumption or cross-user isolation defect:

1. set `REPAIR_LOCAL_DISABLED=true` through the same restricted secret-staging helper;
2. confirm `repair-docx` stops issuing local launches and claim/status return disabled;
3. leave existing server-side repaired documents available to their owners;
4. do not roll back migrations or delete forensic rows;
5. if web copy/download is wrong, roll Netlify back to the previous known-good deploy;
6. if publisher or contract private key is compromised, keep the flow disabled, rotate the affected identity, build a new stable runner and repeat Tasks 2 through 8;
7. open a scoped incident/fix plan with a failing regression test before reactivation.

## Completion Evidence

Production integration is complete only when one redacted release record contains all of the following:

1. `LEKTA_PRODUCTION_SHA` on `origin/master` with green remote CI and `master-ci`.
2. `WORDREPLICA_RELEASE_SHA` on `origin/automation-dev` with clean source tree.
3. Full WordReplica pytest summary and two same-commit Golden FULL PASS reports.
4. Lekta focused test summary, `orphan-scan`, complete `npm run check` summary and adversarial review disposition.
5. Stable EXE SHA-256, manifest SHA-256, `Valid` Authenticode publisher thumbprint and timestamp evidence.
6. Contract key ID and public SPKI SHA-256, without private key material.
7. Successful production preflight and ordered deployment phase log with redacted secrets.
8. Migration identity proving exactly 0200, 0201 and 0202 were newly applied once through `db push`.
9. Deployed Edge function versions and Netlify deploy ID/site identity.
10. Normal, crash/resume and abuse/expiry production canary results.
11. Original/output/report hashes for synthetic or owner-approved canary files only.
12. Cleanup evidence limited to runner-owned artifacts, without an impossible claim about OS/browser traces.
13. Twenty-four-hour observation result and explicit GA decision.
14. Tested rollback path with named operator and confirmed access.
