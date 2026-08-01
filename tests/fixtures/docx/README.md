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

## Iznimka: sintetski regresijski svjedoci (`synthetic-*.docx`)

Fixture s prefiksom `synthetic-` NISU pravi radovi: rucno su sastavljeni (isti
zipStore pristup kao `tests/helpers/docx-builder.ts`) da vjerno reproduciraju
TOCNO ODREDJEN strukturni kvirk (RE-ID iz `docs/AUDIT_MASTER.md`, poglavlje 5)
koji su prave anonimizirane fixture jos ne pokrivaju: LibreOffice/Google Docs
default paragraph stil "Standard" umjesto "Normal", hrvatski Word/LibreOffice
naslov stilom "Naslov1" umjesto "Heading1", i rad s OMML formulom (`m:oMath`) uz
osirotjeli prazan odlomak. Sidecar `.json` svakog nosi `"synthetic": true` i
`note` s objasnjenjem. Sluze ISKLJUCIVO kao regresijski test-net (dokazuju
zatecено, danas pogresno ponasanje prije Faze 2 popravka); kao i sve ostale
fixture, nikad nisu izvor pravila.
