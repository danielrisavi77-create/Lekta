# LEKTA x Laya v2: Semantic Finding Adjudicator

Status: specifikacija koja zamjenjuje Paket 1 iz PR-a #102 kao smjer integracije.
Implementirano u ovoj grani: faza V2.0 (ugovor, candidate builder, gardovi). Nema modela,
nema runtimea, nema izmjene `src/**`.

Osnovno nacelo: Lekta ostaje autoritet za pravila, deterministicku analizu, bodovanje i
popravak. Laya je iskljucivo sekundarni semanticki procjenitelj nalaza koje je Lekta vec
proizvela. Ako Laya nestane iz proizvoda, rezultat deterministicke Lekte ostaje potpuno valjan.

## 1. Problem koji Laya rjesava

Lekta je jaka kad se pitanje moze deterministicki izraziti: margine, font, velicina, prored,
poravnanje, numeriranje stranica, struktura DOCX-a, Word stilovi, TOC, provjerljiva pravila
fakulteta. Laya za to ne donosi vrijednost i to ne smije procjenjivati.

Laya pomaze samo kod nalaza gdje heuristika otkrije sumnjiv slucaj, ali ne moze pouzdano
razumjeti njegovo znacenje. Prvi primjer je `reference.completeness`: neobicni, a valjani
zapisi heuristici izgledaju nepotpuno.

Pitanje za Layu: je li pojedinacni nalaz koji je deterministicka Lekta vec pronasla vjerojatno
stvaran problem, false positive ili slucaj bez dovoljno dokaza? Laya ne trazi probleme sama.

## 2. Podjela odgovornosti

| Sustav | Autoritet za | Ravnina |
|---|---|---|
| Lekta | pravila, izvore, vrijednost, modalitet, scope, parser, bodovanje, `Check.status`, `Issue`, `TriageFinding`, fixability, recept, fixer, Word output, Word truth gate, entitlement, naplata | istina |
| AI Evidence Audit | je li pravilo koje Lekta koristi dokazano sluzbenim izvorom | rule-plane |
| Laya | vlastita savjetodavna predikcija nad konkretnim nalazom u konkretnom dokumentu | finding-plane |

AI Evidence Audit i Laya nemaju zajednicki write path. Registri su odvojeni:
`data/verification/...` za dokaze pravila, `.artifacts/laya/...` (gitignorirano) za
eksperimentalne modele i eval rezultate. `Laya output -> verified RuleEntry` nije dopusten.

```
SLUZBENI IZVORI -> AI Evidence Audit -> VERIFICIRANA PRAVILA
                                              |
DOCX -> Lekta deterministicki engine ---------+
          |-- score
          |-- checks
          |-- issues
          '-- details.triage / details.incompleteReferences
                         |
                         v
                 buildLayaCandidates()  (eligibility, status, veza, jezik, dokaz, limit)
                         |
                         v
                 Laya lokalni runtime  (samo modelInput)
                         |
                         v
                 adjudicate()  (fail-closed, pinani manifest, kalibrirani prag)
                         |
                         v
                 details.semanticAdjudication  (savjetodavno, tek nakon shadow GO)
```

## 3. Laya nikad ne smije

1. mijenjati, izmisljati ili zapisivati fakultetsko pravilo ni `RuleEntry`;
2. mijenjati `Check.status`, bodove ili score;
3. dodjeljivati fixability, birati fixer ili generirati repair parametre;
4. mijenjati DOCX ili pisati i prepravljati akademski sadrzaj;
5. odluciti je li dokument "ispravan" ili oznaciti profil kao A/B/C;
6. zamijeniti Word truth gate ili odobriti placeni popravak.

`repair` ne cita Laya output. Laya moze reci `possible_false_positive`, ali ne moze
`skipFixer()` ni `applyFixer()`. Manual `reference.completeness` ionako ne smije izmisljati
nedostajuce bibliografske podatke.

## 4. Prvi use-case: `reference.completeness`

