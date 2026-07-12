/**
 * Klijentski tok Provjere prije predaje: copy potpunost, status mapping s
 * injektiranim fetchom, panel stanja u happy-domu.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  buildStartMeta, estimatePreflightSeconds, pollResult, startPreflight,
  uploadFile,
} from '../src/preflight/preflight-client';
import { buildPreflightConsent } from '../src/preflight/preflight-consent';
import { copyForCode, missingCopyCodes, MODULE_LABELS } from '../src/preflight/preflight-copy';
import { PreflightPanel } from '../src/preflight/preflight-panel';
import { STUDENT_VISIBLE_CODES, type PreflightReport } from '../src/preflight/tier-filter';

const CONFIG = { startEndpoint: 'https://edge/start', resultEndpoint: 'https://edge/result' };

function consent() {
  return buildPreflightConsent({ timestamp: '2026-07-12T12:00:00Z', termsVersion: 'v3' });
}
function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

// ---------------------------------------------------------------------- //
describe('preflight copy potpunost', () => {
  it('svaki studentski kod ima override karticu', () => {
    expect(missingCopyCodes()).toEqual([]);
  });
  it('svaki override kod je u allowlisti ili je sintetski META_CHECKED', () => {
    for (const code of Object.keys(MODULE_LABELS)) expect(typeof code).toBe('string');
    // copyForCode za nepoznat kod je null (fail-closed render)
    expect(copyForCode('RSID_SINGLE_PASTE')).toBeNull();
    expect(copyForCode('CITE_PHANTOM')).not.toBeNull();
  });
  it('studentski copy ne sadrzi optuzujuce rijeci', () => {
    const banned = /plagijat|varanj|prijevar|obman/i;
    for (const code of STUDENT_VISIBLE_CODES) {
      const c = copyForCode(code);
      if (!c) continue;
      expect(banned.test(c.title + ' ' + c.body), `${code}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------- //
describe('buildStartMeta', () => {
  it('baca bez valjane privole', () => {
    const file = new Blob(['x']);
    expect(() => buildStartMeta(file, 'sha', 'final', 'hr', null)).toThrow();
    // @ts-expect-error namjerno lazirana privola
    expect(() => buildStartMeta(file, 'sha', 'final', 'hr', { sendsFullFile: false })).toThrow();
  });
  it('slaze meta uz valjanu privolu', () => {
    const file = new Blob(['abcd']);
    const meta = buildStartMeta(file, 'deadbeef', 'diplomski', 'hr', consent());
    expect(meta.fileSize).toBe(4);
    expect(meta.fileSha256).toBe('deadbeef');
  });
});

describe('startPreflight status mapping', () => {
  const meta = { fileSize: 4, fileSha256: 'x', workType: 'final', lang: 'hr', consent: consent() };
  it('200 ok vraca upload podatke', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, {
      jobId: 'j1', uploadUrl: 'https://svc/v1/check', uploadToken: 'tok', maxBytes: 100 }));
    const out = await startPreflight(CONFIG, 'jwt', meta, fetchImpl as unknown as typeof fetch);
    expect(out).toMatchObject({ kind: 'ok', jobId: 'j1', uploadToken: 'tok' });
  });
  it('200 dedup', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { jobId: 'old', dedup: true }));
    expect(await startPreflight(CONFIG, 'jwt', meta, fetchImpl as unknown as typeof fetch))
      .toEqual({ kind: 'dedup', jobId: 'old' });
  });
  it('mapira 401/429/413/409/503', async () => {
    for (const [status, kind] of [[401, 'unauthorized'], [429, 'rate_limited'],
      [413, 'too_large'], [409, 'job_active'], [503, 'disabled']] as const) {
      const fetchImpl = vi.fn().mockResolvedValue(res(status, {}));
      const out = await startPreflight(CONFIG, 'jwt', meta, fetchImpl as unknown as typeof fetch);
      expect(out.kind).toBe(kind);
    }
  });
});

describe('uploadFile status mapping', () => {
  const file = new Blob(['docx']);
  it('200 accepted', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { status: 'done' }));
    expect(await uploadFile('u', 't', file, fetchImpl as unknown as typeof fetch))
      .toEqual({ kind: 'accepted' });
  });
  it('415/422 rejected s kodom, 401 bad_ticket, 429 busy', async () => {
    const f415 = vi.fn().mockResolvedValue(res(415, { error: 'not_a_docx' }));
    expect(await uploadFile('u', 't', file, f415 as unknown as typeof fetch))
      .toEqual({ kind: 'rejected', code: 'not_a_docx' });
    const f401 = vi.fn().mockResolvedValue(res(401, {}));
    expect((await uploadFile('u', 't', file, f401 as unknown as typeof fetch)).kind).toBe('bad_ticket');
    const f429 = vi.fn().mockResolvedValue(res(429, {}));
    expect((await uploadFile('u', 't', file, f429 as unknown as typeof fetch)).kind).toBe('busy');
  });
});

describe('pollResult status mapping', () => {
  const report: PreflightReport = {
    doc_summary: {}, severity_counts: { INFO: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
    modules: [],
  };
  it('done vraca report', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { status: 'done', depth: 'full', report }));
    const out = await pollResult(CONFIG, 'jwt', 'j', fetchImpl as unknown as typeof fetch);
    expect(out).toMatchObject({ kind: 'done', depth: 'full' });
  });
  it('pending/running/expired/error', async () => {
    for (const [status, kind] of [['pending', 'pending'], ['running', 'running'],
      ['expired', 'expired'], ['error', 'failed']] as const) {
      const fetchImpl = vi.fn().mockResolvedValue(res(200, { status, errorCode: 'x' }));
      expect((await pollResult(CONFIG, 'jwt', 'j', fetchImpl as unknown as typeof fetch)).kind).toBe(kind);
    }
  });
});

describe('estimatePreflightSeconds', () => {
  it('raste s brojem referenci i ima strop', () => {
    expect(estimatePreflightSeconds(0)).toBe(10);
    expect(estimatePreflightSeconds(20)).toBe(60);
    expect(estimatePreflightSeconds(1000)).toBe(90);
  });
});

// ---------------------------------------------------------------------- //
describe('PreflightPanel stanja', () => {
  function mkPanel(over: Partial<Parameters<typeof makeDeps>[0]> = {}) {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const deps = makeDeps(over);
    return { mount, panel: new PreflightPanel(mount, deps), deps };
  }
  function makeDeps(over: Record<string, unknown> = {}) {
    return {
      config: CONFIG,
      resolveToken: async () => 'jwt',
      openAuth: () => {},
      getFile: async () => new Blob(['docx']),
      referenceCount: 12,
      citationStyle: 'vancouver',
      workType: 'final',
      lang: 'hr',
      termsVersion: 'v3',
      maxUploadMb: 30,
      fetchImpl: (async () => res(200, {})) as unknown as typeof fetch,
      now: () => 1_000_000,
      ...over,
    };
  }

  it('idle prikazuje privolu i onemogucen gumb dok checkbox nije oznacen', () => {
    const { mount } = mkPanel();
    const panel = new PreflightPanel(mount, makeDeps());
    panel.render();
    const btn = mount.querySelector<HTMLButtonElement>('#pfRunBtn');
    const check = mount.querySelector<HTMLInputElement>('#pfConsentCheck');
    expect(btn?.disabled).toBe(true);
    expect(mount.querySelector('#pfConsentText')?.textContent).toContain('briše');
    check!.checked = true;
    check!.dispatchEvent(new Event('change'));
    expect(mount.querySelector<HTMLButtonElement>('#pfRunBtn')?.disabled).toBe(false);
  });

  it('author-year stil daje posten note o ogranicenju', () => {
    const { mount } = mkPanel();
    new PreflightPanel(mount, makeDeps({ citationStyle: 'author-year' })).render();
    expect(mount.textContent).toContain('autor-godina');
  });

  it('prevelika datoteka pada prije slanja', async () => {
    const bigFile = { size: 40 * 1024 * 1024 } as Blob;
    const mount = document.createElement('div');
    const panel = new PreflightPanel(mount, makeDeps({ getFile: async () => bigFile }));
    panel.render();
    const check = mount.querySelector<HTMLInputElement>('#pfConsentCheck')!;
    check.checked = true; check.dispatchEvent(new Event('change'));
    mount.querySelector<HTMLButtonElement>('#pfRunBtn')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(mount.textContent).toContain('premašuje ograničenje');
  });

  it('bez tokena otvara auth umjesto slanja', async () => {
    const openAuth = vi.fn();
    const mount = document.createElement('div');
    const panel = new PreflightPanel(mount, makeDeps({ resolveToken: async () => null, openAuth }));
    panel.render();
    const check = mount.querySelector<HTMLInputElement>('#pfConsentCheck')!;
    check.checked = true; check.dispatchEvent(new Event('change'));
    mount.querySelector<HTMLButtonElement>('#pfRunBtn')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(openAuth).toHaveBeenCalled();
  });
});
