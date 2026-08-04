import { describe, it, expect } from 'vitest';
import { buildAdminRpcCall } from '../src/admin/admin-dispatch';

describe('buildAdminRpcCall: legacy put', () => {
  it('golo {} ide na stari admin_beta_stats(), bez parametara', () => {
    expect(buildAdminRpcCall({})).toEqual({ rpcName: 'admin_beta_stats', rpcParams: {} });
  });

  it('tijelo bez view kljuca (bilo koji drugi sadrzaj) i dalje ide na legacy put', () => {
    expect(buildAdminRpcCall({ nekiDrugiKljuc: 1 })).toEqual({ rpcName: 'admin_beta_stats', rpcParams: {} });
  });

  it('null/ne-objekt tijelo ide na legacy put, ne baca', () => {
    expect(buildAdminRpcCall(null)).toEqual({ rpcName: 'admin_beta_stats', rpcParams: {} });
    expect(buildAdminRpcCall(undefined)).toEqual({ rpcName: 'admin_beta_stats', rpcParams: {} });
    expect(buildAdminRpcCall('string')).toEqual({ rpcName: 'admin_beta_stats', rpcParams: {} });
  });
});

describe('buildAdminRpcCall: validacija view/range', () => {
  it('nepoznat view -> bad_view', () => {
    expect(buildAdminRpcCall({ view: 'nepostojeci' })).toEqual({ error: 'bad_view' });
  });

  it('view koji nije string -> bad_view', () => {
    expect(buildAdminRpcCall({ view: 42 })).toEqual({ error: 'bad_view' });
  });

  it('nepoznat range -> bad_range', () => {
    expect(buildAdminRpcCall({ view: 'overview', range: 'jucer' })).toEqual({ error: 'bad_range' });
  });

  it('bez range-a koristi razuman default (7d), ne pada', () => {
    const call = buildAdminRpcCall({ view: 'overview' });
    expect(call).not.toHaveProperty('error');
    expect((call as { rpcName: string }).rpcName).toBe('admin_overview_stats');
  });

  it('custom range bez from/to -> bad_range (delegirano na resolveAdminRange)', () => {
    expect(buildAdminRpcCall({ view: 'overview', range: 'custom' })).toEqual({ error: 'bad_range' });
  });

  it('custom range s prevelikim rasponom -> range_too_large (delegirano na resolveAdminRange)', () => {
    expect(buildAdminRpcCall({ view: 'overview', range: 'custom', from: '2020-01-01', to: '2024-01-01' })).toEqual({
      error: 'range_too_large',
    });
  });
});

describe('buildAdminRpcCall: 6 pogleda -> ispravna RPC imena', () => {
  const cases: Array<[string, string]> = [
    ['overview', 'admin_overview_stats'],
    ['funnel', 'admin_funnel_stats'],
    ['revenue', 'admin_revenue_stats'],
    ['operations', 'admin_operations_stats'],
    ['usage', 'admin_usage_stats'],
    ['coverage', 'admin_coverage_stats'],
  ];
  for (const [view, rpcName] of cases) {
    it(`${view} -> ${rpcName}`, () => {
      const call = buildAdminRpcCall({ view, range: '7d' });
      expect(call).toMatchObject({ view, rpcName });
      expect((call as { rpcParams: Record<string, unknown> }).rpcParams).toHaveProperty('p_from');
      expect((call as { rpcParams: Record<string, unknown> }).rpcParams).toHaveProperty('p_to');
    });
  }
});

describe('buildAdminRpcCall: p_events (funnel)', () => {
  it('bez events u tijelu, p_events IZOSTAJE iz rpcParams (SQL default se primjenjuje)', () => {
    const call = buildAdminRpcCall({ view: 'funnel', range: '7d' });
    expect(call).not.toHaveProperty('error');
    expect((call as { rpcParams: Record<string, unknown> }).rpcParams).not.toHaveProperty('p_events');
  });

  it('valjan custom niz eventa se prenosi kao p_events', () => {
    const call = buildAdminRpcCall({ view: 'funnel', range: '7d', events: ['file_selected', 'analysis_completed'] });
    expect((call as { rpcParams: Record<string, unknown> }).rpcParams.p_events).toEqual(['file_selected', 'analysis_completed']);
  });

  it('prazan niz eventa -> bad_events', () => {
    expect(buildAdminRpcCall({ view: 'funnel', range: '7d', events: [] })).toEqual({ error: 'bad_events' });
  });

  it('predugacak niz eventa -> bad_events', () => {
    const events = Array.from({ length: 13 }, (_, i) => `event_${i}`);
    expect(buildAdminRpcCall({ view: 'funnel', range: '7d', events })).toEqual({ error: 'bad_events' });
  });

  it('neispravan format imena eventa -> bad_events', () => {
    expect(buildAdminRpcCall({ view: 'funnel', range: '7d', events: ['Analysis Completed!'] })).toEqual({ error: 'bad_events' });
    expect(buildAdminRpcCall({ view: 'funnel', range: '7d', events: [123] })).toEqual({ error: 'bad_events' });
  });

  it('events na drugom viewu (ne funnel) se tiho ignorira, ne dodaje p_events', () => {
    const call = buildAdminRpcCall({ view: 'overview', range: '7d', events: ['analysis_completed'] });
    expect((call as { rpcParams: Record<string, unknown> }).rpcParams).not.toHaveProperty('p_events');
  });
});

describe('buildAdminRpcCall: p_limit (coverage)', () => {
  it('bez limita u tijelu, p_limit IZOSTAJE iz rpcParams (SQL default se primjenjuje)', () => {
    const call = buildAdminRpcCall({ view: 'coverage', range: '30d' });
    expect((call as { rpcParams: Record<string, unknown> }).rpcParams).not.toHaveProperty('p_limit');
  });

  it('valjan limit se prenosi kao p_limit', () => {
    const call = buildAdminRpcCall({ view: 'coverage', range: '30d', limit: 10 });
    expect((call as { rpcParams: Record<string, unknown> }).rpcParams.p_limit).toBe(10);
  });

  it('limit izvan granica (0, 201, ne-cijeli broj) -> bad_limit', () => {
    expect(buildAdminRpcCall({ view: 'coverage', range: '30d', limit: 0 })).toEqual({ error: 'bad_limit' });
    expect(buildAdminRpcCall({ view: 'coverage', range: '30d', limit: 201 })).toEqual({ error: 'bad_limit' });
    expect(buildAdminRpcCall({ view: 'coverage', range: '30d', limit: 3.5 })).toEqual({ error: 'bad_limit' });
  });

  it('limit na drugom viewu (ne coverage) se tiho ignorira', () => {
    const call = buildAdminRpcCall({ view: 'usage', range: '30d', limit: 10 });
    expect((call as { rpcParams: Record<string, unknown> }).rpcParams).not.toHaveProperty('p_limit');
  });
});
