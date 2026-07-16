# Supabase migracije i RLS (D5)

Migracijski sloj i politike pristupa. Kolizija numeracije 0008/0009 je najozbiljniji strukturni nalaz cijelog audita.

Nalaza u ovoj skupini: 5.

### AUD-17 — Kolizija numeracije 0008/0009: Supabase prati migracije po prefiksu verzije pa se drugi-primijenjeni istoimeni file tiho preskace, ostavljajuci RLS/retenciju bez objekta i lomeci 0015

- Severity (finder -> konacni): High -> **High** | Verdikt: **CONFIRMED**
- Lokacija: `supabase/migrations/0009_log_retention.sql:7`
- Dokaz: Dva filea dijele verziju 0008 (0008_analytics_views.sql, 0008_checkout_consent.sql) i dva verziju 0009 (0009_log_retention.sql, 0009_set_product_price.sql). Supabase CLI izvodi `version` iz vodeceg broja prije `_`, a `supabase_migrations.schema_migrations.version` je PK. 0002_analytics/0009_set_product_price su committani 2.7., a 0008_checkout_consent/0009_log_retention 4.7. (razliciti db push).
- Reprodukcija: Inkrementalni deploy: prvi `supabase db push` primijeni 0008_analytics_views i 0009_set_product_price i zapise verzije 0008/0009. Kasniji push vidi 0008 i 0009 kao vec primijenjene i TIHO preskace 0008_checkout_consent (nema tablice checkout_consents ni njezinog RLS-a) i 0009_log_retention (nema funkcije purge_old_report_generations ni crona). Posljedicno 0015_revoke_purge.sql:11 `revoke execute on function purge_old_report_generations(int) from public;` puca jer funkcija ne postoji, sto blokira i 0016-0019. Na cist db od nule oba 0008 filea zele upisati istu PK verziju 0008 -> duplicate key / abort.
- Preporuka: Preimenuj kolidirajuce migracije u jedinstvene, monotone verzije (npr. 0008a/0008b ili renumeriraj 0008_checkout_consent -> 0020_, 0009_log_retention -> 0021_ ako su vec djelomicno primijenjene) i uskladi `schema_migrations` na produkciji rucno. Dodaj CI provjeru koja odbija dvije migracije s istim numerickim prefiksom.
- Verifikacija: Verificirano na FS-u: 0008_analytics_views.sql + 0008_checkout_consent.sql dijele verziju 0008; 0009_log_retention.sql + 0009_set_product_price.sql dijele 0009. Supabase version = token prije prvog '_' i PK je schema_migrations.version. 0015_revoke_purge.sql:11 zove purge_old_report_generations(int) koji je definiran SAMO u 0009_log_retention.sql:7. Tihi skip tog 0009 (inkrementalni push) obara 0015 i blokira 0016-0019; na cistom db oba 0008/0009 kolidiraju na PK. Stvaran strukturni defekt.

### AUD-18 — Fail-open pg_cron: sav purge osjetljivog sadrzaja (sirovi tekst rada, forenzicki nalaz, PII otisak) je uvjetovan pg_cronom bez fail-closed provjere pa migracija prolazi zeleno dok se retencija tiho ne provodi

- Severity (finder -> konacni): High -> **Medium** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-02
- Lokacija: `supabase/migrations/0018_integrity.sql:74`
- Dokaz: Svaki purge job je unutar `do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then ... perform cron.schedule(...) end if; end $$;` (0018:72-82 za purge_integrity_text nad sent_text; 0019:122-140 za purge_preflight_results; 0009:22-32 report_generations; 0011:150-160 faculty ip_hash; 0016:92-109 document_slots PII + faculty email). Ako pg_cron nije ukljucen u trenutku migracije, blok ne radi nista i migracija uspije.
- Reprodukcija: Deploy na projekt bez ukljucenog pg_cron ekstenzije: `select * from cron.job` prazan. integrity_checks.sent_text (cijeli poslani tekst rada, 0018:29) i preflight_results_full.result_full (isjecci rada + RSID/TotalTime forenzika, 0019:53) ostaju zauvijek umjesto obecanih 7 dana; document_slots otisak (authorNorm/titleNorm/headings) i faculty_requests.email nikad se ne anonimiziraju. Nema health checka ni assertiona koji to detektira.
- Preporuka: Ucini scheduling fail-closed: migracija koja stvara purge mora zahtijevati pg_cron (create extension if not exists pg_cron ili raise exception ako nedostaje), plus dnevni kontrolni job/alert koji mjeri najstariji red sa sadrzajem i test u stagingu koji dokazuje da su jobovi u cron.job i da purge nulira/brise.
- Verifikacija: Svi purge jobovi su unutar `if exists (... pg_extension pg_cron ...)`: 0009:22-32, 0016:92-109, 0018:72-82, 0019:122-140. Bez pg_crona migracija uspije zeleno a nista se ne zakazuje (fail-open). Spusteno na Medium: funkcije i dalje postoje, manualni fallback je eksplicitno dokumentiran (0009:19-21, 0016:89-91), a pogodjene tablice su buduce/nezive (integrity = Faza 4, preflight = nepushano), pa je trenutni podatkovni utjecaj ogranicen.

### AUD-19 — Trajno zakljucavanje preflighta: expire_stale_preflight_jobs je iza istog pg_cron guarda kao i partial-unique indeks jednog aktivnog joba, pa zaglavljen job zauvijek blokira korisnika ako cron ne radi

