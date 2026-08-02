import { describe, it, expect } from 'vitest';
import { wordsOf, ngramKeySet, looksMarkedAsQuote, buildSourceOverlapReport } from '../src/analysis/source-overlap';

const SHARED_SENTENCE =
  'Prema tjednom izvješću broj tri izvedeni su radovi na temeljima objekta uz sudjelovanje dva radnika i jednog voditelja gradilišta tijekom cijelog radnog tjedna bez značajnih odstupanja od plana.';

describe('wordsOf', () => {
  it('izvlaci samo slova (ukljucujuci hrvatsku dijakritiku), malim slovima', () => {
    expect(wordsOf('Čelik i beton, 40 t.')).toEqual(['čelik', 'i', 'beton', 't']);
  });
});

describe('ngramKeySet', () => {
  it('ne kolidira izmedju razlicitih podjela na rijeci (sentinel odvaja rijeci)', () => {
    const a = ngramKeySet(['ab', 'c'], 2);
    const b = ngramKeySet(['a', 'bc'], 2);
    expect([...a]).not.toEqual([...b]);
  });

  it('gradi ocekivan broj n-grama', () => {
    const set = ngramKeySet(['a', 'b', 'c', 'd'], 2);
    expect(set.size).toBe(3); // ab, bc, cd
  });
});

describe('looksMarkedAsQuote', () => {
  it('prepoznaje navodnik + citatnu oznaku s hrvatskom dijakritikom u prezimenu (Ivić)', () => {
    expect(looksMarkedAsQuote('„ovo je citat” (Ivić, 2019).')).toBe(true);
  });

  it('bez navodnika NIJE oznaceno, cak i uz citatnu oznaku', () => {
    expect(looksMarkedAsQuote('parafraza prema (Ivić, 2019).')).toBe(false);
  });

  it('bez citatne oznake NIJE oznaceno, cak i uz navodnike', () => {
    expect(looksMarkedAsQuote('„ovo su navodnici bez izvora”.')).toBe(false);
  });
});

describe('buildSourceOverlapReport', () => {
  const sourceDocs = [{ fileName: 'izvjesce-03.docx', paragraphs: [SHARED_SENTENCE] }];

  it('flagira doslovno prepisan odlomak BEZ oznake citata', () => {
    const report = buildSourceOverlapReport([{ index: 5, text: SHARED_SENTENCE }], sourceDocs);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].paragraphIndex).toBe(5);
    expect(report.findings[0].looksMarked).toBe(false);
    expect(report.findings[0].flagged).toBe(true);
    expect(report.findings[0].bestMatch?.sourceFileName).toBe('izvjesce-03.docx');
    expect(report.flaggedCount).toBe(1);
  });

  it('NE flagira isti doslovni tekst kad je oznacen navodnicima + referencom', () => {
    const marked = `„${SHARED_SENTENCE}” (Ivić, 2019).`;
    const report = buildSourceOverlapReport([{ index: 5, text: marked }], sourceDocs);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].looksMarked).toBe(true);
    expect(report.findings[0].flagged).toBe(false);
    expect(report.flaggedCount).toBe(0);
  });

  it('iskljucuje kratke odlomke (< minParagraphWords)', () => {
    const report = buildSourceOverlapReport([{ index: 1, text: 'Kratak odlomak bez dovoljno rijeci.' }], sourceDocs);
    expect(report.paragraphsScanned).toBe(0);
    expect(report.findings).toHaveLength(0);
  });

  it('preskace odlomke nakon naslova LITERATURA', () => {
    const report = buildSourceOverlapReport(
      [
        { index: 10, text: 'Literatura' },
        { index: 11, text: SHARED_SENTENCE },
      ],
      sourceDocs,
    );
    expect(report.findings).toHaveLength(0);
    expect(report.paragraphsScanned).toBe(0);
  });

  it('bez izvornih datoteka nema nalaza', () => {
    const report = buildSourceOverlapReport([{ index: 1, text: SHARED_SENTENCE }], []);
    expect(report.sourceFilesUsed).toBe(0);
    expect(report.findings).toHaveLength(0);
  });
});
