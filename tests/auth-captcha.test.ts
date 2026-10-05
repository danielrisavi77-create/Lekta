import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestEmailOtp, signInAnonymously, signInWithPassword, withCaptcha } from '../src/auth/session';
import { CAPTCHA_REJECTED_MESSAGE, getCaptchaToken, TURNSTILE_SCRIPT_URL, type TurnstileApi } from '../src/auth/captcha';
import { captchaWiringProblems, type SourceFile } from './helpers/auth-captcha';
import { buildInfo } from '../scripts/write-build-info.mjs';

const CFG = { supabaseUrl: 'https://proj.supabase.co', anonKey: 'anon' };
const TOKEN_BODY = { access_token: 'at', refresh_token: 'rt', expires_in: 3600, user: { id: 'u1', is_anonymous: true } };

function fakeFetch() {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    return new Response(JSON.stringify(TOKEN_BODY), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const withToken = async () => 'tok-123';
const noToken = async () => undefined;

/** Sva tri toka koja GoTrue stiti captchom, s istim izvorom tokena. */
const FLOWS = [
  ['anonimna prijava', (f: typeof fetch, c: () => Promise<string | undefined>) => signInAnonymously(CFG, f, 0, c)],
  ['registracija i prijava e-mailom (OTP, create_user)', (f: typeof fetch, c: () => Promise<string | undefined>) => requestEmailOtp(CFG, 'a@b.hr', f, undefined, c)],
  ['prijava lozinkom', (f: typeof fetch, c: () => Promise<string | undefined>) => signInWithPassword(CFG, 'a@b.hr', 'lozinka123', f, 0, c)],
] as const;

describe('T89: captcha token u svim Auth pozivima', () => {
  it.each(FLOWS)('%s salje gotrue_meta_security.captcha_token', async (_name, run) => {
    const { calls, impl } = fakeFetch();
    const out = await run(impl, withToken);
    expect(out.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.gotrue_meta_security).toEqual({ captcha_token: 'tok-123' });
  });

  it.each(FLOWS)('%s bez tokena salje isto tijelo kao prije (fail-open dok captcha nije na Authu)', async (_name, run) => {
    const { calls, impl } = fakeFetch();
    const out = await run(impl, noToken);
    expect(out.ok).toBe(true);
    expect(calls[0].body).not.toHaveProperty('gotrue_meta_security');
  });

  it.each(FLOWS)('%s: kvar izvora tokena ne rusi tok', async (_name, run) => {
    const { calls, impl } = fakeFetch();
    const out = await run(impl, async () => {
      throw new Error('turnstile pao');
    });
    expect(out.ok).toBe(true);
    expect(calls[0].body).not.toHaveProperty('gotrue_meta_security');
  });

  it('neispravan unos ne trazi captcha (nema izazova za krivi e-mail)', async () => {
    const captcha = vi.fn(withToken);
    const { impl } = fakeFetch();
    expect((await requestEmailOtp(CFG, 'nije-email', impl, undefined, captcha)).ok).toBe(false);
    expect((await signInWithPassword(CFG, '', '', impl, 0, captcha)).ok).toBe(false);
    expect(captcha).not.toHaveBeenCalled();
  });

  it.each(FLOWS)('%s: 400 captcha_failed daje uputu za ponovni pokusaj (Codex T89-02)', async (_name, run) => {
    const impl = (async () => new Response(
      JSON.stringify({ code: 400, error_code: 'captcha_failed', msg: 'captcha protection: request disallowed (no captcha response)' }),
      { status: 400 },
    )) as unknown as typeof fetch;
    const out = await run(impl, noToken);
    expect(out).toEqual({ ok: false, message: CAPTCHA_REJECTED_MESSAGE });
  });

  it('anonimna prijava odbijena zbog captche pokazuje obavijest, jer nema vlastiti obrazac', async () => {
    document.body.innerHTML = '';
    const impl = (async () => new Response(JSON.stringify({ error_code: 'captcha_failed' }), { status: 400 })) as unknown as typeof fetch;
    await signInAnonymously(CFG, impl, 0, noToken);
    const note = document.querySelector('[data-lekta-captcha-odbijen]');
    expect(note?.getAttribute('role')).toBe('alert');
    expect(note?.textContent).toBe(CAPTCHA_REJECTED_MESSAGE);
    document.body.innerHTML = '';
  });

  it('obican 400 na prijavi lozinkom i dalje znaci krive podatke', async () => {
    const impl = (async () => new Response(JSON.stringify({ error_code: 'invalid_credentials' }), { status: 400 })) as unknown as typeof fetch;
    expect(await signInWithPassword(CFG, 'a@b.hr', 'lozinka123', impl, 0, noToken)).toEqual({ ok: false, message: 'e-mail ili lozinka nisu točni' });
  });

  it('withCaptcha: oblik koji GoTrue ocekuje', () => {
    expect(JSON.parse(withCaptcha({ a: 1 }, 't'))).toEqual({ a: 1, gotrue_meta_security: { captcha_token: 't' } });
    expect(withCaptcha({}, undefined)).toBe('{}');
  });
});

describe('T89: Turnstile widget', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('script').forEach((s) => s.remove());
  });

  it('bez site keyja: nema skripte, nema DOM-a, token je undefined', async () => {
    const loadApi = vi.fn();
    expect(await getCaptchaToken({ siteKey: '', doc: document, loadApi })).toBeUndefined();
    expect(await getCaptchaToken({ doc: document, loadApi })).toBeUndefined(); // VITE_TURNSTILE_SITE_KEY nije postavljen u testu
    expect(loadApi).not.toHaveBeenCalled();
    expect(document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)).toBeNull();
    expect(document.querySelector('[data-lekta-captcha]')).toBeNull();
  });

  it('s kljucem: crta interaction-only widget, vraca token i cisti za sobom', async () => {
    const remove = vi.fn();
    const api: TurnstileApi = {
      render: (el, opts) => {
        expect(el.isConnected).toBe(true);
        expect(opts).toMatchObject({ sitekey: 'site-1', appearance: 'interaction-only' });
        queueMicrotask(() => opts.callback('tok-9'));
        return 'w1';
      },
      remove,
    };
    const token = await getCaptchaToken({ siteKey: 'site-1', doc: document, loadApi: async () => api });
    expect(token).toBe('tok-9');
    expect(remove).toHaveBeenCalledWith('w1');
    expect(document.querySelector('[data-lekta-captcha]')).toBeNull();
  });

  it('greska, istek ili nedostupan API daju undefined, ne lazni token', async () => {
    const failing: TurnstileApi = {
      render: (_el, opts) => {
        queueMicrotask(() => opts['error-callback']());
        return 'w2';
      },
      remove: () => {},
    };
    expect(await getCaptchaToken({ siteKey: 's', doc: document, loadApi: async () => failing })).toBeUndefined();
    const silent: TurnstileApi = { render: () => 'w3', remove: () => {} };
    expect(await getCaptchaToken({ siteKey: 's', doc: document, loadApi: async () => silent, timeoutMs: 5 })).toBeUndefined();
    expect(await getCaptchaToken({ siteKey: 's', doc: document, loadApi: async () => undefined })).toBeUndefined();
    // Codex T89-01: skripta koja se nikad ne ucita (ni load ni error) ne smije zadrzati Auth poziv.
    const never = () => new Promise<TurnstileApi | undefined>(() => {});
    expect(await getCaptchaToken({ siteKey: 's', doc: document, loadApi: never, scriptTimeoutMs: 5 })).toBeUndefined();
    expect(document.querySelector('[data-lekta-captcha]')).toBeNull();
  });
});

