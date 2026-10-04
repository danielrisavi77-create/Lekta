# Deploy drift: repozitorij nasuprot deployanom stanju

> GENERIRANO (`npm run deploy-drift`). Ne uredjuj rucno.

Popis funkcija u `supabase/functions/**` usporedjen s onime sto Supabase stvarno vrti.
Prazna tablica drifta je jedino prihvatljivo stanje prije deploya.

## produkcija (`zrrjttizjyfcxmcpgzml`)

Repo: 27 funkcija. Deployano: 19.

| Funkcija | Stanje |
| --- | --- |
| `client-error` | SAMO U REPOU (nije deployana) |
| `field-render` | SAMO U REPOU (nije deployana) |
| `integrity-check` | SAMO U REPOU (nije deployana) |
| `preflight-result` | SAMO U REPOU (nije deployana) |
| `preflight-start` | SAMO U REPOU (nije deployana) |
| `process-bonus-outbox` | SAMO U REPOU (nije deployana) |
| `repair-local-claim` | SAMO U REPOU (nije deployana) |
| `repair-local-status` | SAMO U REPOU (nije deployana) |

### Sadrzaj deployanih funkcija nasuprot repou (T101)

Izvor se cita iz source mapa deployanog bundlea (`GET /functions/{slug}/body`) i usporedjuje s
repoom bajt po bajt (CR normaliziran). NE ZNAM znaci da bundle nije dostupan ili nema citljivih
source mapa; to nije prolaz.

| Funkcija | Sadrzaj | Razlike |
| --- | --- | --- |
| `admin-stats` | JEDNAKO |  |
| `analytics-event` | DRIFT | `supabase/functions/analytics-event/index.ts` razlicit |
| `cleanup-orphan-repairs` | DRIFT | `supabase/functions/_shared/cron-auth.ts` razlicit; `supabase/functions/cleanup-orphan-repairs/index.ts` razlicit |
| `create-checkout` | DRIFT | `src/catalog/products-catalog.ts` razlicit; `src/legal/consent-text.ts` razlicit; `src/report/checkout.ts` razlicit; `src/report/pricing.ts` razlicit; `supabase/functions/create-checkout/index.ts` razlicit |
| `delete-repair-job` | DRIFT | `supabase/functions/delete-repair-job/index.ts` razlicit |
| `faculty-request` | DRIFT | `supabase/functions/faculty-request/index.ts` razlicit |
| `file-guarantee-claim` | DRIFT | `src/report/guarantee.ts` razlicit; `supabase/functions/_shared/cors.ts` razlicit; `supabase/functions/file-guarantee-claim/index.ts` razlicit |
| `generate-report` | DRIFT | `src/report/guarantee.ts` razlicit; `src/report/pricing.ts` razlicit; `src/report/report.ts` razlicit; `src/report/slot-logic.ts` razlicit; `src/scoring/checks.ts` razlicit; `src/utils/helpers.ts` razlicit; `supabase/functions/_shared/cors.ts` razlicit; `supabase/functions/generate-report/index.ts` razlicit |
| `health` | JEDNAKO |  |
| `katedra-agent-worker` | JEDNAKO |  |
| `profile-rules` | JEDNAKO |  |
| `record-completion-check` | DRIFT | `supabase/functions/record-completion-check/index.ts` razlicit; `supabase/functions/record-completion-check/_shared/cors.ts` nema u repou |
| `redeem-referral-signup` | DRIFT | `supabase/functions/_shared/cors.ts` razlicit |
| `repair-docx` | DRIFT | `src/analysis/field-integrity.ts` razlicit; `src/citations/author-year.ts` razlicit; `src/docx/parser.ts` razlicit; `src/fingerprint/extract-from-docx.ts` razlicit; `src/legal/terms-version.ts` razlicit; `src/repair/apply-fixers.ts` razlicit; `src/repair/field-integrity-fixer.ts` razlicit; `src/repair/fixers.ts` razlicit; `src/repair/link-doi-fixer.ts` razlicit; `src/repair/package-integrity.ts` razlicit; `src/repair/paragraph-cleanup.ts` razlicit; `src/repair/table-figure-rescue-fixer.ts` razlicit; `src/report/pricing.ts` razlicit; `src/report/slot-logic.ts` razlicit; `src/scoring/check-id-registry.ts` razlicit; `supabase/functions/repair-docx/index.ts` razlicit |
| `send-reminders` | JEDNAKO |  |
| `source-check` | DRIFT | `supabase/functions/source-check/index.ts` razlicit |
| `unsubscribe-reminder` | DRIFT | `supabase/functions/unsubscribe-reminder/index.ts` razlicit |
| `webhook-mor` | DRIFT | `src/catalog/products-catalog.ts` razlicit; `src/report/webhook.ts` razlicit; `supabase/functions/_shared/grant-referrer-reward.ts` razlicit; `supabase/functions/webhook-mor/index.ts` razlicit |
| `withdraw-corpus-contribution` | JEDNAKO |  |

<details><summary>Deployane verzije</summary>

| Funkcija | Verzija | Status | verify_jwt |
| --- | --- | --- | --- |
| `admin-stats` | 11 | ACTIVE | true |
| `analytics-event` | 10 | ACTIVE | false |
| `cleanup-orphan-repairs` | 14 | ACTIVE | false |
| `create-checkout` | 15 | ACTIVE | true |
| `delete-repair-job` | 13 | ACTIVE | true |
| `faculty-request` | 14 | ACTIVE | false |
| `file-guarantee-claim` | 13 | ACTIVE | true |
| `generate-report` | 13 | ACTIVE | true |
| `health` | 15 | ACTIVE | false |
| `katedra-agent-worker` | 7 | ACTIVE | true |
| `profile-rules` | 8 | ACTIVE | false |
| `record-completion-check` | 10 | ACTIVE | false |
| `redeem-referral-signup` | 13 | ACTIVE | true |
| `repair-docx` | 34 | ACTIVE | true |
| `send-reminders` | 15 | ACTIVE | false |
| `source-check` | 8 | ACTIVE | true |
| `unsubscribe-reminder` | 14 | ACTIVE | false |
| `webhook-mor` | 14 | ACTIVE | false |
| `withdraw-corpus-contribution` | 7 | ACTIVE | true |

</details>
