# Sigurnost: Edge funkcije i re-verifikacija LEKTA-SEC (D6-D7)

Supabase Edge funkcije i re-verifikacija sedam baseline nalaza od 14.7. Ovdje je i procjena novih povrsina (m4_corpus tier, dev _preflight_*.mts skripte).

Nalaza u ovoj skupini: 16.

### AUD-22 — integrity-check 'full' nacin nema kvotu: jedan aktivan entitlement otkljucava neograniceno placenih vanjskih poziva i pohranu punog teksta

- Severity (finder -> konacni): High -> **Medium** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-01
- Lokacija: `supabase/functions/integrity-check/index.ts:145`
- Dokaz: else { const { data: ent } = await admin.from('entitlements').select('id').eq('user_id', user.id).eq('status','active').gt('purchase_expires_at', nowIso).limit(1); if (!ent || ent.length === 0) return json({ error: 'payment_required' }, 402); } ... const [crossLingual, ai] = await Promise.all([crossLingualCheck(admin, text, lang, full), aiSignalCheck(text)]);
- Reprodukcija: Prijavljeni korisnik s bilo kojim aktivnim entitlementom (purchase_expires_at u buducnosti). Petlja: POST /functions/v1/integrity-check, Authorization: Bearer <userJWT>, tijelo {mode:'full', lang:'hr', text:'<~300KB>', consent:{sendsFullText:true}}. Gate na liniji 146-153 prolazi bez ijedne per-poziv kvote (entitlement se NE trosi, nema dnevnog capa kao u teaser grani), pa N zahtjeva okine N embedding-API + N AI-detector POST-ova (svaki do 300KB) i upise N redaka punog teksta u integrity_checks. Za razliku od 'teaser' grane koja ima TEASER_DAILY_CAP.
- Preporuka: Uvedi per-korisnik (i per-IP) dnevni cap i za 'full' (isti obrazac kao teaser COUNT na integrity_checks), ili trosi zaseban integ. kredit/slot po punom pozivu. Dodatno kapiraj ukupan mjesecni broj punih poziva po entitlementu jer svaki bilo koji poziv bilja vanjske providere.
- Verifikacija: integrity-check/index.ts:145-154 gejta 'full' samo postojanjem aktivnog entitlementa; :158-161 pali crossLingualCheck+aiSignalCheck s text.slice(0,300KB), :168-178 upisuje puni tekst. Nema per-poziv kvote/idempotency/timeouta, za razliku od teaser TEASER_DAILY_CAP (:137-144). Potvrdjeno. Spustam na Medium: zloupotreba trazi VEC placeni aktivni entitlement (:150-151 status='active'), a provideri su trenutno INERTNI (:45,:82 vracaju available:false dok EMBEDDING/AI_DETECTOR env nisu postavljeni), pa je stvarni trosak ogranicen na napuhavanje integrity_checks redaka i (kad provideri ozive) trosak koji radi jedan koji je platio.

### AUD-29 — LEKTA-SEC-01 JOS OTVOREN: puni (placeni) integrity nacin nema quota, idempotency ni timeout, salje do 300 KB teksta providerima po zahtjevu.

- Severity (finder -> konacni): High -> **Medium** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-01
- Lokacija: `supabase/functions/integrity-check/index.ts:146`
- Dokaz: Za mode==='full' gate je samo postojanje aktivnog entitlementa (`.from('entitlements')...eq('status','active')...limit(1)`, :146-153), zatim `Promise.all([crossLingualCheck, aiSignalCheck])` (:158-161) salje `text.slice(0, MAX_TEXT)` (300 KB) na EMBEDDING/AI_DETECTOR fetch (:48,:84) BEZ per-user/per-IP/globalne kvote, bez dedup/idempotency i bez AbortSignal.timeout. TEASER_DAILY_CAP (:27,:137-144) pokriva samo teaser.
- Reprodukcija: S jednim aktivnim entitlementom poslati vise identicnih POST {mode:'full', text, consent}; svaki poziv umetne novi red i paralelno okine oba providera bez ikakvog ogranicenja.
- Preporuka: Atomski quota zapis po korisniku i IP-u, hash/dedup teksta kao idempotency kljuc, globalni concurrency queue, AbortSignal.timeout na oba provider fetcha i maksimalna velicina odgovora.
- Verifikacija: Duplikat AUD-22 (LEKTA-SEC-01). Potvrdjeno: :146-153 gate samo aktivni entitlement, :158-161 Promise.all bez kvote/dedup/AbortSignal.timeout, fetch na :48/:84 salje text.slice(0,MAX_TEXT=300KB). Isto obrazlozenje severityja kao AUD-22: gating iza placenog entitlementa + inertni provideri -> Medium.

