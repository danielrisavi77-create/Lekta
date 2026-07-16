# Remediation log (16.7.2026, ista sesija)

Popravljene 4 stavke iz audita. Gate `npm run check` zelen (131 test datoteka, 1736 testova), golden suite netaknut.

## AUD-17 (High) — kolizija numeracije migracija 0008/0009

Prije popravka provjereno kroz Supabase konektor: produkcijski Lekta projekt (`zrrjttizjyfcxmcpgzml`) ima samo 5 migracija, sve s timestamp-verzijama (`20260709…`, waitlist + rokovi), i **nijednu** numeriranu `0001-0019` datoteku. Kolizija dakle jos nije udarila u produkciju (numerirani set nikad nije `db push`-an na taj projekt), pa nije bila potrebna nikakva rucna intervencija na `schema_migrations`.

Popravak (minimalan, bez kaskadnog pomaka 0010-0019 koji bi razbio desetke doc-referenci):
- `0009_set_product_price.sql` -> `0020_set_product_price.sql` (funkcija bez apply-time ovisnosti; poziva se tek runtime).
- `0008_checkout_consent.sql` -> `0021_checkout_consent.sql` (tablica bez apply-time ovisnosti).
- Zadrzani `0008_analytics_views` i `0009_log_retention` (potonji cuva ovisnost `0015_revoke_purge` i sve postojece doc-reference na 0009).
- Provenance komentar u oba preimenovana fajla.
- Doc-reference azurirane: `supabase/README.md`, `supabase/ACCEPTANCE.md`, `supabase/migrations/0010_do_obrane_sku.sql`, `docs/audit/DATA_FLOW.md`.
- Novi guard-test `tests/migration-numbering.test.ts`: rusi build na svakoj buducoj koliziji numerickih prefiksa i cuva poredak log_retention < revoke_purge.

Rezultat: 21 jedinstven prefiks 0001-0021, bez rupa, bez kaskade.

## AUD-01 (Medium) — prored exact/atLeast lazno pada

`src/docx/parser.ts` (readPPr): samo `lineRule='auto'` kodira prored kao visekratnik (240-tine). `exact`/`atLeast` su apsolutne tocke i vise se NE tumace kao omjer (prije: `v/20` pa usporedba s 1.5 -> tvrdi pad). Sada vracaju `line=null` ("prored nije pouzdano ocitljiv"), pa provjera ne kaznjava vizualno ispravan dokument.

## AUD-04 (Medium) — tema-fontovi (Calibri) davali lazni prolaz

`src/docx/parser.ts` (readRPr) sada biljezi `fontTheme` kad nema eksplicitnog `w:ascii` (samo `w:asciiTheme`). Nova `parseThemeFonts` razrjesava minor/major latin typeface iz `word/theme/theme1.xml`. `src/analysis/analyze-docx.ts` ucitava temu i razrjesava font u tijelu i fusnotama, pa dokument u zadanoj temi (Calibri) sada ispravno pada na provjeri fonta umjesto da prolazi s punim bodovima. Fallback: bez teme ponasanje ostaje kao prije.

## AUD-09 (Medium) — narativne citatnice s dijakritikom nevidljive

`src/citations/author-year.ts`: vodeci ASCII `\b` u narativnom regexu zamijenjen Unicode-svjesnom granicom `(?<![\p{L}\p{N}])`, pa se prezimena na C/C/S/Z/Dj (Covic, Simic, Zagar) prepoznaju. Parentetski oblik i ASCII prezimena rade i dalje (bez regresije).

Testovi: `tests/engine-correctness.test.ts` (10 testova) pokriva sva tri engine popravka; svaki bi pao na kodu prije izmjene.

## AUD-38 (High) — OOM DoS zaobilazi zip-guard preko footnotes/endnotes

`lekta-pipeline/lekta_pipeline/server/guard.py`: `WATCHED` (dijelovi koji ulaze u agregatni memorijski cap) nije ukljucivao `word/footnotes.xml` ni `word/endnotes.xml`, iako ih `docx_loader.load` cita CIJELE u ElementTree (10-20x velicine XML-a). Napuhan footnotes.xml s omjerom ispod `SUSPICIOUS_RATIO` (120) tako je prolazio guard i rusio loader OOM-om. Popravak: dodani footnotes/endnotes u `WATCHED` (sada u lockstepu s loaderom). Test: `test_watched_includes_footnotes_endnotes` (odbija 5 MB footnotes/endnotes pri capu 3 MB).

## AUD-31 / AUD-39 (SEC-04) — XML parser bez obrane od DTD/ENTITY

