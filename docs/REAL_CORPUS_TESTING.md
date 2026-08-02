# Testiranje stvarnog DOCX korpusa

Harness za stvarne, nesintetičke `.docx` uzorke koristi sidecar datoteku istog imena:

```json
{ "profileId": "fer-diplomski" }
```

Pokretanje:

```bash
npm run repair-real-corpus
```

Izvještaj je u `docs/generated/repair-real-corpus.json`. U njega se ne zapisuju tekst rada,
citate ni osobni podaci. Sintetički fixturei sa `synthetic: true` automatski se izostavljaju.

Harness za svaki dokument:

1. analizira dokument odabranim profilom,
2. izvlači sigurne automatske stavke iz istog profilnog UI recepta,
3. primjenjuje popravak,
4. ponovno analizira DOCX,
5. provjerava čitljivost izlaza, očuvanje teksta, regresije i idempotenciju.

Ishodi su `no-op`, `review` ili `fail`. `review` je očekivan za dokument koji je promijenjen,
čak i ako su automatske provjere prošle, jer takav dokument treba vizualno otvoriti u Wordu ili
LibreOfficeu. `fail` znači tehnički problem, regresiju ili nečitljiv izlaz.

Dodavanje novog uzorka:

1. dodaj anonimizirani `.docx` u `tests/fixtures/docx/`,
2. dodaj sidecar s točnim `profileId`,
3. pokreni `npm run repair-real-corpus`,
4. ručno pregledaj dokumente označene u `manualReviewRequired`.
