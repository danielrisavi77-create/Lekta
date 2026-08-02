import { describe, it, expect } from 'vitest';
import { buildRepairableItems, pageNumberingRepairableItem, pickTargetItem, type AnalyzedCheck } from '../src/ui/repair-items';
import type { RuleEntry } from '../src/profiles/profile-schema';
import type { RepairableItem } from '../src/ui/repair-panel';

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

  it('bez ciljane vrijednosti u profilu, ali s vrijednoscu u samom pravilu, stavka SE NUDI (paramsFromValue fallback)', () => {
    // Legacy profile.rules mirror nije odrzan (nema profile.font), ali ruleEntry.value JEST
    // verificirana vrijednost - popravak ju mora koristiti, ne tiho preskociti pravilo.
    const checks: AnalyzedCheck[] = [{ title: 'Dominantni font', status: 'fail', max: 8 }];
    const items = buildRepairableItems(checks, { size: [12] }, [requiredEntry()]);
    expect(items).toHaveLength(1);
    expect(items[0].params).toEqual({ fontName: 'Times New Roman' });
  });

  it('bez ciljane vrijednosti ni u profilu ni u samom pravilu (checkId koji paramsFromValue ne pokriva) stavka se ne nudi', () => {
    const checks: AnalyzedCheck[] = [{ title: 'Dominantni font', status: 'fail', max: 8 }];
    const items = buildRepairableItems(checks, { size: [12] }, [requiredEntry({ checkId: 'toc', value: null })]);
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

  it('svaka stavka nosi matchKeys izveden iz naslova checka (RESULT-03 korelacija)', () => {
    const checks: AnalyzedCheck[] = [{ title: 'Dominantni font', status: 'fail', max: 8 }];
    const items = buildRepairableItems(checks, profile, [requiredEntry()]);
    expect(items[0].matchKeys).toEqual(['Dominantni font']);
  });
});

// RESULT-03 (audit 23.7., live-testirano 28.7. protiv fer-diplomski-prazni-odlomci.docx): klik na
// "Otvori mogucnost popravka" na kartici konkretnog nalaza otvarao je opceniti "Popravi sve"
// panel bez IKAKVE veze s kliknutim nalazom (stavka bez veze bila jedina oznacena). pickTargetItem
// je jezgra popravka: nalaz -> matchKeys -> tocno ona repair-items stavka koja ga popravlja.
describe('pickTargetItem (RESULT-03)', () => {
  const fakeItem = (over: Partial<RepairableItem> = {}): RepairableItem => ({
    ruleId: 'x', fixerId: 'font-fixer', label: 'X', params: {}, ...over,
  });

  it('nalazi stavku ciji matchKeys sadrzi bar jedan trazeni kljuc', () => {
    const items = [
      fakeItem({ ruleId: 'margins-universal', matchKeys: ['Margine dokumenta'] }),
      fakeItem({ ruleId: 'page-numbering-universal', matchKeys: ['Numeriranje od prve stranice Uvoda', 'Shema numeriranja stranica'] }),
    ];
    const target = pickTargetItem(['Provjeri rimsku i arapsku numeraciju', 'Shema numeriranja stranica'], items);
    expect(target?.ruleId).toBe('page-numbering-universal');
  });

  it('vraca undefined kad nijedna stavka ne odgovara (dokument nema upotrebljiv split)', () => {
    const items = [fakeItem({ ruleId: 'margins-universal', matchKeys: ['Margine dokumenta'] })];
    expect(pickTargetItem(['Shema numeriranja stranica'], items)).toBeUndefined();
  });

  it('vraca undefined kad nalaz nema matchKeys (prazno ili izostavljeno)', () => {
    const items = [fakeItem({ ruleId: 'margins-universal', matchKeys: ['Margine dokumenta'] })];
    expect(pickTargetItem([], items)).toBeUndefined();
    expect(pickTargetItem(undefined, items)).toBeUndefined();
  });

  it('ne pogadja stavku bez matchKeys (npr. tocFieldItem, ponudjena neovisno o pojedinacnom nalazu)', () => {
    const items = [fakeItem({ ruleId: 'toc-field-universal' })]; // bez matchKeys, namjerno
    expect(pickTargetItem(['Sadržaj dokumenta'], items)).toBeUndefined();
  });

  it('integracija: pageNumberingRepairableItem stvarno proizvodi stavku koju pickTargetItem nalazi za nalaz "Provjeri rimsku i arapsku numeraciju"', () => {
    const result = {
      details: { sections: [{ paragraphIndex: 9 }, { paragraphIndex: 10 }], introParagraphIndex: 10 },
      checks: [],
    };
    const items = pageNumberingRepairableItem(result, { checkPageNumberStartAtIntro: true });
    expect(items).toHaveLength(1);
    // finding.matchKeys u stvarnom toku (finding-view-model.ts) je [issue.title, check.title]:
    // issue.title ("Provjeri rimsku i arapsku numeraciju") nikad nije sam po sebi checkov
    // naslov, poklapanje ide preko uparenog checka ("Shema numeriranja stranica").
    const target = pickTargetItem(['Provjeri rimsku i arapsku numeraciju', 'Shema numeriranja stranica'], items);
    expect(target?.ruleId).toBe('page-numbering-universal');
  });
});