`lekta-pipeline/lekta_pipeline/docx_loader.py`: svih 7 `ET.fromstring` poziva nad nepovjerljivim dijelovima zamijenjeno novom `_xml_root`, koja odbija `<!DOCTYPE`/`<!ENTITY` u prologu prije parsiranja (`DocxParseError`). Sprjecava XXE i billion-laughs entity expansion neovisno o verziji sistemskog libexpata. Word nikad ne pise DTD pa nema lazno pozitivnih. Test: `tests/test_loader_security.py` (odbija DTD u document.xml i footnotes.xml, cist docx se i dalje ucita).

## AUD-46 (Medium) — passWithNoTests tiho propusta 0-kolekciju

`vitest.config.ts`: `passWithNoTests` prebacen s `true` na eksplicitni `false` uz obrazlozenje. Gate `npm run check` sada pada ako se ne kolektira nijedan test (toolchain regresija ili lose rjesavanje globa) umjesto da laze zeleno.

## Verifikacija drugog batcha

- lekta-pipeline `python -m pytest`: 135 prošlo (+4 nova testa), nula regresija (izmjena `_xml_root` dira sve module).
- Glavni repo `npm run check`: 131 test datoteka, 1736 testova, build ok, exit 0.

## Treci batch — D1 (klijentska analiza/parser robustnost)

- AUD-02 (Medium): `analyze-docx-client.ts` prati je li analiza VEC ZAPOCELA (prvi progress od workera). Pad workera NAKON pocetka sad se tretira kao greska analize (bez inline retryja koji bi zamrznuo karticu); samo pad prije prvog progressa ide na inline fallback.
- AUD-03 (Low): `memory-budget.ts` `decompressionBudgetBytes` prima opts `{deviceMemory, coarsePointer}` i steze budzet na 150 MB za coarse-pointer uredaje bez `deviceMemory` (iOS Safari, Firefox); `app.ts` uskladen. Test prosiren.
- AUD-05 (Low): `analyze-docx.ts` procjenjuje broj odlomaka (`<w:p` skenom) PRIJE `parseXml`, pa patoloski XML pada prije gradnje DOM-a (ne samo poslije).
- AUD-06 (Low): `parser.ts` `headingLevel` mapira outline 0-8 na razine 1-9; outline 9 ("Body Text") vise nije naslov razine 10.
- AUD-07 (Low): `analyze-docx.ts` nedostajuci atributi margina/velicine stranice postaju `null` (ne 0 preko `Number(null)`); margin i paper-size provjere preskacu `null` umjesto laznog odstupanja.
- AUD-08 (Info): dokumentirana prihvacena razlika parsera na inline fallbacku (nativni DOMParser vs xmldom), bez rizicnog globalnog override-a.
- Testovi: `tests/engine-correctness.test.ts` (+AUD-06), `tests/memory-budget.test.ts` (+AUD-03). Golden netaknut.

## Cetvrti batch — D2 (citati/legal engine)

- AUD-10 (Low): `parse-reference.ts` `firstSentence` skenira samo prvih 4000 znakova (lijeni `*?` je O(n^2) na ulazu bez terminatora), pa dugacka zalijepljena referenca vise ne zamrzava preglednik (self-DoS); preko toga linearni fallback.
- AUD-11 (Low): `legal-citation.ts` preskace rimske brojeve (`/^[ivxlcdm]+$/`) i ceste ne-pravne akronime (OECD, ISBN, ISSN, DOI, ECLI, COM, UN, ISO...) pri detekciji "neuvedenih kratica"; stvarne kratice (ZOO) i dalje se oznacavaju.
- Testovi: `tests/engine-correctness.test.ts` (+AUD-10 no-hang, +AUD-11 false-positive i regresija). Golden netaknut.

## Peti batch — D4 (UI demo player, a11y)

- AUD-14 (Low): `korektorski.ts` po zavrsetku reprodukcije skriva kontrolnu traku (`ctrl.hidden=true`), pa fokus vise ne zapinje na nevidljivim gumbima iza zavrsnog overlaya (WCAG 2.4.7); replay je vraca preko 'play'.
- AUD-15 (Low): `index.html` + `korektorski.ts` dodaju `aria-checked` na `menuitemradio` stavke izbornika brzine/kvalitete i azuriraju ga uz klasu `on`, pa citac ekrana zna koja je stavka odabrana.
- Verifikacija: `npm run check` 131 dat./1743 testa, csp-hash zelen, build ok.

## Nedirnuto namjerno (uz obrazlozenje)

