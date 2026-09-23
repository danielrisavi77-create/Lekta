/**
 * Webhook core (MONETIZATION_PLAN.md sekcija 6). Pruzatelj naplate: Stripe.
 *
 * Ciste, testabilne funkcije koje Deno Edge Function (webhook-mor) zove: provjera
 * `Stripe-Signature` potpisa s vremenskom tolerancijom, normalizacija Stripe dogadjaja, izracun
 * rokova i parametri pass kupona. Mapiranje proizvoda i DB upisi su u Edge Functionu (I/O),
 * odluke su ovdje (pokriva ih npr. check).
 *
 * Prelazak s ranijeg Merchant of Record providera na Stripe je odluka vlasnika 2026-09-23
 * (F18 u docs/agents/orchestrator-backlog.md). Stripe NIJE Merchant of Record, pa PDV
 * obracunava i prijavljuje vlasnik.
 */

/** Dogadjaji koje ovaj webhook stvarno obradjuje. Sve ostalo se prima i ignorira uz 200. */
export const STRIPE_HANDLED_EVENTS = ['payment_intent.succeeded', 'charge.refunded'] as const;
export type StripeHandledEvent = (typeof STRIPE_HANDLED_EVENTS)[number];

/** Stripe webhook payload (labava granica; citamo samo sto trebamo). */
export interface StripeWebhookPayload {
  id?: string;
  type?: string;
  /** true = produkcijski dogadjaj. false = testni nacin rada. Nedostaje = neprovjerljivo. */
  livemode?: boolean;
  /** Connect racun s kojeg dogadjaj dolazi; kod obicnog racuna ga Stripe ne salje. */
  account?: string;
  data?: {
    object?: {
      /** PaymentIntent id (`pi_...`) kod payment_intent.*; kod charge.* je to `charge.payment_intent`. */
      id?: string;
      payment_intent?: string;
      /** PaymentIntent: naplaceno. Charge: ukupan iznos naplate. Oboje u centima. */
      amount?: number;
      amount_received?: number;
      amount_refunded?: number;
      currency?: string;
      refunded?: boolean;
      metadata?: { user_id?: string; product_id?: string; referral_code?: string };
    };
  };
}

export interface StripeEvent {
  /** Stripe `type`, npr. `payment_intent.succeeded`. */
  eventName: string;
  /** Kljuc knjizenja: PaymentIntent id. Isti za uplatu i za njezin povrat. */
  orderId: string;
  userId: string;
  /** `products.id` iz `metadata[product_id]`; webhook po njemu trazi proizvod u katalogu. */
  productId: string;
  /** Referral kod iz metadata (atribucija, sekcija 8); prazno ako ga nema. */
  referralCode: string;
  refunded: boolean;
  /** `livemode` iz payloada; null kad ga payload ne nosi (vidi acceptEvent, fail-closed). */
  livemode: boolean | null;
  /** Testni nacin rada. Testni dogadjaj NE SMIJE proizvesti pravo pravo pristupa. */
  testMode: boolean;
  /** Connect racun iz payloada; prazno ako ga nema. */
  accountId: string;
  /** Ukupno naplaceno u centima, ili null ako ga payload ne nosi. */
  totalCents: number | null;
  /** Vraceni iznos u centima, ili null. Manje od totalCents = djelomicni povrat. */
  refundedCents: number | null;
  /** Valuta (npr. "EUR"), velikim slovima; prazno ako je nema. */
  currency: string;
}

/**
 * Je li povrat POTPUN. Djelomican povrat ne smije oduzeti cijelo pravo pristupa (PAY-09).
 *
 * Kad iznosi nisu poznati (stariji ili krnji payload), vraca se true, jer je za korisnika
 * sigurnije previse oduzeti nego naplatiti nesto sto je vraceno; ta se odluka vidi u logu.
 */
export function isFullRefund(ev: Pick<StripeEvent, 'refunded' | 'totalCents' | 'refundedCents'>): boolean {
  if (!ev.refunded) return false;
  if (ev.totalCents === null || ev.refundedCents === null) return true;
  return ev.refundedCents >= ev.totalCents;
}

