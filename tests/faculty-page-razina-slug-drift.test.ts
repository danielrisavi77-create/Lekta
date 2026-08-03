/**
 * scripts/generate-faculty-pages.mjs duplicira LEVEL_SLUGS (src/title-pages/level-slugs.ts) kao
 * RAZINA_PARAM_SLUGS jer .mjs build skripte su odvojene od src/ TS-a (nema bundlera). Naslovnica
 * cross-link (?fakultet=&razina=) mora koristiti TOCNO iste slugove koje naslovnica.html cita
 * (parseTitlePageParams), inace bi generator slao korisnika na neispravan ?razina= koji se tiho
 * ignorira. Ovaj test dokazuje da su dvije mape identicne; ako netko promijeni jednu bez druge,
 * ovaj test pada umjesto da rupa ode neprimijecena u produkciju.
 */
import { describe, it, expect } from 'vitest';
import { LEVEL_SLUGS } from '../src/title-pages/level-slugs';
import { RAZINA_PARAM_SLUGS } from '../scripts/generate-faculty-pages.mjs';

describe('RAZINA_PARAM_SLUGS stays in sync with LEVEL_SLUGS', () => {
  it('je deep-equal pravom LEVEL_SLUGS izvoru istine', () => {
    expect(RAZINA_PARAM_SLUGS).toEqual(LEVEL_SLUGS);
  });
});
