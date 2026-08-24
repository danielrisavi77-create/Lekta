/**
 * Klijent rules-on-demand isporuke (faza B): diskriminirani union po HTTP statusu,
 * nikad ne baca, timeout preko AbortControllera, JEDAN retry samo za 'unavailable'.
 * Mock fetch (isti obrazac kao source-check-client testovi): bez mreze.
 */
import { describe, it, expect } from 'vitest';
import { fetchProfileRules, fetchProfileRulesWithRetry } from '../src/report/profile-rules-client';

const CFG = { endpoint: 'https://primjer.test/functions/v1/profile-rules' };
const RECORD = {
  v: 1,
  profileId: 'fpzg-politologija-diplomski',
  verifiedAt: '2026-06-28',
  datasetVersion: 'abc',
  profile: { id: 'fpzg-politologija-diplomski', rules: { font: ['Times New Roman'] } },
  repairEntries: [{ ruleId: 'x' }],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('profile-rules-client', () => {
  it('200 s valjanim zapisom -> ok', async () => {
    const out = await fetchProfileRules(CFG, RECORD.profileId, null, async (url) => {
      expect(String(url)).toBe(`${CFG.endpoint}?v=1&profileId=${RECORD.profileId}`);
      return jsonResponse(200, RECORD);
    });
    expect(out).toEqual({ kind: 'ok', record: RECORD });
  });

  it('200 s krivim oblikom -> unavailable (nikad tihi prolaz)', async () => {
    const out = await fetchProfileRules(CFG, RECORD.profileId, null, async () =>
      jsonResponse(200, { v: 1, profileId: 'drugi-profil', profile: {}, repairEntries: [], datasetVersion: 'x' }));
    expect(out.kind).toBe('unavailable');
  });

  it('404 -> not_found; 429 -> rate_limited s razlogom; mrezna greska -> unavailable', async () => {
    expect((await fetchProfileRules(CFG, 'nepoznat', null, async () => jsonResponse(404, { error: 'not_found' }))).kind).toBe('not_found');
    expect(await fetchProfileRules(CFG, 'x', null, async () => jsonResponse(429, { error: 'rate_limited', reason: 'ip' })))
      .toEqual({ kind: 'rate_limited', reason: 'ip' });
    const err = await fetchProfileRules(CFG, 'x', null, async () => { throw new Error('pukla mreza'); });
    expect(err).toEqual({ kind: 'unavailable', reason: 'pukla mreza' });
  });

  it('Bearer se salje samo kad token postoji', async () => {
    let seenAuth: string | null = 'nije-postavljeno';
    await fetchProfileRules(CFG, 'x', 'tajni-token', async (_url, init) => {
      seenAuth = (init?.headers as Record<string, string>)?.Authorization ?? null;
      return jsonResponse(404, {});
    });
    expect(seenAuth).toBe('Bearer tajni-token');
    await fetchProfileRules(CFG, 'x', null, async (_url, init) => {
      seenAuth = (init?.headers as Record<string, string>)?.Authorization ?? null;
      return jsonResponse(404, {});
    });
    expect(seenAuth).toBeNull();
  });

  it('retry: tocno jedan ponovni pokusaj i SAMO za unavailable', async () => {
    let calls = 0;
    const flaky = async () => { calls += 1; return calls === 1 ? jsonResponse(503, { error: 'disabled' }) : jsonResponse(200, RECORD); };
    const ok = await fetchProfileRulesWithRetry(CFG, RECORD.profileId, null, flaky, { delayImpl: async () => {} });
    expect(ok.kind).toBe('ok');
    expect(calls).toBe(2);

    calls = 0;
    const limited = async () => { calls += 1; return jsonResponse(429, { error: 'rate_limited', reason: 'user' }); };
    const out = await fetchProfileRulesWithRetry(CFG, 'x', null, limited, { delayImpl: async () => {} });
    expect(out.kind).toBe('rate_limited');
    expect(calls).toBe(1);
  });

  it('prazan endpoint -> unavailable bez mreze', async () => {
    const out = await fetchProfileRules({ endpoint: '' }, 'x', null, async () => { throw new Error('ne smije se zvati'); });
    expect(out).toEqual({ kind: 'unavailable', reason: 'nije konfigurirano' });
  });
});
