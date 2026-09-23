/**
 * Webhook core (MONETIZATION_PLAN.md sekcija 6). Merchant of Record: Lemon Squeezy.
 *
 * Ciste, testabilne funkcije koje Deno Edge Function (webhook-mor) zove: provjera HMAC
 * potpisa, normalizacija LS eventa, izracun rokova i parametri pass kupona. Mapiranje
 * proizvoda i DB upisi su u Edge Functionu (I/O), odluke su ovdje (pokriva ih npr. check).
 */

/** Lemon Squeezy webhook payload (labava granica; citamo samo sto trebamo). */
export interface LemonWebhookPayload {
  meta?: {
    event_name?: string;
    /** LS salje test_mode u meta; true = dogadjaj iz testnog nacina rada. */
    test_mode?: boolean;
    custom_data?: { user_id?: string; product_id?: string; referral_code?: string };
  };
  data?: {
    id?: string | number;
    attributes?: {
      order_id?: string | number;
      status?: string;
      refunded?: boolean;
      variant_id?: string | number;
      first_order_item?: { variant_id?: string | number };
      /** Trgovina iz koje dogadjaj dolazi. Bez provjere bi tudja trgovina prosla kao nasa. */
      store_id?: string | number;
      /** Ukupno naplaceno, u NAJMANJOJ jedinici valute (centi). */
      total?: number;
      /** Koliko je vraceno, u centima. Manje od total = djelomicni povrat. */
      refunded_amount?: number;
      currency?: string;
      test_mode?: boolean;
    };
  };
}

export interface LemonEvent {
  eventName: string;
  /**
   * `data.attributes.status` doslovno (npr. `paid`, `pending`, `refunded`); prazno ako ga nema.
   *
   * Bez njega se `order_created` nije moglo razlikovati od PLACENOG `order_created`: Lemon Squeezy
   * salje isti event_name i za narudzbu koja jos nije placena.
   */
  status: string;
  orderId: string;
  userId: string;
  /** LS variant id = products.mor_product_id (mapiranje proizvoda, sekcija 6.2). */
  variantId: string;
  /** Referral kod iz checkout custom_data (atribucija, sekcija 8); prazno ako ga nema. */
  referralCode: string;
  refunded: boolean;
  /** Trgovina iz koje dogadjaj dolazi; prazno ako ga LS nije poslao (vidi acceptEvent). */
  storeId: string;
  /** Testni nacin rada. Testni dogadjaj NE SMIJE proizvesti pravo pravo pristupa. */
  testMode: boolean;
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
export function isFullRefund(ev: Pick<LemonEvent, 'refunded' | 'totalCents' | 'refundedCents'>): boolean {
  if (!ev.refunded) return false;
  if (ev.totalCents === null || ev.refundedCents === null) return true;
  return ev.refundedCents >= ev.totalCents;
}

/**
 * Smije li se dogadjaj UOPCE obraditi, prije ikakvog dodjeljivanja prava (PAY-04, PAY-05).
 *
 * Potpis dokazuje samo da posiljatelj zna tajnu, ne i da dogadjaj pripada NASOJ trgovini i
 * NASEM okruzenju. Testni kljuc s ispravnim potpisom, ili valjano potpisan dogadjaj druge
 * trgovine, inace bi proizveo pravo pravo pristupa.
 *
 * `expectedStoreId` prazan = provjera trgovine se preskace (uz eksplicitan razlog u odgovoru),
 * jer je bolje jasno reci da gate nije konfiguriran nego se pretvarati da je provjeren.
 */
export function acceptEvent(
  ev: Pick<LemonEvent, 'storeId' | 'testMode'>,
  opts: { expectedStoreId: string; allowTestMode: boolean },
): { ok: true } | { ok: false; reason: 'store_mismatch' | 'test_mode_refused' | 'store_unverifiable' } {
  if (ev.testMode && !opts.allowTestMode) return { ok: false, reason: 'test_mode_refused' };
  const expected = String(opts.expectedStoreId ?? '').trim();
  if (!expected) return { ok: false, reason: 'store_unverifiable' };
  if (!ev.storeId) return { ok: false, reason: 'store_unverifiable' };
  if (ev.storeId !== expected) return { ok: false, reason: 'store_mismatch' };
  return { ok: true };
}

/** Normaliziraj LS payload u ravni event. Defenzivno prema oblicima order/subscription. */
export function parseLemonEvent(payload: LemonWebhookPayload): LemonEvent {
  const meta = payload.meta ?? {};
  const data = payload.data ?? {};
  const attr = data.attributes ?? {};
  const eventName = String(meta.event_name ?? '');
  const status = String(attr.status ?? '');
  const orderId = String(data.id ?? attr.order_id ?? '');
  const userId = String(meta.custom_data?.user_id ?? '');
  const variantId = String(attr.first_order_item?.variant_id ?? attr.variant_id ?? '');
  const referralCode = String(meta.custom_data?.referral_code ?? '');
  // Status se za ODLUKE normalizira (trim + mala slova), a `status` polje ostaje doslovno, da se u
  // inboxu vidi tocno ono sto je provider poslao. Bez normalizacije bi `Refunded` ili ` paid ` bili
  // druga vrijednost od `refunded` odnosno `paid`, a razlika je izmedju ugasenog i zivog prava.
  const statusKey = status.trim().toLowerCase();
  const refunded = eventName === 'order_refunded' || statusKey === 'refunded' || attr.refunded === true;
  const storeId = attr.store_id != null ? String(attr.store_id) : '';
  const testMode = meta.test_mode === true || attr.test_mode === true;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    eventName,
    status,
    orderId,
    userId,
    variantId,
    referralCode,
    refunded,
    storeId,
    testMode,
    totalCents: num(attr.total),
    refundedCents: num(attr.refunded_amount),
    currency: String(attr.currency ?? '').toUpperCase(),
  };
}

