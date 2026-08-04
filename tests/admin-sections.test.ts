/**
 * Dimni test render slojeva: poziva svaku admin-section-*.ts funkciju sa realističnim mock
 * podacima u happy-dom okruženju (isto okruženje kao ostatak vitest paketa) i provjerava da se
 * ne ruši te da proizvodi razuman DOM. Ovo NIJE zamjena za stvaran pregled u pregledniku (izgled/
 * boje/raspored se ovdje ne vide), ali hvata prave runtime greske (null pristup, kriv kljuc u
 * mapiranju podataka) koje tsc ne vidi jer su podaci u testu strukturno isti kao stvaran API odgovor.
 */
import { describe, it, expect } from 'vitest';
import { renderOverviewSection } from '../src/admin/admin-section-overview';
import { renderFunnelSection } from '../src/admin/admin-section-funnel';
import { renderRevenueSection } from '../src/admin/admin-section-revenue';
import { renderOperationsSection } from '../src/admin/admin-section-operations';
import { renderUsageSection } from '../src/admin/admin-section-usage';
import { renderCoverageSection } from '../src/admin/admin-section-coverage';
import type {
  OverviewStats,
  FunnelStats,
  RevenueStats,
  OperationsStats,
  UsageStats,
  CoverageStats,
} from '../src/admin/admin-types';

