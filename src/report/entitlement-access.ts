/**
 * Citanje prava za odluku o pristupu (generate-report i repair-docx dijele ISTI upit i ISTO
 * mapiranje, da se dva mjesta ne razidju).
 *
 * Dva zahtjeva iz Monetizacije V1 (M2):
 *
 * 1. SNAPSHOT PRAVA JE MJERODAVAN. Prozor slota se cita iz `entitlements.slot_window_days`, koji
 *    se upisuje pri kupnji (webhook-mor, buildEntitlementInsert; trigger iz 0207 za ostale putove).
 *    Zivi `products.slot_window_days` vrijedi samo za stariji redak koji snapshot nema. Tako buduca
 *    promjena kataloga (npr. kraci prozor Final Passa) ne mijenja vec kupljeno pravo
 *    (odjeljci 13 i 29).
 *
 * 2. UGRADNJA PROIZVODA JE EKSPLICITNA. `products!product_id(...)` imenuje vezu po stupcu, pa
 *    buduci drugi strani kljuc s entitlements na products ne cini upit dvosmislenim (PostgREST
 *    PGRST201). Pozivatelj MORA provjeriti gresku upita: prazan rezultat zbog greske nije
 *    "nema prava" (to bi placenom korisniku vratilo 402).
 *
 * Krug 4: SLOT VRIJEDI SAMO UZ AKTIVNO PRAVO. Besplatan re-check (decideReportAccess) daje svaki
 * zivi slot ciji se otisak poklapa. Slot se dotad citao bez veze na status prava, pa je puni povrat
 * prava ostavljao besplatne provjere do isteka slota. Sada se slot vraca samo ako je njegov
 * `entitlement_id` medju aktivnim pravima istog citanja; povrat ili ponistenje prava odmah gasi i
 * re-check. Povrat SAMO uplate nadogradnje pravo ne gasi: revert_entitlement_upgrade (0207) ga vraca
 * na zapamceni Repair i slot na istek prije nadogradnje, pa placeni Repair ostaje, a produljeni
 * prozor Final Passa nestaje (docs/GO_LIVE_NAPLATA.md).
 */
import type { EntitlementRow, SlotRow } from './slot-logic.ts';
import type { DocumentFingerprint } from '../fingerprint/fingerprint.ts';
import { isBillableWorkType, type BillableWorkType } from './billable-work-type.ts';

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

/** Stupci aktivnih slotova za odluku o pristupu; entitlement_id veze slot uz status prava. */
export const ACTIVE_SLOT_SELECT = 'id, entitlement_id, work_type, fingerprint, slot_expires_at';

/** Najuzi oblik supabase-js upita koji citanje pristupa treba (thenable koji se dalje suzava). */
export interface AccessQuery extends PromiseLike<{ data: unknown; error: unknown }> {
  eq(column: string, value: string): AccessQuery;
  gt(column: string, value: string): AccessQuery;
}

/** Najuzi oblik Supabase klijenta za citanje pristupa; bez `any`. */
export interface AccessDb {
  from(table: 'document_slots' | 'entitlements'): { select(columns: string): AccessQuery };
}

export type AccessRows =
  | { ok: true; activeSlots: SlotRow[]; entitlements: EntitlementRow[] }
  | { ok: false; error: string };

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
  return String(error);
}

/**
 * Redak slota -> SlotRow, samo ako pripada jednom od `activeEntitlementIds`. Slot bez
 * `entitlement_id` (stupac je NOT NULL od 0001, pa to znaci krivi upit) se ispusta: fail-closed.
 */
function slotRowFromDb(row: unknown, activeEntitlementIds: ReadonlySet<string>): SlotRow | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || !isBillableWorkType(r.work_type) || typeof r.slot_expires_at !== 'string') return null;
  if (typeof r.fingerprint !== 'object' || r.fingerprint === null) return null;
  if (typeof r.entitlement_id !== 'string' || !activeEntitlementIds.has(r.entitlement_id)) return null;
  return { id: r.id, workType: r.work_type, fingerprint: r.fingerprint as DocumentFingerprint, slotExpiresAt: r.slot_expires_at };
}

/**
 * Citanje ulaza za decideReportAccess, ZAJEDNICKO za generate-report i repair-docx: aktivni slotovi
 * korisnika za vrstu rada i njegova aktivna prava (ENTITLEMENT_ACCESS_SELECT, snapshot prozora).
 * Slot ulazi samo ako mu je pravo medju aktivnima (vidi zaglavlje, krug 4).
 *
 * Greska BILO kojeg od dva upita vraca `ok: false`. Pozivatelj tada odgovara 500 i nista ne trosi:
 * prazan rezultat zbog greske nije "nema prava" (placeni korisnik bi inace dobio 402 i ponudu da
 * plati ponovno). Izvrsni test: tests/monetizacija-v1-potrosnja.test.ts.
 */
export async function readAccessRows(
  admin: AccessDb,
  userId: string,
  workType: BillableWorkType,
  nowIso: string,
): Promise<AccessRows> {
  const [slots, entitlements] = await Promise.all([
    admin
      .from('document_slots')
      .select(ACTIVE_SLOT_SELECT)
      .eq('user_id', userId)
      .eq('work_type', workType)
      .gt('slot_expires_at', nowIso),
    admin
      .from('entitlements')
      // Snapshot prozora s prava, a proizvod samo za stariji redak bez snapshota.
      .select(ENTITLEMENT_ACCESS_SELECT)
      .eq('user_id', userId)
      .eq('work_type', workType)
      .eq('status', 'active'),
  ]);
  if (slots.error || entitlements.error) {
    return { ok: false, error: errorMessage(slots.error ?? entitlements.error) };
  }
  const slotRows = Array.isArray(slots.data) ? slots.data : [];
  const entitlementRows = Array.isArray(entitlements.data) ? (entitlements.data as EntitlementAccessDbRow[]) : [];
  const prava = entitlementRowsFromDb(entitlementRows);
  // Upit prava je vec suzen na status 'active'; provjera ovdje ne vjeruje samo filtru upita.
  const aktivna = new Set(prava.filter((e) => e.status === 'active').map((e) => e.id));
  return {
    ok: true,
    activeSlots: slotRows.map((r) => slotRowFromDb(r, aktivna)).filter((r): r is SlotRow => r !== null),
    entitlements: prava,
  };
}
