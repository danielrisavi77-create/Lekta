/**
 * src/report/stripe-payment.ts: ucitavanje Stripe.js, montiranje Payment Elementa i potvrda.
 *
 * Nista se ne izvrsava sa stvarne mreze: `loadStripeJs` prima injektabilan host, pa se skripta
 * umece u lazan document i dogadjaji joj se okidaju rucno. Time se dokazuje ponasanje (jedan tag,
 * jedan pokusaj), a ne cinjenica da Stripe postoji.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  STRIPE_JS_URL,
  loadStripeJs,
  resetStripeJsLoader,
  mountPaymentElement,
  confirmPayment,
  paymentAppearance,
  waitForEntitlement,
  UNEXPECTED_REDIRECT_MESSAGE,
  type StripeFactory,
  type StripeLike,
  type StripeElements,
} from '../src/report/stripe-payment';

/**
 * Lazan document: happy-dom bi stvarni `<script>` pokusao DOHVATITI cim se spoji na stablo i sam
 * bi okinuo `error`, pa bi test mjerio njegovu mrezu umjesto nase logike. Ovdje se dogadjaji
 * okidaju rucno, a nijedan bajt ne ode van.
 */
interface FakeScript {
  src: string;
  async: boolean;
  addEventListener(type: string, fn: () => void, opts?: unknown): void;
  fire(type: string): void;
  remove(): void;
}

/**
 * `remove()` se ponasa kao `Element.remove()`: tag nestaje iz stabla, pa ga `querySelector`
 * vise ne nalazi. Test NIKAD sam ne prazni `scripts`; ako kod ne ukloni pali tag, ostaje u
 * stablu isto kao u pravom pregledniku (to je bio kvar iz kruga 1).
 */
function fakeDoc(): { doc: Document; scripts: FakeScript[] } {
  const scripts: FakeScript[] = [];
  const doc = {
    createElement(): FakeScript {
      const listeners: Record<string, Array<() => void>> = {};
      const sc: FakeScript = {
        src: '',
        async: false,
        addEventListener(type: string, fn: () => void) {
          (listeners[type] ??= []).push(fn);
        },
        fire(type: string) {
          const fns = listeners[type] ?? [];
          listeners[type] = [];
          for (const fn of fns) fn();
        },
        remove() {
          const i = scripts.indexOf(sc);
          if (i >= 0) scripts.splice(i, 1);
        },
      };
      return sc;
    },
    head: { appendChild: (el: FakeScript) => { scripts.push(el); } },
    querySelector: (sel: string) => scripts.find((sc) => sc.src && sel.includes(sc.src)) ?? null,
  };
  return { doc: doc as unknown as Document, scripts };
}

