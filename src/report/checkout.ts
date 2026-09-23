/**
 * Checkout core + klijent (MONETIZATION_PLAN.md sekcije 1, 5, 15 korak 2).
 *
 * Cijena je UVIJEK serverska odluka. Klijent salje samo `productId` (+ opcionalni
 * `referralCode`), nikad iznos ni popust (kriterij 14.1). Ciste, testabilne funkcije:
 * `resolveCheckout` (server logika create-checkout Edge Functiona) i
 * `buildStripePaymentIntentParams` (tijelo Stripe PaymentIntent poziva). `createCheckout` je
 * klijentski orkestrator s injektabilnim `fetch` i injektiranim Supabase JWT-om (isti uzorak
 * kao report-client).
 *
 * Naplata je od 2026-09-23 Stripe (odluka vlasnika, F18 u docs/agents/orchestrator-backlog.md).
 * Stripe NIJE Merchant of Record, pa obracun i prijava PDV-a ostaju na vlasniku.
 */

import type { Product } from '../catalog/products-catalog.ts';
import { isReportWorkType, type ReportWorkType } from './pricing.ts';
import { estimateWorkType, unambiguousMismatch, type WorkTypeSignals } from './work-type-estimate.ts';

/** Ishod serverske provjere prava na checkout za dani proizvod i kontekst korisnika. */
export type CheckoutResolution =
  | { ok: true; product: Product }
  | { ok: false; status: 404; error: 'unknown_product' }
  | { ok: false; status: 403; error: 'partner_not_active' };

/**
 * Serverska odluka (sekcija 5, koraci 2-3): nepoznat/neaktivan proizvod -> 404;
 * partner proizvod bez aktivnog partner racuna -> 403; inace ok.
 */
export function resolveCheckout(
  product: Product | null | undefined,
  ctx: { isPartnerActive: boolean },
): CheckoutResolution {
  if (!product || !product.active) return { ok: false, status: 404, error: 'unknown_product' };
  if (product.audience === 'partner' && !ctx.isPartnerActive) {
    return { ok: false, status: 403, error: 'partner_not_active' };
  }
  return { ok: true, product };
}

/**
 * Sanitizirani signali opsega koje klijent smije poslati serveru za provjeru vrste rada:
 * SAMO broj rijeci + enum naslovnickog markera, NIKAD doslovni tekst rada (WS-2/WS-5).
 */
export interface CheckoutMismatchSignals {
  words: number | null;
  titleMarker?: string | null;
}

export type CheckoutMismatchDecision =
  | { block: false }
  | { block: true; suggestedWorkType: ReportWorkType };

/**
 * WS-5 enforcement (serverski backstop pri KUPNJI): blokiraj kupnju jeftinijeg tiera SAMO kad je
 * nedvosmisleno nizi od stvarne vrste rada (naslovnica doslovno kaze visu ILI opseg daleko iznad
 * stropa; v. unambiguousMismatch). Granicno se NE blokira (fail-open; rjesava meko upozorenje +
 * potvrda). `confirmed=true` (korisnik svjesno kupuje nizi) preskace. Proizvodi bez repair-tiera
 * (workType null / partner / pass) se ne provjeravaju. Isti modul je backstop i u repair-docx
 * (prije trosenja slota); ovdje je raniji, UX-ljubazniji gate prije placanja.
 */
export function checkoutMismatch(
  selectedWorkType: string | null | undefined,
  signals: CheckoutMismatchSignals | null | undefined,
  confirmed: boolean,
): CheckoutMismatchDecision {
  if (confirmed || !signals) return { block: false };
  if (!selectedWorkType || !isReportWorkType(selectedWorkType)) return { block: false };
  const sig: WorkTypeSignals = {
    words: signals.words,
    titleMarker: (signals.titleMarker ?? null) as WorkTypeSignals['titleMarker'],
  };
  if (!unambiguousMismatch(selectedWorkType, sig)) return { block: false };
  return { block: true, suggestedWorkType: estimateWorkType(sig).workType };
}

