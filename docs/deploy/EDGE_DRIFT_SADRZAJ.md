# Edge funkcije: drift po sadrzaju (T101)

`npm run deploy-drift` je do 4. 10. 2026. usporedjivao samo POSTOJANJE funkcija (repo nasuprot
deployanom popisu) i `verify_jwt`. Deployana funkcija sa starim kodom prolazila je kao uredna:
`faculty-request` je na produkciji vracao `Access-Control-Allow-Origin: *`, dok repo odabire origin s
popisa, a izvjestaj ga je vodio kao "deployano".

## Metoda

Alat je dokaz deploya, pa je fail-closed: svaka nesigurnost je `NE ZNAM`, nikad `JEDNAKO`.

- `GET /v1/projects/{ref}/functions/{slug}/body` vraca deployani bundle kao binarni ESZIP v2.3.
  `parseEszip` (`scripts/deploy-drift-core.mjs`) ga cita strogo: magic `ESZIP2.2`/`ESZIP2.3`, opcije
  bez kontrolnog zbroja, zaglavlje modula, npm snimka, izvori i mape, svaki zapis unutar granica svoje
  sekcije i nijedan bajt viska. Raspored je izmjeren na produkciji (`health` 10318 B, `admin-stats`
  266212 B, oba procitana do zadnjeg bajta), a generator u testu iz stvarnog bodyja ponovno sastavi
  iste bajtove (fixtura `tests/fixtures/deploy-drift/health.eszip`).
- `deployedModules` cita ulaz i razrjesavanje importa iz metapodataka runtimea
  (`---EDGE-RUNTIME-METADATA---`: `<ulaz>{"import_map":null,"jsr_pkgs":[],"package_jsons":{},...}`).
  Korijen putanja izvodi se iz ulaza, jer ga je Supabase CLI mijenjao (izmjereno 4. 10. 2026.):
  `source/index.ts`, `<slug>/index.ts`, `functions/<slug>/index.ts` i
  `source/supabase/functions/<slug>/index.ts` (uz `source/src/...`). Drugi oblik ulaza je `NE ZNAM`.
- Svaki lokalni modul mora imati vlastitu source mapu s jednim izvorom, imenovanim kao modul, i
  citljivim `sourcesContent` (izvorni TS). Modul bez toga, dva modula s istom putanjom u repou ili
  izlaz iz korijena repoa daju `NE ZNAM`; modul se nikad ne preskace. Udaljeni moduli (`https:`,
  `npm:`, `jsr:`) i npm zapisi nisu dio repoa i preskacu se.
- Import mapa: isti tekst importa dokazuje isti graf samo ako se importi razrjesavaju isto. Repo nema
  import mapu (`supabase/functions/deno.json` nosi samo `compilerOptions`), a svih 19 deployanih
  funkcija ima `import_map: null` bez JSR paketa i `package.json` razrjesavanja. Deploy s import mapom
  ili paketima je zato `NE ZNAM` dok se usporedba ne prosiri na efektivnu mapu.
- Vezanje uz verziju: zapis funkcije (`version`, `updated_at`) cita se prije i poslije dohvata
  bodyja; promjena izmedju dva citanja je `NE ZNAM`. `ezbr_sha256` iz zapisa NIJE SHA-256 bodyja
  (izmjereno na `health` i `admin-stats`), pa se ne koristi kao otisak.
- `contentDrift` usporedjuje svaki lokalni modul s repoom bajt po bajt (CR normaliziran) i imenuje ga
  s ishodom (`jednako`, `razlicit`, `nema u repou`):
  - `JEDNAKO`: svi lokalni moduli jednaki repou;
  - `DRIFT`: ijedan modul se razlikuje ili ga u repou nema;
  - `NE ZNAM`: deploy se nije mogao procitati, vezati uz verziju ili mapirati na repo. To NIJE prolaz.
- Skripta samo cita; nista ne deploya.

## Sto je CI, a sto operativno mjerenje

`npm run check` i CI vrte samo testove jezgre (`tests/deploy-drift-core.test.ts`) i mutacije u
`tests/gate-mutations.test.ts`, nad fixturom i sintetickim bundleima, bez mreze i bez tokena. To
dokazuje da usporedba radi, ne kakvo je stanje produkcije.

Stanje produkcije je autentificirano operativno mjerenje izvan CI-ja: `npm run deploy-drift` uz
`SUPABASE_ACCESS_TOKEN`, a rezultat je `docs/generated/DEPLOY_DRIFT.md` s datumom mjerenja. Taj
dokument vrijedi za trenutak mjerenja; svaki deploy ga cini zastarjelim.

Pokretanje (token i ref iz okoline, kao i prije):

```bash
SUPABASE_ACCESS_TOKEN=... LEKTA_PROD_REF=... npm run deploy-drift
```

## Mjera prije popravka, produkcija, 4. 10. 2026.

Repo 27 funkcija, deployano 19. Po postojanju: 8 samo u repou (`client-error`, `field-render`,
`integrity-check`, `preflight-result`, `preflight-start`, `process-bonus-outbox`,
`repair-local-claim`, `repair-local-status`).

Po sadrzaju, 19 deployanih (binarni ESZIP, dva prolaza bajt-ista): **5 JEDNAKO, 14 DRIFT, 0 NE ZNAM**.

- JEDNAKO: `admin-stats`, `health`, `katedra-agent-worker`, `send-reminders`,
  `withdraw-corpus-contribution`.
- DRIFT: `analytics-event`, `cleanup-orphan-repairs`, `create-checkout`, `delete-repair-job`,
  `faculty-request`, `file-guarantee-claim`, `generate-report`, `profile-rules`,
  `record-completion-check`, `redeem-referral-signup`, `repair-docx`, `source-check`,
  `unsubscribe-reminder`, `webhook-mor`.

Prva verzija alata (pretraga JSON-a u bodyju, prije pregleda) brojala je `profile-rules` kao JEDNAKO: JSON
moduli nemaju source mapu pa su bili preskoceni. Kod funkcije je jednak repou, ali deployani
`data/generated/profile-rules-server.json` se razlikuje od repoa. Strogi parser ga usporedjuje po
doslovnom izvoru i prijavljuje DRIFT.

Poznati drift zabiljezen prije ovog alata: `faculty-request` (deploy 9. 7. 2026.) salje
`Access-Control-Allow-Origin: *`, a repo bira origin iz `ALLOWED_ORIGIN`. Novi alat ga prijavljuje
kao `DRIFT` (`supabase/functions/faculty-request/index.ts` razlicit).

Puna tablica s datotekama koje se razlikuju je u `docs/generated/DEPLOY_DRIFT.md`.

Usklajivanje (deploy Edge funkcija) NIJE dio ovog zadatka: to je zaseban vlasnicki korak (T20), jer
deploy mijenja ponasanje produkcije (npr. `repair-docx`, `create-checkout`, `webhook-mor`) i trazi
vlastiti dokaz.
