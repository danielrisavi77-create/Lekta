# Lekta · Go-live: rokovi i podsjetnici

Checklist za aktivaciju opt-in podsjetnika na rok predaje (e-mail 7 i 1 dan prije roka).
Vidi i [AUTO_PROVJERA_ROKOVA.md](AUTO_PROVJERA_ROKOVA.md) (kako se rokovi provjeravaju).

## Sto je vec gotovo

- Backend na Lekta Supabase (project ref `zrrjttizjyfcxmcpgzml`): migracija 0012
  (`deadline_subscriptions` + `user_notification_preferences`), edge funkcije
  `send-reminders` i `unsubscribe-reminder` (obje `verify_jwt=false`), `pg_cron`
  dnevno u 08:00 UTC (jobid 2).
- Klijent: toggle na ekranu "Spremnost za predaju" + login ulaz (Prijava/Odjava),
  neovisan o paywall-u.
- Podaci: 17 rokova (FPZG + FSB diplomski), `confirmed:true`. Zivi buduci rokovi:
  FPZG 1.9.2026, FSB 16.7.2026 (ostali su prosli u ovom ciklusu).

Feature je INERT dok se ne odrade koraci 1 i 2 (korak 3 je vec gotov).

## 1. Domena + Resend (slanje e-maila)  [blokira slanje podsjetnika]

Resend salje samo s VERIFICIRANE domene; `lektahr.netlify.app` subdomena ne ide.

1. Nabavi domenu (npr. `lekta.hr`). U Resendu: Domains -> Add Domain -> dodaj SPF/DKIM
   DNS zapise kod registrara i pricekaj verifikaciju.
2. Resend -> API Keys -> Create.
3. Postavi Supabase Edge Function secrets (project-wide, vrijede za OBJE funkcije).
   `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` Supabase ubrizgava sam, ne diraj ih.
   Trebas pet:
   - `RESEND_API_KEY` = Resend key
   - `REMINDER_FROM_EMAIL` = `Lekta <podsjetnici@tvoja-domena>`
   - `REMINDER_UNSUB_SECRET` = tajna (generiraj: `openssl rand -hex 32`). VAZNO: jednom
     postavljena se NE mijenja, inace svi vec poslani "odjava" linkovi prestaju vrijediti.
   - `REMINDER_CRON_SECRET` = tajna (`openssl rand -hex 32`) kojom se cron autorizira
     (funkcija je verify_jwt=false pa bez ove tajne vraca 401). Ista vrijednost mora ici
     u `Authorization: Bearer` header cron poziva (vidi migraciju 0012). NIJE service role.
   - `APP_BASE_URL` = `https://lektahr.netlify.app` (ili prava domena kad je bude)

   Dashboard: Edge Functions -> Secrets -> Add new secret. Ili CLI:
   ```bash
   supabase login
   supabase secrets set --project-ref zrrjttizjyfcxmcpgzml \
     RESEND_API_KEY="re_xxx" \
     REMINDER_FROM_EMAIL="Lekta <podsjetnici@tvoja-domena>" \
     REMINDER_UNSUB_SECRET="<hex>" \
     REMINDER_CRON_SECRET="<hex>" \
     APP_BASE_URL="https://lektahr.netlify.app"
   ```
   Cron vec postoji; cim su tajne postavljene (ukljucujuci REMINDER_CRON_SECRET u cron
   headeru), pocinje slati.

   PRIVATNOST prije aktivacije (audit data-flow-05): PRIJE postavljanja `RESEND_API_KEY`
   1) potvrdi Resend regiju obrade (zadano je US) i potpisan DPA / subprocesor status;
   2) dodaj Resend u popis izvrsitelja obrade (`src/legal/legal-content.ts`, odjeljak 5) s
      REGIJOM i osnovom prijenosa. Ako regija nije EU, uskladi s `processing.html` odjeljkom 4
      ("podaci u EU regiji") ili dodaj iznimku za dostavu e-maila uz osnovu transfera (SCC,
      pogl. V GDPR). NE upisuj "EU regija" bez potvrde. Tijelo maila vise NE nosi naslov rada
      (slot.label uklonjen), ali dostava e-mail adrese trecoj strani (Resend) i dalje treba
      navedenog izvrsitelja.

## 2. OTP email template (da prijava radi)  [blokira login]

Klijent (`verifyEmailOtp`) ocekuje 6-znamenkasti KOD, ne magic link.

1. Authentication -> Providers -> Email: ukljuci Email provider.
2. Authentication -> Email Templates -> "Magic Link" (taj se koristi za `signInWithOtp`).
   Ubaci `{{ .Token }}` u tijelo, npr.:
   ```html
   <h2>Prijava u Lektu</h2>
   <p>Tvoj kod za prijavu je: <strong>{{ .Token }}</strong></p>
   <p>Kod vrijedi 1 sat. Ako nisi trazio prijavu, zanemari ovaj e-mail.</p>
   ```
3. (Preporuka) Authentication -> Emails -> SMTP Settings: postavi Resend kao custom SMTP.
   Time i login-kodovi i podsjetnici idu kroz isti Resend racun, bez niskog rate-limita
   ugradenog Supabase mailera. I dalje treba verificirana domena (korak 1).

## 3. Flip autoVerified -> confirmed  [GOTOVO]

FPZG + FSB rokovi su `confirmed:true` (uz ocuvan `verification` zapis radi provenijencije).
Novi fakulteti (buduci batchevi) dolaze kao `autoVerified` (idu live, ali oznaceni
"ceka zavrsnu rucnu potvrdu") dok ih vlasnik ne pregleda i flipne. Registar
(`findUpcomingDeadline`) tretira `confirmed` I `autoVerified` kao prikazive; flip samo
mice oznaku.

## Test (end-to-end, nakon koraka 1 i 2)

1. Na zivom sajtu klikni Prijava, upisi e-mail, provjeri da stigne KOD (ne link), upisi ga.
2. Analiziraj FPZG ili FSB diplomski `.docx` -> ekran "Spremnost za predaju" -> pojavi se
   checkbox s rokom -> pretplati se (insert u `deadline_subscriptions`).
3. Rucni test cron funkcije bez cekanja 08:00 UTC (treba cron tajnu; bez nje je 401):
   ```bash
   curl -X POST https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/send-reminders \
     -H "Authorization: Bearer <REMINDER_CRON_SECRET>"
   ```
   Ocekivano 200 (bez ispravne tajne: 401, ne dira bazu ni Resend); uz pretplatu u prozoru
   7d/1d prije roka stize e-mail.

## Napomene

- Rokovi se najbolje osvjezavaju na POCETKU ak. godine (rujan/listopad), kad fakulteti
  objave nove odluke. Alat: `node scripts/gen-deadlines.mjs` (vidi AUTO_PROVJERA_ROKOVA.md).
- Sve dok nema domene, korak 1 se ne moze dovrsiti; login (korak 2) se moze testirati
  ugradenim Supabase mailerom uz nizak rate-limit.
