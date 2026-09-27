# Laya u Lekti

Stanje: V2.0. Ugovor, candidate builder i gardovi postoje. Nema modela, runtimea, treniranja,
vanjskog poziva ni korisnicke funkcije. `src/**` ne uvozi Layu.

Specifikacija: [`LAYA_V2_SPEC.md`](LAYA_V2_SPEC.md). Zamjenjuje Paket 1 iz PR-a #102.

## Koristenje (interni alat, V2.1+)

```ts
import { buildLayaCandidates } from '../../scripts/laya/candidate-builder.ts';
import { adjudicate, modelView } from '../../scripts/laya/contracts-v2.ts';

const { cases, skipped } = buildLayaCandidates(snapshot);
for (const c of cases) {
  const raw = await runtime.infer(modelView(c));          // V2.1, lokalno
  const verdict = adjudicate(raw, c, pinnedManifest, calibratedPolicy);
  // verdict.status === 'no_adjudication' je normalan ishod, ne greska.
}
```

## Provjere

```bash
npm run check:laya     # tsc nad scripts/laya i tests/laya
npm run test:laya      # vitest tests/laya
npm run check          # puni gate, ukljucuje check:laya
npm run orphan-scan
```

Testovi dokazuju softverski ugovor nad sintetickim D0 slucajevima. Nisu ML mjerenje, nisu
dokaz kvalitete Laye i ne zamjenjuju benchmark iz odjeljka 16 specifikacije.
