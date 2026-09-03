import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * RUTA `/rad/`: kostur, ne klon.
 *
 * Prethodni pokusaj intake-first arhitekture zalijepio je cijeli stari analizator u `rad/index.html`
 * (1862 retka). Dvije HTML datoteke koje moraju ostati usklađene su trajni generator razilazenja,
 * pa ovi gardovi cuvaju da se to ne ponovi: ruta nosi SAMO radnu povrsinu, a njezina kopija se
 * usporedjuje s izvorom pa razilazenje pada u CI-ju umjesto da tiho stoji.
 *
 * TRI ZAMKE koje su izmjerene prije pisanja rute i sve tri su ovdje zakljucane:
 *
 * 1. KLASIFIKACIJA. Manifest `*` NE prelazi `/`, pa korijenski `*.html` ne hvata `rad/index.html`.
 *    Bez vlastitog pravila ruta je nerazvrstana i klasifikacijski gard pada (deny-by-default).
 *
 * 2. CSP. `public/_headers` nema `unsafe-inline` za skripte, samo hasheve. Inline skripta teme
 *    mora biti BAJT-IDENTICNA onoj iz `index.html`, inace joj hash nije na popisu i preglednik
 *    je tiho ne izvrsi, pa stranica bljesne krivom temom.
 *
 * 3. ORIGIN. Canonical mora koristiti produkcijski origin koji `siteOriginHtml` pri buildu
 *    prepisuje. Tvrdo upisana domena zaobisla bi taj mehanizam; `verify-deploy-dist` to hvata,
 *    ali on NIJE u `npm run check`, pa se ovdje provjerava i ranije.
 */

const ROOT = resolve(__dirname, '..');
const RAD = readFileSync(resolve(ROOT, 'rad', 'index.html'), 'utf8');
const INDEX = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const MANIFEST = JSON.parse(readFileSync(resolve(ROOT, 'data', 'classification.json'), 'utf8')) as {
  rules: Array<{ pattern: string; class: string; bundle: string }>;
};

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)(?![^>]*type="application)[^>]*>[\s\S]*?<\/script>/;
const PRODUCTION_ORIGIN = 'https://lektahr.netlify.app';

/**
 * Zavrseci redaka se NORMALIZIRAJU prije usporedbe. Repo ima `core.autocrlf`, pa git pri
 * checkoutu mijenja CRLF/LF ovisno o datoteci i platformi; usporedba sirovih bajtova mjerila bi
 * konfiguraciju gita, ne razilazenje sadrzaja, i padala bi nasumicno po strojevima.
 */
function eol(text: string): string {
  return text.split('\r\n').join('\n');
}

/** Sekcija radne povrsine iz dane stranice, s ugnijezdjenim `<section>` elementima. */
function workspaceSection(html: string): string {
  const start = html.indexOf('<section class="section section-soft" id="analyzer">');
  if (start < 0) throw new Error('sekcija radne povrsine nije nadjena');
  let depth = 0;
  for (const m of html.slice(start).matchAll(/<section\b|<\/section\s*>/gi)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, start + m.index! + m[0].length);
  }
  throw new Error('zatvarajuci </section> nije nadjen');
}

