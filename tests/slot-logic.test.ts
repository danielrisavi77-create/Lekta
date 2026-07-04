import { describe, it, expect } from 'vitest';

import {
  decideReportAccess,
  ingestPurchase,
  applyRefund,
  type AccessContext,
  type SlotRow,
  type EntitlementRow,
  type StoredEntitlement,
  type PurchaseEvent,
} from '../src/report/slot-logic';
import { computeFingerprint } from '../src/fingerprint/fingerprint';

const NOW = '2026-06-30T12:00:00.000Z';
const PLUS = '2026-07-05T12:00:00.000Z'; // unutar prozora
const PAST = '2026-06-20T12:00:00.000Z'; // istekao

const workX = computeFingerprint({
  title: 'Ucinak digitalizacije na javnu upravu',
  author: 'Ana Anic',
  headings: [
    { level: 1, text: '1. Uvod' },
    { level: 1, text: '2. Metodologija' },
    { level: 1, text: '3. Rezultati' },
    { level: 1, text: '4. Zakljucak' },
  ],
});

const workY = computeFingerprint({
  title: 'Energetska tranzicija',
  author: 'Marko Maric',
  headings: [
    { level: 1, text: 'Uvod' },
    { level: 1, text: 'Izvori' },
    { level: 1, text: 'Politike' },
  ],
});

function slot(over: Partial<SlotRow> = {}): SlotRow {
  return { id: 'slot-1', workType: 'diplomski', fingerprint: workX, slotExpiresAt: PLUS, ...over };
}
function entitlement(over: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    id: 'ent-1',
    workType: 'diplomski',
    status: 'active',
    slotsUsed: 0,
    slotsTotal: 1,
    purchaseExpiresAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}
function ctx(over: Partial<AccessContext> = {}): AccessContext {
  return {
    now: NOW,
    workType: 'diplomski',
    fingerprint: workX,
    activeSlots: [],
    entitlements: [],
    recentGenerationCount: 0,
    ...over,
  };
}

