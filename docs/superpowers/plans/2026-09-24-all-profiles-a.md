# Svi profili na A: plan implementacije

## Izmjena cilja, 2026-09-25

Ova izmjena vraća i precizira odobreni završni kriterij: **svih 407 fakultetskih profila na A**.
Razina B je obvezni međukorak, ne završni cilj. A se dodjeljuje samo uz valjan, svjež i dopušten
dokaz na stvarnom DOCX-u. Tri pravna profila ostaju u ledgeru i izvještaju, ali zasebno, izvan
nazivnika fakultetskog cilja. Završni ratchet mora obuhvatiti svih 407 fakultetskih ID-jeva, bez
nedostajućih, duplih ili neregistriranih profila; svi relevantni retci svakog profila moraju biti A.
`training-pipeline` workflow se zadržava po izričitoj odluci vlasnika.

Svaki korak do B zahtijeva potpuna službena pravila, siguran deterministički popravak i reproducibilan
sintetički closed-loop dokaz. Prijelaz s B na A zahtijeva svjež dopušteni stvarni DOCX dokaz po
profilu i potrebnoj vrsti rada. Nedostatak dokumenta, privole, izvora ili Word-oraclea ostaje
imenovani NO-GO blocker, nikad se ne zaobilazi snižavanjem kriterija. Ciljni ratchet mora dokazivati
`facultyAllA`; `facultyMinimumB` ostaje korisna međumjera. Generirani artefakti ažuriraju se tek u
čistom izoliranom worktreeu.

> **Za agentne izvršitelje:** prije rada obvezno koristi `superpowers:executing-plans` ili `superpowers:subagent-driven-development`. Koraci koriste checkbox zapis.

**Cilj:** Svaki registrirani profil dovesti do A samo kada ima potpuna službena pravila, siguran deterministički popravak i reproducibilan prolaz na dopuštenom stvarnom DOCX radu, bez obveznog ljudskog audita pravila.

**Arhitektura:** AI može pripremiti i strukturirati tumačenje, ali profilno pravilo boduje se tek kada neovisni validator veže službeni snapshot, citat, vrijednost, opseg, modalitet i hashirani izvršni dokaz. Completion ledger ostaje jedino mjesto za izvedenu razinu; AI ili sintetički prolaz ne mogu proizvesti dokaz stvarnog rada. Rad se vodi u svježim profilnim worklistama kroz postojeće verifikacijske, repair i corpus oraclee, bez masovnog samopotvrđivanja.

**Tehnologije:** TypeScript strict, Vitest, postojeći rule compiler i completion ledger, postojeći repair closed-loop i DOCX/Word corpus oraclei, JSON privatni profilni nacrti.

**Specifikacija:** `docs/superpowers/specs/2026-09-24-ai-evidence-audit-design.md`

## Globalna ograničenja

- Službeni izvori jedini su izvor bodovanih fakultetskih pravila; ne nagađati stranicu, modalitet, opseg ni vrijednost.
- Bez potpunog dokaznog lanca pravilo ostaje nebodovano; ne postoji ljudski red čekanja kao skriveni gate.
- A traži stvarni, dopušteni DOCX dokaz; sintetički dokument može dokazati najviše B.
- Ne prikupljati, slati ni čuvati studentski rad bez postojeće privole i pravne osnove; ne otkrivati njegov tekst u javnom paketu.
- `aiEvidence`, source snapshoti, ledgeri i korpusski detalji ostaju privatni i izvan javnog bundlea.
- Svaki novi gard ima baseline i dokazanu negativnu mutaciju; svaki repair prolazi generator-validaciju, dva prolaza idempotencije i primjenjive Word oraclee.
- Promjene se rade u ovom izoliranom worktreeu; obvezni završni gateovi su `npm run check` i `npm run orphan-scan`.

## Pregled datoteka i odgovornosti