Lekta prvo pronade moguce nepotpun zapis (`Barbic, J. (2019). Pravo drustava. Zagreb.`,
status `warn`). Tek tada se pojedinacni zapis predaje Layi.

- Pitanje B (implementirano u ugovoru v2): `finding_supported`, `possible_false_positive`,
  `extraction_uncertain`, `insufficient_evidence`.
- Pitanje A (vrsta izvora, V2.2): `book`, `journal_article`, `book_chapter`, `web_source`,
  `report`, `thesis`, `legislation`, `other`, `unclear`.
- Pitanje C (nedostajuce polje, opcionalno kasnije): `author`, `year`, `title`, `container`,
  `publisher`, `pages`, `url_or_doi`, `none`, `unclear`. Samo informacija za korisnika.

Pitanja A i C uvode se kao nova verzija sheme, ne kao opcionalna polja v2 ugovora.

## 5. LayaEligibleCheckRegistry

Kod: `scripts/laya/eligibility.ts`.

- Aktivno: `reference.completeness`.
- Kandidati tek nakon dokaza vrijednosti: `reference.uncited`,
  `citation.author-year.missing-reference`, `citation.direct-quote-locator`.
- Nikad: `formatting.*`, `page.*`, `margin.*`, `font.*`, `spacing.*`, `toc.*`, `paper-size.*`.

Ako problem moze pouzdano rijesiti funkcija ili parser, koristi se funkcija ili parser.
Test `tests/laya/invariants.test.ts` provjerava da je svaki aktivni id poznat stabilni check id
i da nijedna formalna os nije eligibilna.

## 6. Podatkovni tok i candidate builder

Kod: `scripts/laya/candidate-builder.ts`.

`buildLayaCandidates(snapshot)` je read-only. Cita samo stabilne ID-jeve, `result.checks[]`
(`id`, `status`) i pojedinacne zapise. Ne cita `score`, `issues`, `details.triage` ni recept;
getteri na tim poljima se ne izvrsavaju (test). Zapis postaje case samo ako prode redom:

1. `check_not_eligible`: checkId nije u registryju;
2. `check_missing` / `check_ambiguous`: check s tim stabilnim id-jem ne postoji ili postoji vise puta;
3. `check_not_finding`: status nije `warn` ni `fail`;
4. `linkage_not_explicit`: veza zapisa s checkom nije eksplicitna;
5. `unsupported_language`;
6. `evidence_incomplete`: prazan zapis;
7. `context_limit`: zapis dulji od 2000 code pointa (jedan zapis, ne cijeli dokument).

Preskoceni zapis vraca samo lokator i razlog, nikad tekst. Nedostatak lokalnog dopustenja,
nevaljani tipovi, sparse nizovi, accessori i duplikat lokatora odbijaju cijeli batch.

Kljucna invarijanta: `checks[]`, `issues[]` i `score` ostaju isti bez obzira na Laya rezultat
(test nad duboko zamrznutim snapshotom).

### Drift prema masteru utvrden pri izradi V2.0

- `TriageFinding.id` je slug kategorije i naslova (`chk:<kategorija>:<naslov>`), ne `check.id`,
  i nema `recordIndex`. Triage zato nije dovoljan izvor eksplicitne veze. Veza se gradi iz
  `result.checks[].id` (stabilni id) i zapisa iz `details.incompleteReferences[]`.
- Preview flag za `reference-incomplete` nosi `trimExcerpt(r.text)`, skraceno na
  `EXCERPT_MAX = 80` znakova (`src/preview/preview-anchors.ts`). Laya ne smije dobiti taj isjecak
  kao "tekst zapisa". V2.1 runner mora citati puni `r.text` iz `details.incompleteReferences[]`
  (`p` je 1-based indeks odlomka).
- Builder u V2.0 prima vec pripremljene `records` s oznakom `linkage`; sam ih ne izvodi iz
  `details`. Stvarno izdvajanje zapisa i njihova eksplicitna veza s checkom dokazuju se u V2.1.

