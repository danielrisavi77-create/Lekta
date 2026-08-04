import { describe, it, expect } from 'vitest';
import { resolveAdminRange, isAdminRangeError, type ResolvedAdminRange } from '../src/admin/admin-range';

const DAY_MS = 86_400_000;

function ok(r: ReturnType<typeof resolveAdminRange>): ResolvedAdminRange {
  expect(isAdminRangeError(r)).toBe(false);
  return r as ResolvedAdminRange;
}

describe('resolveAdminRange: today', () => {
  it('zimski datum (Zagreb CET, UTC+1): pocetak dana je 23:00 UTC prethodnog dana', () => {
    const now = new Date(Date.UTC(2026, 0, 15, 14, 30, 0)); // 15. sijecnja 2026., 14:30 UTC = 15:30 CET
    const r = ok(resolveAdminRange('today', { now }));
    expect(r.from).toBe(new Date(Date.UTC(2026, 0, 14, 23, 0, 0)).toISOString());
    expect(r.to).toBe(now.toISOString());
  });

  it('ljetni datum (Zagreb CEST, UTC+2): pocetak dana je 22:00 UTC prethodnog dana', () => {
    const now = new Date(Date.UTC(2026, 7, 3, 10, 0, 0)); // 3. kolovoza 2026., 10:00 UTC = 12:00 CEST
    const r = ok(resolveAdminRange('today', { now }));
    expect(r.from).toBe(new Date(Date.UTC(2026, 7, 2, 22, 0, 0)).toISOString());
    expect(r.to).toBe(now.toISOString());
  });

  it('previous je JUCER u istom dijelu dana, ne protekli dio jucer navecer', () => {
    const now = new Date(Date.UTC(2026, 7, 3, 10, 0, 0));
    const r = ok(resolveAdminRange('today', { now }));
    const from = new Date(r.from).getTime();
    const to = new Date(r.to).getTime();
    const prevFrom = new Date(r.previousFrom).getTime();
    const prevTo = new Date(r.previousTo).getTime();
    expect(from - prevFrom).toBe(DAY_MS);
    expect(prevTo - prevFrom).toBe(to - from); // ista "iscrpljenost" dana
    expect(prevTo).toBeLessThanOrEqual(from); // bez preklapanja s tekucim prozorom
  });
});

describe('resolveAdminRange: 7d i 30d', () => {
  it('7d: tocno 7 dana, previous je neposredno prethodnih 7 dana bez razmaka', () => {
    const now = new Date(Date.UTC(2026, 7, 3, 10, 0, 0));
    const r = ok(resolveAdminRange('7d', { now }));
    expect(new Date(r.to).getTime() - new Date(r.from).getTime()).toBe(7 * DAY_MS);
    expect(new Date(r.from).getTime() - new Date(r.previousFrom).getTime()).toBe(7 * DAY_MS);
    expect(r.previousTo).toBe(r.from);
    expect(r.to).toBe(now.toISOString());
  });

  it('30d: tocno 30 dana, previous kontinuiran', () => {
    const now = new Date(Date.UTC(2026, 7, 3, 10, 0, 0));
    const r = ok(resolveAdminRange('30d', { now }));
    expect(new Date(r.to).getTime() - new Date(r.from).getTime()).toBe(30 * DAY_MS);
    expect(new Date(r.from).getTime() - new Date(r.previousFrom).getTime()).toBe(30 * DAY_MS);
    expect(r.previousTo).toBe(r.from);
  });
});

describe('resolveAdminRange: custom', () => {
  it('jedan dan (from===to): raspon je tocno 24h, toDate je inkluzivan', () => {
    const r = ok(resolveAdminRange('custom', { fromDate: '2026-07-15', toDate: '2026-07-15' }));
    expect(new Date(r.to).getTime() - new Date(r.from).getTime()).toBe(DAY_MS);
  });

  it('visednevni raspon: previous je jednake duljine, neposredno prije, bez razmaka', () => {
    const r = ok(resolveAdminRange('custom', { fromDate: '2026-07-01', toDate: '2026-07-31' }));
    const spanMs = new Date(r.to).getTime() - new Date(r.from).getTime();
    expect(spanMs).toBe(31 * DAY_MS);
    expect(new Date(r.from).getTime() - new Date(r.previousFrom).getTime()).toBe(spanMs);
    expect(r.previousTo).toBe(r.from);
  });

  it('nedostaje from/to -> bad_range', () => {
    expect(resolveAdminRange('custom', { toDate: '2026-07-31' })).toEqual({ error: 'bad_range' });
    expect(resolveAdminRange('custom', { fromDate: '2026-07-01' })).toEqual({ error: 'bad_range' });
    expect(resolveAdminRange('custom')).toEqual({ error: 'bad_range' });
  });

  it('neispravan format datuma -> bad_range', () => {
    expect(resolveAdminRange('custom', { fromDate: '15.7.2026', toDate: '2026-07-31' })).toEqual({ error: 'bad_range' });
    expect(resolveAdminRange('custom', { fromDate: '2026-07-01', toDate: 'not-a-date' })).toEqual({ error: 'bad_range' });
  });

  it('to prije from -> bad_range', () => {
    expect(resolveAdminRange('custom', { fromDate: '2026-07-31', toDate: '2026-07-01' })).toEqual({ error: 'bad_range' });
  });

  it('raspon dulji od 366 dana -> range_too_large', () => {
    expect(resolveAdminRange('custom', { fromDate: '2024-01-01', toDate: '2026-06-01' })).toEqual({ error: 'range_too_large' });
  });

  it('raspon od tocno 366 dana prolazi (granica je >, ne >=)', () => {
    // 2028. je prijestupna: 2028-01-01 .. 2029-01-01 (toDate inkluzivan) = tocno 366 dana
    const r = resolveAdminRange('custom', { fromDate: '2028-01-01', toDate: '2028-12-31' });
    expect(isAdminRangeError(r)).toBe(false);
  });
});

describe('resolveAdminRange: neispravan raspon', () => {
  it('nepoznata vrijednost range -> bad_range', () => {
    // @ts-expect-error namjerno neispravna vrijednost izvan unije, provjera runtime garda
    expect(resolveAdminRange('yesterday')).toEqual({ error: 'bad_range' });
  });
});
