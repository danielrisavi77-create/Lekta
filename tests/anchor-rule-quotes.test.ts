import { describe, expect, it } from 'vitest';
import type { ThesisProfile, RuleEntry, SourceEntry } from '../src/profiles/profile-schema';
import { anchorRuleQuotes, validateQuoteAnchorPlan } from '../src/verification/anchor-rule-quotes';
import { validateProfiles } from '../src/profiles/profile-validator';

const HASH = 'a'.repeat(64);
const SOURCE: SourceEntry = { id: 'source-a', kind: 'guidelines', title: 'Source A', url: 'https://example.test/a', snapshotPath: 'a.txt', snapshotHash: HASH };
const RULE: RuleEntry = {
  ruleId: 'rule-a', checkId: 'paper-size', value: 'A4', modality: 'obligation', scope: 'whole',
  sourceId: SOURCE.id, sourcePage: 'page 2', quote: 'Velicine je stranice A4',
  status: 'verified', scored: true,
};
const profile = (entry: RuleEntry = RULE) => ({ id: 'profile-a', ruleEntries: [entry] } as ThesisProfile);
const sources = { [SOURCE.id]: SOURCE };
const snapshots = { [SOURCE.id]: { text: 'Pravila: Veličine je stranice A4. Kraj.', sha256: HASH } };
const NOW = '2026-09-27T10:00:00.000Z';