function sources(dir: string): SourceFile[] {
  const out: SourceFile[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.(ts|mts|js|mjs)$/.test(name)) out.push({ path: relative(process.cwd(), full), text: readFileSync(full, 'utf8') });
  }
  return out;
}

describe('T89: gard ozicenja captche nad stvarnim src/ i supabase/functions', () => {
  const real = () => [...sources(resolve(process.cwd(), 'src')), ...sources(resolve(process.cwd(), 'supabase', 'functions'))];

  it('gard prepoznaje OTP kada je URL omotan redirect query helperom', () => {
    const source: SourceFile = {
      path: 'src/auth/session.ts',
      text: [
        'await fetchImpl(withRedirectQuery(`https://proj.supabase.co/auth/v1/otp`, redirectTo), {',
        '    body: withCaptcha({ email }, captchaToken),',
        '    });',
        'await fetchImpl(`https://proj.supabase.co/auth/v1/signup`, {',
        '    body: withCaptcha({}, captchaToken),',
        '    });',
        'await fetchImpl(`https://proj.supabase.co/auth/v1/token?grant_type=password`, {',
        '    body: withCaptcha({ email, password }, captchaToken),',
        '    });',
      ].join('\n'),
    };
    expect(captchaWiringProblems([source])).toEqual([]);
  });

  it('svaki zasticeni Auth poziv ide kroz withCaptcha s tokenom', () => {
    expect(captchaWiringProblems(real())).toEqual([]);
  });

  it('negativna kontrola (Codex T89-04): supabase-js Auth poziv uz postojece pozive je nalaz', () => {
    const sdk = { path: 'src/novo.ts', text: 'await supabase.auth.signInAnonymously();\nawait sb.auth.resetPasswordForEmail(email);\n' };
    const problems = captchaWiringProblems([...real(), sdk]);
    expect(problems).toEqual([
      'src/novo.ts: supabase-js signInAnonymously() mimo withCaptcha; ozici captchaToken i prosiri gard',
      'src/novo.ts: supabase-js resetPasswordForEmail() mimo withCaptcha; ozici captchaToken i prosiri gard',
    ]);
  });

  it('auth.admin.* (service role) nije nalaz', () => {
    expect(captchaWiringProblems([...real(), { path: 'x.ts', text: 'await admin.auth.admin.getUserById(id);' }])).toEqual([]);
  });
});

describe('T89: build-info javlja ima li build captcha kljuc (bez samog kljuca)', () => {
  const sha = 'a'.repeat(40);
  const at = new Date('2026-09-28T00:00:00Z');

  it('s kljucem true, bez ili s razmacima false; kljuc se nikad ne upisuje', () => {
    const s = buildInfo(sha, at, { VITE_TURNSTILE_SITE_KEY: '0x4AAAAtajnovit' });
    expect(s.captchaSiteKey).toBe(true);
    expect(JSON.stringify(s)).not.toContain('0x4AAAAtajnovit');
    expect(buildInfo(sha, at, {}).captchaSiteKey).toBe(false);
    expect(buildInfo(sha, at, { VITE_TURNSTILE_SITE_KEY: '  ' }).captchaSiteKey).toBe(false);
  });
});
