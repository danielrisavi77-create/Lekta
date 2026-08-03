import { describe, expect, it } from 'vitest';
import { legacyIssueKey, projectLegacyIssueForHandoff, toSharedLektaResult } from '../src/integration/lekta-result-adapter';
import { makeCheck, type Issue } from '../src/scoring/checks';
import type { RuleEntry } from '../src/profiles/profile-schema';

const issue: Issue = {
  severity: 'error',
  category: 'citations',
  title: 'Navod nije pronađen u literaturi',
  detail: 'Dokument-derived explanation that must not cross the product boundary.',
  where: 'Poglavlje 3, odlomak 7',
};

describe('LektaResult shared adapter', () => {
  it('keeps the deterministic legacy key available for backwards compatibility', () => {
    const first = legacyIssueKey(issue);
    const second = legacyIssueKey({ ...issue, detail: 'completely different wording' } as Issue);
    expect(first).toBe(second);
    expect(first.startsWith('legacy:')).toBe(true);
  });

  it('does not leak legacy detail or where through the old privacy-safe projection', () => {
    const projected = projectLegacyIssueForHandoff(issue);
    expect(projected.summary).toBe(issue.title);
    expect(projected.severity).toBe('error');
    expect(projected.status).toBe('OPEN');
    expect(projected.fixable).toBe(false);
    expect(projected).not.toHaveProperty('detail');
    expect(projected).not.toHaveProperty('location');
  });

  it('builds stable engine identity even when no authored rule exists', () => {
    const result = toSharedLektaResult(
      {
        score: 82,
        profile: 'fpzg-diplomski',
        profileStatus: 'verified',
        checks: [],
        issues: [issue],
      },
      {
        analysisId: 'analysis-1',
        rulesetId: 'fpzg-diplomski@2026-08-03',
        analyzedAt: '2026-08-03T12:00:00.000Z',
        projectId: 'project-1',
      },
    );

    expect(result.schemaVersion).toBe('0.1');
    expect(result.projectId).toBe('project-1');
    expect(result.profileId).toBe('fpzg-diplomski');
    expect(result.score).toBe(82);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].checkId).toBe('engine:citations:navod-nije-pronaden-u-literaturi');
    expect(result.issues[0].ruleId).toBeNull();
    expect(result.issues[0].issueKey.startsWith('check:engine:citations:')).toBe(true);
    expect(result.issues[0]).not.toHaveProperty('detail');
    expect(result.issues[0]).not.toHaveProperty('location');
  });

  it('projects authored ruleId and AutoFix metadata when the parent check is known', () => {
    const marginIssue: Issue = {
      severity: 'warning', category: 'formatting', title: 'Margine odstupaju', detail: 'private', where: 'Postavke stranice',
    };
    const marginCheck = makeCheck('formatting', 'Margine dokumenta', 'warn', 2, 6, 'x', marginIssue);
    const rule: RuleEntry = {
      ruleId: 'fpzg.margins.001', checkId: 'margins', value: {}, status: 'verified', autoFixable: true, fixerId: 'margins-fixer',
    };

    const result = toSharedLektaResult(
      { score: 70, profile: 'FPZG', profileStatus: 'verified', checks: [marginCheck], issues: [marginIssue] },
      { analysisId: 'analysis-2', rulesetId: 'rules-2', analyzedAt: '2026-08-03T12:00:00.000Z', profileId: 'fpzg-politologija-diplomski', ruleEntries: [rule] },
    );

    expect(result.issues[0]).toMatchObject({
      issueKey: 'rule:fpzg.margins.001',
      checkId: 'margins',
      ruleId: 'fpzg.margins.001',
      fixable: true,
      fixerId: 'margins-fixer',
    });
  });
});