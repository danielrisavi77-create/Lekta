// Minimalna analitika za besplatne alate (citat/kartice/naslovnica/literatura/izjava).
// Alati ne uvoze src/ui/app.ts (svaki je zaseban bundle, app.ts pretpostavlja SPA DOM poput
// #consentBanner koji ovdje ne postoji), pa je ovo NAMJERNO malen, neovisan modul, ne
// re-export odande. Ipak dijeli TOCAN isti localStorage kljuc i zadani endpoint kao
// STORAGE_KEYS.analyticsConsent / DEFAULT_PRODUCTION_CONFIG.analyticsEndpoint u app.ts, pa je
// privola ZAJEDNICKA za cijelu stranicu: izbor na jednom alatu (ili na glavnoj app) vrijedi
// svugdje, a "Postavke ->" u glavnoj app vidi i ovdje upisan izbor.
//
// Dogadjaji su namjerno malobrojni i bez payloada (path iz location.pathname vec razlikuje
// alat): tool_view (ucitavanje stranice), tool_copy/tool_download (bindCopyButton/
// bindDownloadButton iz tool-ui.ts, uspjeh), tool_to_analyzer_click (klik na bilo koju
// #analyzer poveznicu, delegirano).

const CONSENT_KEY = 'lekta.analytics-consent.v1';
const PRODUCTION_KEY = 'lekta.production.v2.1';
const DEFAULT_ANALYTICS_ENDPOINT = 'https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/analytics-event';
const BANNER_ID = 'lekta-tool-consent-banner';

function readJson(key: string): any {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* privatni nacin ili puna kvota: izbor se ne pamti, banner ce pitati opet drugi put */
  }
}

// Prazan string u spremljenoj konfiguraciji znaci da je admin EKSPLICITNO ugasio endpoint
// (isto pravilo kao loadProductionConfig() u app.ts: kljuc koji postoji uvijek pobjedjuje
// default, cak i kad je prazan), pa se to ne smije tiho zamijeniti zadanim endpointom.
function analyticsEndpoint(): string {
  const override = readJson(PRODUCTION_KEY);
  if (override && typeof override === 'object' && 'analyticsEndpoint' in override) {
    return typeof override.analyticsEndpoint === 'string' ? override.analyticsEndpoint.trim() : '';
  }
  return DEFAULT_ANALYTICS_ENDPOINT;
}

function consentGranted(): boolean {
  return readJson(CONSENT_KEY) === 'granted';
}

/** Salje dogadjaj SAMO uz vec danu privolu (fail-closed, isto kao trackEvent u app.ts). */
export async function trackToolEvent(event: string): Promise<boolean> {
  const endpoint = analyticsEndpoint();
  if (!endpoint || !consentGranted()) return false;
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, path: location.pathname || '/', timestamp: new Date().toISOString() }),
      keepalive: true,
    });
    return true;
  } catch {
    return false;
  }
}

function setConsent(value: 'granted' | 'denied'): void {
  writeJson(CONSENT_KEY, value);
  document.getElementById(BANNER_ID)?.classList.remove('is-visible');
}

function ensureBanner(): HTMLElement | null {
  if (!document.body) return null;
  const existing = document.getElementById(BANNER_ID);
  if (existing) return existing;
  const el = document.createElement('div');
  el.id = BANNER_ID;
  el.className = 'lekta-consent-banner';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Postavke privole za analitiku');
  el.innerHTML = '<p><strong>Dobrovoljna anonimna analitika.</strong> Alat radi jednako i bez nje. Dokument nikad ne napušta uređaj.</p>'
    + '<div class="lekta-consent-actions">'
    + '<button type="button" data-consent="deny">Samo nužno</button>'
    + '<button type="button" data-consent="grant">Dopusti analitiku</button>'
    + '</div>';
  document.body.appendChild(el);
  el.querySelector('[data-consent="grant"]')?.addEventListener('click', () => setConsent('granted'));
  el.querySelector('[data-consent="deny"]')?.addEventListener('click', () => setConsent('denied'));
  return el;
}

function renderBanner(): void {
  if (!analyticsEndpoint()) return; // admin je eksplicitno ugasio analitiku
  if (readJson(CONSENT_KEY)) return; // izbor je vec napravljen, bilo gdje na stranici
  ensureBanner()?.classList.add('is-visible');
}

// Delegirano na document: hvata sve #analyzer poveznice (nav, mobilni nav, dnevni CTA)
// jednim listenerom, bez obzira koliko ih stranica ima ili kako se ucitava DOM.
function bindAnalyzerCtaTracking(): void {
  document.addEventListener('click', (e: any) => {
    const a = e.target?.closest?.('a[href*="#analyzer"]');
    if (a) void trackToolEvent('tool_to_analyzer_click');
  });
}

function boot(): void {
  renderBanner();
  bindAnalyzerCtaTracking();
  void trackToolEvent('tool_view');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
