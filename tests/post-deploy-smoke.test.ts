import { describe, it, expect } from 'vitest';
import {
  assertHtmlOk, assertContains, assertSecurityHeaders, assertAssetOk,
  assertHealth, assertHealthRejectsPost, assertRequiresAuth,
  extractLocalAssets, classifyRun, runSmoke,
// @ts-expect-error - .mjs skripta bez tipova; ovdje se namjerno vrti IZVORNI alat, ne njegov prijepis.
} from '../scripts/post-deploy-smoke.mjs';
import { LEGAL_PAGES } from '../scripts/lib/legal-pages.mjs';

/**
 * Audit P1-29. Sve dosadasnje provjere mjere kod PRIJE deploya; ova mjeri ono sto je posluzeno.
 *
 * Ovdje se ne provjerava produkcija (test ne smije ovisiti o mrezi), nego da ALAT RADI: da svaka
 * tvrdnja prijavi kvar koji joj je namijenjen i da klasifikacija razlikuje ispad od promatraca bez
 * mreze. `--self-test` u samoj skripti vrti isti skup mutacija; ovaj test ga uvlaci u `npm run
 * check`, jer provjera koju nitko ne pokrece ne stiti nista.
 */

const ZAGLAVLJA = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'self'; script-src 'self' 'sha256-x'",
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
};

describe('tvrdnje hvataju kvar zbog kojeg postoje', () => {
  it('naslovnica: 404, krivi content-type i tijelo koje nije HTML', () => {
    expect(assertHtmlOk({ status: 404, headers: ZAGLAVLJA, text: '<html></html>' }, 'x').ok).toBe(false);
    expect(assertHtmlOk({ status: 200, headers: { 'content-type': 'application/json' }, text: '{}' }, 'x').ok).toBe(false);
    expect(assertHtmlOk({ status: 200, headers: ZAGLAVLJA, text: 'ok' }, 'x').ok).toBe(false);
    expect(assertHtmlOk({ status: 200, headers: ZAGLAVLJA, text: '<html></html>' }, 'x').ok).toBe(true);
  });

  it('sigurnosna zaglavlja: nestanak _headers, i CSP koji vise ne znaci nista', () => {
    expect(assertSecurityHeaders({ headers: { ...ZAGLAVLJA, 'content-security-policy': '' } }).ok).toBe(false);
    // Ovo je suptilniji kvar od nestanka: CSP je prisutan, pa povrsna provjera prolazi, a
    // 'unsafe-inline' mu oduzima tocno onaj ucinak zbog kojeg je uveden.
    expect(assertSecurityHeaders({ headers: { ...ZAGLAVLJA, 'content-security-policy': "script-src 'self' 'unsafe-inline'" } }).ok).toBe(false);
    expect(assertSecurityHeaders({ headers: { ...ZAGLAVLJA, 'strict-transport-security': '' } }).ok).toBe(false);
    expect(assertSecurityHeaders({ headers: { ...ZAGLAVLJA, 'x-content-type-options': '' } }).ok).toBe(false);
    expect(assertSecurityHeaders({ headers: ZAGLAVLJA }).ok).toBe(true);
  });

  it('resursi: 404 i SPA fallback koji vrati HTML sa statusom 200', () => {
    expect(assertAssetOk({ status: 404, headers: {} }, '/a.js').ok).toBe(false);
    // Lazno zeleno: status je 200, ali preglednik bi na mjestu skripte dobio HTML.
    expect(assertAssetOk({ status: 200, headers: { 'content-type': 'text/html' } }, '/a.js').ok).toBe(false);
    expect(assertAssetOk({ status: 200, headers: { 'content-type': 'text/javascript' } }, '/a.js').ok).toBe(true);
  });

  it('health mora reci istinu I moci pasti', () => {
    expect(assertHealth({ status: 200, text: JSON.stringify({ status: 'ok', dependencies: { database: { ok: false } } }) }).ok).toBe(false);
    // MASKIRANA MUTACIJA: dok je svaki 'degraded' slucaj imao i pokvarenu bazu, provjeru statusa
    // je pokrivala provjera baze, pa se redak `body.status !== 'ok'` mogao obrisati a da nijedan
    // gard ne pisne. Health smije degradirati i zbog ovisnosti koja nije baza.
    expect(assertHealth({ status: 200, text: JSON.stringify({ status: 'degraded', dependencies: { database: { ok: true } } }) }).ok).toBe(false);
    expect(assertHealth({ status: 200, text: JSON.stringify({ dependencies: { database: { ok: true } } }) }).ok).toBe(false);
    expect(assertHealth({ status: 200, text: '<html>502</html>' }).ok).toBe(false);
    // OPS-01: endpoint koji na svaki zahtjev vrati 200 ne mjeri nista.
    expect(assertHealthRejectsPost({ status: 200 }).ok).toBe(false);
    expect(assertHealthRejectsPost({ status: 405 }).ok).toBe(true);
  });

  it('placeni put bez tokena: 200 i 5xx su oba nalaz', () => {
    expect(assertRequiresAuth({ status: 200 }, 'r').ok).toBe(false);
    expect(assertRequiresAuth({ status: 500 }, 'r').ok).toBe(false);
    expect(assertRequiresAuth({ status: 401 }, 'r').ok).toBe(true);
  });

  it('marker pravne stranice', () => {
    expect(assertContains({ text: 'prazno' }, 'AZOP', 'x').ok).toBe(false);
    expect(assertContains({ text: 'tijelo AZOP kraj' }, 'AZOP', 'x').ok).toBe(true);
  });
});

