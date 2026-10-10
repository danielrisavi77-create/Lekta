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

Deployani bundle (`GET /functions/{slug}/body`) cita se kao binarni ESZIP; izvorni TS svakog
lokalnog modula dolazi iz njegove source mape i usporedjuje se s repoom bajt po bajt (CR
normaliziran). NE ZNAM znaci da se deploy nije mogao procitati ili vezati uz verziju; to nije prolaz.

| Funkcija | Verzija | Azurirano | Sadrzaj | Razlog |
| --- | --- | --- | --- | --- |
| `admin-stats` | 11 | 2026-09-30T22:15:33.082Z | JEDNAKO |  |
| `analytics-event` | 10 | 2026-08-18T11:09:02.929Z | DRIFT |  |
| `cleanup-orphan-repairs` | 14 | 2026-07-20T11:36:17.361Z | DRIFT |  |
| `create-checkout` | 15 | 2026-08-18T11:08:33.806Z | DRIFT |  |
| `delete-repair-job` | 13 | 2026-07-19T20:28:52.047Z | DRIFT |  |
| `faculty-request` | 14 | 2026-07-09T09:58:28.752Z | DRIFT |  |
| `file-guarantee-claim` | 13 | 2026-07-19T09:40:50.837Z | DRIFT |  |
| `generate-report` | 13 | 2026-07-19T09:40:34.536Z | DRIFT |  |
| `health` | 15 | 2026-09-07T10:44:00.289Z | JEDNAKO |  |
| `katedra-agent-worker` | 7 | 2026-08-18T11:09:31.762Z | JEDNAKO |  |
| `profile-rules` | 8 | 2026-09-30T22:16:20.283Z | DRIFT |  |
| `record-completion-check` | 10 | 2026-08-03T22:31:23.957Z | DRIFT |  |
| `redeem-referral-signup` | 13 | 2026-07-19T09:41:16.201Z | DRIFT |  |
| `repair-docx` | 34 | 2026-09-05T20:06:54.431Z | DRIFT |  |
| `send-reminders` | 15 | 2026-08-18T11:08:40.814Z | JEDNAKO |  |
| `source-check` | 8 | 2026-08-19T23:04:45.372Z | DRIFT |  |
| `unsubscribe-reminder` | 14 | 2026-08-18T11:08:48.318Z | DRIFT |  |
| `webhook-mor` | 14 | 2026-08-18T11:08:26.710Z | DRIFT |  |
| `withdraw-corpus-contribution` | 7 | 2026-09-05T20:06:36.392Z | JEDNAKO |  |

#### Usporedjeni moduli

