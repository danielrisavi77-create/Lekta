# Auth captcha (Cloudflare Turnstile)

T89, odluka vlasnika 28. 9. 2026. Nalaz T84: na produkcijskom Supabase Authu su anonimne prijave
ukljucene, captcha je iskljucen, a 24 od 26 korisnika su anonimni. Svaki skripteni klijent je
mogao otvarati racune bez ogranicenja. Supabase Auth ima ugradjenu podrsku za Turnstile.

## Sto radi kod

- `src/auth/session.ts` salje captcha token (`gotrue_meta_security.captcha_token`) na sva tri
  poziva koja GoTrue stiti i koje aplikacija koristi:
  - anonimna prijava (`POST /auth/v1/signup`, identitet iza popravka);
  - registracija i prijava e-mailom (`POST /auth/v1/otp` s `create_user: true`);
  - prijava lozinkom (`POST /auth/v1/token?grant_type=password`, admin).
- Reset lozinke kroz `/auth/v1/recover` aplikacija danas nema. Lozinka se postavlja samo prijavljenom
  korisniku (`PUT /auth/v1/user`), a taj poziv GoTrue captchom ne stiti. Gard
  `tests/helpers/auth-captcha.ts` cita izvore i pada ako se doda poziv na signup, otp, prijavu
  lozinkom ili recover mimo `withCaptcha`.
- `src/auth/captcha.ts` ucitava Turnstile tek na prvom Auth pozivu. Widget je `interaction-only`:
  vidi se samo kad Cloudflare trazi klik. Token je jednokratan, pa se widget nakon svakog poziva
  uklanja.
- Ucitavanje `api.js` ceka najvise 20 s, a token najvise 120 s. Skripta koja visi ne zadrzava Auth
  poziv; poziv tada ide bez tokena.
- Kad Auth odbije poziv zbog captche (400, `error_code: captcha_failed`), sva tri toka vracaju uputu
  za ponovni pokusaj umjesto opcenite greske. Prijava lozinkom vise ne kaze "e-mail ili lozinka
  nisu tocni". Anonimna prijava nema obrazac, pa uz poruku pokazuje i obavijest (`role="alert"`).
- `dist/build-info.json` nosi `captchaSiteKey: true|false`: je li build dobio site key. Sam kljuc
  se ne upisuje.
- CSP u `public/_headers` dopusta `https://challenges.cloudflare.com` u `script-src` i `frame-src`.
  Provjeru tokena radi GoTrue na serveru, pa `connect-src` ne treba novi host.

## Fail-open bez kljuca, i samo privremeno

Bez `VITE_TURNSTILE_SITE_KEY` widget se ne prikazuje, skripta se ne ucitava i Auth pozivi idu bez
tokena, tocno kao prije T89. Isto vrijedi kad se Turnstile ne ucita (CSP, mreza, blokator) ili
istekne cekanje.

To je ispravno SAMO dok captcha nije ukljucen na Supabase Authu. Kad se ukljuci, GoTrue odbija
svaki poziv bez valjanog tokena. Build bez kljuca tada ne moze prijaviti nikoga, a popravak
dokumenta (koji trazi anonimnu sesiju) prestaje raditi za svakog novog korisnika.

## Redoslijed ukljucivanja

Obrnuti redoslijed lomi prijave. Prvo staging, zatim produkcija.

1. **Cloudflare, Turnstile:** novi widget, nacin rada "Managed", hostnameovi tocno one domene na
   kojima Lekta radi (produkcijska domena, staging domena; za lokalni razvoj `localhost`). Iz
   widgeta se dobivaju SITE key (javan) i SECRET key (tajna).
2. **Netlify, environment variables:** `VITE_TURNSTILE_SITE_KEY` = site key, za kontekst koji se
   ukljucuje (staging ili production). Varijabla se ugradjuje pri buildu, pa je potreban NOVI
   deploy; postavljanje varijable bez deploya ne mijenja nista.
3. **Dokaz deployanog kljuca:** `curl -s https://<domena>/build-info.json` mora vratiti ocekivani
   `commit` i `"captchaSiteKey": true`. `false` ili bez polja znaci da build nema kljuc: STANI.
4. **Provjera frontenda prije Autha:** na deployanom sajtu pokreni tok koji trazi anonimnu prijavu
   (popravak dokumenta) u novom privatnom prozoru. U DevToolsu zahtjev `POST /auth/v1/signup` mora
   imati tijelo s `gotrue_meta_security.captcha_token`, a u konzoli ne smije biti CSP greske za
   `challenges.cloudflare.com`. Ako tokena nema, STANI: ukljucivanje na Authu bi slomilo prijave.
5. **Supabase dashboard:** Authentication > Attack Protection > Enable Captcha protection, provider
   Turnstile (Cloudflare), upisi SECRET key i spremi. Secret key ide SAMO ovdje, nikad u repozitorij,
   `.env.example`, Netlify ni u poruku.
6. **Serversko odbijanje bez tokena:** odmah nakon ukljucivanja

   ```bash
   curl -s -X POST "https://<ref>.supabase.co/auth/v1/signup" \
     -H "apikey: <anon kljuc>" -H "Content-Type: application/json" -d '{}'
   ```

   mora vratiti 400 s `"error_code":"captcha_failed"`. Ako prode (vrati sesiju), captcha nije
   ukljucen: STANI i provjeri korak 5.
7. **Provjera toka:** nova anonimna prijava u privatnom prozoru mora uspjeti (popravak krece). Svi
   ishodi (koraci 3, 4, 6 i 7) zapisuju se s vremenom i projektom.

Staging ide cijelim redoslijedom prvi. Produkcija se ukljucuje tek kad staging ima zapisane korake
3, 4, 6 i 7; tako je serversko odbijanje dokazano prije produkcijskog ukljucivanja.

Staging ukljucuje sesija tek uz izravnu rijec vlasnika u toj sesiji. Produkciju ukljucuje vlasnik ili
koordinator na njegovu rijec, nakon mergea, stagingova dokaza i koraka 3 i 4 na produkciji.

## Povrat

Najbrzi povrat je iskljucivanje captche u Supabase dashboardu (korak 5 unatrag): djeluje odmah i ne
trazi deploy. Frontend s kljucem smije ostati, jer token koji server ne trazi server ignorira.

## Otvoreno

- Turnstile salje Cloudflareu signale preglednika (IP adresa, preglednik, korisnicki agent). Tekst
  privatnosti (`src/legal/legal-content.ts`) Cloudflare jos ne navodi. To je UVJET za ukljucivanje
  na produkciji (Codex T89-03), ne za merge koda; ide vlasniku i T86.
- Ponasanje u stvarnom pregledniku sa stvarnim kljucem nije provjereno u T89 PR-u (nema kljuca ni
  ukljucenog staginga); provjerava se koracima 3 do 7.
