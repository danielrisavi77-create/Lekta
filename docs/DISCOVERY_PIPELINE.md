# Lekta · Discovery pipeline (prije verifikacije pravila)

Spec za korak koji se vrti PRIJE `VERIFICATION_PIPELINE.md`. Cilj: izgraditi potpunu, dedupliciranu mapu svega što treba verificirati, tako da ništa ne promakne prije nego krene verifikacija.

Izvršivi scaffold: `discovery/` (registri plus `generate-coverage.mjs`). CLAUDE.md vrijedi za pravila rada.

## 1. Cilj i odnos prema verifikaciji

Verifikacija odgovara na pitanje je li ovo pravilo točno. Discovery odgovara na ranije pitanje: koja sva pravila, odsjeke i dokumente uopće moramo pokriti. Bez discoveryja verifikacija radi naslijepo i propušta cijele programe i vrste radova.

Izlaz discoveryja je COVERAGE UNIVERSE: iscrpan popis ćelija, gdje je ćelija jedinstvena kombinacija (sveučilište, fakultet, jedinica ili odsjek, program, razina, vrsta rada, vrsta dokumenta), plus za svaku ćeliju prikupljeni kandidati službenih izvora. Taj popis je ulaz u verifikaciju. Ćelija bez izvora ne ulazi u verifikaciju, nego u backlog za prikupljanje ili u advisory.

## 2. Izlaz (artefakti)

- Coverage universe (`discovery/out/coverage-universe.json`): sve ćelije sa statusom i pripadnim kandidatima izvora.
- Gap izvještaj (`discovery/out/GAPS.md`): blokirane ćelije, nepotvrđena sveučilišta, orphani, duplikati, programi bez vrsta rada.
- Source-candidate registry (`discovery/registries/source-candidates.json`): snapshotirani kandidati izvora (još neverificirani).

## 3. Faze (A = automatski, H = ljudski)

0. (H) Opseg. Definiraj koja su sveučilišta i fakulteti u opsegu i s kojom granularnošću ćelije. Počni usko (Sveučilište u Zagrebu, FPZG i Pravo), pa širi.

1. (A) Ingest postojećeg. Učitaj postojeći v2.3.0 `data/catalog` (ustanove i programi) i `data/coverage` (matrica) te `data/profiles` (vrste rada) i njima seedaj registre za već pokrivene fakultete (FPZG, Pravo). Ne prepisuj ručno. Ovo osigurava da discovery ne kreće od nule za ono što već imaš.

2. (A plus H) Enumeracija institucija. Popiši sveučilišta, fakultete, odsjeke ili katedre, studijske programe i razine (preddiplomski, diplomski, integrirani, poslijediplomski, doktorski). Izvori: službene stranice fakulteta i nacionalni registar programa. Svaki unos nosi URL i datum dohvata. Nepotvrđeno ostaje `confirmed:false`.

