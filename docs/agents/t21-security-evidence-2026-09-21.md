# T21 sigurnosni dokaz, 2026-09-21

## Opseg

- Worktree: `agent/t20-edge-config`, bez izmjena u dijeljenom stablu.
- Staging: `bnyemcnsphlitjradrst`.
- Produkcija: samo read-only advisor i migration-list upiti. Nije mijenjana.
- Svi upiti prema bazi bili su read-only ili u transakciji s `rollback`.

## Staging advisor

`supabase db advisors --linked --type security --level info --fail-on none` vratio je:

- 23 INFO `rls_enabled_no_policy`.
- 25 WARN `authenticated_security_definer_function_executable`.
- 1 WARN `auth_leaked_password_protection`.

INFO nalazi su namjerno zatvorene servisne tablice. Za 22 tablice ACL daje pristup samo
`postgres` i/ili `service_role`, uz uključen RLS i nula politika. `client_errors` je poseban
service sink: nema politika, REST GET za anon vraća `200 []`, a direktni POST vraća `401` zbog
RLS-a. Nije dodana politika samo radi utišavanja advisora.

Svi WARN `SECURITY DEFINER` RPC-ji imaju uklonjen `PUBLIC`/`anon` execute. Trinaest funkcija iz
Lektinih lokalnih migracija pregledano je nad izvornim SQL-om, a dvanaest funkcija koje postoje
na stagingu pregledano je preko `pg_get_functiondef`. Funkcije imaju pinan `search_path` i
provjeru `auth.uid()` ili pomoćni ownership guard prije izmjene. `can_read_agent_payload` za
strani korisnički path vraća `false`.

Staging migration list pokazuje remote-only raspon `0104` do `0114`, koji nije u ovom repozitoriju
jer dijeljeni staging sadrži Katedra migracije. Funkcije iz tog raspona nisu mijenjane. Prije
bilo kakvog zahvata potreban je vlasnik Katedra migracija i zaseban migration identity plan.

## Negativne probe

- Anon REST SELECT nad `entitlements`, `document_slots`, `agent_runs`, `agent_payload_manifests`
  i `admin_users`: svih pet vraća `401`.
- Anon RPC pozivi `unsubscribe_own_deadline_subscription`, `activate_agent_run`,
  `approve_agent_run_context_plan` i `request_user_agent_payload_deletion`: svih četvero vraća
  `401 permission denied`.
- Authenticated simulacija s `auth.uid() = A` i parametrima korisnika B: sedam funkcija vraća
  `SQLSTATE 42501`, uključujući brisanje payloadova, consent withdrawal, privacy listu i plan
  odobrenja. Nije nastao redak jer je svaki poziv odbijen prije izmjene.
- `can_read_agent_payload` za strani path vraća `false`.
- Edge probe bez tokena: `health` `200`, `repair-docx` `401`, `delete-repair-job` `401`,
  `client-error` GET `405`. `health` POST vraća `405`.
- CORS preflight za `profile-rules`: `https://lekta-staging.netlify.app` dobiva točan
  `Access-Control-Allow-Origin`; produkcijski origin i localhost ne dobivaju taj header.
- `extraction-probe.mjs`: 27 zahtjeva, rate limit na 7 distinct profila, bez evidence markera.

## Auth konfiguracija

Staging Auth GET potvrđuje `password_hibp_enabled=false`. Pokušaj uključivanja samo na stagingu
preko službenog Management API-ja odbijen je porukom da je zaštita dostupna na Pro planu i višem.
Nije promijenjena nijedna druga Auth postavka. Ovo ostaje vlasnički blokator plana, ne tihi
izostanak popravka.

## Produkcijski read-only presjek

Production advisor vratio je 22 INFO, 13 `SECURITY DEFINER` WARN-ova, 52 WARN-a za anonimne
politike, upozorenje za `pg_net` u `public` i isti HIBP WARN. Postojeće pravilo za anonimne
politike je provjereno u `docs/AUDIT_MASTER.md`: većina politika je vezana na `auth.uid()`, a
preostale javne politike služe katalogu ili dijeljenoj tablici. Produkcija nije dirana.

## Zaključak T21

Nije potvrđen cross-user read/write/delete, anon execute nad zaštićenim RPC-jem, CORS proboj ni
neograničena enumeracija staging profila. Potvrđen je jedan konfiguracijski rizik, leaked-password
zaštita, ali ga trenutni Supabase plan ne dopušta uključiti. Preostali korak za zatvaranje T21 je
odluka vlasnika o Pro planu ili prihvaćanju ovog ograničenja, te odvojena verifikacija Katedra
migracija `0104` do `0114`.
