# Operativni runbook (GDPR brisanje, PITR/oporavak, retencija)

Postupci koje pokrece vlasnik nad produkcijskom Supabase bazom. Ciste odluke su u kodu i
testovima; ovdje su ljudski koraci nad zivom bazom. Preduvjet: `supabase link` na produkcijski
projekt i pristup Dashboardu.

## 1. Zahtjev za brisanjem podataka (GDPR, P1 2.5)

Korisnik zahtjev salje na kontakt e-mail iz Obavijesti o privatnosti. Identitet korisnika je
`auth.users.id` (dobiva se po e-mailu). Sve korisnicke tablice imaju
`user_id ... references auth.users(id) on delete cascade`, pa brisanje korisnika uklanja i
sve vezane retke.

Koraci (service role, SQL editor):

```sql
-- 1. nadji korisnika po e-mailu
select id, email from auth.users where email = 'korisnik@primjer.hr';

-- 2. (opcionalno) provjeri opseg prije brisanja
select 'entitlements' t, count(*) from entitlements where user_id = '<UID>'
union all select 'document_slots', count(*) from document_slots where user_id = '<UID>'
union all select 'report_generations', count(*) from report_generations where user_id = '<UID>'
union all select 'checkout_consents', count(*) from checkout_consents where user_id = '<UID>';

-- 3. brisanje korisnika -> cascade uklanja entitlements, document_slots, report_generations,
--    checkout_consents, coupon_grants, referrals, guarantee_claims, rulebook_submissions
select auth.uid(); -- samo provjera konteksta
-- brisanje ide preko Auth admin API-ja ili:
delete from auth.users where id = '<UID>';
```

Napomena o racunovodstvu: podaci nuzni za zakonsku evidenciju naplate (racuni kod Merchant of
Record providera) NISU u ovoj bazi; oni se cuvaju kod MoR-a prema poreznim rokovima i ne brisu
se na zahtjev dok traje zakonska obveza. To navesti korisniku u odgovoru.

Rok: obraditi u razumnom roku (preporuka do 30 dana). Zabiljeziti datum zahtjeva i izvrsenja.

## 2. Point-in-time recovery i oporavak kupnji (P0 8-2)

Ukljucivanje (jednokratno): Supabase Dashboard -> Database -> Backups -> ukljuci Point-in-Time
Recovery (placeni plan). Potvrditi da je projekt u EU regiji (isto mjesto gdje i podaci).

Scenarij oporavka (npr. slucajno masovno brisanje entitlementa):

1. Dashboard -> Database -> Backups -> Restore -> odaberi tocku U VRIJEME PRIJE incidenta.
2. Restore ide u NOVI projekt (ili prema uputama providera); ne prepisuj slijepo produkciju.
3. Iz obnovljene kopije izvezi pogodene tablice (`entitlements`, `document_slots`,
   `checkout_consents`) i vrati nedostajuce retke u produkciju (idempotentno: `entitlements`
   ima `unique (provider, order_id)` pa reinsert po webhooku ne duplicira).
4. Krizni fallback bez PITR-a: svaka kupnja ima trag kod MoR-a (Lemon Squeezy dashboard).
   Entitlement se moze rekonstruirati iz webhook eventa (ponovna dostava webhooka) jer je
   idempotentan po `(provider, order_id)`.

## 3. Retencija logova (P1 2.6)

Migracija `0009_log_retention.sql` dodaje `purge_old_report_generations(retention_days)` i, ako
je pg_cron ukljucen, dnevni job u 03:00 UTC (90 dana). `report_generations.ip_hash` je vec
hashiran, ne sirovi IP.

- Ukljuci pg_cron: Dashboard -> Database -> Extensions -> pg_cron.
- Rucno pokretanje po potrebi: `select purge_old_report_generations(90);`
- Provjera zakazanog joba: `select * from cron.job where jobname = 'purge-report-generations';`

## 4. Uptime monitor (P1 8-3)

Klijentska analiza (upload -> analiza -> rezultat) je cisto u pregledniku i nema serverski put.
Serverski putovi su Edge Functioni. Za pracenje dostupnosti:

1. Deploy health rute: `supabase functions deploy health`. Odgovara 200 + `{status:"ok",...}`.
2. Postavi vanjski uptime monitor (npr. UptimeRobot, BetterStack, Cronitor) na:
   - `GET …/functions/v1/health` -> ocekuj HTTP 200 (glavni signal zivosti).
   - (opcionalno, dublje) `POST …/functions/v1/create-checkout` bez Authorization -> ocekuj 401
     (potvrda da checkout put odgovara i odbija neautorizirane).
3. Alert na e-mail/SMS/Slack kad glavni put padne. U spici (sezona predaje) drzi pripremljen
   kratki status-tekst za korisnike (npr. objava na naslovnoj: "privremeni zastoj punog izvjestaja,
   besplatna analiza radi normalno").

Napomena: besplatna analiza radi i kad su Edge Functioni nedostupni; tada je nedostupna samo
kupnja/puni izvjestaj. To razdvojiti u komunikaciji statusa.

## 5. Prije objave (smoke, vidi i docs/GO_LIVE_NAPLATA.md)

- Falsificiran webhook bez potpisa -> ocekivano 401, bez novog entitlementa.
- Korisnik A ne moze citati retke korisnika B (RLS): upit kao A nad B redom vraca prazno.
- Predimenzioniran payload na generate-report/create-checkout -> 413, funkcija ne pada.
- Kupnja bez pristanka (create-checkout bez consent polja) -> 400 consent_required.
