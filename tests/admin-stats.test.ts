import { describe, it, expect } from 'vitest';
import {
  fetchAdminStats,
  formatBytes,
  toStatTiles,
  toWorkTypeRows,
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
