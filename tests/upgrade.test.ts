/**
 * Nadogradnja Repair -> Final Pass (docs/decisions/MONETIZACIJA_V1.md odjeljak 14): cista odluka.
 *
 * Kriterij izvan diffa: primjeri iz odjeljka 14 (diplomski 9,99 -> 19,99 daje 10,00; specijalisticki
 * 16,99 -> 29,99 daje 13,00; zavrsni 5,99 -> 12,99 daje 7,00; doktorski 24,99 -> 39,99 daje 15,00)
 * i pravilo "nikad ne naplatiti puni Final Pass ponovno za isti dokument i vrstu rada". Cijene
 * ovdje su ulaz u test (kao sto bi ih server procitao iz products.price_eur), ne kod.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  quoteUpgrade,
  mapUpgradeSourceRow,
  upgradeIdempotencyKey,
  fingerprintIntact,
  readBoundSlotIntact,
  readSourcePartiallyRefunded,
  ANONYMIZED_FINGERPRINT_KEYS,
  UPGRADE_REFUSALS,
  type UpgradeSource,
  type UpgradeTarget,
} from '../src/report/upgrade';
import { stripeIdempotencyKey } from '../src/report/checkout';

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const LATER = new Date(NOW + 30 * 86_400_000).toISOString();

function target(workType: string, priceEur: number, over: Partial<UpgradeTarget> = {}): UpgradeTarget {
  return { id: `pass_${workType}`, kind: 'pass', active: true, workType, offerCode: 'final_pass_v1', priceEur, ...over };
}

function source(workType: string, paidCents: number | null, over: Partial<UpgradeSource> = {}): UpgradeSource {
  return {
    id: 'ent-1',
    userId: 'user-1',
    workType,
    status: 'active',
    provider: 'stripe',
    slotsTotal: 1,
    offerCode: 'repair_v1',
    paidAmountCents: paidCents,
    purchaseExpiresAt: LATER,
    upgradeOrderId: null,
    // Repair je vezan uz rad, a otisak vezanog slota je jos netaknut (nije anonimiziran).
    slotsUsed: 1,
    boundSlotIntact: true,
    ...over,
  };
}

describe('quoteUpgrade: primjeri iz odjeljka 14', () => {
  it.each([
    ['diplomski', 999, 19.99, 1000],
    ['specijalisticki', 1699, 29.99, 1300],
    ['zavrsni', 599, 12.99, 700],
    ['doktorski', 2499, 39.99, 1500],
  ])('%s: Repair %i centi -> Final Pass %f EUR = %i centi', (workType, paid, passEur, expected) => {
    const q = quoteUpgrade(target(workType, passEur), source(workType, paid), 'user-1', NOW);
    expect(q).toEqual({ ok: true, amountCents: expected, targetCents: Math.round(passEur * 100), creditCents: paid });
  });

  it('odbija se STVARNO placeno, ne danasnja cijena Repaira (npr. kupljeno uz drugu cijenu)', () => {
    const q = quoteUpgrade(target('diplomski', 19.99), source('diplomski', 899), 'user-1', NOW);
    expect(q).toMatchObject({ ok: true, amountCents: 1100 });
  });

  it('iznos nadogradnje je uvijek manji od pune cijene Final Passa (nikad puna cijena ponovno)', () => {
    for (const paid of [1, 500, 999, 1998]) {
      const q = quoteUpgrade(target('diplomski', 19.99), source('diplomski', paid), 'user-1', NOW);
      expect(q.ok).toBe(true);
      if (q.ok) {
        expect(q.amountCents).toBe(1999 - paid);
        expect(q.amountCents).toBeLessThan(1999);
        expect(q.amountCents).toBeGreaterThan(0);
      }
    }
  });
});

describe('quoteUpgrade: pravila (isti rad, jednom, rok, samo placeno)', () => {
  const cases: Array<[string, UpgradeTarget | null, UpgradeSource | null, string]> = [
    ['cilj nije Final Pass (Semester Pass)', target('seminarski', 14.99, { id: 'pass_semestralni', offerCode: 'semester_pass_v1' }), source('seminarski', 399), 'upgrade_target_invalid'],
    ['cilj je Repair slot', target('diplomski', 9.99, { kind: 'slot', offerCode: 'repair_v1' }), source('diplomski', 999), 'upgrade_target_invalid'],
    ['cilj je neaktivan', target('diplomski', 19.99, { active: false }), source('diplomski', 999), 'upgrade_target_invalid'],
    ['cilj bez cijene', target('diplomski', 0), source('diplomski', 999), 'upgrade_target_invalid'],
    ['pravo ne postoji', target('diplomski', 19.99), null, 'upgrade_source_not_found'],
    ['tudje pravo', target('diplomski', 19.99), source('diplomski', 999, { userId: 'user-2' }), 'upgrade_source_not_found'],
    ['interna nagrada (nije placeno)', target('diplomski', 19.99), source('diplomski', 999, { provider: 'internal' }), 'upgrade_source_not_paid'],
    ['pravo nije Repair (vec Final Pass)', target('diplomski', 19.99), source('diplomski', 1999, { offerCode: 'final_pass_v1' }), 'upgrade_source_not_repair'],
    ['bundle od vise slotova', target('diplomski', 19.99), source('diplomski', 4199, { slotsTotal: 5 }), 'upgrade_source_not_repair'],
    ['staro pravo bez snapshota ponude', target('diplomski', 19.99), source('diplomski', 999, { offerCode: null }), 'upgrade_source_not_repair'],
    ['druga vrsta rada', target('doktorski', 39.99), source('diplomski', 999), 'upgrade_work_type_mismatch'],
    ['specijalisticki se ne nadogradjuje na diplomski', target('diplomski', 19.99), source('specijalisticki', 1699), 'upgrade_work_type_mismatch'],
    ['vec nadogradjeno (jednom)', target('diplomski', 19.99), source('diplomski', 999, { upgradeOrderId: 'pi_prije' }), 'upgrade_already_applied'],
    ['vraceno pravo', target('diplomski', 19.99), source('diplomski', 999, { status: 'refunded' }), 'upgrade_source_inactive'],
    ['isteklo pravo (rok)', target('diplomski', 19.99), source('diplomski', 999, { purchaseExpiresAt: new Date(NOW - 1).toISOString() }), 'upgrade_source_expired'],
    ['nepoznat placeni iznos', target('diplomski', 19.99), source('diplomski', null), 'upgrade_paid_amount_unknown'],
    ['djelomicno vracena izvorna uplata', target('diplomski', 19.99), source('diplomski', 999, { partiallyRefunded: true }), 'upgrade_source_partially_refunded'],
    ['placeno jednako cilju', target('diplomski', 19.99), source('diplomski', 1999), 'upgrade_amount_invalid'],
    // Krug 4: granica je anonimizacija otiska (purge_document_slots, 0016), ne istek prozora slota.
    ['vezani slot anonimiziran', target('diplomski', 19.99), source('diplomski', 999, { boundSlotIntact: false }), 'upgrade_slot_anonymized'],
    ['vezani slot neprocitan (fail-closed)', target('diplomski', 19.99), source('diplomski', 999, { boundSlotIntact: undefined }), 'upgrade_slot_anonymized'],
  ];

  it.each(cases)('%s -> odbijeno', (_ime, t, src, error) => {
    expect(quoteUpgrade(t, src, 'user-1', NOW)).toEqual({ ok: false, error });
  });

  it('nevezan Repair (slots_used 0) se nadogradjuje i bez slota: slot nastaje tek pri upotrebi', () => {
    expect(quoteUpgrade(target('diplomski', 19.99), source('diplomski', 999, { slotsUsed: 0, boundSlotIntact: undefined }), 'user-1', NOW))
      .toEqual({ ok: true, amountCents: 1000, targetCents: 1999, creditCents: 999 });
  });

  it('nepoznat broj vezanih slotova je odbijen (ne pretpostavlja se nevezano)', () => {
    expect(quoteUpgrade(target('diplomski', 19.99), source('diplomski', 999, { slotsUsed: Number.NaN }), 'user-1', NOW))
      .toEqual({ ok: false, error: 'upgrade_source_not_repair' });
  });

  it('svaki razlog odbijanja ima svoj slucaj (generator pokriva cijeli popis)', () => {
    expect(new Set(cases.map((c) => c[3]))).toEqual(new Set(UPGRADE_REFUSALS));
  });
});

describe('mapUpgradeSourceRow', () => {
  it('mapira redak entitlementa; nepotpun redak je null', () => {
    expect(mapUpgradeSourceRow({
      id: 'ent-1', user_id: 'u1', work_type: 'diplomski', status: 'active', provider: 'stripe', slots_total: 1, slots_used: 1,
      offer_code: 'repair_v1', paid_amount_cents: 999, purchase_expires_at: LATER, upgrade_order_id: null,
      order_id: 'pi_repair',
    })).toEqual({
      id: 'ent-1', userId: 'u1', workType: 'diplomski', status: 'active', provider: 'stripe', slotsTotal: 1, slotsUsed: 1,
      offerCode: 'repair_v1', paidAmountCents: 999, purchaseExpiresAt: LATER, upgradeOrderId: null, orderId: 'pi_repair',
    });
    expect(mapUpgradeSourceRow(null)).toBeNull();
    expect(mapUpgradeSourceRow({ id: 'x' })).toBeNull();
    expect(mapUpgradeSourceRow([{ id: 'x', user_id: 'u' }])).toBeNull();
  });

  it('placeni iznos kao tekst nije broj (ne pogadja se)', () => {
    const s = mapUpgradeSourceRow({ id: 'e', user_id: 'u', paid_amount_cents: '999' });
    expect(s?.paidAmountCents).toBeNull();
  });
});

describe('upgradeIdempotencyKey', () => {
  it('ne ovisi o vremenu: dva klika na istu nadogradnju daju isti kljuc', () => {
    expect(upgradeIdempotencyKey('u1', 'ent-1', 'pass_diplomski', 1000)).toBe(upgradeIdempotencyKey('u1', 'ent-1', 'pass_diplomski', 1000));
    expect(upgradeIdempotencyKey('u1', 'ent-1', 'pass_diplomski', 1000)).not.toBe(upgradeIdempotencyKey('u1', 'ent-2', 'pass_diplomski', 1000));
    // obicna kupnja ima kljuc s vremenom privole; nadogradnja se s njim ne smije poklopiti
    expect(upgradeIdempotencyKey('u1', 'ent-1', 'pass_diplomski', 1000)).not.toBe(stripeIdempotencyKey('u1', 'pass_diplomski', 'ent-1'));
  });

  it('krug 4: kljuc nosi iznos u centima; drugi iznos daje drugi kljuc (nova ciljna cijena = novi PaymentIntent)', () => {
    const kljuc = upgradeIdempotencyKey('u1', 'ent-1', 'pass_diplomski', 1000);
    expect(kljuc.split(':').at(-1)).toBe('1000');
    expect(kljuc).not.toBe(upgradeIdempotencyKey('u1', 'ent-1', 'pass_diplomski', 1100));
  });
});

/** Lazan supabase-js graditelj: vraca zadani odgovor i biljezi filtre. */
function fakeDb(odgovor: { data: unknown; error: unknown }) {
  const filtri: Array<[string, string, unknown]> = [];
  const q = {
    eq(c: string, v: string) { filtri.push(['eq', c, v]); return q; },
    gt(c: string, v: string) { filtri.push(['gt', c, v]); return q; },
    limit(n: number) { filtri.push(['limit', 'n', n]); return q; },
    // oxlint-disable-next-line unicorn/no-thenable
    then<A = unknown, B = never>(ok?: ((v: typeof odgovor) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
      return Promise.resolve(odgovor).then(ok, fail);
    },
  };
  const tablice: string[] = [];
  const db = { from(t: string) { tablice.push(t); return { select: (_c: string) => q }; } };
  return { db, filtri, tablice };
}

describe('krug 4: vezani slot je prepoznatljiv dok ga purge ne anonimizira (odjeljak 14)', () => {
  const OTISAK = { titleNorm: 'rad', authorNorm: 'autor', headings: ['uvod'], sectionCount: 1 };
  // Tocno ono sto purge_document_slots (0016) ostavi: fingerprint - authorNorm - titleNorm - headings.
  const PURGAN = { sectionCount: 1 };

  it('isti popis kljuceva kao purge_document_slots u 0016 (parsirano iz migracije)', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase', 'migrations', '0016_retention_slots_faculty.sql'), 'utf8');
    const m = /set fingerprint = ds\.fingerprint((?:\s*-\s*'[A-Za-z]+')+)/.exec(sql);
    expect(m, 'purge u 0016 nije pronadjen').not.toBeNull();
    const purgeKeys = [...(m?.[1] ?? '').matchAll(/'([A-Za-z]+)'/g)].map((x) => x[1]).sort();
    expect(purgeKeys).toEqual([...ANONYMIZED_FINGERPRINT_KEYS].sort());
  });

  it('fingerprintIntact: puni otisak da, purgan ili nevaljan ne (fail-closed)', () => {
    expect(fingerprintIntact(OTISAK)).toBe(true);
    expect(fingerprintIntact(PURGAN)).toBe(false);
    expect(fingerprintIntact(null)).toBe(false);
    expect(fingerprintIntact(['titleNorm'])).toBe(false);
    expect(fingerprintIntact('titleNorm')).toBe(false);
  });

  it('slot_zavrsni istekao prije 5 dana, otisak netaknut: nadogradnja 12,99 - 5,99 = 7,00 prolazi', async () => {
    const { db, filtri } = fakeDb({ data: [{ id: 's1', fingerprint: OTISAK, slot_expires_at: new Date(NOW - 5 * 86_400_000).toISOString() }], error: null });
    const slot = await readBoundSlotIntact(db as never, 'ent-1');
    expect(slot).toEqual({ ok: true, intact: true });
    // Citanje ne filtrira po isteku prozora (to je bila stara, prestroga granica).
    expect(filtri.some(([op]) => op === 'gt')).toBe(false);
    const q = quoteUpgrade(target('zavrsni', 12.99), source('zavrsni', 599, { boundSlotIntact: slot.ok && slot.intact }), 'user-1', NOW);
    expect(q).toEqual({ ok: true, amountCents: 700, targetCents: 1299, creditCents: 599 });
  });

  it('slot anonimiziran (purgan otisak) ili vezanog slota nema: odbijeno', async () => {
    for (const data of [[{ id: 's1', fingerprint: PURGAN }], []]) {
      const slot = await readBoundSlotIntact(fakeDb({ data, error: null }).db as never, 'ent-1');
      expect(slot).toEqual({ ok: true, intact: false });
      const q = quoteUpgrade(target('zavrsni', 12.99), source('zavrsni', 599, { boundSlotIntact: slot.ok && slot.intact }), 'user-1', NOW);
      expect(q).toEqual({ ok: false, error: 'upgrade_slot_anonymized' });
    }
  });

  it('pad citanja slota je greska, ne "netaknut" ni "anonimiziran"', async () => {
    expect(await readBoundSlotIntact(fakeDb({ data: null, error: { message: 'timeout' } }).db as never, 'ent-1'))
      .toEqual({ ok: false, error: 'timeout' });
  });
});

