import { describe, it, expect } from 'vitest';

import { mapProductRow, fetchRetailCatalog, formatPriceEur } from '../src/catalog/products-catalog';

describe('mapProductRow', () => {
  it('mapira snake_case redak u tipizirani Product', () => {
    const p = mapProductRow({
      id: 'slot_diplomski',
      kind: 'slot',
      audience: 'retail',
      work_type: 'diplomski',
      slots_total: 1,
      slot_window_days: 14,
      purchase_window_days: 90,
      price_eur: '9.99',
      mor_product_id: 'ls-123',
      manual_fulfillment: false,
      active: true,
      sort: 30,
    });
    expect(p).toEqual({
      id: 'slot_diplomski',
      kind: 'slot',
      audience: 'retail',
      workType: 'diplomski',
      slotsTotal: 1,
      slotWindowDays: 14,
      purchaseWindowDays: 90,
      priceEur: 9.99,
      morProductId: 'ls-123',
      manualFulfillment: false,
      active: true,
      sort: 30,
    });
  });
  it('null work_type i mor_product_id ostaju null (premium_human)', () => {
    const p = mapProductRow({ id: 'premium_human', kind: 'premium_human', audience: 'retail', work_type: null, price_eur: 49, manual_fulfillment: true });
    expect(p.workType).toBeNull();
    expect(p.morProductId).toBeNull();
    expect(p.manualFulfillment).toBe(true);
  });
});

describe('fetchRetailCatalog', () => {
  const config = { supabaseUrl: 'https://proj.supabase.co', anonKey: 'anon' };

  it('bez konfiguracije baca gresku', async () => {
    await expect(fetchRetailCatalog({ supabaseUrl: '', anonKey: '' })).rejects.toThrow();
  });

  it('trazi aktivne retail proizvode sortirane po sort, s anon apikey headerom', async () => {
    let seenUrl = '';
    let seenHeaders: Record<string, string> = {};
    const rows = [
      { id: 'slot_seminarski', kind: 'slot', audience: 'retail', work_type: 'seminarski', price_eur: 3.99, sort: 10 },
    ];
    const out = await fetchRetailCatalog(config, async (url, init) => {
      seenUrl = String(url);
      seenHeaders = (init?.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify(rows), { status: 200 });
    });
    expect(seenUrl).toContain('/rest/v1/products');
    expect(seenUrl).toContain('active=eq.true');
    expect(seenUrl).toContain('audience=eq.retail');
    expect(seenUrl).toContain('order=sort.asc');
    expect(seenHeaders.apikey).toBe('anon');
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('slot_seminarski');
  });

  it('neuspjeh HTTP-a baca gresku', async () => {
    await expect(
      fetchRetailCatalog(config, async () => new Response('nope', { status: 500 })),
    ).rejects.toThrow();
  });
});

describe('formatPriceEur', () => {
  it('hrvatski zapis s dvije decimale', () => {
    expect(formatPriceEur(9.99)).toBe('9,99 EUR');
    expect(formatPriceEur(3)).toBe('3,00 EUR');
    expect(formatPriceEur(150)).toBe('150,00 EUR');
  });
});
