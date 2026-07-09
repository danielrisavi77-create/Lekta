import { describe, it, expect } from 'vitest';
import { subscribeToDeadline } from './deadline-client';
import type { AcademicDeadlineEntry } from './types';

const entry: AcademicDeadlineEntry = {
  facultyId: 'fpzg',
  programId: 'politologija',
  workType: 'diplomski',
  academicYear: '2025/2026',
  deadlineDate: '2026-09-15',
  source: 'https://primjer.hr/rokovi',
  fetchedAt: '2026-07-01',
  confirmed: true,
};
const cfg = { supabaseUrl: 'https://proj.supabase.co', anonKey: 'anon' };

function fetchStub(status: number, capture?: (url: string, init: RequestInit) => void): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    capture?.(url, init);
    return { status, ok: status >= 200 && status < 300 } as Response;
  }) as unknown as typeof fetch;
}

describe('subscribeToDeadline', () => {
  it('skipped kad Supabase nije konfiguriran', async () => {
    const out = await subscribeToDeadline({ supabaseUrl: '', anonKey: '' }, 'tok', 'uid', entry, fetchStub(200));
    expect(out).toEqual({ kind: 'skipped', reason: 'not_configured' });
  });

  it('skipped kad korisnik nije prijavljen (nema tokena/uid)', async () => {
    const out = await subscribeToDeadline(cfg, '', '', entry, fetchStub(200));
    expect(out).toEqual({ kind: 'skipped', reason: 'not_authenticated' });
  });

  it('ok na 2xx i salje ispravan REST poziv (headeri + tijelo + user_id)', async () => {
    let seenUrl = '';
    let seenInit: RequestInit = {};
    const out = await subscribeToDeadline(cfg, 'jwt-123', 'user-9', entry, fetchStub(201, (u, i) => { seenUrl = u; seenInit = i; }));
    expect(out).toEqual({ kind: 'ok' });
    expect(seenUrl).toBe('https://proj.supabase.co/rest/v1/deadline_subscriptions');
    const h = seenInit.headers as Record<string, string>;
    expect(h.apikey).toBe('anon');
    expect(h.Authorization).toBe('Bearer jwt-123');
    const body = JSON.parse(String(seenInit.body));
    expect(body.user_id).toBe('user-9');
    expect(body.faculty_id).toBe('fpzg');
    expect(body.work_type).toBe('diplomski');
    expect(body.deadline_date).toBe('2026-09-15');
    expect(body.deadline_source).toBe('https://primjer.hr/rokovi');
  });

  it('error na ne-2xx odgovor', async () => {
    const out = await subscribeToDeadline(cfg, 'tok', 'uid', entry, fetchStub(403));
    expect(out.kind).toBe('error');
    if (out.kind === 'error') expect(out.status).toBe(403);
  });

  it('error kad fetch baci (mrezna greska)', async () => {
    const throwing = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const out = await subscribeToDeadline(cfg, 'tok', 'uid', entry, throwing);
    expect(out).toEqual({ kind: 'error', message: 'offline' });
  });
});
