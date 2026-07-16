# Sigurnosni audit, Lekta (ThesisReady)

Datum: 2026-07-10

> Napomena (dvije datoteke istog imena): ovo je raniji sigurnosni audit (shema nalaza
> security-01 do 06). Nadopunjen je i zamijenjen novijim, sirim auditom u korijenu repozitorija
> [SECURITY_AUDIT.md](../../SECURITY_AUDIT.md) (14.7.2026, shema LEKTA-SEC-01 do 07), koji je
> aktualni izvor istine. Ovaj dokument ostaje kao povijesni zapis; nalazi ispod (send-reminders,
> IP salt, HSTS, CORS) vecinom su preneseni u noviji audit.

Opseg: klijentski bundle (src, dist), autorski podaci (data), Supabase Edge funkcije i RLS migracije (supabase), hosting konfiguracija (netlify.toml, public/\_headers), obrada datoteka (docx, pdf) i XSS ploha.
Nacin rada: READ ONLY. Nijedna produkcijska datoteka nije mijenjana. Nalazi imaju dokaz iz koda (datoteka:linija).

Zakljucak u jednoj recenici: baza (RLS, tajne, potpis webhooka, obrada datoteka, XSS, CSP) je iznadprosjecno solidna za projekt ove faze, a jedini stvarni sigurnosni jaz je Edge funkcija `send-reminders` koja nema nikakvu autorizaciju, uz nekoliko manjih nalaza oko GDPR pseudonimizacije IP-a i sigurnosnih zaglavlja.

---

## Mapa podrucja

- Klijent (MPA, bez frameworka): `index.html` + 7 stranica alata, `src/ui/app.ts` (UI orkestrator, konfiguracija `DEFAULT_PRODUCTION_CONFIG`), `src/main.ts`, `src/shared/ui-boot.ts`. Analiza je lokalna u Web Workeru (`src/analysis/*`).
- Obrada datoteka: `src/docx/parser.ts` (ZIP citac, zip bomba, DTD), `src/pdf/pdf-preflight.ts`, `src/repair/*` (pise u korisnikov docx lokalno).
- Backend: Supabase Edge funkcije `supabase/functions/{create-checkout,webhook-mor,generate-report,file-guarantee-claim,faculty-request,send-reminders,unsubscribe-reminder,redeem-referral-signup,health}` + `_shared/*`.
- Baza i pristup: `supabase/migrations/0001..0013*.sql` (RLS), `supabase/config.toml`.
- Hosting: `netlify.toml` (build, DEPLOY=1), `public/_headers` (CSP i ostala zaglavlja).
- Build higijena: `vite.config.ts` + `scripts/strip-dev-only.mjs` (izbacuju QA konzolu, setup modal i `verification.html` iz javnog builda).

Provjereni tokovi: tajne u bundleu i gitu, RLS po svim tablicama, admin/QA konzola u produkciji, autorizacija izvjestaja, potpis i idempotencija naplate, obrada datoteka, sigurnosna zaglavlja.

---

## Tablica nalaza

| ID | Prioritet | Podrucje | Naslov | Status |
|----|-----------|----------|--------|--------|
| security-01 | P1 | Edge funkcija / abuse | `send-reminders` nema autorizaciju, javno pozivljiva funkcija sa service role, slot-reminder bez sent-markera (amplifikacija e-maila i troska) | Otvoreno (latentno dok e-mail backend nije ziv) |
| security-02 | P2 | GDPR / privatnost | IP hash pada na prazan salt u `generate-report` i `redeem-referral-signup` (nesoljeni SHA-256 IPv4 je reverzibilan) | Otvoreno (latentno) |
| security-03 | P2 | Sigurnosna zaglavlja | Nedostaje HSTS (`Strict-Transport-Security`) | Otvoreno |
| security-04 | P3 | Konfiguracija / hardening | `verify_jwt` nije zakovan po funkciji u `supabase/config.toml` | Otvoreno |
| security-05 | P3 | Sigurnosna zaglavlja / CSP | Nema `Permissions-Policy`; `connect-src`/`form-action` dopustaju bilo koji `https:` | Otvoreno |
| security-06 | P3 | Higijena tajni | `.env` nije u `.gitignore`; SQL purge funkcije nisu revocane od `anon` (bezopasno zbog RLS) | Otvoreno |

Nema nalaza prioriteta P0. Anon (public) Supabase kljuc jest ozicen u klijentu (`src/ui/app.ts:71`) i u `dist/assets`, ali je to javni kljuc uz aktivan RLS, pa nije tajna i nije prijavljen kao ranjivost (vidi Provjereno i sigurno).