describe('izvlacenje resursa', () => {
  it('uzima lokalne skripte i stilove, preskace vanjske', () => {
    const html = '<script type="module" src="/assets/a.js"></script>'
      + '<link rel="stylesheet" href="/assets/a.css">'
      + '<script src="https://cdn.example/x.js"></script>'
      + '<script src="//cdn.example/y.js"></script>';
    expect(extractLocalAssets(html).sort()).toEqual(['/assets/a.css', '/assets/a.js']);
  });

  it('relativna staza se normalizira na korijensku', () => {
    expect(extractLocalAssets('<script src="assets/a.js"></script>')).toEqual(['/assets/a.js']);
  });
});

describe('classifyRun: ispad ili promatrac bez mreze', () => {
  const F = (host: string, status?: number, extra = {}) => ({ id: 'x', host, status, ok: false, ...extra });
  const P = (host: string) => ({ id: 'x', host, status: 200, ok: true });

  it('sve palo istovjetno na OBA pruzatelja je neuvjerljivo, ne ispad', () => {
    expect(classifyRun([F('site', undefined, { unreachable: true }), F('functions', undefined, { unreachable: true })])).toBe('inconclusive');
    expect(classifyRun([F('site', 403), F('functions', 403)])).toBe('inconclusive');
  });

  it('NE guta stvaran ispad', () => {
    // Jedan pruzatelj: to je ispad tog pruzatelja.
    expect(classifyRun([F('site', 503), F('site', 503)])).toBe('fail');
    // Mreza ocito radi ako je makar jedna provjera prosla.
    expect(classifyRun([P('site'), F('functions', 500)])).toBe('fail');
    // 200 dokazuje da smo dosli; kvar je u tijelu.
    expect(classifyRun([F('site', 200), F('functions', 200)])).toBe('fail');
    // Dvostruki 503 je malo vjerojatan, ali ako se dogodi netko MORA ustati.
    expect(classifyRun([F('site', 503), F('functions', 503)])).toBe('fail');
    expect(classifyRun([F('site', 404), F('functions', 404)])).toBe('fail');
  });

  it('prazan popis je neuvjerljiv, nikad uspjeh', () => {
    expect(classifyRun([])).toBe('inconclusive');
    expect(classifyRun([P('site'), P('functions')])).toBe('ok');
  });
});

