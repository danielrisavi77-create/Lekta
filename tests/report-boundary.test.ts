import { describe, it, expect } from 'vitest';

import {
  buildTeaser,
  buildFullReport,
  buildReportRequest,
  categoryScores,
  issueCounts,
  type AnalysisResultLike,
} from '../src/report/report';
import { WORK_TYPE_TIERS, windowDaysFor, tierFor, isReportWorkType } from '../src/report/pricing';
import type { Check, Issue } from '../src/scoring/checks';

function check(category: string, earned: number, max: number, title = `${category}-${max}`): Check {
  return { category, title, status: 'pass', earned, max, detail: '', issue: null, scored: max > 0 };
}
function iss(severity: string, title: string): Issue {
  return { severity, category: 'format', title, detail: 'detalj', where: '' };
}

const result: AnalysisResultLike = {
  score: 82,
  profile: 'Pravo, integrirani',
  profileStatus: 'verified',
  stats: { words: 9000, references: 30 },
  checks: [
    check('format', 8, 10),
    check('format', 4, 5),
    check('citati', 6, 10),
    check('info', 0, 0), // informativno, ne ulazi u bodovanje
  ],
  issues: [iss('error', 'Font nije Times'), iss('warning', 'Prored'), iss('info', 'Napomena'), iss('warning', 'Margine')],
};

describe('teaser (klijent, besplatan, lokalan)', () => {
  it('izlaze score, kategorije, brojace i 1 do 2 problema, ali NE puni popis', () => {
    const t = buildTeaser(result, { sampleSize: 2 });
    expect(t.score).toBe(82);
    expect(t.scoreLabel).toBeTruthy();
    expect(t.sampleIssues).toHaveLength(2);
    expect(t.hasMore).toBe(true); // ima 4 problema, prikazana 2
    expect(t.watermark).toBe(true);
    // teaser ne sadrzi puni popis problema (samo uzorak)
    expect((t as unknown as { issues?: unknown }).issues).toBeUndefined();
  });

  it('brojaci po ozbiljnosti su tocni', () => {
    const t = buildTeaser(result);
    expect(t.issueCounts).toEqual({ error: 1, warning: 2, info: 1, total: 4 });
  });

  it('category score iskljucuje informativne (max 0) provjere', () => {
    const t = buildTeaser(result);
    const cats = Object.fromEntries(t.categoryScores.map((c) => [c.category, c]));
    expect(cats.format).toEqual({ category: 'format', earned: 12, max: 15 });
    expect(cats.citati).toEqual({ category: 'citati', earned: 6, max: 10 });
    expect(cats.info).toBeUndefined();
  });

  it('je cista funkcija (bez mreze, bez entitlementa)', () => {
    // dvostruki poziv daje isti rezultat, nista se ne mijenja izvana
    expect(buildTeaser(result)).toEqual(buildTeaser(result));
  });
});

describe('puni izvjestaj (serverski, iza entitlementa)', () => {
  it('sadrzi sve provjere i sve probleme, bez watermarka', () => {
    const full = buildFullReport(result, { traceToken: 'tok-123' });
    expect(full.checks).toHaveLength(4);
    expect(full.issues).toHaveLength(4);
    expect(full.watermark).toBe(false);
    expect(full.traceToken).toBe('tok-123');
    expect(full.coverageTier).toBe(2); // profileStatus 'verified' -> T2
  });

  it('scoredCheckTitles hook filtrira na bodovana pravila (boduje se samo scored:true)', () => {
    const full = buildFullReport(result, { scoredCheckTitles: new Set(['format-10']) });
    expect(full.checks).toHaveLength(1);
    expect(full.checks[0].title).toBe('format-10');
  });
});

describe('zahtjev prema serveru', () => {
  it('nosi parsiranu strukturu (za otisak), rezultat i work_type', () => {
    const req = buildReportRequest(
      { title: 'X', author: 'A', headings: [{ level: 1, text: 'Uvod' }] },
      result,
      'diplomski',
    );
    expect(req.workType).toBe('diplomski');
    expect(req.parsedStructure.title).toBe('X');
    expect(req.analysisResult.score).toBe(82);
  });
});

describe('cjenovni tierovi i prozori', () => {
  it('tierovi prate spec (2)', () => {
    expect(WORK_TYPE_TIERS.seminarski.priceEur).toBe(3);
    expect(WORK_TYPE_TIERS.zavrsni.priceEur).toBe(5);
    expect(WORK_TYPE_TIERS.diplomski.priceEur).toBe(10);
    expect(WORK_TYPE_TIERS.doktorski.windowDays).toBe(14);
    expect(WORK_TYPE_TIERS.doktorski.onRequest).toBe(true);
  });
  it('windowDaysFor i tierFor', () => {
    expect(windowDaysFor('diplomski')).toBe(7);
    expect(windowDaysFor('doktorski')).toBe(14);
    expect(windowDaysFor('nepoznato')).toBe(7);
    expect(tierFor('zavrsni')?.priceEur).toBe(5);
    expect(isReportWorkType('diplomski')).toBe(true);
    expect(isReportWorkType('final')).toBe(false);
  });
});

// pomocnici ostaju izravno testabilni
describe('pomocnici', () => {
  it('categoryScores i issueCounts rade na praznom ulazu', () => {
    expect(categoryScores()).toEqual([]);
    expect(issueCounts()).toEqual({ error: 0, warning: 0, info: 0, total: 0 });
  });
});
