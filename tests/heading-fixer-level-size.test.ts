import { describe, it, expect } from 'vitest';
import { headingFormatRepairableItem } from '../src/ui/repair-items';

/**
 * Popravak naslova mora znati velicinu PO RAZINI, jednako kao analiza.
 *
 * Do 2026-08-24 je `headingFormatRepairableItem` citao samo globalnu `rules.size`. Za profil sa
 * stepenicom (vuka: glave 16, poglavlja 14, potpoglavlja 12) to je znacilo da analiza os BODUJE, a
 * popravak ju ne zna postaviti: student vidi nalaz koji mu alat ne moze rijesiti. XML sloj je
 * pritom cijelo vrijeme podrzavao `sizeHalfPoints` (`patchHeadingFormat`), rupa je bila samo u
 * gradnji parametara.
 *
 * `sizeHalfPoints` je u POLA TOCKE, jer `w:sz` u OOXML-u tako biljezi velicinu.
 */

const targetsOf = (rules: any) => {
  const items = headingFormatRepairableItem([], { headingRules: rules });
  return (items[0]?.params as any)?.targets ?? [];
};

describe('headingFormatRepairableItem: velicina po razini', () => {
  it('stepenica se prenosi u popravak, razina po razina', () => {
    const targets = targetsOf({
      levels: {
        '1': { size: 16, bold: true },
        '2': { size: 14, bold: true },
        '3': { size: 12, bold: true },
      },
    });
    expect(targets).toEqual([
      { level: 1, sizeHalfPoints: 32, bold: true },
      { level: 2, sizeHalfPoints: 28, bold: true },
      { level: 3, sizeHalfPoints: 24, bold: true },
    ]);
  });

  it('velicina razine ima PREDNOST pred globalnom', () => {
    const targets = targetsOf({ size: 12, levels: { '1': { size: 16 } } });
    expect(targets[0].sizeHalfPoints).toBe(32);
  });

  it('razina bez vlastite velicine pada na globalnu', () => {
    // Kontrola u drugom smjeru: uvodjenje `spec.size` ne smije ugasiti postojece ponasanje.
    const targets = targetsOf({ size: 12, levels: { '1': { size: 16 }, '2': { bold: true } } });
    expect(targets[1]).toEqual({ level: 2, sizeHalfPoints: 24, bold: true });
  });

  it('profil bez ijedne velicine ne salje sizeHalfPoints', () => {
    const targets = targetsOf({ levels: { '1': { bold: true } } });
    expect(targets[0]).toEqual({ level: 1, bold: true });
  });

  it('razina koja nosi samo verzal se ne salje popravku', () => {
    // `uppercase` rjesava heading-case-fixer, ne ovaj; prazan target bi bio no-op.
    expect(targetsOf({ levels: { '1': { uppercase: true } } })).toEqual([]);
  });
});
