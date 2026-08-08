import { describe, expect, it } from 'vitest';
import { buildKatedraHandoffFragment, buildKatedraHandoffUrl } from '../src/integration/katedra-handoff';
import type { LektaResult } from '../src/integration/academic-suite-contracts';

function sampleResult(): LektaResult {
  return {
    schemaVersion: '0.1',
    analysisId: 'a-1',
    projectId: 'project-123',
    rulesetId: 'fpzg-diplomski:graduate@test',
    profileId: 'fpzg-diplomski',
    score: 84,
    categoryScores: [],
    issues: [{
      issueKey: 'issue-1',
      checkId: null,
      ruleId: null,
      category: 'citations',
      severity: 'error',
      summary: 'Nedostaje citatnica Čović 2026',
      fixable: false,
      status: 'OPEN',
    }],
    analyzedAt: '2026-08-03T12:00:00.000Z',
  };
}

function decodeFragment(fragment: string): any {
  const encoded = decodeURIComponent(fragment.slice('#lekta='.length));
  const binary = atob(encoded);
  const escaped = Array.from(binary, ch => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');
  return JSON.parse(decodeURIComponent(escaped));
}

describe('Lekta -> Katedra handoff', () => {
  it('round-trips Unicode through the URL fragment', () => {
    const fragment = buildKatedraHandoffFragment(sampleResult());
    expect(fragment.startsWith('#lekta=')).toBe(true);
    expect(decodeFragment(fragment)).toEqual(sampleResult());
  });

  it('builds a Katedra URL without duplicating slashes', () => {
    const url = buildKatedraHandoffUrl('https://katedra.hr/', sampleResult());
    expect(url.startsWith('https://katedra.hr/#lekta=')).toBe(true);
  });
});