- `src/verification/verification-actions.ts`: čisti prijelazi stanja pravila i audit-ledger.
- `src/verification/verification-gate.ts`: fail-closed uvjet pod kojim bodovano pravilo smije proći CI.
- `src/verification/completion-ledger.ts`, `scripts/generate-completion-ledger.mts`: izvedena A-E razina po profilu i dokazima.
- `src/verification/real-corpus-attestation.ts`, `scripts/repair-real-corpus.mts`, `scripts/attest-real-corpus.mjs`: stvarni DOCX dokaz i njegova svježina.
- `src/verification/worklist.ts`, `scripts/verification-worklist.mts`: prioritetni popis nedovršenih pravila/profila.
- `data/profiles/<jedinica>/drafts/*.json`, `data/sources/**`, `data/verification/**`: privatna pravila, izvori i dokazni artefakti.
- `tests/verification-actions.test.ts`, `tests/verification-gate.test.ts`, `tests/verification-worklist.test.ts`, `tests/real-corpus*.test.ts`, `tests/gate-mutations.test.ts`: regresije, baseline, negativni slučajevi i dokaz da gard grize.
- `docs/PLAN_RAZINA_A.md`, `docs/generated/completion-ledger.json`, `docs/generated/real-corpus-backlog.*`: program i regenerirani izvještaji, bez ručnog uređivanja generiranih datoteka.

## Review focus

- Snapshot promijenjen nakon audita: pravilo se odbija kao zastarjelo; test u `tests/verification-gate.test.ts` mutira `snapshotHash`.
- Citat postoji, ali izvor govori o drugoj vrijednosti ili drugom modalitetu/opsegu: pravilo se odbija; slučajevi u novom `tests/ai-evidence-audit.test.ts`.
- AI prolazi se slažu, ali izvršni test-manifest ne postoji, ne odgovara profilu ili hash izlaza ne odgovara: pravilo se odbija; negativne kontrole u istom testu.
- Profil ima čisti sintetički prolaz bez dopuštenog stvarnog dokumenta: ostaje ispod A; mutacija u `tests/real-corpus-attestation.test.ts` i `tests/gate-mutations.test.ts`.
- Korpus je uklonjen, smanjen ili izgubio prava, ali stari ledger/cache još tvrdi A: A se ruši u svježem izračunu; slučaj u `tests/completion-ledger.test.ts` i corpus freshness testu.

---

### Zadatak 1: Svježa početna matrica i ratchet za krajnji cilj

**Datoteke:**
- Uredi: `docs/PLAN_RAZINA_A.md`
- Provjeri: `src/verification/completion-ledger.ts`, `scripts/generate-completion-ledger.mts`, `tests/real-corpus-backlog.test.ts`
- Generiraj, ne uređuj ručno: `docs/generated/completion-ledger.json`, `docs/generated/real-corpus-backlog.json`, `docs/generated/real-corpus-backlog.md`

**Sučelja:** ulaz je ledger i backlog generiran trenutačnim kodom; izlaz je potpisana lokalna baseline tablica s brojem profila, A-E razinama, stvarnim dokazima po profilu i imenovanim blockerima. Brojke iz starijeg plana nisu početna istina.

- [x] **Korak 1: Dodaj test da je ciljna populacija identična izvoru registara** u `tests/completion-ledger.test.ts`; test provjerava jedinstveni `profileId`, da nijedan registrirani profil ne nedostaje i da sažetak odgovara brojanju redaka.
- [x] **Korak 2: Pokreni ciljani test** `npx vitest run tests/completion-ledger.test.ts`; očekuj da baseline tvrdnja padne ako ledger izostavi profil ili koristi zastarjeli broj.
- [x] **Korak 3: Regeneriraj baseline** naredbama `npm run completion-ledger` i `npm run repair-real-corpus-backlog`; pročitaj JSON kao JSON i usporedi profile po ID-u, ne samo ukupan broj.
- [x] **Korak 4: Uredi `docs/PLAN_RAZINA_A.md`** da cilj bude svi profili na A, a tablica baselinea i blocker-popis budu izvedeni iz upravo regeneriranih artefakata; odvoji A dokaz, B sintetički dokaz, pravila, popravak i pravo korištenja.
- [x] **Korak 5: Ponovi ciljani test** i potvrdi da svi registrirani ID-jevi postoje jednom, bez izmišljenih profila.

