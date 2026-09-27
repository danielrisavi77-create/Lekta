# T73: AI evidence stack (#132, #146, #147), GO / NO-GO

Datum audita: 2026-09-27. Način: samo čitanje. Glavno stablo `/home/user/Lekta` nije mijenjano. Generatori i testovi
pokretani su u privremenim worktreeovima `/home/user/wt/t73-{master,audit,apply,pilot-apply}` (izvan repozitorija, detached HEAD),
koji su na kraju uklonjeni. Ništa nije commitano, pushano ni komentirano na GitHubu.

Refovi nakon `git fetch origin`:

```
master cc9df523
wf/ai-evidence-audit b4b94e1a        (PR #132)
wf/ai-evidence-apply ade821db        (PR #146)
wf/ai-evidence-pilot-apply 6cc34542  (PR #147)
```

Važno: baza PR-a #132 NIJE trenutni master. `pull_request_read get` za #132 vraća `"base":{"ref":"master","sha":"036e8944..."}`,
a `git log --oneline 036e894..origin/master | wc -l` daje `42` (master je od baze odmaknuo 42 commita).

---

## 1. Što svaki PR mijenja

| PR | Grana (head) | Baza PR-a (sha) | `git diff --shortstat` prema bazi | mergeable_state |
|---|---|---|---|---|
| #132 | wf/ai-evidence-audit (b4b94e1) | master @ 036e8944 | `246 files changed, 119465 insertions(+), 3158 deletions(-)` | `dirty` |
| #146 | wf/ai-evidence-apply (ade821d) | wf/ai-evidence-audit @ b4b94e1 | `26 files changed, 1273 insertions(+), 183 deletions(-)` | `unstable` |
| #147 | wf/ai-evidence-pilot-apply (6cc3454) | wf/ai-evidence-apply @ ade821d | `28 files changed, 837 insertions(+), 572 deletions(-)` | `unstable` |

Naredbe: `git diff --shortstat origin/master...origin/wf/ai-evidence-audit`, `git diff --shortstat origin/wf/ai-evidence-audit...origin/wf/ai-evidence-apply`,
`git diff --shortstat origin/wf/ai-evidence-apply...origin/wf/ai-evidence-pilot-apply` (merge-base je u sva tri slučaja točno baza PR-a:
036e894, b4b94e1, ade821d). Brojke se poklapaju s `additions/deletions/changed_files` iz `pull_request_read get`.

**Uzrok `dirty` na #132** (lokalna provjera prema trenutnom masteru):

```
$ git merge-tree --write-tree --name-only origin/master origin/wf/ai-evidence-audit
...
CONFLICT (content): Merge conflict in tests/gate-mutations.test.ts
```

**Glavne skupine putanja** (`git diff --dirstat=files,0 <raspon>`):

- #132: `data/verification/dossiers/` 58.9 % datoteka, `tests/` 11.7 %, `scripts/` 4.4 %, `data/verification/closed-loop-manifests/` 4.0 %,
  `src/verification/` 3.6 %, `docs/generated/` 3.2 %, `src/profiles/` 2.0 %, te `src/repair/` (jedna datoteka: `src/repair/docx-visible-text.ts`, +19),
  `src/ui/`, nacrti EFOS/EFST/VUKA, `data/sources/efst/`, spec i plan u `docs/superpowers/`.
- #146: `data/verification/dossiers/` 26.9 %, `tests/` 26.9 %, `src/verification/` 19.2 %, `scripts/` 7.6 % (`anchor-rule-quotes.mts`,
  `apply-ai-evidence-profile.mts`), `docs/generated/` 7.6 %, `src/profiles/profile-schema.ts`.
- #147: nacrti `efos-doktorski`, `efos-specijalisticki`, `vuka-prehrambena-zavrsni`, 3 closed-loop manifesta, `data/verification/ledger.json` (+144),
  `docs/generated/faculty-matrix.json`, `completion-ledger.json`, `src/verification/ai-evidence-audit.ts`, `src/profiles/profile-validator.ts`, testovi.

**CI na head commitu** (`pull_request_read get_check_runs`, obje stranice):

