/**
 * detectPassRegressions (src/analysis/repair-regression.ts): provjera koja je PRIJE popravka
 * prolazila, a poslije ne prolazi.
 *
 * Zasto je ovo produkcijski modul: ista usporedba je zivjela samo u testovima, pa se regresija
 * isporucivala korisniku - u ukupnom score-u se pad jedne provjere ne vidi.
 */
import { describe, it, expect } from 'vitest';
import { detectPassRegressions } from '../src/analysis/repair-regression';

const chk = (title: string, status: string, earned = 0, max = 0, category = 'formatting') =>
  ({ title, status, earned, max, category });

describe('detectPassRegressions', () => {
  it('prijavi pad iz pass u fail s izgubljenim bodovima', () => {
    const out = detectPassRegressions([chk('Margine dokumenta', 'pass', 6, 6)], [chk('Margine dokumenta', 'fail', 0, 6)]);
    expect(out).toEqual([{ title: 'Margine dokumenta', category: 'formatting', after: 'fail', lostPoints: 6 }]);
  });

  it('prijavi i pad iz pass u warn (djelomican gubitak)', () => {
    const out = detectPassRegressions([chk('Dominantni font', 'pass', 8, 8)], [chk('Dominantni font', 'warn', 3, 8)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ after: 'warn', lostPoints: 5 });
  });

  it('nestalu provjeru racuna kao regresiju (isti profil mora dati isti skup provjera)', () => {
    const out = detectPassRegressions([chk('Prored osnovnog teksta', 'pass', 6, 6)], []);
    expect(out).toHaveLength(1);
    expect(out[0].after).toBeUndefined();
    expect(out[0].lostPoints).toBe(6);
  });

  it('ne prijavi nista kad provjera i dalje prolazi', () => {
    expect(detectPassRegressions([chk('Margine dokumenta', 'pass', 6, 6)], [chk('Margine dokumenta', 'pass', 6, 6)])).toEqual([]);
  });

  it('ne prijavi provjeru koja ni prije nije prolazila (popravak ju nije pokvario)', () => {
    expect(detectPassRegressions([chk('Margine dokumenta', 'fail', 0, 6)], [chk('Margine dokumenta', 'fail', 0, 6)])).toEqual([]);
  });

  it('poboljsanje nije regresija', () => {
    expect(detectPassRegressions([chk('Margine dokumenta', 'fail', 0, 6)], [chk('Margine dokumenta', 'pass', 6, 6)])).toEqual([]);
  });

  it('lostPoints nikad nije negativan ni kad su bodovi porasli uz pad statusa', () => {
    const out = detectPassRegressions([chk('X', 'pass', 2, 6)], [chk('X', 'warn', 4, 6)]);
    expect(out[0].lostPoints).toBe(0);
  });

  it('prazan ulaz daje prazan izlaz i podnosi izostavljene argumente', () => {
    expect(detectPassRegressions([], [])).toEqual([]);
    expect(detectPassRegressions()).toEqual([]);
  });

  it('neocjenjene provjere (max=0) ne mogu pasti jer im je status uvijek pass', () => {
    // makeCheck forsira status 'pass' kad je max 0 (src/scoring/checks.ts), pa ako se takva
    // provjera ipak pojavi kao ne-pass, to je stvaran nalaz i mora se prijaviti.
    const out = detectPassRegressions([chk('Informativna', 'pass', 0, 0)], [chk('Informativna', 'warn', 0, 0)]);
    expect(out).toHaveLength(1);
    expect(out[0].lostPoints).toBe(0);
  });
});
