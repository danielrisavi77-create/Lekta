import { describe, it, expect } from 'vitest';
import { academicYearFromDate, effectiveAcademicYear, ACADEMIC_YEAR_RE } from '../src/profiles/academic-year';

describe('academicYearFromDate', () => {
  it('granica je 1. listopada', () => {
    expect(academicYearFromDate('2025-09-30')).toBe('2024./2025.');
    expect(academicYearFromDate('2025-10-01')).toBe('2025./2026.');
    expect(academicYearFromDate('2026-07-02')).toBe('2025./2026.');
    expect(academicYearFromDate('2026-01-15')).toBe('2025./2026.');
  });

  it('nevaljan/prazan ulaz daje null (bez nagadjanja)', () => {
    expect(academicYearFromDate(null)).toBeNull();
    expect(academicYearFromDate(undefined)).toBeNull();
    expect(academicYearFromDate('')).toBeNull();
    expect(academicYearFromDate('nije-datum')).toBeNull();
  });

  it('format odgovara validatorskom uzorku', () => {
    expect(academicYearFromDate('2026-07-02')).toMatch(ACADEMIC_YEAR_RE);
  });
});

describe('effectiveAcademicYear', () => {
  it('eksplicitni override na pravilu ima prednost', () => {
    expect(effectiveAcademicYear({ academicYear: '2023./2024.', lastVerified: '2026-07-02' })).toBe('2023./2024.');
  });

  it('pada na lastVerified pravila, pa verifiedAt profila, pa documentDate', () => {
    expect(effectiveAcademicYear({ lastVerified: '2026-07-02' })).toBe('2025./2026.');
    expect(effectiveAcademicYear({}, { verifiedAt: '2025-11-10' })).toBe('2025./2026.');
    expect(effectiveAcademicYear({}, { documentDate: '2024-05-01' })).toBe('2023./2024.');
    expect(effectiveAcademicYear(null, null)).toBeNull();
  });
});
