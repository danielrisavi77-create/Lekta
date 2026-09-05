/**
 * Harness stvarnog korpusa: DEKLARIRANO uklanjanje dijela paketa nije izgubljen zapis.
 *
 * Izmjereno 2026-09-05 na 95 stvarnih radova: 15 padova, svih 15 isti potpis. Radovi iz ne-Wordovih alata nose
 * prazan `word/comments.xml`; `final-document-inspector-fixer` ga ukloni i to prijavi kroz
 * `removedPackageParts`, vrata integriteta i strukture prodju, a harness je nestali zapis brojao kao
 * `droppedEntryCount` i dokument proglasio `fail`. Mjera je brojala popravak kao gubitak.
 *
 * Gard ima obje strane: deklarirano se ne broji, NEDEKLARIRANO se i dalje broji (inace bi se mogao izgubiti
 * bilo koji dio a da mjera to ne vidi).
 */
import { describe, expect, it } from 'vitest';
import { classifyMissingEntries } from './real-corpus/harness';

const PRIJE = ['[Content_Types].xml', 'word/document.xml', 'word/comments.xml', 'word/media/image1.png'];

describe('classifyMissingEntries', () => {
  it('deklarirano uklonjen dio je popravak, ne gubitak: ide u removedByFixers, ne u dropped', () => {
    const poslije = new Set(['[Content_Types].xml', 'word/document.xml', 'word/media/image1.png']);
    const r = classifyMissingEntries(PRIJE, poslije, ['word/comments.xml']);
    expect(r.dropped).toEqual([]);
    expect(r.removedByFixers).toEqual(['word/comments.xml']);
  });

  it('NEGATIVNA KONTROLA: nedeklarirano nestao dio je i dalje gubitak', () => {
    const poslije = new Set(['[Content_Types].xml', 'word/document.xml', 'word/comments.xml']);
    const r = classifyMissingEntries(PRIJE, poslije, ['word/comments.xml']);
    expect(r.dropped).toEqual(['word/media/image1.png']);
    expect(r.removedByFixers).toEqual([]);
  });

  it('deklaracija bez stvarnog uklanjanja se ne broji nikamo: zapis je i dalje tu', () => {
    const poslije = new Set(PRIJE);
    const r = classifyMissingEntries(PRIJE, poslije, ['word/comments.xml']);
    expect(r.dropped).toEqual([]);
    expect(r.removedByFixers).toEqual([]);
  });

  it('bez deklaracije se ponasa kao prije: sve sto nedostaje je dropped', () => {
    const poslije = new Set(['[Content_Types].xml', 'word/document.xml']);
    const r = classifyMissingEntries(PRIJE, poslije, []);
    expect(r.dropped).toEqual(['word/comments.xml', 'word/media/image1.png']);
    expect(r.removedByFixers).toEqual([]);
  });
});
