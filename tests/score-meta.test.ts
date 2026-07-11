/**
 * Testovi scoreMeta (BL-P0-06-2, ux-04 preobecavanje spremnosti). Oznaka razreda mora govoriti o
 * USKLADJENOSTI S PROFILOM (tehnicka provjera), a NE davati predajni verdikt ("spremno/nije spremno
 * za predaju") jer spremnost odlucuje mentor/fakultet, ne alat.
 */
import { describe, it, expect } from 'vitest';
import { scoreMeta } from '../src/scoring/checks';

describe('scoreMeta', () => {
  it('mapira cetiri razreda po pragovima', () => {
    expect(scoreMeta(95).label).toBe('Visoka usklađenost s profilom');
    expect(scoreMeta(90).label).toBe('Visoka usklađenost s profilom');
    expect(scoreMeta(80).label).toBe('Dobra usklađenost s profilom');
    expect(scoreMeta(75).label).toBe('Dobra usklađenost s profilom');
    expect(scoreMeta(65).label).toBe('Potrebne su dorade');
    expect(scoreMeta(60).label).toBe('Potrebne su dorade');
    expect(scoreMeta(40).label).toBe('Slaba usklađenost s profilom');
    expect(scoreMeta(0).label).toBe('Slaba usklađenost s profilom');
  });

  it('nijedan razred ne daje bezuvjetni predajni verdikt', () => {
    for (const s of [0, 40, 60, 75, 90, 100]) {
      const label = scoreMeta(s).label;
      expect(label).not.toMatch(/spremno za predaju/i);
    }
  });

  it('svaki razred ima boju i tekst', () => {
    for (const s of [0, 60, 75, 90]) {
      const m = scoreMeta(s);
      expect(m.color).toMatch(/^var\(--/);
      expect(m.text.length).toBeGreaterThan(10);
    }
  });
});