/**
 * Smije li se dogadjaj UOPCE obraditi, prije ikakvog dodjeljivanja prava (PAY-04, PAY-05).
 *
 * Potpis dokazuje samo da posiljatelj zna tajnu, ne i da dogadjaj dolazi iz NASEG okruzenja i
 * da je vrsta koju uopce znamo knjiziti. Testni dogadjaj s ispravnim potpisom inace bi
 * proizveo pravo pravo pristupa.
 *
 * FAIL-CLOSED, isti duh kao prijasnji prazan `LS_STORE_ID` koji je odbijao sve: `livemode`
 * koji payload ne nosi je NEPROVJERLJIVO porijeklo, ne "vjerojatno produkcija". Provjera
 * ocekivanog Connect racuna radi se samo kad je `expectedAccountId` postavljen; prazno znaci
 * obican (ne Connect) racun, pa se preskace uz eksplicitan razlog u tipu ishoda.
 */
export function acceptEvent(
  ev: Pick<StripeEvent, 'livemode' | 'eventName' | 'accountId'>,
  opts: { allowTestMode: boolean; expectedAccountId?: string },
):
  | { ok: true }
  | { ok: false; reason: 'livemode_unverifiable' | 'test_mode_refused' | 'account_mismatch' | 'event_ignored' } {
  if (ev.livemode === null) return { ok: false, reason: 'livemode_unverifiable' };
  if (!ev.livemode && !opts.allowTestMode) return { ok: false, reason: 'test_mode_refused' };
  const expected = String(opts.expectedAccountId ?? '').trim();
  if (expected && ev.accountId && ev.accountId !== expected) return { ok: false, reason: 'account_mismatch' };
  if (!(STRIPE_HANDLED_EVENTS as readonly string[]).includes(ev.eventName)) {
    return { ok: false, reason: 'event_ignored' };
  }
  return { ok: true };
}

/**
 * Normaliziraj Stripe payload u ravni event.
 *
 * `orderId` je UVIJEK PaymentIntent id: kod `payment_intent.succeeded` je to `data.object.id`,
 * kod `charge.refunded` je to `data.object.payment_intent`. Time uplata i njezin povrat dijele
 * isti kljuc, pa refund pogodi tocno onaj entitlement koji je uplata stvorila.
 */
export function parseStripeEvent(payload: StripeWebhookPayload): StripeEvent {
  const eventName = String(payload.type ?? '');
  const obj = payload.data?.object ?? {};
  const meta = obj.metadata ?? {};
  const isCharge = eventName.startsWith('charge.');
  // Kod naplate bez PaymentIntenta (naslijedjena izravna naplata) orderId ostaje PRAZAN, a ne
  // charge id: kljuc koji ne moze pogoditi nijedan entitlement lagao bi da je povrat proveden.
  const orderId = String((isCharge ? obj.payment_intent : (obj.id ?? obj.payment_intent)) ?? '');
  const refunded = eventName === 'charge.refunded' || obj.refunded === true;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  // PaymentIntent nosi stvarno naplaceno u `amount_received`; Charge ukupan iznos u `amount`.
  const totalCents = isCharge ? num(obj.amount) : (num(obj.amount_received) ?? num(obj.amount));
  const livemode = typeof payload.livemode === 'boolean' ? payload.livemode : null;
  return {
    eventName,
    orderId,
    userId: String(meta.user_id ?? ''),
    productId: String(meta.product_id ?? ''),
    referralCode: String(meta.referral_code ?? ''),
    refunded,
    livemode,
    testMode: livemode === false,
    accountId: String(payload.account ?? ''),
    totalCents,
    refundedCents: num(obj.amount_refunded),
    currency: String(obj.currency ?? '').toUpperCase(),
  };
}

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Usporedba iste duljine bez ranog izlaza (otpornije na timing). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Najveca dopustena razlika izmedju `t` iz potpisa i naseg sata, u sekundama.
 *
 * Bez nje bi jednom presretnut valjan zahtjev bio upotrebljiv zauvijek (replay): potpis ostaje
 * matematicki ispravan koliko god da je star, jer tajna se ne mijenja.
 */
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

/** Razlozen ishod provjere potpisa; razlog ide u log, nikad u odgovor klijentu. */
export type StripeSignatureResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'missing_secret' | 'missing_signature' | 'malformed_header' | 'timestamp_out_of_tolerance' | 'signature_mismatch';
    };