describe('loadStripeJs', () => {
  beforeEach(() => {
    resetStripeJsLoader();
  });

  it('umece tocno jedan <script> s Stripe URL-om i razrjesava se tvornicom', async () => {
    const { doc, scripts } = fakeDoc();
    const factory: StripeFactory = () => ({}) as StripeLike;
    let ready: StripeFactory | undefined;
    const p = loadStripeJs({ document: doc, getStripe: () => ready });
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(STRIPE_JS_URL);
    ready = factory;
    scripts[0].fire('load');
    expect(await p).toBe(factory);
  });

  it('drugi poziv ne umece drugi tag (dva ekrana, jedan Stripe.js)', async () => {
    const { doc, scripts } = fakeDoc();
    let ready: StripeFactory | undefined;
    const host = { document: doc, getStripe: () => ready };
    const a = loadStripeJs(host);
    const b = loadStripeJs(host);
    expect(a).toBe(b);
    expect(scripts).toHaveLength(1);
    ready = (() => ({}) as StripeLike) as StripeFactory;
    scripts[0].fire('load');
    await a;
  });

  it('kad je Stripe vec ucitan, ne dira DOM', async () => {
    const { doc, scripts } = fakeDoc();
    const factory: StripeFactory = () => ({}) as StripeLike;
    expect(await loadStripeJs({ document: doc, getStripe: () => factory })).toBe(factory);
    expect(scripts).toHaveLength(0);
  });

  it('ucitan Stripe.js bez globalnog Stripea je greska, ne tihi uspjeh, i tag nestaje', async () => {
    const { doc, scripts } = fakeDoc();
    const p = loadStripeJs({ document: doc, getStripe: () => undefined });
    scripts[0].fire('load');
    await expect(p).rejects.toThrow(/globalni Stripe/);
    expect(scripts).toHaveLength(0);
  });

  it('nakon pada ucitavanja pali tag nestaje, a drugi pokusaj umece svjez tag i uspijeva', async () => {
    const { doc, scripts } = fakeDoc();
    let ready: StripeFactory | undefined;
    const host = { document: doc, getStripe: () => ready };
    const prvi = loadStripeJs(host);
    const pali = scripts[0];
    pali.fire('error');
    await expect(prvi).rejects.toThrow(/nije ucitao/);
    expect(scripts, 'pali <script> mora biti uklonjen iz stabla').toHaveLength(0);
    const drugi = loadStripeJs(host);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).not.toBe(pali);
    ready = (() => ({}) as StripeLike) as StripeFactory;
    scripts[0].fire('load');
    expect(await drugi).toBe(ready);
  });

  it('tudji tag ciji su dogadjaji vec prosli ne drzi obecanje zauvijek: istek odbija i uklanja ga', async () => {
    const { doc, scripts } = fakeDoc();
    // Tag koji je netko drugi umetnuo i koji je VEC pao: nitko mu vise nece okinuti dogadjaj.
    const tudji = (doc as unknown as { createElement(): FakeScript }).createElement();
    tudji.src = STRIPE_JS_URL;
    scripts.push(tudji);
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const host = {
      document: doc,
      getStripe: () => undefined,
      setTimeout: (fn: () => void, ms: number) => {
        timers.push({ fn, ms });
        return timers.length;
      },
      clearTimeout: () => {},
    };
    const p = loadStripeJs(host);
    expect(scripts, 'postojeci tag se ne duplira').toHaveLength(1);
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(20_000);
    timers[0].fn();
    await expect(p).rejects.toThrow(/na vrijeme/);
    expect(scripts).toHaveLength(0);
    const drugi = loadStripeJs(host);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).not.toBe(tudji);
    scripts[0].fire('error');
    await expect(drugi).rejects.toThrow();
  });

  it('uspjesno ucitavanje gasi istek, pa kasni istek ne rusi nista', async () => {
    const { doc, scripts } = fakeDoc();
    const factory: StripeFactory = () => ({}) as StripeLike;
    let ready: StripeFactory | undefined;
    let cleared = 0;
    const armed: Array<() => void> = [];
    const p = loadStripeJs({
      document: doc,
      getStripe: () => ready,
      setTimeout: (fn: () => void) => {
        armed.push(fn);
        return 1;
      },
      clearTimeout: () => {
        cleared += 1;
      },
    });
    ready = factory;
    scripts[0].fire('load');
    expect(await p).toBe(factory);
    expect(cleared).toBe(1);
    armed[0]();
    expect(scripts, 'ucitan tag ostaje').toHaveLength(1);
  });
});

describe('mountPaymentElement', () => {
  it('stvara Elements s clientSecretom i montira Payment Element u zadani spremnik', () => {
    const calls: Record<string, unknown> = {};
    const element = { mount: (c: unknown) => { calls.mounted = c; } };
    const elements: StripeElements = { create: (type) => { calls.type = type; return element; } };
    const stripe: StripeLike = {
      elements: (opts) => { calls.opts = opts; return elements; },
      confirmPayment: async () => ({}),
    };
    const container = document.createElement('div');
    const out = mountPaymentElement({ stripe, clientSecret: 'pi_1_secret', container });
    expect((calls.opts as Record<string, unknown>).clientSecret).toBe('pi_1_secret');
    expect(calls.type).toBe('payment');
    expect(calls.mounted).toBe(container);
    expect(out.elements).toBe(elements);
  });

  it('bez spremnika izgled je prazan skup varijabli, ne baca', () => {
    expect(paymentAppearance(null)).toEqual({ theme: 'stripe', variables: {} });
  });

  it('izgled se cita iz zivih CSS varijabli, ne iz zakucanih boja', () => {
    const el = document.createElement('div');
    const view = {
      getComputedStyle: () =>
        ({
          getPropertyValue: (name: string) => (name === '--text' ? ' #123456 ' : ''),
          fontFamily: 'Inter Tight',
        }) as unknown as CSSStyleDeclaration,
    };
    expect(paymentAppearance(el, view)).toEqual({
      theme: 'stripe',
      variables: { colorText: '#123456', fontFamily: 'Inter Tight' },
    });
  });
});

/**
 * Placeholder u polju placanja (nalaz pregleda F18 krug 4): bio je mapiran na `--line`, boju
 * CRTE, koja na bijelom polju papira ima kontrast oko 1,5:1. Kontrast se ovdje racuna iz STVARNIH
 * tokena u CSS-u koji /rad/ ucitava, a ne iz prepisanih vrijednosti, da gard ne istrune kad se
 * paleta promijeni.
 */