### AUD-30 — LEKTA-SEC-02 JOS OTVOREN: retencijski cron se zakazuje samo ako pg_cron postoji u trenutku migracije, bez health-checka pa brisanje osjetljivog teksta nije dokazivo.

- Severity (finder -> konacni): High -> **Medium** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-02
- Lokacija: `supabase/migrations/0018_integrity.sql:74`
- Dokaz: `if exists (select 1 from pg_extension where extname = 'pg_cron') then ... perform cron.schedule('purge-integrity-text', ...)` (0018:74-80); identican no-op guard u 0019:124-137 (purge-preflight-results, expire-stale-preflight-jobs). Nema deployment assertiona, health checka ni testa da su jobovi stvarno aktivni; ako pg_cron nije ukljucen, `sent_text` i `preflight_results_full` ostaju trajno.
- Reprodukcija: Primijeniti migracije na bazu bez ukljucenog pg_cron extensiona: purge funkcije postoje ali nikad se ne zakazu; kanari sadrzaj u sent_text/preflight_results_full ostaje i nakon deklariranih 7 dana.
- Preporuka: Deployment mora failati (raise) ako pg_cron nije konfiguriran, dodati dnevni kontrolni job + alert i metriku najstarijeg sadrzajnog reda.
- Verifikacija: 0018_integrity.sql:72-82 cron.schedule('purge-integrity-text') samo 'if exists pg_extension pg_cron'; identican no-op guard u 0019:122-140 (purge-preflight-results, expire-stale). Migracije NE rade 'create extension pg_cron', nema deployment assertiona/health-checka. Ako pg_cron nije ukljucen, sent_text (puni tekst rada) i preflight_results_full ostaju trajno. Potvrdjeno. Medium (privacy/retencija ovisi o ops konfiguraciji koja se nigdje ne verificira).

### AUD-23 — create-checkout nema rate limiting: prijavljeni korisnik moze neograniceno okidati Lemon Squeezy checkout pozive i checkout_consents upise

- Severity (finder -> konacni): Medium -> **Low** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-06
- Lokacija: `supabase/functions/create-checkout/index.ts:115`
- Dokaz: const lsRes = await fetch('https://api.lemonsqueezy.com/v1/checkouts', { method:'POST', headers:{... Authorization: `Bearer ${LS_API_KEY}` }, body: JSON.stringify(lsBody) }); ... (u cijelom handleru nema COUNT/kvote po korisniku niti po IP-u)
- Reprodukcija: Prijavljeni korisnik u petlji salje POST /functions/v1/create-checkout s valjanim {productId, consent:{immediateDelivery:true, withdrawalWaived:true, text:'x'}}. Nijedna grana ne broji prethodne zahtjeve, pa 1000 zahtjeva/min = 1000 poziva na api.lemonsqueezy.com/v1/checkouts + 1000 redaka u checkout_consents. Trosi LS API kvotu i puni tablicu; racun je jeftin (OTP signup).
- Preporuka: Dodaj per-korisnik i per-IP dnevni/minutni cap prije LS fetcha (npr. COUNT nad checkout_consents ili zaseban rate_limit tablica/SQL security-definer fn), analogno DAILY_CAP u generate-report.
- Verifikacija: create-checkout/index.ts cijeli handler (31-134) nema nijedan COUNT/kvotu po user/IP; :95-104 insert checkout_consents + :115-123 POST na api.lemonsqueezy.com za svaki zahtjev. Potvrdjeno. Low a ne Medium: trazi autenticiran (OTP) racun i valjanu privolu (:62), a posljedica su LS checkout SESIJE (ne naplate) + rast tablice; nema pojacanja u smjeru stvarne stete.