### Zadatak 2: Deterministički validator AI-dokaznog paketa

**Datoteke:**
- Stvori: `src/verification/ai-evidence-audit.ts`
- Stvori: `tests/ai-evidence-audit.test.ts`
- Uredi po potrebi: `src/profiles/profile-schema.ts`, `src/profiles/profile-validator.ts`

**Sučelja:** validator prima profilni `RuleEntry`, pripadajući `SourceEntry`, čitljiv lokalni snapshot i razrješiv izvršni manifest; vraća `valid` ili stabilne kodirane razloge odbijanja. `AiEvidence` se proširuje strukturiranim vrijednostima, scopeom, modalityjem, lokatorima, model/pass metapodacima i test referencom; sirovo skriveno rezoniranje se ne pohranjuje. Schema i `profile-validator` moraju prepoznati `confirmedVia: 'ai-evidence-audit'` kao dopušten trag za bodovano i auto-fixable pravilo, bez ljudskog `reviewedBy`.

- [x] **Korak 1: Napiši testove** za čisti dokazni paket te pojedinačna odbijanja: krivi rule/profile/source ID, snapshot hash, citat koji nedostaje ili se ne nalazi doslovno, vrijednost koja ne odgovara `RuleEntry.value`, nejasan scope/modality, nepostojeći test-manifest, pogrešni ulazni/izlazni hash i neuspjeli test.
- [x] **Korak 2: Pokreni** `npx vitest run tests/ai-evidence-audit.test.ts`; baseline mora pasti jer validator još ne postoji.
- [x] **Korak 3: Implementiraj čistu funkciju** bez IO-a i bez vjerovanja `agree: true`; usporedi citat uz samo normalizaciju CR i ponovljenih razmaka, provjeri hash snapshotova i prihvati samo manifest koji je pozivatelj razriješio iz postojećeg harnessa.
- [x] **Korak 4: Ponovi ciljani test**; čisti primjer mora proći, a svaka mutacija mora vratiti svoj razlog, bez djelomičnog `valid` ishoda.
- [x] **Korak 5: Dodaj baseline i mutacije u `tests/gate-mutations.test.ts`** za lažnu vrijednost, citat iz drugog izvora, hash-drift i samoprijavljeni `pass` bez manifesta; pokreni pripadajući test.

### Zadatak 3: Uklanjanje ljudskog odobrenja iz statusnog prijelaza

**Datoteke:**
- Uredi: `src/verification/verification-actions.ts`
- Uredi: `src/verification/verification-gate.ts`
- Uredi: `tests/verification-actions.test.ts`, `tests/verification-gate.test.ts`
- Uredi: `tests/gate-mutations.test.ts`

**Sučelja:** nova `approveFromAi` varijanta prima `AiEvidence` i objekt konteksta za determinističku validaciju, bez `approver`; uspjeh vraća `confirmedVia: 'ai-evidence-audit'` i jedan `ai-confirmed` ledger red. Gate za nova AI-potvrđena pravila poziva validator; postojeća ručna pravila zadržavaju kompatibilnost dok se ne migriraju i zasebno dokazuju.