describe('ruta /rad/', () => {
  it('je KOSTUR: nema cjenika ni provjera s landinga', () => {
    for (const root of ['checkGrid', 'pricingGrid', 'orderModal', 'legalModal']) {
      expect(RAD, `${root} ne smije biti na tankoj ruti`).not.toContain(`id="${root}"`);
    }
  });

  it('nema nijednu landing sekciju, pa nije klon', () => {
    // RANIJE je ovdje stajao omjer velicina (`RAD < INDEX * 0.25`). Ta je mjera prestala vrijediti
    // kad je 203 KB inline CSS-a izdvojeno iz `index.html`: omjer je dotad mjerio CSS, ne markup,
    // pa je "nije klon" prolazilo iz krivog razloga. Sada se mjeri ono sto tvrdnja imenuje.
    for (const sekcija of ['privatnost', 'trust-proof', 'video', 'how', 'podcrta', 'provjere-popis', 'pricing', 'alati-sekcija', 'faq']) {
      expect(RAD, `landing sekcija ${sekcija} ne pripada radnoj povrsini`).not.toContain(`id="${sekcija}"`);
    }
    expect(RAD.length).toBeLessThan(INDEX.length);
  });

  it('nosi radnu povrsinu, i to BAJT-IDENTICNU izvoru', () => {
    // Divergencija je jedini stvarni rizik duplikata. Dok analizator ne preseli ovamo u cijelosti
    // (prijelaz), kopija se usporedjuje sa izvorom pa tiho razilazenje nije moguce.
    expect(eol(workspaceSection(RAD))).toBe(eol(workspaceSection(INDEX)));
  });

  it('inline skripta teme je BAJT-IDENTICNA, pa joj CSP hash vrijedi', () => {
    const radScript = RAD.match(INLINE_SCRIPT)?.[0];
    const indexScript = INDEX.match(INLINE_SCRIPT)?.[0];
    expect(radScript).toBeTruthy();
    expect(eol(radScript || '')).toBe(eol(indexScript || ''));
  });

  it('ima tocno JEDNU inline skriptu: svaka dodatna trazi nov CSP hash', () => {
    const inline = [...RAD.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application)[^>]*>/g)];
    expect(inline).toHaveLength(1);
  });

  it('canonical ide kroz produkcijski origin, ne kroz tvrdo upisanu domenu', () => {
    expect(RAD).toContain(`<link rel="canonical" href="${PRODUCTION_ORIGIN}/rad/">`);
  });

  it('klasifikacijski manifest IMA pravilo za rutu', () => {
    // `*` ne prelazi `/`, pa korijenski `*.html` ovu stranicu ne pokriva.
    const rule = MANIFEST.rules.find((r) => r.pattern === 'rad/*.html');
    expect(rule, 'nedostaje pravilo rad/*.html; gard je deny-by-default').toBeTruthy();
    expect(rule).toMatchObject({ class: 'PUBLIC', bundle: 'allowed' });
  });

  it('ulaz rute je modul radnog prostora, ne stari bootstrap', () => {
    expect(RAD).toContain('src="/src/routes/workspace/main.ts"');
    expect(RAD).not.toContain('/src/main.ts');
  });

  it('RUTA IMA STIL: ulaz uvozi stil stranice', () => {
    // Izmjereno 2026-09-03: ruta je bila NESTILIZIRANA. Montirala se, primala dokument i prolazila
    // svaki test, a izgledala je kao goli HTML, jer je stil zivio kao inline `<style>` u
    // `index.html` i nije imao odakle doci. Nijedan test to nije hvatao: svi su mjerili ponasanje,
    // nijedan izgled.
    //
    // Provjerava se UVOZ u ulazu, ne izlaz builda: izlaz trazi `vite build`, a ovo pada u sekundi
    // i imenuje uzrok umjesto simptoma.
    const entry = readFileSync(resolve(ROOT, 'src', 'routes', 'workspace', 'main.ts'), 'utf8');
    expect(entry, 'ruta bi bila goli HTML').toContain("shared/page.css");
  });

  it('stil je ZAJEDNICKI s index.html, ne kopija', () => {
    // Dvije kopije istog stila razisle bi se isto kao dvije kopije markupa. Oba ulaza uvoze ISTU
    // datoteku, pa razilazenje nije moguce.
    const root = readFileSync(resolve(ROOT, 'src', 'main.ts'), 'utf8');
    expect(root).toContain("shared/page.css");
    expect(INDEX, 'stil se vratio u inline blok').not.toContain('<style');
  });

  it('ima podrucje za posten status, i ono je skriveno dok nema sto reci', () => {
    expect(RAD).toMatch(/id="workspace-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  });
});
