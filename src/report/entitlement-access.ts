/**
 * Citanje prava za odluku o pristupu (generate-report i repair-docx dijele ISTI upit i ISTO
 * mapiranje, da se dva mjesta ne razidju).
 *
 * Dva zahtjeva iz Monetizacije V1 (M2):
 *
 * 1. SNAPSHOT PRAVA JE MJERODAVAN. Prozor slota se cita iz `entitlements.slot_window_days`, koji
 *    se upisuje pri kupnji (webhook-mor, buildEntitlementInsert; trigger iz 0206 za ostale putove).
 *    Zivi `products.slot_window_days` vrijedi samo za stariji redak koji snapshot nema. Tako buduca
 *    promjena kataloga (npr. kraci prozor Final Passa) ne mijenja vec kupljeno pravo
 *    (odjeljci 13 i 29).
 *
 * 2. UGRADNJA PROIZVODA JE EKSPLICITNA. `products!product_id(...)` imenuje vezu po stupcu, pa
 *    buduci drugi strani kljuc s entitlements na products ne cini upit dvosmislenim (PostgREST
 *    PGRST201). Pozivatelj MORA provjeriti gresku upita: prazan rezultat zbog greske nije
 *    "nema prava" (to bi placenom korisniku vratilo 402).
 */
import type { EntitlementRow } from './slot-logic.ts';
import { isBillableWorkType } from './billable-work-type.ts';

/** Stupci prava za odluku o pristupu; ugradnja proizvoda s eksplicitnim hintom veze. */
export const ENTITLEMENT_ACCESS_SELECT =
  'id, work_type, status, slots_used, slots_total, purchase_expires_at, slot_window_days, products!product_id(slot_window_days)';

/** Redak kako ga vraca PostgREST za ENTITLEMENT_ACCESS_SELECT. */
export interface EntitlementAccessDbRow {
  id: string;
  work_type: string;
  status: string;
  slots_used: number;
  slots_total: number;
  purchase_expires_at: string;
  slot_window_days?: number | null;
  products?: { slot_window_days?: number | null } | null;
}

function positiveInt(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined;
}

/**
 * Redak iz baze -> EntitlementRow. Snapshot prozora ima prednost pred zivim katalogom. Redak s
 * nepoznatom vrstom rada ili statusom se ispusta (null), umjesto da se tiho prepise u drugu vrstu.
 */
export function entitlementRowFromDb(e: EntitlementAccessDbRow): EntitlementRow | null {
  if (!isBillableWorkType(e.work_type)) return null;
  if (e.status !== 'active' && e.status !== 'refunded' && e.status !== 'void') return null;
  return {
    id: e.id,
    workType: e.work_type,
    status: e.status,
    slotsUsed: e.slots_used,
    slotsTotal: e.slots_total,
    purchaseExpiresAt: e.purchase_expires_at,
    slotWindowDays: positiveInt(e.slot_window_days) ?? positiveInt(e.products?.slot_window_days),
  };
}

/** Svi retci -> EntitlementRow[], bez neprepoznatih. */
export function entitlementRowsFromDb(rows: readonly EntitlementAccessDbRow[] | null | undefined): EntitlementRow[] {
  return (rows ?? []).map(entitlementRowFromDb).filter((r): r is EntitlementRow => r !== null);
}