describe('paymentAppearance: placeholder je citljiv', () => {
  const css = (rel: string): string => readFileSync(join(process.cwd(), ...rel.split('/')), 'utf8');

  /** Tijelo papirnog scopea iz page-app.css, u kojem zivi `.modal` (i #stripePaymentElement). */
  function paperScope(): string {
    const src = css('src/shared/page-app.css');
    const m = src.match(/^\.analyzer-wrap,\.modal,[^{]*\{([^}]*)\}/m);
    if (!m) throw new Error('papirni scope s .modal nije pronadjen u page-app.css');
    return m[1];
  }

  function tokenIn(block: string, name: string): string {
    // String.raw: `\s` u obicnom template literalu postaje samo `s`.
    const m = block.match(new RegExp(name + String.raw`\s*:\s*([^;]+);`));
    if (!m) throw new Error(`${name} nije definiran`);
    return m[1].trim();
  }

  /** Razrijesi `var(--x)` kroz :root iz design-system.css; hex vraca kakav jest. */
  function resolve(value: string): string {
    const v = value.match(/^var\((--[a-z0-9-]+)\)$/);
    if (!v) return value;
    const root = css('src/shared/design-system.css').match(/:root\s*\{([^}]*)\}/);
    if (!root) throw new Error(':root nije pronadjen u design-system.css');
    return resolve(tokenIn(root[1], v[1]));
  }

  function luminance(hex: string): number {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) =>
      c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a: string, b: string): number {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  }

  it('colorTextPlaceholder dolazi iz --muted (sekundarni tekst), ne iz --line (crta)', () => {
    const el = document.createElement('div');
    const tokens: Record<string, string> = { '--muted': '#6E6656', '--line': '#DCD4BF', '--panel': '#fff' };
    const view = {
      getComputedStyle: () =>
        ({ getPropertyValue: (name: string) => tokens[name] ?? '', fontFamily: '' }) as unknown as CSSStyleDeclaration,
    };
    const vars = paymentAppearance(el, view).variables as Record<string, string>;
    expect(vars.colorTextPlaceholder).toBe('#6E6656');
    expect(vars.colorBackground).toBe('#fff');
  });

  it('--muted na pozadini polja (--panel) u papirnom scopeu ima kontrast >= 4,5:1', () => {
    const scope = paperScope();
    const muted = resolve(tokenIn(scope, '--muted'));
    const panel = resolve(tokenIn(scope, '--panel'));
    const line = resolve(tokenIn(scope, '--line'));
    for (const hex of [muted, panel, line]) expect(hex).toMatch(/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/);
    expect(contrast(muted, panel)).toBeGreaterThanOrEqual(4.5);
    // Kontrola da mjera razlikuje: stara mapa (--line) na istoj pozadini pada.
    expect(contrast(line, panel)).toBeLessThan(4.5);
  });
});

describe('confirmPayment (redirect: if_required)', () => {
  const elements = {} as StripeElements;

  function stripeReturning(result: unknown): { stripe: StripeLike; seen: Record<string, unknown> } {
    const seen: Record<string, unknown> = {};
    return {
      seen,
      stripe: {
        elements: () => elements,
        confirmPayment: async (opts) => {
          Object.assign(seen, opts);
          return result as never;
        },
      },
    };
  }

  it('trazi potvrdu bez preusmjeravanja kad god je moguce', async () => {
    const { stripe, seen } = stripeReturning({ paymentIntent: { id: 'pi_1', status: 'succeeded' } });
    const out = await confirmPayment({ stripe, elements, returnUrl: 'https://lekta.hr/rad/' });
    expect(seen.redirect).toBe('if_required');
    expect((seen.confirmParams as Record<string, unknown>).return_url).toBe('https://lekta.hr/rad/');
    expect(out).toEqual({ kind: 'ok', paymentIntentId: 'pi_1' });
  });

  it('status processing NIJE uspjeh: poseban ishod, jer webhook na njega ne knjizi pravo', async () => {
    const { stripe } = stripeReturning({ paymentIntent: { id: 'pi_2', status: 'processing' } });
    expect(await confirmPayment({ stripe, elements, returnUrl: 'x' })).toEqual({
      kind: 'processing',
      paymentIntentId: 'pi_2',
    });
  });

  it('greska Stripea vraca poruku, nikad tihi uspjeh', async () => {
    const { stripe } = stripeReturning({ error: { message: 'Kartica je odbijena.' } });
    expect(await confirmPayment({ stripe, elements, returnUrl: 'x' })).toEqual({
      kind: 'error',
      message: 'Kartica je odbijena.',
    });
  });

  it('prazan odgovor je greska (neocekivano preusmjeravanje), ne uspjeh ni cekanje banke', async () => {
    // PaymentIntent nosi allow_redirects=never, pa odgovor bez greske i bez statusa nije
    // legitiman ishod. Ne smije proci ni kao uspjeh ni kao tiho "dovrsava se kod banke".
    const { stripe } = stripeReturning({});
    expect(await confirmPayment({ stripe, elements, returnUrl: 'x' })).toEqual({
      kind: 'error',
      message: UNEXPECTED_REDIRECT_MESSAGE,
    });
    expect(UNEXPECTED_REDIRECT_MESSAGE).toMatch(/Neočekivano preusmjeravanje/);
  });

  it('nedovrseno placanje nije uspjeh', async () => {
    const { stripe } = stripeReturning({ paymentIntent: { id: 'pi_3', status: 'requires_payment_method' } });
    const out = await confirmPayment({ stripe, elements, returnUrl: 'x' });
    expect(out.kind).toBe('error');
  });
});

