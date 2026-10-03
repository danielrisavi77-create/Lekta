# Lekta Agent Control Plane

Ovaj direktorij sadrzi backend za globalni write lease iz
`docs/agents/GLOBAL_LEASE_V2.md`.

**Ovo nije dio Lektine produkcijske Supabase instance.** Datoteke su namjerno pod
`ops/agent-control-plane/`, a ne pod `supabase/migrations/` ili `supabase/functions/`.

## Sadrzaj

- `schema.sql` - privatna `agent_control` schema, session/lease/event tablice i atomarni SQL dispatch
- `function/index.ts` - autentificirana Edge Function granica
- `function/protocol.ts` - protocolVersion 1, scope hash i HTTP mapiranje
- `function/deno.json` - pinani Edge dependency
- `smoke.mjs` - stvarni konkurencijski smoke nakon deploya

## Sigurnosne granice

Control-plane projekt ne smije sadrzavati studentske dokumente, naplatu ni produkcijske Lektine
podatke. `agent_control` schema nije izlozena Data API-ju. SQL eksplicitno uklanja pristup
`public`, `anon`, `authenticated` i `service_role` ulogama; Edge Function se spaja izravno na
Postgres preko server-side `SUPABASE_DB_URL`.

Edge Function se deploya s `verify_jwt=false` **iskljucivo zato sto implementira vlastitu
server-to-server autentikaciju** preko `x-lekta-control-token`.

Admin control token je zaseban nasumicni secret koji postoji u plaintextu samo na Fable
orkestratoru. U bazi se cuva iskljucivo njegov SHA-256 hash pod
`agent_control.control_settings.admin_token_sha256`. Edge Function hasha primljeni header i
radi timing-safe usporedbu s tim hashom. Ne koristi Supabase secret/service-role kljuc kao
control-plane credential.

Svaki write lease dodatno ima zaseban capability hash. Fable generira
`LEKTA_GLOBAL_LEASE_TOKEN`, u claim payload salje samo njegov SHA-256, a plaintext capability
predaje samo tom workeru. Worker s njim moze pozvati samo `validate`; admin lifecycle operacije i
dalje zahtijevaju Fableov control token.

## Atomski claim

Sve write mutacije koriste jedan transakcijski advisory lock
`pg_advisory_xact_lock(1279341101)`. Za dev tim od osam workera to je namjerna jednostavna
serijalizacija kriticne sekcije, ne dugotrajni globalni mutex: lock traje samo jednu SQL transakciju.

Claim zatim provjerava tri neovisna uvjeta:

1. ista sesija ne smije imati drugi aktivni task;
2. isti task ne smije imati drugi aktivni lease;
3. novi write pattern ne smije se preklapati ni s jednim drugim aktivnim write patternom.

Tek nakon svih provjera nastaje lease. TTL-istek se lazily materializira pri sljedecoj mutaciji;
snapshot ionako filtrira `expires_at > now()`.

## Idempotencija

Identicni ponovljeni `claim` za isti session/task/base/scope vraca isti lease ID. To rjesava
najopasniji unknown-outcome slucaj: server je mozda upisao lease, ali je odgovor izgubljen.

`release` je idempotentan. Identicni `expand` je idempotentan kada je trazeni scope vec aktivan.
`renew` je **safe-to-retry**, ali ponovljeni poziv ponovno postavlja istek na `now + TTL`; zbog
toga retry moze produziti lease za nekoliko sekundi/minuta, ali nikad iznad konfiguriranog TTL-a od
3600 s. Buduci protocol version moze dodati operation idempotency key ako mjerenje pokaze potrebu.

## Deploy redoslijed

Backend se ne deploya dok izolirani Supabase target nije eksplicitno odabran i svaki njegov
trosak potvrden. Preferira se zaseban projekt. Ako plan ogranicava broj aktivnih projekata,
dopusten je zaseban development branch bez produkcijskih podataka, uz zasebnu potvrdu hourly
troska. Produkcijski `Lekta` projekt i `Lekta staging` ne koriste se kao control-plane baza.

1. Stvori/odaberi izolirani projekt ili development branch u europskoj regiji.
2. Primijeni `schema.sql` samo na taj izolirani target.
3. Generiraj najmanje 32 bajta nasumicnog control tokena lokalno na orkestratoru, izracunaj
   SHA-256 i upisi samo hash:
   `insert into agent_control.control_settings(setting_key, setting_value) values ('admin_token_sha256', '<sha256>') on conflict (setting_key) do update set setting_value = excluded.setting_value, updated_at = clock_timestamp();`
4. Pokreni Supabase security i performance advisore.
5. Deployaj Edge Function `lekta-control-plane` iz `function/` s `verify_jwt=false`.
6. Na orkestratoru postavi:
   - `LEKTA_CONTROL_PLANE_URL=https://<ref>.supabase.co/functions/v1/lekta-control-plane`
   - `LEKTA_CONTROL_PLANE_ADMIN_TOKEN=<secret>`
7. Pokreni `npm run agents:lease -- health`.
8. Pokreni `npm run agents:lease-smoke`; smoke ukljucuje stvarno paralelna dva preklapajuca claima.
9. Tek nakon zelenog smokea Phase 2C smije vezati hook/runner uz udaljeni lease.

## Smoke rezervacije

`smoke.mjs` koristi rezervirane sintetske task ID-eve `T9000` i `T9001` i putanju
`.agent-control-plane-smoke/**`. Ti ID-evi ne smiju postati stvarni `tasks.json` taskovi.

Smoke dokazuje:

- registraciju dviju sesija
- idempotentni isti claim s istim capabilityjem
- uspjesan worker `validate` s ispravnim capabilityjem
- `lease_validation_mismatch` s pogresnim worker capabilityjem
- `task_busy`
- `session_busy`
- write/write `lease_conflict`
- prolaz nakon releasea
- odsutnost aktivnih smoke leaseova na kraju

## Nije dokazano dok se 2B ne deploya

Repo testovi mogu dokazati ugovor, strukturu SQL-a, capability izolaciju i client/backend hash
kompatibilnost. Ne mogu dokazati Postgres concurrency, Edge networking ni stvarni Supabase
runtime. Zato udaljeni enforcement nije aktivan dok `schema.sql` nije primijenjen na izolirani
target, Edge Function deployana, advisori pregledani i `agents:lease-smoke` zelen protiv stvarnog
endpointa.
