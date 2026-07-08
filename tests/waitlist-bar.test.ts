// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mountWaitlistBar, waitlistBarHtml, type WaitlistEntry } from '../src/waitlist/waitlist-bar';
import { waitlistCopy } from '../src/waitlist/waitlist-copy';
import type { WaitlistDetection } from '../src/waitlist/waitlist-detect';

const CFG = { endpoint: 'https://p.functions.supabase.co/faculty-request', anonKey: 'anon' };

function memStore() {
  const m = new Map<string, WaitlistEntry>();
  return {
    map: m,
    getEntry: (k: string) => m.get(k) ?? null,
    setEntry: (k: string, v: WaitlistEntry) => { m.set(k, v); },
  };
}

// Fake fetch: razlikuje submit (bez requestId) i attach (s requestId) po tijelu; broji pozive.
function makeFetch(opts: { requestId?: string | null; attached?: boolean } = {}) {
  const calls: any[] = [];
  const fn = (async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const payload = body.requestId
      ? { attached: opts.attached ?? true }
      : { requestId: 'requestId' in opts ? opts.requestId : 'req-1' };
    return { ok: true, status: 200, json: async () => payload } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const uncovered: WaitlistDetection = {
  state: 'faculty-uncovered', uncovered: true,
  cell: { facultyId: 'ttf', facultyName: 'TTF', program: 'X', workType: 'graduate' },
  dedupeKey: 'wl:ttf|X|graduate',
};
const covered: WaitlistDetection = { ...uncovered, state: 'covered', uncovered: false };

function el() { return document.createElement('section'); }
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('waitlistBarHtml', () => {
  it('sadrzi zatvaranje, naslov, polje e-maila i CTA', () => {
    const html = waitlistBarHtml(waitlistCopy(uncovered));
    expect(html).toContain('wl-close');
    expect(html).toContain('wl-email');
    expect(html).toContain('wl-cta');
    expect(html).toContain('TTF');
  });
});

describe('mountWaitlistBar prikaz', () => {
  it('pokrivena celija: ne prikazuje, hidden', () => {
    const store = memStore(), node = el();
    const shown = mountWaitlistBar(node, covered, { config: CFG, ...store, resolveToken: async () => '' });
    expect(shown).toBe(false);
    expect(node.hidden).toBe(true);
  });
  it('bez endpointa: ne prikazuje (feature off)', () => {
    const store = memStore(), node = el();
    const shown = mountWaitlistBar(node, uncovered, { config: { endpoint: '' }, ...store, resolveToken: async () => '' });
    expect(shown).toBe(false);
  });
  it('nepokrivena + konfigurirano: prikazuje i salje anoniman signal, sprema id', async () => {
    const store = memStore(), node = el(), f = makeFetch({ requestId: 'req-42' });
    const shown = mountWaitlistBar(node, uncovered, { config: CFG, ...store, resolveToken: async () => '', fetchImpl: f.fn });
    expect(shown).toBe(true);
    expect(node.hidden).toBe(false);
    expect(node.querySelector('.wl-email')).toBeTruthy();
    await flush();
    expect(f.calls.length).toBe(1);                       // anoniman submit
    expect(store.getEntry(uncovered.dedupeKey)).toEqual({ s: 'sent', id: 'req-42' });
  });
  it('vec zatvorena u sesiji: ne prikazuje ponovno', () => {
    const store = memStore(); store.setEntry(uncovered.dedupeKey, { s: 'closed' });
    const node = el();
    expect(mountWaitlistBar(node, uncovered, { config: CFG, ...store, resolveToken: async () => '' })).toBe(false);
  });
});

describe('mountWaitlistBar interakcija', () => {
  it('zatvaranje (X) oznaci closed i sakrije', async () => {
    const store = memStore(), node = el(), f = makeFetch();
    mountWaitlistBar(node, uncovered, { config: CFG, ...store, resolveToken: async () => '', fetchImpl: f.fn });
    await flush();
    (node.querySelector('.wl-close') as any).onclick();
    expect(store.getEntry(uncovered.dedupeKey)).toEqual({ s: 'closed' });
    expect(node.hidden).toBe(true);
  });
  it('slanje valjanog e-maila veze na postojeci id (attach) i pokaze uspjeh', async () => {
    const store = memStore(), node = el(), f = makeFetch({ requestId: 'req-9', attached: true });
    mountWaitlistBar(node, uncovered, { config: CFG, ...store, resolveToken: async () => '', fetchImpl: f.fn });
    await flush(); // anoniman upis -> id req-9
    const input = node.querySelector('.wl-email') as any;
    input.value = 'me@x.hr';
    await (node.querySelector('.wl-form') as any).onsubmit({ preventDefault() {} });
    const attachCall = f.calls.find((c) => c.requestId);
    expect(attachCall).toMatchObject({ requestId: 'req-9', email: 'me@x.hr' });
    expect(store.getEntry(uncovered.dedupeKey)).toEqual({ s: 'submitted' });
    expect(node.querySelector('.wl-title')?.textContent).toContain('Hvala');
  });
  it('neispravan e-mail: poruka, bez mreznog attach poziva', async () => {
    const store = memStore(), node = el(), f = makeFetch();
    mountWaitlistBar(node, uncovered, { config: CFG, ...store, resolveToken: async () => '', fetchImpl: f.fn });
    await flush();
    const before = f.calls.length;
    (node.querySelector('.wl-email') as any).value = 'nije-mail';
    await (node.querySelector('.wl-form') as any).onsubmit({ preventDefault() {} });
    expect(f.calls.length).toBe(before); // nema novog poziva
    expect(node.querySelector('.wl-msg')?.textContent).toContain('e-mail');
  });
  it('kad anon upis nema id (rate limit): slanje e-maila salje novi upis s e-mailom', async () => {
    const store = memStore(), node = el(), f = makeFetch({ requestId: null });
    mountWaitlistBar(node, uncovered, { config: CFG, ...store, resolveToken: async () => '', fetchImpl: f.fn });
    await flush(); // anon upis vrati null id
    expect(store.getEntry(uncovered.dedupeKey)).toEqual({ s: 'sent', id: null });
    (node.querySelector('.wl-email') as any).value = 'me@x.hr';
    await (node.querySelector('.wl-form') as any).onsubmit({ preventDefault() {} });
    const submitWithEmail = f.calls.find((c) => !c.requestId && c.email === 'me@x.hr');
    expect(submitWithEmail).toBeTruthy();
    expect(store.getEntry(uncovered.dedupeKey)).toEqual({ s: 'submitted' });
  });
});
