import { describe, it, expect } from 'vitest';
import { evaluateHeadingHierarchy } from '../src/scoring/evaluate/structure';

/**
 * "Hijerarhija naslova" (6 bodova) je do 2026-08-24 mogla dati PUNE bodove dokumentu koji
 * hijerarhiju uopce nema. Dva odvojena kvara, oba istog razreda (zeleno koje nista ne dokazuje):
 *
 *   A) Petlja je kretala od `i=1`, pa PRVI naslov nije prolazio nikakvu provjeru. Rad kojemu su
 *      svi naslovi razine 3 nema nijedan UZASTOPNI skok, pa je dobivao 6/6. Izmjereno na stvarnom
 *      korpusu, nije izmisljen slucaj: dokument sa 14 naslova, svi razine 3.
 *
 *   B) Dokument BEZ IJEDNOG naslova takodjer je dobivao 6/6, jer prazna petlja ne nadje skok.
 *      Provjera koja nema sto mjeriti ne smije ni bodovati; sada vraca 0/0, isti oblik koji
 *      `auditHeadingRules` vec koristi.
 *
 * Ispravak NE mijenja pravilo, samo ga prestaje preskakati na prvom clanu: razina prije prvog
 * naslova je 0.
 */

function measurement(levels: number[]) {
  return {
    structure: {
      headings: levels.map((level, i) => ({ index: i + 1, level, excerpt: `Naslov ${i + 1}`, tooDeep: false })),
    },
  } as any;
}

function hierarchy(levels: number[], profile: any = {}) {
  return evaluateHeadingHierarchy(measurement(levels), profile)[0];
}

describe('evaluateHeadingHierarchy: vakuumsko zeleno', () => {
  it('uredna hijerarhija i dalje prolazi punim bodovima', () => {
    const c = hierarchy([1, 2, 3, 2, 1, 2]);
    expect(c.status).toBe('pass');
    expect(c.earned).toBe(6);
  });

  it('A: svi naslovi razine 3 vise NE prolaze punim bodovima', () => {
    // Tocan oblik iz stvarnog korpusa: 14 naslova, svi razine 3.
    const c = hierarchy(Array.from({ length: 14 }, () => 3));
    expect(c.status).toBe('warn');
    expect(c.earned).toBeLessThan(6);
  });

  it('A: prvi naslov razine 2 se prijavi, kao i svaki drugi skok', () => {
    const c = hierarchy([2, 3, 4]);
    expect(c.status).toBe('warn');
    expect(c.issue?.detail).toContain('odlomak 1');
  });

  it('A: prvi naslov razine 1 ne proizvodi lazan skok', () => {
    // Negativna kontrola u drugom smjeru: da virtualna razina 0 nije uvedena kako treba,
    // svaki bi dokument dobio skok na prvom naslovu.
    expect(hierarchy([1]).status).toBe('pass');
    expect(hierarchy([1, 1, 1]).earned).toBe(6);
  });

  it('B: bez ijednog naslova provjera NE daje bodove nego 0/0', () => {
    const c = hierarchy([]);
    expect(c.earned).toBe(0);
    expect(c.max).toBe(0);
    expect(c.detail).toContain('ne moze provjeriti');
  });

  it('postojeci skok u sredini se i dalje prijavljuje jednako', () => {
    const c = hierarchy([1, 2, 4]);
    expect(c.status).toBe('warn');
    expect(c.earned).toBe(5);
  });

  it('vise skokova skida vise bodova, uz dno na 1', () => {
    expect(hierarchy([1, 3, 1, 3, 1, 3]).earned).toBe(3);
    expect(hierarchy([3, 5, 7, 9, 3, 5, 7, 9]).earned).toBe(1);
  });

  it('profil koji ne boduje strukturu ostaje na 0/0', () => {
    const c = hierarchy([3, 3, 3], { scoreStructure: false });
    expect(c.earned).toBe(0);
    expect(c.max).toBe(0);
  });
});