- AUD-12 (demo asseti untracked), AUD-13 (javni anon kljuc), AUD-16 (teaser prezentacijski), AUD-37 (m4_corpus vec dobro skriven): commit-higijena ili by-design, bez potrebe za izmjenom koda.
- AUD-21, AUD-51: REJECTED u verifikaciji.

## Sesti batch — paralelni subagenti (D5, D6, D8, D9, D10, D12)

Pet subagenata istovremeno, disjunktni skupovi datoteka (bez kolizije pisanja). Integrirani gate na kraju zelen: `npm run check` exit 0, `python -m pytest` 152 passed.

### D5 migracije/RLS (supabase/migrations/**)
- AUD-18 (Medium, SEC-02): `0018_integrity.sql` retencijski pg_cron blok pretvoren u fail-closed (`raise exception` ako pg_cron ekstenzija nedostaje), pa izostanak purge-a osjetljivog teksta ruši migraciju glasno umjesto tihog zelenog prolaza. Idempotentno.
- AUD-19 (Medium, SEC-02): `0019_preflight.sql` dobio `BEFORE INSERT` trigger `preflight_checks_expire_stale` koji sinkrono oslobađa partial-unique slot za jobove starije od 1 h, neovisno o cronu (trajni lock uklonjen). Prag ne ide u indeks jer `now()` nije IMMUTABLE. Isti fail-closed cron obrazac primijenjen i ovdje.
- AUD-20 (Low): `0002_products_catalog.sql` `products_select_active` suzen s `active = true` na `active = true and audience = 'retail'`, pa anon više ne vidi partnerske veleprodajne cijene ni `mor_product_id`.

