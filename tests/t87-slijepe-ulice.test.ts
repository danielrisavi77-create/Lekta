import { beforeEach, describe, expect, it } from 'vitest';
import { uploadRepair, type RepairMeta } from '../src/report/repair-client';
import { recoveryFor } from '../src/repair/recovery-policy';
import { renderRepairRecovery } from '../src/ui/repair-recovery-view';
import { FIELD_RENDER_DISABLED_MESSAGE, requestFieldRender } from '../src/report/field-render-client';
import { TERMS_VERSION } from '../src/legal/legal-content';

/**
 * T87 (kriterij 9 T81): nijedan *_DISABLED ili prazan endpoint ne vodi u slijepu ulicu.
 *
 * Stanje prije T87, izmjereno nad istim klijentom: repair-docx 503 `{error:'disabled'}` i `{error:'busy'}` davali su
 * `{kind:'error', status:503, message:'neocekivani odgovor 503'}`, pa je oporavak nudio "Pokušaj ponovno" uz tu
 * poruku, i kad je popravak iskljucen (ponovni pokusaj ne moze uspjeti). field-render 503 `disabled` davao je
 * "Render nije uspio (503).", bez puta dalje. Ovi testovi drze novi ugovor: jasna poruka i put dalje.
 */
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const config = { endpoint: 'https://edge/repair-docx' };
const meta = (): RepairMeta => ({ workType: 'final', consentVersion: TERMS_VERSION } as unknown as RepairMeta);
const answer = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

describe('T87: repair-docx 503', () => {
  it('kill switch (disabled) daje razlog, a oporavak bez ponovnog pokusaja i s putem dalje', async () => {
    const out = await uploadRepair(config, 'jwt', new Uint8Array([1]), meta(), answer(503, { error: 'disabled' }));
    expect(out).toMatchObject({ kind: 'error', status: 503, code: 'disabled' });
    const r = recoveryFor(out, 'after-send');
    expect(r).toMatchObject({ action: 'none', retryAllowed: false });
    expect(r.message).toMatch(/isključen/);
    expect(r.message).toMatch(/ništa nije poslano na obradu ni naplaćeno/i);
    expect(r.message).toMatch(/ispraviti sam u Wordu|pokušati kasnije/);
  });

  it('popunjen gate (busy) dopusta ponovni pokusaj uz jasnu poruku', async () => {
    const out = await uploadRepair(config, 'jwt', new Uint8Array([1]), meta(), answer(503, { error: 'busy' }));
    expect(out).toMatchObject({ kind: 'error', status: 503, code: 'busy' });
    const r = recoveryFor(out, 'after-send');
    expect(r).toMatchObject({ action: 'retry', retryAllowed: true });
    expect(r.message).toMatch(/zauzet/);
    expect(r.message).not.toMatch(/neocekivani odgovor/);
  });

  it('503 bez poznatog razloga ostaje genericka greska s ponovnim pokusajem (ponasanje se ne mijenja)', async () => {
    const out = await uploadRepair(config, 'jwt', new Uint8Array([1]), meta(), answer(503, {}));
    expect(out).toEqual({ kind: 'error', status: 503, message: 'neocekivani odgovor 503' });
    expect(recoveryFor(out, 'after-send')).toMatchObject({ action: 'retry', retryAllowed: true });
  });
});

describe('T87: prikaz oporavka za iskljucen popravak (happy-dom)', () => {
  let el: HTMLElement;
  beforeEach(() => { document.body.innerHTML = ''; el = document.createElement('div'); document.body.appendChild(el); });

  it('vidi se poruka s putem dalje, a nema gumba koji ne moze uspjeti ni spinnera', async () => {
    const out = await uploadRepair(config, 'jwt', new Uint8Array([1]), meta(), answer(503, { error: 'disabled' }));
    renderRepairRecovery(el, recoveryFor(out, 'after-send'), { retry: () => {}, openJobs: null }, esc);
    expect(el.hidden).toBe(false);
    expect(el.querySelector('[data-repair-recovery]')?.getAttribute('data-repair-recovery')).toBe('none');
    expect(el.textContent).toMatch(/Automatski popravak je trenutačno isključen/);
    expect(el.querySelector('[data-repair-retry]')).toBeNull();
    expect(el.textContent).not.toMatch(/…|Šaljem|U tijeku/);
  });
});

describe('T87: field-render 503', () => {
  it('iskljucen render daje uputu za osvjezavanje polja u Wordu', async () => {
    const out = await requestFieldRender({ endpoint: '/render' }, 't', new Uint8Array([1]), answer(503, { error: 'disabled' }));
    expect(out.status).toBe('failed');
    expect(out.warnings).toEqual([FIELD_RENDER_DISABLED_MESSAGE]);
    expect(FIELD_RENDER_DISABLED_MESSAGE).toMatch(/Ctrl\+A pa F9/);
  });

  it('kvar workera (503 bez disabled) ostaje dosadasnja poruka', async () => {
    const out = await requestFieldRender({ endpoint: '/render' }, 't', new Uint8Array([1]), answer(503, { error: 'render_worker_failed' }));
    expect(out.warnings).toEqual(['Render nije uspio (503).']);
  });
});
