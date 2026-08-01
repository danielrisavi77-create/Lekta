import { describe, expect, it } from 'vitest';
import { resultReadiness, repairCeiling } from '../src/ui/result-readiness';
import type { Check } from '../src/scoring/checks';

function chk(title: string, status: string, earned: number, max: number): Check {
  return { category: 'formatting', title, status, earned, max, detail: '', issue: null, scored: max > 0 };
}

describe('spremnost rezultata', () => {
  it('ne mijesa tehnicku ocjenu i blokator predaje', () => {
    const readiness = resultReadiness([{ severity: 'error', category: 'structure', title: 'PAGE', detail: '', where: '' }]);
    expect(readiness.kind).toBe('blocked');
    expect(readiness.label).toBe('Nije spremno za predaju');
    expect(readiness.description).toContain('Tehnička ocjena ne potvrđuje');
  });

  it('razlikuje dorade, rucne provjere i cist automatski nalaz', () => {
    expect(resultReadiness([{ severity: 'warning', category: 'formatting', title: '', detail: '', where: '' }]).kind).toBe('needs-work');
    expect(resultReadiness([{ severity: 'info', category: 'citations', title: '', detail: '', where: '' }]).kind).toBe('manual-review');
    expect(resultReadiness([]).kind).toBe('clear');
  });
});

describe('repairCeiling: maksimalna ocjena koju automatski popravak realno moze jamciti', () => {
  it('bez otvorenih provjera: strop je 100, nema manualnog jaza', () => {
    const ceiling = repairCeiling([chk('Dominantni font', 'pass', 8, 8), chk('Margine dokumenta', 'pass', 6, 6)]);
    expect(ceiling.hasManualGap).toBe(false);
    expect(ceiling.maxScore).toBe(100);
    expect(ceiling.items).toEqual([]);
  });

  it('otvorena provjera s zivim auto-fixerom (npr. font) NE ulazi u manualni jaz', () => {
    const ceiling = repairCeiling([chk('Dominantni font', 'fail', 0, 8), chk('Margine dokumenta', 'pass', 6, 6)]);
    expect(ceiling.hasManualGap).toBe(false);
    expect(ceiling.items).toEqual([]);
  });

  it('otvorena sadrzajna (manual) provjera smanjuje strop i navodi je poimenice', () => {
    const ceiling = repairCeiling([
      chk('Citirano → literatura', 'fail', 3, 10),
      chk('Dominantni font', 'pass', 8, 8),
    ]);
    expect(ceiling.hasManualGap).toBe(true);
    expect(ceiling.items).toEqual([{ title: 'Citirano → literatura', lostPoints: 7 }]);
    // (8 + 10 - 7) / 18 * 100 = 61.11... -> 61
    expect(ceiling.maxScore).toBe(61);
  });

  it('informativne (max=0) provjere ne ulaze u racun', () => {
    const ceiling = repairCeiling([
      chk('Prazni odlomci', 'warn', 0, 0),
      chk('Dominantni font', 'pass', 8, 8),
    ]);
    expect(ceiling.maxScore).toBe(100);
    expect(ceiling.hasManualGap).toBe(false);
  });
});
