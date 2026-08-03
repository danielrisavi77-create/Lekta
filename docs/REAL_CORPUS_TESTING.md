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

## Četiri razine dokaza (Tier model)

Popravljeni paket se ne dokazuje jednom provjerom. Svaka razina hvata ono što prethodna ne može,
i svaka ima svoju cijenu, pa je i mjesto pokretanja različito.

| Tier | Alat | Gdje se vrti | Kad | Što hvata |
| --- | --- | --- | --- | --- |
| 0 | `src/repair/package-integrity.ts` + xmldom `onError` | `npm run check` | svaki commit | neispravan XML u bilo kojem dijelu, atribut iza `/`, nestali ili ispražnjeni dijelovi |
| 1 | python-docx + lxml (`npm run verify:strict-open`) | GitHub `docx-strict-open` | svaki push | strogi XML pod tuđim parserom, neispravan `[Content_Types].xml`, viseće `r:id` relacije |
| 1.5 | LibreOffice headless | ručno | pred izdanje | pad na render putanji |
| 2 | Word COM (`npm run verify:word`, `verify:word:worst`) | ručno, Windows | prije deploya repair motora | "Word je popravio dokument", stvarne izmjerene vrijednosti, očuvanje tablica/slika/fusnota |

Zašto Tier 0 nije omotač oko postojećeg `parseXml`: `@xmldom/xmldom` **ne baca i ne stvara
`parsererror` čvor** na neispravnom XML-u, nego grešku javi samo kroz `onError`, a neispravni dio
serijalizira kao tekst. Kako je xmldom runtime svih testova i Web Workera, takav omotač bio bi
lažno zeleno. Dokaz je u `tests/repair-package-integrity.test.ts`.

Zašto Tier 1 uz Tier 0: Tier 0 je naš vlastiti kod, pa dijeli pretpostavke s onim što provjerava.
lxml je tuđi, stroži parser, a python-docx uz to čita OPC relacijski graf. Vrti se na ubuntuu, za
razliku od Tier 2 koji je Windows-only.

Tier 1 lokalno traži `pip install python-docx lxml`. Na Windowsu s više Pythona koristi onaj koji
ih ima (`py -3 scripts/verify-docx/strict-open.py tests/fixtures/docx`).

Provjerava se i **izlaz**, ne samo ulaz, jer je izlaz ono što ide korisniku:

```bash
npm run repair-real-corpus:review
python scripts/verify-docx/strict-open.py .artifacts/lekta-real-corpus-review
```

## Tier 2: Word kao orákul (`scripts/word-verify/`)

Jedina provjera koja odgovara na pitanje "hoće li se dokument otvoriti kod korisnika bez poruke
*Word je popravio dokument*". `Documents.Open` se zove s `OpenAndRepair = $false`, pa oštećen
dokument baca iznimku umjesto tihog oporavka.

```bash
npm run verify:word         # a/b/c: Wordov zadani, izravno oblikovanje, izmijenjen stil Normal
npm run verify:word:worst   # dokument najgoreg slučaja (naslovnica, tablica, slika, fusnote)
```

`check.ps1` mjeri **drugi odlomak** kao tijelo teksta, pa vrijedi samo za dokumente oblika
naslov + tijelo. Dokument najgoreg slučaja počinje naslovnicom čiji je drugi odlomak namjerno
centriran, pa ga `check.ps1` izričito preskače; njega provjerava `check-worst-case.ps1`.
