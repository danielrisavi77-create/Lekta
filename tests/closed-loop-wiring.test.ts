/**
 * OZICENJE DOKAZA PO OSI: gard koji do 2026-08-31 nije bio ni u jednom gateu.
 *
 * Gard je stajao kao kod na vrhu `scripts/run-closed-loop.mts`, pa se izvodio samo kad covjek
 * rucno pokrene `npm run closed-loop`. CI posao koji se ZOVE `closed-loop`
 * (`.github/workflows/repair-slow.yml`) pokrece `npm run test:slow`, a `vitest.slow.config.ts`
 * ukljucuje iskljucivo `tests/repair-closed-loop*.test.ts`. Skripta se u CI-ju nikad ne izvodi.
 *
 * Ovaj test ga pokrece nad STVARNIM mapama, pa od sada pada u brzom `npm run check`. Da grize
 * dokazuju dvije mutacije u `tests/gate-mutations.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { APPLIED_AXIS_FIXER } from './helpers/coverage-cells';
import { assertAxisEvidenceWiring, AXIS_SIGNAL, STRUCTURAL_WITHOUT_SCORED_CHECK } from './helpers/closed-loop-wiring';

describe('dokaz po osi: ozicenje mora biti potpuno', () => {
  it('BASELINE: stvarno ozicenje prolazi', () => {
    // Bez ovoga bi mutacije nize mogle "hvatati" tako sto gard vristi na sve.
    expect(() => assertAxisEvidenceWiring()).not.toThrow();
  });

  it('skup nije prazan, inace gard prolazi vakuumski', () => {
    // Prazan `axes` cini svaku tvrdnju nize istinitom bez ijedne provjere.
    expect(STRUCTURAL_WITHOUT_SCORED_CHECK.size).toBeGreaterThanOrEqual(7);
  });

  /**
   * UGOVOR KOJI SE NAJLAKSE IZGUBI: izricit `undefined` je IMENOVANJE, ne izostanak.
   *
   * Tri osi (`revision-metadata`, `element-caption`, `field-integrity`) nemaju mjerljivu brojku i
   * to stoji zapisano kao `undefined`. Gard zato pita `axis in axisSignal`, ne `axisSignal[axis]`.
   * Da se to svede na provjeru istinitosti, sve bi tri odmah pucale, a "popravak" bi bio da se
   * izbace iz skupa, cime bi tiho pale na slabije changelog pravilo, tocno ono sto gard sprjecava.
   */
  it('os s izricitim `undefined` signalom je imenovana, ne nedostajuca', () => {
    const bezBrojke = ['revision-metadata', 'element-caption', 'field-integrity'];
    for (const axis of bezBrojke) {
      expect(axis in AXIS_SIGNAL, `${axis} mora biti IMENOVAN u AXIS_SIGNAL`).toBe(true);
      expect(AXIS_SIGNAL[axis], `${axis} nema mjerljivu brojku`).toBeUndefined();
    }
    expect(() => assertAxisEvidenceWiring(bezBrojke)).not.toThrow();
  });

  it('svaka os iz skupa ima i signal i fixer', () => {
    for (const axis of STRUCTURAL_WITHOUT_SCORED_CHECK) {
      expect(axis in AXIS_SIGNAL, `${axis} nije u AXIS_SIGNAL`).toBe(true);
      expect(APPLIED_AXIS_FIXER[axis], `${axis} nije u APPLIED_AXIS_FIXER`).toBeTruthy();
    }
  });
});