/** Kontekst iz kojeg se gradi Stripe PaymentIntent. Iznos je uvijek serverski izveden. */
export interface StripePaymentIntentContext {
  /** Iznos u NAJMANJOJ jedinici valute (centi), izveden iz `products.price_eur`. */
  amountCents: number;
  /** ISO 4217 kod malim slovima, npr. `eur`. */
  currency: string;
  userId: string;
  /** Katalozni `products.id` (NE naslijedjeni `mor_product_id`); webhook po njemu trazi proizvod. */
  productId: string;
  referralCode?: string | null;
  /** E-mail iz JWT-a; Stripe na njega salje potvrdu o placanju. */
  receiptEmail?: string | null;
}

/** Iznos u centima iz cijene u eurima. Zaokruzuje se, jer Stripe prima samo cijele cente. */
export function stripeAmountCents(priceEur: number): number {
  return Math.round(priceEur * 100);
}

/**
 * Tijelo `POST https://api.stripe.com/v1/payment_intents` (form-urlencoded, ne JSON).
 *
 * `metadata[product_id]` nosi KATALOZNI id proizvoda, pa webhook proizvod trazi po
 * `products.id`. Naslijedjeni stupac `products.mor_product_id` time vise nije ni u jednom
 * zivom putu naplate.
 */
export function buildStripePaymentIntentParams(ctx: StripePaymentIntentContext): string {
  const params = new URLSearchParams();
  params.set('amount', String(ctx.amountCents));
  params.set('currency', ctx.currency.toLowerCase());
  params.set('automatic_payment_methods[enabled]', 'true');
  params.set('metadata[user_id]', ctx.userId);
  params.set('metadata[product_id]', ctx.productId);
  if (ctx.referralCode) params.set('metadata[referral_code]', ctx.referralCode);
  if (ctx.receiptEmail) params.set('receipt_email', ctx.receiptEmail);
  return params.toString();
}

/**
 * Deterministican `Idempotency-Key` za Stripe poziv.
 *
 * OGRANICENJE koje se ne smije predstaviti kao potpuna idempotencija: vrijeme privole je
 * serversko i razlikuje se od pokusaja do pokusaja, pa dva odvojena klika istog korisnika na
 * isti proizvod daju DVA kljuca i dva PaymentIntenta. Kljuc stiti od dvostruke naplate unutar
 * JEDNOG pokusaja (mrezni retry), ne od dva odvojena pokusaja. Protiv drugog stoje dnevni cap
 * u create-checkoutu i unique(provider, order_id) pri knjizenju.
 */
export function stripeIdempotencyKey(userId: string, productId: string, consentedAt: string): string {
  return `lekta:pi:${userId}:${productId}:${consentedAt}`;
}

/** Odgovor Stripe PaymentIntent API-ja, onoliko koliko citamo. */
export interface StripePaymentIntentResponse {
  id?: string;
  client_secret?: string;
  amount?: number;
  currency?: string;
}

export interface CheckoutClientConfig {
  /** URL create-checkout Edge Functiona; prazno znaci nije konfigurirano. */
  endpoint: string;
}

/**
 * Pristanak na trenutnu isporuku digitalnog sadrzaja i odricanje od 14-dnevnog prava na
 * odustanak (Zakon o zastiti potrosaca, cl. 86; EU Direktiva 2011/83). Klijent ga skuplja
 * prije checkouta i salje serveru koji ga trajno biljezi uz narudzbu/entitlement (P0 1-1).
 */
export interface CheckoutConsent {
  /** Pristanak na trenutni pocetak isporuke digitalnog sadrzaja. */
  immediateDelivery: true;
  /** Odricanje od prava na jednostrani raskid u roku od 14 dana. */
  withdrawalWaived: true;
  /** Tocan tekst pristanka koji je korisnik vidio i oznacio. */
  text: string;
  /** ISO 8601 timestamp trenutka pristanka. */
  timestamp: string;
  /** Verzija Uvjeta na snazi u trenutku pristanka. */
  termsVersion: string;
}

