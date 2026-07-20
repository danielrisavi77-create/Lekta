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
- [ ] Provjeriti da `cleanup-orphan-repairs` cron radi (Edge logovi): briše i orphan BLOB-ove i
      anonimne popravke starije od 30 dana.
- [ ] Odlučiti retenciju za prijavljene e-mailom (sada: neograničeno, "dok sam ne obriše").

## E. Provjera pred puštanje

- [ ] Cijeli tok kao pravi korisnik: popravak bez prijave (anonimno) → preuzimanje → "Moji popravci"
      → brisanje → nestalo i iz Storagea.
- [ ] Prijava e-mailom (nakon A) na drugom uređaju.
- [ ] `/privatnost.html`, `/uvjeti-koristenja.html`, `/obrada-dokumenata.html` vraćaju 200 i sadrže
      tekst o pohrani popravka, anonimnim računima i roku od 30 dana.
- [ ] Supabase `get_advisors` (security) bez novih upozorenja.
