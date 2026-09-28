# Laya evaluacija: protokol (V2.2 harness)

Kod je u `scripts/laya/eval.ts` (metrike i baselineovi) i `scripts/laya/eval-run.ts` (tok), a ulaz je
`npm run laya:eval`. Pokreće se na radnoj stanici, uz lokalni runtime prema `RUNTIME_PROTOCOL.md`.

## Zlatni skup (D1)

Datoteka ostaje lokalno i nikad ne ide u Git, jer sadrži tekst zapisa. Priprema, označavanje i
grupirani split: `npm run laya:zlatni`, upute u `ZLATNI_SKUP.md`.

```json
{ "schemaVersion": 1, "datasetId": "d1-2026-10", "split": "calibration",
  "items": [ { "case": { "...": "LayaDecisionCaseV2" }, "gold": "finding_supported" } ] }
```

- Oznaku postavlja čovjek prije inferencije. Model je nikad ne vidi (`modelView` vraća samo `modelInput`).
- Case mora proći `validateDecisionCase`, uključujući `provenance.localInferenceAllowed = true`
  i dopušteno podrijetlo (`owned_synthetic` ili `explicitly_permitted`).
- Split `calibration` i `test` je grupiran po `documentGroupId`, `sourceGroupId` i
  `templateFamilyId`: isti dokument, izvor ili predložak nikad nije u oba.
- Studentski rad ulazi samo uz izričito dopuštenje (`permissionRef`), a nikad automatski iz
  regresijskog korpusa.

## Tijek

1. **Registar bez praga.** U `scripts/laya/registry.json` se dodaje unos s manifestom (hashovi
   težina i tokenizera sa stroja), `policy: null` i `calibrationEvidence: null`. Bez praga svaka
   presuda je `calibration_missing`, ali eval i dalje čita sirove vjerojatnosti.
2. **Kalibracija.** Naredba:
   `npm run laya:eval -- --gold <calibration.json> --endpoint http://127.0.0.1:8765 --model-key <kljuc> --calibrate --min-accuracy 0.9 --out .artifacts/laya/cal.json`
   Izvještaj predlaže najniži prag koji na kalibracijskom skupu nema opasnih pogrešaka i ima
   traženu točnost (`selectThreshold`).
3. **Unos praga.** Čovjek pregleda izvještaj i upisuje `policy` (taskId, modelDigest,
   calibrationRevision, minAnswerConfidence) i `calibrationEvidence` (putanja ili commit
   izvještaja) u registar. `loadRegistry` odbija prag za drugi modelDigest ili reviziju.
4. **Test.** Ista naredba nad `split: test`, bez `--calibrate`. Tek ovaj broj ulazi u GO/NO-GO.

## Izvještaj

Sadrži samo brojeve, bez teksta zapisa i bez caseId:

- `laya`: pokrivenost, točnost na pokrivenima, po oznaci precision, recall, F1, FPR, FNR i support,
  `dangerousErrors`, `falsePositiveAdjudicationPrecision`, Brier i ECE;
- `coverageCurve` za pragove 0,05 do 0,95;
- `optionOrderInstability`: udio caseova čija se presuda promijeni kad se redoslijed oznaka obrne;
- `latencyMs`: medijan i p95;
- `baselines`: A je trenutna Lekta (svaki nalaz je stvaran), uz većinsku klasu;
- `noAdjudicationReasons`: koliko je suzdržavanja i zašto.

## Kriteriji (LAYA_V2_SPEC.md, odjeljci 16 do 23)

- `dangerousErrors` na testnom skupu je glavni sigurnosni broj. Pravi nalaz proglašen mogućim lažnim
  najskuplja je pogreška.
- Laya mora nadmašiti baseline A i većinsku klasu po oznaci, ne samo po agregatnoj točnosti.
- `optionOrderInstability` mora biti blizu 0; znatna nestabilnost znači da model nije spreman.
- Ako Laya ne nadmaši deterministički baseline, NO-GO je uspješan ishod eksperimenta.

Baseline B (poboljšana deterministička heuristika) još nije napisan. Dodaje se kao funkcija u
`eval.ts` kad D1 pokaže koje vrste lažnih nalaza postoje.
