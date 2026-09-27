// Lekta Edge Function: create-checkout (Deno, Supabase).
// Spec: docs/MONETIZATION_PLAN.md sekcija 5, korak 15.2. Pruzatelj naplate: Stripe (F18,
// odluka vlasnika 2026-09-23). Stripe NIJE Merchant of Record: PDV ostaje obveza vlasnika.
//
// Ulaz: { productId, referralCode? }. Auth (Supabase JWT) je obavezan (401 bez njega).
// Cijena je serverska odluka: klijent salje samo productId, server cita `products` (0002) i
// iz `price_eur` racuna iznos u centima. Klijentov iznos se NIKAD ne cita (kriterij 14.1/14.2).
// Partner proizvod trazi aktivan partner_accounts red (403 inace; tablica dolazi u koraku 4).
// Tanki omotac: odluka i tijelo Stripe poziva su u testiranom coreu src/report/checkout.ts.
//
// Odgovor 200 nosi `clientSecret` PaymentIntenta i `publishableKey`; Payment Element se montira
// u stranici, pa nema odlaska na hosted checkout. Povratnog redirecta nema zato sto PaymentIntent
// nosi `automatic_payment_methods[allow_redirects]=never` (buildStripePaymentIntentParams): Stripe
// tada ne nudi nijedan nacin placanja koji vodi na bankovnu ili vanjsku stranicu, a kartica s
// 3D Secureom, Apple Pay i Google Pay (Z36) dovrsavaju se u okviru na stranici.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { createCheckoutHandler } from './handler.ts';

// Obrada zahtjeva zivi u ./handler.ts; ovdje su samo okolina i Supabase klijenti.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
// Publishable kljuc NIJE tajna, ali se drzi na serveru da klijent nema build-time env varijablu
// i da se zamjena kljuca (test -> live) vidi odmah, bez novog builda.
const STRIPE_PUBLISHABLE_KEY = Deno.env.get('STRIPE_PUBLISHABLE_KEY') ?? '';
// Dnevni limit kreiranja checkouta po korisniku (SEC-06, AUD-23/35): bez njega prijavljeni korisnik
// moze u petlji okidati Stripe pozive i puniti checkout_consents. Isti obrazac kao DAILY_CAP u
// generate-report.
const CHECKOUT_DAILY_CAP = Number(Deno.env.get('CHECKOUT_DAILY_CAP') ?? '20');

// Dopusteno CORS porijeklo (SEC-05): produkcijska domena; override preko ALLOWED_ORIGIN (zarezom
// odvojeno). Localhost je uvijek dopusten (dev). Reflektira se u corsHeadersFor (nikad '*'), isti
// obrazac kao faculty-request/preflight-start.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? 'https://lektahr.netlify.app')
  .split(',').map((s) => s.trim()).filter(Boolean);

Deno.serve(
  createCheckoutHandler({
    asUser: (token: string) =>
      createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      }),
    admin: () => createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } }),
    stripeSecretKey: STRIPE_SECRET_KEY,
    stripePublishableKey: STRIPE_PUBLISHABLE_KEY,
    dailyCap: CHECKOUT_DAILY_CAP,
    allowedOrigins: ALLOWED_ORIGINS,
  }),
);
