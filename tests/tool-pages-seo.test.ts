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
