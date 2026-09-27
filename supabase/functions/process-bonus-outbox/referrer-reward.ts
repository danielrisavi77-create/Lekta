// Lekta Edge Function: process-bonus-outbox, obveza `referrer_reward` (F21, stavka 1).
//
// ZASTO POSTOJI. Obveza nagrade preporucitelju ceka u `bonus_outbox` kao `pending` dok je radnik ne
// izvrsi. Do F21 radnik ju je izvrsavao BEZ citanja oznake povrata: kupceva uplata vracena u
// medjuvremenu i dalje je donosila nagradu preporucitelju, dakle nagradu za vracen novac. Webhook
// (closeRefundConsequences) sada pri punom povratu otkazuje obvezu koja jos ceka, a ovaj modul je
// druga strana istog dogovora:
//
//  1. PRIJE izvrsenja cita oznaku punog povrata istog PaymentIntenta (REFUND_MARKERS u inboxu) i
//     stanje prava kupca. Ako je povrat tu, obveza se otkazuje i nagrada se ne dodjeljuje.
//  2. NAKON izvrsenja cita ponovno (pisi pa citaj, isti obrazac kao u webhook-mor). Povrat koji je
//     stigao IZMEDJU prvog citanja i dodjele procitao je referral_signups prije nego je nagrada
//     nastala, pa je nije mogao povuci; zato je povlaci ovaj korak (pullReferralSignupReward).
//
// Pad citanja BACA: obveza ostaje `pending` i radnik je ponovi, a nagrada se ne dodjeljuje naslijepo.
import { tryGrantReferrerReward } from '../_shared/grant-referrer-reward.ts';
import { pullReferralSignupReward, REFUND_MARKERS } from '../webhook-mor/handler.ts';

/** Odgovor PostgREST upita, onoliko koliko ga ovaj modul cita. */
interface DbResponse {
  data: unknown;
  error: unknown;
}

/** Lanac filtera supabase-js (thenable). */
interface OutboxQuery extends PromiseLike<DbResponse> {
  eq(column: string, value: string): OutboxQuery;
  in(column: string, values: readonly string[]): OutboxQuery;
  limit(count: number): OutboxQuery;
  select(columns: string): OutboxQuery;
}

/** Najuzi oblik Supabase klijenta koji obveza treba; bez `any`. */
export interface ReferrerRewardDb {
  from(table: 'webhook_events' | 'entitlements' | 'bonus_outbox'): {
    select(columns: string): OutboxQuery;
    update(values: Record<string, string | null>): OutboxQuery;
  };
}

export interface ReferrerRewardRow {
  id: string;
  user_id: string;
  order_id: string;
  payload: Record<string, unknown>;
}

export type ReferrerRewardOutcome = 'granted' | 'cancelled_refunded' | 'revoked_refunded';

/** Nagrada; samo testovi je zamjenjuju. Potpis kao tryGrantReferrerReward. */
export type GrantReferrerReward = (
  admin: never,
  buyerUserId: string,
  buyerWorkType: string,
  buyerOrderId: string,
) => Promise<unknown>;

const PROVIDER = 'stripe';

function rows(data: unknown): unknown[] {
  return Array.isArray(data) ? data : [];
}

function message(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) return String((error as { message?: unknown }).message);
  return String(error);
}

/**
 * Je li kupceva uplata (PaymentIntent) PUNO vracena: oznaka punog povrata u inboxu (webhook-mor je
 * pise PRIJE ikakvog drugog koraka povrata) ili kupcevo pravo u stanju `refunded`. Baca na gresku.
 */
export async function orderFullyRefunded(admin: ReferrerRewardDb, orderId: string): Promise<boolean> {
  const { data: oznaka, error: oznakaErr } = await admin
    .from('webhook_events')
    .select('id')
    .eq('provider', PROVIDER)
    .eq('order_id', orderId)
    .in('outcome_detail', REFUND_MARKERS)
    .limit(1);
  if (oznakaErr) throw new Error(`refund_marker_lookup: ${message(oznakaErr)}`);
  if (rows(oznaka).length > 0) return true;

  const { data: pravo, error: pravoErr } = await admin
    .from('entitlements')
    .select('id')
    .eq('provider', PROVIDER)
    .eq('order_id', orderId)
    .eq('status', 'refunded')
    .limit(1);
  if (pravoErr) throw new Error(`entitlement_lookup: ${message(pravoErr)}`);
  return rows(pravo).length > 0;
}

/**
 * Izvrsi obvezu `referrer_reward` uz provjeru povrata prije i poslije dodjele. Vraca ishod; zavrsni
 * status retka (`done` ili `cancelled`) postavlja pozivatelj za `granted`, a ovaj modul sam za oba
 * ishoda povrata, i to samo dok je redak jos `pending` (webhook ga je mozda vec otkazao).
 */
export async function runReferrerRewardObligation(
  admin: ReferrerRewardDb,
  row: ReferrerRewardRow,
  grant: GrantReferrerReward = tryGrantReferrerReward as unknown as GrantReferrerReward,
): Promise<ReferrerRewardOutcome> {
  const workType = String(row.payload?.workType ?? '');
  if (!workType) throw new Error('payload bez workType');

  if (await orderFullyRefunded(admin, row.order_id)) {
    await cancelObligation(admin, row.id);
    return 'cancelled_refunded';
  }

  await grant(admin as never, row.user_id, workType, row.order_id);

  if (await orderFullyRefunded(admin, row.order_id)) {
    // Povrat je stigao izmedju provjere i dodjele: nagrada koju je upravo izdala ova obveza se
    // povlaci (nepotrosena; potrosenu pusta, isto pravilo kao webhook-mor 6.7).
    await pullReferralSignupReward(admin, row.order_id);
    await cancelObligation(admin, row.id);
    return 'revoked_refunded';
  }
  return 'granted';
}

async function cancelObligation(admin: ReferrerRewardDb, id: string): Promise<void> {
  const { error } = await admin
    .from('bonus_outbox')
    .update({ status: 'cancelled', last_error: 'refunded' })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw new Error(`bonus_outbox_cancel: ${message(error)}`);
}
