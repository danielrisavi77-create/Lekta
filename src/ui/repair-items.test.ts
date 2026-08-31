import { describe, it, expect } from 'vitest';
import {
  paramsForCheck,
  buildRepairableItems,
  universalRepairableItems,
  requiredSectionsRepairableItem,
  pickTargetItem,
  paragraphSpacingRepairableItem,
  footnoteSpacingRepairableItem,
  pageNumberAlignmentRepairableItem,
  introSectionItem,
  crossFileSubmissionRepairableItem,
  elementCaptionRepairableItem,
  asRecommendation,
  tableFigureRescueRepairableItem,
  type AnalyzedCheck,
} from './repair-items';
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
      { ruleId: 'margine', fixerId: 'margins-fixer', label: 'Margine', params: { top: 2.5, right: 2.5, bottom: 2.5, left: 3 }, violated: true, authority: 'faculty-rule', matchKeys: ['Margine dokumenta'] },
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
    expect(items).toEqual([{ ruleId: 'jc', fixerId: 'alignment-fixer', label: 'Poravnanje', params: { val: 'both' }, violated: true, authority: 'faculty-rule', matchKeys: ['Poravnanje osnovnog teksta'] }]);
  });

  it('paper-size prepoznaje dinamican naslov ("Format stranice (A4/A3)")', () => {
    const items = buildRepairableItems(
      [{ title: 'Format stranice (A4/A3)', status: 'warn', max: 3 }],
      PROFILE,
      [entry({ ruleId: 'ps', checkId: 'paper-size', fixerId: 'paper-size-fixer', label: 'Format' })],
    );
    expect(items).toEqual([{ ruleId: 'ps', fixerId: 'paper-size-fixer', label: 'Format', params: { w: 21, h: 29.7 }, violated: true, authority: 'faculty-rule' }]);
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
      { ruleId: 'margine', fixerId: 'margins-fixer', label: 'Margine', params: { top: 2.5, right: 2.5, bottom: 2.5, left: 3 }, violated: false, authority: 'faculty-rule', matchKeys: ['Margine dokumenta'] },
      { ruleId: 'font', fixerId: 'font-fixer', label: 'Font', params: { fontName: 'Times New Roman' }, violated: true, authority: 'faculty-rule', matchKeys: ['Dominantni font'] },
    ]);
  });

  it('bez includeNonViolated neprekrsene i dalje ispadaju (teaser ostaje Opcija A)', () => {
    const items = buildRepairableItems([PASS('Margine dokumenta')], PROFILE, [entry({})]);
    expect(items).toEqual([]);
  });
});

/**
 * Nalaz kakav zapise `issue()` u `src/scoring/evaluate/structure.ts`, PRIJE nego ga `makeCheck`
 * dotakne. Do 2026-08-29 je ovo bio JEDINI oblik koji je test provjeravao, pa je test prolazio
 * dok je produkcija bila mrtva: provjera "Prazni odlomci" je nebodovana (0/0), a `makeCheck` pri
 * `max === 0` naslov nalaza prepisuje u `Informativno: ...`. Usporedba po golom naslovu zato u
 * zivom toku nije pogadjala nikad, i `empty-paragraph-fixer` je bio ponudjen NULA puta na 116
 * stvarnih dokumenata. Ostaje kao ulaz, ali vise nije jedini.
 */
const EMPTY_PARAGRAPHS_ISSUE: Issue = {
  severity: 'info',
  category: 'elements',
  title: 'Dokument sadrži mnogo praznih odlomaka',
  detail: 'Za razmake koristi postavke odlomka umjesto višestrukog pritiskanja tipke Enter.',
  where: '',
};

/** Isti nalaz NAKON `makeCheck`, dakle oblik koji stavka doista dobije iz analize. */
const EMPTY_PARAGRAPHS_ISSUE_AS_DELIVERED: Issue = {
  ...EMPTY_PARAGRAPHS_ISSUE,
  title: `Informativno: ${EMPTY_PARAGRAPHS_ISSUE.title}`,
};

