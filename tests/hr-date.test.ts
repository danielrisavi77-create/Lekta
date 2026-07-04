import { describe, it, expect } from 'vitest';
import { formatCroatianDate } from '../src/tools/hr-date';

describe('formatCroatianDate', () => {
  it('formatira ISO datum u hrvatski oblik s genitivom mjeseca', () => {
    expect(formatCroatianDate('2026-07-03')).toBe('3. srpnja 2026.');
    expect(formatCroatianDate('2026-01-01')).toBe('1. siječnja 2026.');
    expect(formatCroatianDate('2025-12-31')).toBe('31. prosinca 2025.');
    expect(formatCroatianDate('2024-11-15')).toBe('15. studenoga 2024.');
  });

  it('prazan za neispravan ili prazan ulaz', () => {
    expect(formatCroatianDate('')).toBe('');
    expect(formatCroatianDate('3.7.2026.')).toBe('');
    expect(formatCroatianDate('2026-13-01')).toBe('');
    expect(formatCroatianDate('2026-00-10')).toBe('');
  });
});
