import { describe, it, expect } from 'vitest';
import { auditHeadingRules } from '../src/audits/structure';

/**
 * Velicina naslova PO RAZINI (`rules.levels[N].size`).
 *
 * Dotad je postojala samo `rules.size`, jedna vrijednost za sve razine, pa izvor koji propisuje
 * stepenicu nije imao cime to izraziti. Primjer koji je izmjenu izazvao je `vuka-poslovni-upute`:
 * "za naslove glava 16 bold (...) naslove poglavlja (...) velicinom 14 bold, a potpoglavlja
 * velicinom slova 12 bold".
 *
 * Provjera ne dodaje bodove: sve grane (velicina, verzal, bold, kurziv) ulaze u JEDNU postojecu
 * provjeru "Oblikovanje naslova po razinama" koja vrijedi 6 bodova.
 */

function heading(level: number, text: string, size: number, bold = true) {
  return {
    headingLevel: level,
    text,
    runs: [{ text, size, bold }],
    pProps: {},
  };
}

/** Provjera vraca polje checkova; prvi je "Oblikovanje naslova po razinama". */
function formatCheck(headings: any[], rules: any) {
  return auditHeadingRules(headings, rules)[0];
}

describe('auditHeadingRules: velicina po razini', () => {
  const stepenica = {
    levels: { '1': { size: 16, bold: true }, '2': { size: 14, bold: true }, '3': { size: 12, bold: true } },
  };

  it('rad koji slijedi stepenicu prolazi punim bodovima', () => {
    const c = formatCheck(
      [heading(1, 'PRVA GLAVA', 16), heading(2, 'Poglavlje', 14), heading(3, 'Potpoglavlje', 12)],
      stepenica,
    );
    expect(c.status).toBe('pass');
    expect(c.earned).toBe(6);
  });

  it('NEGATIVNA KONTROLA: kriva velicina na jednoj razini se prijavi', () => {
    // Bez ovoga bi "prolazila" i provjera koja velicinu uopce ne gleda.
    const c = formatCheck(
      [heading(1, 'PRVA GLAVA', 12), heading(2, 'Poglavlje', 14), heading(3, 'Potpoglavlje', 12)],
      stepenica,
    );
    expect(c.status).toBe('warn');
    expect(c.earned).toBeLessThan(6);
  });

  it('NEGATIVNA KONTROLA: svi naslovi u velicini tijela padaju, ne prolaze', () => {
    // Najvjerojatniji stvaran kvar: student uopce ne poveca naslove.
    const c = formatCheck(
      [heading(1, 'PRVA GLAVA', 12), heading(2, 'Poglavlje', 12), heading(3, 'Potpoglavlje', 12)],
      stepenica,
    );
    expect(c.status).toBe('warn');
    expect(c.earned).toBeLessThan(6);
  });

  it('razina bez propisane velicine se ne kaznjava', () => {
    // `levels` pokriva 1 i 2; cetvrta razina nema propis, pa njena velicina ne smije obarati.
    const c = formatCheck(
      [heading(1, 'PRVA GLAVA', 16), heading(2, 'Poglavlje', 14), heading(4, 'Duboko', 9)],
      { levels: { '1': { size: 16 }, '2': { size: 14 } } },
    );
    expect(c.status).toBe('pass');
  });

  it('globalna rules.size i dalje vrijedi kad razina svoju nema', () => {
    const c = formatCheck([heading(1, 'Naslov', 14), heading(2, 'Drugi', 14)], { size: 14 });
    expect(c.status).toBe('pass');
    expect(formatCheck([heading(1, 'Naslov', 11)], { size: 14 }).status).toBe('warn');
  });

  it('velicina razine ima PREDNOST pred globalnom', () => {
    // Inace bi profil sa stepenicom morao izostaviti globalnu vrijednost da bi uopce radio.
    const rules = { size: 12, levels: { '1': { size: 16 } } };
    expect(formatCheck([heading(1, 'Naslov', 16)], rules).status).toBe('pass');
    expect(formatCheck([heading(1, 'Naslov', 12)], rules).status).toBe('warn');
  });

  it('profil bez ijedne velicine ostaje netaknut (golden se ne mice)', () => {
    const c = formatCheck([heading(1, 'Naslov', 11), heading(2, 'Drugi', 33)], {
      levels: { '1': { bold: true } },
    });
    expect(c.status).toBe('pass');
  });
});
