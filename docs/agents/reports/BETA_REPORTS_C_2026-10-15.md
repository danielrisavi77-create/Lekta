# Izvještaji C za beta pripremu

Presjek je napravljen 13. listopada 2026. Služi za pregled prije beta odluke; nije dokaz iscrpnog testiranja svake rute, svakog profila ili svakog uređaja.

## 1. Žive rute i slijepe ulice

Izravni GET na lekta.hr vratio je HTTP 200 za svih 20 pregledanih ruta:

| Skupina | Rute |
| --- | --- |
| Ulaz i rad | /, /rad/, /moji-radovi/ |
| Vodiči i alati | /saznaj-vise/, /alati, /citat, /kartice, /naslovnica, /literatura, /izjava |
| Katalog i pokrivenost | /fakulteti/, /pokrivenost, /fpzg/diplomski-rad/ |
| Pravni sadržaj | /privatnost, /uvjeti-koristenja, /obrada-dokumenata, /kolacici, /garancija, /pravila-povrata, /odricanje-od-odgovornosti |

Tijekom ručnog prolaza kroz početnu i stranicu Saznaj više otvorene su povezane javne stranice; pregledani sadržaji imali su naslov, glavni naslov i tijelo. Na početnoj je plaćeni popravak vidljivo označen kao uskoro, a naplata kao neaktivna. U tom uzorku nije pronađena slijepa ulica.

Glavna stranica vraća canonical i og:url na https://lekta.hr/. Alati dostupni na putanjama bez nastavka .html vraćaju canonical na odgovarajuću .html adresu; to samo po sebi ne dokazuje HTTP 301 preusmjerenje. Za /saznaj-vise/, /rad/, /pokrivenost/, /moji-radovi/ i dio pravnih stranica og:url nije bio prisutan u HTML-u. To nije prekinuta korisnička poveznica, ali ostaje SEO stavka za pregled u zasebnom zadatku.

Ograničenja: nisu provjereni svi profili fakulteta, svaka vrsta rada, svaka vanjska poveznica, sva stanja prijave, svi modalni tokovi ni sve širine zaslona. URL-ovi /fakulteti/ i /pokrivenost/ sadržavaju tekst koji može aktivirati naivnu provjeru fraze “not found”; stvarni HTTP odgovor i glavni sadržaj bili su dostupni, pa taj tekst nije klasificiran kao 404.

## 2. Spremnost koda za captcha

Frontend ima Turnstile put za signup, e-mail OTP i prijavu lozinkom. Token se šalje u GoTrue obliku gotrue_meta_security.captcha_token. Testovi auth-captcha.test.ts pokrivaju tokove s tokenom i ponašanje bez ključa.

Klijent namjerno vraća bez tokena dok VITE_TURNSTILE_SITE_KEY nije postavljen. To je sigurno samo prije uključivanja captcha zaštite u Supabase Authu. Javni produkcijski build-info.json 13. listopada navodio je captchaSiteKey=false. Kodna integracija je spremna za konfiguraciju, ali produkcija nije spremna za uključivanje. Vlasnik najprije postavlja TURNSTILE_SITE_KEY u GitHub Actions production okruženju, objavljuje build, provjerava captchaSiteKey=true na javnom build-info.json, a tek zatim unosi Turnstile secret i uključuje zaštitu u Supabase Authu. Ne čitati ni zapisivati secret u ovom izvještaju.

Postupak i redoslijed: docs/deploy/AUTH_CAPTCHA.md i docs/deploy/TURNSTILE_T89.md. Službena Supabase uputa potvrđuje da se production Edge Function secrets mogu postaviti u nadzornoj ploči ili CLI-jem i da novi secret ne traži redeploy: [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets).

## 3. Dokaz za issue #318

Issue [#318](https://github.com/danielrisavi77-create/Lekta/issues/318) ostaje otvoren, ali trenutačni master sadrži popravak u lockfileu bez podizanja audit praga:

- source-map-js je 1.2.2, izvan pogođenog raspona 1.0.0–1.2.1; [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
- smol-toml je 1.9.0, izvan pogođenog raspona do 1.8.0; [GHSA-r4xh-jqrq-34v2](https://github.com/advisories/GHSA-r4xh-jqrq-34v2).
- Security workflow 38429623801 na SHA-u f758ba2bde00c7f2d37daa789a39ed1e4168db99 završio je uspješno. Uspješno su prošli audit produkcijskih ovisnosti, audit cijelog grafa, audit ratchet i provjera izvora lockfilea.
- GitHub Actions rezultat vrijedi za točan SHA i lockfile iz tog runa; stariji lokalni node_modules nije mjerodavan dokaz.

Ovi podaci daju dokaz za predloženo zatvaranje issuea nakon pregleda diff-a i potvrde da prag ostaje nepromijenjen. Issue nije zatvoren ovim izvještajem.
