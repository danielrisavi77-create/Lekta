import { describe, it, expect } from 'vitest';
import { headingLevel } from '../src/docx/parser';
import { extractCitations } from '../src/citations/author-year';

// Audit nalaz #6 (A-regex robustnost). Golden korpus ne sadrzi ove rubove pa ih pokrivamo ovdje.

describe('headingLevel: viseznamenkasti stil ne cita krivu razinu', () => {
  it('Word ugradjeni naslovi 1-9 rade kao prije', () => {
    expect(headingLevel('Heading 1', {})).toBe(1);
    expect(headingLevel('Naslov 2', {})).toBe(2);
    expect(headingLevel('Heading 9', {})).toBe(9);
  });
  it('"Heading 10" se NE cita kao razina 1 (pada na outlineLvl)', () => {
    expect(headingLevel('Heading 10', {})).toBeNull(); // nema outlinea -> null, ne 1
    expect(headingLevel('Heading 10', { outline: 0 })).toBe(1); // koristi pouzdani outlineLvl
  });
  it('nenaslovni stil je null; outlineLvl fallback radi', () => {
    expect(headingLevel('Body Text', {})).toBeNull();
    expect(headingLevel('Normal', { outline: 2 })).toBe(3);
  });
});

describe('extractCitations: ugnijezdena zagrada ne obara citat', () => {
  const cite = (text: string) => extractCitations([{ text }]);
  const has = (arr: any[], author: string, year: string) =>
    arr.some((c) => c.author === author && c.year === year);

  it('obicni parentetski citat i dalje radi', () => {
    expect(has(cite('Tvrdnja (Marković, 2019).'), 'Marković', '2019')).toBe(true);
  });
  it('"usp." prefiks i dalje radi', () => {
    expect(has(cite('Tvrdnja (usp. Marković, 2019).'), 'Marković', '2019')).toBe(true);
  });
  it('trailing ugnijezdena zagrada (godina na vrhu) vise ne gubi citat', () => {
    expect(has(cite('Tvrdnja (Marković, 2019 (vidi tablicu 3)).'), 'Marković', '2019')).toBe(true);
  });
  it('narativni citat i dalje radi', () => {
    expect(has(cite('Marković (2019) navodi...'), 'Marković', '2019')).toBe(true);
  });
  it('gola godina bez autora ne stvara citat', () => {
    expect(cite('U tekstu (2019) nema autora prije.').length).toBe(0);
  });
});
