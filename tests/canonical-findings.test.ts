import { describe, expect, it } from 'vitest';
import type { Check, Issue } from '../src/scoring/checks.ts';
import { buildCanonicalFindings } from '../src/analysis/canonical-findings.ts';

function check(overrides: Partial<Check> = {}): Check {
  return {
    id: 'format.font.dominant',
    evidence: 'measured',
    measurementStatus: 'measured',
    category: 'format',
    title: 'Dominantni font',
    status: 'pass',
    earned: 2,
    max: 2,
    detail: 'Font je usklađen.',
    issue: null,
    scored: true,
    ...overrides,
  };
}

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    severity: 'warning',
    category: 'format',
    title: 'Dominantni font',
    detail: 'Pronađen je drugi font.',
    where: 'odlomak 2',
    ...overrides,
  };
}

describe('buildCanonicalFindings', () => {
  it('creates one finding per check and merges its matching issue', () => {
    const matchingIssue = issue({ title: 'Pronađen drugi font' });
    const result = buildCanonicalFindings({ checks: [check({ issue: matchingIssue })], issues: [matchingIssue] });

    expect(result).toEqual([
      {
        id: 'check:format.font.dominant',
        checkId: 'format.font.dominant',
        ruleId: null,
        category: 'format',
        severity: 'warning',
        status: 'pass',
        measurementStatus: 'measured',
        title: 'Pronađen drugi font',
        detail: 'Pronađen je drugi font.',
        locations: [{ where: 'odlomak 2' }],
        evidence: ['Font je usklađen.'],
        hasIssue: true,
        scored: true,
        scoreImpact: { earned: 2, max: 2 },
        blocking: false,
      },
    ]);
  });

  it('uses the matching top-level issue when its detail differs from check.issue', () => {
    const embeddedIssue = issue({ detail: 'Lokalni opis provjere.' });
    const topLevelIssue = issue({ severity: 'info', detail: 'Opis iz zajednickog popisa.' });

    const result = buildCanonicalFindings({
      checks: [check({ issue: embeddedIssue })],
      issues: [topLevelIssue],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      severity: 'info',
      title: 'Dominantni font',
      detail: 'Opis iz zajednickog popisa.',
      locations: [{ where: 'odlomak 2' }],
      evidence: ['Font je uskla\u0111en.'],
      hasIssue: true,
    });
  });

  it('keeps pass checks without an issue and preserves the check id', () => {
    const result = buildCanonicalFindings({ checks: [check({ id: 'custom.id' })] });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'check:custom.id',
      checkId: 'custom.id',
      status: 'pass',
      locations: [],
      evidence: ['Font je usklađen.'],
      hasIssue: false,
    });
  });

  it('emits unmatched issues with private deterministic duplicate ids', () => {
    const result = buildCanonicalFindings({
      issues: [
        issue({ category: 'citation', title: 'Nedostaje izvor', where: '' }),
        issue({ category: 'citation', title: 'Nedostaje izvor', where: '' }),
        issue({ category: 'structure', title: 'Nedostaje naslov', where: 'uvod' }),
      ],
    });

    expect(result[0]).toMatchObject({ checkId: null, status: 'warn', scoreImpact: null, locations: [{ where: '' }], hasIssue: true });
    expect(result[1]).toMatchObject({ checkId: null, status: 'warn', scoreImpact: null, locations: [{ where: '' }], hasIssue: true });
    expect(result[2]).toMatchObject({ checkId: null, status: 'warn', scoreImpact: null, locations: [{ where: 'uvod' }], hasIssue: true });
    expect(result[0].id).toMatch(/^issue:[a-z0-9]+$/);
    expect(result[1].id).toBe(`${result[0].id}:2`);
    expect(result[2].id).toMatch(/^issue:[a-z0-9]+$/);
    expect(result[2].id).not.toBe(result[0].id);
  });

  it('hashes unmatched issue identity without readable locations and keeps mapping stable across input order', () => {
    const firstIssue = issue({
      category: 'citation',
      title: 'Nedostaje izvor',
      where: 'Odlomak 2, TAJNA-LOKACIJA-\u017dupan\u010di\u0107',
    });
    const secondIssue = issue({
      category: 'citation',
      title: 'Nedostaje izvor',
      where: 'Odlomak 7, \u0110akovi\u0107',
    });
    const forward = buildCanonicalFindings({ issues: [firstIssue, secondIssue] });
    const reversed = buildCanonicalFindings({ issues: [secondIssue, firstIssue] });
    const firstId = forward.find((finding) => finding.locations[0].where === firstIssue.where)?.id;
    const secondId = forward.find((finding) => finding.locations[0].where === secondIssue.where)?.id;

    expect(firstId).toMatch(/^issue:[a-z0-9]+$/);
    expect(secondId).toMatch(/^issue:[a-z0-9]+$/);
    expect(firstId).not.toBe(secondId);
    expect(firstId).not.toMatch(/odlomak|tajna|lokacija|zupancic/i);
    expect(secondId).not.toMatch(/odlomak|dakovic/i);
    expect(reversed.find((finding) => finding.locations[0].where === firstIssue.where)?.id)
      .toBe(firstId);
    expect(reversed.find((finding) => finding.locations[0].where === secondIssue.where)?.id)
      .toBe(secondId);
  });

  it('keeps distinct locations stable when their normalized slugs collide', () => {
    const diacriticLocation = issue({
      category: 'citation',
      title: 'Nedostaje izvor',
      where: 'Odlomak, \u017dime',
    });
    const plainLocation = issue({
      category: 'citation',
      title: 'Nedostaje izvor',
      where: 'Odlomak, Zime',
    });
    const forward = buildCanonicalFindings({ issues: [diacriticLocation, plainLocation] });
    const reversed = buildCanonicalFindings({ issues: [plainLocation, diacriticLocation] });
    const forwardDiacriticId = forward.find((finding) => finding.locations[0].where === diacriticLocation.where)?.id;
    const forwardPlainId = forward.find((finding) => finding.locations[0].where === plainLocation.where)?.id;

    expect(forwardDiacriticId).toMatch(/^issue:[a-z0-9]+$/);
    expect(forwardPlainId).toMatch(/^issue:[a-z0-9]+$/);
    expect(forwardDiacriticId).not.toBe(forwardPlainId);
    expect(reversed.find((finding) => finding.locations[0].where === diacriticLocation.where)?.id).toBe(forwardDiacriticId);
    expect(reversed.find((finding) => finding.locations[0].where === plainLocation.where)?.id).toBe(forwardPlainId);
  });

  it('uses score eligibility and does not invent a pass for unavailable measurements', () => {
    const result = buildCanonicalFindings({
      checks: [
        check({ measurementStatus: 'unavailable', status: 'pass', earned: 2 }),
        check({ id: 'info.check', max: 0, scored: false, status: 'warning', measurementStatus: 'not-applicable' }),
      ],
    });

    expect(result).toMatchObject([
      { status: 'unknown', measurementStatus: 'unavailable', scored: false, scoreImpact: null },
      { status: 'warn', measurementStatus: 'not-applicable', scored: false, scoreImpact: null },
    ]);
  });

  it('normalizes unavailable warning and failure outcomes to unknown', () => {
    const result = buildCanonicalFindings({
      checks: [
        check({ measurementStatus: 'unavailable', status: 'warn', scored: false }),
        check({ id: 'format.margin', measurementStatus: 'unavailable', status: 'fail', scored: false }),
      ],
    });

    expect(result.map(({ status, measurementStatus }) => ({ status, measurementStatus }))).toEqual([
      { status: 'unknown', measurementStatus: 'unavailable' },
      { status: 'unknown', measurementStatus: 'unavailable' },
    ]);
  });

  it('deduplicates the check issue and duplicate evidence strings', () => {
    const sameIssue = issue({ detail: 'Font je usklađen.' });
    const result = buildCanonicalFindings({ checks: [check({ issue: sameIssue })], issues: [sameIssue] });

    expect(result).toHaveLength(1);
    expect(result[0].evidence).toEqual(['Font je usklađen.']);
  });
});
