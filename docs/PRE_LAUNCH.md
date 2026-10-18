# Prije javnog puštanja aplikacije

Popis stvari koje NE blokiraju razvoj ni internu betu, ali moraju biti gotove prije nego se
aplikacija pozove ljudima. Sve niže je vanjska infrastruktura ili odluka vlasnika, ne kod.

Napomena: statusi iz ove starije checklist-e nisu potvrda današnjih živih postavki. Za betu koristi [aktualni go/no-go dosje](agents/reports/BETA_GO_NO_GO_2026-10-16.md); ne tumači povijesne stavke u nastavku kao trenutačno stanje.

---

## A. E-mail prijava i Auth limit za betu

Stanje iz pregleda 15.10.2026.: `docs/agents/tasks.json` bilježi da je Resend SMTP postavljen 4.10. i da je `rate_limit_email_sent` još 2/h. To je povijesna projektna bilješka, ne svježe očitanje Supabasea.

U produkcijskom projektu `zrrjttizjyfcxmcpgzml` otvori Supabase Dashboard > Authentication > Rate Limits i provjeri trenutni e-mail provider i limit slanja. Supabaseov ugrađeni e-mail provider ograničen je na 2 e-maila na sat; prilagođeni limit zahtijeva Custom SMTP ili Send Email hook. Vidi [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

Potvrdi da je Custom SMTP ili Send Email hook aktivan. Ako jest, odaberi limit koji odgovara beta opsegu i postavi ga u Rate Limits. Ako nije, prvo dovrši i provjeri e-mail provider; nemoj pokušavati zaobići ograničenje ugrađenog mailera.

Pošalji probni OTP na beta testni račun i potvrdi isporuku i uspješnu prijavu. Zapiši projekt, postavljeni limit i vrijeme u privatnu operativnu bilješku. Ne stavljaj tajne ni žive vrijednosti u javne zapise.

## B. Naplata (Faza 2, kad beta pokaže da radi)

> **Naplata je iskljucena tijekom bete** (odluka vlasnika 2026-09-26). Stripe tok se ukljucuje tek
> kad beta prestane. Puni koraci: `docs/GO_LIVE_NAPLATA.md`.

- [ ] Stripe racun (pruzatelj od 2026-09-23, F18; nije Merchant of Record, PDV je obveza vlasnika).
      Stripe proizvode ne kreirati: cijene su samo u `products` (`src/report/pricing.ts`
      `WORK_TYPE_TIERS`); `products.mor_product_id` je naslijedjen i ne mapira se.
- [ ] Edge tajne `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
      (`STRIPE_ALLOW_TEST_MODE` samo za smoke test; `STRIPE_ACCOUNT_ID` se ne postavlja, Connect se ne koristi).
- [ ] Stripe webhook na `.../functions/v1/webhook-mor` (`payment_intent.succeeded`, `charge.refunded`).
- [ ] Redeploy `create-checkout` (deployana verzija je starija od WS-5 `tier_mismatch` enforcementa).
- [ ] Maknuti Edge tajnu `REPAIR_FREE_MODE` i postaviti `checkoutEndpoint` u `DEFAULT_PRODUCTION_CONFIG`.
- [ ] Uskladiti pravni tekst: rečenice "Tijekom besplatne bete popravak se ne naplaćuje" moraju otpasti.

## C. Pravni subjekt

- [ ] Registrirati poslovni subjekt prije prve naplate i tek tada postaviti
      `providerRegistered: true` u `data/legal/provider.json`. Vlasnički potvrđeni OIB, telefon i
      adresa već su javno navedeni; do registracije beta-popravci ostaju besplatni, a naplata zatvorena.
- [ ] **Prije prve naplate zamijeniti privremene osobne kontaktne podatke poslovnim/registriranim
      podacima subjekta gdje god je to pravno dopušteno.** Ne brisati podatke koje GDPR i
      potrošačko pravo stvarno traže; cilj je ne objavljivati privatnu kućnu adresu nakon što
      postoji valjana poslovna adresa.
- [ ] Porezni tretman prije prve naplate: Stripe nije Merchant of Record, pa PDV (HR i OSS) obracunava i prijavljuje vlasnik.

## D. Operativno

- [ ] **Netlify Build command mora ostati puni lanac.** Ako se vrati na samo `npm run build`,
      `generate-legal-pages` i `verify-deploy-dist` se ne izvode; 2026-07-20 su zbog toga sve pravne
      stranice bile **404** dva dana, a s njima i sve provjere koje `verify-deploy-dist` jamči
      (bez dev alata, CSP whitelist, konzola isključena, noindex/sitemap).
- [x] **`cleanup-orphan-repairs` je dokazano ispravan** (2026-07-20): ručno pokrenut istim pozivom
      koji izvodi cron (tajna iz Vaulta), odgovor `200 {ok:true, removed:0, anonymousRemoved:0}` uz
      stanje bez ijednog siročeta. Posao je aktivan u `cron.job` (`20 4 * * *`); prvi automatski
      prolaz je tek nakon postavljanja, pa `cron.job_run_details` treba pogledati jednom nakon 04:20 UTC.
- [ ] Odlučiti retenciju za prijavljene e-mailom (sada: neograničeno, "dok sam ne obriše").
- [ ] **Kapacitet:** Storage nema kvotu (po popravku se čuvaju original + rezultat, do 2×20 MB), a
      baza je na ~70 % besplatnog stropa i bez backupa. Prije šireg poziva: odluka o Pro planu ili
      gornja granica zauzeća bucketa uz iskren signal klijentu.
- [ ] **Vidljivost:** `errorEndpoint` je prazan string, pa klijentske greške ostaju u konzoli
      korisnika. Postaviti prije šireg poziva.
- [ ] **Post-deploy smoke** (`/privatnost.html` očekuje 200) kao zakazani posao, da regresija
      Netlify build lanca ne prođe neopaženo danima kao 2026-07-20.

## E. Provjera pred puštanje

- [ ] Cijeli tok kao pravi korisnik: popravak bez prijave (anonimno) → preuzimanje → "Moji popravci"
      → brisanje → nestalo i iz Storagea.
- [ ] Prijava e-mailom (nakon A) na drugom uređaju.
- [ ] `/privatnost.html`, `/uvjeti-koristenja.html`, `/obrada-dokumenata.html` vraćaju 200 i sadrže
      tekst o pohrani popravka, anonimnim računima i roku od 30 dana.
- [ ] Supabase `get_advisors` (security) bez novih upozorenja.

---

## F. Preostalo iz revizije popravka (2026-07-20)

Puna revizija toka popravka (6 agenata, svaki nalaz s dokazom u kodu) provedena je 2026-07-20.
Sve visoko rangirano je napravljeno: paralelizacija provjere izvora s popravkom i pohranom,
pošten dnevni limit, poruke o greškama koje stvarno stižu do korisnika, provjera veličine prije
uploada, zaštita naslovnice bez Word stilova, nevidljiv sadržaj (`w:cr`/`w:sym`/`w:ptab`),
položene sekcije. Ostaje, po vrijednosti:

- [ ] **Signed URL umjesto base64** u odgovoru `repair-docx` kad `jobId` postoji: popravljeni
      dokument već leži u Storageu, a sada se isti bajtovi vraćaju napuhani za 33 %.
- [ ] **Jedan spojeni prolaz dubokog čišćenja** umjesto četiri odvojena (`stripDirectFormatting`
      se zove po fixeru), plus `balancedRanges` izračunat jednom. Zaštićeni sloj: golden prije refaktora.
- [ ] **Raw pass-through nedirnutih zip zapisa**: `writeZip` danas rekomprimira i slike koje nitko
      nije mijenjao. Zaštićeni sloj: golden prije refaktora.
- [ ] **Faze i tijek uploada u sučelju** (sada: rok od 180 s i tekst gumba, bez postotka).
- [ ] **`w:sectPrChange` čuvar** za `patchMargins`/`patchPaperSize` (danas bi prepisali i povijest
      praćenih izmjena; `pgNumType` taj čuvar već ima).
- [ ] **Golden s pravim Wordovim dokumentom** (fixture su sintetički, 4 dijela, STORED): dokazati da
      slike, `numbering.xml`, `settings.xml` i `theme` prolaze bit-identično.
- [ ] **IP kljuc `cf-connecting-ip` na produkciji**: kljuc za `ip_hash` je `cf-connecting-ip` (T84 XFF, mjereno
      na stagingu 2026-10-09). Prije naplate potvrditi na produkciji: dva poziva s istog stroja s izmisljenim
      `x-forwarded-for` daju isti hash, poziv s druge mreze razlicit.
