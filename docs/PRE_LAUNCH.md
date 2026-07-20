# Prije javnog puštanja aplikacije

Popis stvari koje NE blokiraju razvoj ni internu betu, ali moraju biti gotove prije nego se
aplikacija pozove ljudima. Sve niže je vanjska infrastruktura ili odluka vlasnika, ne kod.

Stanje na 2026-07-20: besplatna beta radi s **anonimnom prijavom** (bez e-maila), pa se
aplikacija može koristiti i testirati dok ovo nije riješeno.

---

## A. E-mail (blokira prijavu e-mailom) [otkriveno 2026-07-20]

Trenutno se **ne može** koristiti prijava e-mailom. Nije stvar postavke nego plana:

> Supabase Management API, doslovno: *"Email template modification is not available for free tier
> projects using the default email provider. Please upgrade your plan or configure a custom SMTP
> provider."*

Ugrađeni mailer uvijek šalje magic **link**, a klijent (`verifyEmailOtp`) očekuje 6-znamenkasti
**kod** i nema callback rutu. Predložak se ne da promijeniti ni u dashboardu. Zato:

- [ ] **Kupiti i verificirati domenu.** Resend traži verificiranu domenu za slanje bilo kome;
      `onboarding@resend.dev` šalje samo na vlasnikovu adresu (dovoljno za vlastiti test, ne za betu).
      Site je na `lektahr.netlify.app`, što se ne može verificirati.
- [ ] **Resend SMTP** u Supabase → Authentication → Emails → SMTP Settings:
      `smtp.resend.com`, port `587`, user `resend`, pass = API ključ.
- [ ] **Predlošci** (tek nakon SMTP-a, prije toga API odbija): sadržaj je gotov u repou,
      `supabase/templates/magic_link.html` i `confirm_signup.html`. Oba MORAJU imati `{{ .Token }}`.
      Postavljaju se `PATCH /v1/projects/{ref}/config/auth` na polja
      `mailer_templates_{magic_link,confirmation}_content` + `mailer_subjects_*`.
- [ ] **Rate limit.** `rate_limit_email_sent` je **2/h** i API ga ne da dići bez custom SMTP-a
      (*"Custom SMTP required to configure RATE_LIMIT_EMAIL_SENT"*). Nakon Resenda dići na razumnu
      vrijednost, inače treći korisnik u satu ne dobiva kod.

> Riješeno usput 2026-07-20: `site_url` je bio `http://localhost:3000` na produkciji, sada je
> `https://lektahr.netlify.app`.

## B. Naplata (Faza 2, kad beta pokaže da radi)

- [ ] Lemon Squeezy variante po vrsti rada (cijene: `src/report/pricing.ts` `WORK_TYPE_TIERS`).
- [ ] `products.mor_product_id` mapirati (bez toga `create-checkout` vraća `409 product_not_mapped`).
- [ ] LS webhook na `.../functions/v1/webhook-mor`, tajna `MOR_WEBHOOK_SECRET`.
- [ ] Redeploy `create-checkout` (deployana verzija je starija od WS-5 `tier_mismatch` enforcementa).
- [ ] Maknuti Edge tajnu `REPAIR_FREE_MODE` i postaviti `checkoutEndpoint` u `DEFAULT_PRODUCTION_CONFIG`.
- [ ] Uskladiti pravni tekst: rečenice "Tijekom besplatne bete popravak se ne naplaćuje" moraju otpasti.

## C. Pravni subjekt

- [ ] Registrirati subjekt i upisati `oib` i `address` u `data/legal/provider.json`. Dok su prazni,
      pravne stranice nose napomenu da registracijski podaci slijede (`registrationNote`).
- [ ] Merchant of Record / porezni tretman prije prve naplate.

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
- [ ] **`x-forwarded-for` provjera prije naplate**: `ip_hash` se računa iz PRVOG zapisa. Ako klijent
      može utjecati na njega, IP limit (jedina obrana od farmanja anonimnih računa) i referral
      anti-fraud su zaobilazni. Provjera je jedan poziv s izmišljenim zaglavljem pa usporedba hasha.
