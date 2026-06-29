# Golden DOCX fixture

Ovdje idu realni `.docx` radovi koji sluze ISKLJUCIVO regresijskom testiranju
parsera (CLAUDE.md: studentski radovi nikada nisu izvor pravila).

## Kako dodati

1. Ubaci 5 do 10 `.docx` datoteka (raznoliki: FPZG zavrsni, pravni seminar,
   rad s automatskim sadrzajem, rad s fusnotama, rad bez TOC-a, itd.).
2. Opcionalno, uz `ime.docx` dodaj `ime.json` s odabirom profila:
   ```json
   { "profileId": "fpzg-politologija-zavrsni" }
   ```
   Bez sidecara koristi se deterministicki default iz golden-entry.ts.
3. Snimi baseline: `npm test -- -u` (stvara `tests/__snapshots__/...`).
4. Commitaj `.docx`, eventualne `.json` i snapshote zajedno.

Dok je ovaj direktorij prazan (samo `.gitkeep`/`README.md`), golden suite se
sam preskace i build ostaje zelen (vidi `tests/docx-golden.test.ts`).

## Privatnost

Ne stavljaj radove s osobnim podacima koje ne smijes dijeliti. Po potrebi
anonimiziraj (zamijeni imena, OIB, kontakte) prije commita. Repo je lokalni
alat, ali fixture postaju dio povijesti gita.
