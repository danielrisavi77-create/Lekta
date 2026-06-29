# Data extraction (CLAUDE.md backlog 1)

Cilj: registri koji sad zive kao inline literali u `src/main.ts` postaju tipizirani
`data/**` JSON, a `src/*` loaderi ih hidriraju. Time dodavanje fakulteta postaje
dodavanje podataka, ne koda (vidi VISION.md "Engine i pravila").

## Preduvjet

`src/main.ts` mora biti puni runtime, ne bootstrap stub. Dakle prvo:

```bash
npm run bootstrap     # generira src/main.ts iz reference/prototype.html
```

Dok je main.ts stub, `extract-data` nista ne nalazi i to jasno javi.

## Pokretanje

```bash
npm run extract-data
```

`scripts/extract-data.mjs` izvlaci ove registre (nedestruktivno, ne dira main.ts):

| const u main.ts | data/ datoteka |
| --- | --- |
| VERIFIED_PROFILE_REGISTRY | profiles/verified-profiles.json |
| LEGAL_DEPARTMENT_REGISTRY | profiles/legal-departments.json |
| PROFILE_STATUS / PROFILE_AUTHORITY | profiles/profile-status.json, profile-authority.json |
| BASE_PROFILES / FPZG_PARTIAL | profiles/base-profiles.json, fpzg-partial.json |
| ZAGREB_CATALOG | catalog/zagreb-catalog.json |
| INSTITUTIONAL_COVERAGE_MATRIX | coverage/institutional-coverage-matrix.json |
| COVERAGE_STATUS_META | coverage/coverage-status-meta.json |
| SOCIAL_METHOD_REGISTRY / _SOURCE | methodology/social-methods.json, social-method-source.json |
| FPZG_SUBMISSION_CALENDAR | submission/fpzg-calendar.json |
| PACKAGES | packages.json |
| CHECK_ITEMS | checks/check-items.json |
| WORK_TYPE_LABELS | work-type-labels.json |

Emitira i `data/manifest.json` (popis + broj zapisa po registru).

## Tipovi

`src/profiles/profile-schema.ts` vec sadrzi tipove za izvucene oblike
(`VerifiedProfile`, `LegalDepartment`, `CatalogInstitution`,
`InstitutionalCoverageMatrix`, `PackageDef`, ...). Loaderi u
`src/{catalog,coverage,submission,methodology,config}` importat ce JSON
(`resolveJsonModule` je ukljucen) i tipizirati ga tim tipovima.

## Redoslijed dalje

1. `npm run bootstrap` (jednom, kad postoji pristini prototip).
2. `npm run extract-data` -> popuni `data/**`.
3. Dodaj tanke tipizirane loadere u `src/<area>/*.ts` koji importaju JSON.
4. Prebaci `src/main.ts` da cita iz loadera umjesto inline literala
   (uz faithfulness test: data deep-equal staro stanje). To je backlog 3.
5. Option A: prevedi `rules` u `ruleEntries` (rule-compiler je vec spojen),
   pa brisi migrirane kljuceve iz `rules`.

Svaki korak: `npm run check` zelen.