---

## Nalazi

### security-01 (P1): `send-reminders` nema autorizaciju

- Problem: Edge funkcija radi s `SUPABASE_SERVICE_ROLE_KEY` (zaobilazi RLS), salje e-mailove preko Resenda i azurira bazu, a HTTP handler ne provjerava nikakvu autorizaciju. Provjerava samo da je metoda POST pa odmah izvrsava `processDeadlineReminders()` i `processSlotExpiryReminders()`.
- Lokacija: `supabase/functions/send-reminders/index.ts:170` (`Deno.serve` handler; jedina provjera je `req.method !== 'POST'` na `:171`); slanje e-maila `:27` (`sendEmail`); nedostatak sent-markera za slot podsjetnike `:164` (`if (ok) sent++;` bez ijednog `update ... reminder_sent_at`).
- Dokaz / reprodukcija:
  1. Migracija `supabase/migrations/0012_deadline_subscriptions.sql:120` dokumentira da cron poziva funkciju s `Authorization: Bearer <SERVICE_ROLE_KEY_ILI_CRON_SECRET>`, ali funkcija taj header nikada ne cita ni ne provjerava.
  2. Supabase gateway `verify_jwt` (i kad je ukljucen) prihvaca svaki JWT potpisan projektnim tajnim kljucem, ukljucujuci JAVNI anon kljuc iz bundlea. Dakle bez interne provjere endpoint je efektivno javno pozivljiv: `curl -X POST https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/send-reminders -H "Authorization: Bearer <anon-key-iz-bundlea>" -H "apikey: <anon>"`.
  3. `processSlotExpiryReminders` nema per-slot sent-marker (za razliku od deadline grane koja pise `reminder_7d_sent_at`/`reminder_1d_sent_at`). Ponovljeni pozivi ponovno salju e-mail svakom korisniku kojem slot istjece za 1 do 2 dana, na svaki poziv.
- Moguca posljedica: prisilno izvrsavanje serverskog posla po volji napadaca, ponavljano slanje e-mailova legitimnim korisnicima (spam) i amplifikacija troska Resenda. Nije open relay (primatelj je uvijek e-mail registriranog korisnika dohvacen po `user_id`), pa nema slanja na proizvoljne adrese. Odgovor otkriva agregatne brojace poslanih podsjetnika (mali info leak o aktivnosti baze).
- Trenutni ziv utjecaj: nizak. Prema memoriji projekta e-mail backend je INERT dok vlasnik ne postavi Resend tajne, `document_slots`/`deadline_subscriptions` su u soft-launchu prakticki prazni (naplata i rokovi jos nisu ziveni). Nalaz je zato latentan, ali postaje aktivan cim se podsjetnici uklljuce.
- Preporuceno rjesenje:
  1. U handleru zahtijevaj zajednicku tajnu: `const secret = Deno.env.get('REMINDER_CRON_SECRET'); if (req.headers.get('x-cron-secret') !== secret) return 401;` (ili usporedi Bearer prema dedicated cron tajni, ne prema service role kljucu). Uskladi cron poziv iz migracije 0012 da salje isti header.
  2. Dodaj per-slot sent-marker (npr. stupac `slot_expiry_reminder_sent_at` na `document_slots` ili redak u tablici poslanih) i preskoci vec obavijestene, cime slot grana postaje idempotentna kao deadline grana.
- Acceptance kriteriji: POST bez ispravne cron tajne vraca 401 i ne dira bazu ni Resend; dvostruki uzastopni poziv s ispravnom tajnom ne salje isti slot-podsjetnik dvaput; `npm run check` zelen; cron (migracija 0012) uskladen s novim headerom.
- Rizik regresije: nizak. Promjena je aditivna (gate na ulazu + jedan marker). Rizik je operativni: ako se cron ne uskladi s novom tajnom, podsjetnici stanu (fail-closed), sto je prihvatljivije od javne funkcije.

---

### security-02 (P2): IP hash pada na prazan salt (GDPR)

