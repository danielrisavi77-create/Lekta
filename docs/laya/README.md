# Laya u Lekti: samo temelj internog pokusa

Implementiran je Paket 1: podatkovni ugovor, read-only adapter i testovi.
Nema instaliranog/treniranog Laya modela, korisnicke funkcije ili vanjskog poziva.

## Gdje je kod

- `scripts/laya/contracts.ts`: stroga struktura i semantika case/result ugovora.
- `scripts/laya/adapter.mts`: projekcija eksplicitnog snapshot konteksta.
- `schemas/laya/finding-v1.schema.json`: lokalna strukturna shema oba ugovora.
- `tests/helpers/laya-cases.ts`: vlastiti sinteticki primjeri i dijeljene tvrdnje.
- `tests/laya-*.test.ts`: tri Vitest suitea unutar postojeceg obaveznog gatea.
- `baseline.v1.json`: polazni commit i ne-sadrzajni hashovi.

Adapter ne uvozi `src` i javna aplikacija ne uvozi adapter. Time ostaje odvojen od
motora i autoritativnog rezultata. Schema i scripts/laya su zabranjeni u browser bundleu.
To je bundle politika, ne tvrdnja da su datoteke u javnom repozitoriju tajne.

## Koristenje u buducem internom alatu

```ts
import { buildDecisionCases } from '../../scripts/laya/adapter.mts';
import { validateDecisionResult } from '../../scripts/laya/contracts.ts';
import type { DecisionSnapshot } from '../../scripts/laya/adapter.mts';

export function prepare(snapshot: DecisionSnapshot) {
  return buildDecisionCases(snapshot);
}

// Poziv modela NIJE dio ovog paketa. Rezultat se validira uz poslani case:
export const validateResponse = validateDecisionResult;
```

Pozivatelj mora dati stabilne pseudonime, locator jednog zapisa, vezu s checkom,
potvrdjeni dokaz primjenjivog pravila i dozvole. `ready` znaci strukturnu podobnost
za pokus, ne da je nalaz tocan. Sam validator ne moze ovjeriti pravilo ili dozvolu.

Kasniji inference smije dobiti samo `case.modelInput`, ne audit, ID-jeve skupina,
prava upotrebe, gold oznaku ili uciteljevo obrazlozenje. To ce se zasebno provjeriti
u Paketu 2/3. Testni fixture backend nije stvarni model niti ML dokaz.

## Provjere

```bash
npm run check:laya
npm run test:laya
npm run check
npm run orphan-scan
```

Za offline dijagnostiku na Node >=22.6:

```bash
node --experimental-strip-types --test tests/laya-standalone.mts
```

Standalone i Vitest koriste iste tvrdnje. Prvi ne provjerava cijeli projekt,
Deno Edge funkcije, browser build ili stvarni Word. To se ne smije predstavljati kao
puni release dokaz. Ne koristiti studentski korpus kao trening dataset.

Spec: `../superpowers/specs/2026-09-21-lekta-laya-design.md`.
Plan: `../superpowers/plans/2026-09-21-lekta-laya.md`.

## Binding ulaza nakon neovisnog pregleda

`DecisionCase.inputDigest` i `DecisionResult.inputDigest` obvezni su SHA-256 otisci odluci relevantnog ulaza. `informational` nije model-ready status; metapodaci se provjeravaju i kod praznog batcha, a policy-abstain se izvodi bez modela.
