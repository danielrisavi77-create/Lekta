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
// u stranici, pa nema odlaska na hosted checkout ni povratnog redirecta.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import {
  resolveCheckout,
  buildStripePaymentIntentParams,
  stripeAmountCents,
  stripeIdempotencyKey,
  checkoutMismatch,
  type StripePaymentIntentResponse,
} from '../../../src/report/checkout.ts';
import { mapProductRow } from '../../../src/catalog/products-catalog.ts';
import { corsHeadersFor } from '../_shared/cors.ts';
import { canonicalConsentText, consentTextMatches } from '../../../src/legal/consent-text.ts';

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

Deno.serve(async (req: Request) => {
 const cors = corsHeadersFor(req.headers.get('Origin'), ALLOWED_ORIGINS);
 const json = (body: unknown, status = 200): Response =>
   new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
 try {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // auth: Supabase JWT obavezan (sekcija 5, korak 1)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData } = await asUser.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  // input guard (P0 5.4): odbij predimenzioniran payload prije parsiranja
  const MAX_BODY = 32 * 1024;
  const clen = Number(req.headers.get('content-length') ?? '0');
  if (clen && clen > MAX_BODY) return json({ error: 'payload_too_large' }, 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'payload_too_large' }, 413);
  let body: any = {};
  try { body = JSON.parse(raw); } catch { body = {}; }
  const productId = String(body.productId ?? '');
  const referralCode = body.referralCode ? String(body.referralCode) : null;
  if (!productId) return json({ error: 'bad_request' }, 400);

  // WS-5 signali za provjeru vrste rada: SANITIZIRANI (broj rijeci + enum marker), nikad doslovni
  // tekst rada. confirmedMismatch=true znaci da je korisnik svjesno potvrdio kupnju nizeg tiera.
  const confirmedMismatch = body.confirmedMismatch === true;
  const rawSignals = body.signals && typeof body.signals === 'object' ? body.signals : null;
  const signals = rawSignals
    ? { words: Number(rawSignals.words) || null, titleMarker: rawSignals.titleMarker != null ? String(rawSignals.titleMarker) : null }
    : null;

  // consent gate (P0 1-1): digitalni pass se ne prodaje bez pristanka na trenutnu isporuku
  // i odricanja od 14-dnevnog prava na odustanak.
  //
  // OJACANO 2026-08-17 (audit A26-08 / LEG-04..07). Prije je ovdje bila samo provjera da su dva
  // boolean-a `true` i da je `text` neprazan string, nakon cega se KLIJENTOV tekst, KLIJENTOV
  // timestamp i KLIJENTOVA (opcionalna) verzija uvjeta doslovno spremali u checkout_consents.
  // Takav zapis nije bio dokaz nego prepricavanje: izmijenjen klijent mogao je poslati
  // proizvoljan tekst, datum u proslosti ili buducnosti, ili preskociti verziju uvjeta. Za
  // gubitak prava na jednostrani raskid (cl. 86. ZZP) teret dokaza je na trgovcu, pa je takav
  // zapis bio bezvrijedan upravo u trenutku kad bi zatrebao.
  const consent = body.consent;
  if (!consent || consent.immediateDelivery !== true || consent.withdrawalWaived !== true) {
    return json({ error: 'consent_required' }, 400);
  }
  // Verzija uvjeta je OBAVEZNA i mora biti poznata; bez nje se ne zna na sto je pristanak dan.
  const termsVersion = typeof consent.termsVersion === 'string' ? consent.termsVersion : '';
  if (!canonicalConsentText(termsVersion)) {
    return json({ error: 'consent_terms_version_unknown' }, 400);
  }
  // Tekst mora biti ONAJ koji je za tu verziju stvarno prikazan, do znaka.
  if (!consentTextMatches(consent.text, termsVersion)) {
    return json({ error: 'consent_text_mismatch' }, 400);
  }

  // Vrijeme privole je SERVERSKO. Klijentov timestamp se cuva odvojeno kao tvrdnja klijenta:
  // koristan je za dijagnostiku (npr. jako razilazenje sata), ali nije dokaz vremena radnje.
  const consentedAt = new Date().toISOString();
  const clientClaimedAt = (() => {
    if (typeof consent.timestamp !== 'string') return null;
    const t = new Date(consent.timestamp);
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
  })();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // rate limit (SEC-06, AUD-23/35): dnevni cap kreiranja checkouta po korisniku PRIJE consent upisa
  // i LS poziva. COUNT nad checkout_consents (indeks user_id, created_at). Sprjecava petlju
  // neogranicenih LS checkout sesija i rasta tablice; isti obrazac kao DAILY_CAP u generate-report.
  const dayAgoIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: recentCheckouts } = await admin
    .from('checkout_consents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gt('created_at', dayAgoIso);
  if ((recentCheckouts ?? 0) >= CHECKOUT_DAILY_CAP) return json({ error: 'rate_limited' }, 429);

  // proizvod iz kataloga (jedina istina o cijenama, sekcija 5 korak 2)
  const { data: prow } = await admin.from('products').select('*').eq('id', productId).eq('active', true).maybeSingle();
  const product = prow ? mapProductRow(prow as Record<string, unknown>) : null;

  // partner grana (sekcija 5 korak 3): aktivan partner racun je uvjet
  let isPartnerActive = false;
  if (product?.audience === 'partner') {
    const { data: pa } = await admin
      .from('partner_accounts')
      .select('status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    isPartnerActive = !!pa;
  }

  const resolution = resolveCheckout(product, { isPartnerActive });
  if (!resolution.ok) return json({ error: resolution.error }, resolution.status);
  // NAPOMENA: uvjet `products.mor_product_id` (naslijedjeni MoR variant id) je uklonjen 2026-09-23.
  // Stripe iznos dolazi iz `products.price_eur`, pa mapiranje po proizvodu vise ne postoji;
  // stupac ostaje u shemi kao naslijedjen i nijedan zivi put naplate ga ne cita.

  // Konfiguracija naplate mora biti potpuna PRIJE nego se korisniku obeca placanje.
  if (!STRIPE_SECRET_KEY || !STRIPE_PUBLISHABLE_KEY) {
    console.error('[create-checkout] stripe_not_configured');
    return json({ error: 'checkout_unavailable' }, 503);
  }
  const amountCents = stripeAmountCents(Number(product!.priceEur));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    console.error('[create-checkout] invalid_price', { productId, priceEur: product!.priceEur });
    return json({ error: 'product_misconfigured' }, 500);
  }

  // WS-5 enforcement: nedvosmislen nesklad vrste rada -> 409 PRIJE biljezenja pristanka i Stripe
  // poziva (ne trosimo consent zapis ni PaymentIntent na kupnju koju odbijamo). Granicno se ne
  // blokira (fail-open); backstop je i u repair-docx prije trosenja slota. Isti ciljni modul.
  const mm = checkoutMismatch(product!.workType, signals, confirmedMismatch);
  if (mm.block) return json({ error: 'tier_mismatch', suggestedWorkType: mm.suggestedWorkType }, 409);

  // trajno zabiljezi pristanak PRIJE nego se otvori placanje (P0 1-1). Ako se ne moze zapisati,
  // ne puste se korisnika na placanje bez zapisanog pristanka.
  const { error: consentErr } = await admin.from('checkout_consents').insert({
    user_id: user.id,
    product_id: productId,
    immediate_delivery: true,
    withdrawal_waived: true,
    // Sprema se KANONSKI tekst za tu verziju, ne ono sto je klijent poslao. Podudarnost je vec
    // dokazana gore, pa je ovo obrana od tihe razlike u prijenosu (CRLF, rubni razmaci) i jamci
    // da su svi zapisi iste verzije bajt-identicni.
    consent_text: canonicalConsentText(termsVersion),
    terms_version: termsVersion,
    consented_at: consentedAt,
    client_claimed_at: clientClaimedAt,
  });
  if (consentErr) return json({ error: 'consent_not_recorded' }, 500);

  // Stripe PaymentIntent. Iznos je serverski (products.price_eur), metadata nosi katalozni
  // products.id po kojem webhook nalazi proizvod.
  const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      // Deterministican kljuc: mrezni retry istog pokusaja ne stvara drugi PaymentIntent.
      // Ne pokriva dva odvojena klika (vidi komentar uz stripeIdempotencyKey).
      'Idempotency-Key': stripeIdempotencyKey(user.id, productId, consentedAt),
    },
    body: buildStripePaymentIntentParams({
      amountCents,
      currency: 'eur',
      userId: user.id,
      productId,
      referralCode,
      receiptEmail: user.email ?? null,
    }),
  });
  if (!stripeRes.ok) {
    // AUD-26: ne prosljeduj sirovo tijelo greske klijentu (otkriva internu strukturu providera).
    // Logiraj detalj serverski (Edge logovi = error tracking, P0 8-1), klijentu vrati genericko.
    console.error('[create-checkout] stripe', stripeRes.status, await stripeRes.text());
    return json({ error: 'checkout_failed' }, 502);
  }
  const intent = (await stripeRes.json()) as StripePaymentIntentResponse;
  if (!intent?.client_secret) return json({ error: 'no_client_secret' }, 502);

  return json({
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id ?? '',
    amountCents: intent.amount ?? amountCents,
    currency: intent.currency ?? 'eur',
    publishableKey: STRIPE_PUBLISHABLE_KEY,
  });
 } catch (e) {
  console.error('[create-checkout]', e); // Supabase Edge Function logovi = error tracking (P0 8-1)
  return json({ error: 'internal' }, 500);
 }
});