/** Sto webhook smije napraviti s dogadjajem. */
export type LemonEventKind = 'paid' | 'refund' | 'ignored' | 'needs_manual_link';

export interface LemonClassification {
  kind: LemonEventKind;
  /** Kratak strojni razlog; upisuje se u `webhook_events.outcome_detail` i vraca pozivatelju. */
  reason?: string;
}

/**
 * ODLUKA STO S DOGADJAJEM (blokeri lansiranja, 2026-09-22). Cista funkcija; Edge funkcija ju samo
 * zove.
 *
 * Do sada je handler obradjivao SVE sto je proslo potpis i porijeklo: `order_created` se tretirao
 * kao placen bez gledanja na `attributes.status`, pa bi narudzba u statusu `pending` ili `failed`
 * dobila puno pravo pristupa. Dogadjaji pretplata i licenci (`subscription_*`, `license_*`) nisu
 * nasi, ali bi pali u istu granu i zavrsili kao `unknown_product`, dakle kao kvar koji netko treba
 * gledati.
 *
 * Prihvaca se tocno jedna kupnja: `order_created` sa statusom `paid` (usporedba ide nad statusom
 * bez razmaka i u malim slovima). Povrat se prepoznaje SIRE, po `ev.refunded`, koja je istinita i
 * za `order_refunded` i za bilo koji dogadjaj sa `attributes.status = 'refunded'` ili
 * `attributes.refunded = true`. Sve ostalo je `ignored` s imenovanim razlogom, i to je 200, jer
 * retry ne bi promijenio ishod.
 *
 * `ignored` NIJE tiho: handler svaki takav dogadjaj upisuje u inbox i logira. Vidi `isNotableIgnore`
 * za razliku izmedju neplacene narudzbe (tice se novca) i dogadjaja koji nam uopce ne pripada.
 *
 * Povrat NE trazi `userId`: obrada ide po `order_id` (gasenje entitlementa, povlacenje referral
 * nagrade), pa korisnik uz dogadjaj nije ni potreban. Placena narudzba BEZ
 * `meta.custom_data.user_id` je pak stvaran slucaj (kupnja izvan naseg checkouta, izgubljen custom
 * data): nju se ne smije odbaciti s 400, jer je novac naplacen. Zato `needs_manual_link`: dogadjaj
 * ostaje u inboxu s tim ishodom i veze se rucno.
 */
export function classifyLemonEvent(
  ev: Pick<LemonEvent, 'eventName' | 'status' | 'userId' | 'refunded'>,
): LemonClassification {
  // POVRAT PRVI, po ZASTAVICI, prije imena dogadjaja (nalaz pregleda 2026-09-23).
  //
  // Prva verzija ove funkcije gledala je `ev.refunded` tek unutar `order_created`, pa je povrat
  // prepoznavala iskljucivo po imenu `order_refunded`. Stari handler je u refund granu ulazio na
  // `ev.refunded`, koju `parseLemonEvent` racuna i iz `attributes.status === 'refunded'` i iz
  // `attributes.refunded === true`. Suzenje na ime bi znacilo: dogadjaj koji nosi vracen novac pod
  // nekim drugim imenom zavrsi kao `ignored` s 200, entitlement ostane aktivan, referral nagrada se
  // ne povuce, i to bez retryja. Zastavica je sira od imena i zato je ona ulaz u granu.
  if (ev.refunded || ev.eventName === 'order_refunded') return { kind: 'refund' };
  if (ev.eventName === 'order_created') {
    const status = ev.status.trim().toLowerCase();
    if (status !== 'paid') return { kind: 'ignored', reason: `order_status:${status || 'nepoznat'}` };
    if (!ev.userId) return { kind: 'needs_manual_link', reason: 'bez_user_id' };
    return { kind: 'paid' };
  }
  return { kind: 'ignored', reason: `nepodrzan_dogadjaj:${ev.eventName || 'nepoznat'}` };
}

/**
 * Je li `ignored` dogadjaj takav da ga netko MORA pogledati.
 *
 * `order_created` koji nije placen tice se stvarne narudzbe i stvarnog novca: Lemon Squeezy nema
 * `order_updated`, pa narudzba koja je ovdje odbijena kao neplacena nikad nece dobiti drugi
 * dogadjaj. Ako se pretpostavka o vrijednosti `paid` ikad pokaze krivom, ovo je jedino mjesto na
 * kojem se to vidi, i zato takav ishod ide u log kao greska. `subscription_*`, `license_*` i
 * nepoznata imena su druga klasa: njih po runbooku ne bismo ni trebali primati.
 */
export function isNotableIgnore(c: Pick<LemonClassification, 'reason'>): boolean {
  return String(c.reason ?? '').startsWith('order_status:');
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
 * Provjeri Lemon Squeezy HMAC-SHA256 potpis (`X-Signature`, hex) nad sirovim tijelom.
 * Web Crypto (radi u Deno i Node). Prazan secret ili potpis -> false.
 */
export async function verifyLemonSignature(
  raw: string,
  signature: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(raw));
  return timingSafeEqual(toHex(mac), signature.trim().toLowerCase());
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
