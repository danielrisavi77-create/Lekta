/**
 * Kanal A, klijent za popis i povlacenje priloga (src/report/corpus-contribution-client.ts). Lazni fetch: provjerava se
 * URL, zaglavlja i ugovor ishoda; nista ne ide na mrezu.
 */
import { describe, expect, it } from 'vitest';
import {
  corpusContributionConfigFrom,
  fetchActiveCorpusContributions,
  withdrawCorpusContribution,
} from '../src/report/corpus-contribution-client';

const cfg = corpusContributionConfigFrom({ supabaseUrl: 'https://x.supabase.co/', supabaseAnonKey: 'anon' });
const fakeFetch = (handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const r = handler(String(input), init);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

describe('corpusContributionConfigFrom', () => {
  it('izvodi endpoint povlacenja iz supabaseUrl, bez zavrsne kose crte', () => {
    expect(cfg.withdrawEndpoint).toBe('https://x.supabase.co/functions/v1/withdraw-corpus-contribution');
    expect(corpusContributionConfigFrom({}).withdrawEndpoint).toBe('');
  });
});

describe('fetchActiveCorpusContributions', () => {
  it('trazi SAMO nepovucene, s korisnickim JWT-om, i mapira redke', async () => {
    let seenUrl = '';
    let seenAuth = '';
    const f = fakeFetch((url, init) => {
      seenUrl = url;
      seenAuth = String(((init?.headers ?? {}) as Record<string, string>).Authorization);
      return { status: 200, body: [{ id: 'c1', repair_job_id: 'j1', created_at: '2026-09-05T10:00:00Z' }, { id: 'c2', repair_job_id: null, created_at: 'x' }, { nema: 'id' }] };
    });
    const out = await fetchActiveCorpusContributions(cfg, 'jwt', f);
    expect(seenUrl).toContain('/rest/v1/corpus_contributions?');
    expect(seenUrl).toContain('withdrawn_at=is.null');
    expect(seenAuth).toBe('Bearer jwt');
    expect(out).toEqual([
      { id: 'c1', repairJobId: 'j1', createdAt: '2026-09-05T10:00:00Z' },
      { id: 'c2', repairJobId: null, createdAt: 'x' },
    ]);
  });

  it('bez konfiguracije, bez tokena ili uz gresku vraca prazno, ne baca', async () => {
    expect(await fetchActiveCorpusContributions(corpusContributionConfigFrom({}), 'jwt')).toEqual([]);
    expect(await fetchActiveCorpusContributions(cfg, '')).toEqual([]);
    expect(await fetchActiveCorpusContributions(cfg, 'jwt', fakeFetch(() => ({ status: 500, body: {} })))).toEqual([]);
    expect(await fetchActiveCorpusContributions(cfg, 'jwt', (async () => { throw new Error('mreza'); }) as unknown as typeof fetch)).toEqual([]);
  });
});

describe('withdrawCorpusContribution', () => {
  it('POST na Edge funkciju s contributionId; ok i alreadyWithdrawn se prenose', async () => {
    let seen: { url: string; body: string; method?: string } | null = null;
    const f = fakeFetch((url, init) => {
      seen = { url, body: String(init?.body), method: init?.method };
      return { status: 200, body: { ok: true, contributionId: 'c1', alreadyWithdrawn: true } };
    });
    const out = await withdrawCorpusContribution(cfg, 'jwt', 'c1', f);
    expect(out).toEqual({ ok: true, alreadyWithdrawn: true });
    expect(seen!.url).toBe(cfg.withdrawEndpoint);
    expect(seen!.method).toBe('POST');
    expect(JSON.parse(seen!.body)).toEqual({ contributionId: 'c1' });
  });

  it('greska servera i mreze vracaju ok:false s imenovanim razlogom, ne bacaju', async () => {
    expect(await withdrawCorpusContribution(cfg, 'jwt', 'c1', fakeFetch(() => ({ status: 502, body: { error: 'blob_delete_failed' } })))).toEqual({ ok: false, error: 'blob_delete_failed' });
    expect(await withdrawCorpusContribution(cfg, 'jwt', 'c1', fakeFetch(() => ({ status: 500, body: null })))).toEqual({ ok: false, error: 'http_500' });
    expect(await withdrawCorpusContribution(cfg, 'jwt', 'c1', (async () => { throw new Error('x'); }) as unknown as typeof fetch)).toEqual({ ok: false, error: 'network' });
    expect(await withdrawCorpusContribution(corpusContributionConfigFrom({}), 'jwt', 'c1')).toEqual({ ok: false, error: 'not_configured' });
  });
});
