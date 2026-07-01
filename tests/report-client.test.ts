import { describe, it, expect } from 'vitest';

import {
  requestFullReport,
  unlockFullReport,
  extractParsedStructure,
  toReportWorkType,
  type ReportClientConfig,
} from '../src/report/report-client';
import { buildReportRequest, type AnalysisResultLike } from '../src/report/report';

const config: ReportClientConfig = { endpoint: 'https://edge.example/generate-report' };

/** Lazni fetch koji vraca zadani status i tijelo, i biljezi poziv. */
function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return {
      status,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const result: AnalysisResultLike & { documentStructure?: any } = {
  score: 80,
  issues: [],
  checks: [],
  documentStructure: {
    title: 'Moj diplomski',
    author: 'Ana Anic',
    headings: [{ level: 1, text: 'Uvod' }],
  },
};

describe('toReportWorkType i extractParsedStructure', () => {
  it('mapira profilske vrste rada u naplatne', () => {
    expect(toReportWorkType('final')).toBe('zavrsni');
    expect(toReportWorkType('graduate')).toBe('diplomski');
    expect(toReportWorkType('doctoral')).toBe('doktorski');
    expect(toReportWorkType('diplomski')).toBe('diplomski'); // vec naplatni prolazi
    expect(toReportWorkType('nepoznato')).toBe('zavrsni'); // fallback
  });

  it('izvlaci otisak-ulaz iz documentStructure', () => {
    const s = extractParsedStructure(result);
    expect(s.title).toBe('Moj diplomski');
    expect(s.headings).toHaveLength(1);
  });

  it('prazno kad nema documentStructure', () => {
    const s = extractParsedStructure({});
    expect(s.title).toBeNull();
    expect(s.headings).toEqual([]);
  });
});

describe('requestFullReport: mapiranje HTTP odgovora', () => {
  const req = buildReportRequest({ title: 'X', headings: [] }, result, 'diplomski');

  it('200 -> ok s izvjestajem', async () => {
    const { fn } = fakeFetch(200, { report: { score: 80 }, slotId: 'slot-1' });
    const out = await requestFullReport(config, 'jwt', req, fn);
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') expect(out.slotId).toBe('slot-1');
  });

  it('402 -> paywall za work_type', async () => {
    const { fn } = fakeFetch(402, { workType: 'diplomski' });
    const out = await requestFullReport(config, 'jwt', req, fn);
    expect(out).toEqual({ kind: 'paywall', workType: 'diplomski' });
  });

  it('429 -> rate_limited', async () => {
    const { fn } = fakeFetch(429, {});
    expect((await requestFullReport(config, 'jwt', req, fn)).kind).toBe('rate_limited');
  });

  it('401 -> unauthorized', async () => {
    const { fn } = fakeFetch(401, {});
    expect((await requestFullReport(config, 'jwt', req, fn)).kind).toBe('unauthorized');
  });

  it('salje Authorization header kad ima token', async () => {
    const { fn, calls } = fakeFetch(200, { report: {} });
    await requestFullReport(config, 'jwt-123', req, fn);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-123');
  });

  it('prazan endpoint -> error bez mreznog poziva', async () => {
    const { fn, calls } = fakeFetch(200, {});
    const out = await requestFullReport({ endpoint: '' }, '', req, fn);
    expect(out.kind).toBe('error');
    expect(calls).toHaveLength(0);
  });

  it('mrezna iznimka -> error', async () => {
    const fn = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const out = await requestFullReport(config, '', req, fn);
    expect(out).toEqual({ kind: 'error', message: 'offline' });
  });
});

describe('unlockFullReport: orkestrator', () => {
  it('sastavi otisak iz rezultata i vrati ishod servera', async () => {
    const { fn, calls } = fakeFetch(200, { report: { ok: true } });
    const out = await unlockFullReport(result, 'graduate', config, 'jwt', fn);
    expect(out.kind).toBe('ok');
    const sentBody = JSON.parse((calls[0].init?.body as string) ?? '{}');
    expect(sentBody.workType).toBe('diplomski'); // graduate -> diplomski
    expect(sentBody.parsedStructure.title).toBe('Moj diplomski');
  });
});
