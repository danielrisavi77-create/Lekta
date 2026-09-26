// Lekta Edge Function: webhook-mor (Deno, Supabase). Pruzatelj naplate: Stripe.
// Spec: docs/MONETIZATION_PLAN.md sekcija 6 (webhook delte) + MONETIZATION_AND_ANTI_ABUSE.md 7.
//
// Ime funkcije (`webhook-mor`) je naslijedjeno iz vremena Merchant of Record providera i
// namjerno se NE mijenja: ono je vec upisano u produkcijski URL i deploy manifest. Stripe nije
// Merchant of Record, pa PDV obracunava i prijavljuje vlasnik (odluka 2026-09-23, F18).
//
// Obradjuju se dva dogadjaja: `payment_intent.succeeded` (knjizi entitlement) i
// `charge.refunded` (povrat). Kljuc knjizenja je PaymentIntent id, isti za uplatu i povrat.
// Idempotentno preko unique (provider, order_id) (migracija 0001). Proizvod se trazi u bazi
// `products` po KATALOSKOM id-u iz `metadata[product_id]`, ne po naslijedjenom mapiranju.
// Rok potrosnje je po proizvodu (purchase_window_days).
// manual_fulfillment (premium_human) -> manual_orders. Pass -> izdaje -20% kupon (coupon_grants).
// Nepoznat proizvod -> log + 200 (bez entitlementa) da provider ne retry-a beskonacno (6.2);
// od 2026-08-17 takav dogadjaj TRAJNO ostaje u webhook_events pa se moze replayati (PAY-06).
// Svaki dogadjaj se zapisuje u inbox PRIJE obrade, a porijeklo (livemode, vrsta dogadjaja)
// provjerava se prije ijednog upisa: potpis dokazuje samo znanje tajne (PAY-04/05).
// Odluke (potpis, parsiranje, rok, kupon) su u testiranom coreu src/report/webhook.ts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { createWebhookHandler } from './handler.ts';

// Obrada dogadjaja zivi u ./handler.ts; ovdje su samo okolina i Supabase klijent.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
/**
 * Signing secret Stripe webhook endpointa (`whsec_...`).
 *
 * Prazno = potpis se ne moze provjeriti, pa `verifyStripeSignature` odbija SVE dogadjaje s
 * razlogom `missing_secret`. Namjerno fail-closed: tise propustanje bi znacilo da webhook prima
 * dogadjaje bilo koga, a da nitko ne zna da gate nije konfiguriran.
 */
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
/** Ocekivani Stripe Connect racun; prazno = obican racun, provjera se preskace. */
const STRIPE_ACCOUNT_ID = Deno.env.get('STRIPE_ACCOUNT_ID') ?? '';

Deno.serve(
  createWebhookHandler({
    admin: () => createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } }),
    webhookSecret: WEBHOOK_SECRET,
    accountId: STRIPE_ACCOUNT_ID,
    allowTestMode: Deno.env.get('STRIPE_ALLOW_TEST_MODE') === '1',
  }),
);