### AUD-24 — Access-Control-Allow-Origin: '*' na osjetljivim JWT funkcijama (integrity-check, generate-report, create-checkout, file-guarantee-claim, redeem-referral-signup) dok su faculty-request/preflight suzeni

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-05
- Lokacija: `supabase/functions/integrity-check/index.ts:31`
- Dokaz: const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };  // isto u generate-report:32, create-checkout:22, file-guarantee-claim:14, redeem-referral-signup:22; nasuprot _shared/cors.ts pickAllowedOrigin koji koristi faculty-request/preflight
- Reprodukcija: fetch('https://<proj>.functions.supabase.co/integrity-check', {method:'OPTIONS'}) s bilo kojeg origina vraca Access-Control-Allow-Origin: *. Iskoristivost je ogranicena: POST i dalje treba zrtvin bearer JWT (verify_jwt=true, token nije ambient cookie), pa cross-origin citanje autenticiranog odgovora nije izvedivo. Ovo je nekonzistentnost otvrdnjavanja (integrity-check prima puni tekst rada), ne izravni CSRF.
- Preporuka: Zamijeni staticki '*' s corsHeadersFor(origin, ALLOWED_ORIGINS) iz _shared/cors.ts na svim JWT funkcijama, kao sto je vec ucinjeno za faculty-request/preflight, radi obrane u dubinu i dosljednosti.
- Verifikacija: Potvrdjeno grepom: ACAO '*' u integrity-check:31, create-checkout:22, generate-report:32, file-guarantee-claim:14, redeem-referral-signup:22; samo preflight-start koristi corsHeadersFor. Kako nalaz sam priznaje, POST trazi zrtvin bearer JWT (nije ambient cookie), pa cross-origin citanje autenticiranog odgovora nije izvedivo. Nekonzistentnost otvrdnjavanja, ne CSRF. Low tocan.

### AUD-25 — unsubscribe token: HMAC bez isteka, prenosi se u URL-u (GET) i usporeduje se ne-konstantnim vremenom

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `supabase/functions/_shared/reminder-token.ts:67`
- Dokaz: const expectedSig = await hmacHex(secret, payloadJson); if (expectedSig !== sig) return null;  // ne-konstantna usporedba; payload je {type, subscriptionId|userId} bez exp; unsubscribe-reminder cita token = url.searchParams.get('token')
- Reprodukcija: Token iz linka u e-mailu je HMAC bez 'exp' claima, poslan kao ?token= u URL-u (unsubscribe-reminder/index.ts:31), pa zavrsi u Resend/proxy/browser logovima i replayabilan je zauvijek za ponovno gasenje podsjetnika te osobe. Usporedba '!==' na liniji 67 nije konstantno-vremenska (za razliku od cron-auth.ts timingSafeEqual).
- Preporuka: Dodaj 'exp' u payload i odbij istekle tokene; usporedi potpis konstantno-vremenski (isti timingSafeEqual kao _shared/cron-auth.ts); po mogucnosti primaj token u POST tijelu umjesto u query stringu.
- Verifikacija: reminder-token.ts: UnsubscribePayload (:9-11) nema exp; usporedba '!==' (:67) nije konstantno-vremenska; unsubscribe-reminder/index.ts:31 cita token iz URL query stringa (GET). Potvrdjeno. Ostaje Low: replay samo ponovno gasi podsjetnike te iste osobe (mala steta), a timing-forge valjanog HMAC-a preko mreze je nepraktican.

### AUD-26 — create-checkout vraca sirovo tijelo greske Lemon Squeezy providera klijentu

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED**
- Lokacija: `supabase/functions/create-checkout/index.ts:124`
- Dokaz: if (!lsRes.ok) return json({ error: 'checkout_failed', detail: await lsRes.text() }, 502);
- Reprodukcija: Kad LS vrati ne-2xx (npr. losa konfiguracija store-a/varijante), sirovo upstream tijelo se prosljeduje pozivatelju kao 'detail', otkrivajuci internu strukturu/poruke LS API-ja klijentu.
- Preporuka: Logiraj upstream tijelo serverski (console.error), a klijentu vrati genericki {error:'checkout_failed'} bez 'detail'.
- Verifikacija: create-checkout/index.ts:124 'return json({ error:'checkout_failed', detail: await lsRes.text() }, 502)' doslovno prosljeduje upstream LS tijelo klijentu. Potvrdjeno. Low: otkriva samo LS API poruke greske, bez tajni.