- Problem: `ip_hash` se u dvije funkcije racuna sa saltom koji fallbacka na prazan string. Nesoljeni `SHA-256` IPv4 adrese je reverzibilan brute-forceom cijelog 2^32 prostora, pa `report_generations.ip_hash` i `referral_signups.referred_ip_hash` u tom slucaju nisu prava pseudonimizacija (a spremaju se kao anti-abuse trag korisnickog IP-a).
- Lokacija: `supabase/functions/generate-report/index.ts:27` (`IP_HASH_SALT = Deno.env.get('IP_HASH_SALT') ?? ''`); `supabase/functions/redeem-referral-signup/index.ts:17` (isto); helper `supabase/functions/_shared/hash-ip.ts:20` (`salt + ip`).
- Dokaz: `faculty-request/index.ts:43` svjesno rjesava isti problem izvodeci salt iz service role kljuca kad `IP_HASH_SALT` nije postavljen (`_ipSalt = sha256Hex('lekta-ip-hash-salt|' + SERVICE_ROLE)`), a `generate-report` i `redeem-referral-signup` tu istu zastitu nemaju, ostaju na `''`. Komentar u `hash-ip.ts` eksplicitno priznaje: bez salta obje strane koriste `''` pa su konzistentne, ali bez GDPR koristi.
- Moguca posljedica: ako vlasnik ne postavi `IP_HASH_SALT` secret, pohranjeni hash IP-a je praktički obrnjiv, sto slabi GDPR minimizaciju osobnog podatka (IP). Latentno jer se `generate-report` ne poziva u soft-launchu (`reportEndpoint` je prazan u `DEFAULT_PRODUCTION_CONFIG`), pa se `ip_hash` trenutno i ne pise iz te putanje.
- Preporuceno rjesenje: preslikaj derivaciju iz `faculty-request` u zajednicki `hash-ip.ts` (kad je `IP_HASH_SALT` prazan, izvedi stabilan salt iz service role kljuca hashiranjem, ne sirovo), ili ucini secret obaveznim (fail-closed na startu funkcije). Zadrzi istovjetnu ekstrakciju da anti-fraud usporedba i dalje radi.
- Acceptance kriteriji: uz nepostavljen `IP_HASH_SALT`, `ip_hash` u sve tri funkcije je soljen istim izvedenim saltom; anti-fraud usporedba `referred_ip_hash` vs `report_generations.ip_hash` i dalje pogadja; `npm run check` zelen.
- Rizik regresije: srednji. Ako se salt promijeni nakon sto su hashevi vec upisani, stari i novi hashevi se vise ne poklapaju pa anti-fraud usporedba propada za povijesne retke. Uvesti prije nego pocne pisanje IP hasheva u produkciji.

---

### security-03 (P2): Nedostaje HSTS zaglavlje

- Problem: `public/_headers` postavlja CSP, `X-Content-Type-Options`, `Referrer-Policy` i `X-Frame-Options`, ali ne i `Strict-Transport-Security`. Bez HSTS-a preglednik na prvi posjet ili nakon isteka nije prisiljen na HTTPS, sto otvara SSL strip / downgrade scenarij.
- Lokacija: `public/_headers:19` do `:23` (blok `/*`: CSP na `:19`, `X-Frame-Options` na `:22`, nema `Strict-Transport-Security`).
- Dokaz: `grep -niE "strict-transport|permissions-policy" public/_headers netlify.toml` ne vraca nista.
- Moguca posljedica: MITM downgrade na HTTP kod prvog posjeta na mrezi pod nadzorom napadaca. Ublazeno cinjenicom da je ziva domena `*.netlify.app`, a `netlify.app` je vec na HSTS preload listi na razini registra, pa preglednici ionako forsiraju HTTPS za tu domenu. Rizik postaje stvaran cim se predje na vlastitu domenu (npr. lekta.hr).
- Preporuceno rjesenje: dodaj u `/*` blok `Strict-Transport-Security: max-age=31536000; includeSubDomains`. `preload` i `includeSubDomains` dodaj tek uz vlastitu domenu koju stvarno zelis trajno zakljucati na HTTPS.
- Acceptance kriteriji: odgovor hostinga nosi `Strict-Transport-Security` s `max-age` >= 15552000; regresijski test zaglavlja (ako postoji) prolazi; nema utjecaja na `npm run dev` (zaglavlje dolazi samo s hostinga).
- Rizik regresije: nizak. Cisto aditivno zaglavlje. Jedini oprez je `includeSubDomains`/`preload` na domeni koju jos koristis za nesto na HTTP-u.

---

### security-04 (P3): `verify_jwt` nije zakovan po funkciji

