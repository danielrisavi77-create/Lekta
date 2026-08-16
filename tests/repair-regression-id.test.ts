import { describe, expect, it } from 'vitest';
import { detectPassRegressions } from '../src/analysis/repair-regression';

/**
 * Korelacija "prije/poslije popravka" mora ici po STABILNOM id-u, ne po hrvatskom naslovu.
 * Dok se ključalo po naslovu, svaka preformulacija (ili dinamicki sufiks kao kod formata
 * stranice) tiho je razvezivala parove: nestala provjera racuna se kao regresija, pa bi
 * puko preimenovanje prijavilo LAZAN pad.
 */
describe('detectPassRegressions kljuca po stabilnom id-u', () => {
  it('uparuje po id-u i kad se naslov preformulira', () => {
    const before = [{ id: 'page.margins', title: 'Margine dokumenta', status: 'pass', earned: 6, max: 6 }];
    const after = [{ id: 'page.margins', title: 'Margine (A4)', status: 'pass', earned: 6, max: 6 }];
    expect(detectPassRegressions(before, after)).toEqual([]);
  });

  it('i dalje prijavljuje stvaran pad kad id ostane isti', () => {
    const before = [{ id: 'page.margins', title: 'Margine dokumenta', status: 'pass', earned: 6, max: 6 }];
    const after = [{ id: 'page.margins', title: 'Margine dokumenta', status: 'fail', earned: 0, max: 6 }];
    const out = detectPassRegressions(before, after);
    expect(out).toHaveLength(1);
    expect(out[0].lostPoints).toBe(6);
  });

  it('pada natrag na naslov kad id nije registriran (null)', () => {
    const before = [{ id: null, title: 'Neregistrirana provjera', status: 'pass', earned: 2, max: 2 }];
    const after = [{ id: null, title: 'Neregistrirana provjera', status: 'pass', earned: 2, max: 2 }];
    expect(detectPassRegressions(before, after)).toEqual([]);
  });

  it('ne uparuje dvije RAZLICITE neregistrirane provjere samo zato sto su obje null', () => {
    const before = [{ id: null, title: 'Provjera A', status: 'pass', earned: 2, max: 2 }];
    const after = [{ id: null, title: 'Provjera B', status: 'pass', earned: 2, max: 2 }];
    expect(detectPassRegressions(before, after)).toHaveLength(1);
  });
});
