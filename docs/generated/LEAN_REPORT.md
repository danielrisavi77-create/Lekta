# Lean izvjestaj (T56)

Generira `npm run lean:report`; ne uredjuj rucno. Mjerenje, ne ciscenje: nista od navedenog nije obrisano,
a knip na ovom repozitoriju ima i lazne pozitive (npr. HTML ulazi i skripte koje se zovu izvan package.json).
Ratchet: `docs/generated/lean-baseline.json`, gard `tests/lean-ratchet.test.ts` (brojevi ne smiju rasti).

| Metrika | Izmjereno | Baseline |
|---|---:|---:|
| knip: neiskoristene datoteke | 182 | 182 |
| knip: neiskoristeni exporti | 183 | 183 |
| knip: neiskoristeni tipovi i clanovi | 342 | 342 |
| knip: neiskoristene ovisnosti (dependencies + devDependencies) | 8 | 8 |
| knip: koristene a nenavedene ovisnosti | 0 | 0 |
| knip: nerazrijeseni importi | 0 | 0 |
| jscpd: duplicirani retci | 3532 | 3532 |
| jscpd: klonovi | 344 | 344 |

Duplicirano: 2.79 % od 126492 redaka (informativno, nije u ratchetu).

## Top 10 datoteka po knip nalazima (exporti, tipovi, ovisnosti)

1. `src/admin/admin-types.ts` (25)
2. `src/ui/repair-panel.ts` (22)
3. `src/integration/academic-suite-contracts.ts` (20)
4. `src/verification/completion-ledger.ts` (17)
5. `src/profiles/profile-schema.ts` (13)
6. `src/citations/citation-web.ts` (10)
7. `src/ui/results/visual-result-model.ts` (9)
8. `package.json` (8)
9. `src/scoring/evaluate/measurements.ts` (8)
10. `scripts/laya/contracts-v2.ts` (7)

## Top 10 datoteka po dupliciranim retcima (jscpd)

1. `repair/apply-fixers.test.ts` (426)
2. `gen-private-batch2.mjs` (227)
3. `auth/session.ts` (202)
4. `tools/citation.ts` (174)
5. `ui/repair-panel.test.ts` (168)
6. `gen-small-unis.mjs` (156)
7. `repair/xml-patch.ts` (147)
8. `repair/paragraph-cleanup.test.ts` (136)
9. `generate-competitor-pages.mjs` (133)
10. `generate-report/index.ts` (128)
