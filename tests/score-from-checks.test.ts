/**
 * Pin za `scoreFromChecks`: jedina dopustena semantika je povijesni inline izracun iz
 * analyzeDocx (filter `c.max>0`, sirove sume, JEDNO zaokruzivanje, null bez bodovanih).
 *
 * Referentna implementacija ispod je DOSLOVNA kopija starog inline izraza; test pada cim
 * se `scoreFromChecks` od nje razidje, pa je dedup triju kopija (analyze-docx, demoAssemble,
 * scoreBreakdownHtml) dokazano ponasajno neutralan.
 *
 * A0 test na dnu dokumentira poznati raskorak: analyzeDocx racuna score PRIJE nego u checks
 * gurne tipografski check, pa `scoreFromChecks(result.checks)` nad gotovim rezultatom NIJE
 * garantirano jednak `result.score`. To nije bug ove funkcije nego ugovor za potrosace
 * (projekcije klampaju na >= result.score); test pada ako netko raskorak "popravi" ovdje
 * umjesto svjesnim golden korakom u analyzeDocx.
 */
import { describe, expect, it } from 'vitest';
import { makeCheck, unmeasurableCheck, scoreFromChecks, type Check } from '../src/scoring/checks';

/** Doslovna kopija starog inline izracuna (analyze-docx.ts, prije deduplikacije). */
function referenceScore(checks: Check[]): { earned: number; max: number; score: number | null } {
  const scoredChecks = checks.filter((c) => c.max > 0);
  const max = scoredChecks.reduce((s, c) => s + c.max, 0);
  const earned = scoredChecks.reduce((s, c) => s + c.earned, 0);
  return { earned, max, score: max ? Math.round((earned / max) * 100) : null };
}

describe('scoreFromChecks == referentni inline izracun', () => {
  const cases: Array<[string, Check[]]> = [
    ['prazan niz', []],
    ['samo informativne (max=0)', [makeCheck('a', 'X', 'pass', 0, 0, 'd'), makeCheck('a', 'Y', 'pass', 3, 0, 'd')]],
    ['samo nemjerljive', [unmeasurableCheck('a', 'X', 'd'), unmeasurableCheck('b', 'Y', 'd')]],
    ['zaokruzivanje .5 (1/8 = 12.5 -> 13)', [makeCheck('a', 'X', 'warn', 1, 8, 'd')]],
    [
      'mijesano bodovano/informativno/nemjerljivo',
      [
        makeCheck('a', 'X', 'pass', 6, 6, 'd'),
        makeCheck('a', 'Y', 'warn', 2, 5, 'd'),
        makeCheck('b', 'Z', 'pass', 0, 0, 'd'),
        unmeasurableCheck('b', 'W', 'd'),
        makeCheck('c', 'Q', 'fail', 0, 4, 'd'),
      ],
    ],
    ['sve proslo', [makeCheck('a', 'X', 'pass', 5, 5, 'd'), makeCheck('a', 'Y', 'pass', 3, 3, 'd')]],
  ];

  for (const [name, checks] of cases) {
    it(name, () => {
      expect(scoreFromChecks(checks)).toEqual(referenceScore(checks));
    });
  }

  it('bez bodovanih provjera ocjena je null, ne 0', () => {
    expect(scoreFromChecks([]).score).toBeNull();
    expect(scoreFromChecks([unmeasurableCheck('a', 'X', 'd')]).score).toBeNull();
  });

  it('sume su sirove i zaokruzuje se jednom na kraju (nema zaokruzivanja po provjeri)', () => {
    // 2/3 i 0/3: sirovo je 2/6 = 33.33 -> 33. Zaokruzivanje po provjeri dalo bi
    // (round(66.67) + round(0)) / 2 = 33.5 -> 34, pa bi ovaj test pao.
    const checks = [makeCheck('a', 'X', 'warn', 2, 3, 'd'), makeCheck('a', 'Y', 'fail', 0, 3, 'd')];
    expect(scoreFromChecks(checks).score).toBe(33);
  });
});

describe('A0: raskorak result.score vs scoreFromChecks(result.checks)', () => {
  it('bodovani check gurnut NAKON izracuna mijenja scoreFromChecks, ali ne i vec izracunat score', () => {
    const checks = [makeCheck('a', 'X', 'pass', 9, 9, 'd')];
    const scoreAtComputeTime = scoreFromChecks(checks).score; // 100, kao analyzeDocx na tocki izracuna
    checks.push(makeCheck('typography', 'Tehničko-tipografska dosljednost', 'warn', 0, 1, 'd'));
    const scoreOverFinalChecks = scoreFromChecks(checks).score; // 90
    expect(scoreAtComputeTime).toBe(100);
    expect(scoreOverFinalChecks).toBe(90);
    expect(scoreOverFinalChecks).not.toBe(scoreAtComputeTime);
  });
});