describe('waitForEntitlement (ceka webhook prije otkljucavanja)', () => {
  const CFG = { supabaseUrl: 'https://x.supabase.co/', supabaseAnonKey: 'anon' };

  function rest(sequence: Array<unknown[] | 'fail' | number>): {
    fetchImpl: typeof fetch;
    urls: string[];
    headers: Array<Record<string, string>>;
  } {
    const urls: string[] = [];
    const headers: Array<Record<string, string>> = [];
    let i = 0;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      urls.push(url);
      headers.push((init?.headers ?? {}) as Record<string, string>);
      const step = sequence[Math.min(i, sequence.length - 1)];
      i += 1;
      if (step === 'fail') throw new Error('mreza');
      if (typeof step === 'number') return new Response('{}', { status: step });
      return new Response(JSON.stringify(step), { status: 200 });
    }) as unknown as typeof fetch;
    return { fetchImpl, urls, headers };
  }

  const noSleep = async (): Promise<void> => {};

  it('vraca booked cim se pojavi redak za TAJ PaymentIntent, uz korisnikov token (RLS)', async () => {
    const r = rest([[], 'fail', 500, [{ id: 'e1' }]]);
    const out = await waitForEntitlement(CFG, 'jwt', 'pi_123', {
      fetchImpl: r.fetchImpl,
      sleep: noSleep,
      delaysMs: [1, 1, 1, 1, 1],
    });
    expect(out).toBe('booked');
    expect(r.urls).toHaveLength(4);
    expect(r.urls[0]).toBe(
      'https://x.supabase.co/rest/v1/entitlements?select=id&provider=eq.stripe&order_id=eq.pi_123&limit=1',
    );
    expect(r.headers[0]).toEqual({ apikey: 'anon', Authorization: 'Bearer jwt' });
  });

  it('bez knjizenja nakon cijelog cekanja vraca pending, ne lazni uspjeh', async () => {
    const r = rest([[]]);
    const slept: number[] = [];
    const out = await waitForEntitlement(CFG, 'jwt', 'pi_123', {
      fetchImpl: r.fetchImpl,
      sleep: async (ms) => {
        slept.push(ms);
      },
      delaysMs: [5, 10],
    });
    expect(out).toBe('pending');
    expect(slept).toEqual([5, 10]);
    expect(r.urls).toHaveLength(3);
  });

  it('zadano cekanje traje oko pola minute', async () => {
    const r = rest([[]]);
    let total = 0;
    await waitForEntitlement(CFG, 'jwt', 'pi_1', {
      fetchImpl: r.fetchImpl,
      sleep: async (ms) => {
        total += ms;
      },
    });
    expect(total).toBeGreaterThanOrEqual(25_000);
    expect(total).toBeLessThanOrEqual(35_000);
  });

  it('bez konfiguracije, tokena ili valjanog pi_ id-a ne zove mrezu i vraca unknown', async () => {
    const r = rest([[{ id: 'e1' }]]);
    const deps = { fetchImpl: r.fetchImpl, sleep: noSleep };
    expect(await waitForEntitlement({}, 'jwt', 'pi_1', deps)).toBe('unknown');
    expect(await waitForEntitlement(CFG, null, 'pi_1', deps)).toBe('unknown');
    expect(await waitForEntitlement(CFG, 'jwt', '', deps)).toBe('unknown');
    expect(await waitForEntitlement(CFG, 'jwt', 'pi_1&provider=eq.x', deps)).toBe('unknown');
    expect(r.urls).toHaveLength(0);
  });
});