function container(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

const RANGE = { from: '2026-07-27T00:00:00.000Z', to: '2026-08-03T00:00:00.000Z', previousFrom: '2026-07-20T00:00:00.000Z', previousTo: '2026-07-27T00:00:00.000Z' };

const OVERVIEW: OverviewStats = {
  generatedAt: '2026-08-03T10:00:00.000Z',
  range: RANGE,
  current: {
    newUsers: 42, analysesCompleted: 310, purchasesCompleted: 27, grossRevenueEur: 161.73,
    refunds: 2, newDocumentSlots: 55, repairJobsDone: 19, facultyRequestsNew: 6,
    headlineFunnel: [
      { event: 'analyzer_engaged', count: 900 }, { event: 'analysis_completed', count: 310 },
      { event: 'checkout_started', count: 40 }, { event: 'purchase_completed', count: 27 },
    ],
  },
  previous: {
    newUsers: 30, analysesCompleted: 250, purchasesCompleted: 20, grossRevenueEur: 120,
    refunds: 1, newDocumentSlots: 40, repairJobsDone: 15, facultyRequestsNew: 3,
    headlineFunnel: [
      { event: 'analyzer_engaged', count: 700 }, { event: 'analysis_completed', count: 250 },
      { event: 'checkout_started', count: 30 }, { event: 'purchase_completed', count: 20 },
    ],
  },
  retention: [{ table: 'analytics_events', retentionDays: 180, note: 'test' }],
};

const FUNNEL: FunnelStats = {
  generatedAt: '2026-08-03T10:00:00.000Z',
  basis: 'event_count',
  range: RANGE,
  current: [
    { event: 'landing_view', count: 12480 }, { event: 'analyzer_engaged', count: 900 },
    { event: 'file_selected', count: 750 }, { event: 'analysis_started', count: 700 },
    { event: 'analysis_completed', count: 650 }, { event: 'paywall_viewed', count: 400 },
    { event: 'checkout_started', count: 60 }, { event: 'purchase_completed', count: 27 },
  ],
  previous: [
    { event: 'landing_view', count: 10000 }, { event: 'analyzer_engaged', count: 0 },
    { event: 'file_selected', count: 600 }, { event: 'analysis_started', count: 550 },
    { event: 'analysis_completed', count: 500 }, { event: 'paywall_viewed', count: 300 },
    { event: 'checkout_started', count: 45 }, { event: 'purchase_completed', count: 20 },
  ],
  retention: [{ table: 'analytics_events', retentionDays: 180, note: 'test' }],
};

function revenueBucket(mult: number) {
  return {
    grossEur: 161.73 * mult, refundsEur: 12 * mult, netEur: 149.73 * mult,
    estimatedNetAfterMorFeeEur: 140 * mult, purchaseCount: Math.round(27 * mult), refundCount: Math.round(2 * mult),
    byWorkType: [{ workType: 'diplomski', grossEur: 90 * mult, purchaseCount: Math.round(9 * mult) }],
    byProduct: [{ productId: 'slot_diplomski', grossEur: 90 * mult, purchaseCount: Math.round(9 * mult) }],
    byAudience: [{ audience: 'retail', grossEur: 150 * mult }],
  };
}

const REVENUE: RevenueStats = {
  generatedAt: '2026-08-03T10:00:00.000Z',
  range: RANGE,
  feeAssumptions: { morFeePct: 0.05, morFeeFixedEur: 0.5, verified: false, source: 'test', note: 'test note' },
  trend: [
    { date: '2026-07-28', grossEur: 20, purchaseCount: 2 },
    { date: '2026-07-29', grossEur: 0, purchaseCount: 0 },
    { date: '2026-07-30', grossEur: 45, purchaseCount: 4 },
    { date: '2026-07-31', grossEur: 30, purchaseCount: 3 },
    { date: '2026-08-01', grossEur: 50, purchaseCount: 5 },
    { date: '2026-08-02', grossEur: 16.73, purchaseCount: 2 },
  ],
  priceChanges: [{ date: '2026-07-30', productId: 'slot_diplomski', oldValue: '8.99', newValue: '9.99', note: null }],
  current: revenueBucket(1),
  previous: revenueBucket(0.8),
  retention: [{ table: 'entitlements', retentionDays: null, note: 'test' }],
};

function opsPreflight(done: number, error: number) {
  return { total: done + error, avgDurationMs: 4200, bySeverity: [{ severity: 'error', count: 3 }, { severity: 'warning', count: 8 }], done, error };
}

const OPERATIONS: OperationsStats = {
  generatedAt: '2026-08-03T10:00:00.000Z',
  range: RANGE,
  current: {
    repair: { total: 20, done: 19, failed: 1, avgChangesCount: 7.4, distinctUsers: 15 },
    generations: { total: 50, byStatus: [{ status: 'new_slot', count: 30 }, { status: 'recheck', count: 15 }, { status: 'denied', count: 5 }] },
    preflight: opsPreflight(48, 2),
  },
  previous: {
    repair: { total: 18, done: 18, failed: 0, avgChangesCount: 6.1, distinctUsers: 12 },
    generations: { total: 40, byStatus: [{ status: 'new_slot', count: 25 }, { status: 'recheck', count: 15 }] },
    preflight: opsPreflight(35, 0),
  },
  retention: [{ table: 'report_generations', retentionDays: 90, note: 'TVRDO brisano nakon 90 dana' }],
};

const USAGE: UsageStats = {
  generatedAt: '2026-08-03T10:00:00.000Z',
  range: RANGE,
  current: {
    slotsByTierAndWorkType: [
      { tier: 0, workType: 'seminarski', count: 5 }, { tier: 1, workType: 'zavrsni', count: 8 },
      { tier: 2, workType: 'diplomski', count: 12 }, { tier: 3, workType: 'diplomski', count: 20 },
    ],
    repairJobsByWorkType: [{ workType: 'diplomski', count: 10 }, { workType: 'zavrsni', count: 6 }, { workType: 'seminarski', count: 3 }],
  },
  previous: { slotsByTierAndWorkType: [], repairJobsByWorkType: [] },
  retention: [{ table: 'document_slots', retentionDays: null, note: 'test' }],
};

const COVERAGE: CoverageStats = {
  generatedAt: '2026-08-03T10:00:00.000Z',
  range: RANGE,
  current: {
    totalRequests: 42, withEmail: 30, distinctFaculties: 8,
    topCells: [
      { facultyId: 'efzg', facultyNameRaw: 'Ekonomski fakultet Zagreb', programId: 'management', workType: 'diplomski', totalRequests: 12, uniqueRequesters: 10, withEmail: 8, firstSeen: '2026-07-01T00:00:00Z', lastSeen: '2026-08-01T00:00:00Z' },
      { facultyId: null, facultyNameRaw: 'Nepoznat fakultet', programId: null, workType: null, totalRequests: 3, uniqueRequesters: 3, withEmail: 0, firstSeen: '2026-07-05T00:00:00Z', lastSeen: '2026-07-05T00:00:00Z' },
    ],
  },
  previous: { totalRequests: 30, withEmail: 20, distinctFaculties: 6 },
  retention: [{ table: 'faculty_requests', retentionDays: null, note: 'ip_hash nuliran 30d' }],
};

describe('admin-section render moduli: ne ruse se, proizvode razuman DOM', () => {
  it('overview: hero + 7 KPI kartica + funnel s 4 koraka', () => {
    const c = container();
    renderOverviewSection(c, OVERVIEW);
    expect(c.querySelector('.hero')).toBeTruthy();      // tocno jedan hero broj po prikazu
    expect(c.querySelectorAll('.tile').length).toBe(7);
    expect(c.querySelectorAll('.fn-step').length).toBe(4);
    expect(c.querySelector('.tile-note')).toBeTruthy();
  });

  it('funnel: 8 koraka + tablica usporedbe s 8 redaka', () => {
    const c = container();
    renderFunnelSection(c, FUNNEL);
    expect(c.querySelectorAll('.fn-step').length).toBe(8);
    // vidljive tablice (.tw): omjeri prijelaza (7 = 8 koraka - 1) + usporedba (8)
    expect(c.querySelectorAll('.tw table tbody tr').length).toBe(15);
  });

  it('funnel: korak s previous=0 (analyzer_engaged) ne baca gresku kod racunanja delte', () => {
    const c = container();
    expect(() => renderFunnelSection(c, FUNNEL)).not.toThrow();
  });

  it('revenue: KPI kartice + trend graf s markerom + tablica po proizvodu', () => {
    const c = container();
    renderRevenueSection(c, REVENUE);
    expect(c.querySelectorAll('.tile').length).toBe(3); // + hero, koji nije .tile
    expect(c.querySelector('.trend-svg')).toBeTruthy();
    expect(c.querySelectorAll('.mk-dot').length).toBe(1);
    expect(c.querySelector('.callout')).toBeTruthy();
    expect(c.querySelectorAll('.tw table tbody tr').length).toBe(2); // po proizvodu (1) + po vrsti rada (1)
  });

  it('revenue: prazan trend ne baca gresku i prikazuje prazno stanje', () => {
    const c = container();
    const empty: RevenueStats = { ...REVENUE, trend: [] };
    expect(() => renderRevenueSection(c, empty)).not.toThrow();
    expect(c.querySelector('.trend-svg')).toBeFalsy();
  });

  it('operations: statusna traka + 3 podsustav kartice', () => {
    const c = container();
    renderOperationsSection(c, OPERATIONS);
    expect(c.querySelector('.banner')).toBeTruthy();
    expect(c.querySelectorAll('.subsystem').length).toBe(3);
  });

  it('operations: prazan prozor (sve na 0) daje no-data status, ne baca gresku', () => {
    const c = container();
    const empty: OperationsStats = {
      ...OPERATIONS,
      current: {
        repair: { total: 0, done: 0, failed: 0, avgChangesCount: 0, distinctUsers: 0 },
        generations: { total: 0, byStatus: [] },
        preflight: { total: 0, avgDurationMs: null, bySeverity: [], done: 0, error: 0 },
      },
    };
    expect(() => renderOperationsSection(c, empty)).not.toThrow();
    expect(c.querySelector('.banner.none')).toBeTruthy();
  });

  it('usage: tier prsten + bar-lista + cross-tab tablica', () => {
    const c = container();
    renderUsageSection(c, USAGE);
    expect(c.querySelector('.donut-svg')).toBeTruthy();  // razine kao segmentirani donut
    expect(c.querySelectorAll('.bl-row').length).toBe(3);
    expect(c.querySelectorAll('.tw table tbody tr').length).toBe(4);
  });

  it('coverage: KPI kartice + top-N tablica, null polja se citljivo prikazu', () => {
    const c = container();
    renderCoverageSection(c, COVERAGE);
    expect(c.querySelector('.hero')).toBeTruthy();
    expect(c.querySelectorAll('.tile').length).toBe(2);
    const rows = c.querySelectorAll('.tw table tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[1].textContent).toContain('Nepoznat fakultet');
  });

  it('coverage: prazan topCells prikazuje prazno stanje, ne praznu tablicu', () => {
    const c = container();
    const empty: CoverageStats = { ...COVERAGE, current: { ...COVERAGE.current, topCells: [] } };
    renderCoverageSection(c, empty);
    expect(c.querySelector('.tw table')).toBeFalsy();
    expect(c.querySelector('.hint')?.textContent).toMatch(/Nema podataka/);
  });
});
