# Sigurnosni audit Lekta

Datum: 14. srpnja 2026.

> Dvije datoteke istog imena (razrješenje dvosmislenosti): ovo je noviji i širi sigurnosni
> audit (14.7.2026, shema nalaza LEKTA-SEC-01 do 07) i predstavlja aktualni izvor istine.
> Zamjenjuje raniji [docs/audit/SECURITY_AUDIT.md](docs/audit/SECURITY_AUDIT.md) (10.7.2026,
> shema security-01 do 06), koji ostaje kao povijesni zapis; njegovi su nalazi ovdje uglavnom
> obuhvaćeni (npr. send-reminders, preširok CORS, HSTS, IP salt).

Opseg: pregled trenutačnog radnog stabla, Supabase migracija i Edge funkcija, lokalnog preflight servisa, Netlify konfiguracije, GitHub Actionsa te nedestruktivno čitanje HTTP zaglavlja `https://lektahr.netlify.app/`. Nisu slani dokumenti, stvarani računi ni mijenjani produkcijski podaci. Konfiguracija Supabase, Netlify i payment dashboarda nije dostupna iz repozitorija, stoga se takve tvrdnje ne označavaju kao potvrđene.

## 1. Sažetak

Ukupna ocjena: **58/100**.

Spremnost: **NO-GO** za uključivanje poslužiteljske obrade cijelih radova, cloud integritetske provjere i plaćanja. Trenutačna javna, lokalna analiza može ostati dostupna kao `CONDITIONAL GO` ako produkcijski build stvarno zadržava isključene server endpointove i ručnu obradu.

| Critical | High | Medium | Low | Informational |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 2 | 3 | 2 | 4 |

Pet najvećih rizika:

1. Cloud integritetska provjera nema ograničenje za plaćeni način rada i može slati neograničen broj punih tekstova vanjskim providerima.
2. Brisanje preflight nalaza i teksta integritetske provjere ovisi o opcionalnom `pg_cron` poslu bez produkcijske provjere da je stvarno aktivan.
3. Preflight servis bufferira cijeli upload prije atomske potrošnje joba, a timeout ne prekida radnu dretvu.
4. Poslužiteljski DOCX parser koristi standardni `xml.etree.ElementTree` bez eksplicitne zabrane DTD-a i entiteta.
5. CORS je preširok na više autentificiranih Edge endpointa, premda osjetljive operacije dodatno provjeravaju JWT.

Najvažniji pozitivan nalaz: za monetizacijske retke postoje RLS politike samo za vlastiti `SELECT`, klijentsko pisanje je blokirano, a `generate-report`, `preflight-result` i `file-guarantee-claim` ponovno provjeravaju identitet i vlasništvo na serveru.

Prije prihvaćanja stvarnih dokumenata i plaćanja moraju biti završeni P0 zadaci iz [SECURITY_REMEDIATION_PLAN.md](SECURITY_REMEDIATION_PLAN.md).

## 2. Arhitektura i tokovi podataka

```text
Korisnik
  -> Vite preglednik i Web Worker
     -> lokalni OOXML parser, analiza, popravci i lokalni izvještaj
     -> Supabase Auth, OTP i lokalno spremljena sesija
     -> Supabase Edge: checkout, puni izvještaj, garancija, referral, podsjetnici
     -> Lemon Squeezy webhook
     -> opcionalno Preflight Edge -> HMAC propusnica -> Python servis -> Supabase
     -> opcionalno Integrity Edge -> embedding i AI provider
```

| Tok | Podaci | Okidač | Pohrana i pristup | Dokaz |
| --- | --- | --- | --- | --- |
| Lokalna analiza | cijeli DOCX, rezultat | korisnik odabere DOCX | memorija preglednika, lokalna povijest bez sadržaja | `src/ui/app.ts`, `src/analysis/*` |
| Puni izvještaj | naslov, autor, struktura i nalazi, ne datoteka | prijavljeni korisnik zatraži puni izvještaj | odgovor Edge funkcije, slotovi i log generacije u Supabaseu | `src/report/report-client.ts`, `generate-report/index.ts` |
| Preflight | cijeli DOCX, SHA-256, privola, rezultat s isječcima | prijavljeni korisnik s posebnom privolom | privremena datoteka na Python servisu, puni nalaz u Supabaseu sedam dana prema kodu | `preflight-*`, `lekta-pipeline/lekta_pipeline/server/*`, migracija `0019` |
| Integrity | puni tekst rada i privola | prijavljeni korisnik s posebnom privolom | Supabase `integrity_checks` sedam dana prema kodu, vanjski provider | `integrity-check/index.ts`, migracija `0018` |
| Plaćanje | product ID, user ID, pristanak | checkout | Lemon Squeezy, entitlement nakon potpisanog webhooka | `create-checkout`, `webhook-mor` |
| Ručna usluga | ime, e-mail, napomena i opcionalni DOCX | narudžba | Netlify forma ili konfigurirani endpoint, samo ako se aktivira | `src/ui/app.ts:80,770` |

