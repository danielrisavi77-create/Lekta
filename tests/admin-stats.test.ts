import { describe, it, expect } from 'vitest';
import {
  fetchAdminStats,
  formatBytes,
  toStatTiles,
  toWorkTypeRows,
  toAnalyticsRows,
  type BetaStats,
} from '../src/admin/admin-stats';

const CFG = { endpoint: 'https://example.test/functions/v1/admin-stats' };

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('formatBytes', () => {
  it('prazno i nula daju 0 MB', () => {
    expect(formatBytes(undefined)).toBe('0 MB');
    expect(formatBytes(0)).toBe('0 MB');
  });

  it('ispod megabajta prikazuje KB', () => {
    expect(formatBytes(500 * 1024)).toBe('500 KB');
  });

  it('megabajti koriste hrvatski decimalni zarez', () => {
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2,50 MB');
  });

  it('gigabajti se skaliraju', () => {
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3,00 GB');
  });
});

describe('toStatTiles', () => {
  it('prazno stanje ne ruse se i daje nule', () => {
    const tiles = toStatTiles({});
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => typeof t.value === 'string')).toBe(true);
    expect(tiles[0].value).toBe('0');
  });

  it('zbraja neuspjehe iz repair.failed i generations repair_failed', () => {
    const stats: BetaStats = { repair: { failed: 2 }, generations24h: { repair_failed: 3 } };
    const failed = toStatTiles(stats).find((t) => t.label === 'Neuspjelih popravaka');
    expect(failed?.value).toBe('5');
    expect(failed?.hint).toBe('provjeri Edge logove');
  });

  it('bez gresaka daje umirujuci hint', () => {
    const failed = toStatTiles({}).find((t) => t.label === 'Neuspjelih popravaka');
    expect(failed?.hint).toBe('bez grešaka');
  });

  it('prikazuje rate_limited iz zadnja 24 h', () => {
    const tiles = toStatTiles({ generations24h: { rate_limited: 7 } });
    expect(tiles.find((t) => t.label === 'Odbijeno zbog limita (24 h)')?.value).toBe('7');
  });

  it('prikazuje analytics eventе iz zadnjih 24h i 7 dana', () => {
    const tiles = toStatTiles({ analytics: { last24h: 12, last7d: 84 } });
    const tile = tiles.find((t) => t.label === 'Analytics eventi (24 h)');
    expect(tile?.value).toBe('12');
    expect(tile?.hint).toBe('84 u 7 dana');
  });

  it('analytics tile ne rusi prazno stanje', () => {
    const tile = toStatTiles({}).find((t) => t.label === 'Analytics eventi (24 h)');
    expect(tile?.value).toBe('0');
  });

  it('konverzija prikazuje ratePct s hrvatskim zarezom i sirove brojeve u hintu', () => {
    const tiles = toStatTiles({ analytics: { conversion7d: { analysisCompleted: 200, purchaseCompleted: 17, ratePct: 8.5 } } });
    const tile = tiles.find((t) => t.label === 'Konverzija (7 dana)');
    expect(tile?.value).toBe('8,5%');
    expect(tile?.hint).toBe('17 kupnji / 200 analiza');
  });

  it('konverzija bez analiza prikazuje crticu, ne 0%', () => {
    const tile = toStatTiles({ analytics: { conversion7d: { analysisCompleted: 0, purchaseCompleted: 0, ratePct: null } } }).find((t) => t.label === 'Konverzija (7 dana)');
    expect(tile?.value).toBe('—');
  });

  it('konverzija tile ne rusi prazno stanje', () => {
    const tile = toStatTiles({}).find((t) => t.label === 'Konverzija (7 dana)');
    expect(tile?.value).toBe('—');
    expect(tile?.hint).toBe('0 kupnji / 0 analiza');
  });
});

describe('toAnalyticsRows', () => {
  it('sortira silazno i izbacuje nule', () => {
    const rows = toAnalyticsRows({ analytics: { byEvent7d: { score_shared: 3, file_selected: 20, demo_played: 0 } } });
    expect(rows).toEqual([
      { event: 'file_selected', count: 20 },
      { event: 'score_shared', count: 3 },
    ]);
  });

  it('prazno kad nema podataka', () => {
    expect(toAnalyticsRows({})).toEqual([]);
  });
});

describe('toWorkTypeRows', () => {
  it('sortira silazno i izbacuje nule', () => {
    const rows = toWorkTypeRows({ byWorkType: { seminarski: 2, diplomski: 9, zavrsni: 0 } });
    expect(rows).toEqual([
      { workType: 'diplomski', count: 9 },
      { workType: 'seminarski', count: 2 },
    ]);
  });

  it('prazno kad nema podataka', () => {
    expect(toWorkTypeRows({})).toEqual([]);
  });
});

describe('fetchAdminStats', () => {
  it('bez endpointa ne zove mrezu', async () => {
    let called = false;
    const r = await fetchAdminStats({ endpoint: '' }, 'tok', (async () => {
      called = true;
      return res(200, {});
    }) as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, message: 'admin endpoint nije konfiguriran' });
    expect(called).toBe(false);
  });

  it('bez tokena trazi prijavu', async () => {
    const r = await fetchAdminStats(CFG, '', (async () => res(200, {})) as unknown as typeof fetch);
    expect(r.ok).toBe(false);
  });

  it('403 se razlikuje od 401 (nije admin vs nije prijavljen)', async () => {
    const forbidden = await fetchAdminStats(CFG, 'tok', (async () => res(403, {})) as unknown as typeof fetch);
    const unauth = await fetchAdminStats(CFG, 'tok', (async () => res(401, {})) as unknown as typeof fetch);
    expect(forbidden).toEqual({ ok: false, message: 'ovaj račun nema administratorska prava' });
    expect(unauth).toEqual({ ok: false, message: 'prijava je istekla, prijavi se ponovno' });
  });

  it('uspjeh vraca agregate', async () => {
    const r = await fetchAdminStats(CFG, 'tok', (async () =>
      res(200, { ok: true, stats: { repair: { total: 4 } } })) as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, stats: { repair: { total: 4 } } });
  });

  it('odgovor bez stats objekta je greska, ne prazan prikaz', async () => {
    const r = await fetchAdminStats(CFG, 'tok', (async () => res(200, { ok: true })) as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, message: 'nevaljan odgovor poslužitelja' });
  });

  it('mrezna greska se hvata', async () => {
    const r = await fetchAdminStats(CFG, 'tok', (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, message: 'offline' });
  });
});
