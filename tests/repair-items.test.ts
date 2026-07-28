import { describe, it, expect } from 'vitest';
import { buildRepairableItems, type AnalyzedCheck } from '../src/ui/repair-items';
import type { RuleEntry } from '../src/profiles/profile-schema';

// Regresijska mreza za buildRepairableItems: PRVO dokazuje postojece ponasanje za obavezne
// (autoFixable+verified) stavke, PA tek onda pokriva novi "preporuceno" (advisory+recommended)
// put dodan uz njega. Isti disciplina kao golden testovi za parser (CLAUDE.md).

const requiredEntry = (over: Partial<RuleEntry> = {}): RuleEntry =>
  ({
    ruleId: 'p1--font', checkId: 'font', value: ['Times New Roman'],
    status: 'verified', autoFixable: true, fixerId: 'font-fixer',
    label: 'Font', ...over,
  }) as RuleEntry;

const recommendedEntry = (over: Partial<RuleEntry> = {}): RuleEntry =>
  ({
    ruleId: 'p1--font', checkId: 'font', value: ['Times New Roman'],
    status: 'advisory', recommended: true, fixerId: 'font-fixer',
    label: 'Font', ...over,
  }) as RuleEntry;

const profile = { font: ['Times New Roman'], size: [12] };

describe('buildRepairableItems: obavezne (autoFixable+verified) stavke, postojece ponasanje', () => {
  it('prekrsena obavezna stavka se vraca s violated:true, opt-out (default checked)', () => {
    const checks: AnalyzedCheck[] = [{ title: 'Dominantni font', status: 'fail', max: 8 }];
    const items = buildRepairableItems(checks, profile, [requiredEntry()]);
    expect(items).toHaveLength(1);
    expect(items[0].violated).toBe(true);
    expect(items[0].recommended).toBeUndefined();
  });

  it('neprekrsena obavezna stavka se BEZ includeNonViolated preskace (Opcija A, besplatni teaser)', () => {
    const checks: AnalyzedCheck[] = [{ title: 'Dominantni font', status: 'pass', max: 8 }];
    const items = buildRepairableItems(checks, profile, [requiredEntry()]);
    expect(items).toHaveLength(0);
  });

  it('neprekrsena obavezna stavka SE VRACA uz includeNonViolated:true (Feature B)', () => {
    const checks: AnalyzedCheck[] = [{ title: 'Dominantni font', status: 'pass', max: 8 }];
    const items = buildRepairableItems(checks, profile, [requiredEntry()], { includeNonViolated: true });
    expect(items).toHaveLength(1);
    expect(items[0].violated).toBe(false);
  });

  it('bez ciljane vrijednosti u profilu (paramsForCheck vraca null) stavka se ne nudi', () => {
    const checks: AnalyzedCheck[] = [{ title: 'Dominantni font', status: 'fail', max: 8 }];
    const items = buildRepairableItems(checks, { size: [12] }, [requiredEntry()]);
    expect(items).toHaveLength(0);
  });

  it('advisory status BEZ recommended:true se i dalje ignorira (stari filter netaknut)', () => {
    const checks: AnalyzedCheck[] = [{ title: 'Dominantni font', status: 'fail', max: 0 }];
    const items = buildRepairableItems(checks, profile, [
      { ruleId: 'p1--font', checkId: 'font', value: ['Times New Roman'], status: 'advisory', fixerId: 'font-fixer', label: 'Font' } as RuleEntry,
    ]);
    expect(items).toHaveLength(0);
  });
});

describe('buildRepairableItems: preporucene (advisory+recommended) stavke, novo ponasanje', () => {
  it('preporucena stavka se vraca s recommended:true i violated:false, BEZ includeNonViolated', () => {
    const checks: AnalyzedCheck[] = [];
    const items = buildRepairableItems(checks, profile, [recommendedEntry()]);
    expect(items).toHaveLength(1);
    expect(items[0].recommended).toBe(true);
    expect(items[0].violated).toBe(false);
  });

  it('preporucena stavka se vraca i uz includeNonViolated:true (isti ishod, ne ovisi o opciji)', () => {
    const checks: AnalyzedCheck[] = [];
    const items = buildRepairableItems(checks, profile, [recommendedEntry()], { includeNonViolated: true });
    expect(items).toHaveLength(1);
    expect(items[0].recommended).toBe(true);
  });

  it('preporucena stavka NE cita profil nego SVOJU value (paramsFromValue, ne paramsForCheck)', () => {
    // profil namjerno bez font/size polja: preporucena stavka svejedno prolazi jer koristi entry.value.
    const items = buildRepairableItems([], { unrelated: true }, [recommendedEntry()]);
    expect(items).toHaveLength(1);
    expect(items[0].params).toEqual({ fontName: 'Times New Roman' });
  });

  it('preporucena stavka bez ciljane vrijednosti u SAMOM zapisu (value) se ne nudi', () => {
    const items = buildRepairableItems([], profile, [recommendedEntry({ value: null })]);
    expect(items).toHaveLength(0);
  });

  it('recommended:true bez status:advisory (npr. na verified zapisu) se ignorira', () => {
    const items = buildRepairableItems([], profile, [
      recommendedEntry({ status: 'verified' }),
    ]);
    expect(items).toHaveLength(0);
  });

  it('obavezne i preporucene stavke koegzistiraju u istom pozivu', () => {
    const checks: AnalyzedCheck[] = [{ title: 'Veličina osnovnog teksta', status: 'fail', max: 6 }];
    const items = buildRepairableItems(
      checks,
      profile,
      [
        requiredEntry({ ruleId: 'p1--font-size', checkId: 'font-size', fixerId: 'font-fixer', label: 'Velicina' }),
        recommendedEntry(),
      ],
    );
    expect(items).toHaveLength(2);
    const required = items.find((i) => i.ruleId === 'p1--font-size');
    const recommended = items.find((i) => i.ruleId === 'p1--font');
    expect(required?.violated).toBe(true);
    expect(required?.recommended).toBeUndefined();
    expect(recommended?.recommended).toBe(true);
    expect(recommended?.violated).toBe(false);
  });
});
