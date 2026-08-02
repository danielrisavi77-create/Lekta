import { describe, expect, it } from 'vitest';
import { legacyIssueKey, projectLegacyIssueForHandoff, toSharedLektaResult } from '../src/integration/lekta-result-adapter';
import type { Issue } from '../src/scoring/checks';

const issue: Issue = {
  severity: 'error',
  category: 'citations',
  title: 'Navod nije pronađen u literaturi',
  detail: 'Dokument-derived explanation that must not cross the product boundary.',
  where: 'Poglavlje 3, odlomak 7',
};

describe('LektaResult shared adapter', () => {
  it('creates a deterministic legacy issue key without using detail', () => {
    const first = legacyIssueKey(issue);
    const second = legacyIssueKey({ ...issue, detail: 'completely different wording' } as Issue);
    expect(first).toBe(second);
    expect(first.startsWith('legacy:')).toBe(true);
  });

  it('does not leak legacy detail or where into the v0.1 handoff payload', () => {
    const projected = projectLegacyIssueForHandoff(issue);
    expect(projected.summary).toBe(issue.title);
    expect(projected.severity).toBe('error');
    expect(projected.status).toBe('OPEN');
    expect(projected.fixable).toBe(false);
    expect(projected).not.toHaveProperty('detail');
    expect(projected).not.toHaveProperty('location');
  });

  it('builds a shared result without inventing rule/check IDs', () => {
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
    expect(result.issues[0].checkId).toBeNull();
    expect(result.issues[0].ruleId).toBeNull();
  });
});