| PR | head | Palo | Ostalo |
|---|---|---|---|
| #132 | b4b94e1 | `rule-claims` failure (dva runa: job 108509105432 i 108509097425) | build-gate (20/24), check, closed-loop, conformance-matrix, repair-integration, repair-net, ux-gate, dist-gate, browser-matrix, db-smoke, strict-open, unittest, npm-audit, gitleaks, GitGuardian: success; postgres-smoke, Supabase Preview: skipped |
| #146 | ade821d | `rule-claims` failure (job 108549035781 i 108548979351) | build-gate, closed-loop, conformance-matrix, repair-*, ux-gate, dist-gate, browser-matrix, db-smoke, strict-open, unittest, npm-audit, gitleaks, GitGuardian: success; Supabase Preview: skipped |
| #147 | 6cc3454 | `rule-claims` failure (job 108566465312 i 108566285182) | isto kao #146: sve ostalo success, Supabase Preview skipped |

Napomena: job `check` (workflow `foundation-check.yml`, okidač `pull_request: branches: [master]`) postoji samo na #132, jer #146 i #147 ne ciljaju master.
`build-gate` iz `check.yml` prolazi na sva tri.

Stanje mastera za usporedbu: `actions_list list_workflow_runs rule-claims.yml branch=master` vraća `36300752392 cc9df523 push completed success`.

---

## 2. Zašto `rule-claims` pada na svakom PR-u

Isti korak pada na sva tri PR-a: `Prijedlog modaliteta je u koraku s pravilima` (`.github/workflows/rule-claims.yml:76`).

Doslovni CI log, #132, job 108509105432:

```
2026-09-26T23:32:08.5242716Z bodovanih pravila: 2218  -> jedinica (izvor, citat, os): 1398
...
2026-09-26T23:32:08.5891787Z claim-modality-proposals.json je ustajao. Pokreni `npm run claim-modality` pa commitaj.
2026-09-26T23:32:08.5989212Z ##[error]Process completed with exit code 1.
```

#146, job 108549035781:

```
2026-09-27T04:18:15.8481149Z claim-modality-proposals.json je ustajao. Pokreni `npm run claim-modality` pa commitaj.
2026-09-27T04:18:15.8562163Z ##[error]Process completed with exit code 1.
```

#147, job 108566465312:

```
2026-09-27T06:30:40.7263217Z claim-modality-proposals.json je ustajao. Pokreni `npm run claim-modality` pa commitaj.
2026-09-27T06:30:40.7356752Z ##[error]Process completed with exit code 1.
```

Zbog `bash -e` sljedeća dva koraka (`drift-adjudication`, `scored-quote-audit`, `rule-claims.yml:94` i `:106`) na CI-u se nisu izvršila.
Lokalno sam ih pokrenuo na #147 i na masteru (vidi odjeljak 4): oba su bez drifta. Jedini uzrok crvenog `rule-claims` je dakle zastarjeli
`docs/generated/claim-modality-proposals.json`.

---

## 3. Dva HIGH nalaza protivničkog pregleda #132

Izvor: komentar vlasnika na #132 (`issuecomment-5849907724`, 2026-09-26T21:09:33Z), doslovno:

> 1. HIGH `src/verification/real-corpus-attestation.ts:92`: `attestationProblems` trazi `repairSourceHash`, a `data/verification/real-corpus-attestation.json` ga nema, pa se svaki real-docx dokaz odbacuje: ledger pada s 42 `real-docx-pass` na 1, 32 profila padaju s A (npr. hks-diplomski A -> C), `globalA` 0/410. `scripts/attest-real-corpus.mjs:61` odbija i postojece lokalno mjerenje.
> 2. HIGH `scripts/lib/repair-source-hash.mjs:28`: otisak pokriva SVE datoteke u `src/repair` (i CLAUDE.md); svaka izmjena prebacuje sva 24 paketa u `manifest-stale-repair`, `publishAiAuditedRules` baca, `gen-profile-rules-server.mts:57` ne moze proizvesti artefakt.

`get_review_comments` i `get_reviews` za #132 su prazni; nalazi postoje samo u tom komentaru. #146 i #147 nemaju komentara.

Nakon komentara (21:09Z = 23:09 +0200) na #132 su stigla samo dva merge commita (`32416893`, `b4b94e1a`, poruke "Merge origin/master u wf/ai-evidence-audit");
zadnji sadržajni commit je `4de3cfd6` u 22:41 +0200, dakle PRIJE pregleda (`git log --format='%h %ad %s' --date=iso 036e894..origin/wf/ai-evidence-audit`).

### 3a. `repairSourceHash` u ovjeri stvarnog korpusa

