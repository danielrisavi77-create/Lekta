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
import { isReportWorkType, type ReportWorkType } from './pricing';
import { estimateWorkType, unambiguousMismatch, type WorkTypeSignals } from './work-type-estimate';

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

export type CreateCheckoutOutcome =
  | { kind: 'ok'; checkoutUrl: string }
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
    const data = (await res.json().catch(() => ({}))) as { checkoutUrl?: string };
    if (data.checkoutUrl) return { kind: 'ok', checkoutUrl: data.checkoutUrl };
    return { kind: 'error', status: 200, message: 'nedostaje checkoutUrl' };
  }
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 403) return { kind: 'forbidden' };
  if (res.status === 404) return { kind: 'not_found' };
  // 409: nedvosmislen nesklad vrste rada (tier_mismatch) ILI serverska nemapiranost proizvoda.
  // Razlikuje se po error polju; klijent na tier_mismatch ponudi predlozeni tier ili potvrdu.
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; suggestedWorkType?: string };
    if (data?.error === 'tier_mismatch') return { kind: 'tier_mismatch', suggestedWorkType: String(data.suggestedWorkType ?? '') };
    return { kind: 'error', status: 409, message: data?.error ? String(data.error) : 'konflikt' };
  }
  return { kind: 'error', status: res.status, message: `neocekivani odgovor ${res.status}` };
}
