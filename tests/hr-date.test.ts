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

  it('BUG: odbija kalendarski nevaljane dane koji prolaze kroz raspon-provjeru (1-31/1-12)', () => {
    // Date auto-rolla ove u sljedeci mjesec (npr. 31.4. -> 1.5.); prije popravka su prolazile
    // kao naizgled ispravan, ali izmisljen datum.
    expect(formatCroatianDate('2026-04-31')).toBe(''); // travanj ima 30 dana
    expect(formatCroatianDate('2026-02-30')).toBe(''); // veljaca nikad nema 30 dana
    expect(formatCroatianDate('2025-02-29')).toBe(''); // 2025 nije prijestupna
    expect(formatCroatianDate('2026-06-31')).toBe(''); // lipanj ima 30 dana
  });

  it('prihvaca rubne kalendarski ispravne dane, ukljucujuci 29.2. u prijestupnoj godini', () => {
    expect(formatCroatianDate('2024-02-29')).toBe('29. veljače 2024.'); // 2024 JEST prijestupna
    expect(formatCroatianDate('2026-04-30')).toBe('30. travnja 2026.');
    expect(formatCroatianDate('2026-01-31')).toBe('31. siječnja 2026.');
  });
});
