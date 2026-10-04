# Edge funkcije: drift po sadrzaju (T101)

`npm run deploy-drift` je do 4. 10. 2026. usporedjivao samo POSTOJANJE funkcija (repo nasuprot
deployanom popisu) i `verify_jwt`. Deployana funkcija sa starim kodom prolazila je kao uredna:
`faculty-request` je na produkciji vracao `Access-Control-Allow-Origin: *`, dok repo odabire origin s
popisa, a izvjestaj ga je vodio kao "deployano".

## Metoda

- `GET /v1/projects/{ref}/functions/{slug}/body` vraca deployani bundle (ESZIP). Svaki lokalni modul
  u njemu nosi source mapu s IZVORNIM TS-om (`sources`, `sourcesContent`).
- `extractSourceMaps` (`scripts/deploy-drift-core.mjs`) izrezuje te mape; `deployedLocalSources`
  mapira njihove putanje na putanje u repou. Supabase CLI je mijenjao korijen bundlea, pa se korijen
  izvodi iz ulaza funkcije (izmjereno 4. 10. 2026.): `index.ts`, `<slug>/index.ts`,
  `functions/<slug>/index.ts` i `supabase/functions/<slug>/index.ts` (uz `src/...`). Udaljeni moduli
  (`https://`, `npm:`) se preskacu.
- `contentDrift` usporedjuje svaki deployani lokalni modul s repoom bajt po bajt (CR normaliziran):
  - `JEDNAKO`: ulaz `index.ts` je medju deployanim modulima i svi su jednaki repou;
  - `DRIFT`: ijedan modul se razlikuje ili ga u repou nema;
  - `NE ZNAM`: bundle nije dostupan ili nema citljive source mape ulaza. To NIJE prolaz.
- Skripta samo cita; nista ne deploya.

Pokretanje (token i ref iz okoline, kao i prije):

```bash
SUPABASE_ACCESS_TOKEN=... LEKTA_PROD_REF=... npm run deploy-drift
```

## Mjera prije popravka, produkcija, 4. 10. 2026.

Repo 27 funkcija, deployano 19. Po postojanju: 8 samo u repou (`client-error`, `field-render`,
`integrity-check`, `preflight-result`, `preflight-start`, `process-bonus-outbox`,
`repair-local-claim`, `repair-local-status`).

Po sadrzaju, 19 deployanih: **6 JEDNAKO, 13 DRIFT, 0 NE ZNAM**.

- JEDNAKO: `admin-stats`, `health`, `katedra-agent-worker`, `profile-rules`, `send-reminders`,
  `withdraw-corpus-contribution`.
- DRIFT: `analytics-event`, `cleanup-orphan-repairs`, `create-checkout`, `delete-repair-job`,
  `faculty-request`, `file-guarantee-claim`, `generate-report`, `record-completion-check`,
  `redeem-referral-signup`, `repair-docx`, `source-check`, `unsubscribe-reminder`, `webhook-mor`.

Poznati drift zabiljezen prije ovog alata: `faculty-request` (deploy 9. 7. 2026.) salje
`Access-Control-Allow-Origin: *`, a repo bira origin iz `ALLOWED_ORIGIN`. Novi alat ga prijavljuje
kao `DRIFT` (`supabase/functions/faculty-request/index.ts` razlicit).

Puna tablica s datotekama koje se razlikuju je u `docs/generated/DEPLOY_DRIFT.md`.

Usklajivanje (deploy Edge funkcija) NIJE dio ovog zadatka: to je zaseban vlasnicki korak (T20), jer
deploy mijenja ponasanje produkcije (npr. `repair-docx`, `create-checkout`, `webhook-mor`) i trazi
vlastiti dokaz.