- Problem: `supabase/config.toml` nema nijedan `[functions.<ime>]` blok, pa `verify_jwt` posture svake funkcije ovisi o zastavicama pri ruc nom deployu (`--no-verify-jwt`), a ne o verzioniranoj konfiguraciji. Namjera (webhook, faculty-request, send-reminders, unsubscribe javni; checkout/report/guarantee/redeem uz JWT) nije kodirana u repozitoriju.
- Lokacija: `supabase/config.toml` (nema `[functions]` sekcije); posredni dokaz namjere su komentari za deploy u `supabase/functions/unsubscribe-reminder/index.ts:11` i `redeem-referral-signup/index.ts:9`.
- Dokaz: `grep -rn "verify_jwt" supabase/` ne vraca nista.
- Moguca posljedica: nije ziva ranjivost jer funkcije koje traze auth same zovu `getUser` i vracaju 401 bez tokena (obrana u dubini postoji), a webhook se oslanja na HMAC. No neponovljiva posture znaci da pogresan redeploy moze tiho promijeniti izlozenost (npr. webhook bez `--no-verify-jwt` prestane raditi, ili se funkcija izlozi sirem krugu nego se mislilo).
- Preporuceno rjesenje: dodaj eksplicitne `[functions.<ime>] verify_jwt = true|false` blokove za sve funkcije prema stvarnoj namjeri i deployaj iz konfiguracije, ne iz ad-hoc zastavica.
- Acceptance kriteriji: svaka funkcija ima eksplicitan `verify_jwt` u `config.toml`; deploy iz konfiguracije daje istu posture; smoke test (health 200, create-checkout bez tokena 401) prolazi.
- Rizik regresije: nizak, ali dira deploy proces; provjeriti da webhook i javne funkcije ostanu dostupne bez JWT-a.

---

### security-05 (P3): Nema `Permissions-Policy`, siroki `connect-src`/`form-action`

- Problem: (a) nema `Permissions-Policy` zaglavlja da zakljuca senzore (camera, microphone, geolocation) koje app ne koristi; (b) CSP `connect-src 'self' https:` i `form-action 'self' https:` dopustaju odlazak podataka na bilo koji `https:` host, sto je siroko za obranu u dubini.
- Lokacija: `public/_headers:19` (CSP linija: `connect-src 'self' https:` i `form-action 'self' https:`; nema `Permissions-Policy`).
- Dokaz: CSP string u `public/_headers` sadrzi `connect-src 'self' https:` i `form-action 'self' https:`; `Permissions-Policy` se ne pojavljuje.
- Moguca posljedica: da postoji injection uporiste, siroki `connect-src` dopusta egzfiltraciju na proizvoljni HTTPS host. Rizik je nizak jer `script-src` nema `unsafe-inline` ni `unsafe-eval` (hash samo za FOUC skriptu), pa izvrsavanje ubrizganog JS-a CSP blokira; `img-src` je bez `https:` pa je exfil preko slike zatvoren. `style-src 'unsafe-inline'` je svjesno zadrzan (dinamicki inline stilovi) i nizak rizik.
- Preporuceno rjesenje: dodaj `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`; po mogucnosti suzi `connect-src` i `form-action` na konkretne hostove (self, `*.supabase.co`, Lemon Squeezy) umjesto svih `https:`.
- Acceptance kriteriji: zaglavlje `Permissions-Policy` prisutno; nakon suzenja `connect-src` auth, waitlist, katalog i checkout pozivi i dalje rade; CSP hash FOUC skripte netaknut (invarijanta iz `tests/dev-only-strip.test.ts`).
- Rizik regresije: srednji za `connect-src` suzenje (moze slucajno blokirati legitiman poziv ako se propusti neki host); `Permissions-Policy` je nizak rizik.

---

### security-06 (P3): Higijena tajni (`.env` van `.gitignore`, purge funkcije nisu revocane)