describe('decideReportAccess (kriteriji 11.1-11.6)', () => {
  it('11.1/11.5 nema slota, ima entitlement -> novi slot, prozor postavljen', () => {
    const d = decideReportAccess(ctx({ entitlements: [entitlement()] }));
    expect(d.decision).toBe('new_slot');
    if (d.decision !== 'new_slot') return;
    expect(d.entitlementId).toBe('ent-1');
    expect(d.newSlot.slotExpiresAt).toBe('2026-07-14T12:00:00.000Z'); // +14 dana za diplomski (products 0002)
  });

  it('Do obrane SKU: slotWindowDays s entitlementa nadjacava standardni prozor', () => {
    const d = decideReportAccess(ctx({ entitlements: [entitlement({ slotWindowDays: 120 })] }));
    expect(d.decision).toBe('new_slot');
    if (d.decision !== 'new_slot') return;
    expect(d.newSlot.slotExpiresAt).toBe('2026-10-28T12:00:00.000Z'); // +120 dana
  });

  it('mijesani entitlementi: najveci prozor ima prednost, bez obzira na redoslijed', () => {
    const d = decideReportAccess(
      ctx({
        entitlements: [
          entitlement({ id: 'ent-std' }),
          entitlement({ id: 'ent-obrana', slotWindowDays: 120 }),
        ],
      }),
    );
    expect(d.decision).toBe('new_slot');
    if (d.decision !== 'new_slot') return;
    expect(d.entitlementId).toBe('ent-obrana');
    expect(d.newSlot.slotExpiresAt).toBe('2026-10-28T12:00:00.000Z');
  });

  it('izjednacen prozor: trosi se entitlement koji prije istice', () => {
    const d = decideReportAccess(
      ctx({
        entitlements: [
          entitlement({ id: 'ent-kasniji', purchaseExpiresAt: '2026-12-01T00:00:00.000Z' }),
          entitlement({ id: 'ent-raniji', purchaseExpiresAt: '2026-08-01T00:00:00.000Z' }),
        ],
      }),
    );
    expect(d.decision).toBe('new_slot');
    if (d.decision !== 'new_slot') return;
    expect(d.entitlementId).toBe('ent-raniji');
  });

  it('11.2 tesko uredjen isti rad unutar prozora -> re-check na ISTOM slotu, bez naplate', () => {
    const editedX = computeFingerprint({
      title: 'Ucinak digitalizacije na javnu upravu, zavrsna verzija', // promijenjen naslov
      author: 'Ana Anic',
      headings: [
        { level: 1, text: 'Zakljucak' }, // reorder
        { level: 1, text: 'Uvod' },
        { level: 1, text: 'Rezultati' },
        { level: 1, text: 'Metodologija' },
        { level: 1, text: 'Rasprava' }, // dodano
      ],
    });
    const d = decideReportAccess(ctx({ fingerprint: editedX, activeSlots: [slot()] }));
    expect(d.decision).toBe('recheck');
    if (d.decision === 'recheck') expect(d.slotId).toBe('slot-1');
  });

  it('11.3 ocito drugi rad bez slobodnog slota -> 402', () => {
    const d = decideReportAccess(ctx({ fingerprint: workY, activeSlots: [slot()], entitlements: [] }));
    expect(d.decision).toBe('payment_required');
    expect(d.http).toBe(402);
  });

  it('11.4 lazirani otisak ne matcha tudji slot -> ne dobiva re-check', () => {
    const d = decideReportAccess(ctx({ fingerprint: workY, activeSlots: [slot()], entitlements: [entitlement({ slotsTotal: 0, slotsUsed: 0 })] }));
    // slot ne matcha (drugi rad), entitlement iscrpljen -> 402
    expect(d.decision).toBe('payment_required');
  });

  it('11.5 istekao slot -> ne re-check; pada na entitlement ili 402', () => {
    const d1 = decideReportAccess(ctx({ activeSlots: [slot({ slotExpiresAt: PAST })], entitlements: [] }));
    expect(d1.decision).toBe('payment_required');
    const d2 = decideReportAccess(ctx({ activeSlots: [slot({ slotExpiresAt: PAST })], entitlements: [entitlement()] }));
    expect(d2.decision).toBe('new_slot');
  });

  it('11.6 iznad dnevnog capa -> 429', () => {
    const d = decideReportAccess(ctx({ recentGenerationCount: 30, activeSlots: [slot()] }), { dailyCap: 30 });
    expect(d.decision).toBe('rate_limited');
    expect(d.http).toBe(429);
  });

  it('iscrpljen entitlement (slots_used == total) -> 402', () => {
    const d = decideReportAccess(ctx({ entitlements: [entitlement({ slotsUsed: 1, slotsTotal: 1 })] }));
    expect(d.decision).toBe('payment_required');
  });

  it('krivi work_type slota ne matcha (slot je vezan na work_type)', () => {
    const d = decideReportAccess(ctx({ workType: 'zavrsni', activeSlots: [slot({ workType: 'diplomski' })], entitlements: [] }));
    expect(d.decision).toBe('payment_required');
  });

  it('refundiran entitlement se ne trosi', () => {
    const d = decideReportAccess(ctx({ entitlements: [entitlement({ status: 'refunded' })] }));
    expect(d.decision).toBe('payment_required');
  });
});

describe('webhook idempotencija (kriterij 11.10) i refund', () => {
  const event: PurchaseEvent = {
    provider: 'paddle',
    orderId: 'ord-9',
    userId: 'u1',
    workType: 'diplomski',
    slotsTotal: 3,
    purchaseExpiresAt: '2026-09-01T00:00:00.000Z',
  };

  it('prva dostava kreira entitlement', () => {
    const r = ingestPurchase([], event, 'ent-new');
    expect(r.created).toBe(true);
    expect(r.entitlements).toHaveLength(1);
    expect(r.entitlements[0].slotsTotal).toBe(3);
  });

  it('ponovljena dostava ne udvostrucuje', () => {
    const first = ingestPurchase([], event, 'ent-new');
    const second = ingestPurchase(first.entitlements, event, 'ent-dup');
    expect(second.created).toBe(false);
    expect(second.entitlements).toHaveLength(1);
  });

  it('refund postavlja status refunded', () => {
    const first = ingestPurchase([], event, 'ent-new') as { entitlements: StoredEntitlement[] };
    const after = applyRefund(first.entitlements, 'paddle', 'ord-9');
    expect(after[0].status).toBe('refunded');
  });
});