describe('krug 4: oznaka djelomicnog povrata izvorne uplate (isto citanje u checkoutu i webhooku)', () => {
  it('oznaka partial_refund_noted istog PaymentIntenta -> partial', async () => {
    const { db, filtri, tablice } = fakeDb({ data: [{ id: 'w1' }], error: null });
    expect(await readSourcePartiallyRefunded(db as never, 'pi_repair')).toEqual({ ok: true, partial: true });
    expect(tablice).toEqual(['webhook_events']);
    expect(filtri).toEqual(expect.arrayContaining([
      ['eq', 'order_id', 'pi_repair'],
      ['eq', 'outcome_detail', 'partial_refund_noted'],
      ['eq', 'provider', 'stripe'],
    ]));
  });

  it('bez oznake -> nije partial; pad citanja -> greska; placeno pravo bez PaymentIntenta -> partial (fail-closed)', async () => {
    expect(await readSourcePartiallyRefunded(fakeDb({ data: [], error: null }).db as never, 'pi_repair')).toEqual({ ok: true, partial: false });
    expect(await readSourcePartiallyRefunded(fakeDb({ data: null, error: { message: 'x' } }).db as never, 'pi_repair')).toEqual({ ok: false, error: 'x' });
    expect(await readSourcePartiallyRefunded(fakeDb({ data: [], error: null }).db as never, '')).toEqual({ ok: true, partial: true });
  });
});