describe('runSmoke nad laznim opazanjima', () => {
  /** Zdrava produkcija u malom: naslovnica, resursi, sve pravne stranice, Edge. */
  const zdravObserve = async (url: string, init: { method?: string } = {}) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/health')) {
      return init.method === 'POST'
        ? { status: 405, headers: {}, text: '' }
        : { status: 200, headers: {}, text: JSON.stringify({ status: 'ok', dependencies: { database: { ok: true } } }) };
    }
    if (u.pathname.endsWith('/repair-docx')) return { status: 401, headers: {}, text: '' };
    if (u.pathname.endsWith('.js')) return { status: 200, headers: { 'content-type': 'text/javascript' }, text: '' };
    const pravna = LEGAL_PAGES.find(([f]: [string, string]) => u.pathname.endsWith(`/${f}`));
    const tijelo = pravna
      ? `<html><body>${pravna[1]}</body></html>`
      : '<html><head><script type="module" src="/assets/a.js"></script></head></html>';
    return { status: 200, headers: ZAGLAVLJA, text: tijelo };
  };

  it('zdrava instalacija: sve prolazi i pokriva SVE pravne stranice', async () => {
    const nalazi = await runSmoke({ site: 'https://s.test', functions: 'https://f.test/functions/v1', observeImpl: zdravObserve });
    const pali = nalazi.filter((n: { ok: boolean }) => !n.ok);
    expect(pali, JSON.stringify(pali)).toEqual([]);
    // Ako netko doda pravnu stranicu u LEGAL_PAGES, smoke ju mora poceti provjeravati sam.
    for (const [file] of LEGAL_PAGES) {
      expect(nalazi.some((n: { id: string }) => n.id === `legal:${file}`), `nedostaje provjera za ${file}`).toBe(true);
    }
    expect(classifyRun(nalazi)).toBe('ok');
  });

  it('kad naslovnica padne, resursi se NE prijavljuju kao zaseban kvar', async () => {
    // Ovisna provjera nad stranicom koje nema tvrdila bi "prazan build" i slala u krivu dijagnozu;
    // k tome je nalaz bez HTTP statusa razbijao prepoznavanje presretaca.
    const pao = async (url: string, init: { method?: string } = {}) =>
      (new URL(url).host === 's.test' ? { status: 403, headers: {}, text: '' } : zdravObserve(url, init));
    const nalazi = await runSmoke({ site: 'https://s.test', functions: 'https://f.test/functions/v1', observeImpl: pao });
    expect(nalazi.some((n: { id: string }) => n.id === 'assets')).toBe(false);
    expect(nalazi.some((n: { id: string }) => n.id.startsWith('asset:'))).toBe(false);
    // Edge je zdrav, pa ovo JEST ispad stranice, ne odsjecen promatrac.
    expect(classifyRun(nalazi)).toBe('fail');
  });

  it('nedostupna mreza se ne prijavljuje kao ispad produkcije', async () => {
    const nedostupno = async () => ({ transport: 'ECONNREFUSED' });
    const nalazi = await runSmoke({ site: 'https://s.test', functions: 'https://f.test/functions/v1', observeImpl: nedostupno });
    expect(nalazi.every((n: { unreachable?: boolean }) => n.unreachable)).toBe(true);
    expect(classifyRun(nalazi)).toBe('inconclusive');
  });

  it('nestala pravna stranica se vidi (netlify.toml lanac je puknuo nakon vite builda)', async () => {
    const bez = async (url: string, init: { method?: string } = {}) =>
      (url.endsWith('/privatnost.html') ? { status: 404, headers: {}, text: '' } : zdravObserve(url, init));
    const nalazi = await runSmoke({ site: 'https://s.test', functions: 'https://f.test/functions/v1', observeImpl: bez });
    const n = nalazi.find((x: { id: string }) => x.id === 'legal:privatnost.html');
    expect(n.ok).toBe(false);
    expect(classifyRun(nalazi)).toBe('fail');
  });
});
