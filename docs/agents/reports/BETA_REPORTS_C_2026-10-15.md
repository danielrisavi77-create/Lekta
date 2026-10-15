# Izvještaji C za beta pripremu

Presjek je napravljen 14. listopada 2026. Služi za pregled prije beta odluke; nije dokaz iscrpnog testiranja svake rute, svakog profila ili svakog uređaja.

## 1. Žive rute i slijepe ulice

Izravni GET na lekta.hr vratio je HTTP 200 za svih 20 pregledanih ruta:

| Skupina | Rute |
| --- | --- |
| Ulaz i rad | /, /rad/, /moji-radovi/ |
| Vodiči i alati | /saznaj-vise/, /alati, /citat, /kartice, /naslovnica, /literatura, /izjava |
| Katalog i pokrivenost | /fakulteti/, /pokrivenost, /fpzg/diplomski-rad/ |
| Pravni sadržaj | /privatnost, /uvjeti-koristenja, /obrada-dokumenata, /kolacici, /garancija, /pravila-povrata, /odricanje-od-odgovornosti |

Ponovljeni GET prolaz 14. listopada u 08:35:00 CEST (06:35:00 UTC) vratio je HTTP 200 za svih 20 ruta. Iz HTML-a je izdvojena 281 jedinstvena interna HTTP(S) adresa na lekta.hr i poddomenama; svih 281 vratilo je 2xx bez mrežne/HTTP pogreške. Preusmjeravanja nisu automatski praćena; bilo ih je 0. Pojedinačni statusi i popis ciljeva nalaze se u [BETA_LIVE_LINKS_2026-10-14.json](BETA_LIVE_LINKS_2026-10-14.json). Ovo pokriva samo poveznice u HTML-u tih 20 ruta: vanjske poveznice, kontrole koje se stvaraju tek JavaScriptom i neuzorkovane stranice nisu provjerene.

Tijekom ručnog prolaza kroz početnu i stranicu Saznaj više otvorene su povezane javne stranice; pregledani sadržaji imali su naslov, glavni naslov i tijelo. Na početnoj je plaćeni popravak vidljivo označen kao uskoro, a naplata kao neaktivna. U tom uzorku nije pronađena slijepa ulica.

Glavna stranica vraća canonical i og:url na https://lekta.hr/. Alati dostupni na putanjama bez nastavka .html vraćaju canonical na odgovarajuću .html adresu; to samo po sebi ne dokazuje HTTP 301 preusmjerenje. Za /saznaj-vise/, /rad/, /pokrivenost/, /moji-radovi/ i dio pravnih stranica og:url nije bio prisutan u HTML-u. To nije prekinuta korisnička poveznica, ali ostaje SEO stavka za pregled u zasebnom zadatku.

Ograničenja: nisu provjereni svi profili fakulteta, svaka vrsta rada, svaka vanjska poveznica, sva stanja prijave, svi modalni tokovi ni sve širine zaslona. URL-ovi /fakulteti/ i /pokrivenost/ sadržavaju tekst koji može aktivirati naivnu provjeru fraze “not found”; stvarni HTTP odgovor i glavni sadržaj bili su dostupni, pa taj tekst nije klasificiran kao 404.

## 2. Spremnost koda za captcha

Frontend ima Turnstile put za signup, e-mail OTP i prijavu lozinkom. Token se šalje u GoTrue obliku gotrue_meta_security.captcha_token. Testovi auth-captcha.test.ts pokrivaju tokove s tokenom i ponašanje bez ključa.

Klijent namjerno vraća bez tokena dok VITE_TURNSTILE_SITE_KEY nije postavljen. To je sigurno samo prije uključivanja captcha zaštite u Supabase Authu. Ponovljeni dohvat javnog `build-info.json` 14. listopada potvrdio je da produkcija i dalje koristi commit `f758ba2bde00c7f2d37daa789a39ed1e4168db99` i `captchaSiteKey=false`. Kodna integracija je spremna za konfiguraciju, ali produkcija nije spremna za uključivanje. Vlasnik najprije postavlja TURNSTILE_SITE_KEY u GitHub Actions production okruženju, objavljuje build, provjerava `captchaSiteKey=true` na javnom build-info.json, a tek zatim unosi Turnstile secret i uključuje zaštitu u Supabase Authu. Ne čitati ni zapisivati secret u ovom izvještaju.

Postupak i redoslijed: docs/deploy/AUTH_CAPTCHA.md i docs/deploy/TURNSTILE_T89.md. Službena [Supabase Auth CAPTCHA uputa](https://supabase.com/docs/guides/auth/auth-captcha) potvrđuje da se zaštita uključuje u Project Settings > Authentication > Bot and Abuse Protection, uz odabir pružatelja i unos tajnog ključa, te da frontend šalje CAPTCHA token u Auth pozivu.

## 3. Dokaz za issue #318

Issue [#318](https://github.com/danielrisavi77-create/Lekta/issues/318) ostaje otvoren, ali trenutačni master sadrži popravak u lockfileu bez podizanja audit praga:

- source-map-js je 1.2.2, izvan pogođenog raspona 1.0.0–1.2.1; [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
- smol-toml je 1.9.0, izvan pogođenog raspona do 1.8.0; [GHSA-r4xh-jqrq-34v2](https://github.com/advisories/GHSA-r4xh-jqrq-34v2).
- Security workflow 38429623801 na SHA-u f758ba2bde00c7f2d37daa789a39ed1e4168db99 završio je uspješno. Uspješno su prošli audit produkcijskih ovisnosti, audit cijelog grafa, audit ratchet i provjera izvora lockfilea.
- GitHub Actions rezultat vrijedi za točan SHA i lockfile iz tog runa; stariji lokalni node_modules nije mjerodavan dokaz.
- Popravak je ušao kroz [PR #319](https://github.com/danielrisavi77-create/Lekta/pull/319), spojen 9. listopada u commit `4911855f066b85fe555cc0a2b239726fec06852a`. PR je mijenjao samo lockfile: `source-map-js` 1.2.1 → 1.2.2 i `smol-toml` 1.8.0 → 1.9.0. Trenutačni `master` sadrži te verzije; `fullGraphHighCritical` ostaje 0, bez iznimki. Službeni GitHub advisories navode 1.2.2 i 1.9.0 kao zakrpane verzije.
- Issue je i dalje otvoren. GitHub ne prikazuje zabilježeni pregled PR-a #319, a komentar na issueu od 6. listopada bilježi da neovisni pregled tada nije bio potvrđen. Ovaj odjeljak daje tehničke dokaze za vlasnikov pregled zatvaranja; ne zatvara issue i ne tvrdi da postoji dokaz drugog providera.

Ovi podaci podupiru vlasnikovu odluku o zatvaranju issuea: zakrpe su u spojenom lockfileu, aktivni prag ostaje nula, a security workflow prolazi na aktualnom masteru. Issue nije zatvoren ovim izvještajem.
