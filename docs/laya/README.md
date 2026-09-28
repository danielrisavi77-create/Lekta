# Laya u Lekti

Stanje: V2.1 bez modela. Ugovor, candidate builder, registar pinanih manifesta i pragova, lokalni
klijent, runner i eval harness postoje i testirani su s lazim runtimeom. Nema modela, tezina ni
korisnicke funkcije. `src/**` ne uvozi Layu.

Specifikacija: [`LAYA_V2_SPEC.md`](LAYA_V2_SPEC.md). Runtime: [`RUNTIME_PROTOCOL.md`](RUNTIME_PROTOCOL.md).
Evaluacija: [`EVALUATION_PROTOCOL.md`](EVALUATION_PROTOCOL.md). Radna stanica: [`RADNA_STANICA.md`](RADNA_STANICA.md).

## Koristenje (interni alat)

```ts
import { snapshotFromAnalysis } from '../../scripts/laya/snapshot-from-analysis.ts';
import { loadRegistry } from '../../scripts/laya/registry.ts';
import { httpLayaClient } from '../../scripts/laya/runtime-client.ts';
import { runLaya } from '../../scripts/laya/runner.ts';

const snapshot = snapshotFromAnalysis(analysisResult, meta);      // cita samo checks i incompleteReferences
const registry = loadRegistry(JSON.parse(readFileSync('scripts/laya/registry.json', 'utf8')));
const { adjudications } = await runLaya({ snapshot, registry, modelKey,
  client: httpLayaClient('http://127.0.0.1:8765') });
// Manifest i prag iskljucivo iz registra; 'no_adjudication' je normalan ishod, ne greska.
```

## Provjere

```bash
npm run check:laya     # tsc nad scripts/laya i tests/laya
npm run test:laya      # vitest tests/laya
npm run laya:zlatni    # kandidati, list za oznacavanje i split zlatnog skupa (ZLATNI_SKUP.md)
npm run laya:eval      # eval nad lokalnim runtimeom (radna stanica)
npm run check          # puni gate, ukljucuje check:laya
npm run orphan-scan
```

Testovi dokazuju softverski ugovor nad sintetickim D0 slucajevima. Nisu ML mjerenje, nisu
dokaz kvalitete Laye i ne zamjenjuju benchmark iz odjeljka 16 specifikacije.
