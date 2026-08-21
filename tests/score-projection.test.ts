/**
 * Pin za score-projection: flip semantika, monotonost slojeva, model nesigurnosti
 * (guaranteed interno, optimistic "do"), troslojni repairPath i njegova ekvivalencija sa
 * starom repairCeiling formulom (totalMax - manualLost) / totalMax.
 */
import { describe, expect, it } from 'vitest';
import { projectScore, repairPath, type SelectedRepairLike } from '../src/scoring/score-projection';
import { repairCeiling } from '../src/ui/result-readiness';
import type { Check } from '../src/scoring/checks';

/** Rucno slozen Check s eksplicitnim stabilnim ID-em (mimo makeCheck, kao UI/test fixturi). */
function mk(id: string | null, title: string, status: string, earned: number, max: number): Check {
  return { id, category: 'x', title, status, earned, max, detail: '', issue: null, scored: max > 0 };
}

const MARGINS_FAIL = mk('page.margins', 'Margine dokumenta', 'fail', 0, 6);          // auto klasa
const FONT_WARN = mk('format.font.dominant', 'Dominantni font', 'warn', 4, 8);       // auto klasa
const SORT_WARN = mk('reference.alphabetical', 'Poredak literature', 'warn', 2, 5);  // assisted klasa
const COMPLETENESS_FAIL = mk('reference.completeness', 'Potpunost bibliografskih zapisa', 'fail', 1, 5); // manual
const MANUAL_ADVISORY = mk('manual.checks', 'Zahtjevi za ručnu završnu provjeru', 'warn', 3, 3); // manual, 0 izgubljeno
const PASS = mk('format.spacing.body', 'Prored osnovnog teksta', 'pass', 6, 6);
const INFORMATIONAL = mk('page.numbers.scheme', 'Shema numeriranja stranica', 'informational', 0, 0);

const ALL = [MARGINS_FAIL, FONT_WARN, SORT_WARN, COMPLETENESS_FAIL, MANUAL_ADVISORY, PASS, INFORMATIONAL];

const marginsItem: SelectedRepairLike = { checkIds: ['page.margins'], fixerId: 'margins-fixer' };
const fontItem: SelectedRepairLike = { checkIds: ['format.font.dominant'], fixerId: 'font-fixer' };
const sortItem: SelectedRepairLike = { checkIds: ['reference.alphabetical'], fixerId: 'bibliography-repair-fixer', requiresConfirmation: true };

describe('projectScore: flip semantika', () => {
  it('pass se ne flipa, informativno i advisory (max 0) ostaju izvan nazivnika', () => {
    const p = projectScore(ALL, [{ checkIds: ['format.spacing.body', 'page.numbers.scheme'] }]);
    expect(p.optimistic.earned).toBe(p.current.earned);
    expect(p.optimistic.max).toBe(p.current.max);
  });

  it('warn s punim bodovima (manual.checks 3/3) je numericki no-op', () => {
    const p = projectScore(ALL, [{ checkIds: ['manual.checks'] }]);
    expect(p.optimistic.earned).toBe(p.current.earned);
  });

  it('flip dize earned na max samo za pogodjene ne-pass provjere', () => {
    const p = projectScore(ALL, [marginsItem]);
    expect(p.optimistic.earned).toBe(p.current.earned + 6);
    expect(p.guaranteed.earned).toBe(p.current.earned + 6);
    expect(p.hasAssistedClaims).toBe(false);
  });

  it('naslovni fallback: check bez id-a s registriranim naslovom se ipak pogadja', () => {
    const noId = [mk(null, 'Margine dokumenta', 'fail', 0, 6)];
    const p = projectScore(noId, [marginsItem]);
    expect(p.optimistic.earned).toBe(6);
  });

  it('dupli checkIds (heading-format + heading-case dijele ID) ne broje bodove dvaput', () => {
    const heading = mk('structure.heading.format', 'Oblikovanje naslova po razinama', 'warn', 1, 4);
    const p = projectScore([heading], [
      { checkIds: ['structure.heading.format'], fixerId: 'heading-format-fixer' },
      { checkIds: ['structure.heading.format'], fixerId: 'heading-case-fixer', requiresConfirmation: true },
    ]);
    expect(p.optimistic.earned).toBe(4);
  });
});

