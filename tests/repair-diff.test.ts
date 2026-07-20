// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { locateChanges } from '../src/ui/repair-diff';

function m(texts: string[]) {
  return { paragraphs: texts.map((text, i) => ({ index: i + 1, text })), truncated: false } as never;
}

describe('locateChanges', () => {
  it('bez razlika ne prijavljuje nista', () => {
    expect(locateChanges(m(['a', 'b', 'c']), m(['a', 'b', 'c']))).toEqual([]);
  });

  it('obrisan odlomak: prijavi JEDNO mjesto, ne sve ostale', () => {
    // Kljucna invarijanta: bez resinkronizacije bi svaki odlomak iza brisanja ispao "promijenjen".
    const out = locateChanges(m(['a', '', 'b', 'c']), m(['a', 'b', 'c']));
    expect(out).toHaveLength(1);
    expect(out[0].before).toBe(2);
    expect(out[0].after).toBe(2);
  });

  it('umetnut odlomak (npr. Sadrzaj) daje jedno mjesto', () => {
    const out = locateChanges(m(['a', 'b']), m(['a', 'SADRZAJ', 'b']));
    expect(out).toHaveLength(1);
    expect(out[0].after).toBe(2);
  });

  it('dodatak na kraju se prijavi', () => {
    const out = locateChanges(m(['a']), m(['a', 'novo']));
    expect(out).toHaveLength(1);
    expect(out[0].after).toBe(2);
  });

  it('prazan model ne rusi', () => {
    expect(locateChanges(m([]), m([]))).toEqual([]);
  });

  it('postuje limit (dugacak rad ne generira stotine gumba)', () => {
    const before = m(Array.from({ length: 100 }, (_, i) => `x${i}`));
    const after = m(Array.from({ length: 100 }, (_, i) => `y${i}`));
    expect(locateChanges(before, after, 5).length).toBeLessThanOrEqual(6);
  });
});
