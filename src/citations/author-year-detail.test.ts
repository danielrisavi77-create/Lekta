import { describe, expect, it } from 'vitest';
import { extractCitationOccurrences } from './author-year';

describe('extractCitationOccurrences', () => {
  it('vraća raspon, sufiks i lokator bez promjene legacy extractCitations rezultata', () => {
    const text = 'Prema Horvatu (2022a), rezultati potvrđuju raniji nalaz (Horvat, 2022b, str. 47).';
    const found = extractCitationOccurrences([{ index: 4, text }]);
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ author: 'Horvatu', year: '2022a', form: 'narrative' });
    expect(found[1]).toMatchObject({ author: 'Horvat', year: '2022b', suffix: 'b', locator: { label: 'str', value: '47' } });
    expect(text.slice(found[1].start, found[1].end)).toBe(found[1].rawText);
  });

  it('prepoznaje više autora u jednoj zagradi i izravni citat bez lokatora', () => {
    const text = '„Pouzdani zaključak rada“ (Horvat i Novak, 2022).';
    const found = extractCitationOccurrences([{ index: 8, text }]);
    expect(found).toHaveLength(1);
    expect(found[0].author).toBe('Horvat');
    expect(found[0].directQuote).toBe(true);
  });
});