- Problem: (a) `.gitignore` ne ignorira `.env` (ignorira `*.local` sto hvata `.env.local`, ali ne obican `.env`), pa lokalni `.env` sa service role kljucem moze zavrsiti u commitu greskom. (b) SQL funkcije `purge_old_report_generations` (0009) i `purge_faculty_request_ip` (0011) su SECURITY INVOKER i nisu revocane od `public`/`anon`, pa su izlozene kao PostgREST RPC.
- Lokacija: `.gitignore:1` do `:7` (nema `.env`); `supabase/migrations/0009_log_retention.sql:7` (`purge_old_report_generations`, bez revoke); `supabase/migrations/0011_faculty_requests.sql:135` (`purge_faculty_request_ip`, bez revoke).
- Dokaz: `cat .gitignore` pokazuje `node_modules/`, `dist/`, `scratchpad-dist-public/`, `artifacts/`, `*.local`, `.DS_Store`, `__pycache__/`, bez `.env`. Migracije definiraju obje purge funkcije bez `revoke ... from public, anon, authenticated` (za razliku od svih SECURITY DEFINER funkcija koje jesu revocane).
- Moguca posljedica: (a) rizik slucajnog commita service role tajne u buducnosti (danas nijedan `.env` nije tracan, `git ls-files` cist). (b) `anon` moze pozvati purge RPC, ali RLS bez DELETE/UPDATE politike odbija promjenu, pa funkcije nad tudjim/svim retcima obrisu 0 redaka; posljedica je bezopasna (nema brisanja, vraca 0), tek je nepotrebno izlozena povrsina.
- Preporuceno rjesenje: dodaj `.env` i `.env*` (osim primjera) u `.gitignore`; dodaj `revoke all on function purge_old_report_generations(int) from public, anon, authenticated;` i isto za `purge_faculty_request_ip(int)` u novoj migraciji.
- Acceptance kriteriji: `.env` je ignoriran (`git check-ignore .env` uspijeva); `anon` vise ne moze pozvati purge funkcije (403 iz PostgREST-a); postojeci cron poziv (kao postgres) i dalje radi; `npm run check` zelen.
- Rizik regresije: nizak. `.gitignore` promjena je bezopasna; revoke ne dira cron koji radi kao vlasnik. Provjeriti da nijedan legitiman klijentski put ne zove te RPC-je (ne zove).

---

## Provjereno i sigurno (bez nalaza)

- Tajne u klijentu: u bundleu i `dist/assets` postoji samo Supabase anon kljuc (`role: anon`, dekodiran iz `src/ui/app.ts:71`), koji je po dizajnu javan uz aktivan RLS; nijedan service role kljuc ni privatni kljuc nije u `src/`, `data/`, `dist/` ni u git indeksu (`git ls-files` bez `.env`/tajni; `grep` za `service_role` u `dist/` prazan).
- RLS: sve 17 tablica u migracijama 0001 do 0013 imaju `enable row level security`. Korisnicke tablice imaju iskljucivo `select` politike vezane na `auth.uid()`; upis ide preko service role. Agregatni viewovi (`v_weekly_revenue`, `v_weekly_slot_activity`, `v_tier_share`, `faculty_request_counts`) revocani su od `anon, authenticated`. `products` je namjerno javno citljiv uz `active = true`. Sve SECURITY DEFINER funkcije imaju `set search_path = public` i revocane su od `public, anon, authenticated`.
- Naplata: webhook `webhook-mor` provjerava HMAC-SHA256 potpis nad sirovim tijelom (`src/report/webhook.ts:74`), fail-closed na prazan secret ili potpis; idempotencija preko `unique (provider, order_id)`; cijena je serverska (katalog `products`), klijent salje samo `productId`; consent se trajno biljezi prije redirecta na placanje (`create-checkout`).
- Izvjestaj: `generate-report` autorizira `getUser(token)`, racuna otisak serverski iz istog payloada, odlucuje pravo pristupa cistom logikom `slot-logic`; nema GET-po-ID rute koja bi se pogadjala; ulazni payload je kapiran (513 KB, duljine nizova).
- Admin/QA: `verification.html` je iskljucen iz javnog builda (`vite.config.ts`, nije u `dist/`); QA konzola i setup modal su omotani `dev-only` markerima koje `scripts/strip-dev-only.mjs` reze pri `DEPLOY=1` (`grep dev-only:start dist/index.html` = 0), a JS im je iza `__DEV_TOOLS__` tree-shake zastave. Setup modal ionako mijenja samo klijentovu vlastitu konfiguraciju (bez eskalacije).
- Obrada datoteka: `.docx` ekstenzija i velicina se provjeravaju prije citanja (`src/ui/app.ts:147`); parser ima zastitu od zip bombe (deklarirana i akumulirana velicina, granica 200 MB, `src/docx/parser.ts:29,57,111,116`) i odbija DTD (XXE, `parser.ts:140`).
- XSS: sav docx-izveden sadrzaj (naslovi provjera, detalji, problemi, statistika, izvori) prolazi kroz `escapeHtml` i `safeHref` u `renderResult`/`renderCheckTable`/`buildStandaloneReport`; uz CSP bez `unsafe-inline`/`unsafe-eval` za skripte to je obrana u dubini. `deepMerge` blokira `__proto__`/`constructor`/`prototype` (prototype pollution, `src/ui/app.ts:285`).
- Clickjacking: `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`; `object-src 'none'`, `base-uri 'self'`.
