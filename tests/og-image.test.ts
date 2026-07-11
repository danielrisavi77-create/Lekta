/**
 * Cuva vezu izmedju og:image/twitter:image meta oznaka u index.html i stvarnog rastera
 * public/og-image.png. Ako netko makne sliku a ostavi meta (ili obrnuto), social preview
 * puca (Facebook/LinkedIn/X ne renderiraju SVG ni 404) - ovaj test to hvata prije deploya.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

function meta(re: RegExp): string | null {
  return html.match(re)?.[1] ?? null;
}

describe('og:image social preview', () => {
  it('og:image i twitter:image pokazuju na /og-image.png', () => {
    const og = meta(/<meta property="og:image" content="([^"]+)"/);
    const tw = meta(/<meta name="twitter:image" content="([^"]+)"/);
    expect(og).toBeTruthy();
    expect(og).toMatch(/\/og-image\.png$/);
    expect(og).toBe(tw); // ista slika za oba
    expect(og).toMatch(/^https:\/\//); // apsolutni URL (social crawleri ga trebaju)
  });

  it('twitter:card je summary_large_image (jer imamo veliku sliku)', () => {
    expect(meta(/<meta name="twitter:card" content="([^"]+)"/)).toBe('summary_large_image');
  });

  it('og:image:width i height su 1200x630', () => {
    expect(meta(/<meta property="og:image:width" content="([^"]+)"/)).toBe('1200');
    expect(meta(/<meta property="og:image:height" content="([^"]+)"/)).toBe('630');
  });

  it('referencirani raster public/og-image.png postoji i nije trivijalan', () => {
    const s = statSync(join(root, 'public', 'og-image.png'));
    expect(s.isFile()).toBe(true);
    expect(s.size).toBeGreaterThan(5000); // stvarni raster, ne prazan/placeholder
  });

  it('PNG magicni bajtovi (stvarni PNG, ne preimenovan SVG)', () => {
    const buf = readFileSync(join(root, 'public', 'og-image.png'));
    expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});
