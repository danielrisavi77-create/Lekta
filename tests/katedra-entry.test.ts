import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyKatedraEntryContext,
  clearKatedraProjectId,
  currentCompletionHandoffToken,
  currentKatedraProjectId,
  parseKatedraEntryContext,
  rememberKatedraProjectId,
} from '../src/integration/katedra-entry';

beforeEach(() => {
  sessionStorage.clear();
});

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