/**
 * Kljuc korelacije je SAMO naslov provjere.
 *
 * Nalaz nosi oba naslova (`[issue.title, check.title]`), pa `pickTargetItem` zatvara korelaciju i
 * bez naslova nalaza. Naslove nalaza `stableCheckId` ne prepoznaje, pa bi zavrsili u
 * `unmappedMatchKeys`: izmjereno 2026-08-30, dva takva kljuca na 14 od 54 rada, bez ikakve koristi.
 */
const EMPTY_PARAGRAPHS_MATCH_KEYS = ['Prazni odlomci'];

describe('universalRepairableItems (higijena dokumenta, bez ruleEntry gate-a)', () => {
  it('violated:true kad issues sadrzi goli "Prazni odlomci" nalaz', () => {
    const items = universalRepairableItems([EMPTY_PARAGRAPHS_ISSUE]);
    expect(items).toEqual([
      { ruleId: 'empty-paragraphs-universal', fixerId: 'empty-paragraph-fixer', label: 'Prazni odlomci', params: {}, violated: true, matchKeys: EMPTY_PARAGRAPHS_MATCH_KEYS },
    ]);
  });

  /**
   * KLJUCNA tvrdnja: nalaz kakav analiza DOISTA isporuci, s prefiksom koji dodaje `makeCheck`.
   * Bez nje je cijeli opis iznad prolazio na ulazu koji u proizvodu ne postoji.
   */
  it('violated:true i za isporuceni oblik s "Informativno: " prefiksom', () => {
    const items = universalRepairableItems([EMPTY_PARAGRAPHS_ISSUE_AS_DELIVERED]);
    expect(items[0].violated).toBe(true);
  });


  /**
   * Korelacija mora prezivjeti suzavanje kljuceva: nalaz nosi i naslov nalaza i naslov provjere,
   * pa `pickTargetItem` pogadja stavku preko naslova PROVJERE. Bez ove tvrdnje bi suzavanje
   * matchKeys tiho slomilo klik "Otvori mogucnost popravka" na kartici tog nalaza.
   */
  it('nalaz i dalje pogadja stavku preko naslova provjere', () => {
    const items = universalRepairableItems([EMPTY_PARAGRAPHS_ISSUE_AS_DELIVERED]);
    const findingKeys = [EMPTY_PARAGRAPHS_ISSUE_AS_DELIVERED.title, 'Prazni odlomci'];
    expect(pickTargetItem(findingKeys, items)?.fixerId).toBe('empty-paragraph-fixer');
  });

  it('violated:false kad issues nema taj nalaz (prazan niz)', () => {
    const items = universalRepairableItems([]);
    expect(items).toEqual([
      { ruleId: 'empty-paragraphs-universal', fixerId: 'empty-paragraph-fixer', label: 'Prazni odlomci', params: {}, violated: false, matchKeys: EMPTY_PARAGRAPHS_MATCH_KEYS },
    ]);
  });

  /**
   * Skidanje prefiksa NE SMIJE postati "podudaraj bilo sto sto zavrsava tim tekstom": prefiks je
   * zatvoren popis iz `makeCheck`, a ne proizvoljan prolog.
   */
  it('violated:false kad je prefiks izmisljen, ne onaj koji makeCheck dodaje', () => {
    const items = universalRepairableItems([
      { ...EMPTY_PARAGRAPHS_ISSUE, title: `Napomena: ${EMPTY_PARAGRAPHS_ISSUE.title}` },
    ]);
    expect(items[0].violated).toBe(false);
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

describe('paragraphSpacingRepairableItem (razmak prije/poslije, ovisi o profilu)', () => {
  it('prazno kad profil ne provjerava razmak prije/poslije (checkParagraphSpacingZero nije true)', () => {
    expect(paragraphSpacingRepairableItem([FAIL('Razmak prije i poslije odlomka')], {})).toEqual([]);
    expect(
      paragraphSpacingRepairableItem([FAIL('Razmak prije i poslije odlomka')], { checkParagraphSpacingZero: false }),
    ).toEqual([]);
  });

  it('profil provjerava razmak, check prolazi -> violated:false', () => {
    const items = paragraphSpacingRepairableItem(
      [PASS('Razmak prije i poslije odlomka')],
      { checkParagraphSpacingZero: true },
    );
    expect(items).toEqual([
      { ruleId: 'paragraph-spacing-universal', fixerId: 'paragraph-spacing-fixer', label: 'Razmak prije i poslije odlomka', params: {}, violated: false, matchKeys: ['Razmak prije i poslije odlomka'] },
    ]);
  });

  it('profil provjerava razmak, check ne prolazi -> violated:true', () => {
    const items = paragraphSpacingRepairableItem(
      [FAIL('Razmak prije i poslije odlomka')],
      { checkParagraphSpacingZero: true },
    );
    expect(items).toEqual([
      { ruleId: 'paragraph-spacing-universal', fixerId: 'paragraph-spacing-fixer', label: 'Razmak prije i poslije odlomka', params: {}, violated: true, matchKeys: ['Razmak prije i poslije odlomka'] },
    ]);
  });

  it('profilna pravila grade parametre uvlake i ciljane odlomke iz analize', () => {
    const items = paragraphSpacingRepairableItem(
      [FAIL('Razmak prije i poslije odlomka')],
      {
        checkParagraphSpacingZero: true,
        paragraphRules: {
          styles: { Normal: { firstLineCm: 1.25, widowControl: true }, Bibliography: { hangingCm: 0.5 } },
          firstParagraphAfterHeading: { firstLineCm: 0 },
          keepLinesShortBlocks: true,
          removeFakeIndent: true,
        },
      },
      { details: { paragraphFormatting: { candidates: [{ paragraphIndex: 4, firstAfterHeading: true, shortBlock: true, fakeIndent: true }] } } },
    );
    expect(items[0].params).toEqual({
      styleRules: [
        { styleId: 'Normal', beforeTwentieths: undefined, afterTwentieths: undefined, firstLineTwips: 709, hangingTwips: undefined, keepLines: false, keepNext: false, widowControl: true },
        { styleId: 'Bibliography', beforeTwentieths: undefined, afterTwentieths: undefined, firstLineTwips: undefined, hangingTwips: 283, keepLines: false, keepNext: false, widowControl: false },
      ],
      targets: [{ paragraphIndex: 4, firstLineTwips: 0, keepLines: true, removeFakeIndent: true }],
    });
  });
});

describe('footnoteSpacingRepairableItem (razmak prije/poslije fusnota, ovisi o profilu)', () => {
  it('prazno kad profil ne provjerava razmak prije/poslije fusnota (checkFootnoteParagraphSpacingZero nije true)', () => {
    expect(footnoteSpacingRepairableItem([FAIL('Razmak prije i poslije fusnota')], {})).toEqual([]);
    expect(
      footnoteSpacingRepairableItem([FAIL('Razmak prije i poslije fusnota')], { checkFootnoteParagraphSpacingZero: false }),
    ).toEqual([]);
  });

  it('profil provjerava razmak fusnota, check prolazi -> violated:false', () => {
    const items = footnoteSpacingRepairableItem(
      [PASS('Razmak prije i poslije fusnota')],
      { checkFootnoteParagraphSpacingZero: true },
    );
    expect(items).toEqual([
      { ruleId: 'footnote-spacing-universal', fixerId: 'footnote-spacing-fixer', label: 'Razmak prije i poslije fusnota', params: {}, violated: false, matchKeys: ['Razmak prije i poslije fusnota'] },
    ]);
  });

  it('profil provjerava razmak fusnota, check ne prolazi -> violated:true', () => {
    const items = footnoteSpacingRepairableItem(
      [FAIL('Razmak prije i poslije fusnota')],
      { checkFootnoteParagraphSpacingZero: true },
    );
    expect(items).toEqual([
      { ruleId: 'footnote-spacing-universal', fixerId: 'footnote-spacing-fixer', label: 'Razmak prije i poslije fusnota', params: {}, violated: true, matchKeys: ['Razmak prije i poslije fusnota'] },
    ]);
  });
});

describe('pageNumberAlignmentRepairableItem (poravnanje broja stranice, ovisi o profilu)', () => {
  it('prazno kad profil ne provjerava poravnanje broja stranice (pageNumberAlignment falsy)', () => {
    expect(pageNumberAlignmentRepairableItem([FAIL('Položaj broja stranice')], {})).toEqual([]);
    expect(
      pageNumberAlignmentRepairableItem([FAIL('Položaj broja stranice')], { pageNumberAlignment: false }),
    ).toEqual([]);
  });

  // RE-04: svi profili u data/ nose STRING "right" (ne boolean true); gate koji trazi doslovni
  // `=== true` je bio MRTAV za svaki stvarni profil. Gate je sada na truthy, a STRING vrijednost
  // ide u params.align (fixer ju je dosad ignorirao i imao tvrdo upisano 'right').
  it('profil provjerava poravnanje u STVARNOM obliku iz data/ (string "right"), check prolazi -> violated:false, align u params', () => {
    const items = pageNumberAlignmentRepairableItem(
      [PASS('Položaj broja stranice')],
      { pageNumberAlignment: 'right' },
    );
    expect(items).toEqual([
      { ruleId: 'page-number-alignment-universal', fixerId: 'page-number-alignment-fixer', label: 'Položaj broja stranice', params: { align: 'right' }, violated: false, matchKeys: ['Položaj broja stranice'] },
    ]);
  });

  it('profil provjerava poravnanje (string "right"), check ne prolazi -> violated:true', () => {
    const items = pageNumberAlignmentRepairableItem(
      [FAIL('Položaj broja stranice')],
      { pageNumberAlignment: 'right' },
    );
    expect(items).toEqual([
      { ruleId: 'page-number-alignment-universal', fixerId: 'page-number-alignment-fixer', label: 'Položaj broja stranice', params: { align: 'right' }, violated: true, matchKeys: ['Položaj broja stranice'] },
    ]);
  });

  it('legacy boolean true (bez konkretne vrijednosti u profilu) i dalje radi, align defaultira na "right"', () => {
    const items = pageNumberAlignmentRepairableItem(
      [FAIL('Položaj broja stranice')],
      { pageNumberAlignment: true },
    );
    expect(items).toEqual([
      { ruleId: 'page-number-alignment-universal', fixerId: 'page-number-alignment-fixer', label: 'Položaj broja stranice', params: { align: 'right' }, violated: true, matchKeys: ['Položaj broja stranice'] },
    ]);
  });
});

// RE-05: section-insert (numeriranje od Uvoda) je umetao podnozje s CENTRIRANIM brojem
// (align:'center' hardkodiran), dok SVI profili koji ovu stavku nude (checkPageNumberStartAtIntro)
// istodobno traze broj DESNO (pageNumberAlignment "right"): popravak je sam sebi proizvodio novi
// prekrsaj na recheku. align se sada izvodi iz profila (isti pageNumberAlignment kao gore).
describe('introSectionItem (numeriranje od Uvoda: umetni prijelom sekcije)', () => {
  const RESULT = (introParagraphIndex: number, sections: unknown[], checks: AnalyzedCheck[] = []) => ({
    details: { introParagraphIndex, sections },
    checks,
  });

  it('prazno kad profil ne trazi checkPageNumberStartAtIntro', () => {
    expect(introSectionItem(RESULT(3, [{}]), { pageNumberAlignment: 'right' })).toEqual([]);
  });

  it('prazno kad je dokument visesekcijski (K6 v1 opseg: samo jednosekcijski)', () => {
    const profile = { checkPageNumberStartAtIntro: true, pageNumberAlignment: 'right' };
    expect(introSectionItem(RESULT(3, [{}, {}]), profile)).toEqual([]);
  });

  it('align u params.target dolazi IZ PROFILA (pageNumberAlignment "right"), ne hardkodiran "center"', () => {
    const profile = { checkPageNumberStartAtIntro: true, pageNumberAlignment: 'right' };
    const items = introSectionItem(RESULT(3, [{}]), profile);
    expect(items).toHaveLength(1);
    expect(items[0].params).toEqual({ target: { introParagraphIndex: 3, align: 'right' } });
  });

  it('bez konkretne vrijednosti u profilu (nepoznat/nedostajuci pageNumberAlignment): align defaultira na "right"', () => {
    const profile = { checkPageNumberStartAtIntro: true };
    const items = introSectionItem(RESULT(3, [{}]), profile);
    expect(items[0].params).toEqual({ target: { introParagraphIndex: 3, align: 'right' } });
  });
});

describe('crossFileSubmissionRepairableItem (usporedba predajnog paketa)', () => {
  it('prikazuje neslaganje i gradi samo potvrđeni metadata plan', () => {
    const items = crossFileSubmissionRepairableItem({
      details: {
        crossFileSubmissionConsistency: {
          files: [{ name: 'rad.docx', type: 'docx', fingerprint: 'file-1' }],
          issues: [{
            id: 'title-1',
            field: 'title',
            status: 'mismatch',
            severity: 'warning',
            reason: 'Naslov se razlikuje između izvora.',
            suggestedCanonical: 'Novi naslov',
            values: [
              { value: 'Stari naslov', source: 'docx-metadata', fingerprint: 'value-1' },
              { value: 'Novi naslov', source: 'pdf-metadata', fingerprint: 'value-2' },
            ],
          }],
          summary: { text: '1 neslaganje' },
        },
      },
    }, {});
    expect(items).toHaveLength(1);
    expect(items[0].fixerId).toBe('submission-metadata-fixer');
    const form = items[0].crossFileSubmissionForm!;
    expect(form.issues[0].selected).toBe(false);
    form.issues[0].selected = true;
    form.issues[0].selectedCanonical = 'Novi naslov';
    expect(form.buildParams(form)).toEqual({
      version: 1,
      fields: [{
        field: 'title',
        part: 'docProps/core.xml',
        before: 'Stari naslov',
        replacementText: 'Novi naslov',
        fingerprint: expect.any(String),
        confirmed: true,
      }],
    });
  });
});

describe('elementCaptionRepairableItem: preporuka bez profilnog pravila (RE-59)', () => {
  /**
   * `element-caption-rules` danas nema NIJEDAN od 368 profila, pa je popravak bio mrtav bez obzira
   * na dokument. Unakrsne upute su tehnicka ispravnost Word dokumenta, ne fakultetsko pravilo, pa
   * se nude i bez pravila, ali kao PREPORUKA.
   *
   * Granica prema tvrdom pravilu (CLAUDE.md): izmisljeno pravilo bilo bi ono koje OCJENJUJE.
   * Ova stavka se ne vezuje ni na jedan bodovan check (nema matchKeys) i nije prekrsaj
   * (violated:false), pa ne moze pomaknuti ocjenu. Test to drzi zakljucanim.
   */
  const structure = {
    candidates: [{
      id: 'element-table-1-abcd1234', kind: 'table', ordinal: 1,
      anchor: { bodyChildIndex: 1, tableIndex: 0 }, anchorFingerprint: 'abcd1234',
      existingCaption: { paragraphIndex: 1, position: 'above', rawText: 'Tablica 1. Pregled', label: 'Tablica', description: 'Pregled' },
      confidence: 'high', evidence: [],
    }],
    references: [{ paragraphIndex: 2, start: 10, end: 11, rawText: '1', contextText: 'Tablici 1', elementId: 'element-table-1-abcd1234', confidence: 'high', evidence: [] }],
    lists: {},
  };

  it('nudi se bez pravila, ali izvan bodovanja', () => {
    const items = elementCaptionRepairableItem({ details: { elementStructure: structure } }, { ruleEntries: [] });
    expect(items).toHaveLength(1);
    expect(items[0].violated, 'preporuka nije prekrsaj').toBe(false);
    expect(items[0].recommended, 'mora ici u skupinu preporuka (opt-in)').toBe(true);
    expect(items[0].matchKeys, 'ne smije se vezati na bodovan check').toBeUndefined();
    expect(items[0].requiresConfirmation).toBe(true);
    expect(String(items[0].confirmationText)).toContain('Ocjena se ne mijenja');
    // Bez profila se ne nude popisi tablica ni slika: to je profilna odluka, ne tehnicka.
    expect(items[0].elementCaptionForm?.lists).toEqual([]);
  });

  it('s verificiranim pravilom ostaje prekrsaj i vezan na bodovane checkove', () => {
    const ruleEntries = [{
      checkId: 'element-caption-rules', status: 'verified', sourceId: 'izvor', sourcePage: 'str. 4', quote: 'citat',
      value: { labels: { table: 'Tablica', figure: 'Slika', chart: 'Grafikon' }, captionPosition: { table: 'above', figure: 'below', chart: 'below' } },
    }];
    const items = elementCaptionRepairableItem({ details: { elementStructure: structure } }, { ruleEntries });
    expect(items).toHaveLength(1);
    expect(items[0].violated).toBe(true);
    expect(items[0].recommended).toBeUndefined();
    expect(items[0].matchKeys?.length).toBeGreaterThan(0);
  });
});

describe('asRecommendation: strojno provjereno pravilo se nudi, ali ne boduje', () => {
  /**
   * Pilot za cetiri ustanove unio je 47 pravila cije je uporiste u izvoru STROJNO dokazano
   * (citat stoji u snapshotiranom PDF-u, vrijednost iz njega slijedi), ali koja nisu prosla ljudski
   * pass, a izvori se redom sami nazivaju preporukom ("Predstavljaju samo jednu od vise
   * mogucnosti"). Takva pravila ulaze kao `status: 'advisory'` + `scored: false`.
   *
   * Ovaj test drzi zakljucanom granicu iz CLAUDE.md: pravilo koje nije obvezujuce smije se NUDITI,
   * ali ne smije bodovati. Bez `matchKeys` stavka se ne vezuje ni na jedan bodovan check, pa ne
   * moze pomaknuti ocjenu. Da se advisory jednog dana tiho pocne bodovati, ovaj test pada.
   */
  const structure = {
    candidates: [{
      id: 'element-table-1-abcd1234', kind: 'table', ordinal: 1,
      anchor: { bodyChildIndex: 1, tableIndex: 0 }, anchorFingerprint: 'abcd1234',
      existingCaption: { paragraphIndex: 1, position: 'above', rawText: 'Tablica 1. Pregled', label: 'Tablica', description: 'Pregled' },
      confidence: 'high', evidence: [],
    }],
    references: [],
    lists: {},
  };
  const value = { labels: { table: 'Tablica', figure: 'Slika', chart: 'Grafikon' }, captionPosition: { table: 'above', figure: 'below', chart: 'below' } };
  const entry = (status: string) => [{ checkId: 'element-caption-rules', status, sourceId: 'izvor', sourcePage: 'str. 4', quote: 'citat', value }];

  it('advisory pravilo daje stavku IZVAN bodovanja', () => {
    const profile = { ruleEntries: entry('advisory') };
    const raw = elementCaptionRepairableItem({ details: { elementStructure: structure } }, profile);
    // Gate propusta advisory (inace bi pravilo bilo mrtvo i korisnik ga nikad ne bi vidio).
    expect(raw, 'advisory pravilo mora doci do stavke').toHaveLength(1);
    const items = asRecommendation(profile, 'element-caption-rules', raw);
    expect(items[0].violated, 'preporuka nije prekrsaj').toBe(false);
    expect(items[0].recommended).toBe(true);
    expect(items[0].matchKeys, 'ne smije se vezati na bodovan check').toBeUndefined();
  });

  it('verified pravilo ostaje obveza i nakon prolaska kroz asRecommendation', () => {
    const profile = { ruleEntries: entry('verified') };
    const items = asRecommendation(profile, 'element-caption-rules', elementCaptionRepairableItem({ details: { elementStructure: structure } }, profile));
    expect(items[0].violated).toBe(true);
    expect(items[0].recommended).toBeUndefined();
    expect(items[0].matchKeys?.length, 'verified pravilo se i dalje boduje').toBeGreaterThan(0);
  });

  it('ne dira stavke kad profil nema pravilo za taj checkId', () => {
    const items = [{ ruleId: 'x', fixerId: 'y', label: 'z', params: {}, violated: true, matchKeys: ['A'] }] as any;
    expect(asRecommendation({ ruleEntries: [] }, 'element-caption-rules', items)).toBe(items);
  });
});

describe('tableFigureRescueRepairableItem: preporuka bez profilnog pravila (RE-61)', () => {
  /**
   * Isti obrazac kao RE-59, i prolazi isti test vidljivog teksta: svi zahvati su geometrijski
   * (sirina, zaglavlje, centriranje, orijentacija), nijedan ne dira autorov tekst. Alt tekst se
   * ne izmislja: polje je prazno i u params ide samo ako ga korisnik upise.
   */
  const structure = {
    tables: [{ id: 't1', bodyChildIndex: 3, anchorFingerprint: 'aaaa1111', rowCount: 4, columnCount: 5, wide: true, confidence: 'high', rowsWithCantSplit: 0, hasHeader: false, evidence: [] }],
    figures: [{ id: 'f1', paragraphIndex: 7, drawingIndex: 0, anchorFingerprint: 'bbbb2222', widthEmu: 5400000, dpiX: 120, confidence: 'high', wrapsText: false, evidence: [] }],
  };

  it('nudi se bez pravila, izvan bodovanja, i ne izmislja alt tekst', () => {
    const items = tableFigureRescueRepairableItem({ details: { tableFigureRescue: structure } }, { ruleEntries: [] });
    expect(items).toHaveLength(1);
    expect(items[0].violated).toBe(false);
    expect(items[0].recommended).toBe(true);
    expect(items[0].matchKeys, 'ne smije se vezati na bodovan check').toBeUndefined();
    expect(String(items[0].confirmationText)).toContain('Ocjena se ne mijenja');
    const params = items[0].params as { figures?: Array<Record<string, unknown>> };
    expect(params.figures?.every((figure) => figure.altText === undefined), 'alt tekst se ne smije slati').toBe(true);
  });

  it('s verificiranim pravilom ostaje prekrsaj', () => {
    const ruleEntries = [{
      checkId: 'table-figure-rescue-rules', status: 'verified', sourceId: 'izvor', sourcePage: 'str. 7', quote: 'citat',
      value: { figure: { minDpi: 150 } },
    }];
    const items = tableFigureRescueRepairableItem({ details: { tableFigureRescue: structure } }, { ruleEntries });
    expect(items[0].violated).toBe(true);
    expect(items[0].recommended).toBeUndefined();
    expect(items[0].matchKeys?.length).toBeGreaterThan(0);
  });
});

/**
 * PREDODABIR OBVEZNIH DIJELOVA (2026-08-29).
 *
 * Uvjet je do tog dana glasio `confidence === 'high' && insertionAnchor`, a stavka gleda iskljucivo
 * NEDOSTAJUCE dijelove, koje analiza po konstrukciji nikad ne oznaci kao `high`
 * (`confidence = present ? 'high' : 'medium'`). Fixer je zato na 116 stvarnih dokumenata ponudjen
 * 49 puta i nijednom nista nije promijenio: `params.sections` su uvijek bili prazni.
 */
describe('requiredSectionsRepairableItem: predodabir nedostajucih dijelova', () => {
  const RULE_ENTRY = {
    checkId: 'required-section-rules',
    status: 'verified',
    sourceId: 'izvor-1',
    sourcePage: 'str. 4',
    quote: 'Rad mora sadrzavati sazetak i kljucne rijeci.',
    value: {},
  } as unknown as RuleEntry;

  const candidate = (over: Record<string, unknown>) => ({
    id: 'c1', kind: 'abstract', label: 'Abstract', confidence: 'medium', present: false,
    headingLevel: 1, numbered: false, contentPolicy: 'none', evidence: [], warnings: [],
    insertionAnchor: { paragraphIndex: 3, anchorFingerprint: 'fp-1', position: 'before' },
    ...over,
  });

  const build = (candidates: unknown[]) => requiredSectionsRepairableItem(
    { details: { requiredSectionsStructure: { candidates, summary: { text: 'nedostaje 1' } } } },
    { ruleEntries: [RULE_ENTRY] },
  );

  it('medium sa sidrom SE predodabire i salje nepraznu sekciju', () => {
    const items = build([candidate({})]);
    expect(items).toHaveLength(1);
    expect((items[0].params as any).sections).toHaveLength(1);
    expect((items[0].params as any).sections[0].kind).toBe('abstract');
    // Nista se ne umece bez izricite potvrde, i to mora ostati tako.
    expect(items[0].requiresConfirmation).toBe(true);
  });

  it('NEGATIVNA KONTROLA: low ili bez sidra se NE predodabire', () => {
    expect(((build([candidate({ confidence: 'low' })])[0].params as any).sections)).toHaveLength(0);
    expect(((build([candidate({ insertionAnchor: undefined })])[0].params as any).sections)).toHaveLength(0);
  });

  it('bez verificiranog pravila profila stavke uopce nema', () => {
    const items = requiredSectionsRepairableItem(
      { details: { requiredSectionsStructure: { candidates: [candidate({})], summary: { text: 'x' } } } },
      { ruleEntries: [] },
    );
    expect(items).toEqual([]);
  });
});

/**
 * Velicina fusnote kao PREPORUKA. Motor je fixer imao cijelo vrijeme (`footnoteTypographyFixer`
 * prima `fontSizePt`), ali ga tvrdnja nije dosezala: nedostajao joj je `recommendedFixerId`, pa
 * nijedan od 368 profila u `repair-map.json` nije nudio taj popravak. Klasican mrtav mehanizam:
 * kod postoji, ponuda ne.
 */
describe('velicina fusnote: vrijednost dolazi u dva oblika i oba moraju raditi', () => {
  const params = (value: unknown) => {
    // PECENI oblik: projekcija (`gen-profile-runtime-maps`) pretvara `recommendedFixerId` u
    // `fixerId` + `recommended: true`. Test namjerno koristi taj oblik, jer ga runtime i cita.
    const entries = [{
      ruleId: 'x--footnote-size', checkId: 'footnote-size', status: 'advisory',
      sourceId: 'izvor', sourcePage: 'str. 1', quote: 'preporucuje se velicina slova 10',
      value, fixerId: 'footnote-typography-fixer', recommended: true,
    }];
    const items = buildRepairableItems([], {}, entries as any);
    return items.find((i) => String(i.ruleId).includes('footnote-size'))?.params;
  };

  it('niz [10] daje fontSizePt 10', () => {
    expect(params([10])).toMatchObject({ fontSizePt: 10 });
  });

  it('goli broj 10 daje isto (46 tvrdnji nosi niz, 9 goli broj)', () => {
    expect(params(10)).toMatchObject({ fontSizePt: 10 });
  });

  it('besmislena vrijednost ne proizvodi ponudu', () => {
    expect(params(0)).toBeUndefined();
    expect(params('deset')).toBeUndefined();
  });
});