### AUD-27 — preflight-start per-IP dnevni cap je COUNT-pa-INSERT (TOCTOU); vise racuna s istog IP-a moze probiti cap

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-06
- Lokacija: `supabase/functions/preflight-start/index.ts:126`
- Dokaz: const { count: ipCount } = await admin.from('preflight_checks').select('id', { count:'exact', head:true }).eq('ip_hash', ipHash).gt('created_at', dayAgo); if ((ipCount ?? 0) >= DAILY_CAP_IP) return json({ error:'rate_limited' }, 429, origin);  // komentar 105-114 priznaje da partial unique index (0019) atomizira samo per-USER
- Reprodukcija: Napravi K OTP-verificiranih racuna iza jednog IP-a i paralelno okini preflight-start. Svaki procita ipCount PRIJE nego ijedan INSERT commita, pa svih K prode per-IP provjeru; samo per-user partial-unique index je atomican, ne per-IP.
- Preporuka: Preseli gate+INSERT u jednu SECURITY DEFINER funkciju pod pg_advisory_xact_lock(ip_hash) tako da COUNT i INSERT budu u istoj transakciji (vec zabiljezeno kao pre-scale fiks u komentaru).
- Verifikacija: preflight-start/index.ts:126-131 COUNT ip_hash pa 429, uz eksplicitni komentar (:105-114) da partial unique index (0019) atomizira samo per-USER, ne per-IP. TOCTOU je stvaran; obilazak trazi vise OTP-verificiranih racuna iza istog IP-a. Low tocan (svjesno odgodjeno za pre-scale).

### AUD-28 — webhook-mor: nema top-level try/catch, pa transient greska nakon idempotentnog entitlementa trajno preskoci kupon/referral pri retryju

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **PLAUSIBLE**
- Lokacija: `supabase/functions/webhook-mor/index.ts:203`
- Dokaz: const { error } = await admin.from('entitlements').insert(buildEntitlementInsert(...)); if (error && error.code === '23505') return json({ ok:true, action:'duplicate_ignored' }); ... await tryGrantReferrerReward(...); if (isPassProduct(product.kind)) { await admin.from('coupon_grants').insert({...}); } if (ev.referralCode) await attributeReferral(admin, ev);
- Reprodukcija: Pri PRVOJ isporuci, ako coupon_grants insert (linija 212) ili attributeReferral (224) baci (transient DB greska) - a handler nema try/catch - vraca se 500, LS retryja; retry pogodi unique(provider,order_id) 23505 na liniji 203 i vrati 'duplicate_ignored', pa se pass kupon / referral atribucija za taj order NIKAD ne kreiraju.
- Preporuka: Omotaj post-entitlement korake (coupon, attributeReferral, tryGrantReferrerReward) u vlastite try/catch (kao tryGrantReferrerReward) ili ih ucini idempotentnima i re-runnabilnima kad entitlement vec postoji, umjesto ranog izlaza na 23505.
- Verifikacija: webhook-mor/index.ts Deno.serve (155) nema top-level try/catch. ALI supabase-js na gresci UPITA vraca {error} (ne baca), a :212/:224 ignoriraju te errore, pa query-level greska NE rusi handler. Scenarij vrijedi samo za fetch-level odbacivanje (npr. DB nedostupan) koje se PROPAGIRA -> 500 -> LS retry -> 23505 na :203 -> 'duplicate_ignored', cime pass kupon/referral za taj order ostaju nekreirani. Uski prozor, pogadja samo bonus kupon/atribuciju, ne core entitlement. Zato PLAUSIBLE/Low.

