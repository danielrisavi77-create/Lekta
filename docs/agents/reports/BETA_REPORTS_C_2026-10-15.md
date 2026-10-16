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

Svježi ponovljeni GET prolaz 15. listopada u 23:47:36 CEST (21:47:36 UTC) ponovno je vratio HTTP 200 za svih 20 ruta. Izdvojena je ista 281 jedinstvena interna adresa; svih 281 vratilo je 2xx, bez mrežne/HTTP pogreške ili preusmjeravanja. Pojedinačni svježi statusi nalaze se u [BETA_LIVE_LINKS_2026-10-15.json](BETA_LIVE_LINKS_2026-10-15.json). Ograničenja opsega iz prethodnog odlomka ostaju ista.

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
- Izolirani npm ci na kopiji točnih package.json/package-lock.json uz --ignore-scripts uspješno je instalirao 133 paketa na SHA f515544171ca58395030cd7ceda3047c55b9031e. npm explain source-map-js pokazao je source-map-js@1.2.2 iz postcss@8.5.28; npm explain smol-toml pokazao je smol-toml@1.9.0 iz knip@6.39.0. Prvi pokušaj iz worktreea nije bio valjan jer node_modules vodi junctionom do Desktop\Lekta i ondje pokazuje extraneous rezultate te smol-toml@1.8.0. Izdvojeni install potvrđuje roditelje iz zaključanog grafa i ispunjava kriterij za npm explain. Neovisan pregled drugog providera i dalje nije potvrđen; issue se ne zatvara.

### Svježa provjera nakon spajanja PR-a #319 — 16. listopada 2026., 01:04 UTC

PR [#317](https://github.com/danielrisavi77-create/Lekta/pull/317) ostaje otvoren prema `master`; GitHub prijavljuje bazu `c06bb8b98a4eb962b0276bf149bb56793efc3664`, dok je aktualni `master` `f758ba2bde00c7f2d37daa789a39ed1e4168db99`. HEAD PR-a #317 je `760c414418ae0ba7be925fb18b8f78b4e09d9544`. Usporedba potvrđuje da taj HEAD uključuje merge commit PR-a #319 (`4911855f066b85fe555cc0a2b239726fec06852a`): 41 commit ispred njega i 0 iza. CI run `37988815760` na SHA-u `760c4144` završio je uspješno 9. listopada u 20:42 UTC; trenutačni PR statusi su 30 uspješnih i 2 preskočene. Dakle, ponovna provjera #317 nakon spajanja #319 jest zabilježena.

U odnosu na današnji `master` `f758ba2b`, PR #317 sada je raziđen: zajednički predak `c2767c18`, 22 commita ispred i 32 iza. To ne poništava povijesnu provjeru nakon #319, ali prije budućeg spajanja #317 treba uskladiti s aktualnim `masterom` i ponovno provjeriti.

Zaključak: tehnički popravak #318 prisutan je na `master`, security workflow za SHA `f758ba2b` prolazi, a provjera #317 nakon #319 ima povijesni dokaz. Issue #318 još nije spreman za zatvaranje jer neovisan pregled drugog providera nije potvrđen. Ovaj izvještaj daje dokaze za vlasnikov pregled; ne zatvara issue.

### Svježi audit i lockfile dokaz — 16. listopada 2026., 06:58 UTC

Na trenutačnom PR #367 kandidatu `f69a31a3f45d1a43524ffe9f3723b3e27c406902` (isti `package.json`
i `package-lock.json` kao roditeljski `c116bf389674c722b9d90694d4987c9f2b66f1f7`) provjerio sam:

- `npm audit --audit-level=high` i `npm audit --omit=dev --audit-level=high`: oba nalaze 0 ranjivosti.
- `node scripts/npm-audit-ratchet.mjs`: cijeli graf ima 0 high/critical i ostaje na pragu 0.
- `node scripts/npm-audit-ratchet.mjs --selftest`: negativne kontrole za niži prag, novi identitet i novi advisory prolaze; nevaljan odgovor se odbija.
- `node scripts/lockfile-sources.mjs`: 275 paketa dolazi s npm registra uz sha512 integritet; jedan root/inBundle zapis je izuzetak.
- `node scripts/lockfile-sources.mjs --selftest`: svih 15 nevaljanih ulaza se hvata.

`node_modules` u worktreeu je junction na drugi checkout i zato nije valjan za `npm explain`. Izolirani
install `C:\Users\PC\AppData\Local\Temp\lekta-t318-c116bf38` ima iste SHA-256 otiske obaju manifestâ
kao trenutačni PR kandidat. `npm explain` u toj izoliranoj instalaciji potvrđuje `source-map-js@1.2.2`
preko `postcss@8.5.28` i `smol-toml@1.9.0` preko `knip@6.39.0`.

Read-only GitHub provjera potvrđuje da je issue #318 još otvoren, PR #319 spojen u
`4911855f066b85fe555cc0a2b239726fec06852a`, a PR #317 ostaje otvoren prema staroj bazi
`c06bb8b98a4eb962b0276bf149bb56793efc3664`, ne aktualnom `masteru` `f758ba2bde00c7f2d37daa789a39ed1e4168db99`.
Ovaj presjek potvrđuje trenutačni audit i točan roditeljski graf; ne zatvara issue #318. Neovisan
pregled drugog providera i dalje nije potvrđen.
