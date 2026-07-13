import { describe, it, expect } from 'vitest';
import { paramsForCheck, buildRepairableItems, universalRepairableItems, type AnalyzedCheck } from './repair-items';
import type { RuleEntry } from '../profiles/profile-schema';
import type { Issue } from '../scoring/checks';

// Profil s ciljanim vrijednostima (kao currentProfile().p).
const PROFILE = {
  margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 3 },
  font: ['Times New Roman', 'Arial'],
  size: [12, 11],
  spacing: 1.5,
  justify: true,
  paperSizes: ['A4'],
};

function entry(over: Partial<RuleEntry>): RuleEntry {
  return { ruleId: 'r', checkId: 'margins', value: null, status: 'verified', autoFixable: true, fixerId: 'margins-fixer', ...over };
}

const FAIL = (title: string): AnalyzedCheck => ({ title, status: 'fail', max: 6 });
const PASS = (title: string): AnalyzedCheck => ({ title, status: 'pass', max: 6 });

describe('paramsForCheck (params dolaze IZ PROFILA)', () => {
  it('margins iz profila, ne hardkodirano', () => {
    expect(paramsForCheck('margins', PROFILE)).toEqual({ top: 2.5, right: 2.5, bottom: 2.5, left: 3 });
    // drugaciji profil -> drugaciji params (dokaz da nije fiksna vrijednost)
    expect(paramsForCheck('margins', { margins: { top: 2, right: 2, bottom: 2, left: 2 } })).toEqual({
      top: 2, right: 2, bottom: 2, left: 2,
    });
  });
  it('font i font-size uzimaju PRVU dopustenu vrijednost profila', () => {
    expect(paramsForCheck('font', PROFILE)).toEqual({ fontName: 'Times New Roman' });
    expect(paramsForCheck('font-size', PROFILE)).toEqual({ fontSizePt: 12 });
  });
  it('line-spacing iz profila', () => {
    expect(paramsForCheck('line-spacing', PROFILE)).toEqual({ multiplier: 1.5 });
    expect(paramsForCheck('line-spacing', { spacing: 2 })).toEqual({ multiplier: 2 });
  });
  it('justify -> both kad profil trazi poravnanje, left kad izrijekom ne, null kad ne propisuje', () => {
    expect(paramsForCheck('justify', PROFILE)).toEqual({ val: 'both' });
    expect(paramsForCheck('justify', { justify: false })).toEqual({ val: 'left' });
    // undefined = profil ne propisuje poravnanje -> ne nudi popravak (inace bi u
    // "uskladi sve" lijevo poravnao ispravan rad).
    expect(paramsForCheck('justify', {})).toBeNull();
  });
  it('paper-size iz imena u profilu (A4 -> 21x29.7)', () => {
    expect(paramsForCheck('paper-size', PROFILE)).toEqual({ w: 21, h: 29.7 });
    expect(paramsForCheck('paper-size', { requireA4: true })).toEqual({ w: 21, h: 29.7 });
    expect(paramsForCheck('paper-size', { paperSizes: ['A3'] })).toEqual({ w: 29.7, h: 42 });
  });
  it('null kad profil nema ciljanu vrijednost', () => {
    expect(paramsForCheck('margins', {})).toBeNull();
    expect(paramsForCheck('font', {})).toBeNull();
    expect(paramsForCheck('paper-size', {})).toBeNull();
  });
});

