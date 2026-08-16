import { describe, expect, it } from 'vitest';
import { classifyFixability } from '../src/analysis/check-fixer-map';
import { REPAIR_SURFACE } from '../src/repair/repair-surface';
import { FIXER_IDS } from '../src/repair/apply-fixers';

/**
 * `classifyFixability` je JEDINI izvor za triage (razina nalaza) i result-readiness
 * (koliko popravak realno moze jamciti). Mapa je rucno pisana, a sve neprepoznato pada na
 * 'manual', pa fixer koji ZIVI, ima cijenu i nudi se u UI-u moze biti prikazan kao "rucni rad".
 * Posljedica nije krivi DOCX nego prenizak repairCeiling i lazna poruka korisniku.
 */
describe('classifyFixability pokriva zive fixere', () => {
  it('"Oblikovanje naslova po razinama" NIJE manual (heading-format-fixer je ziv i naplacen)', () => {
    const out = classifyFixability('Oblikovanje naslova po razinama');
    expect(out.fixability).not.toBe('manual');
    expect(out.fixId).toBe('heading-format-fixer');
  });

  it('"Oblikovanje fusnota" NIJE manual (footnote-typography-fixer je ziv)', () => {
    expect(classifyFixability('Oblikovanje fusnota').fixability).not.toBe('manual');
  });

  it('svaki fixId koji mapa vraca stvarno postoji u registru', () => {
    const titles = [
      'Oblikovanje naslova po razinama',
      'Oblikovanje fusnota',
      'Margine dokumenta',
      'Numeriranje od prve stranice Uvoda',
      'Abecedni poredak literature',
      'Dijelovi verificiranog profila',
    ];
    for (const title of titles) {
      const { fixId } = classifyFixability(title);
      if (fixId) expect(FIXER_IDS).toContain(fixId);
    }
  });

  it('registar povrsine i registar fixera se ne razilaze', () => {
    // REPAIR_SURFACE je tipiziran po FixerId, pa visak/manjak znaci stvaran drift.
    expect(Object.keys(REPAIR_SURFACE).sort()).toEqual([...FIXER_IDS].sort());
  });
});