describe('projectScore: model nesigurnosti (guaranteed je strogi podskup)', () => {
  it('requiresConfirmation stavka ide samo u optimistic', () => {
    const p = projectScore(ALL, [sortItem]);
    expect(p.optimistic.earned).toBe(p.current.earned + 3);
    expect(p.guaranteed.earned).toBe(p.current.earned);
    expect(p.hasAssistedClaims).toBe(true);
  });

  it('assisted klasifikacija ne ulazi u guaranteed ni bez zastavice potvrde', () => {
    const p = projectScore(ALL, [{ checkIds: ['reference.alphabetical'], fixerId: 'bibliography-repair-fixer' }]);
    expect(p.guaranteed.earned).toBe(p.current.earned);
  });

  it('deep-degradacija: uncertainFixerIds spusta auto stavku iz guaranteed, optimistic ostaje', () => {
    const p = projectScore(ALL, [fontItem], { uncertainFixerIds: new Set(['font-fixer']) });
    expect(p.optimistic.earned).toBe(p.current.earned + 4);
    expect(p.guaranteed.earned).toBe(p.current.earned);
    expect(p.hasAssistedClaims).toBe(true);
  });

  it('monotonost na sirovim sumama: current <= guaranteed <= optimistic', () => {
    const p = projectScore(ALL, [marginsItem, fontItem, sortItem], { uncertainFixerIds: new Set(['font-fixer']) });
    expect(p.guaranteed.earned).toBeGreaterThanOrEqual(p.current.earned);
    expect(p.optimistic.earned).toBeGreaterThanOrEqual(p.guaranteed.earned);
    expect(p.current.max).toBe(p.guaranteed.max);
    expect(p.guaranteed.max).toBe(p.optimistic.max);
  });
});

describe('repairPath (kompat nacin, bez offered)', () => {
  it('afterAssisted == stara strop formula (totalMax - manualLost) / totalMax', () => {
    const path = repairPath(ALL);
    const totalMax = 6 + 8 + 5 + 5 + 3 + 6; // bodovane provjere
    const manualLost = 4; // samo reference.completeness (5 - 1)
    expect(path.afterAssisted.score).toBe(Math.round(((totalMax - manualLost) / totalMax) * 100));
    expect(repairCeiling([...ALL]).maxScore).toBe(path.afterAssisted.score);
  });

  it('slojevi: afterAuto flipa samo auto klasu, afterAssisted dodaje assisted', () => {
    const path = repairPath(ALL);
    expect(path.afterAuto.earnedRaw).toBe(path.current.earnedRaw + 6 + 4);   // margins + font
    expect(path.afterAssisted.earnedRaw).toBe(path.afterAuto.earnedRaw + 3); // + sort (5-2)
  });

  it('manual s izgubljenim bodovima ide u manualItems, warn 3/3 u manualAdvisories', () => {
    const path = repairPath(ALL);
    expect(path.manualItems).toEqual([{ title: 'Potpunost bibliografskih zapisa', lostPoints: 4 }]);
    expect(path.manualAdvisories).toEqual(['Zahtjevi za ručnu završnu provjeru']);
    expect(path.hasManualGap).toBe(true);
  });

  it('rub lostPoints===0: samo advisory manual -> hasManualGap false, strop 100', () => {
    const checks = [PASS, MANUAL_ADVISORY];
    const path = repairPath(checks);
    expect(path.hasManualGap).toBe(false);
    expect(path.manualItems).toEqual([]);
    expect(path.manualAdvisories).toEqual(['Zahtjevi za ručnu završnu provjeru']);
    const ceiling = repairCeiling(checks);
    expect(ceiling.hasManualGap).toBe(false);
    expect(ceiling.maxScore).toBe(100);
    expect(ceiling.items).toEqual([]);
  });

  it('prazan ulaz: strop 100 (kao stara formula uz totalMax === 0)', () => {
    expect(repairCeiling([]).maxScore).toBe(100);
    expect(repairPath([]).afterAssisted.score).toBeNull();
  });
});

describe('repairPath s offered (stvarno ponudjene stavke)', () => {
  it('nepokriveni auto i assisted gubici idu u uncoveredItems i ne dizu nijedan sloj', () => {
    const path = repairPath(ALL, [fontItem]); // margins i sort NISU ponudjeni
    expect(path.uncoveredItems).toEqual([
      { title: 'Margine dokumenta', lostPoints: 6 },
      { title: 'Poredak literature', lostPoints: 3 },
    ]);
    expect(path.afterAuto.earnedRaw).toBe(path.current.earnedRaw + 4);
    expect(path.afterAssisted.earnedRaw).toBe(path.afterAuto.earnedRaw);
  });

  it('requiresConfirmation stavka dize samo assisted sloj (poklapa se s ledger zonama)', () => {
    const autoConfirm: SelectedRepairLike = { checkIds: ['page.margins'], fixerId: 'margins-fixer', requiresConfirmation: true };
    const path = repairPath(ALL, [autoConfirm]);
    expect(path.afterAuto.earnedRaw).toBe(path.current.earnedRaw);
    expect(path.afterAssisted.earnedRaw).toBe(path.current.earnedRaw + 6);
  });

  it('manualni ostatak ne ovisi o ponudi', () => {
    const path = repairPath(ALL, []);
    expect(path.manualItems).toEqual([{ title: 'Potpunost bibliografskih zapisa', lostPoints: 4 }]);
  });
});
