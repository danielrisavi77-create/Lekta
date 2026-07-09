import { describe, it, expect } from 'vitest';
import { findConfirmedDeadline } from './deadline-registry';
import type { AcademicDeadlineEntry } from './types';

const registry: AcademicDeadlineEntry[] = [
  {
    facultyId: 'fpzg',
    programId: 'politologija',
    workType: 'diplomski',
    academicYear: '2025/2026',
    deadlineDate: '2026-09-15',
    source: 'https://primjer.hr/rokovi',
    fetchedAt: '2026-07-01',
    confirmed: true,
  },
  {
    facultyId: 'fpzg',
    programId: 'politologija',
    workType: 'seminarski',
    academicYear: '2025/2026',
    deadlineDate: '2026-06-01',
    source: 'https://primjer.hr/rokovi',
    fetchedAt: '2026-07-01',
    confirmed: false, // jos nepotvrdeno, ne smije se vratiti
  },
];

describe('findConfirmedDeadline', () => {
  it('vraca potvrden unos kad postoji tocan match', () => {
    const result = findConfirmedDeadline(
      { facultyId: 'fpzg', programId: 'politologija', workType: 'diplomski' },
      registry,
    );
    expect(result?.deadlineDate).toBe('2026-09-15');
  });

  it('vraca null za nepotvrden unos (confirmed:false)', () => {
    const result = findConfirmedDeadline(
      { facultyId: 'fpzg', programId: 'politologija', workType: 'seminarski' },
      registry,
    );
    expect(result).toBeNull();
  });

  it('vraca null kad facultyId nije poznat', () => {
    const result = findConfirmedDeadline({ facultyId: null, workType: 'diplomski' }, registry);
    expect(result).toBeNull();
  });

  it('vraca null kad nema podudaranja u registru', () => {
    const result = findConfirmedDeadline(
      { facultyId: 'grf', workType: 'diplomski' },
      registry,
    );
    expect(result).toBeNull();
  });
});
