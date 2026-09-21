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

<details><summary>Deployane verzije</summary>

| Funkcija | Verzija | Status | verify_jwt |
| --- | --- | --- | --- |
| `admin-stats` | 7 | ACTIVE | true |
| `analytics-event` | 7 | ACTIVE | false |
| `cleanup-orphan-repairs` | 11 | ACTIVE | false |
| `create-checkout` | 12 | ACTIVE | true |
| `delete-repair-job` | 10 | ACTIVE | true |
| `faculty-request` | 11 | ACTIVE | false |
| `file-guarantee-claim` | 10 | ACTIVE | true |
| `generate-report` | 10 | ACTIVE | true |
| `health` | 12 | ACTIVE | false |
| `katedra-agent-worker` | 4 | ACTIVE | true |
| `profile-rules` | 4 | ACTIVE | false |
| `record-completion-check` | 7 | ACTIVE | false |
| `redeem-referral-signup` | 10 | ACTIVE | true |
| `repair-docx` | 31 | ACTIVE | true |
| `send-reminders` | 12 | ACTIVE | false |
| `source-check` | 5 | ACTIVE | true |
| `unsubscribe-reminder` | 11 | ACTIVE | false |
| `webhook-mor` | 11 | ACTIVE | false |
| `withdraw-corpus-contribution` | 4 | ACTIVE | true |

</details>

## staging (`bnyemcnsphlitjradrst`)

Repo: 27 funkcija. Deployano: 28.

| Funkcija | Stanje |
| --- | --- |
| `cleanup-agent-payloads` | SAMO U OKOLINI `staging` (nema je u repou) |

### Raskorak `verify_jwt` (config.toml nasuprot okolini)

| Funkcija | config.toml | okolina | Rizik |
| --- | --- | --- | --- |
| `cleanup-agent-payloads` | (nema bloka) | false | nema bloka: CLI default je `true`, pa bi deploy zatvorio endpoint |

<details><summary>Deployane verzije</summary>

| Funkcija | Verzija | Status | verify_jwt |
| --- | --- | --- | --- |
| `admin-stats` | 2 | ACTIVE | true |
| `analytics-event` | 2 | ACTIVE | false |
| `cleanup-agent-payloads` | 3 | ACTIVE | false |
| `cleanup-orphan-repairs` | 2 | ACTIVE | false |
| `client-error` | 3 | ACTIVE | false |
| `create-checkout` | 2 | ACTIVE | true |
| `delete-repair-job` | 6 | ACTIVE | true |
| `faculty-request` | 2 | ACTIVE | false |
| `field-render` | 2 | ACTIVE | true |
| `file-guarantee-claim` | 2 | ACTIVE | true |
| `generate-report` | 2 | ACTIVE | true |
| `health` | 2 | ACTIVE | false |
| `integrity-check` | 2 | ACTIVE | true |
| `katedra-agent-worker` | 3 | ACTIVE | true |
| `preflight-result` | 2 | ACTIVE | true |
| `preflight-start` | 2 | ACTIVE | true |
| `process-bonus-outbox` | 2 | ACTIVE | false |
| `profile-rules` | 4 | ACTIVE | false |
| `record-completion-check` | 2 | ACTIVE | false |
| `redeem-referral-signup` | 2 | ACTIVE | true |
| `repair-docx` | 7 | ACTIVE | true |
| `repair-local-claim` | 2 | ACTIVE | false |
| `repair-local-status` | 2 | ACTIVE | false |
| `send-reminders` | 2 | ACTIVE | false |
| `source-check` | 6 | ACTIVE | true |
| `unsubscribe-reminder` | 2 | ACTIVE | false |
| `webhook-mor` | 2 | ACTIVE | false |
| `withdraw-corpus-contribution` | 2 | ACTIVE | true |

</details>
