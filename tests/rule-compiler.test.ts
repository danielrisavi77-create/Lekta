import { describe, it, expect } from 'vitest';
import { compileEffectiveRules, collectCompileDiagnostics } from '../src/profiles/rule-compiler';
import type { ThesisProfile } from '../src/profiles/profile-schema';

describe('rule-compiler faithfulness', () => {
  it('effectiveRules deep-equals rules kada nema ruleEntries', () => {
    const profile: ThesisProfile = {
      id: 'fpzg-politologija-diplomski',
      rules: {
        font: ['Times New Roman'],
        size: [12],
        spacing: 1.5,
        requireToc: true,
        requirePageNumbers: true,
      },
      ruleEntries: [],
    };
    expect(compileEffectiveRules(profile)).toEqual(profile.rules);
  });

  it('overlay-a prepoznati ruleEntry preko baseline rules', () => {
    const profile: ThesisProfile = {
      id: 'demo',
      rules: { font: ['Arial'], size: [11] },
      ruleEntries: [
        { ruleId: 'r-font', checkId: 'font', value: ['Times New Roman'] },
        { ruleId: 'r-words', checkId: 'word-count', value: { min: 10000, max: 12000 } },
      ],
    };
    expect(compileEffectiveRules(profile)).toEqual({
      font: ['Times New Roman'],
      size: [11],
      wordMin: 10000,
      wordMax: 12000,
    });
  });

  it('prijavljuje diagnostic za nepoznat checkId i ne mijenja rules', () => {
    const profile: ThesisProfile = {
      id: 'demo',
      rules: { font: ['Arial'] },
      ruleEntries: [{ ruleId: 'r-x', checkId: 'nepoznato', value: 42 }],
    };
    const diagnostics = collectCompileDiagnostics([profile]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe('r-x');
    expect(compileEffectiveRules(profile)).toEqual({ font: ['Arial'] });
  });
});