### AUD-31 — LEKTA-SEC-04 JOS OTVOREN: DOCX XML parser i dalje koristi xml.etree.ElementTree bez defusedxml ni odbijanja DOCTYPE/ENTITY.

- Severity (finder -> konacni): Medium -> **Low** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-04
- Lokacija: `lekta-pipeline/lekta_pipeline/docx_loader.py:11`
- Dokaz: `import xml.etree.ElementTree as ET` (:11) i `ET.fromstring(...)` na :115,146,166,182,197,205,214. grep za defused/DOCTYPE/ENTITY u docx_loader.py i server/guard.py ne vraca nista, tj. guard.py ne odbija `<!DOCTYPE` niti se koristi defusedxml; obrana ovisi samo o Expat defaultima.
- Reprodukcija: Ubaciti u docx part XML s internim entitetom/DOCTYPE; parser se oslanja iskljucivo na Expat zastite verzije runtimea, bez eksplicitne granice.
- Preporuka: Prije parsiranja odbiti `<!DOCTYPE` i `<!ENTITY` u svim citanim XML dijelovima, koristiti defusedxml.ElementTree i dodati regresijske testove s internim entitetima.
- Verifikacija: docx_loader.py:11 'import xml.etree.ElementTree as ET' + ET.fromstring; grep potvrdjuje da nema defusedxml ni DOCTYPE odbijanja u loaderu ni guard.py. Faktografski tocno, ali spustam na Low: runtime je CPython 3.14 (pyc 3.14) gdje Expat po defaultu ima billion-laughs zastitu i ElementTree ne razrjesava vanjske entitete, a guard.py capira word/document.xml na 20MB (max_xml_mb). Realna XXE/DoS povrsina je uska; ovo je hardening-gap (dodati defusedxml/odbiti DOCTYPE), ne aktivna ranjivost.

### AUD-32 — NOVO: cetiri lokalna dev fajla nisu gitignorana usprkos zaglavlju "ne commitati", sadrze hardkodiran HMAC placeholder secret, lokalne apsolutne putanje i laznu dev-sesiju.

- Severity (finder -> konacni): Medium -> **Low** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-07
- Lokacija: `_preflight_shim.mts:18`
- Dokaz: `const SECRET = process.env.LEKTA_TICKET_SECRET ?? 'dev-local-preflight-secret-please-change-0123456789';` (_preflight_shim.mts:18, 50 znakova = validna duljina HMAC ticketa). Zaglavlja svih fajlova kazu "NIJE za produkciju, ne commitati", ali `git check-ignore` vraca exit 1 (nisu ignorirani) i pojavljuju se kao `??` untracked: _preflight_shim.mts, _preflight_cors_test.mts (hardkodirana putanja C:/Users/PC/.../zavrsni_rad.docx :8), _preflight_e2e.mts (:11), vite.dev-preflight.config.mts (seeda lazni 'dev-local-token' + userId u localStorage :22-27). Ublazavajuce: produkcijski Python trazi LEKTA_TICKET_SECRET>=32 znaka i inace failat (server/config.py:37-39), pa placeholder nije direktno iskoristiv protiv produkcije osim ako se svjesno postavi taj env.
- Reprodukcija: `git add -A` stagea sva cetiri fajla usprkos "ne commitati" zaglavljima; security-audit.yml nema secret scanning pa slucajni commit HMAC placeholdera i lokalnih putanja ne bi bio uhvacen.
- Preporuka: Dodati `_preflight_*.mts` i `vite.dev-preflight.config.mts` u .gitignore; ukloniti hardkodiran fallback secret (zahtijevati env, fail-closed kao config.py) i parametrizirati apsolutnu putanju do samplea.
- Verifikacija: git check-ignore vraca exit 1 za sva 4 fajla (nisu ignorirani); _preflight_shim.mts:18 ima 50-znakovni placeholder secret, _preflight_e2e.mts:11 hardkodiranu C:/Users/PC putanju. Potvrdjeno. Low: fajlovi su untracked (?? ne staged); 'secret' je javni dev-default (nije prava tajna), a produkcijski config.py:37-39 ionako odbija secret <32 znaka iz enva, pa placeholder nije iskoristiv protiv produkcije. Steta = slucajni commit lokalnih putanja/dev tokena.

