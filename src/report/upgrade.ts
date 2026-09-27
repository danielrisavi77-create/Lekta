/**
 * Nadogradnja Repair -> Final Pass (docs/decisions/MONETIZACIJA_V1.md odjeljak 14).
 *
 *   upgrade_price = target_final_pass_price - already_paid_eligible_amount
 *
 * Cista odluka koju zovu OBJE serverske strane: create-checkout (koliko naplatiti) i webhook-mor
 * (je li naplaceno ono sto je trebalo, prije pretvorbe prava). Klijent salje samo namjeru: ciljni
 * productId i id postojeceg prava. Iznos nikad ne dolazi od klijenta: ciljna cijena je
 * `products.price_eur`, a odbitak je `entitlements.paid_amount_cents`, stvarno naplacen iznos
 * zapisan pri kupnji Repaira.
 *
 * Modul nema nijednu cijenu. Pravila iz odjeljka 14 i 29, doslovno:
 *  - ISTI RAD I ISTA VRSTA RADA: nadogradjuje se jedno konkretno pravo (entitlement), i to samo na
 *    Final Pass iste vrste rada. Pretvara se ISTI redak, pa vezani slot (otisak dokumenta) ostaje isti.
 *  - NIKAD PUNA CIJENA PONOVNO: odbija se stvarno placeni iznos istog prava.
 *  - JEDNOM: pravo koje je vec nadogradjeno ne moze se nadograditi ponovno.
 *  - ROK: pravo mora biti aktivno i unutar roka potrosnje (`purchase_expires_at`). Odjeljak 14 drugi
 *    rok ne propisuje, pa ga ovaj modul ne izmislja.
 *  - VEZANI RAD JE JOS PREPOZNATLJIV: ako je Repair vec vezan uz rad (`slots_used > 0`), otisak
 *    njegova slota mora biti netaknut, tj. jos neanonimiziran. Istek prozora slota NIJE granica
 *    (krug 4, odjeljak 14: korisnik koji je prvo kupio Repair ne smije biti kaznjen). Granica je
 *    anonimizacija: purge_document_slots (0016) 30 dana nakon isteka brise naslov, autora i
 *    poglavlja iz otiska, i tek bi tada nadogradnja produljila prazan otisak koji ne prepoznaje
 *    nijednu verziju rada (placen Final Pass bez ijedne upotrebe, nalaz pregleda kruga 3). Do tada
 *    nadogradnja ISTI slot ozivi na prozor Final Passa (apply_entitlement_upgrade, greatest(...)).
 *    Kriterij je isti kao u bazi: otisak ima barem jedan kljuc koji purge brise
 *    (ANONYMIZED_FINGERPRINT_KEYS). Nevezan Repair (`slots_used = 0`) se smije nadograditi; slot
 *    tada nastaje tek pri prvoj upotrebi, s prozorom Final Passa.
 *  - PRIZNATO JE SAMO PLACENO: interna nagrada (provider `internal`) ili pravo bez zapisanog
 *    placenog iznosa ne umanjuje cijenu; takav zahtjev se odbija, ne pogadja iz danasnjeg cjenika.
 */

/** Ponuda koja se nadogradjuje (Repair, jedan slot). */
export const UPGRADE_SOURCE_OFFER = 'repair_v1';
/** Ponuda na koju se nadogradjuje (Final Pass). Semester Pass nije cilj nadogradnje. */
export const UPGRADE_TARGET_OFFER = 'final_pass_v1';
/** Pruzatelj cija se uplata priznaje kao vec placeno. */
export const UPGRADE_PAID_PROVIDER = 'stripe';

export interface UpgradeTarget {
  id: string;
  kind: string;
  active: boolean;
  workType: string | null;
  offerCode: string | null;
  /** products.price_eur ciljnog Final Passa. */
  priceEur: number;
}

/** Redak `entitlements` koji se nadogradjuje, onoliko koliko odluka treba. */
export interface UpgradeSource {
  id: string;
  userId: string;
  workType: string;
  status: string;
  provider: string;
  slotsTotal: number;
  /** Koliko je slotova prava vec vezano uz rad (Repair: 0 ili 1). */
  slotsUsed: number;
  offerCode: string | null;
  /** Stvarno naplaceno pri kupnji Repaira; null = nepoznato. */
  paidAmountCents: number | null;
  purchaseExpiresAt: string;
  /** PaymentIntent koji je ovo pravo vec nadogradio; null = nije. */
  upgradeOrderId: string | null;
  /** PaymentIntent izvorne (Repair) uplate; po njemu se trazi oznaka djelomicnog povrata. */
  orderId?: string;
  /**
   * Izvorna uplata je djelomicno vracena (`partial_refund_noted` u inboxu). Priznati iznos tada nije
   * vise `paidAmountCents`, a entitlement ne biljezi vraceni dio, pa se nadogradnja odbija.
   */
  partiallyRefunded?: boolean;
  /**
   * Postoji vezani slot ovog prava ciji otisak jos nije anonimiziran (readBoundSlotIntact). Istek
   * prozora slota ovdje nije bitan. Cita ga pozivatelj zasebnim upitom; `undefined` znaci "nije
   * procitano" i za vezano pravo se tumaci kao anonimiziran slot (fail-closed).
   */
  boundSlotIntact?: boolean;
}

