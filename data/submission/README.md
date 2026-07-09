# data/submission/academic-deadlines.json

Registar STVARNIH, potvrdenih rokova predaje po (fakultet, program, vrsta rada, akademska
godina). Isto nacelo sljedivosti kao `VERIFICATION_PIPELINE.md`: unos postoji SAMO ako
je potvrden sluzbenim izvorom, s URL-om i datumom dohvata. Prazan niz je ispravno pocetno
stanje, ne popunjavaj ga primjerima ili pretpostavkama.

## Shema po unosu

```json
{
  "facultyId": "fpzg",
  "programId": "politologija",
  "workType": "diplomski",
  "academicYear": "2025/2026",
  "deadlineDate": "2026-09-15",
  "source": "https://... (sluzbena stranica ili PDF s rokovima)",
  "fetchedAt": "2026-07-01",
  "confirmed": true
}
```

- `facultyId`, `programId`, `workType`: ista terminologija kao coverage matrica i katalog.
- `deadlineDate`: ISO datum (`YYYY-MM-DD`), STVARAN rok, nikad procjena ni raspon.
- `source`: URL ili naziv sluzbenog dokumenta gdje je rok naveden.
- `fetchedAt`: kad je unos zadnji put potvrden protiv izvora.
- `confirmed`: `true` iskljucivo nakon ljudske potvrde protiv izvora. `false` unosi loader
  ignorira (isti tretman kao `draft` pravilo u VERIFICATION_PIPELINE, nikad se ne koristi
  za slanje podsjetnika).

## Odrzavanje

Rokovi se mijenjaju svake akademske godine. Prije svake sezone predaje (isti ritam kao
`COMPETITORS.md` review kadenca) provjeri postojece unose protiv izvora, azuriraj
`academicYear`/`deadlineDate`/`fetchedAt`, ili makni unos ako fakultet vise ne objavljuje
fiksni rok. Stari `deadline_subscriptions` retci u bazi se cuvaju svojom vlastitom
kopijom podatka u trenutku pretplate (vidi migraciju), pa promjena ovdje ne mijenja
retroaktivno vec poslane podsjetnike.
