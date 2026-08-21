/**
 * Pin za resolveFixedFindings: "popravljeno" je POST-FESTUM iskaz (prije ne-pass, poslije pass),
 * uparen po stabilnom check.id (naslov samo kad id-a nema), s lokacijom iz triage kad postoji.
 */
import { describe, expect, it } from 'vitest';
import { resolveFixedFindings } from '../src/ui/xray-resolved';
import type { Check } from '../src/scoring/checks';

function mk(id: string | null, title: string, status: string, earned: number, max: number): Check {
  return { id, category: 'x', title, status, earned, max, detail: '', issue: null, scored: max > 0 };
}

describe('resolveFixedFindings', () => {
  it('prije fail -> poslije pass = popravljeno; pass->pass i fail->fail nisu', () => {
    const before = { checks: [mk('page.margins', 'Margine', 'fail', 0, 6), mk('format.font.dominant', 'Font', 'pass', 8, 8), mk('reference.completeness', 'Potpunost', 'fail', 1, 5)] };
    const after = { checks: [mk('page.margins', 'Margine', 'pass', 6, 6), mk('format.font.dominant', 'Font', 'pass', 8, 8), mk('reference.completeness', 'Potpunost', 'fail', 1, 5)] };
    expect(resolveFixedFindings(before, after)).toEqual([{ checkId: 'page.margins', title: 'Margine' }]);
  });

  it('lokacija dolazi iz before.details.triage (prva lokacija nalaza)', () => {
    const before = {
      checks: [mk('page.margins', 'Margine', 'fail', 0, 6)],
      details: { triage: { findings: [{ id: 'page.margins', locations: [{ paragraphIndex: 7 }] }] } },
    };
    const after = { checks: [mk('page.margins', 'Margine', 'pass', 6, 6)] };
    expect(resolveFixedFindings(before, after)).toEqual([{ checkId: 'page.margins', title: 'Margine', beforeParagraphIndex: 7 }]);
  });

  it('naslovni fallback vrijedi SAMO kad ni prije ni poslije nema id-a', () => {
    const before = { checks: [mk(null, 'Rucni naslov', 'warn', 1, 3)] };
    const after = { checks: [mk(null, 'Rucni naslov', 'pass', 3, 3)] };
    expect(resolveFixedFindings(before, after)).toEqual([{ checkId: 'Rucni naslov', title: 'Rucni naslov' }]);
  });

  it('nestala provjera NIJE popravljena (o njoj sudi detectPassRegressions, ne mi)', () => {
    const before = { checks: [mk('page.margins', 'Margine', 'fail', 0, 6)] };
    const after = { checks: [mk('format.font.dominant', 'Font', 'pass', 8, 8)] };
    expect(resolveFixedFindings(before, after)).toEqual([]);
  });

  it('informativne i nemjerljive provjere ne ulaze (nisu bodovan nalaz)', () => {
    const before = { checks: [mk('page.numbers.scheme', 'Shema', 'informational', 0, 0)] };
    const after = { checks: [mk('page.numbers.scheme', 'Shema', 'pass', 1, 1)] };
    expect(resolveFixedFindings(before, after)).toEqual([]);
  });

  it('prazne strane daju prazno', () => {
    expect(resolveFixedFindings(null, { checks: [mk('a.b', 'X', 'pass', 1, 1)] })).toEqual([]);
    expect(resolveFixedFindings({ checks: [mk('a.b', 'X', 'fail', 0, 1)] }, { checks: [] })).toEqual([]);
  });
});