export const UPGRADE_REFUSALS = Object.freeze([
  'upgrade_target_invalid',
  'upgrade_source_not_found',
  'upgrade_source_not_paid',
  'upgrade_source_not_repair',
  'upgrade_work_type_mismatch',
  'upgrade_source_inactive',
  'upgrade_source_expired',
  'upgrade_slot_anonymized',
  'upgrade_already_applied',
  'upgrade_paid_amount_unknown',
  'upgrade_source_partially_refunded',
  'upgrade_amount_invalid',
] as const);
export type UpgradeRefusal = (typeof UPGRADE_REFUSALS)[number];

export type UpgradeQuote =
  | { ok: true; amountCents: number; targetCents: number; creditCents: number }
  | { ok: false; error: UpgradeRefusal };

/** Cijena u centima iz eura, isto zaokruzivanje kao stripeAmountCents u checkout.ts. */
function cents(priceEur: number): number {
  return Math.round(priceEur * 100);
}

/**
 * Koliko naplatiti nadogradnju, ili zasto nije dopustena. `userId` je korisnik iz JWT-a
 * (create-checkout) ili iz metadate potvrdjene uplate (webhook).
 */
export function quoteUpgrade(
  target: UpgradeTarget | null | undefined,
  source: UpgradeSource | null | undefined,
  userId: string,
  nowMs: number,
): UpgradeQuote {
  if (!target || !target.active || target.kind !== 'pass' || target.offerCode !== UPGRADE_TARGET_OFFER || !target.workType) {
    return { ok: false, error: 'upgrade_target_invalid' };
  }
  const targetCents = cents(Number(target.priceEur));
  if (!Number.isFinite(targetCents) || targetCents <= 0) return { ok: false, error: 'upgrade_target_invalid' };

  // Tudje pravo je za korisnika nepostojece pravo: ne otkriva se da postoji.
  if (!source || !userId || source.userId !== userId) return { ok: false, error: 'upgrade_source_not_found' };
  if (source.provider !== UPGRADE_PAID_PROVIDER) return { ok: false, error: 'upgrade_source_not_paid' };
  if (source.offerCode !== UPGRADE_SOURCE_OFFER || source.slotsTotal !== 1) {
    return { ok: false, error: 'upgrade_source_not_repair' };
  }
  if (source.workType !== target.workType) return { ok: false, error: 'upgrade_work_type_mismatch' };
  if (source.upgradeOrderId) return { ok: false, error: 'upgrade_already_applied' };
  if (source.status !== 'active') return { ok: false, error: 'upgrade_source_inactive' };
  const expires = Date.parse(source.purchaseExpiresAt);
  if (!Number.isFinite(expires) || expires <= nowMs) return { ok: false, error: 'upgrade_source_expired' };
  if (!Number.isInteger(source.slotsUsed) || source.slotsUsed < 0) return { ok: false, error: 'upgrade_source_not_repair' };
  if (source.slotsUsed > 0 && source.boundSlotIntact !== true) return { ok: false, error: 'upgrade_slot_anonymized' };

  const paid = source.paidAmountCents;
  if (typeof paid !== 'number' || !Number.isInteger(paid) || paid <= 0) {
    return { ok: false, error: 'upgrade_paid_amount_unknown' };
  }
  if (source.partiallyRefunded) return { ok: false, error: 'upgrade_source_partially_refunded' };
  const amountCents = targetCents - paid;
  // Placeno jednako ili vise od ciljne cijene: nema sto naplatiti, a nula ili negativan iznos nije
  // PaymentIntent. Takav slucaj rjesava covjek, ne automatika.
  if (amountCents <= 0) return { ok: false, error: 'upgrade_amount_invalid' };
  return { ok: true, amountCents, targetCents, creditCents: paid };
}

/** Redak `entitlements` iz PostgREST-a -> UpgradeSource. Nepotpun redak daje null (fail-closed). */
export function mapUpgradeSourceRow(row: unknown): UpgradeSource | null {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  if (!str(r.id) || !str(r.user_id)) return null;
  const paid = r.paid_amount_cents;
  return {
    id: str(r.id),
    userId: str(r.user_id),
    workType: str(r.work_type),
    status: str(r.status),
    provider: str(r.provider),
    slotsTotal: typeof r.slots_total === 'number' ? r.slots_total : Number.NaN,
    slotsUsed: typeof r.slots_used === 'number' ? r.slots_used : Number.NaN,
    offerCode: str(r.offer_code) || null,
    paidAmountCents: typeof paid === 'number' ? paid : null,
    purchaseExpiresAt: str(r.purchase_expires_at),
    upgradeOrderId: str(r.upgrade_order_id) || null,
    orderId: str(r.order_id),
  };
}

