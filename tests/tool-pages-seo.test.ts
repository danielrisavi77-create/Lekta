/**
 * Cuva SEO/social head na statickim tool stranicama: svaka mora imati self-canonical (apsolutni,
 * po imenu datoteke), og:url == canonical, og:image i twitter:image na /og-image.png i
 * twitter:card=summary_large_image. Regresijski hvata i vracanje na favicon.svg (social ne
 * renderira SVG) te duplicate-content bez canonicala. Uz index.html (root canonical).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://lektahr.netlify.app';
const IMG = `${ORIGIN}/og-image.png`;

const TOOL_PAGES = [
  'citat.html',
  'kartice.html',
  'naslovnica.html',
  'literatura.html',
  'izjava.html',
  'alati.html',
  'landing_usporedba.html',
  'landing_benchmark.html',
  'citati-i-literatura.html',
];

function head(file: string): string {
  return readFileSync(join(root, file), 'utf8');
}
const pick = (html: string, re: RegExp) => html.match(re)?.[1] ?? null;

describe.each(TOOL_PAGES)('SEO head: %s', (page) => {
  const html = head(page);

  it('self-canonical apsolutni, po imenu datoteke', () => {
    const can = pick(html, /<link rel="canonical" href="([^"]+)"/);
    expect(can).toBe(`${ORIGIN}/${page}`);
  });

  it('og:url == canonical', () => {
    const can = pick(html, /<link rel="canonical" href="([^"]+)"/);
    const ogu = pick(html, /<meta property="og:url" content="([^"]+)"/);
    expect(ogu).toBe(can);
  });

  it('og:image i twitter:image na /og-image.png', () => {
    expect(pick(html, /<meta property="og:image" content="([^"]+)"/)).toBe(IMG);
    expect(pick(html, /<meta name="twitter:image" content="([^"]+)"/)).toBe(IMG);
  });

  it('twitter:card = summary_large_image', () => {
    expect(pick(html, /<meta name="twitter:card" content="([^"]+)"/)).toBe('summary_large_image');
  });
});

describe('landing_usporedba.html mobilni nav: "Svi alati" (uskladjeno s kartice.html/naslovnica.html)', () => {
  // Uzak test za ovu jednu stranicu i mobilni nav - NE generalizira na sve TOOL_PAGES:
  // citat.html/literatura.html/izjava.html trenutno TAKODJER nemaju "Svi alati" u mobilnom
  // navu, ali to je vec postojeci, nepovezan gap koji ovaj popravak ne dira i ne popravlja.
  it('#mobileNav sadrzi link na alati.html', () => {
    const html = head('landing_usporedba.html');
    // ALIGNMENT Z15 (2026-09-23): mobilni izbornik je od tada sistemski list iz `site-chrome`
    // (`<nav class="site-chrome__sheet" id="mobileNav">`), a ne `<div class="mobile-nav">` s tri
    // rucna linka; natpis je "Pribor", a odrediste `/alati.html`. Tvrdnja ostaje ista: mobilni
    // izbornik ove stranice MORA voditi na rasadnik alata.
    const nav = html.match(/<nav class="site-chrome__sheet" id="mobileNav"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(nav, 'sentinel: nema mobilnog lista #mobileNav').not.toBe('');
    expect(nav).toContain('href="/alati.html"');
  });
});

describe('globalni SEO invarijanti', () => {
  it('nijedan .html ne referencira favicon.svg kao og/twitter sliku', () => {
    const htmls = readdirSync(root).filter((f) => f.endsWith('.html'));
    const offenders = htmls.filter((f) => /(?:og:image|twitter:image)" content="[^"]*favicon\.svg/.test(head(f)));
    expect(offenders).toEqual([]);
  });

  it('index.html ima root canonical i og:image', () => {
    const html = head('index.html');
    expect(pick(html, /<link rel="canonical" href="([^"]+)"/)).toBe(`${ORIGIN}/`);
    expect(pick(html, /<meta property="og:image" content="([^"]+)"/)).toBe(IMG);
  });
});
