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
3. **Provjera frontenda prije Autha:** na deployanom sajtu pokreni tok koji trazi anonimnu prijavu
   (popravak dokumenta) u novom privatnom prozoru. U DevToolsu zahtjev `POST /auth/v1/signup` mora
   imati tijelo s `gotrue_meta_security.captcha_token`, a u konzoli ne smije biti CSP greske za
   `challenges.cloudflare.com`. Ako tokena nema, STANI: ukljucivanje na Authu bi slomilo prijave.
4. **Supabase dashboard:** Authentication > Attack Protection > Enable Captcha protection, provider
   Turnstile (Cloudflare), upisi SECRET key i spremi. Secret key ide SAMO ovdje, nikad u repozitorij,
   `.env.example`, Netlify ni u poruku.
5. **Provjera nakon ukljucivanja:** nova anonimna prijava u privatnom prozoru mora uspjeti (popravak
   krece), a `POST /auth/v1/signup` bez tokena (npr. `curl` s anon kljucem i tijelom `{}`) mora biti
   odbijen porukom o captchi. Oba ishoda zapisi s vremenom i projektom.

Staging ukljucuje sesija tek uz izravnu rijec vlasnika u toj sesiji. Produkciju ukljucuje vlasnik ili
koordinator na njegovu rijec, nakon mergea i koraka 3.

## Povrat

Najbrzi povrat je iskljucivanje captche u Supabase dashboardu (korak 4 unatrag): djeluje odmah i ne
trazi deploy. Frontend s kljucem smije ostati, jer token koji server ne trazi server ignorira.

## Otvoreno

- Turnstile salje Cloudflareu podatke o pregledniku posjetitelja. Pravni tekst privatnosti bi to
  trebao navesti prije ukljucivanja na produkciji; odluka je vlasnikova.
- Ponasanje u stvarnom pregledniku sa stvarnim kljucem nije provjereno u T89 PR-u (nema kljuca ni
  ukljucenog staginga); provjerava se korakom 3 i 5.