- [x] **Korak 1: Promijeni testove prije koda**: potpuni paket prolazi bez `approver`; `agree` bez paketa, nevaljan paket i izvor bez snapshot-a ne mijenjaju pravilo; binding pravilo prolazi samo kad strojni dokaz pokriva obvezujući tekst, ne zato što je upisan `reviewedBy`. Dodaj testove da `profile-validator` dopušta valjani AI dokaz na auto-fixable pravilu, a odbija nedostajući ili nevaljani AI dokaz.
- [x] **Korak 2: Pokreni** `npx vitest run tests/verification-actions.test.ts tests/verification-gate.test.ts`; potvrdi crveni test na obveznom `approver`/`reviewedBy` ponašanju.
- [x] **Korak 3: Implementiraj najmanju promjenu**: ukloni ljudski actor/verified red iz AI prijelaza; nevaljan ili nepotpun paket vraća greške i ne dira status, `scored` ni ledger.
- [x] **Korak 4: Dodaj gate provjeru** tako da `confirmedVia: 'ai-evidence-audit'` bez artefakta ili sa zastarjelim artefaktom uvijek pada; zadrži zasebnu provjeru službenog autoriteta, sourceId i freshnessa.
- [x] **Korak 5: Pokreni ciljana dva testa i mutacije**; potvrdi baseline da legitimna postojeća ručna pravila nisu promijenila rezultat.

### Zadatak 4: Svjež worklist i kontrolirana migracija svih pravila

**Datoteke:**
- Uredi: `src/verification/worklist.ts`, `scripts/verification-worklist.mts`
- Uredi: `tests/verification-worklist.test.ts`
- Stvori/uredi kroz postojeće generatore: privatne `data/profiles/**/drafts/*.json` i `data/verification/**`
- Regeneriraj: `docs/generated/completion-ledger.json` i javne claim projekcije kroz postojeće naredbe

**Sučelja:** worklist ulazi su svi draft, needs-recheck, legacy batch i statusi bez valjanog `aiEvidence`; redak izlaza sadrži profile/rule/source ID, točan razlog i radnju. Apply alat prihvaća samo validatorov `valid`, nikad slobodan profilni popis ili AI sažetak.

- [x] **Korak 1: Dodaj baseline test** da svi profili i sva pravila iz registara imaju točno jedan status worklista ili valjano dokazano stanje; slučajevi `owner-bulk-approval`, `ai-1pass-batch` i `ai-3pass-batch` moraju se pojaviti kao nedokazani dok se ne priloži novi paket.
- [x] **Korak 2: Pokreni** `npx vitest run tests/verification-worklist.test.ts`; potvrdi da stari batch redci ne postanu automatski valjani.
- [x] **Korak 3: Proširi worklist** stabilnim, mašinski provjerljivim blocker kodovima; ne dopusti da neuspjeh čitanja izvora izgleda kao prazan worklist.
- [x] **Korak 3a: Poveži dokazni gate s objavljenim pravilima**: serverski profil kompajlira samo AI-potvrđene `ruleEntries` za koje resolver potvrdi snapshot i rule-specific izvršni manifest; bez ili uz nevaljan rezultat objava pada, a nacrti i legacy batch zapisi ne mijenjaju runtime `rules`.
- [ ] **Korak 4: Za profile ispod B obradi pravila u ograničenim serijama**: prvo 8 C profila, zatim D profili s postojećim pravilima/popravcima, zatim E profili. Svaki paket ažurira se samo na temelju službenog snapshota i prolazi validator; nejasan scope/modality ili nepostojeći izvor ostaje `insufficient`.
- [ ] **Korak 5: Usporedi imenovani skup ruleId-jeva prije i poslije** i regeneriraj ledger/claim projekcije; nijedna razlika ne smije se zaključiti samo iz ukupnog broja.

### Zadatak 5: D/E profili do B, bez izmišljanja pravila ili popravaka

**Datoteke:**
- Pregledaj i po potrebi uredi: `src/repair/check-fixer-map.ts`, `src/ui/repair-items.ts`, `src/verification/completion-ledger.ts`
- Testovi: `tests/check-fixer-map.test.ts`, `tests/profile-routing.test.ts`, `tests/repair-recipe.test.ts`, `tests/repair-golden.test.ts`, `tests/composed-profile.test.ts`
- Izvori podataka: službeni snapshoti u `data/sources/**` i pravila u `data/profiles/**/drafts/*.json`

