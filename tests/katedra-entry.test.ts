import { beforeEach, describe, expect, it } from 'vitest';
import { GOOGLE_PKCE_STORAGE_KEY, PKCE_MAX_AGE_MS } from '../src/auth/google-callback';
import { safeStorageSet } from '../src/shared/browser-storage';
import {
  applyKatedraEntryContext,
  bootstrapKatedraEntryContext,
  clearKatedraProjectId,
  currentCompletionHandoffToken,
  currentKatedraProjectId,
  parseKatedraEntryContext,
  rememberKatedraProjectId,
} from '../src/integration/katedra-entry';

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/rad/');
  safeStorageSet(GOOGLE_PKCE_STORAGE_KEY, null);
});

function seedKatedraState(): { token: string; result: string } {
  const token = 'h'.repeat(43);
  const result = '{"analysisId":"analysis-a"}';
  applyKatedraEntryContext({ projectId: 'project-a', handoffToken: token });
  sessionStorage.setItem('lekta.katedra-handoff-result.v0.1', result);
  return { token, result };
}

function setPendingGooglePkce(createdAt = Date.now()): void {
  safeStorageSet(GOOGLE_PKCE_STORAGE_KEY, { verifier: 'v'.repeat(43), createdAt });
}

function expectKatedraStateCleared(): void {
  expect(currentKatedraProjectId()).toBeUndefined();
  expect(currentCompletionHandoffToken()).toBeUndefined();
  expect(sessionStorage.getItem('lekta.katedra-handoff-result.v0.1')).toBeNull();
}

describe('Katedra -> Lekta entry context', () => {
  it('maps current Katedra Croatian work slugs to canonical work types', () => {
    expect(parseKatedraEntryContext('?project=p1&unit=fpzg&work=seminarski')).toMatchObject({
      projectId: 'p1', unitId: 'fpzg', workType: 'seminar',
    });
    expect(parseKatedraEntryContext('?work=zavrsni').workType).toBe('final');
    expect(parseKatedraEntryContext('?work=diplomski').workType).toBe('graduate');
  });

  it('accepts canonical workType and optional shared routing fields', () => {
    expect(parseKatedraEntryContext('?project=abc&unit=fpzg&program=politologija&profile=fpzg-diplomski&ruleset=r1&workType=graduate')).toMatchObject({
      projectId: 'abc',
      unitId: 'fpzg',
      programId: 'politologija',
      profileId: 'fpzg-diplomski',
      rulesetId: 'r1',
      workType: 'graduate',
    });
  });

  it('reads the opaque Completion capability only from the URL fragment', () => {
    const token = 'a'.repeat(43);
    const parsed = parseKatedraEntryContext(
      '?project=abc&unit=fpzg&workType=graduate',
      `#handoff=${token}`,
    );

    expect(parsed.handoffToken).toBe(token);
    expect(parseKatedraEntryContext('?project=abc&handoff=query-token').handoffToken).toBeUndefined();
    expect(parseKatedraEntryContext('?project=abc', '#handoff=too-short').handoffToken).toBeUndefined();
  });

  it('binds a remembered Completion token to the same project session', () => {
    const token = 'b'.repeat(43);
    applyKatedraEntryContext({ projectId: 'project-a', handoffToken: token });
    expect(currentCompletionHandoffToken()).toBe(token);

    rememberKatedraProjectId('project-b');
    expect(currentCompletionHandoffToken()).toBeUndefined();
  });

  it('does not invent an unknown work type', () => {
    expect(parseKatedraEntryContext('?unit=fpzg&work=magical').workType).toBeUndefined();
  });

  it('clears project, handoff capability and previous handoff result on direct-session reset', () => {
    const token = 'c'.repeat(43);
    applyKatedraEntryContext({ projectId: 'project-a', handoffToken: token });
    sessionStorage.setItem('lekta.katedra-handoff-result.v0.1', '{"analysisId":"old"}');

    clearKatedraProjectId();

    expect(currentKatedraProjectId()).toBeUndefined();
    expect(currentCompletionHandoffToken()).toBeUndefined();
    expect(sessionStorage.getItem('lekta.katedra-handoff-result.v0.1')).toBeNull();
    expect(sessionStorage.getItem('lekta.completion-handoff.v0.1')).toBeNull();
  });

  it.each([
    ['authorization code', '/rad/?code=oauth-code'],
    ['provider error query', '/rad/?error=access_denied'],
    ['provider error fragment', '/rad/#error=access_denied'],
  ])('preserves the current handoff on a verifier-backed OAuth %s callback', (_kind, href) => {
    const state = seedKatedraState();
    setPendingGooglePkce();
    window.history.replaceState(null, '', href);
    bootstrapKatedraEntryContext();
    expect(currentKatedraProjectId()).toBe('project-a');
    expect(currentCompletionHandoffToken()).toBe(state.token);
    expect(sessionStorage.getItem('lekta.katedra-handoff-result.v0.1')).toBe(state.result);
  });

  it('clears stale Katedra handoff for an OAuth-looking URL without a verifier', () => {
    seedKatedraState();
    window.history.replaceState(null, '', '/rad/?code=unverified');
    bootstrapKatedraEntryContext();
    expectKatedraStateCleared();
  });

  it('still clears a direct visit when a verifier exists without a callback', () => {
    seedKatedraState();
    setPendingGooglePkce();
    bootstrapKatedraEntryContext();
    expectKatedraStateCleared();
  });

  it('clears stale Katedra handoff for a callback with an expired verifier', () => {
    seedKatedraState();
    setPendingGooglePkce(Date.now() - PKCE_MAX_AGE_MS - 1);
    window.history.replaceState(null, '', '/rad/?code=expired');
    bootstrapKatedraEntryContext();
    expectKatedraStateCleared();
  });

  it('drops a captured result and capability when switching to a different project', () => {
    const token = 'd'.repeat(43);
    applyKatedraEntryContext({ projectId: 'project-a', handoffToken: token });
    sessionStorage.setItem('lekta.katedra-handoff-result.v0.1', '{"analysisId":"old"}');

    rememberKatedraProjectId('project-b');

    expect(currentKatedraProjectId()).toBe('project-b');
    expect(currentCompletionHandoffToken()).toBeUndefined();
    expect(sessionStorage.getItem('lekta.katedra-handoff-result.v0.1')).toBeNull();
  });
});