### AUD-33 — LEKTA-SEC-05 JOS OTVOREN: pet autentificiranih Edge funkcija i dalje vraca Access-Control-Allow-Origin: * umjesto allowlist helpera.

- Severity (finder -> konacni): Medium -> **Low** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-05
- Lokacija: `supabase/functions/integrity-check/index.ts:31`
- Dokaz: `'Access-Control-Allow-Origin': '*'` u integrity-check:31, create-checkout:22, generate-report:32, file-guarantee-claim:14, redeem-referral-signup:22. Samo preflight-start, preflight-result i faculty-request koriste `corsHeadersFor` iz _shared/cors.ts (allowlist + Vary: Origin).
- Preporuka: Prebaciti svih pet funkcija na `corsHeadersFor` iz _shared/cors.ts s eksplicitnom produkcijskom domenom i localhostom, dodati `Vary: Origin` i test po funkciji.
- Verifikacija: Duplikat AUD-24 (LEKTA-SEC-05). Grep potvrdjuje ACAO '*' u svih 5 funkcija; samo preflight-start/-result/faculty-request koriste corsHeadersFor. Kao i AUD-24, bearer-JWT (ne ambient) cini ovo nekonzistentnoscu otvrdnjavanja a ne izravnom ranjivoscu -> Low.

### AUD-34 — LEKTA-SEC-03 DJELOMICNO SANIRAN: busy-provjera je premjestena prije bufferiranja tijela, ali timeout i dalje ne ubija radnu dretvu (CPU rad se nastavlja nakon oslobadanja semafora).

- Severity (finder -> konacni): Medium -> **Low** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-03
- Lokacija: `lekta-pipeline/lekta_pipeline/server/app.py:164`
- Dokaz: Mitigacija prisutna: `if _semaphore.locked(): 429 busy` PRIJE citanja tijela (:124-133) + streaming cap. Preostaje otvoreno: `outcome = await asyncio.wait_for(asyncio.to_thread(_process_blocking, job_id, blob, request_id), timeout=_cfg.request_deadline_s)` (:163-165) s `except asyncio.TimeoutError` (:166) samo oznaci error, ali `asyncio.to_thread` dretvu ne moze prekinuti, pa se CPU rad nastavlja i drzi resurse nakon isteka.
- Reprodukcija: Poslati ulaz cija analiza traje dulje od request_deadline_s: klijent dobije timeout/mark_error, no _process_blocking dretva nastavlja trositi CPU nakon sto je semafor otpusten.
- Preporuka: Pokretati analizu u ubojivom subprocesu (ProcessPoolExecutor + terminate) tako da timeout stvarno oslobodi CPU; zadrzati busy-precheck iz :124-133.
- Verifikacija: server/app.py: busy-provjera _semaphore.locked() -> 429 je PRIJE bufferiranja tijela (:133-135), mitigacija prisutna. Ostaje otvoreno: :163-165 asyncio.wait_for(asyncio.to_thread(_process_blocking,...), timeout) + except TimeoutError (:166) samo mark_error; to_thread dretva se ne moze prekinuti pa CPU rad traje dalje. Uz max_concurrency=1 (config.py:33) runaway dretva drzi jedini slot -> sljedeci dobivaju 429. Potvrdjeno, ograniceno, Low tocan.

### AUD-35 — LEKTA-SEC-06 JOS OTVOREN: create-checkout nema server-side rate limit ni idempotency prije kreiranja Lemon Squeezy checkouta i consent reda.

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-06
- Lokacija: `supabase/functions/create-checkout/index.ts:95`
- Dokaz: Nakon JWT i citanja cijene iz `products`, funkcija bez ikakve kvote/idempotency kljuca umece `checkout_consents` (:95-104) i poziva `POST https://api.lemonsqueezy.com/v1/checkouts` (:115-123). Nema per-user/IP limita ni po-proizvod idempotency kljuca.
- Reprodukcija: Prijavljeni bot u petlji salje POST {productId, consent}; svaki poziv stvara novi checkout_consents red i novu LS checkout sesiju.
- Preporuka: Atomski limit po korisniku i IP-u, kratki idempotency kljuc po proizvodu i alert za stopu kreiranja checkouta.
- Verifikacija: Duplikat AUD-23 (LEKTA-SEC-06). create-checkout/index.ts:95-104 (checkout_consents insert) + :115-123 (LS checkout) bez per-user/IP kvote ni idempotency kljuca. Potvrdjeno, Low (isto obrazlozenje kao AUD-23).