3. (A plus H) Mapiranje vrsta rada i dokumenata. Za svaki program i razinu enumeriraj sve dokumente koji se mogu predati i vrste rada (seminarski, završni, diplomski, doktorski, plus specifične varijante poput Master's Thesis na MES). Generator koristi default vrste rada po razini iz `config.json`, uz override po programu u `worktypes.json`. Ovo širi ćelije.

4. (A) Prikupljanje kandidata izvora. Za svaku ćeliju ili jedinicu skupi kandidate službenih izvora (pravilnik o završnom ili diplomskom, upute za izradu, citatni standard, obrasci ili predlošci). Spremi kao NEPROMJENJIV snapshot (PDF plus URL plus datum plus hash) u source-candidate registry, dedupliciran. Ovo su KANDIDATI, ne verificirani izvori.

5. (A) Sastavljanje coverage universea. Pokreni `generate-coverage.mjs`: raširi programe u ćelije, prikači kandidate izvora po scopeu, izračunaj `discoveryStatus`, provjeri integritet, ispiši rupe.

6. (H) Prioritizacija i predaja. Rangiraj ćelije po vrijednosti (volumen puta platežna spremnost puta stabilnost izvora) i odredi redoslijed. Ćelije sa statusom `sources-collected` predaj u `VERIFICATION_PIPELINE.md`. Ćelije `blocked` idu u backlog za prikupljanje ili u advisory ako izvor ne postoji.

## 4. Registri (shema)

```
universities.json  { id, name, url, confirmed, fetchedAt }
faculties.json     { id, universityId, name, abbrev, url, confirmed, fetchedAt }
units.json         { id, facultyId, name, url, confirmed, fetchedAt }   (opcionalno: odsjeci, katedre)
programs.json      { id, facultyId, unitId?, name, level, confirmed, source?, fetchedAt }
worktypes.json     { id, programId, workType, documentType, note? }     (override; inace default po levelu)
source-candidates.json { id, scope, kind, title, url, fetchedAt, snapshotPath, snapshotHash, validityClass, confirmed }
config.json        { scopeUniversities[], freshnessMonths, defaultWorkTypesByLevel{} }
```

`scope` kandidata izvora je `facultyId`, `programId` ili `cellId`. `confirmed:false` izvor se NE računa dok se ne snapshotira i potvrdi.

## 5. Generator (`generate-coverage.mjs`)

Pokretanje: `node discovery/generate-coverage.mjs`.

Radi: za svaki program raširi vrste rada (override iz `worktypes.json`, inače default po `level` iz `config.json`) u ćelije `{fakultetAbbrev}-{program}-{vrstaRada}`; prikači kandidate izvora po scopeu; postavi `discoveryStatus` (`blocked` bez potvrđenog izvora, `sources-collected` s njim); provjeri referencijalni integritet (orphani), duplikate programa po normaliziranom nazivu i razini, programe bez vrsta rada i fakultete bez programa. Zapiše `coverage-universe.json` i `GAPS.md`.

## 6. Statusi ćelije

- `blocked` nema potvrđenog izvora. NE ulazi u verifikaciju. Ide u backlog ili advisory.
- `sources-collected` ima bar jedan potvrđen, snapshotiran izvor. Spremno za predaju verifikaciji.
- Nakon predaje, daljnje statuse (`draft`, `verified`, `published`) vodi verifikacijski pipeline po pravilu, ne ćeliji.

## 7. Completeness gates (kad je discovery gotov)

Za fakultet:
- [ ] Fakultet i sva njegova sveučilišta su `confirmed:true` uz izvor (URL plus datum).
- [ ] Svaki program ima `level` i barem jednu vrstu rada (override ili default).
- [ ] Nema orphana: svaka ćelija vodi do programa, program do fakulteta, fakultet do sveučilišta.
- [ ] Detektirani su duplikati programa (isti program pod različitim nazivom).
- [ ] Za svaku ciljanu ćeliju ili je prikupljen barem jedan kandidat izvora (`sources-collected`) ili je svjesno označena `blocked` plus razlog.
- [ ] Gap izvještaj pregledan, svaka blokirana ćelija ima plan (prikupiti izvor, kontakt, ili advisory).

Discovery nije gotov dok GAPS.md za taj fakultet nema neobjašnjenih rupa.

## 8. Automation split

- A: ingest v2.3.0, enumeracija preko registara i crawla, prikupljanje i snapshot izvora plus hash, dedupe, generiranje coverage universea, gap i completeness izvještaji, detekcija promjene izvora.
- H: potvrda popisa institucija i mapiranja vrsta rada gdje je dvosmisleno, prioritizacija, odluka blocked ili advisory.

AI smije predlagati i prikupljati. Čovjek potvrđuje da unos postoji i odgovara izvoru (`confirmed:true`). Isto načelo kao u verifikaciji: AI ubrzava, čovjek jamči.

## 9. Runbook za svaki novi fakultet (sažeto)

Definiraj opseg, ingest postojećeg ako ga ima, enumeriraj fakultet, odsjeke, programe i razine uz izvor, mapiraj vrste rada i dokumente, prikupi i snapshotaj kandidate izvora, pokreni generator, pregledaj GAPS.md, riješi ili označi blokirane ćelije, predaj `sources-collected` ćelije u verifikaciju. Radi fakultet po fakultet, ne sve odjednom.

## 10. Guardrails (uz CLAUDE.md)

- Ne izmišljaj institucije, programe ni izvore. Sve nepotvrđeno je `confirmed:false`.
- Snapshot izvora je nepromjenjiv; verifikacija se kasnije veže na taj snapshot.
- Ćelija bez potvrđenog izvora ne ulazi u verifikaciju.
- Već pokriveno (FPZG, Pravo) ingestaj iz v2.3.0, ne prepisuj rukom.
- Hrvatski default, bez em i en crtica, produkcijski kod, mali commitovi, generator mora proći bez grešaka.

## 11. Acceptance (Definition of Done za izgradnju)

- [ ] Registri postoje sa shemom iz sekcije 4; generator se vrti bez grešaka.
- [ ] `generate-coverage.mjs` proizvodi `coverage-universe.json` i `GAPS.md`.
- [ ] Ingest skripta seeda registre iz postojećeg v2.3.0 `data/catalog`, `data/coverage`, `data/profiles`.
- [ ] Generator detektira orphane, duplikate, programe bez vrsta rada i blokirane ćelije.
- [ ] Ćelija ulazi u verifikaciju samo kad je `sources-collected` (ima potvrđen, snapshotiran izvor).
- [ ] GAPS.md je prazan za ciljani fakultet prije nego se on preda u verifikaciju.
