/**
 * Cuva pristupacnost usporedne tablice u landing_usporedba.html (BL-P3-01, WCAG 1.3.1):
 * <caption>, scope=col na zaglavljima stupaca i <th scope=row> na prvom (dimenzijskom) stupcu,
 * te da su CSS pravila prosirena na th.dim kako se konverzija td->th ne bi vizualno regresirala.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'landing_usporedba.html'), 'utf8');
const count = (re: RegExp) => (html.match(re) || []).length;

describe('usporedna tablica a11y', () => {
  it('ima <caption>', () => {
    expect(html).toMatch(/<table class="cmp">\s*<caption[^>]*>[^<]+<\/caption>/);
  });

  it('svih 5 zaglavlja stupaca ima scope="col"', () => {
    expect(count(/scope="col"/g)).toBe(5);
  });

  it('svaki od 9 redaka ima th scope="row" (dimenzijski stupac)', () => {
    expect(count(/<th scope="row" class="dim">/g)).toBe(9);
    expect(html).not.toMatch(/<td class="dim">/); // nijedan dim vise nije <td>
  });

  it('CSS prosiren na th.dim / th da se konverzija ne regresira vizualno', () => {
    expect(html).toContain('.cmp td.dim,.cmp th.dim{font-weight:750');
    expect(html).toContain(',table.cmp th{display:block'); // mobilni card layout i za th
    expect(html).toContain('.cmp td.dim,.cmp th.dim{width:auto'); // mobilni override i za th
  });
});