- Severity (finder -> konacni): Medium -> **Medium** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-02
- Lokacija: `supabase/migrations/0019_preflight.sql:104`
- Dokaz: `create unique index preflight_checks_one_active_per_user on preflight_checks (user_id) where status in ('pending','running')` (0019:44-46) dopusta najvise jedan aktivan job po korisniku. Oslobada ga jedino `expire_stale_preflight_jobs` (0019:104-118, flip stale pending/running -> error), ali je i on zakazan samo unutar `if exists (... pg_cron ...)` (0019:122-140).
- Reprodukcija: Korisnikov upload nikad ne dodje ili Python servis padne pa job ostane 'pending'. Ako pg_cron nije aktivan (isti uvjet kao LEKTA-SEC-02) ili expire job ne radi, partial-unique indeks trajno odbija svaki novi preflight tog korisnika (INSERT novog pending reda krsi jedinstvenost) bez ikakvog puta samo-oporavka.
- Preporuka: Uz fail-closed cron iz LEKTA-SEC-02, dodaj i sinkroni put oslobadanja: preflight-start Edge funkcija neka pri pokretanju sama istekne (status='error') zaostale pending/running jobove starije od 1 h prije nego pokusa INSERT, umjesto oslanjanja iskljucivo na cron.
- Verifikacija: Potvrdjeno: partial-unique preflight_checks_one_active_per_user (0019:44-46) + jedini oslobadjaci expire_stale_preflight_jobs (0019:104-118) iza istog pg_cron guarda (0019:122-140). Zaglavljen pending job + iskljucen pg_cron trajno blokira novi preflight korisnika. Dvostruka kontingencija i nezivi (nepushani) feature drze Medium, ne vise.

### AUD-20 — products_select_active ne razlikuje audience pa anon citanje kataloga (nuzno za paywall) izlaze i partnerske veleprodajne cijene i mor_product_id

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `supabase/migrations/0002_products_catalog.sql:71`
- Dokaz: `create policy products_select_active on products for select using (active = true);` (0002:70-72) vrijedi za sve role (komentar 0002:67 'SELECT za sve (anon ukljucivo, treba za paywall i SEO)'). Partnerski bundleovi su seedani bez active=false (0002:54-59, npr. partner_diplomski_50 249.50 za 50 slotova ~5 EUR/slot), a 0004 tvrdi da 'do tada nema partner cijena'.
- Reprodukcija: Ako je products izlozen anonu (kako paywall i zahtijeva), anon `GET /rest/v1/products?audience=eq.partner&select=id,price_eur,mor_product_id` vraca partnerske veleprodajne cijene i MoR product id-eve; retail korisnik vidi partnersku maloprodajno-veleprodajnu marzu.
- Preporuka: Suzi policy na `using (active = true and audience = 'retail')` (ili poseban policy za partner role), a partnerske retke izlozi samo aktivnim partnerima; mor_product_id ne izlazi anonu.
- Verifikacija: products_select_active `using (active = true)` (0002:70-72) vrijedi i za anon; partner redovi seedani s default active=true (0002:54-59, default 0002:19). 0004-ov 403 je Edge-razina i ne skriva retke kroz RLS, pa anon cita partnerske cijene. mor_product_id je null u seedu (popunjava se pri setupu) pa je taj konkretni leak kontingentan; leak partnerskih cijena je stvaran. Poslovni info-leak, Low.

### AUD-21 — Purge funkcije rade revoke execute samo 'from public', sto na starijim Supabase projektima ne uklanja direktne anon/authenticated EXECUTE grantove (za razliku od viewova koji ispravno revoke-aju from anon, authenticated)

- Severity (finder -> konacni): Info -> **Info** | Verdikt: **REJECTED**
- Lokacija: `supabase/migrations/0015_revoke_purge.sql:11`
- Dokaz: 0015:11-12, 0016:52,85, 0018:70, 0019:100,120 rade `revoke execute on function ... from public;`, dok viewovi ispravno rade `revoke all on ... from anon, authenticated` (0008:38-40, 0011:57). Komentar 0015:4 tvrdi 'Makni implicitni PUBLIC EXECUTE pa ih anon/authenticated ne mogu ni pozvati', ali na projektu s legacy ALTER DEFAULT PRIVILEGES (auto-expose) anon/authenticated dobivaju EXECUTE direktno, ne preko PUBLIC-a.
- Reprodukcija: Staticki. Mitigirano: sve te purge fn su `language sql` BEZ security definer pa se izvode s pravima pozivatelja; anon/authenticated nemaju DELETE/UPDATE grant ni RLS write policy na report_generations/document_slots/faculty_requests/integrity_checks/preflight_* pa DELETE/UPDATE pogodi 0 redaka. config.toml auto_expose_new_tables je unset (nova cloud zadana vrijednost = ne izlazi se), pa je na novom projektu i grant odsutan.
- Preporuka: Radi konzistentnosti i zastite od buducih izmjena (ako ijedna purge fn ikad postane security definer) revoke-aj eksplicitno `from public, anon, authenticated`, kao sto vec radi za security-definer fn (consume_slot_and_bind, set_product_price itd.).
- Verifikacija: Sam nalaz u repro polju kaze 'Mitigirano'. Purge fn su language sql BEZ security definer (izvode se s pravima pozivatelja), anon/authenticated nemaju DELETE/UPDATE grant ni RLS write policy na ciljne tablice (DELETE/UPDATE pogodi 0 redaka), config.toml auto_expose_new_tables je unset. Iskoristiv utjecaj = nula; najvise defense-in-depth higijena, ne stvarna ranjivost.

