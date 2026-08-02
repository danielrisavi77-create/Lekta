import { describe, expect, it } from 'vitest';
import { parseKatedraEntryContext } from '../src/integration/katedra-entry';

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
});