/** Rastavi `Stripe-Signature` zaglavlje oblika `t=1699999999,v1=abc,v1=def`. */
export function parseStripeSignatureHeader(header: string): { timestamp: number | null; signatures: string[] } {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 't') {
      const n = Number(value);
      if (Number.isFinite(n)) timestamp = n;
    } else if (key === 'v1' && value) {
      signatures.push(value.toLowerCase());
    }
  }
  return { timestamp, signatures };
}

/**
 * Provjeri Stripe potpis: HMAC-SHA256 tajnim kljucem nad `${t}.${raw}`, hex, timing-safe.
 *
 * Prihvaca se ako se IJEDAN `v1` podudara (Stripe ih salje vise za vrijeme rotacije tajne).
 * `nowMs` je injektabilan da se istekao potpis moze dokazati bez cekanja od pet minuta.
 * Prazan tajni kljuc odbija SVE: nekonfiguriran gate ne smije znaciti "propusti sve".
 */
export async function verifyStripeSignature(
  raw: string,
  header: string | null | undefined,
  secret: string,
  nowMs: number = Date.now(),
  toleranceSeconds: number = STRIPE_SIGNATURE_TOLERANCE_SECONDS,
): Promise<StripeSignatureResult> {
  if (!secret) return { ok: false, reason: 'missing_secret' };
  if (!header) return { ok: false, reason: 'missing_signature' };
  const { timestamp, signatures } = parseStripeSignatureHeader(header);
  if (timestamp === null || signatures.length === 0) return { ok: false, reason: 'malformed_header' };
  if (Math.abs(Math.floor(nowMs / 1000) - timestamp) > toleranceSeconds) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = toHex(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${raw}`)));
  // Sve kandidate provjeravamo do kraja: ranim izlazom bi trajanje odavalo koji je kandidat blizi.
  let matched = false;
  for (const candidate of signatures) {
    if (timingSafeEqual(mac, candidate)) matched = true;
  }
  return matched ? { ok: true } : { ok: false, reason: 'signature_mismatch' };
}

/** ISO vrijeme za `now + days` (rok potrosnje entitlementa ili trajanje kupona). */
export function isoAfterDays(nowMs: number, days: number): string {
  return new Date(nowMs + days * 24 * 3600 * 1000).toISOString();
}

/** Podskup proizvoda koji webhook treba za entitlement (izbjegava vezanje na cijeli Product). */
export interface EntitlementProduct {
  id: string;
  workType: string | null;
  slotsTotal: number;
  purchaseWindowDays: number;
}

export interface EntitlementInsert {
  user_id: string;
  work_type: string;
  slots_total: number;
  product_id: string;
  order_id: string;
  provider: string;
  purchase_expires_at: string;
}

/**
 * Redak entitlementa iz proizvoda + eventa (kriteriji 14.3/14.4): tocni product_id, work_type,
 * slots_total (npr. pass -> 6) i purchase_expires_at = now + purchase_window_days.
 */
export function buildEntitlementInsert(
  product: EntitlementProduct,
  ev: { userId: string; orderId: string },
  provider: string,
  nowMs: number,
): EntitlementInsert {
  return {
    user_id: ev.userId,
    work_type: product.workType ?? '',
    slots_total: product.slotsTotal,
    product_id: product.id,
    order_id: ev.orderId,
    provider,
    purchase_expires_at: isoAfterDays(nowMs, product.purchaseWindowDays),
  };
}

// Pass bonus kupon (sekcija 6.5): jednokratni -20%, vrijedi na slot_zavrsni i slot_diplomski.
export const PASS_COUPON_DISCOUNT = 20;
export const PASS_COUPON_VALID_DAYS = 120;
export const PASS_COUPON_APPLIES_TO = ['slot_zavrsni', 'slot_diplomski'] as const;

export function isPassProduct(kind: string): boolean {
  return kind === 'pass';
}

/** Deterministicni kod kupona iz orderId (re-delivery ne stvara novi zapis jer se kupon
 *  izdaje samo uz tek kreiran entitlement). */
export function makePassCouponCode(orderId: string): string {
  const tail = orderId.replace(/[^A-Za-z0-9]/g, '').slice(-10).toUpperCase();
  return `PASS-${tail || 'BONUS'}`;
}