- `admin-stats`: `src/admin/admin-dispatch.ts` jednako; `src/admin/admin-range.ts` jednako; `supabase/functions/_shared/cors.ts` jednako; `supabase/functions/admin-stats/index.ts` jednako
- `analytics-event`: `supabase/functions/_shared/cors.ts` jednako; `supabase/functions/_shared/hash-ip.ts` jednako; `supabase/functions/analytics-event/index.ts` razlicit
- `cleanup-orphan-repairs`: `supabase/functions/_shared/cron-auth.ts` razlicit; `supabase/functions/cleanup-orphan-repairs/index.ts` razlicit
- `create-checkout`: `data/work-type-scope.json` jednako; `src/catalog/products-catalog.ts` razlicit; `src/legal/consent-text.ts` razlicit; `src/report/checkout.ts` razlicit; `src/report/pricing.ts` razlicit; `src/report/work-type-estimate.ts` jednako; `supabase/functions/_shared/cors.ts` jednako; `supabase/functions/create-checkout/index.ts` razlicit
- `delete-repair-job`: `supabase/functions/delete-repair-job/index.ts` razlicit
- `faculty-request`: `supabase/functions/faculty-request/index.ts` razlicit
- `file-guarantee-claim`: `src/report/guarantee.ts` razlicit; `supabase/functions/_shared/cors.ts` razlicit; `supabase/functions/file-guarantee-claim/index.ts` razlicit
- `generate-report`: `src/fingerprint/fingerprint.ts` jednako; `src/report/guarantee.ts` razlicit; `src/report/partner.ts` jednako; `src/report/pricing.ts` razlicit; `src/report/report.ts` razlicit; `src/report/slot-logic.ts` razlicit; `src/scoring/checks.ts` razlicit; `src/utils/helpers.ts` razlicit; `supabase/functions/_shared/cors.ts` razlicit; `supabase/functions/_shared/grant-friend-referral-reward.ts` razlicit; `supabase/functions/_shared/hash-ip.ts` jednako; `supabase/functions/generate-report/index.ts` razlicit
- `health`: `supabase/functions/health/index.ts` jednako
- `katedra-agent-worker`: `supabase/functions/_shared/cron-auth.ts` jednako; `supabase/functions/katedra-agent-worker/dispatcher.ts` jednako; `supabase/functions/katedra-agent-worker/index.ts` jednako
- `profile-rules`: `data/generated/profile-rules-server.json` razlicit; `supabase/functions/_shared/cors.ts` jednako; `supabase/functions/_shared/hash-ip.ts` jednako; `supabase/functions/profile-rules/index.ts` jednako
- `record-completion-check`: `supabase/functions/record-completion-check/_shared/cors.ts` nema u repou; `supabase/functions/record-completion-check/index.ts` razlicit
- `redeem-referral-signup`: `supabase/functions/_shared/cors.ts` razlicit; `supabase/functions/_shared/hash-ip.ts` jednako; `supabase/functions/redeem-referral-signup/index.ts` jednako
- `repair-docx`: `data/generated/repair-params-by-profile.json` jednako; `data/work-type-scope.json` jednako; `src/analysis/bibliography-structure.ts` razlicit; `src/analysis/citation-bibliography-sync.ts` jednako; `src/analysis/cross-file-submission-consistency.ts` jednako; `src/analysis/element-structure.ts` jednako; `src/analysis/field-integrity.ts` razlicit; `src/analysis/final-document-inspector.ts` jednako; `src/analysis/legal-footnote-structure.ts` jednako; `src/analysis/required-sections-structure.ts` jednako; `src/analysis/section-structure.ts` jednako; `src/analysis/typography-structure.ts` jednako; `src/citations/author-year.ts` razlicit; `src/citations/corpus-verify.ts` jednako; `src/citations/legal-citation.ts` jednako; `src/citations/parse-reference.ts` jednako; `src/citations/verify-existence.ts` jednako; `src/corpus/contribution.ts` jednako; `src/corpus/pseudonymize.ts` jednako; `src/docx/parser.ts` razlicit; `src/fingerprint/extract-from-docx.ts` razlicit; `src/fingerprint/fingerprint.ts` jednako; `src/legal/corpus-consent.ts` jednako; `src/legal/terms-version.ts` razlicit; `src/repair/anchor-text.ts` jednako; `src/repair/apply-fixers.ts` razlicit; `src/repair/bibliography-repair-fixer.ts` jednako; `src/repair/citation-bibliography-sync-fixer.ts` jednako; `src/repair/consistency-fixer.ts` jednako; `src/repair/croatian-typography-fixer.ts` jednako; `src/repair/docx-budget.ts` jednako; `src/repair/element-caption-fixer.ts` jednako; `src/repair/field-integrity-fixer.ts` razlicit; `src/repair/final-document-inspector-fixer.ts` jednako; `src/repair/fixers.ts` razlicit; `src/repair/heading-case.ts` jednako; `src/repair/legal-footnote-repair-fixer.ts` jednako; `src/repair/link-doi-fixer.ts` razlicit; `src/repair/package-integrity.ts` razlicit; `src/repair/paragraph-cleanup.ts` razlicit; `src/repair/param-authority.ts` jednako; `src/repair/required-section-fixer.ts` jednako; `src/repair/run-level.ts` jednako; `src/repair/section-surgery-fixer.ts` jednako; `src/repair/submission-metadata-fixer.ts` jednako; `src/repair/table-figure-rescue-fixer.ts` razlicit; `src/repair/xml-patch.ts` jednako; `src/repair/zip-codec.ts` jednako; `src/report/guarantee.ts` jednako; `src/report/partner.ts` jednako; `src/report/pricing.ts` razlicit; `src/report/repair-framing.ts` jednako; `src/report/repair-limits.ts` jednako; `src/report/slot-logic.ts` razlicit; `src/report/work-type-estimate.ts` jednako; `src/scoring/check-id-registry.ts` razlicit; `src/scoring/checks.ts` jednako; `src/utils/helpers.ts` jednako; `supabase/functions/_shared/corpus-check.ts` jednako; `supabase/functions/_shared/cors.ts` jednako; `supabase/functions/_shared/hash-ip.ts` jednako; `supabase/functions/repair-docx/index.ts` razlicit
- `send-reminders`: `supabase/functions/_shared/cron-auth.ts` jednako; `supabase/functions/_shared/reminder-token.ts` jednako; `supabase/functions/_shared/slot-reminder.ts` jednako; `supabase/functions/send-reminders/index.ts` jednako
- `source-check`: `src/citations/corpus-verify.ts` jednako; `src/citations/verify-existence.ts` jednako; `src/utils/helpers.ts` jednako; `supabase/functions/_shared/corpus-check.ts` jednako; `supabase/functions/_shared/cors.ts` jednako; `supabase/functions/_shared/hash-ip.ts` jednako; `supabase/functions/source-check/index.ts` razlicit
- `unsubscribe-reminder`: `supabase/functions/_shared/cron-auth.ts` jednako; `supabase/functions/_shared/reminder-token.ts` jednako; `supabase/functions/unsubscribe-reminder/index.ts` razlicit
- `webhook-mor`: `src/catalog/products-catalog.ts` razlicit; `src/report/referral.ts` jednako; `src/report/webhook.ts` razlicit; `supabase/functions/_shared/grant-referrer-reward.ts` razlicit; `supabase/functions/webhook-mor/index.ts` razlicit
- `withdraw-corpus-contribution`: `supabase/functions/_shared/cors.ts` jednako; `supabase/functions/withdraw-corpus-contribution/index.ts` jednako

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
