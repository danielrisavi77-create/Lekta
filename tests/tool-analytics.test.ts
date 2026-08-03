// @vitest-environment happy-dom
/**
 * tool-analytics.ts: minimalna analitika za besplatne alate. trackToolEvent je fail-closed
 * (bez privole ne salje nista, isto kao trackEvent u app.ts) i dijeli TOCAN isti localStorage
 * kljuc/zadani endpoint. Modul se sam-boota na import (boot() na DOMContentLoaded/odmah), pa
 * svaki scenarij treba svjez import (vi.resetModules) nakon sto je localStorage/DOM pripremljen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const CONSENT_KEY = 'lekta.analytics-consent.v1';
const PRODUCTION_KEY = 'lekta.production.v2.1';
const DEFAULT_ENDPOINT = 'https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/analytics-event';
const BANNER_ID = 'lekta-tool-consent-banner';

async function loadFresh() {
  return import('../src/tools/tool-analytics');
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  vi.resetModules();
});

describe('trackToolEvent', () => {
  it('bez privole ne salje fetch i vraca false', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { trackToolEvent } = await loadFresh();

    const ok = await trackToolEvent('tool_view');

    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('uz privolu salje POST na zadani endpoint s event/path/timestamp', async () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify('granted'));
    const fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', fetchMock);
    const { trackToolEvent } = await loadFresh();
    fetchMock.mockClear(); // boot() vec poslao tool_view (privola je vec 'granted' prije importa)

    const ok = await trackToolEvent('tool_copy');

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(DEFAULT_ENDPOINT);
    expect(opts.method).toBe('POST');
    expect(opts.keepalive).toBe(true);
    const body = JSON.parse(opts.body);
    expect(body.event).toBe('tool_copy');
    expect(typeof body.path).toBe('string');
    expect(typeof body.timestamp).toBe('string');
    vi.unstubAllGlobals();
  });

  it('respektira preklopljen analyticsEndpoint iz lekta.production.v2.1', async () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify('granted'));
    localStorage.setItem(PRODUCTION_KEY, JSON.stringify({ analyticsEndpoint: 'https://example.test/custom' }));
    const fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', fetchMock);
    const { trackToolEvent } = await loadFresh();

    await trackToolEvent('tool_view');

    expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/custom');
    vi.unstubAllGlobals();
  });

  it('prazan analyticsEndpoint u produkcijskoj konfiguraciji EKSPLICITNO gasi slanje (isto pravilo kao loadProductionConfig u app.ts)', async () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify('granted'));
    localStorage.setItem(PRODUCTION_KEY, JSON.stringify({ analyticsEndpoint: '' }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { trackToolEvent } = await loadFresh();

    const ok = await trackToolEvent('tool_view');

    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('fetch koji baci se tiho hvata i vraca false', async () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify('granted'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const { trackToolEvent } = await loadFresh();

    const ok = await trackToolEvent('tool_view');

    expect(ok).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('consent banner (self-boot na import)', () => {
  it('prikazuje banner kad izbor jos ne postoji', async () => {
    await loadFresh();

    const banner = document.getElementById(BANNER_ID);
    expect(banner).toBeTruthy();
    expect(banner!.classList.contains('is-visible')).toBe(true);
  });

  it('ne prikazuje banner ako je izbor vec zabiljezen (bilo gdje na stranici, isti kljuc)', async () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify('denied'));

    await loadFresh();

    expect(document.getElementById(BANNER_ID)).toBeNull();
  });

  it('ne prikazuje banner kad je admin eksplicitno ugasio analytics endpoint', async () => {
    localStorage.setItem(PRODUCTION_KEY, JSON.stringify({ analyticsEndpoint: '' }));

    await loadFresh();

    expect(document.getElementById(BANNER_ID)).toBeNull();
  });

  it('klik na "Dopusti analitiku" upisuje granted i sakriva banner', async () => {
    await loadFresh();

    (document.querySelector(`#${BANNER_ID} [data-consent="grant"]`) as HTMLElement).click();

    expect(JSON.parse(localStorage.getItem(CONSENT_KEY)!)).toBe('granted');
    expect(document.getElementById(BANNER_ID)!.classList.contains('is-visible')).toBe(false);
  });

  it('klik na "Samo nuzno" upisuje denied i sakriva banner', async () => {
    await loadFresh();

    (document.querySelector(`#${BANNER_ID} [data-consent="deny"]`) as HTMLElement).click();

    expect(JSON.parse(localStorage.getItem(CONSENT_KEY)!)).toBe('denied');
    expect(document.getElementById(BANNER_ID)!.classList.contains('is-visible')).toBe(false);
  });
});

describe('bindAnalyzerCtaTracking (delegirano na document)', () => {
  it('klik na poveznicu prema #analyzer salje tool_to_analyzer_click kad je privola dana', async () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify('granted'));
    const fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', fetchMock);
    await loadFresh();
    document.body.insertAdjacentHTML('beforeend', '<a href="index.html?utm_source=alat_kartice#analyzer">Provjeri rad</a>');

    (document.querySelector('a') as HTMLElement).click();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
    expect(body.event).toBe('tool_to_analyzer_click');
    vi.unstubAllGlobals();
  });

  it('klik na poveznicu koja ne vodi prema #analyzer ne salje nista', async () => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify('granted'));
    const fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', fetchMock);
    await loadFresh();
    fetchMock.mockClear(); // boot() vec poslao tool_view (privola je vec 'granted' prije importa)
    document.body.insertAdjacentHTML('beforeend', '<a href="index.html#pricing">Cijene</a>');

    (document.querySelector('a') as HTMLElement).click();
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