describe('anchorRuleQuotes', () => {
  it('sidri jedinstveni ASCII citat na doslovni odsječak i zapisuje ledger bez promjene vrijednosti', () => {
    const before = profile();
    const result = anchorRuleQuotes(before, sources, snapshots, NOW);
    expect(result.decisions).toEqual([{ ruleId: 'rule-a', code: 'anchored' }]);
    expect(result.profile.ruleEntries?.[0]).toMatchObject({ quote: 'Veličine je stranice A4', value: 'A4', modality: 'obligation', scope: 'whole', sourcePage: 'page 2', status: 'verified', scored: true });
    expect(result.ledger).toMatchObject([{ action: 'quote-anchored', oldQuote: 'Velicine je stranice A4', newQuote: 'Veličine je stranice A4', sourceId: 'source-a', snapshotHash: HASH }]);
    expect(validateQuoteAnchorPlan(before, result, sources, snapshots)).toEqual([]);
  });

  it('ljudski verified zadrzava status, bodovanje i fixer uz ASCII sidrenje', () => {
    const before = profile({ ...RULE, autoFixable: true, fixerId: 'paper-size-fixer',
      confirmedVia: 'human', verifiedBy: 'human-reviewer', reviewedBy: 'human-reviewer' });
    const first = anchorRuleQuotes(before, sources, snapshots, NOW);
    expect(first.profile.ruleEntries?.[0]).toMatchObject({
      quote: 'Veličine je stranice A4', status: 'verified', scored: true,
      autoFixable: true, fixerId: 'paper-size-fixer', confirmedVia: 'human',
      verifiedBy: 'human-reviewer', reviewedBy: 'human-reviewer',
    });
    expect(validateProfiles([first.profile])).toEqual([]);
    expect(validateQuoteAnchorPlan(before, first, sources, snapshots)).toEqual([]);
    const second = anchorRuleQuotes(first.profile, sources, snapshots, NOW);
    expect(second.profile).toEqual(first.profile);
    expect(second.ledger).toEqual([]);
  });

  it('CRLF i LF snimke daju isti LF citat, a drugi prolaz je no-op', () => {
    const before = profile({ ...RULE, quote: 'Velicine je stranice A4' });
    const crlf = { [SOURCE.id]: { text: 'Uvod. Veličine je\r\nstranice A4. Kraj.', sha256: HASH } };
    const cr = { [SOURCE.id]: { text: 'Uvod. Veličine je\rstranice A4. Kraj.', sha256: HASH } };
    const lf = { [SOURCE.id]: { text: 'Uvod. Veličine je\nstranice A4. Kraj.', sha256: HASH } };
    const fromCrLf = anchorRuleQuotes(before, sources, crlf, NOW);
    const fromCr = anchorRuleQuotes(before, sources, cr, NOW);
    const fromLf = anchorRuleQuotes(before, sources, lf, NOW);
    expect(fromCrLf.profile.ruleEntries?.[0].quote).toBe('Veličine je\nstranice A4');
    expect(fromCrLf.profile.ruleEntries?.[0].quote).toBe(fromLf.profile.ruleEntries?.[0].quote);
    expect(fromCr.profile.ruleEntries?.[0].quote).toBe(fromLf.profile.ruleEntries?.[0].quote);
    expect(fromCrLf.ledger[0].newQuote).toBe(fromLf.ledger[0].newQuote);
    expect(validateQuoteAnchorPlan(before, fromCrLf, sources, crlf)).toEqual([]);
    expect(validateQuoteAnchorPlan(before, fromCr, sources, cr)).toEqual([]);
    expect(validateQuoteAnchorPlan(before, fromLf, sources, lf)).toEqual([]);
    const second = anchorRuleQuotes(fromCrLf.profile, sources, crlf, NOW);
    expect(second.profile).toEqual(fromCrLf.profile);
    expect(second.ledger).toEqual([]);
    expect(second.decisions).toEqual([{ ruleId: 'rule-a', code: 'already-literal' }]);
  });

  it('AI dokaz se invalidira zajedno s potvrdom i autoFixable, uz ledger trag', () => {
    const before = profile({ ...RULE, autoFixable: true, fixerId: 'paper-size-fixer',
      confirmedVia: 'ai-evidence-audit', aiEvidence: { schemaVersion: 1 } as RuleEntry['aiEvidence'],
      aiEvidenceApprovedCanonical: 'old-evidence' });
    const result = anchorRuleQuotes(before, sources, snapshots, NOW);
    expect(result.profile.ruleEntries?.[0]).toMatchObject({
      status: 'needs-recheck', scored: false, autoFixable: false, aiEvidence: null,
      confirmedVia: null,
    });
    expect(result.profile.ruleEntries?.[0].aiEvidenceApprovedCanonical).toBeUndefined();
    expect(result.ledger[0].note).toContain('AI');
    expect(validateProfiles([result.profile])).toEqual([]);
    expect(validateQuoteAnchorPlan(before, result, sources, snapshots)).toEqual([]);
    expect(anchorRuleQuotes(result.profile, sources, snapshots, NOW).ledger).toEqual([]);
  });

  it.each(['draft', 'needs-recheck'] as const)('%s pravilo gubi autoFixable nakon sidrenja', (status) => {
    const before = profile({ ...RULE, status, scored: false, autoFixable: true,
      fixerId: 'paper-size-fixer' });
    const result = anchorRuleQuotes(before, sources, snapshots, NOW);
    expect(result.profile.ruleEntries?.[0]).toMatchObject({ status: 'needs-recheck',
      scored: false, autoFixable: false });
    expect(validateProfiles([result.profile])).toEqual([]);
    expect(validateQuoteAnchorPlan(before, result, sources, snapshots)).toEqual([]);
  });

  it('dvoprolazna idempotencija: drugi prolaz nema promjenu ni novi ledger događaj', () => {
    const first = anchorRuleQuotes(profile(), sources, snapshots, NOW);
    const second = anchorRuleQuotes(first.profile, sources, snapshots, NOW);
    expect(second.profile).toEqual(first.profile);
    expect(second.ledger).toEqual([]);
    expect(second.decisions).toEqual([{ ruleId: 'rule-a', code: 'already-literal' }]);
  });

  it('dvije normalizirane pojave ne daju proizvoljno sidro', () => {
    const snapshot = { [SOURCE.id]: { text: 'Veličine je stranice A4. Veličine je stranice A4.', sha256: HASH } };
    const result = anchorRuleQuotes(profile(), sources, snapshot, NOW);
    expect(result.decisions).toEqual([{ ruleId: 'rule-a', code: 'ambiguous' }]);
    expect(result.profile.ruleEntries?.[0]).toEqual(RULE);
    expect(result.ledger).toEqual([]);
  });

  it('ne sidri citat na drugom izvoru ili nepouzdanoj snimci', () => {
    const wrongSource = anchorRuleQuotes(profile(), sources, { other: snapshots[SOURCE.id] }, NOW);
    expect(wrongSource.decisions).toEqual([{ ruleId: 'rule-a', code: 'source-unavailable' }]);
    expect(wrongSource.profile.ruleEntries?.[0]).toEqual(RULE);
    const wrongHash = anchorRuleQuotes(profile(), sources, { [SOURCE.id]: { ...snapshots[SOURCE.id], sha256: 'b'.repeat(64) } }, NOW);
    expect(wrongHash.decisions).toEqual([{ ruleId: 'rule-a', code: 'source-unavailable' }]);
  });

  it('ujednačava navodnike, crtice i razmake samo pri traženju, a vraća izvorni odsječak', () => {
    const entry = { ...RULE, quote: '"Velicine — stranice A4"' };
    const snapshot = { [SOURCE.id]: { text: 'Izvor: „Veličine - stranice   A4” ovdje.', sha256: HASH } };
    const result = anchorRuleQuotes(profile(entry), sources, snapshot, NOW);
    expect(result.profile.ruleEntries?.[0].quote).toBe('„Veličine - stranice   A4”');
    expect(result.ledger[0].oldQuote).toBe(entry.quote);
    expect(validateQuoteAnchorPlan(profile(entry), result, sources, snapshot)).toEqual([]);
  });

  it('nepostojeći citat ostavlja nepromijenjenim s kodiranim razlogom', () => {
    const result = anchorRuleQuotes(profile({ ...RULE, quote: 'Nema ovog citata' }), sources, snapshots, NOW);
    expect(result.decisions).toEqual([{ ruleId: 'rule-a', code: 'not-found' }]);
    expect(result.ledger).toEqual([]);
  });

  it('nakon sidrenja uklanja stari AI dokaz koji bi mogao ponovno proći normalizaciju razmaka', () => {
    const oldEvidence = { schemaVersion: 1, quote: 'Velicine je stranice A4' } as RuleEntry['aiEvidence'];
    const before = profile({ ...RULE, aiEvidence: oldEvidence });
    const result = anchorRuleQuotes(before, sources, snapshots, NOW);
    expect(result.profile.ruleEntries?.[0].aiEvidence).toBeNull();
    expect(validateQuoteAnchorPlan(before, result, sources, snapshots)).toEqual([]);
  });

  it('astralni znak ispred citata ne pomiče doslovni odsječak', () => {
    const snapshot = { [SOURCE.id]: { text: '📄 Veličine je stranice A4.', sha256: HASH } };
    const result = anchorRuleQuotes(profile(), sources, snapshot, NOW);
    expect(result.profile.ruleEntries?.[0].quote).toBe('Veličine je stranice A4');
    expect(validateQuoteAnchorPlan(profile(), result, sources, snapshot)).toEqual([]);
  });

  it('astralni znak unutar citata zadržava točne granice odsječka', () => {
    const before = profile({ ...RULE, quote: 'Velicine 📄 stranice A4' });
    const snapshot = { [SOURCE.id]: { text: 'Izvor: Veličine 📄 stranice A4. Kraj.', sha256: HASH } };
    const result = anchorRuleQuotes(before, sources, snapshot, NOW);
    expect(result.profile.ruleEntries?.[0].quote).toBe('Veličine 📄 stranice A4');
    expect(validateQuoteAnchorPlan(before, result, sources, snapshot)).toEqual([]);
  });

  it.each(['retired', 'advisory'] as const)('ne sidri pravilo u statusu %s', (status) => {
    const before = profile({ ...RULE, status, scored: false });
    const result = anchorRuleQuotes(before, sources, snapshots, NOW);
    expect(result.decisions).toEqual([{ ruleId: 'rule-a', code: 'status-ineligible' }]);
    expect(result.profile.ruleEntries?.[0]).toEqual(before.ruleEntries?.[0]);
    expect(result.ledger).toEqual([]);
  });

  it.each([
    ['superscript', 'povrsina 25 m2', 'povrsina 2⁵ m²'],
    ['ligature', 'fino', 'ﬁno'],
    ['ellipsis', 'itd...', 'itd…'],
  ])('NFKD kompatibilnost %s ne smije glumiti dijakritičko sidro', (_label, quote, text) => {
    const before = profile({ ...RULE, quote });
    const result = anchorRuleQuotes(before, sources, { [SOURCE.id]: { text, sha256: HASH } }, NOW);
    expect(result.decisions).toEqual([{ ruleId: 'rule-a', code: 'not-found' }]);
    expect(result.profile.ruleEntries?.[0]).toEqual(before.ruleEntries?.[0]);
    expect(result.ledger).toEqual([]);
  });
});
