import { describe, expect, it } from 'vitest';
import { identifyFindings, stableCheckId } from '../src/integration/finding-identity';
import { issue, makeCheck } from '../src/scoring/checks';
import type { RuleEntry } from '../src/profiles/profile-schema';

const marginRule: RuleEntry = {
  ruleId: 'fpzg.margins.001',
  checkId: 'margins',
  value: { top: 2.5, right: 2.5, bottom: 2.5, left: 3 },
  status: 'verified',
  autoFixable: true,
  fixerId: 'margins-fixer',
};

describe('stable Lekta finding identity', () => {
  it('maps known human labels to canonical authored check ids', () => {
    expect(stableCheckId('formatting', 'Margine dokumenta')).toBe('margins');
    expect(stableCheckId('formatting', 'Dominantni font')).toBe('font');
    expect(stableCheckId('structure', 'Nepoznata nova provjera')).toBe('engine:structure:nepoznata-nova-provjera');
  });

  it('uses ruleId as the stable issue key and exposes verified AutoFix metadata', () => {
    const finding = issue('warning', 'formatting', 'Margine odstupaju od profila', 'Detalj', 'Postavke stranice');
    const check = makeCheck('formatting', 'Margine dokumenta', 'warn', 2, 6, 'odstupanje', finding);
    const out = identifyFindings([check], [finding], [marginRule]);

    expect(out).toHaveLength(1);
    expect(out[0].checkId).toBe('margins');
    expect(out[0].ruleId).toBe('fpzg.margins.001');
    expect(out[0].issueKey).toBe('rule:fpzg.margins.001');
    expect(out[0].fixable).toBe(true);
    expect(out[0].fixerId).toBe('margins-fixer');
  });

  it('does not churn a singleton rule-backed key when explanatory text changes', () => {
    const a = issue('warning', 'formatting', 'Margine odstupaju od profila', 'Prvi detalj', 'Postavke stranice');
    const b = issue('warning', 'formatting', 'Drukčije formuliran nalaz', 'Drugi detalj', 'Postavke stranice');
    const ca = makeCheck('formatting', 'Margine dokumenta', 'warn', 2, 6, 'x', a);
    const cb = makeCheck('formatting', 'Margine dokumenta', 'warn', 2, 6, 'y', b);

    expect(identifyFindings([ca], [a], [marginRule])[0].issueKey)
      .toBe(identifyFindings([cb], [b], [marginRule])[0].issueKey);
  });

  it('adds a location suffix only when one logical check has multiple occurrences', () => {
    const first = issue('warning', 'citations', 'Nedostaje citatnica', 'x', 'Odlomak 10');
    const second = issue('warning', 'citations', 'Nedostaje citatnica', 'y', 'Odlomak 20');
    const out = identifyFindings([], [first, second], []);

    expect(out[0].issueKey).not.toBe(out[1].issueKey);
    expect(out[0].issueKey.startsWith('check:engine:citations:nedostaje-citatnica:loc:')).toBe(true);
  });
});
