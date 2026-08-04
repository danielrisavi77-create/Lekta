import { describe, it, expect } from 'vitest';
import { computeDelta, formatDeltaPct, formatCount, formatEur, formatPct } from '../src/admin/admin-transforms';

describe('computeDelta', () => {
  it('oba prozora nula -> flat/neutral, ne dijeljenje nulom', () => {
    expect(computeDelta(0, 0)).toEqual({ pct: null, direction: 'flat', sentiment: 'neutral' });
  });

  it('prethodni prozor nula, tekuci >0, goodDirection up -> good, bez postotka', () => {
    expect(computeDelta(5, 0, 'up')).toEqual({ pct: null, direction: 'up', sentiment: 'good' });
  });

  it('prethodni prozor nula, tekuci >0, goodDirection down (npr. greske) -> bad', () => {
    expect(computeDelta(5, 0, 'down')).toEqual({ pct: null, direction: 'up', sentiment: 'bad' });
  });

  it('prethodni prozor nula, tekuci >0, goodDirection neutral -> neutral', () => {
    expect(computeDelta(5, 0, 'neutral')).toEqual({ pct: null, direction: 'up', sentiment: 'neutral' });
  });

  it('normalan rast, goodDirection up -> good', () => {
    const d = computeDelta(120, 100, 'up');
    expect(d.direction).toBe('up');
    expect(d.sentiment).toBe('good');
    expect(d.pct).toBeCloseTo(20, 5);
  });

  it('normalan pad, goodDirection up -> bad', () => {
    const d = computeDelta(80, 100, 'up');
    expect(d.direction).toBe('down');
    expect(d.sentiment).toBe('bad');
    expect(d.pct).toBeCloseTo(-20, 5);
  });

  it('goodDirection down (npr. neuspjeli popravci): pad je good, rast je bad', () => {
    expect(computeDelta(80, 100, 'down').sentiment).toBe('good');
    expect(computeDelta(120, 100, 'down').sentiment).toBe('bad');
  });

  it('ispod 1 postotnog boda je flat/neutral bez obzira na goodDirection', () => {
    const d = computeDelta(100.5, 100, 'up');
    expect(d.direction).toBe('flat');
    expect(d.sentiment).toBe('neutral');
  });

  it('goodDirection neutral: rast/pad iznad praga ostaje neutral', () => {
    expect(computeDelta(120, 100, 'neutral').sentiment).toBe('neutral');
    expect(computeDelta(80, 100, 'neutral').sentiment).toBe('neutral');
  });
});

describe('formatDeltaPct', () => {
  it('flat s nultom osnovicom -> crtica', () => {
    expect(formatDeltaPct({ pct: null, direction: 'flat', sentiment: 'neutral' })).toBe('—');
  });

  it('novo (nema prosle osnovice, ali ima tekuce) -> "novo"', () => {
    expect(formatDeltaPct({ pct: null, direction: 'up', sentiment: 'good' })).toBe('novo');
  });

  it('pozitivan postotak dobiva + predznak i hrvatski zarez', () => {
    expect(formatDeltaPct({ pct: 18.7, direction: 'up', sentiment: 'good' })).toBe('+18,7%');
  });

  it('negativan postotak dobiva − predznak (apsolutna vrijednost u tekstu)', () => {
    expect(formatDeltaPct({ pct: -20, direction: 'down', sentiment: 'bad' })).toBe('−20,0%');
  });
});

describe('formatCount / formatEur / formatPct', () => {
  it('formatCount koristi hrvatski tisucni razdjelnik', () => {
    expect(formatCount(12480)).toMatch(/12\D480/);
  });

  it('formatCount prazno/undefined daje 0', () => {
    expect(formatCount(undefined)).toBe('0');
  });

  it('formatEur ima dvije decimale i € oznaku', () => {
    expect(formatEur(163.5)).toBe('163,50 €');
  });

  it('formatPct crtica za null/undefined, ne 0%', () => {
    expect(formatPct(null)).toBe('—');
    expect(formatPct(undefined)).toBe('—');
  });

  it('formatPct hrvatski zarez, jedna decimala', () => {
    expect(formatPct(8.5)).toBe('8,5%');
  });
});
