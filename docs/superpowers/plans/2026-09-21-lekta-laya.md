# LEKTA Laya Paket 1 Implementation Plan

> Za izvođaca: `superpowers:executing-plans`; odobren je samo Paket 1.

**Goal:** pripremiti strogi ugovor i read-only adapter, bez pozivanja modela.
**Architecture:** eksplicitan snapshot ulazi u izolirani savjetodavni modul u scripts/laya.
**Tech Stack:** TypeScript, postojeći Vitest, JSON Schema bez nove ovisnosti.
**Spec:** `docs/superpowers/specs/2026-09-21-lekta-laya-design.md`.

## Global Constraints

Nema izmjena src, Supabase, parsera, bodovanja, triagea, repaira ili korisnickog UI-ja.
Nema modela, mreze, treniranja, uvoza studentskog korpusa ili novih placenih usluga.
Pocetna grana nastaje iz `98e905c0f4cba9065143144a0e8f970652515fbc`.
Dokaz nikad nije samo izlazni kod ili zeleni test nad laznim modelom.

## Review Focus

Promijenjen naslov ne smije promijeniti identitet. Dva zapisa pod istim checkId nisu
isti case. Agregatni nalaz nije dokaz da su svi zapisi pogresni. Details.triage mora
ostati netaknut iako ga golden normalizer ne pokriva. Rezultat za drugi case ne smije
proci pod izgovorom da je sam za sebe ispravan JSON.

## Zadatak 1: ugovor i podaci bez izvrsavanja

Datoteke: schemas/laya/finding-v1.schema.json, scripts/laya/contracts.ts,
tests/laya-contract.test.ts, tests/helpers/laya-cases.ts.

Sučelja:

```ts
validateDecisionCase(value: unknown): DecisionCase
validateDecisionResult(value: unknown, expected: unknown): DecisionResult
```

- [x] Napisati vlastite pozitivne i negativne primjere, bez tudjeg rada.
- [x] Pokrenuti crvenu fazu uz pass-through stubove i dokazati odbijanje losih validatora.
- [x] Uvesti istu strukturnu definiciju za datoteku sheme i runtime validator.
- [x] Dokazati odbijanje fixerId, score, params, nepoznatih polja i losih raspodjela.
- [x] Odvojiti entropyConfidence od kalibracije i od stvarnog modelskog dokaza.

## Zadatak 2: read-only adapter

Datoteke: scripts/laya/adapter.mts, tests/laya-adapter.test.ts,
tests/laya-invariants.test.ts. Nema automatskog citanja ili izvoza datoteka.

```ts
buildDecisionCases(input: DecisionSnapshot): DecisionCase[]
```

- [x] Jedan pouzdano izdvojen zapis ima vlastiti locator-based caseId.
- [x] Naslov i DOM id nemaju utjecaja na identitet.
- [x] Nedostatak veze, pravila ili mjerljivog nalaza daje izricito suzdrzavanje.
- [x] Cijeli izvor i ugnijezdeni triage/recept prolaze deep-freeze i equality provjeru.
- [x] Izlaz ne zadrzava promjenjive reference izvora.
- [x] Ponovljeni poziv daje isti rezultat.
- [x] Negativne kontrole dokazuju da izmjena scorea, triage brojaca ili recepta pada.

## Zadatak 3: obavezne provjere i dokumentacija

Datoteke: scripts/laya/tsconfig.json, package.json, data/classification.json,
tests/classification.test.ts, docs/laya/baseline.v1.json i README.md.

- [x] Dodati check:laya u obavezni check; ne oslanjati se na src-only tsconfig.
- [x] Sacuvati orphan-scan kao zaseban predcommit alat, sukladno njegovu izvornom ugovoru.
- [x] Uvesti forbidden klasifikaciju i schemas pokrivenost bez promjene kanarinaca.
- [x] Zamrznuti base SHA i hashove izvora u nesadrzajnom manifestu.
- [ ] Potvrditi puni exact-head `npm run check` i orphan-scan.
- [ ] Neovisni review prije odluke o mergeu.

## Izvrsene odluke o detaljima plana

Result validator prima obavezni expected argument; jednargumentni nacrt nije mogao
sprijeciti zamjenu odgovora medju slucajevima. Negativne kontrole ostaju u novom
laya-invariants testu koji ulazi u isti Vitest gate, umjesto izmjene velikog zajednickog
gate-mutations fajla. Nije promijenjen ili oslabljen nijedan postojeći mutation test.

Offline runner `tests/laya-standalone.mts` izvrsava iste funkcije tvrdnji kao tri
Vitest wrappera. Potreban mu je Node >=22.6 s type strippingom. Glavni projekt i dalje
koristi Vitest na podrzanim CI verzijama; offline runner nije zamjenski puni gate.

## Ponovljiva provjera

```bash
npm ci
npm run check:laya
npm run test:laya
npm run check
npm run orphan-scan
npm run master-ci
```

U izoliranom sandboxu bez DNS-a i npm ovisnosti usko provjeriti:

```bash
tsc --noEmit --project scripts/laya/tsconfig.json
node --experimental-strip-types --test tests/laya-standalone.mts
```

Drugi blok nije dopuštenje da se prvi blok proglasi zelenim. Puni CI, primjenjivi predcommit dokaz i pregled
ostaju uvjeti prije mergea. Paket 2 i ostalo treniranje nisu zapoceti.
