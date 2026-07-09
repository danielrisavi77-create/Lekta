import { describe, it, expect } from 'vitest';
// @ts-expect-error - namjerno CommonJS/UMD modul, ne TS
import { formatCitation } from './format-citation.js';

describe('formatCitation', () => {
  it('popunjava sva polja i cisti interpunkciju', () => {
    const result = formatCitation('{author} ({year}). {title}. {place}: {publisher}.', {
      author: 'Kovacic, I.',
      year: '2024',
      title: 'Politicki sustavi',
      place: 'Zagreb',
      publisher: 'FPZG',
    });
    expect(result).toBe('Kovacic, I. (2024). Politicki sustavi. Zagreb: FPZG.');
  });

  it('uklanja prazne zagrade kad polje nedostaje', () => {
    const result = formatCitation('{author} ({year}). {title}.', {
      author: 'Kovacic, I.',
      year: '',
      title: 'Politicki sustavi',
    });
    expect(result).toBe('Kovacic, I. Politicki sustavi.');
  });

  it('ne ostavlja dvostruke tocke kad je zadnje polje prazno', () => {
    const result = formatCitation('{title}. {publisher}.', {
      title: 'Naslov',
      publisher: '',
    });
    expect(result).toBe('Naslov.');
  });

  it('trimma visak razmaka', () => {
    const result = formatCitation('{author}   {title}', {
      author: '  Ivo Ivic  ',
      title: 'Naslov  ',
    });
    expect(result).toBe('Ivo Ivic Naslov');
  });
});
