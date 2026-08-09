/**
 * Odluka o ishodu popravka i izolacija krivca.
 *
 * Kljucni scenarij je onaj koji ukupna ocjena SAKRIVA: +6 na marginama i -3 na fusnotama
 * izgleda kao cist +3, pa bi kriterij oslonjen samo na ocjenu isporucio dokument u kojem je
 * korisniku nesto pokvareno.
 */
import { describe, it, expect } from 'vitest';
import { evaluateOutcome, isolateCulprit, type OutcomeSnapshot } from '../src/analysis/repair-plan';

const chk = (id: string, title: string, status: string, earned = 0, max = 6) => ({ id, title, status, earned, max });

const snap = (score: number | null, checks: ReturnType<typeof chk>[]): OutcomeSnapshot => ({ score, checks });

describe('evaluateOutcome', () => {
  it('prihvaca cist napredak', () => {
    const before = snap(60, [chk('page.margins', 'Margine dokumenta', 'fail', 0)]);
    const after = snap(100, [chk('page.margins', 'Margine dokumenta', 'pass', 6)]);
    expect(evaluateOutcome(before, after)).toEqual({ accept: true, regressed: [], delta: 40 });
  });

  it('odbija pad ocjene', () => {
    const before = snap(80, [chk('page.margins', 'Margine dokumenta', 'warn', 4)]);
    const after = snap(60, [chk('page.margins', 'Margine dokumenta', 'warn', 2)]);
    const verdict = evaluateOutcome(before, after);
    expect(verdict.accept).toBe(false);
    expect(verdict.reason).toBe('score-drop');
  });

  it('odbija pad pojedine provjere I KAD ukupna ocjena raste (to zbroj sakriva)', () => {
    const before = snap(50, [
      chk('page.margins', 'Margine dokumenta', 'fail', 0),
      chk('footnote.format', 'Oblikovanje fusnota', 'pass', 3, 3),
    ]);
    const after = snap(66, [
      chk('page.margins', 'Margine dokumenta', 'pass', 6),
      chk('footnote.format', 'Oblikovanje fusnota', 'fail', 0, 3),
    ]);
    const verdict = evaluateOutcome(before, after);
    expect(verdict.accept).toBe(false);
    expect(verdict.reason).toBe('pass-regression');
    expect(verdict.regressed).toEqual(['Oblikovanje fusnota']);
    expect(verdict.delta).toBe(16); // ocjena je RASLA, a ishod je svejedno odbijen
  });

  it('nestala provjera se racuna kao regresija', () => {
    const before = snap(100, [chk('footnote.format', 'Oblikovanje fusnota', 'pass', 3, 3)]);
    const after = snap(100, []);
    expect(evaluateOutcome(before, after).reason).toBe('pass-regression');
  });

  it('uparuje po stabilnom id-u, pa preimenovan naslov nije regresija', () => {
    const before = snap(100, [chk('footnote.format', 'Oblikovanje fusnota', 'pass', 3, 3)]);
    const after = snap(100, [chk('footnote.format', 'Format fusnota (novi naziv)', 'pass', 3, 3)]);
    expect(evaluateOutcome(before, after).accept).toBe(true);
  });

  it('integritet ima prednost nad svime', () => {
    const before = snap(50, []);
    const after = snap(100, []);
    const verdict = evaluateOutcome(before, after, { integrityFailed: true });
    expect(verdict.accept).toBe(false);
    expect(verdict.reason).toBe('integrity');
  });

  it('jednaka ocjena bez regresije se prihvaca (mogla je pasti nebodovana stavka)', () => {
    const before = snap(90, [chk('page.margins', 'Margine dokumenta', 'pass', 6)]);
    const after = snap(90, [chk('page.margins', 'Margine dokumenta', 'pass', 6)]);
    expect(evaluateOutcome(before, after).accept).toBe(true);
  });
});

describe('isolateCulprit', () => {
  const ok = { accept: true as const, regressed: [], delta: 5 };
  const bad = { accept: false as const, reason: 'pass-regression' as const, regressed: ['X'], delta: -2 };

  it('nadje jedini zahvat koji kvari ishod i vrati ostatak', async () => {
    const found = await isolateCulprit(['a', 'b', 'c'], async (kept) => (kept.includes('b') ? bad : ok));
    expect(found).toEqual({ culprit: 'b', kept: ['a', 'c'] });
  });

  it('vrati null kad izostavljanje nijednog pojedinacnog ne pomaze (dva se sukobljavaju)', async () => {
    const found = await isolateCulprit(['a', 'b'], async () => bad);
    expect(found).toBeNull();
  });

  it('s jednim kandidatom ne pokusava nista (nema sto ostati)', async () => {
    let calls = 0;
    const found = await isolateCulprit(['a'], async () => { calls += 1; return ok; });
    expect(found).toBeNull();
    expect(calls, 'ne smije trositi analizu bez izgleda za uspjeh').toBe(0);
  });

  it('ne trosi vise analiza nego sto ima kandidata', async () => {
    let calls = 0;
    await isolateCulprit(['a', 'b', 'c', 'd'], async (kept) => { calls += 1; return kept.includes('d') ? bad : ok; });
    expect(calls).toBeLessThanOrEqual(4);
  });
});
