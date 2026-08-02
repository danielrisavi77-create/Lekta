import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearKatedraProjectId,
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
    expect(parseKatedraEntryContext('?project=abc&unit=fpzg&program=politologija&profile=fpzg-diplomski&ruleset=r1&workType=graduate')).toEqual({
      projectId: 'abc',
      unitId: 'fpzg',
      programId: 'politologija',
      profileId: 'fpzg-diplomski',
      rulesetId: 'r1',
      workType: 'graduate',
    });
  });

  it('does not invent an unknown work type', () => {
    expect(parseKatedraEntryContext('?unit=fpzg&work=magical').workType).toBeUndefined();
  });

  it('clears both project and previous handoff result on direct-session reset', () => {
    rememberKatedraProjectId('project-a');
    sessionStorage.setItem('lekta.katedra-handoff-result.v0.1', '{"analysisId":"old"}');

    clearKatedraProjectId();

    expect(currentKatedraProjectId()).toBeUndefined();
    expect(sessionStorage.getItem('lekta.katedra-handoff-result.v0.1')).toBeNull();
  });

  it('drops a captured result when switching to a different Katedra project', () => {
    rememberKatedraProjectId('project-a');
    sessionStorage.setItem('lekta.katedra-handoff-result.v0.1', '{"analysisId":"old"}');

    rememberKatedraProjectId('project-b');

    expect(currentKatedraProjectId()).toBe('project-b');
    expect(sessionStorage.getItem('lekta.katedra-handoff-result.v0.1')).toBeNull();
  });
});
