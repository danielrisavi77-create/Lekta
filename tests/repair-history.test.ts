import { describe, it, expect } from 'vitest';

import {
  mapRepairJobRow,
  fetchRepairJobs,
  signRepairDownload,
  deleteRepairJob,
  type RepairHistoryConfig,
} from '../src/report/repair-history';

const config: RepairHistoryConfig = {
  supabaseUrl: 'https://proj.supabase.co',
  anonKey: 'anon-key',
  deleteEndpoint: 'https://proj.supabase.co/functions/v1/delete-repair-job',
};

function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('mapRepairJobRow', () => {
  it('mapira snake_case redak u RepairJob', () => {
    const job = mapRepairJobRow({
      id: 'j1', work_type: 'diplomski', label: 'Moj rad', status: 'done',
      original_bytes: '1000', result_bytes: 900, changes_count: 5,
      result_path: 'u1/j1/fixed.docx', created_at: '2026-07-19T10:00:00Z',
    });
    expect(job).toEqual({
      id: 'j1', workType: 'diplomski', label: 'Moj rad', status: 'done',
      originalBytes: 1000, resultBytes: 900, changesCount: 5,
      resultPath: 'u1/j1/fixed.docx', createdAt: '2026-07-19T10:00:00Z',
      deleting: false,
    });
  });

  /**
   * Audit P1-10 (migracija 0098). Posao kojem je brisanje zapoceto pa prekinuto pokazuje na
   * blobove kojih vise nema, pa ga sucelje NE SMIJE nuditi za preuzimanje.
   */
  it('deleting_at oznacava posao u brisanju', () => {
    const job = mapRepairJobRow({
      id: 'j2', result_path: 'p', created_at: 't', deleting_at: '2026-08-23T10:00:00Z',
    });
    expect(job.deleting).toBe(true);
  });

  it('bez deleting_at posao je zdrav', () => {
    expect(mapRepairJobRow({ id: 'j3', result_path: 'p', created_at: 't' }).deleting).toBe(false);
    expect(mapRepairJobRow({ id: 'j4', result_path: 'p', created_at: 't', deleting_at: null }).deleting).toBe(false);
    // Prazan string je PostgREST-ov nacin da kaze "nista", ne valjan trenutak.
    expect(mapRepairJobRow({ id: 'j5', result_path: 'p', created_at: 't', deleting_at: '' }).deleting).toBe(false);
  });
  it('null brojevi ostaju null', () => {
    const job = mapRepairJobRow({ id: 'j', result_path: 'p', created_at: 't' });
    expect(job.originalBytes).toBe(null);
    expect(job.changesCount).toBe(null);
    expect(job.label).toBe(null);
  });
});

describe('fetchRepairJobs', () => {
  it('bez konfiguracije -> baca', async () => {
    await expect(fetchRepairJobs({ ...config, supabaseUrl: '' }, 'jwt')).rejects.toThrow();
  });
  it('bez tokena -> baca (RLS trazi identitet)', async () => {
    await expect(fetchRepairJobs(config, '')).rejects.toThrow();
  });
  it('salje apikey + Bearer i mapira retke', async () => {
    let seenUrl = '', seenHeaders: Record<string, string> = {};
    const jobs = await fetchRepairJobs(config, 'user-jwt', async (url, init) => {
      seenUrl = String(url); seenHeaders = init?.headers as Record<string, string>;
      return res(200, [{ id: 'j1', work_type: 'zavrsni', result_path: 'u/j/fixed.docx', created_at: 't' }]);
    });
    expect(seenUrl).toContain('/rest/v1/repair_jobs');
    expect(seenUrl).toContain('order=created_at.desc');
    expect(seenHeaders.apikey).toBe('anon-key');
    expect(seenHeaders.Authorization).toBe('Bearer user-jwt');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].workType).toBe('zavrsni');
  });
  it('ne-200 -> baca', async () => {
    await expect(fetchRepairJobs(config, 'jwt', async () => res(401, {}))).rejects.toThrow();
  });
});

describe('signRepairDownload', () => {
  it('gradi apsolutni URL iz relativnog signedURL', async () => {
    let seenUrl = '';
    const url = await signRepairDownload(config, 'jwt', 'u1/j1/fixed.docx', async (u, init) => {
      seenUrl = String(u);
      expect(init?.method).toBe('POST');
      return res(200, { signedURL: '/object/sign/repair/u1/j1/fixed.docx?token=abc' });
    });
    expect(seenUrl).toBe('https://proj.supabase.co/storage/v1/object/sign/repair/u1/j1/fixed.docx');
    expect(url).toBe('https://proj.supabase.co/storage/v1/object/sign/repair/u1/j1/fixed.docx?token=abc');
  });
  it('prihvaca vec apsolutni signedUrl', async () => {
    const url = await signRepairDownload(config, 'jwt', 'p', async () => res(200, { signedUrl: 'https://cdn/x?token=z' }));
    expect(url).toBe('https://cdn/x?token=z');
  });
  it('bez signedURL -> baca', async () => {
    await expect(signRepairDownload(config, 'jwt', 'p', async () => res(200, {}))).rejects.toThrow();
  });
  it('ne-200 -> baca', async () => {
    await expect(signRepairDownload(config, 'jwt', 'p', async () => res(403, {}))).rejects.toThrow();
  });
});

describe('deleteRepairJob', () => {
  it('bez endpointa -> ok:false', async () => {
    const out = await deleteRepairJob({ ...config, deleteEndpoint: '' }, 'jwt', 'j1');
    expect(out).toEqual({ ok: false, error: 'delete endpoint nije konfiguriran' });
  });
  it('bez jobId -> ok:false', async () => {
    expect((await deleteRepairJob(config, 'jwt', '')).ok).toBe(false);
  });
  it('200 {ok:true} -> ok', async () => {
    let seen: RequestInit | undefined;
    const out = await deleteRepairJob(config, 'jwt', 'j1', async (_u, init) => { seen = init; return res(200, { ok: true, jobId: 'j1' }); });
    expect(out).toEqual({ ok: true });
    expect((seen?.headers as Record<string, string>).Authorization).toBe('Bearer jwt');
    expect(JSON.parse(String(seen?.body))).toEqual({ jobId: 'j1' });
  });
  it('404 -> ok:false s razlogom', async () => {
    const out = await deleteRepairJob(config, 'jwt', 'j1', async () => res(404, { error: 'not_found' }));
    expect(out).toEqual({ ok: false, error: 'not_found' });
  });
  it('mrezna greska -> ok:false', async () => {
    const out = await deleteRepairJob(config, 'jwt', 'j1', async () => { throw new Error('offline'); });
    expect(out).toEqual({ ok: false, error: 'offline' });
  });
});