describe('buildRepairableItems (Opcija A: samo prekrseno)', () => {
  it('prazno kad nijedno pravilo nije autoFixable', () => {
    const entries = [entry({ autoFixable: false })];
    expect(buildRepairableItems([FAIL('Margine dokumenta')], PROFILE, entries)).toEqual([]);
  });

  it('ukljuci prekrseno autoFixable+verified pravilo, params iz profila', () => {
    const items = buildRepairableItems([FAIL('Margine dokumenta')], PROFILE, [entry({ ruleId: 'margine', label: 'Margine' })]);
    expect(items).toEqual([
      { ruleId: 'margine', fixerId: 'margins-fixer', label: 'Margine', params: { top: 2.5, right: 2.5, bottom: 2.5, left: 3 }, violated: true },
    ]);
  });

  it('NE nudi popravak kad dimenzija NIJE prekrsena (check je pass)', () => {
    const items = buildRepairableItems([PASS('Margine dokumenta')], PROFILE, [entry({})]);
    expect(items).toEqual([]);
  });

  it('NE nudi popravak za autoFixable pravilo koje nije status:verified', () => {
    const items = buildRepairableItems([FAIL('Margine dokumenta')], PROFILE, [entry({ status: 'draft' })]);
    expect(items).toEqual([]);
  });

  it('poravnanje (justify) je pokriveno preko postojeceg checka', () => {
    const items = buildRepairableItems(
      [FAIL('Poravnanje osnovnog teksta')],
      PROFILE,
      [entry({ ruleId: 'jc', checkId: 'justify', fixerId: 'alignment-fixer', label: 'Poravnanje' })],
    );
    expect(items).toEqual([{ ruleId: 'jc', fixerId: 'alignment-fixer', label: 'Poravnanje', params: { val: 'both' }, violated: true }]);
  });

  it('paper-size prepoznaje dinamican naslov ("Format stranice (A4/A3)")', () => {
    const items = buildRepairableItems(
      [{ title: 'Format stranice (A4/A3)', status: 'warn', max: 3 }],
      PROFILE,
      [entry({ ruleId: 'ps', checkId: 'paper-size', fixerId: 'paper-size-fixer', label: 'Format' })],
    );
    expect(items).toEqual([{ ruleId: 'ps', fixerId: 'paper-size-fixer', label: 'Format', params: { w: 21, h: 29.7 }, violated: true }]);
  });

  it('includeNonViolated (Feature B): vraca i neprekrsene s violated:false', () => {
    const items = buildRepairableItems(
      [PASS('Margine dokumenta'), FAIL('Dominantni font')],
      PROFILE,
      [
        entry({ ruleId: 'margine', label: 'Margine' }),
        entry({ ruleId: 'font', checkId: 'font', fixerId: 'font-fixer', label: 'Font' }),
      ],
      { includeNonViolated: true },
    );
    expect(items).toEqual([
      { ruleId: 'margine', fixerId: 'margins-fixer', label: 'Margine', params: { top: 2.5, right: 2.5, bottom: 2.5, left: 3 }, violated: false },
      { ruleId: 'font', fixerId: 'font-fixer', label: 'Font', params: { fontName: 'Times New Roman' }, violated: true },
    ]);
  });

  it('bez includeNonViolated neprekrsene i dalje ispadaju (teaser ostaje Opcija A)', () => {
    const items = buildRepairableItems([PASS('Margine dokumenta')], PROFILE, [entry({})]);
    expect(items).toEqual([]);
  });
});

const EMPTY_PARAGRAPHS_ISSUE: Issue = {
  severity: 'info',
  category: 'elements',
  title: 'Dokument sadrži mnogo praznih odlomaka',
  detail: 'Za razmake koristi postavke odlomka umjesto višestrukog pritiskanja tipke Enter.',
  where: '',
};

describe('universalRepairableItems (higijena dokumenta, bez ruleEntry gate-a)', () => {
  it('violated:true kad issues sadrzi tocan "Prazni odlomci" nalaz', () => {
    const items = universalRepairableItems([EMPTY_PARAGRAPHS_ISSUE]);
    expect(items).toEqual([
      { ruleId: 'empty-paragraphs-universal', fixerId: 'empty-paragraph-fixer', label: 'Prazni odlomci', params: {}, violated: true },
    ]);
  });

  it('violated:false kad issues nema taj nalaz (prazan niz)', () => {
    const items = universalRepairableItems([]);
    expect(items).toEqual([
      { ruleId: 'empty-paragraphs-universal', fixerId: 'empty-paragraph-fixer', label: 'Prazni odlomci', params: {}, violated: false },
    ]);
  });

  it('violated:false kad issues sadrzi samo nepovezane nalaze (druga kategorija ili naslov)', () => {
    const unrelated: Issue[] = [
      { severity: 'warning', category: 'citations', title: 'Mrežni izvori bez datuma pristupa', detail: '', where: '' },
      { severity: 'info', category: 'elements', title: 'Neki drugi naslov', detail: '', where: '' },
    ];
    const items = universalRepairableItems(unrelated);
    expect(items[0].violated).toBe(false);
  });

  it('uvijek vraca tocno jedan item ispravnog oblika', () => {
    const items = universalRepairableItems([EMPTY_PARAGRAPHS_ISSUE]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      ruleId: 'empty-paragraphs-universal',
      fixerId: 'empty-paragraph-fixer',
      label: 'Prazni odlomci',
      params: {},
    });
  });
});