### D6 Edge funkcije (supabase/functions/**)
- AUD-24/33 (SEC-05): pet JWT funkcija (integrity-check, generate-report, create-checkout, file-guarantee-claim, redeem-referral-signup) zamijenilo `Access-Control-Allow-Origin: '*'` allowlist helperom `corsHeadersFor` iz `_shared/cors.ts` (+`Vary: Origin`), kao faculty-request/preflight.
- AUD-22/29 (SEC-01): integrity-check 'full' dobio per-korisnik dnevni cap, idempotency hash (dedup 24 h bez ponovnog plaćenog poziva) i `AbortSignal.timeout` na oba provider fetcha.
- AUD-23/35 (SEC-06): create-checkout per-korisnik dnevni cap prije LS poziva i consent upisa.
- AUD-26: create-checkout više ne curi sirovo tijelo greške providera (server-side log, klijentu generička poruka).
- AUD-25: `_shared/reminder-token.ts` dobio `exp` (istek, default 90 dana) i konstantno-vremenski `timingSafeEqual`.
- AUD-28: webhook-mor dobio top-level try/catch + zaseban try/catch oko post-entitlement bonusa (kupon/referral), pa transient pad ne preskoči trajno idempotentni napredak.
- AUD-27: SKIPPED kao cross-cutting; pravi atomični per-IP cap traži SECURITY DEFINER SQL fn + `pg_advisory_xact_lock`, izvan supabase/functions/**.
- Novi env varovi sa sigurnim defaultima: `ALLOWED_ORIGIN`, `INTEGRITY_FULL_DAILY_CAP=20`, `INTEGRITY_PROVIDER_TIMEOUT_MS=10000`, `CHECKOUT_DAILY_CAP=20`.

### D8 Python (lekta-pipeline/**)
- AUD-40 (Low): `corpus/harvest.py` `_resolves_public` sada fail-CLOSED (getaddrinfo OSError/prazna rezolucija -> odbij). Rezidualni DNS-rebinding TOCTOU dokumentiran; potpuno zatvaranje traži DNS-IP pin u `net.py` (needs-decision).
- AUD-41 (Low): `server/config.py` `from_env` nameće `max_concurrency=1` osim uz `LEKTA_ALLOW_MULTI_CONCURRENCY=1`; OOM zaštita više se ne oslanja tiho na deploy concurrency.
- AUD-34 (Low, SEC-03): `server/app.py` timeout sada DRŽI semafor slot dok napuštena dretva stvarno ne završi (`asyncio.shield` + pozadinski release), pa se ne pokreće druga analiza paralelno. Rezidual: CPU rad napuštene dretve i dalje neprekidiv (traži ProcessPool, needs-decision).
- 6 novih pytest testova (SSRF fail-closed, concurrency guard, timeout drži slot).

### D9/D10 higijena, CI, data
- AUD-42 (SEC-06): `.gitignore` vraćen ignore za `training-pipeline/output|sources`, `*.sqlite*`, + dodana `*.db`/`-shm`/`-wal` mreža.
- AUD-32 (SEC-07): `.gitignore` += `_preflight_*.mts`, `vite.dev-preflight.config.mts` (dev fajlovi s HMAC placeholderom više ne mogu u commit).
- AUD-44 (Low): `data/manifest.json` VERIFICATION_LEDGER 2736 -> 3119 (stvarni broj); dodan guard `tests/ledger-consistency.test.ts` (prolazi).
- AUD-45 (Low): `.gitignore` += `data/sources/algebra/` (orfan sirovi PDF, po pravilu "PDF-ovi se ne commitaju").
- AUD-47 (SEC-07): `security-audit.yml` += gitleaks job (pinana binary, inline allowlist za javni anon ključ).
- AUD-48 (Low): `permissions: contents: read` na check/docx-smoke/security-audit workflow.
- AUD-49 (Low): check.yml Node matrica [20, 24]; ostali podignuti na 24.
- AUD-50 (Low): `tests/synthetic-golden.test.ts` docstring ispravljen (fusnote/Legal Citation Engine SU pokriveni); samo komentar, bez snapshot izmjene.
- AUD-53: needs-decision (demo videi referirani iz HTML-a, NE gitignorati; LFS/manji asseti su vlasnička odluka).

### D12 dokumentacija
- AUD-56 (Low): `CLAUDE.md` rekonstruiran iz dvostruko-kodiranog mojibakea u ispravan hrvatski UTF-8 (č/ć/đ/š/ž), em crtice -> zarez/dvotočka; sva pravila identična po značenju.
- AUD-62 (Low): `CLAUDE.md` app.ts red-broj ~517 -> ~771 (stvarno).
- AUD-58 (Low): dvije `SECURITY_AUDIT.md` uzajamno referencirane (korijenska 14.7. aktualna, docs/audit povijesna).
- AUD-59 (Low): `BOOTSTRAP.md` označen ZASTARJELO + upozorenje na destruktivnu `npm run bootstrap`.
- AUD-60 (Low): `docs/GOLDEN.md` ćirilični homoglifi `zatecено` -> `zateceno`.
- AUD-61 (Low): novi korijenski `README.md` (hrvatski, opis + pokretanje + upute na CLAUDE.md).
- AUD-63 (Low): launch/gate dokumenti unakrsno referencirani, LAUNCH_BLOCKERS označen kanonskim.
- AUD-64 (Info): `docs/LEKTA_BUILD_PIPELINE.md` K4/K5 status CEKA -> NEUSKLADENO uz opis implementiran-pa-revertiran lifecycle.
- AUD-55 (Info): `docs/audit/PERFORMANCE_AUDIT.md` performance-01 brojke ažurirane (split izveden, index ~489 KB / ~97 KB gzip).

### Cross-cutting za odluku (subagenti flagали, nisu izvršili)
- Isti fail-open pg_cron obrazac postoji i u `0009_log_retention`, `0011`, `0016` (ista SEC-02 klasa, nisu bili među imenovanim nalazima). Za dosljedan fail-closed proširiti guard ili se osloniti na from-scratch deploy cijelog numeriranog seta.
- Potpuni AUD-27/AUD-22-per-IP/AUD-28-idempotency traže migracijsku stranu (SECURITY DEFINER fn + advisory lock, `ip_hash` stupac, unique constraint), koordinirano s Edge izmjenama.
- AUD-40 rezidualni TOCTOU i AUD-34 pravi kill traže DNS-pin u `net.py` odnosno ProcessPool (arhitektonske preinake).

## Ukupno: 50 nalaza

Batch 1 (AUD-17, 01, 04, 09) + Batch 2 (AUD-38, 31/39, 46) + D1 (02,03,05,06,07,08) + D2 (10,11) + D4 (14,15) = 18.
Sesti batch (subagenti): D5 (18,19,20) + D6 (22,23,24,25,26,28,29,33,35) + D8 (34,40,41) + D9/D10 (32,42,44,45,47,48,49,50) + D12 (55,56,58,59,60,61,62,63,64) = 32.

Neizvrseno: AUD-27 (cross-cutting migracija), AUD-52 (skidanje devDeps, operativno/deploy rizik), AUD-54 (bundle guard, Info), AUD-53/12 (demo asseti, odluka), AUD-43/57 (ugnijezdeni repo, odluka), AUD-13/16 (by-design), AUD-37 (vec sanirano), AUD-21/51 (REJECTED). Gate: `npm run check` exit 0, `python -m pytest` 152 passed.