/**
 * Ishod checkouta. Od prelaska na Stripe (F18) `ok` ne nosi vise hosted checkout URL nego
 * `clientSecret` za Payment Element koji se montira U STRANICI; `publishableKey` dolazi sa
 * servera da klijent nema build-time env varijablu.
 */
export type CreateCheckoutOutcome =
  | {
      kind: 'ok';
      clientSecret: string;
      paymentIntentId: string;
      amountCents: number;
      currency: string;
      publishableKey: string;
    }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'not_found' }
  | { kind: 'tier_mismatch'; suggestedWorkType: string }
  | { kind: 'error'; status?: number; message: string };

/**
 * Payload koji klijent salje serveru. KLJUCNO: samo productId (+ referralCode), nikad
 * cijena ni popust (kriterij 14.1). Server iz productId cita cijenu iz `products`.
 */
export function checkoutRequestPayload(
  productId: string,
  referralCode?: string | null,
  consent?: CheckoutConsent | null,
  signals?: CheckoutMismatchSignals | null,
  confirmedMismatch?: boolean,
): { productId: string; referralCode?: string; consent?: CheckoutConsent; signals?: CheckoutMismatchSignals; confirmedMismatch?: true } {
  const payload: { productId: string; referralCode?: string; consent?: CheckoutConsent; signals?: CheckoutMismatchSignals; confirmedMismatch?: true } = { productId };
  if (referralCode) payload.referralCode = referralCode;
  if (consent) payload.consent = consent;
  if (signals) payload.signals = signals;
  if (confirmedMismatch) payload.confirmedMismatch = true;
  return payload;
}

/** Pozovi create-checkout i mapiraj HTTP odgovor u ishod za UI. */
export async function createCheckout(
  config: CheckoutClientConfig,
  accessToken: string,
  productId: string,
  referralCode: string | null = null,
  fetchImpl: typeof fetch = fetch,
  consent: CheckoutConsent | null = null,
  signals: CheckoutMismatchSignals | null = null,
  confirmedMismatch = false,
): Promise<CreateCheckoutOutcome> {
  if (!config.endpoint) return { kind: 'error', message: 'checkout endpoint nije konfiguriran' };
  let res: Response;
  try {
    res = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(checkoutRequestPayload(productId, referralCode, consent, signals, confirmedMismatch)),
    });
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'mrezna greska' };
  }

  if (res.status === 200) {
    const data = (await res.json().catch(() => ({}))) as {
      clientSecret?: string;
      paymentIntentId?: string;
      amountCents?: number;
      currency?: string;
      publishableKey?: string;
    };
    if (data.clientSecret && data.publishableKey) {
      return {
        kind: 'ok',
        clientSecret: String(data.clientSecret),
        paymentIntentId: String(data.paymentIntentId ?? ''),
        amountCents: Number(data.amountCents ?? 0),
        currency: String(data.currency ?? 'eur'),
        publishableKey: String(data.publishableKey),
      };
    }
    return { kind: 'error', status: 200, message: 'nedostaje clientSecret' };
  }
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 403) return { kind: 'forbidden' };
  if (res.status === 404) return { kind: 'not_found' };
  // 409: nedvosmislen nesklad vrste rada (tier_mismatch). Razlikuje se po error polju; klijent
  // na tier_mismatch ponudi predlozeni tier ili potvrdu.
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; suggestedWorkType?: string };
    if (data?.error === 'tier_mismatch') return { kind: 'tier_mismatch', suggestedWorkType: String(data.suggestedWorkType ?? '') };
    return { kind: 'error', status: 409, message: data?.error ? String(data.error) : 'konflikt' };
  }
  return { kind: 'error', status: res.status, message: `neocekivani odgovor ${res.status}` };
}
