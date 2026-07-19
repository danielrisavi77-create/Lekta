# Lekta Error Corpus

Trajni, deterministicki i prosiriv sustav za **generiranje, oznacavanje i testiranje** Word
dokumenata s kontroliranim greskama. Cilj: dokazati da Lekta prepoznaje greske koje treba, da
ne prijavljuje greske na valjanim dokumentima, i transparentno pokazati praznine.

Implementiran fazno prema `LEKTA_ERROR_CORPUS_MASTER_PROMPT.md`. **Ne mijenja engine ni parser**
(CLAUDE.md): sve zivi u `tests/corpus/**` i vozi STVARNI `analyzeDocx` (golden put) kroz
kontrolirane ulaze. Golden snapshoti ostaju bajt-identicni.

## Struktura

```
tests/corpus/
  inventory/extract-check-inventory.ts   # faza 1: hibridni inventar (staticki UNIJA runtime)
  ids/check-id-registry.ts               # faza 2: stabilni, jezicno-neovisni checkId po naslovu
  error-case.ts                          # faza 4: model ErrorCase + oracle helperi
  builder/baseline.ts                    # PROLAZNA baza (score 93) + mutacijski helperi
  catalog/atomic.ts                      # atomski fail: 1 mutacija -> 1 provjera padne
  catalog/valid-controls.ts              # valjane netipicne reprezentacije (bez false-positive)
  catalog/boundary.ts                    # below/exact/within-tol/above za brojcane pragove
  coverage/coverage-report.ts            # faza 6: krizanje inventara i slucajeva + gap-backlog
  cli/{inventory,coverage,export}.ts     # generatori artefakata
  generated/                             # inventar (JSON/MD) + profile-check-matrix.csv (commitano)
  reports/                               # check-coverage.md + gap-backlog.md (commitano)
```

Testovi (u `tests/`): `corpus-inventory`, `corpus-ids`, `corpus-atomic`, `corpus-valid-controls`,
`corpus-boundary`, `corpus-coverage`.

## Naredbe

```bash
npm run corpus:inventory   # regeneriraj inventar provjera (generated/*)
npm run corpus:coverage    # regeneriraj coverage + gap-backlog (reports/*)
npm run corpus:export      # izvezi STVARNE .docx za rucni upload (.artifacts/, NE commita se)
npm run test:corpus        # pokreni sve korpusne testove
```

Izvoz podskupa:

```bash
npx vite-node tests/corpus/cli/export.ts --oracle atomic-fail
npx vite-node tests/corpus/cli/export.ts --case atomic.format.font.dominant
```

## Kako dodati novu provjeru (disciplina iz prompta, sekcija 18)

1. Dodaj joj **stabilni checkId** u `ids/check-id-registry.ts` (`corpus-ids` test to iznuduje).
2. Dodaj **valid control** (valjana varijanta ostaje `pass`).
3. Dodaj **atomic fail** (jedna mutacija baze rusi bas tu provjeru).
4. Ako ima brojcani prag, dodaj **boundary** (below/exact/above).
5. Regeneriraj `corpus:inventory` i `corpus:coverage`, pa `npm run check`.

## Nacela

- **Uzrocnost**: atomski slucaj prvo dokaze da baza PROLAZI ciljanu provjeru, pa da je jedna
  mutacija ruši. Bez toga nalaz nije dokaz detekcije.
- **Postenje**: coverage ne lazira 100%; sve nepokriveno je u `reports/gap-backlog.md` (P0-P3).
- **Determinizam**: isti ulaz -> isti izlaz; nema slucajnih seedova bez zapisa.
- **Bez osobnih podataka i bez mreze**: dokumenti su sinteticki i ne salju se nikamo.
