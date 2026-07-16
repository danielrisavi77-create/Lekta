# Plan sigurnosne sanacije

## P0, prije produkcijske obrade i plaćanja

### SEC-P0-01: Atomska quota i zaštita Integrity API-ja

- Nalaz: LEKTA-SEC-01.
- Datoteke: `supabase/functions/integrity-check/index.ts`, nova migracija, `src/integrity/*`, testovi Edge funkcije.
- Promjena: atomski server-side quota po korisniku, IP-u i globalno za oba načina rada, deduplikacija hashiranog teksta, idempotency key, timeouti za provider i maksimalna veličina odgovora.
- Kriteriji prihvata: paralelni zahtjevi ne mogu prijeći limit, identičan zahtjev ne stvara novi provider poziv, nema teksta u logovima, alert se aktivira na prekoračenje.
- Test: dva paralelna zahtjeva s testnim entitlementom i fake providerom.
- Ovisnost: odluka o provideru i cijeni po provjeri.
- Opseg: M. Rizik regresije: srednji.

### SEC-P0-02: Dokaziv lifecycle brisanja

- Nalaz: LEKTA-SEC-02.
- Datoteke: nove Supabase migracije, deployment runbook, health/monitoring funkcija i testovi.
- Promjena: fail-closed provjera `pg_cron`, audit tablica zadnjeg purgea bez sadržaja, dnevni monitoring i alert; staging test za nuliranje `sent_text` i brisanje `preflight_results_full`.
- Kriteriji prihvata: produkcijski jobovi postoje, zadnji uspješan purge je svjež, canary nestaje nakon roka, incident se otvara ako job zakasni.
- Test: kratka staging retencija i kontrolirani canary.
- Ovisnost: Supabase dashboard i cron ovlasti.
- Opseg: M. Rizik regresije: nizak.

## P1, prije prihvata DOCX-a na serveru

### SEC-P1-01: Harden preflight resurse

- Nalaz: LEKTA-SEC-03.
- Datoteke: `lekta-pipeline/lekta_pipeline/server/app.py`, deploy konfiguracija, testovi servisa.
- Promjena: reverse-proxy request cap, rezervacija worker kapaciteta prije čitanja tijela, streaming prema ograničenom privremenom prostoru i proces koji se može stvarno zaustaviti na timeout.
- Kriteriji prihvata: ponovljeni upload iste propusnice ne alocira višestruke velike buffere, prekoračeni posao se prekida, metrika memorije ostaje unutar budžeta.
- Test: sintetički DOCX i kontrolirani spori worker u stagingu.
- Opseg: L. Rizik regresije: srednji.

### SEC-P1-02: Defused XML i prošireni DOCX guard

- Nalaz: LEKTA-SEC-04.
- Datoteke: `lekta-pipeline/lekta_pipeline/docx_loader.py`, `guard.py`, testovi.
- Promjena: `defusedxml`, zabrana DTD/entity deklaracija i limiti svih XML dijelova koje parser čita.
- Kriteriji prihvata: DTD, entity expansion, previše članova, napuhani XML i krivi MIME vraćaju kontrolirani kod bez CPU ili memorijskog skoka.
- Test: male sintetičke ZIP fixtura datoteke, bez stvarnih radova.
- Opseg: S. Rizik regresije: nizak.

## P2, prije šireg lansiranja

### SEC-P2-01: Ujednači CORS

- Nalaz: LEKTA-SEC-05.
- Datoteke: sve Edge funkcije s `Access-Control-Allow-Origin: *`, `_shared/cors.ts`, testovi.
- Promjena: allowlist produkcijske domene i nužnog localhosta za svaki browser endpoint.
- Kriteriji prihvata: dopušten origin radi, nedopušten ne dobiva svoj origin u odgovoru, `Vary: Origin` postoji.
- Opseg: S. Rizik regresije: nizak.

### SEC-P2-02: Checkout anti-abuse

- Nalaz: LEKTA-SEC-06.
- Datoteke: `create-checkout`, migracija i testovi.
- Promjena: atomski limit i idempotency po korisniku, proizvodu i kratkom vremenskom prozoru.
- Kriteriji prihvata: ponovljeni klik vraća postojeći checkout ili kontrolirani 429, cijena i entitlement ostaju serverski određeni.
- Opseg: S. Rizik regresije: nizak.

### SEC-P2-03: Produkcijska konfiguracijska provjera

- Datoteke: deployment runbook, GitHub Action ili zaštićeni admin check.
- Promjena: provjeriti Supabase Auth, RLS, Storage buckete, CORS, cron, Secrets, Netlify deploy environment i razdvojenost preview tajni.
- Kriteriji prihvata: potpisan pre-launch evidence paket bez tajni.
- Opseg: M. Rizik regresije: nizak.

## P3, trajni hardening

### SEC-P3-01: Security CI

- Nalaz: LEKTA-SEC-07.
- Dodati secret scan, SAST, pinned Actions po SHA gdje je operativno prihvatljivo, dependency SBOM i periodičan pregled ovlasti.
- Kriteriji prihvata: novi commit s privatnim ključem ili service-role vrijednošću blokira CI.

### SEC-P3-02: Session hardening

- Razmotriti BFF ili kratkotrajnu memorijsku sesiju umjesto refresh tokena u localStorageu kada se uključe plaćanje i osjetljivi server-side tokovi.
- Kriteriji prihvata: dokumentirana odluka, XSS model i logout/revocation test.