**Prisutnost na head commitu svakog PR-a.** `src/verification/real-corpus-attestation.ts` ima isti blob `8ce033df` na sve tri grane
(`git rev-parse --short origin/<grana>:src/verification/real-corpus-attestation.ts`), pa su reci isti:

- `origin/wf/ai-evidence-audit:src/verification/real-corpus-attestation.ts:92`, `origin/wf/ai-evidence-apply:...:92`, `origin/wf/ai-evidence-pilot-apply:...:92`:
  `if (!a.repairSourceHash) p.push('nema otiska koda popravka pri mjerenju');`
- isti reci `:94-96`: `else if (a.repairSourceHash && a.repairSourceHash !== currentRepairSourceHash) { p.push('kod popravka promijenjen nakon mjerenja'); }`
- `scripts/attest-real-corpus.mjs:60-68` na sve tri grane: odbija mjerenje bez `repairSourceHash` i mjerenje čiji se hash razlikuje od trenutnog `src/repair`.
- Na masteru zahtjev ne postoji: `git grep -n "repairSourceHash\|currentRepairSourceHash" origin/master -- src scripts` ne vraća ništa.

Podatak: `data/verification/real-corpus-attestation.json` ima isti blob `7a25f3f5` na masteru i na sve tri grane. Parsiranjem:

```
$ git show origin/wf/ai-evidence-pilot-apply:data/verification/real-corpus-attestation.json | python3 -c "...print(sorted(d.keys())); print('repairSourceHash' in d, len(d['entries']))"
['corpusFingerprint', 'entries', 'environment', 'measuredAt', 'measuredFromCommit', 'oracles', 'protocol', 'schemaVersion', 'signatureNote', 'signedAt', 'signedBy']
False 19
```

Test na #147 to eksplicitno zaključava: `origin/wf/ai-evidence-pilot-apply:tests/completion-ledger.test.ts:172` ("zastarjela ovjera bez fingerprinta aktualnog koda ne daje nijedan A redak",
očekuje `summary.byClaim.A` = 0); na #132 je to redak 108, na #146 redak 159. Test prolazi u worktreeu #147
(`npx vitest run tests/completion-ledger.test.ts tests/efos-ai-evidence-migration.test.ts` -> `Test Files  2 passed (2)`, `Tests  42 passed (42)`).

**Posljedica (izmjereno iz commitanih artefakata).** `docs/generated/completion-ledger.json`, polje `summary`:

| Ref | byClaim | byProof.real-docx-pass | globalA |
|---|---|---|---|
| master (cc9df52) i baza #132 (036e894) | A 38, B 300, C 8, D 42, E 48 | 42 | nema polja |
| #132 | A 0, B 214, C 132, D 42, E 48 | 1 | profilesAtA 0 / 410 |
| #146 | A 0, B 204, C 142, D 42, E 48 | 1 | 0 / 410 |
| #147 | A 0, B 207, C 139, D 42, E 48 | 1 | 0 / 410 |

Korisnički vidljiv artefakt `data/profiles/profile-claims.json` (importira ga `src/ui/profile-claim.ts:18`, dakle ide u bundle), polje `counts`:

| Ref | counts | hks-diplomski |
|---|---|---|
| master | A 32, B 292, C 8, D 37, E 41 | A |
| #132 | B 208, C 124, D 37, E 41 (A nema) | C |
| #146 | B 202, C 130, D 37, E 41 | C |
| #147 | B 205, C 127, D 37, E 41 | C |

Dakle spajanjem #132 sučelje prestaje prikazivati razinu A za 32 profila, a C raste s 8 na 124. Koliki dio pada B (292 -> 208) potječe baš od ovog nalaza,
a koliki od drugih izmjena u #132: nije dokazano.

**Zašto se ne može popraviti upisom hasha unatrag.** Mjerenje je rađeno nad `measuredFromCommit` `59adbc8c`, a od tada se `src/repair` mijenjao:
`git diff --shortstat 59adbc8cc3b1cdecba6ef0487e8a26b7424cdd06 origin/master -- src/repair` -> `33 files changed, 3774 insertions(+), 30 deletions(-)`.
Hash tog stabla ne bi bio jednak trenutnom, pa bi retroaktivni upis bio lažan.

**Minimalni popravak** (jedna od dvije opcije, obje u zasebnom izoliranom stablu):

