import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LektaResult } from '../src/integration/academic-suite-contracts';
import {
  persistCompletionCheck,
  wasCompletionCheckPersisted,
} from '../src/integration/completion-check-persistence';

beforeEach(() => {
  sessionStorage.clear();
});

function result(): LektaResult {
  return {
    schemaVersion: '0.1',
    analysisId: 'analysis-1',
    projectId: 'project-1',
    rulesetId: 'ruleset-fingerprint-1',
    profileId: 'fpzg-politologija-diplomski',
    score: 78,
    categoryScores: [{ category: 'format', earned: 7, max: 10 }],
    issues: [
      {
        issueKey: 'check:page-numbers',
        issueInstanceId: 'analysis-1:1',
        checkId: 'page-numbers',
        ruleId: null,
        category: 'format',
        severity: 'error',
        summary: 'Provjeri numeriranje stranica',
        fixable: false,
        fixerId: null,
        status: 'OPEN',
        // Simulate a future/internal object carrying fields that MUST NOT cross
        // the network boundary. The persistence layer re-projects explicitly.
        detail: 'PRIVATE DETAIL',
        location: { pageHint: '17' },
      } as any,
    ],
    analyzedAt: '2026-08-03T20:00:00.000Z',
  };
}

describe('Completion check persistence boundary', () => {
  it('sends only the explicit sanitized LektaResult projection', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      expect(body.issues[0]).toEqual({
        issueKey: 'check:page-numbers',
        issueInstanceId: 'analysis-1:1',
        checkId: 'page-numbers',
        ruleId: null,
        category: 'format',
        severity: 'error',
        summary: 'Provjeri numeriranje stranica',
        fixable: false,
        fixerId: null,
        status: 'OPEN',
      });
      expect(JSON.stringify(body)).not.toContain('PRIVATE DETAIL');
      expect(JSON.stringify(body)).not.toContain('pageHint');
      expect(init?.headers).toMatchObject({
        'content-type': 'application/json',
        'x-completion-handoff': 't'.repeat(43),
      });
      return new Response(JSON.stringify({ ok: true, checkId: 'check-row-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const source = result();
    const outcome = await persistCompletionCheck(source, 't'.repeat(43), fetchMock as typeof fetch);

    expect(outcome).toEqual({ ok: true, checkId: 'check-row-1' });
    expect(wasCompletionCheckPersisted(source)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed before the network for an invalid capability token', async () => {
    const fetchMock = vi.fn();
    const outcome = await persistCompletionCheck(result(), 'short', fetchMock as typeof fetch);

    expect(outcome).toEqual({ ok: false, reason: 'invalid-handoff' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not mark a failed network handoff as persisted', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ ok: false, reason: 'invalid-handoff' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    ));
    const source = result();

    const outcome = await persistCompletionCheck(source, 'u'.repeat(43), fetchMock as typeof fetch);

    expect(outcome).toEqual({ ok: false, reason: 'invalid-handoff' });
    expect(wasCompletionCheckPersisted(source)).toBe(false);
  });
});
