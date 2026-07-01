import { fingerprintMatch, type DocumentFingerprint } from '../fingerprint/fingerprint';
import { windowDaysFor, type ReportWorkType } from './pricing';

/**
 * Cista odluka o pravu na placeni izvjestaj (MONETIZATION_AND_ANTI_ABUSE.md sekcije 5,
 * 7 i 11). Edge Function je tanki Deno omotac: radi auth i I/O nad bazom, a OVU funkciju
 * zove za odluku. Sva pravila pristupa su serverska; klijent nikad nije izvor istine.
 *
 * Tijek (sekcija 5): rate limit -> match aktivnog slota (re-check, besplatno) -> potrosi
 * entitlement (novi slot) -> inace 402. Otisak racuna server iz payloada (ovdje predan
 * kao `fingerprint`), pa lazirani otisak ne moze dobiti koristan izvjestaj za tudji slot.
 */

export interface SlotRow {
  id: string;
  workType: ReportWorkType;
  fingerprint: DocumentFingerprint;
  slotExpiresAt: string; // ISO
}

export interface EntitlementRow {
  id: string;
  workType: ReportWorkType;
  status: 'active' | 'refunded' | 'void';
  slotsUsed: number;
  slotsTotal: number;
  purchaseExpiresAt: string; // ISO
}

export interface AccessContext {
  now: string; // ISO; server vrijeme
  workType: ReportWorkType;
  fingerprint: DocumentFingerprint;
  activeSlots: SlotRow[];
  entitlements: EntitlementRow[];
  /** Broj generacija korisnika u zadnjih 24h (za rate limit). */
  recentGenerationCount: number;
}

export interface AccessOptions {
  /** Maksimum generacija u 24h prije 429 (default 30). */
  dailyCap?: number;
  /** Prag podudaranja otiska (proslijedjuje se fingerprintMatch; default labav). */
  threshold?: number;
}

/** Slot koji treba kreirati kad se trosi entitlement (caller upisuje transakcijski). */
export interface NewSlotPlan {
  workType: ReportWorkType;
  fingerprint: DocumentFingerprint;
  boundAt: string;
  slotExpiresAt: string;
}

export type AccessDecision =
  | { decision: 'rate_limited'; http: 429 }
  | { decision: 'recheck'; http: 200; slotId: string }
  | { decision: 'new_slot'; http: 200; entitlementId: string; newSlot: NewSlotPlan }
  | { decision: 'payment_required'; http: 402; workType: ReportWorkType };

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function notExpired(expiresAtIso: string, nowIso: string): boolean {
  return new Date(expiresAtIso).getTime() > new Date(nowIso).getTime();
}

/**
 * Odlucuje ishod zahtjeva za placeni izvjestaj. Cista funkcija: ne dira bazu. Caller
 * primjenjuje posljedicu (kod new_slot: transakcijski slots_used += 1 i insert slota).
 */
export function decideReportAccess(ctx: AccessContext, options: AccessOptions = {}): AccessDecision {
  const dailyCap = options.dailyCap ?? 30;

  // 2. rate limit
  if (ctx.recentGenerationCount >= dailyCap) {
    return { decision: 'rate_limited', http: 429 };
  }

  // 4. aktivan slot za isti (work_type, otisak) -> re-check, besplatno
  const slot = ctx.activeSlots.find(
    (s) =>
      s.workType === ctx.workType &&
      notExpired(s.slotExpiresAt, ctx.now) &&
      fingerprintMatch(s.fingerprint, ctx.fingerprint, { threshold: options.threshold }),
  );
  if (slot) return { decision: 'recheck', http: 200, slotId: slot.id };

  // 5. potrosi entitlement -> novi slot
  const ent = ctx.entitlements.find(
    (e) =>
      e.workType === ctx.workType &&
      e.status === 'active' &&
      notExpired(e.purchaseExpiresAt, ctx.now) &&
      e.slotsUsed < e.slotsTotal,
  );
  if (ent) {
    return {
      decision: 'new_slot',
      http: 200,
      entitlementId: ent.id,
      newSlot: {
        workType: ctx.workType,
        fingerprint: ctx.fingerprint,
        boundAt: ctx.now,
        slotExpiresAt: addDays(ctx.now, windowDaysFor(ctx.workType)),
      },
    };
  }

  // 6. inace placanje
  return { decision: 'payment_required', http: 402, workType: ctx.workType };
}

// ---------------------------------------------------------------------------
// Webhook (Merchant of Record), sekcija 7: idempotentno kreiranje entitlementa.
// ---------------------------------------------------------------------------

export interface PurchaseEvent {
  provider: string;
  orderId: string;
  userId: string;
  workType: ReportWorkType;
  slotsTotal: number;
  purchaseExpiresAt: string;
}

export interface StoredEntitlement extends EntitlementRow {
  userId: string;
  provider: string;
  orderId: string;
}

/**
 * Idempotentno primijeni kupnju: ako entitlement za (provider, orderId) vec postoji,
 * NE udvostrucuje (kriterij 11.10). Inace dodaje novi aktivni entitlement. Cista
 * funkcija; baza forsira isto preko unique (provider, order_id).
 */
export function ingestPurchase(
  existing: StoredEntitlement[],
  event: PurchaseEvent,
  newId: string,
): { created: boolean; entitlements: StoredEntitlement[] } {
  const dup = existing.some((e) => e.provider === event.provider && e.orderId === event.orderId);
  if (dup) return { created: false, entitlements: existing };
  const entitlement: StoredEntitlement = {
    id: newId,
    userId: event.userId,
    provider: event.provider,
    orderId: event.orderId,
    workType: event.workType,
    status: 'active',
    slotsUsed: 0,
    slotsTotal: event.slotsTotal,
    purchaseExpiresAt: event.purchaseExpiresAt,
  };
  return { created: true, entitlements: [...existing, entitlement] };
}

/** Refund: blokira daljnje vezivanje slotova iz tog entitlementa (sekcija 7). */
export function applyRefund(
  existing: StoredEntitlement[],
  provider: string,
  orderId: string,
): StoredEntitlement[] {
  return existing.map((e) =>
    e.provider === provider && e.orderId === orderId ? { ...e, status: 'refunded' } : e,
  );
}