/** Stupci koje obje strane citaju za odluku; jedan popis da se upiti ne razidju. */
export const UPGRADE_SOURCE_COLUMNS =
  'id, user_id, work_type, status, provider, slots_total, slots_used, offer_code, paid_amount_cents, purchase_expires_at, upgrade_order_id, order_id';

/**
 * Kljucevi otiska koje purge_document_slots (0016) brise pri anonimizaciji. Otisak koji ima barem
 * jedan od njih jos prepoznaje rad; isti kriterij provodi apply_entitlement_upgrade u bazi
 * (`fingerprint ?| array[...]`), pa se dvije strane ne mogu razici bez da gard to vidi.
 */
export const ANONYMIZED_FINGERPRINT_KEYS = Object.freeze(['authorNorm', 'titleNorm', 'headings'] as const);

/** Je li otisak jos netaknut (nije anonimiziran). Sve sto nije objekt je anonimizirano (fail-closed). */
export function fingerprintIntact(fingerprint: unknown): boolean {
  if (typeof fingerprint !== 'object' || fingerprint === null || Array.isArray(fingerprint)) return false;
  return ANONYMIZED_FINGERPRINT_KEYS.some((k) => Object.prototype.hasOwnProperty.call(fingerprint, k));
}

/** Upit supabase-js graditelja, onoliko koliko ga citanja nadogradnje trebaju. */
export interface UpgradeReadQuery extends PromiseLike<{ data: unknown; error: unknown }> {
  eq(column: string, value: string): UpgradeReadQuery;
  limit(count: number): UpgradeReadQuery;
}
export interface BoundSlotDb {
  from(table: 'document_slots'): { select(columns: string): UpgradeReadQuery };
}
export interface PartialRefundDb {
  from(table: 'webhook_events'): { select(columns: string): UpgradeReadQuery };
}

function readError(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : String(error);
}

/**
 * Upit "ima li ovo pravo vezani slot ciji otisak jos nije anonimiziran". Obje strane (create-checkout
 * i webhook-mor) ga zovu istim oblikom; apply_entitlement_upgrade (0207) istu provjeru ponavlja
 * atomski u bazi, uz zakljucavanje slota protiv istodobnog purgea.
 */
export async function readBoundSlotIntact(
  admin: BoundSlotDb,
  entitlementId: string,
): Promise<{ ok: true; intact: boolean } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from('document_slots')
    .select('id, fingerprint')
    .eq('entitlement_id', entitlementId);
  if (error) return { ok: false, error: readError(error) };
  const rows = Array.isArray(data) ? data : [];
  return {
    ok: true,
    intact: rows.some((r) => typeof r === 'object' && r !== null && fingerprintIntact((r as Record<string, unknown>).fingerprint)),
  };
}

/**
 * Je li izvorna (Repair) uplata djelomicno vracena: oznaka `partial_refund_noted` istog
 * PaymentIntenta u inboxu. Obje strane (create-checkout prije naplate i webhook-mor prije pretvorbe)
 * je citaju istim upitom, pa webhook ne donosi odluku s nepoznatim `partiallyRefunded` (krug 4).
 * Pad citanja je greska, ne "nema povrata".
 */
export async function readSourcePartiallyRefunded(
  admin: PartialRefundDb,
  sourceOrderId: string,
): Promise<{ ok: true; partial: boolean } | { ok: false; error: string }> {
  // Placeno pravo bez PaymentIntenta nema po cemu provjeriti povrat: tretira se kao djelomicno
  // vraceno (odbijanje), ne kao "bez povrata".
  if (!sourceOrderId) return { ok: true, partial: true };
  const { data, error } = await admin
    .from('webhook_events')
    .select('id')
    .eq('provider', UPGRADE_PAID_PROVIDER)
    .eq('order_id', sourceOrderId)
    .eq('outcome_detail', 'partial_refund_noted')
    .limit(1);
  if (error) return { ok: false, error: readError(error) };
  return { ok: true, partial: Array.isArray(data) && data.length > 0 };
}

/**
 * Deterministican `Idempotency-Key` za PaymentIntent nadogradnje. Za razliku od obicne kupnje ne
 * ovisi o vremenu privole: dva klika na nadogradnju istog prava unutar Stripeova prozora
 * idempotencije (24 h) vracaju ISTI PaymentIntent, pa se ista nadogradnja ne moze platiti dvaput.
 * Protiv uplate izvan tog prozora stoji apply_entitlement_upgrade (0207), koja pravo pretvara jednom.
 *
 * Kljuc nosi i IZNOS u centima (krug 4): promjena ciljne cijene unutar 24 h pod istim kljucem bi
 * Stripe odbio kao drugi zahtjev s istim kljucem, ili bi se vratio PaymentIntent sa starim iznosom
 * koji webhook zatim salje na rucni pregled. Isti iznos i dalje daje isti kljuc.
 */
export function upgradeIdempotencyKey(
  userId: string,
  sourceEntitlementId: string,
  targetProductId: string,
  amountCents: number,
): string {
  return `lekta:pi:upgrade:${userId}:${sourceEntitlementId}:${targetProductId}:${amountCents}`;
}