**Sučelja:** profil može prijeći na B samo ako potrebna pravila prođu Task 2/3, pravila se kompiliraju bez dijagnostike, svaki fixable bodovani check ima determinističku mapu i generirani DOCX closed-loop manifest prolazi. Advisory nije bodovano pravilo.

- [x] **Korak 1: Dodaj testove prije promjene** koji ruše kandidata za B kada fali profilni fixer, source quote/value ne vrijedi ili closed-loop izlaz ne prolazi; uključi negativnu mutaciju za lažnu repair opciju.
- [x] **Korak 2: Pokreni ciljane testove** navedene iznad i zabilježi njihove baseline rezultate.
- [ ] **Korak 3: Riješi svaki D/E blocker iz svježeg worklista**: poveži samo postojeći odgovarajući fixer ili dodaj mali deterministički fixer uz golden i dvoprolazni idempotency test; ako službeni izvor ili siguran fixer ne postoji, ostavi blocker.
- [ ] **Korak 4: Za svaki promijenjeni profil pokreni** `npm run closed-loop` uz konkretni profilni ulaz, zatim primjenjive `npm run verify:strict-open:repaired` i Word oraclee (`npm run verify:word`, `npm run verify:word:worst`, `npm run verify:word:toc`). Sačuvaj manifest/hash dokaza iz harness-a.
- [x] **Korak 5: Regeneriraj completion ledger** i potvrdi da nijedan profil nije B bez stvarnog sintetičkog closed-loop prolaza.

### Zadatak 6: Stvarni DOCX dokaz za svaki profil i prelazak na A

**Datoteke:**
- Uredi po potrebi: `src/verification/real-corpus-attestation.ts`, `scripts/repair-real-corpus.mts`, `scripts/attest-real-corpus.mjs`
- Testovi: `tests/real-corpus-attestation.test.ts`, `tests/real-corpus.test.ts`, `tests/real-corpus-vacuity.test.ts`, `tests/real-corpus-holdout.test.ts`, `tests/real-corpus-backlog.test.ts`
- Izvještaji: `docs/generated/real-corpus-backlog.json`, `docs/generated/real-corpus-backlog.md`

**Sučelja:** dokaz je po `profileId` i `workType`, ima dopušteni pseudonimizirani input, consent/provenance, input/output hash, repair-oracle verziju, nula regressed checks i vidljivi tekst identičan nakon Word `Fields.Update()`. Ledger čita samo svježu attestation za isti profil i korpusni fingerprint.

- [ ] **Korak 1: Dodaj test** da profil ne ide na A iz jedinica/sličnog profila, iz holdout dokumenta, iz synthetic fixturea, iz nulte pokrivenosti ili iz attestation s povučenim pravima; pokreni odgovarajući real-corpus test i potvrdi crveni baseline.
- [ ] **Korak 2: Učvrsti test generatora** da stvarno stvara ciljani `profileId × workType` par i da uklanjanje sidecara ne mijenja nazivnik neprimjetno.
- [ ] **Korak 3: Proširi attestation** samo gdje postojeći ugovor ne veže consent, profil, input/output hash, vidljivi tekst i oracle. Nikad ne prenosi osobne podatke u javni izvještaj.
- [ ] **Korak 4: Pokreni postojeći stvarni corpus repair harness**; svaki output koji ide prema A otvori kroz strict-open i, za zadane najgore slučajeve/TOC, Word COM oracle. Zabilježi preskočene platformne provjere kao neprovjerene, ne kao zelene.
- [x] **Korak 5: Nabroji sve profile ispod A** nakon svježeg izračuna. Za svaki bez dopuštenog rada/prava prikaži konkretan blocker; ne traži ljudski audit pravila i ne pretvaraj nedostupnost dokumenta u A.

