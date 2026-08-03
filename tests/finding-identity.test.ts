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

  it('links a detailed runtime check to its broader authored parent rule', () => {
    const finding = issue('warning', 'structure', 'Naslovi odstupaju', 'Detalj', 'Naslovi');
    const check = makeCheck('structure', 'Oblikovanje naslova po razinama', 'warn', 2, 4, 'x', finding);
    const headingRule: RuleEntry = {
      ruleId: 'fpzg.heading-rules.001',
      checkId: 'heading-rules',
      value: { levels: {} },
      status: 'verified',
    };
    const out = identifyFindings([check], [finding], [headingRule]);

    expect(out[0].checkId).toBe('heading-format');
    expect(out[0].ruleId).toBe('fpzg.heading-rules.001');
    expect(out[0].issueKey).toBe('rule:fpzg.heading-rules.001:check:heading-format');
  });

  it('uses stable child check ids when one authored rule has sibling runtime checks', () => {
    const startIssue = issue('warning', 'structure', 'Numeriranje počinje prerano', 'x', 'Stranice');
    const schemeIssue = issue('warning', 'structure', 'Shema numeriranja odstupa', 'y', 'Stranice');
    const startCheck = makeCheck('structure', 'Numeriranje od prve stranice Uvoda', 'warn', 1, 3, 'x', startIssue);
    const schemeCheck = makeCheck('structure', 'Shema numeriranja stranica', 'warn', 1, 3, 'y', schemeIssue);
    const pageRule: RuleEntry = {
      ruleId: 'fpzg.page-numbers.001',
      checkId: 'page-numbers',
      value: { required: true },
      status: 'verified',
    };
    const out = identifyFindings([startCheck, schemeCheck], [startIssue, schemeIssue], [pageRule]);

    expect(out.map(item => item.issueKey)).toEqual([
      'rule:fpzg.page-numbers.001:check:page-number-start',
      'rule:fpzg.page-numbers.001:check:page-number-scheme',
    ]);
  });

  it('keeps a child key identical whether or not sibling checks are present', () => {
    const startIssue = issue('warning', 'structure', 'Numeriranje počinje prerano', 'x', 'Stranice');
    const schemeIssue = issue('warning', 'structure', 'Shema numeriranja odstupa', 'y', 'Stranice');
    const startCheck = makeCheck('structure', 'Numeriranje od prve stranice Uvoda', 'warn', 1, 3, 'x', startIssue);
    const schemeCheck = makeCheck('structure', 'Shema numeriranja stranica', 'warn', 1, 3, 'y', schemeIssue);
    const pageRule: RuleEntry = {
      ruleId: 'fpzg.page-numbers.001', checkId: 'page-numbers', value: { required: true }, status: 'verified',
    };

    const alone = identifyFindings([startCheck], [startIssue], [pageRule])[0].issueKey;
    const withSibling = identifyFindings([startCheck, schemeCheck], [startIssue, schemeIssue], [pageRule])[0].issueKey;
    expect(alone).toBe('rule:fpzg.page-numbers.001:check:page-number-start');
    expect(withSibling).toBe(alone);
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