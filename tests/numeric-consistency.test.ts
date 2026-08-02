import { describe, it, expect } from 'vitest';
import { analyzeNumericConsistency, numericConsistencySummary } from '../src/audits/numeric-consistency';

describe('analyzeNumericConsistency: count-claims (broj ispred korijena kljucne rijeci)', () => {
  it('"13 okvira" i "16 okvira" u razlicitim odlomcima daju jedan sukob', () => {
    const r = analyzeNumericConsistency({
      paragraphs: [
        { index: 1, text: 'Konstrukcija ima temelj i stup koji nose gredu.' },
        { index: 5, text: 'Konstrukcija ima 13 okvira.' },
        { index: 10, text: 'Panel je od čelika.' },
        { index: 40, text: 'Sveukupno je ugrađeno 16 okvira u krovištu.' },
      ],
    });
    expect(r.domain).toBe('celik');
    const c = r.conflicts.find((x) => x.keyword === 'okvir' && x.unit === 'kom.');
    expect(c).toBeTruthy();
    expect(c!.values.sort()).toEqual(['13', '16']);
    expect(c!.occurrences.map((o) => o.paragraphIndex).sort((a, b) => a - b)).toEqual([5, 40]);
  });
});

describe('analyzeNumericConsistency: unit-claims (broj+jedinica)', () => {
  it('"2 m" i "2,5 m" za isti pojam (stup) daju sukob', () => {
    const r = analyzeNumericConsistency({
      paragraphs: [
        { index: 1, text: 'Stup je visine 2 m i nosi gredu preko cijele strehe.' },
        { index: 2, text: 'Isti tip stupa ima visinu 2,5 m prema projektnoj dokumentaciji.' },
        { index: 3, text: 'Krovište je izvedeno od čelika uz odgovarajući premaz.' },
      ],
    });
    expect(r.domain).toBe('celik');
    const c = r.conflicts.find((x) => x.keyword === 'stup' && x.unit === 'm');
    expect(c).toBeTruthy();
    expect(c!.values).toEqual(['2', '2,5']);
  });

  it('isti broj razlicito zapisan ("2" vs "2,0") NE stvara sukob (dedupe po parsiranoj vrijednosti)', () => {
    const r = analyzeNumericConsistency({
      paragraphs: [
        { index: 1, text: 'Stup je dug 2 m i nosi gredu preko strehe.' },
        { index: 2, text: 'Isti stup mjeri 2,0 m prema projektu, izveden od čelika uz premaz.' },
      ],
    });
    expect(r.conflicts).toHaveLength(0);
  });
});

describe('analyzeNumericConsistency: generic fallback domena', () => {
  it('kad se ne prepozna specifican inzenjerski domen, koristi frekvencijski fallback i svejedno nadje sukob', () => {
    const r = analyzeNumericConsistency({
      paragraphs: [
        { index: 1, text: 'Udaljenost iznosi 5 m od glavne ceste u prvom naselju.' },
        { index: 2, text: 'Mjerenje je pokazalo udaljenost od 8 m u drugom naselju.' },
        { index: 3, text: 'Prema izvještaju, udaljenost je bila 5 m u trećem naselju.' },
      ],
    });
    expect(r.domain).toBe('generic');
    expect(r.genericKeywordsUsed).toContain('udaljenost');
    const c = r.conflicts.find((x) => x.keyword === 'udaljenost' && x.unit === 'm');
    expect(c).toBeTruthy();
    expect(c!.values).toEqual(['5', '8']);
  });

  it('kad rad nema tehnickih pojmova ni ponavljajucih rijeci uz brojeve, nema kandidata', () => {
    const r = analyzeNumericConsistency({
      paragraphs: [{ index: 1, text: 'Ovo je kratak, sasvim opisni tekst bez brojcanih tvrdnji.' }],
    });
    expect(r.domain).toBe('generic');
    expect(r.conflicts).toHaveLength(0);
  });
});

describe('numericConsistencySummary', () => {
  it('broji kandidate po jedinici', () => {
    const summary = numericConsistencySummary([
      { id: 'a|m', keyword: 'a', unit: 'm', values: ['1', '2'], occurrences: [] },
      { id: 'b|m', keyword: 'b', unit: 'm', values: ['3', '4'], occurrences: [] },
      { id: 'c|kom.', keyword: 'c', unit: 'kom.', values: ['5', '6'], occurrences: [] },
    ]);
    expect(summary.total).toBe(3);
    expect(summary.byUnit).toEqual({ m: 2, 'kom.': 1 });
  });
});
