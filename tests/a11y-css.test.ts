/**
 * Cuva dva a11y CSS popravka: fokus prsten dovoljnog kontrasta (BL-P3-05, WCAG 1.4.11) na svih 8
 * stranica i minimalnu velicinu male mete 24x24 (BL-P3-04, WCAG 2.5.8) na index.html gumbima.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const PAGES = [
  'index.html', 'citat.html', 'kartice.html', 'naslovnica.html',
  'literatura.html', 'izjava.html', 'alati.html', 'landing_usporedba.html',
];

describe('fokus prsten kontrast (BL-P3-05)', () => {
  it.each(PAGES)('%s koristi neproziran dvotonski --focus, ne rgba .22', (page) => {
    const css = read(page);
    expect(css).toContain('--focus:0 0 0 2px var(--panel),0 0 0 4px var(--brand)');
    expect(css).not.toContain('rgba(51,64,126,.22)'); // stari slabi prsten uklonjen
  });
});

describe('velicina male mete 24px (BL-P3-04)', () => {
  const css = read('index.html');
  it.each(['remove-file', 'wl-close'])('.%s ima min 24x24 i centriran sadrzaj', (cls) => {
    const re = new RegExp(`\\.${cls}\\{[^}]*min-width:24px;min-height:24px;display:inline-grid;place-items:center[^}]*\\}`);
    expect(css).toMatch(re);
  });
});