### AUD-36 — LEKTA-SEC-07 JOS OTVOREN: CI radi samo npm audit, bez secret scanninga; sad relevantnije jer necommitani dev fajlovi nose HMAC placeholder.

- Severity (finder -> konacni): Low -> **Low** | Verdikt: **CONFIRMED** | Veza: LEKTA-SEC-07
- Lokacija: `.github/workflows/security-audit.yml:28`
- Dokaz: Jedini korak je `run: npm audit --omit=dev --audit-level=high` (:28). grep za gitleaks/trufflehog/detect-secrets/secret-scan u .github/ ne vraca nista. Nema CodeQL/Semgrep pravila za service-role/CORS ni deployment smoke testa za CSP/RLS/cron.
- Preporuka: Dodati gitleaks ili GitHub secret scanning (uhvatio bi HMAC placeholder iz _preflight_shim.mts), plus staticka pravila za service-role/CORS i deployment smoke test za CSP/RLS/cron.
- Verifikacija: .github/workflows/security-audit.yml jedini korak je 'npm audit --omit=dev --audit-level=high' (:31); nema gitleaks/trufflehog/detect-secrets ni CodeQL/Semgrep. Potvrdjeno. Low: relevantnije uz necommitane dev fajlove (AUD-32), ali sam po sebi propust pokrivenosti, ne ranjivost.

### AUD-37 — NOVO SANIRAN: m4_corpus/CORPUS_* forenzicki kodovi ispravno klasificirani i skriveni od studentske razine, bez curenja (uz minorni jaz u dev E2E asertacijama).

- Severity (finder -> konacni): Info -> **Info** | Verdikt: **CONFIRMED**
- Lokacija: `src/preflight/tier-filter.ts:84`
- Dokaz: CORPUS_FULLTEXT_MATCH/TITLE_MATCH/NO_INDEX/NOT_CHECKED/SUMMARY/OK_CORPUS su u FORENSIC_CODES (:84-85), `m4_corpus` je u STUDENT_HIDDEN_MODULES (:90-92) i nijedan CORPUS kod nije u STUDENT_VISIBLE_CODES. filterReportForTier za studenta preskace skrivene module (:155) i dodatno filtrira po allowlisti koda (:157), a recountSeverities racuna nad vec filtriranim modulima (:182): dvostruka fail-closed obrana. Drift test (codes.json m4_corpus popis) prisiljava klasifikaciju. Minorno: _preflight_e2e.mts:59 leakedModules provjerava samo m1_rsid/m3_websim (izostavlja m4_corpus), a :72 blob-provjera trazi 'RSID' a ne 'CORPUS'.
- Preporuka: Runtime ne treba mijenjati; opcionalno prosiriti asertacije u _preflight_e2e.mts da ukljuce m4_corpus i 'CORPUS' string radi buducih regresija.
- Verifikacija: Potvrdjena ispravna klasifikacija: CORPUS_* kodovi u FORENSIC_CODES (tier-filter.ts:84-85), m4_corpus u STUDENT_HIDDEN_MODULES (:90-92), nijedan CORPUS kod u STUDENT_VISIBLE_CODES; filterReportForTier preskace skrivene module (:155) + allowlista koda (:157), recountSeverities nad filtriranim (:182). Dvostruka fail-closed obrana. Minorni jaz u _preflight_e2e.mts stvaran (:59 leakedModules izostavlja m4_corpus, :72 blob trazi 'RSID' ne 'CORPUS') ALI :58 leakedForensic ipak lovi CORPUS kodove jer su u FORENSIC_CODES, pa je i dev E2E pokriven na razini koda. Nema curenja. Info.