Usporedba s v1 (grana PR-a #102, commit `3189609`), ne drift mastera: v1 je nosio
`sourcePage`/`verified` u dokazu pravila i `readiness` unutar casea. V2 case postoji samo kad je
model-ready; odluka o podobnosti je u builderu i vraca `skipped`.

## 7. DecisionCase v2

Kod: `scripts/laya/contracts-v2.ts`, shema: `schemas/laya/finding-v2.schema.json`.

```ts
interface LayaDecisionCaseV2 {
  schemaVersion: 2;
  caseId: string;            // laya:v2|checkId|doc|profile|profileRev|para|rec
  inputDigest: string;       // SHA-256 identiteta, enginea i modelInputa
  identity: { documentRevisionId; profileId; profileRevision; checkId; paragraphIndex; recordIndex };
  provenance: { origin: 'owned_synthetic' | 'explicitly_permitted'; permissionRef;
    localInferenceAllowed; trainingAllowed; externalInferenceAllowed;
    documentGroupId; sourceGroupId; templateFamilyId };
  engine: { revision; checkStatus: 'warn' | 'fail'; linkage: 'explicit' };
  modelInput: { text; language: 'hr' | 'en' | 'mixed';
    ruleEvidence: { ruleId; sourceId; locator; excerpt; snapshotHash } | null };
}
```

Model vidi samo `modelInput` (`modelView()`). Ne dobiva korisnicki ID, e-mail, naziv datoteke,
cijeli dokument, score, broj gresaka, entitlement, cijenu, gold oznaku, recept, fixer ni
studentski identitet. Grupni ID-jevi (`documentGroupId`, `sourceGroupId`, `templateFamilyId`)
postoje za grupirani split datasetova i nikad ne idu modelu.

Validator je strog: nepoznato polje, getter, naslijedjeno ili simbolicko polje, v1 verzija i
predug tekst se odbijaju. Greska nikad ne ispisuje vrijednost ni nepoznati kljuc.

## 8. Result v2

```ts
interface LayaDecisionResultV2 {
  schemaVersion: 2; caseId; inputDigest;
  verdict: 'finding_supported' | 'possible_false_positive' | 'extraction_uncertain' | 'insufficient_evidence';
  probabilities: Record<verdict, number>;
  answerConfidence: number;
  runtime: { backend: 'laya-python' | 'laya-onnx'; modelId; modelRevision; weightsSha256;
    vocabularySha256; calibrationRevision; runtimeVersion; precision };
}
```

`answerConfidence` se sprema, ali ne tumaci kao tocnost. Prag nikad nije hardkodiran prema
upstream defaultu: `LayaCalibrationPolicy` je obvezan ulaz i pripada tocno
`modelDigest + calibrationRevision + taskId`.

## 9. Identitet predikcije

Isti checkpoint nije dovoljan identitet: promjena preciznosti moze promijeniti vjerojatnosti i
ponekad argmax. `modelDigest` zato veze backend, model, reviziju, hash tezina, hash tokenizera,
verziju runtimea, preciznost i kalibracijsku reviziju. Cache kljuc je `inputDigest:modelDigest`.

## 10. Fail-closed ponasanje

`adjudicate(result, case, manifest, policy)` nikad ne baca. Svaki od sljedecih slucajeva daje
`no_adjudication` s razlogom, nikad `pass` ni `finding_supported`:

| Uvjet | Razlog |
|---|---|
| case nevaljan ili bez dopustenja | `case_invalid` |
| Laya nije instalirana, model nedostupan, nema odgovora | `runtime_unavailable` |
| pinani manifest nevaljan | `manifest_invalid` |
| nepoznata verzija sheme | `unknown_schema` |
| nepoznata oznaka | `unknown_label` |
| dodatno ili nedostajuce polje | `invalid_result` |
| odgovor nije vezan uz `caseId` i `inputDigest` | `input_not_bound` |
| hash tezina ne odgovara | `weights_mismatch` |
| hash tokenizera ne odgovara | `vocabulary_mismatch` |
| drugi backend, verzija, preciznost ili kalibracija | `runtime_mismatch` |
| zbroj nije 1, verdict nije jedinstveni argmax, vrijednost izvan [0,1] | `invalid_distribution` |
| nema kalibracijske politike | `calibration_missing` |
| politika za drugi modelDigest, taskId ili reviziju | `calibration_mismatch` |
| pouzdanost ispod izmjerenog praga | `below_threshold` |

Eksplicitna veza s nalazom osigurava se prije: bez nje case ne nastaje (odjeljak 6).
Neocekivana iznimka unutar provjere (npr. Proxy trap) takoder je `no_adjudication`
(`invalid_result`). Ostecena ili nepodrzana shema rusi vec import modula; runner tada nema Layu,
sto je `runtime_unavailable`. Lekta u svakom slucaju nastavlja bez promjene.

Granica ugovora (Codex A1 na #149): `adjudicate()` dokazuje vezu deklariranih vrijednosti, ne
njihovo podrijetlo. Ako pozivatelj preda manifest i prag koje je vratio sam runtime, provjera
prolazi. Zato V2.1 runner ucitava pinani manifest i izmjerenu politiku iz pouzdanog registra
(commitani hashovi i kalibracijska revizija, bez tezina), odvojeno od odgovora runtimea, i ima
negativnu kontrolu u kojoj runtime sam predaje manifest i prag. To je uvjet GO kriterija.

## 11. UI (tek V2.5 i V2.6)

- Shadow: korisnik ne vidi nista; biljeze se samo evaluacijski rezultati.
- Advisory: uz nalaz "Semanticka provjera: vjerojatno stvaran nalaz, visoka pouzdanost" ili
  "Semanticka provjera: moguc false positive, preporucena rucna provjera".
- Nikad: "AI kaze da je ovo ispravno". Laya ostaje objasnjena kao sekundarna procjena.

## 12. Score ostaje netaknut

I uz `possible_false_positive: 0.99` kanonski `reference.completeness` check se u v2 ne mijenja.
Jedina dopustena posljedica nakon dokaznog programa je prezentacijska. Automatska supresija
nalaza trazi novu verziju ugovora i zasebnu odluku (V3, izvan ove specifikacije).

## 13. Privatnost

- Zadani rezim je lokalni inference. Laya dobiva samo tekst pojedinacnog zapisa.
- `sanitizeAnalysisResult()` vec izbacuje `details.triage` i doslovne reference iz mreznog
  report payloada. Laya tu granicu ne smije zaobici.
- Udaljeni Laya server, ako ikad: poseban consent, `externalInferenceAllowed=true`, odvojen
  endpoint, nikakav implicitni fallback s lokalnog na cloud, minimalni snippet, vlastiti
  retention ugovor, nikakav training bez zasebnog `trainingAllowed=true`.
- Studentski tekst, tezine i privatni eval izvjestaji nikad ne idu u Git. `schemas/**`,
  `scripts/laya/**` i `docs/laya/**` su `PRIVATE-IP/forbidden` u `data/classification.json`.

## 14. Runtime strategija

- Referentni runtime za razvoj i benchmark: sluzbeni Python Laya upstream.
- Node/TypeScript ONNX backend je kandidat tek nakon parity testa: isti ulaz mora dati prakticno
  ekvivalentan rezultat unutar unaprijed definirane tolerancije.
- Browser: tezine nikad u Vite bundle. Laya nije frontend dependency. Velicina tezina
  (prema upstreamu reda velicine 1,7 GB; nije neovisno izmjereno u ovoj grani) je sama po sebi
  razlog za lokalni/internal runtime.

## 15. Dataset program

- D0, synthetic contract cases: namjenski konstruirani slucajevi za dokaz koda
  (`tests/helpers/laya-v2-fixtures.ts`). Bez stvarnih studentskih podataka.
- D1, evaluation gold set: rucno oznaceni dopusteni primjeri. Gold nastaje prije inferencije,
  model ga ne vidi. Split grupiran po `documentGroupId`, `sourceGroupId`, `templateFamilyId`.
- D2, training set: tek ako zero-shot nema dovoljnu kvalitetu i postoji dovoljno dopustenih
  oznacenih slucajeva. Studentski regresijski korpus se ne pretvara automatski u training set.

Pilot od otprilike 80 vlastitih primjera sluzi smoke testu i eval pilotu, ne treniranju
produkcijskog modela. Razlog (prema upstream typed-decisions benchmarku koji je vlasnik citirao,
nije neovisno reproducirano ovdje): fine-tuned checkpoint oko 0,766 accuracy, bazni oko 0,35 do
0,36, ispod majority baselinea. Laya jako ovisi o domain fine-tuningu.

## 16. Benchmark prije integracije

Usporeduju se najmanje: A trenutna heuristika, B poboljsana deterministicka heuristika,
C zero-shot Laya, D domain fine-tuned Laya. Ako B postigne isto, Laya nam ne treba.

## 17. Metrike za `reference.completeness`

Precision, recall, F1, FPR, FNR, Brier score, calibration error, coverage po pragu, latencija,
memorija, stabilnost na permutaciju oznaka, na hrvatske dijakritike i na neobicne bibliografske
formate. Odvojeno po sve cetiri oznake; agregatna accuracy nije dovoljna.

## 18. Najvazniji safety metric

Najskuplja pogreska je pravi problem oznacen kao `possible_false_positive`. Zato se posebno
mjeri false-positive-adjudication precision. Ako se ikad automatski skrivaju nalazi, prag se
bira prema tom riziku, ne prema ukupnoj accuracy.

## 19. Calibration gate

```
train -> zamrznuti calibration set -> temperature fitting -> zamrznuti test set
      -> coverage/accuracy krivulja -> policy threshold
```

Prag pripada `modelDigest + calibrationRevision + taskId`, ne globalnoj Layi.

## 20. Option-order mutation

Za svaki choice task eval ukljucuje permutaciju redoslijeda opcija. Ako redoslijed znacajno
mijenja rezultat, model nije spreman. Zaseban mutation gate u V2.2. Ugovor vec sada tumaci
vjerojatnosti po oznaci, ne po poziciji (test `redoslijed opcija u odgovoru ne mijenja presudu`).

## 21. Organizacija koda

Postoji (V2.0):

```
schemas/laya/finding-v2.schema.json
scripts/laya/contracts-v2.ts        ugovor, modelDigest, adjudicate()
scripts/laya/candidate-builder.ts   read-only projekcija u caseove
scripts/laya/eligibility.ts         LayaEligibleCheckRegistry
scripts/laya/tsconfig.json          npm run check:laya
tests/laya/contract.test.ts
tests/laya/adjudication.test.ts
tests/laya/candidate-builder.test.ts
tests/laya/invariants.test.ts
tests/helpers/laya-v2-fixtures.ts   D0
tests/helpers/laya-src-boundary.ts  gard: src/** ne uvozi Layu (literal, require, nedoslovni import)
tests/gate-mutations.test.ts        7 mutacija laya/*
```

Dodano u V2.1 bez modela:

```
scripts/laya/registry.ts            pouzdani registar manifesta i pragova (Codex A1), registry.json
scripts/laya/runtime-client.ts      lokalni http klijent, samo loopback, fail-closed
scripts/laya/snapshot-from-analysis.ts  snapshot iz details.incompleteReferences stvarne analize
scripts/laya/runner.ts              runLaya i adjudicateCases, cache inputDigest:modelDigest
scripts/laya/eval.ts                metrike, baselineovi, krivulja pokrivenosti, izbor praga
scripts/laya/eval-run.ts, eval-cli.ts   npm run laya:eval
tests/laya/{registry,runtime-client,runner,eval,eval-cli}.test.ts, tests/laya-analysis-snapshot.test.ts
docs/laya/{RUNTIME_PROTOCOL,EVALUATION_PROTOCOL,RADNA_STANICA}.md
```

Planirano: `scripts/laya/eval-runner.ts`, `parity-runner.ts`, `calibration.ts`,
`tests/laya/parity.test.ts`, `calibration.test.ts`, `docs/laya/DATASET_PROTOCOL.md`,
`EVALUATION_PROTOCOL.md`, `MODEL_CARD.md`. Tek nakon shadow GO: `src/adjudication/`.
Do tada nema Laya importa u `src/**` (gard + mutacije `laya/src-uvozi-layu` i
`laya/src-zaobilazi-gard`). Tekstualni gard ne razrjesava alias, `dist` ni symlink; za javni
bundle je mjerodavan classification build gard nad razrijesenim Rollup grafom.

## 22. Faze

- V2.0, supersede #102 (ova grana): prenijeti contract ideje na aktualni master, schemaVersion 2,
  rijesiti drift, bez modela, bez `src/**`.
- V2.1, pravi runtime: referentni Python Laya u `scripts/laya`, fixture i pravi backend, model
  manifest, hash tezina i tokenizera, reproducibilni inference, runner koji cita
  `details.incompleteReferences[]`.
- V2.2, eval harness: gold dataset, deterministicki baseline, zero-shot benchmark, kalibracija,
  option-order mutacije, latencija i memorija.
- V2.3, odluka o fine-tuningu: samo ako Laya ima signal, a zero-shot nije dovoljan.
- V2.4, fine-tuned kandidat: odvojeni train/calibration/test, model card, dataset manifest,
  bez studentskih podataka bez dopustenja.
- V2.5, shadow integracija: radi uz stvarne analize, nevidljivo korisniku, nista ne mijenja.
- V2.6, advisory UI.
- V3, automatska politika: nije dio ove specifikacije.

## 23. GO / NO-GO

GO zahtijeva sve: contract gate zelen; manifest i politika ucitani iz pouzdanog registra, ne iz
odgovora runtimea; privacy gate zelen; model reproducibility zelen; parity
poznat; zamrznut eval dataset; nema train/test leakagea; Laya nadmasuje deterministicki
baseline; kalibracija izmjerena na zasebnom skupu; prag iz stvarnih podataka; low-confidence
pada u abstain; kvar modela nema utjecaja na Lektu; score, repair plan i DOCX output identicni
sa i bez Laye; nijedan studentski tekst u Gitu ili training setu bez izricitog dopustenja.

Ako Laya ne nadmasi deterministicki baseline, NO-GO je uspjesan ishod eksperimenta. Ne
zadrzavamo AI samo zato sto je AI.

## 24. Odluka za PR #102

#102 se ne mergea. Preuzeto u v2: strogi schema contract, DecisionCase, inputDigest, snapshot
binding, read-only adapter (descriptor i dense-array gard), provenance i policy granice,
abstention (sada `skipped` + `no_adjudication`), model provenance, negativne kontrole.
Nije preuzeto: pretpostavka da je `reference.completeness` spreman za produkcijsku integraciju,
vlastita SHA-256 implementacija (zamijenjena `node:crypto`, skripte su samo Node), `readiness`
unutar casea, `extraction` zastavica u ulazu (postaje verdikt `extraction_uncertain`).

Predlozeni zavrsetak: `#102 -> superseded by Laya v2`, nakon sto ova grana zazeleni.

## Glavno nacelo

Lekta utvrduje cinjenice koje moze dokazati. Laya pomaze samo gdje je nalaz semanticki
neizvjestan. Kad se ne slazu, neslaganje se prikazuje ili mjeri; Laya ne prepisuje Lektinu istinu.