Javni produkcijski HTML vraća restriktivan CSP, HSTS, `nosniff`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Permissions-Policy` i strogi referrer policy. U trenutnom izvornom defaultu su `enabled:false` te prazni endpointovi za checkout, puni izvještaj i preflight. To je dokaz za trenutno radno stablo, ne dokaz konfiguracije već objavljenog JavaScript bundlea ili dashboarda.

## 3. Threat model

Imovina: akademski dokumenti i isječci, tekst integritetske provjere, identitet i e-mail, JWT i refresh tokeni, entitlementi, slotovi, narudžbe, webhook tajne, HMAC propusnice, konfiguracije fakulteta i izmijenjeni DOCX.

Granice povjerenja: preglednik prema Supabaseu, Edge prema service-role bazi, Edge prema Lemon Squeezyju, preglednik prema preflight servisu, preflight servis prema Supabaseu i bibliografskim API-jima, te Edge prema embedding i AI provideru.

| Scenarij | STRIDE | Kontrola | Ocjena |
| --- | --- | --- | --- |
| Drugi korisnik pogađa tuđi preflight job | Spoofing, information disclosure | JWT i `user_id` uvjet u `preflight-result` | potvrđeno dobro |
| Klijent sam dodjeljuje entitlement | Tampering, elevation | RLS bez write politika, webhook potpis, server odluka | potvrđeno dobro |
| Bot troši vanjski integrity API | Denial of service, economic abuse | samo teaser ima dnevni cap | potvrđen nedostatak |
| Zlonamjerni DOCX ruši parser | Denial of service | veličina, ZIP i concurrency guard, ali DTD nije zabranjen | djelomično |
| XSS krade lokalno spremljenu sesiju | Information disclosure | CSP i escape, ali refresh token je u localStorageu | preostali rizik |

## 4. Tablica nalaza

| ID | Naziv | Severity | CVSS | Confidence | Komponenta | OWASP/ASVS |
| -- | ----- | ---: | ---: | --- | --- | --- |
| LEKTA-SEC-01 | Neograničena plaćena integrity obrada | High | 7.5, AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:H | Confirmed | `integrity-check` | API4, ASVS 4.3, 11.1 |
| LEKTA-SEC-02 | Retencija osjetljivog sadržaja nije dokazivo aktivna | High | 7.1, AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N | High | `0018`, `0019`, Supabase cron | ASVS 8.3, 16.2 |
| LEKTA-SEC-03 | Preflight upload može prekoračiti računski i memorijski budžet | Medium | 6.5, AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H | High | Python preflight servis | ASVS 5.2, 12.4 |
| LEKTA-SEC-04 | XML parser nema eksplicitnu obranu od DTD i entity napada | Medium | 6.0, AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H | High | `docx_loader.py` | ASVS 5.2, OWASP A05 |
| LEKTA-SEC-05 | Preširok CORS na autentificiranim funkcijama | Medium | 4.3, AV:N/AC:L/PR:L/UI:R/S:U/C:L/I:N/A:N | Confirmed | više Edge funkcija | ASVS 14.5 |
| LEKTA-SEC-06 | Checkout nema server-side rate limit | Low | 3.7, AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:L | Confirmed | `create-checkout` | API4, ASVS 11.1 |
| LEKTA-SEC-07 | CI nema secret scanning ni provjeru produkcijskog hardeninga | Low | 3.1, AV:N/AC:H/PR:H/UI:N/S:U/C:L/I:N/A:N | High | GitHub Actions | ASVS 1.7, 14.2 |

## 5. Detalji nalaza

### LEKTA-SEC-01: Neograničena plaćena integrity obrada

`supabase/functions/integrity-check/index.ts:119-128` limitira samo `mode === 'teaser'`. Za `full` način provjerava se samo postoji li bilo koji aktivni entitlement, nakon čega se paralelno šalje do 300 KB teksta embedding i AI provideru (`:132-136`). Nema per-user, per-IP, globalnog, vremenskog ni idempotency ograničenja za puni način.

Napadač s jednim valjanim plaćenim računom može ponavljati zahtjeve i stvarati trošak, zagušenje te nepotrebno slanje osjetljivih tekstova trećim stranama. Sigurna reprodukcija u stagingu: koristiti testni entitlement i testni provider, poslati dva identična full zahtjeva te potvrditi da oba odlaze provideru i stvaraju dva retka.

Popravak: atomski quota zapis u bazi, per-user i per-IP limit, hash/dedup teksta, globalni concurrency queue, `AbortSignal.timeout`, maksimalna veličina odgovora i alerti za anomalije. Složenost M.

### LEKTA-SEC-02: Retencija osjetljivog sadržaja nije dokazivo aktivna

Migracije `supabase/migrations/0018_integrity.sql:53-83` i `0019_preflight.sql:84-141` stvaraju purge funkcije, ali zakazivanje radi samo ako `pg_cron` postoji tijekom izvršavanja migracije. Nema health checka, deployment assertiona ni testa koji dokazuje da su cron poslovi aktivni u produkciji. Kod zato obećava sedam dana, ali ne može dokazati brisanje `sent_text` ili `preflight_results_full`.

Ako cron nije aktivan, sirovi tekst i isječci ostaju dulje od javno deklariranog roka. Sigurna potvrda: u stagingu unijeti canary sadržaj, postaviti kratku retenciju, provjeriti `cron.job`, izvršenje purge funkcije i da se sadržaj nulira odnosno briše.

Popravak: deployment migracija mora failati ako cron nije konfiguriran, dodati dnevni kontrolni job i alert, te mjeriti najstariji sadržajni red. Složenost M.

### LEKTA-SEC-03: Preflight upload može prekoračiti računski i memorijski budžet

`lekta-pipeline/lekta_pipeline/server/app.py:113-133` učitava cijelo tijelo do 30 MB u memoriju prije `claim_job`. Provjera `_semaphore.locked()` nije atomsko zauzimanje, pa više ponovljenih zahtjeva s istom valjanom propusnicom može proći prije nego prvi zauzme semafor. Nadalje, `asyncio.wait_for(asyncio.to_thread(...))` na `:147-151` vraća timeout, ali ne ubija već pokrenutu dretvu i CPU rad može nastaviti nakon oslobađanja semafora.

Ograničenja HMAC propusnice, veličine i jedan aktivni job po korisniku smanjuju doseg, ali ne uklanjaju lokalni DoS od legitimnog ili kompromitiranog korisnika. Popravak: streaming na ograničeni disk ili reverse proxy limit, atomsko rezerviranje kapaciteta prije čitanja tijela, procesni worker koji se može ubiti na timeout i WAF/rate limit. Složenost L.

### LEKTA-SEC-04: XML parser nema eksplicitnu obranu od DTD i entity napada

`lekta-pipeline/lekta_pipeline/docx_loader.py:115,146,166,182,197,205,214` koristi `xml.etree.ElementTree.fromstring`. ZIP guard ograničava broj stavki i veličine, ali `lekta-pipeline/lekta_pipeline/server/guard.py` ne odbija `DOCTYPE` niti koristi `defusedxml`. To ostavlja parser ovisnim o verziji Expat zaštita i ne zadovoljava eksplicitnu obranu od XML entiteta.

Popravak: prije parsiranja odbiti `<!DOCTYPE` i `<!ENTITY` u svim čitanim XML dijelovima, koristiti `defusedxml.ElementTree`, dodati regresijske testove s internim entitetima i jasnu granicu vremena. Složenost S.

### LEKTA-SEC-05: Preširok CORS na autentificiranim funkcijama

`create-checkout`, `generate-report`, `integrity-check`, `file-guarantee-claim` i `redeem-referral-signup` vraćaju `Access-Control-Allow-Origin: *`. Preflight i faculty-request već koriste allowlist helper. Bearer token se ne šalje automatski kao kolačić, pa ovo samo po sebi ne daje drugoj stranici korisnikovu sesiju. Ipak, nepotrebno povećava posljedice ukradenog tokena i krši princip minimalnog izlaganja.

Popravak: koristiti zajednički `corsHeadersFor`, explicitno navesti produkcijsku domenu i nužni localhost, dodati `Vary: Origin` i testove za svaku funkciju. Složenost S.

### LEKTA-SEC-06: Checkout nema server-side rate limit

`supabase/functions/create-checkout/index.ts` zahtijeva JWT i cijenu čita iz `products`, što sprječava manipulaciju cijenom. No nema quota ili idempotency ključ prije stvaranja Lemon Squeezy checkouta. To omogućuje registriranom botu stvaranje velikog broja checkout sesija i consent redaka.

Popravak: atomski limit po korisniku i IP-u, kratki idempotency ključ po proizvodu i alert za stopu kreiranja checkouta. Složenost S.

### LEKTA-SEC-07: CI nema secret scanning ni provjeru produkcijskog hardeninga

`.github/workflows/security-audit.yml` radi samo `npm audit --omit=dev --audit-level=high`. Lokalni pregled nije pronašao očit service-role, webhook ili privatni ključ u trenutačnom stablu, ali to nije zamjena za povijesni secret scanner. `npm audit` nije dovršen u ovom okruženju zbog mrežnog timeouta.

Popravak: dodati gitleaks ili GitHub secret scanning, CodeQL/Semgrep pravila za service-role i CORS, te deployment smoke test za CSP, RLS i cron. Složenost S.

## 6. Potvrđene zaštite

- Produkcijska početna stranica ima CSP bez `unsafe-inline` za skripte, HSTS, `nosniff`, zabranu uokviravanja i restriktivnu Permissions-Policy.
- `vite.config.ts` izbacuje internu `verification.html` konzolu i dev-only UI iz sigurnog builda te build pada ako konzola procuri.
- RLS na entitlementima, slotovima, report generacijama, integrity i preflight tablicama ograničava klijentsko čitanje na vlastite retke, a pisanje ide preko service role funkcija.
- `generate-report` računa fingerprint server-side, troši slot atomskom RPC funkcijom i ne vjeruje klijentskoj cijeni ili entitlementu.
- `webhook-mor` provjerava HMAC nad sirovim tijelom te koristi jedinstveni `(provider, order_id)` za idempotenciju.
- Preflight ima JWT gate, posebnu privolu, HMAC propusnicu s rokom, jednokratni DB flip, ograničenje veličine i ZIP guard.

## 7. Privatnosne tvrdnje nasuprot implementaciji

| Javna tvrdnja | Stvarno ponašanje | Status | Dokaz | Potrebna promjena |
| --- | --- | --- | --- | --- |
| Automatska analiza ostaje lokalna | Lokalni DOCX put ne šalje datoteku; puni izvještaj šalje izvedene podatke | POTVRĐENO | `src/analysis`, `report-client` | mrežni canary test u CI-ju |
| Preflight šalje datoteku samo uz privolu | klijent i Edge zahtijevaju `sendsFullFile === true` | POTVRĐENO | `preflight-consent`, `preflight-start` | zadržati regresijski test |
| Datoteka se briše odmah | Python koristi tmp direktorij i `rmtree` u `finally` | DJELOMIČNO POTVRĐENO | `server/app.py` | dokazati Cloud Run disk lifecycle i backup politiku |
| Isječci i puni tekst brišu se nakon sedam dana | purge SQL postoji, aktivnost crona nije dokazana | NIJE MOGUĆE POTVRDITI | migracije `0018`, `0019` | P0 cron dokaz i monitoring |
| IP je hashiran | salt se koristi ili izvodi iz service-role ključa | POTVRĐENO | `_shared/hash-ip.ts` | postaviti zaseban `IP_HASH_SALT` i dokumentirati rotaciju |
| Analitika ide tek uz privolu | klijent ima consent gate, ali produkcijski endpoint nije provjeren | DJELOMIČNO POTVRĐENO | `src/ui/app.ts` | provjeriti Netlify i browser mrežni trag |

## 8. Prioriteti i konačna odluka

- P0: LEKTA-SEC-01, LEKTA-SEC-02.
- P1: LEKTA-SEC-03, LEKTA-SEC-04.
- P2: LEKTA-SEC-05, LEKTA-SEC-06.
- P3: LEKTA-SEC-07 i dodatni monitoring.

Konačna odluka:

- Registracija: **nije moguće potvrditi** dok se ne provjere produkcijski Supabase Auth rate limit, CAPTCHA, redirect URL i SMTP postavke.
- Plaćanje: **nije sigurno uključiti** prije P0 i P2 mjera.
- Cijeli akademski dokumenti: **nije sigurno uključiti** prije P0 i P1 mjera.
- Ručna obrada: **nije moguće potvrditi** bez pregleda stvarnog endpointa, retentiona i pristupa osoblja.
- Privatnosne tvrdnje: lokalna obrada je uglavnom tehnički potkrijepljena, ali lifecycle brisanja nije dokaziv.

Tri uvjeta za `GO`: atomski i nadziran quota za integrity i checkout, dokaziv cron lifecycle brisanja u produkciji, te hardened preflight servis s defused XML parserom i stvarnim resource limitima.
