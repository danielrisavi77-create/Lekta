// Lekta Edge Function: create-checkout, JEZGRA HANDLERA (Deno i Node).
//
// Izdvojeno iz index.ts 2026-09-26 (F18 krug 2) da se put handlera moze IZVRSITI u testu:
// index.ts cita okolinu i stvara Supabase klijente, a ovdje je sva obrada zahtjeva. Opis toka i
// odluka stoji u zaglavlju index.ts i uz svaki korak nize.
//
// deno-lint-ignore-file no-explicit-any
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

/**
 * Sve sto handler dobiva izvana. Okolina (`Deno.env`) i Supabase klijenti se stvaraju SAMO u
 * index.ts; ovdje stizu kao vrijednosti, pa se handler moze izvrsiti u Vitestu s laznom bazom i
 * laznim Stripeom (tests/create-checkout-handler.test.ts).
 */
export interface CheckoutDeps {
  /** Klijent s korisnikovim JWT-om (auth.getUser). */
  asUser: (token: string) => any;
  /** Service role klijent. */
  admin: () => any;
  stripeSecretKey: string;
  /** Publishable kljuc NIJE tajna; vraca se klijentu u odgovoru. */
  stripePublishableKey: string;
  /** Dnevni limit kreiranja checkouta po korisniku (SEC-06, AUD-23/35). */
  dailyCap: number;
  allowedOrigins: string[];
  /** Samo testovi: zamjena za globalni fetch i sat. */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function createCheckoutHandler(deps: CheckoutDeps): (req: Request) => Promise<Response> {
 return async (req: Request): Promise<Response> => {
 const cors = corsHeadersFor(req.headers.get('Origin'), deps.allowedOrigins);
 const json = (body: unknown, status = 200): Response =>
   new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
 try {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // auth: Supabase JWT obavezan (sekcija 5, korak 1)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const asUser = deps.asUser(token);
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
  const nowMs = deps.now?.() ?? Date.now();
  const consentedAt = new Date(nowMs).toISOString();
  const clientClaimedAt = (() => {
    if (typeof consent.timestamp !== 'string') return null;
    const t = new Date(consent.timestamp);
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
  })();

  const admin = deps.admin();

  // rate limit (SEC-06, AUD-23/35): dnevni cap kreiranja checkouta po korisniku PRIJE consent upisa
  // i Stripe poziva. COUNT nad checkout_consents (indeks user_id, created_at). Sprjecava petlju
  // neogranicenih PaymentIntenta i rasta tablice; isti obrazac kao DAILY_CAP u generate-report.
  const dayAgoIso = new Date(nowMs - 24 * 3600 * 1000).toISOString();
  const { count: recentCheckouts } = await admin
    .from('checkout_consents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gt('created_at', dayAgoIso);
  if ((recentCheckouts ?? 0) >= deps.dailyCap) return json({ error: 'rate_limited' }, 429);

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
  if (!deps.stripeSecretKey || !deps.stripePublishableKey) {
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
  const stripeRes = await (deps.fetchImpl ?? fetch)('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${deps.stripeSecretKey}`,
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
    publishableKey: deps.stripePublishableKey,
  });
 } catch (e) {
  console.error('[create-checkout]', e); // Supabase Edge Function logovi = error tracking (P0 8-1)
  return json({ error: 'internal' }, 500);
 }
};
}