### Zadatak 7: Fakultetski all-A ratchet, privatnost, regeneracija i završni gate

**Datoteke:**
- Uredi: `src/verification/completion-ledger.ts`, `scripts/generate-completion-ledger.mts`
- Uredi testove: `tests/completion-ledger.test.ts`, `tests/evidence-projection.test.ts`, `tests/gate-mutations.test.ts`
- Provjeri: `data/classification.json`, `scripts/security/classification-guard.mjs`, `scripts/verify-dist-classification.mjs`
- Dokumentacija: `docs/PLAN_RAZINA_A.md`; generirani ledger i javne projekcije samo generatorom

**Sučelja:** završni fakultetski ratchet provjerava `facultyAtA === registeredFacultyCount === 407`, svaki profilni redak je A i ima valjan rule-evidence, repair evidence i stvarni corpus attestation. Tri pravna profila izvještavaju se zasebno. Ako cilj nije dostižan zbog nedostatka dokumenta, prava, izvora ili sigurnog popravka, izlaz je eksplicitan NO-GO s imenovanim blockerima, ne prisilno zeleno. B-floor ostaje zaseban međukorak i ne može zadovoljiti završni gate.

- [ ] **Korak 1: Dodaj testove** za fakultetski all-A ratchet: čisti prolaz zahtijeva A za svih 407 profila; profil na B, nedostajući/dupli/neregistrirani ID, stale snapshot, synthetic-only proof, prazan korpus, promijenjen vidljivi tekst ili privatni audit podatak u `dist/` moraju blokirati cilj. Pravna tri profila ne smiju promijeniti nazivnik fakultetskog cilja. Zasebno zadrži test međukoraka faculty minimum-B.
- [ ] **Korak 2: Pokreni** ciljane ledger, projection i classification testove; potvrdi da svaki mutirani kvar ruši odgovarajući gard.
- [x] **Korak 3: Implementiraj ratchet** nad svježe izvedenim registrima i artefaktima, ne nad ukucanim brojem profila; ne mijenjaj značenje razina radi postizanja 100%.
- [ ] **Korak 4: Regeneriraj projekcije** u čistom izoliranom stablu, usporedi sadržaj i obuhvat pregledanih jedinica te pokreni `npm run orphan-scan`.
- [ ] **Korak 5: Završna provjera**: ciljani testovi, mutacijski gardovi, `npm run check`, `npm run orphan-scan`, `npm run master-ci`, `npm run tier2-freshness`, primjenjivi `npm run verify:strict-open:repaired` i Word oraclei. Zabilježi svaki neizvršeni gate kao neprovjeren/NO-GO.

## Provjera plana prema specifikaciji

- AI dokaz po pravilu, snapshot, citat, vrijednost, opseg, modalitet i izvršni manifest pokriveni su Zadatkom 2.
- Bez ljudskog `approver`, bez ljudskog ledger reda, fail-closed ponašanje i bez automatskog prihvaćanja nepodudarnosti pokriveni su Zadatkom 3.
- Legacy batch i owner pending zapisi, worklist svih pravila i bez masovnog prihvaćanja pokriveni su Zadatkom 4.
- Prijelaz D/E kroz službene izvore, sigurne fixere i sintetički B dokaz pokriven je Zadatkom 5.
- A samo uz stvarni dopušteni DOCX dokaz i tekstualni invariants pokriveni su Zadatkom 6.
- Privatnost, javne projekcije i negativne mutacije pokriveni su Zadatkom 7; svih 407 fakultetskih profila na A završni je cilj, a minimum B samo međukorak.
- Placeholder scan: nema `TODO`, `TBD`, `FIXME` ni koraka tipa „napravi odgovarajuće testove”. Svi nepoznati podaci o profilima rješavaju se generatorom worklista, ne pretpostavkom.
