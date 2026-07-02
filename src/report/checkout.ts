/**
 * Checkout core + klijent (MONETIZATION_PLAN.md sekcije 1, 5, 15 korak 2).
 *
 * Cijena je UVIJEK serverska odluka. Klijent salje samo `productId` (+ opcionalni
 * `referralCode`), nikad iznos ni popust (kriterij 14.1). Ciste, testabilne funkcije:
 * `resolveCheckout` (server logika create-checkout Edge Functiona) i `buildLemonSqueezyCheckout`
 * (tijelo LS API poziva). `createCheckout` je klijentski orkestrator s injektabilnim `fetch`
 * i injektiranim Supabase JWT-om (isti uzorak kao report-client).
 */

import type { Product } from '../catalog/products-catalog';

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

export interface LemonCheckoutContext {
  /** Lemon Squeezy store id. */
  storeId: string;
  /** LS variant id (mapiran preko products.mor_product_id). */
  variantId: string;
  userId: string;
  productId: string;
  referralCode?: string | null;
  /** URL na koji LS vraca kupca nakon placanja. */
  redirectUrl?: string;
}

/**
 * Tijelo Lemon Squeezy `POST /v1/checkouts` poziva. `custom` nosi user_id i product_id
 * (webhook ih cita za atribuciju, sekcija 6/8); referral_code samo ako postoji.
 */
export function buildLemonSqueezyCheckout(ctx: LemonCheckoutContext) {
  const custom: Record<string, string> = { user_id: ctx.userId, product_id: ctx.productId };
  if (ctx.referralCode) custom.referral_code = ctx.referralCode;
  const attributes: Record<string, unknown> = { checkout_data: { custom } };
  if (ctx.redirectUrl) attributes.product_options = { redirect_url: ctx.redirectUrl };
  return {
    data: {
      type: 'checkouts',
      attributes,
      relationships: {
        store: { data: { type: 'stores', id: String(ctx.storeId) } },
        variant: { data: { type: 'variants', id: String(ctx.variantId) } },
      },
    },
  };
}

export interface CheckoutClientConfig {
  /** URL create-checkout Edge Functiona; prazno znaci nije konfigurirano. */
  endpoint: string;
}

export type CreateCheckoutOutcome =
  | { kind: 'ok'; checkoutUrl: string }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'not_found' }
  | { kind: 'error'; status?: number; message: string };

/**
 * Payload koji klijent salje serveru. KLJUCNO: samo productId (+ referralCode), nikad
 * cijena ni popust (kriterij 14.1). Server iz productId cita cijenu iz `products`.
 */
export function checkoutRequestPayload(
  productId: string,
  referralCode?: string | null,
): { productId: string; referralCode?: string } {
  return referralCode ? { productId, referralCode } : { productId };
}

/** Pozovi create-checkout i mapiraj HTTP odgovor u ishod za UI. */
export async function createCheckout(
  config: CheckoutClientConfig,
  accessToken: string,
  productId: string,
  referralCode: string | null = null,
  fetchImpl: typeof fetch = fetch,
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
      body: JSON.stringify(checkoutRequestPayload(productId, referralCode)),
    });
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'mrezna greska' };
  }

  if (res.status === 200) {
    const data = (await res.json().catch(() => ({}))) as { checkoutUrl?: string };
    if (data.checkoutUrl) return { kind: 'ok', checkoutUrl: data.checkoutUrl };
    return { kind: 'error', status: 200, message: 'nedostaje checkoutUrl' };
  }
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 403) return { kind: 'forbidden' };
  if (res.status === 404) return { kind: 'not_found' };
  return { kind: 'error', status: res.status, message: `neocekivani odgovor ${res.status}` };
}