1. *Podatkovni (ispravan put do A):* ponoviti mjerenje stvarnog korpusa aktualnom skriptom (`LEKTA_LOCAL_CORPUS=1 vite-node scripts/repair-real-corpus.mts`,
   poruka iz `scripts/attest-real-corpus.mjs:57`), zatim `node scripts/attest-real-corpus.mjs` da upiše `repairSourceHash` (redak 126), vlasnik ponovno potpisuje
   (`signedBy`/`signedAt` ne smiju biti stariji od `measuredAt`, gard u `real-corpus-attestation.ts`). Zatim regenerirati `docs/generated/completion-ledger.json`
   i `data/profiles/profile-claims.json` i zamijeniti pribadaču u `tests/completion-ledger.test.ts:172` (redak na #147) testom koji očekuje A > 0.
   Treba lokalni korpus (nije u repozitoriju) i ljudski potpis; agent to ne može sam.
2. *Kodni (bez gubitka A do nove ovjere):* izvaditi zahtjev iz #132, tj. vratiti `src/verification/real-corpus-attestation.ts:92-96` i
   `scripts/attest-real-corpus.mjs:60-68` na ponašanje s mastera, ukloniti `repairSourceHash` iz `completion-ledger.test.ts:83-86` i pribadaču na `:172`,
   regenerirati ledger i `profile-claims.json`. Zahtjev za hashom uvesti zasebnim T-zadatkom ZAJEDNO sa svježom ovjerom (opcija 1), da master nijednog trenutka
   nema A = 0.

### 3b. `scripts/lib/repair-source-hash.mjs` hashira cijeli `src/repair`

**Prisutnost.** Blob `3007391f` je isti na sve tri grane. Na `origin/wf/ai-evidence-{audit,apply,pilot-apply}:scripts/lib/repair-source-hash.mjs`:

- `:9-15` rekurzivno skuplja SVAKU datoteku (`else if (entry.isFile()) files.push(absolutePath);`, redak 12), bez filtra po ekstenziji;
- `:24-30` svaku datoteku ulijeva u SHA-256 (redak 28: `hash.update(readFileSync(file).toString('utf8').replace(/\r\n/g, '\n'), 'utf8');`).
- `git ls-tree -r --name-only origin/wf/ai-evidence-pilot-apply src/repair | grep -v '\.ts$'` -> `src/repair/CLAUDE.md` (hashira se i dokumentacija).

Lanac do pada: `src/verification/ai-evidence-audit.ts` dodaje `manifest-stale-repair` kad se hash manifesta razlikuje od trenutnog
(redak 283 na #132, 324 na #146, 337 na #147); `src/profiles/publish-ai-rules.ts:28-31` (isti blob `78298980` na sve tri grane) tada baca
`Nedostaje valjan AI-evidence rezultat ...`; `scripts/gen-profile-rules-server.mts:57` (isti blob `8a0f2b06`) poziva `publishAiAuditedRules`.

**Izravni dokaz mutacijom** (worktree #147, izmjena SAMO u dokumentaciji, poslije vraćena):

```
$ printf '\n<!-- T73 mutacija: samo dokumentacija -->\n' >> src/repair/CLAUDE.md
$ git diff --stat
 src/repair/CLAUDE.md | 2 ++
$ npx vitest run tests/completion-ledger.test.ts tests/efos-ai-evidence-migration.test.ts
 FAIL  tests/completion-ledger.test.ts > completion ledger: drift > commitani izlaz === svjezi izracun (inace: npm run completion-ledger)
 ...
AssertionError: efos-opci-akademski-rad/efos-opci-akademski-rad--font: manifest-stale-repair: Kod popravka se promijenio nakon izvršnog mjerenja.; ...
⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯
$ npx vite-node scripts/gen-profile-rules-server.mts
Error: Nedostaje valjan AI-evidence rezultat za vuka-prehrambena-zavrsni/vuka-prehrambena-zavrsni--font-size: manifest-stale-repair
```

Baseline bez mutacije: `Test Files  2 passed (2)`, `Tests  42 passed (42)`. Napomena: `node_modules` je symlink na `/home/user/wt/higijena/node_modules`,
pa je verzija ovisnosti ona iz tog stabla, ne nužno iz `package-lock.json` grane.

**Posljedica za sam merge.** Svih 10 manifesta u `data/verification/closed-loop-manifests/` na #147 nosi `repairSourceHash` `7ead2282...` (32 pojavljivanja,
parsirano). Master je od baze #132 promijenio `src/repair`: `git diff --stat 036e894 origin/master -- src/repair` -> 4 datoteke (`apply-fixers.ts`, `fixers.ts`,
`table-figure-rescue-fixer.ts`, `table-figure-rescue-fixer.test.ts`), a hash master stabla je `4cf37918...`. Nakon rebasea na master (koji je ionako nužan zbog
konflikta) svi manifesti postaju zastarjeli i gornjih 10 testova pada dok se closed-loop ne pokrene ponovno. Isto vrijedi za svaki budući commit u `src/repair`,
uključujući `CLAUDE.md` i `*.test.ts` datoteke unutar `src/repair`.

**Minimalni popravak:**

1. `scripts/lib/repair-source-hash.mjs:12`: uključiti samo produkcijski kod, npr. `entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')`
   (time otpadaju `CLAUDE.md` i testovi koji danas žive u `src/repair`). U `tests/repair-source-hash.test.ts` dodati slučaj "izmjena `.md` ili `.test.ts` ne mijenja otisak"
   i mutaciju u `tests/gate-mutations.test.ts` (zahtjev iz CLAUDE.md za novi gard).
2. `src/profiles/publish-ai-rules.ts:28-31`: za razlog `manifest-stale-repair` ne bacati, nego AI unos tog profila izostaviti iz objave (funkcija već vraća
   `published` bez promjene kad je `aiEntries` prazan, redak 81) i to ispisati u generatoru. Tako zastario manifest otvoreno degradira na legacy pravila
   umjesto da blokira izradu `data/generated/profile-rules-server.json`. Ostali razlozi (npr. krivi citat) i dalje bacaju.
3. Nakon rebasea regenerirati manifeste (`npm run closed-loop -- --profile <id> --no-structural` za profile s manifestima), pa ledger i projekcije, u istom commitu.

---

## 4. Je li `docs/generated/claim-modality-proposals.json` na #147 zastario

**Generator:** `package.json:97` na #147: `"claim-modality": "python scripts/propose_claim_modality.py"`. Docstring (`scripts/propose_claim_modality.py:2`):
"PRIJEDLOG modaliteta i opsega za bodovana pravila, deterministicki, bez modela." Importi (`:20-28`) su samo stdlib (`glob, json, os, re, sys, unicodedata, collections`);
čita `data/profiles/*/drafts/*.json` (`:218-220`), piše JSON i `data/verification/modality-worklist.md`. Nema modela ni mreže, pa sam ga pokrenuo.

Pokretanje (Python 3.11 lokalno; CI koristi 3.12) u worktreeovima izvan repozitorija:

```
$ python3 scripts/propose_claim_modality.py --json <scratchpad>/cm-<x>.json
master:      bodovanih pravila: 2218  ->  jedinica (izvor, citat, os): 1401
#132/#146/#147: bodovanih pravila: 2218  ->  jedinica (izvor, citat, os): 1398
```

Svježi izlaz #132, #146 i #147 je bajt po bajt isti:

```
$ sha256sum cm-*.json baked-pilot.json
07fb0391...  cm-apply.json
07fb0391...  cm-audit.json
2a8b8100...  cm-master.json
07fb0391...  cm-pilot-apply.json
2a8b8100...  baked-pilot.json
```

Commitani `docs/generated/claim-modality-proposals.json` ima isti blob `482b342c` na masteru i na sve tri grane, i jednak je svježem izlazu MASTERA.
Dakle: #132 je izmijenio nacrte (citate), ali artefakt nije regeneriran; #146 i #147 nisu promijenili ništa što mijenja izlaz. Svježi izlaz lokalno daje iste
brojke kao CI log (`1398` jedinica, `modalitet: {... 'directive': 1194, ... 'obligation': 160 ...}`).

Usporedba (#147, parsirano, ključ `(sourceId, checkId, quote)`):

```
equal: False | rules 2218 -> 2218 | units 1401 -> 1398 | proposals 1401 -> 1398
samo u commitanom: 14 | samo u svjezem: 11 | promijenjeni: 10
polja koja se razlikuju: {'profileIds': 10, 'ruleCount': 10, 'writtenModality': 10, 'ruleIds': 10}
$ git diff --no-index --shortstat baked-pilot.json cm-pilot-apply.json
 1 file changed, 198 insertions(+), 280 deletions(-)
```

Po izvoru: samo u commitanom `efst-upute-studentski-radovi-2013` 5, `efos-upute-studentski-2023` 5, `vuka-prehrambena-upute-2025` 2, `vuka-lovstvo-upute-2022` 2;
samo u svježem `efos-upute-studentski-2023` 7, `vuka-lovstvo-upute-2022` 2, `vuka-prehrambena-upute-2025` 2; promijenjeni `efst-...-2013` 5, `efos-...-2023` 5.

Primjer razlike: jedinica `efos-upute-studentski-2023 / font` s citatom bez dijakritike "Velicina je stranice A4 (210x297 mm), a rubnice trebaju biti sljedece velicine: ..."
postoji samo u commitanom; u svježem je citat s dijakritikom "Veličina je stranice A4 ...", sada samo za `efos-diplomski--font` i `efos-zavrsni--font`
(`ruleCount` 4 -> 2), a doktorski i specijalistički prelaze na novu jedinicu "rad treba pisati fontom Times New Roman veličine 12 točaka uz prored 1,5".

`data/verification/modality-worklist.md` se regeneracijom ne mijenja (worktree nakon pokretanja: `git status --short` prazan; blob `d956a995` na sve četiri reference).

Ostala dva koraka `rule-claims` (lokalno, venv s `pymupdf 1.28.2` i `olefile`, CI verzije nisu poznate):

```
#147: drift-adjudication equal: True ; scored-quote-audit equal: True 0 0
master: drift-adjudication equal: True ; scored-quote-audit equal: True 0 0
```

**Popravak:** u #132 pokrenuti `npm run claim-modality` i commitati `docs/generated/claim-modality-proposals.json` zajedno s nacrtima koji su ga promijenili.
Budući da je svježi izlaz isti na sve tri grane, jedna regeneracija na #132 (nakon rebasea na master ponoviti, jer master može imati svoje izmjene nacrta)
popravlja `rule-claims` cijelog stacka.

---

## 5. Podatkovni nalazi iz opisa #147

Doslovno iz opisa #147 (odjeljak "Nalazi pilota o podacima (nisu dio ovog PR-a)"):

> - **Precijenjen modalitet:** 15 pravila tvrdi `obligation` gdje izvor kaže `directive`. Vlasnik je odlučio da se to ispravi uz dokaz.
> - **Proturječni izvori:** 10 izvora sam sebi proturječi, npr. drugačiji font za fusnote.
> - **Kriva vrsta rada:** 2 PRAVO pravila oslanjaju se na izvor koji vrijedi samo za diplomske i završne radove, a primijenjena su na doktorski i specijalistički.

Opis ne navodi nijedan identifikator pravila ni izvora. U diffu cijelog stacka (`git diff --name-only origin/master...origin/wf/ai-evidence-pilot-apply`)
nema datoteke s izlazom pilota (19 izvora, 106 pravila, 72/69/3); jedini artefakti pilota su AI paketi 12 pravila u tri nacrta. `git grep -l "claude-sonnet-5\|gpt-6-sol"`
na #147 pogađa samo ta tri nacrta, `faculty-matrix.json` i konfiguraciju agenata.

| Nalaz | Popis u podacima grane | Dokaz izvorom (lokator + citat) | Presuda |
|---|---|---|---|
| 15 × `obligation` umjesto `directive` | Nema. Nijedan artefakt ne imenuje tih 15. | Nema za tvrdnju pilota. Samostalno: od 2218 bodovanih pravila na #147, 275 nosi `modality: obligation`; deterministički prijedlog (`claim-modality-proposals.json`) za njih 39 predlaže `directive` (npr. `vuka-poslovni-zavrsni--font-size`, `fpzg-politologija-diplomski--required-sections`, `grafos-zavrsni--margins`). Skripta sama kaže "SKRIPT NE ODLUCUJE", a 39 nije 15. | **nije dokazano** |
| 10 samoproturječnih izvora | Nema. `git grep -i "proturje\|contradict"` nalazi samo stare bilješke u `data/pilot-drafts/efzg--*` (proturječje DVAJU EFZG izvora, 2012 i 2003, redoslijed popisa i sustav citiranja), što nije isti razred ("izvor sam sebi proturječi"). | Nema. | **nije dokazano** |
| 2 PRAVO pravila na krivoj vrsti rada | Nema popisa od 2 pravila. Samostalno pronađen kandidat, vidi ispod. | Djelomično: registar izvora imenuje opseg. | **djelomično dokazano** (razred da, broj 2 ne) |

Kandidat za PRAVO nalaz (podaci su isti na masteru i na #147: `git diff --quiet origin/master origin/wf/ai-evidence-pilot-apply -- data/profiles/pravo` -> izlaz 0):

- `origin/wf/ai-evidence-pilot-apply:data/sources/source-registry.json:3` `"id": "pravo-upute-oblikovanje-2024"`, redak 5:
  `"title": "Upute za oblikovanje i uredenje teksta i navodenje izvora u diplomskim i zavrsnim radovima na Pravnom fakultetu Sveucilista u Zagrebu"`
  (i `snapshotPath` `data/sources/pravo/pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf`).
- `data/profiles/pravo/drafts/law-drafts.json:3082` (`pravo-specijalisticki-pravni-opci`) i `:3358` (`pravo-doktorski-pravne-znanosti`): svaki ima **10** bodovanih
  pravila (`status: verified`, `authority: general`, koji je u `OFFICIAL_AUTHORITIES` na `scripts/propose_claim_modality.py:202`, sourcePage i quote postoje)
  sa `sourceId: pravo-upute-oblikovanje-2024`. Primjer: `pravo-doktorski-pravne-znanosti--font`, `sourcePage` "odjeljak 4. Oblikovanje i uredenje teksta",
  `quote` "Glavni tekst (...) font: Times New Roman", `confirmedVia: ai-3pass-batch`.
- Dakle razred nalaza je dokazan naslovom izvora u registru, ali ga pogađa 20 bodovanih pravila na 2 profila, ne "2 pravila". Tekst unutar PDF-a (da upute doista
  isključuju doktorske radove) nisam čitao: nije dokazano.

Usput (nije traženo, ali relevantno za odluku): 12 pravila koje #147 upisuje (EFOS doktorski i specijalistički, VUKA prehrambena) nose lokator i doslovni citat, npr.
`data/profiles/efos/drafts/efos-doktorski.json:85` `"sourcePage":"Odjeljak 2, tiskana str. 3"`, `"quote":"veličina je stranice A4 (210x297 mm)"`, snapshot hash i closed-loop manifest.

---

## 6. PREPORUKA: NO-GO (u sadašnjem obliku)

Stack ne spajati. PR-ove ostaviti otvorene kao referencu ili zatvoriti, a dokazane dijelove prenijeti kao zasebne, male T-zadatke.

Obrazloženje (svaka točka ima dokaz gore):

1. **Oba HIGH nalaza su i dalje prisutna na sva tri head commita**, u bajt-identičnim blobovima (`8ce033df`, `3007391f`); nakon pregleda nije bilo sadržajnog commita (odjeljak 3).
2. **Korisnički vidljiva regresija:** spajanjem #132 `profile-claims.json` u bundleu gubi svih 32 A profila (A 32 -> 0, C 8 -> 124). Popravak koji vraća A
   traži novo mjerenje lokalnog korpusa i ljudski potpis; retroaktivni upis hasha bio bi lažan jer se `src/repair` od mjerenja promijenio u 33 datoteke (3a).
3. **Krhkost dokazana mutacijom:** izmjena samo `src/repair/CLAUDE.md` ruši 10 testova i blokira generator serviranih pravila (3b). Rebase na master (nužan zbog
   konflikta u `tests/gate-mutations.test.ts`) sam po sebi zastarijeva svih 10 manifesta, jer je master mijenjao `src/repair`.
4. **CI crven na sva tri PR-a** (`rule-claims`, zastarjeli `claim-modality-proposals.json`); popravak je trivijalan, ali pokazuje da je #132 commitan bez regeneracije artefakta,
   protivno pravilu "izvor, artefakt i ratchet u istom commitu".
5. **Veličina i zaštićeno područje:** #132 ima 246 datoteka i +119465 redaka, dira `src/repair/docx-visible-text.ts` (repair, prema CLAUDE.md traži drugi pregled) i
   ima još 3 MEDIUM nalaza iz istog komentara (worklist inverzija, `approveFromAi` neponovljiv, TypeError u gateu) čiji status nisam provjeravao. Vlasnikov komentar kaže
   "NIJE ZA MERGE dok se ne zatvore 1 i 2" i "merge tek nakon popravka i ponovnog pregleda".
6. **Podatkovni nalazi #147 uglavnom nisu dokazivi iz grane:** 15 i 10 nemaju nijedan identifikator; PRAVO razred je potvrđen registrom, ali s drugim brojem (5).

Što bi preokrenulo odluku u GO: vlasnik ima svježu, potpisanu ovjeru stvarnog korpusa s `repairSourceHash` za stablo nakon rebasea. Tada redoslijed:
(1) rebase #132 na master i razriješiti `tests/gate-mutations.test.ts`; (2) popravak 3b (filtar u `repair-source-hash.mjs`, degradacija umjesto bacanja u `publish-ai-rules.ts`);
(3) closed-loop za sve profile s manifestima; (4) nova ovjera (3a opcija 1) i regeneracija ledgera, `profile-claims.json`, `faculty-matrix.json`; (5) `npm run claim-modality`;
(6) zatvoriti 3 MEDIUM nalaza; (7) `npm run check` i `npm run orphan-scan` u izoliranom stablu, drugi provider pregled; (8) tek onda #146 i #147 redom, svaki rebase + regeneracija.

Predloženi T-zadaci za NO-GO put:

- **T-a (kod, mali PR):** otisak koda popravka samo nad produkcijskim `.ts` datotekama + degradacija na legacy pravila kod `manifest-stale-repair`, s mutacijom u `gate-mutations`.
- **T-b (podaci + vlasnik):** svježe mjerenje stvarnog korpusa i potpis s `repairSourceHash`; tek u istom commitu uvesti obvezu hasha u `attestationProblems`.
- **T-c (validator AI dokaza sheme 2):** prenijeti `ai-evidence-audit.ts` / `profile-validator.ts` logiku kao zaseban PR prema masteru, bez migracije podataka.
- **T-d (PRAVO opseg):** 20 bodovanih pravila profila `pravo-specijalisticki-pravni-opci` i `pravo-doktorski-pravne-znanosti` oslanja se na izvor čiji naslov kaže
  "u diplomskim i zavrsnim radovima"; pročitati PDF i odlučiti (degradirati ili naći izvor za doktorski/specijalistički).
- **T-e (modalitet):** zatražiti popis 15 pravila iz izlaza pilota; bez popisa nalaz se ne prenosi. Kao polazište postoji 39 determinističkih kandidata (odjeljak 5).
- **T-f (proturječni izvori):** zatražiti popis 10 izvora s lokatorima oba proturječna mjesta; bez toga nalaz se ne prenosi.

---

## 7. Nije dokazano

- Uzrok pada B s 292 na 208 u `profile-claims.json` na #132 (koliko od 3a, koliko od drugih izmjena).
- Status tri MEDIUM i tri LOW nalaza iz komentara #132 (worklist.ts:211, verification-actions.ts:162, verification-gate.ts:115, docx-visible-text.ts:9 i LOW 7 do 9) na head commitima. Nisam ih provjeravao.
- Da `npm run check` i `npm run orphan-scan` prolaze na bilo kojoj od tri grane lokalno; nisam ih pokretao. CI `build-gate` je success na sva tri, a `check` (foundation) samo na #132.
- Da bi nakon rebasea #132 na master bio samo jedan konflikt nakon što se razriješi; provjeren je samo `git merge-tree` izlaz (jedan konflikt).
- Ponašanje generatora pod Pythonom 3.12 (lokalno 3.11); podudaranje brojki s CI logom (1398 jedinica, iste distribucije) to čini vjerojatnim, ali ne dokazanim.
- Verzije `pymupdf`/`olefile` na CI-u; lokalni rezultat `drift-adjudication` i `scored-quote-audit` dobiven je s pymupdf 1.28.2.
- Verzije ovisnosti u lokalnom Vitest pokretanju (symlink na `/home/user/wt/higijena/node_modules`, ne na `package-lock.json` grane).
- Identitet 15 pravila s precijenjenim modalitetom i 10 samoproturječnih izvora iz pilota; nijedan artefakt grane ih ne imenuje.
- Sadržaj PDF-a `pravo-upute-oblikovanje-diplomski-zavrsni-2024.pdf` (da doista isključuje doktorske i specijalističke radove); dokaz je samo naslov u registru.
- Brojke iz opisa PR-ova koje nisam reproducirao: 72/69/3 pilota, 488 nedoslovnih citata, 398/367 profila u serviranom artefaktu, "EFOS 14 od 14".
- Stanje `npm run master-ci` (nije pokrenut); za master je provjeren samo zadnji `rule-claims` run (`36300752392 cc9df523 success`).
