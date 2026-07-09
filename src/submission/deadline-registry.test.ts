import { describe, it, expect } from 'vitest';
import { findConfirmedDeadline } from './deadline-registry';
import type { AcademicDeadlineEntry } from './types';

// Fiksni "danas" da test ne ovisi o sistemskom satu.
const NOW = new Date('2026-07-09T00:00:00Z');

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
      NOW,
    );
    expect(result?.deadlineDate).toBe('2026-09-15');
  });

  it('vraca null za nepotvrden unos (confirmed:false)', () => {
    const result = findConfirmedDeadline(
      { facultyId: 'fpzg', programId: 'politologija', workType: 'seminarski' },
      registry,
      NOW,
    );
    expect(result).toBeNull();
  });

  it('vraca null kad facultyId nije poznat', () => {
    const result = findConfirmedDeadline({ facultyId: null, workType: 'diplomski' }, registry, NOW);
    expect(result).toBeNull();
  });

  it('vraca null kad nema podudaranja u registru', () => {
    const result = findConfirmedDeadline(
      { facultyId: 'grf', workType: 'diplomski' },
      registry,
      NOW,
    );
    expect(result).toBeNull();
  });

  it('kad ima vise potvrdenih termina, vraca NAJSKORIJI buduci', () => {
    const multi: AcademicDeadlineEntry[] = [
      { facultyId: 'pravo', programId: 'pravo-integrirani', workType: 'diplomski', academicYear: '2025/2026', deadlineDate: '2026-09-14', source: 's', fetchedAt: '2026-07-09', confirmed: true },
      { facultyId: 'pravo', programId: 'pravo-integrirani', workType: 'diplomski', academicYear: '2025/2026', deadlineDate: '2026-08-26', source: 's', fetchedAt: '2026-07-09', confirmed: true },
      { facultyId: 'pravo', programId: 'pravo-integrirani', workType: 'diplomski', academicYear: '2025/2026', deadlineDate: '2026-12-08', source: 's', fetchedAt: '2026-07-09', confirmed: true },
    ];
    const result = findConfirmedDeadline(
      { facultyId: 'pravo', programId: 'pravo-integrirani', workType: 'diplomski' },
      multi,
      NOW,
    );
    expect(result?.deadlineDate).toBe('2026-08-26');
  });

  it('preskace prosle termine i vraca prvi buduci', () => {
    const multi: AcademicDeadlineEntry[] = [
      { facultyId: 'pravo', workType: 'diplomski', academicYear: '2025/2026', deadlineDate: '2025-11-10', source: 's', fetchedAt: '2026-07-09', confirmed: true },
      { facultyId: 'pravo', workType: 'diplomski', academicYear: '2025/2026', deadlineDate: '2026-07-01', source: 's', fetchedAt: '2026-07-09', confirmed: true },
      { facultyId: 'pravo', workType: 'diplomski', academicYear: '2025/2026', deadlineDate: '2026-09-14', source: 's', fetchedAt: '2026-07-09', confirmed: true },
    ];
    const result = findConfirmedDeadline({ facultyId: 'pravo', workType: 'diplomski' }, multi, NOW);
    expect(result?.deadlineDate).toBe('2026-09-14');
  });

  it('vraca null kad su svi potvrdeni termini u proslosti', () => {
    const pastOnly: AcademicDeadlineEntry[] = [
      { facultyId: 'pravo', workType: 'diplomski', academicYear: '2024/2025', deadlineDate: '2025-06-01', source: 's', fetchedAt: '2026-07-09', confirmed: true },
    ];
    const result = findConfirmedDeadline({ facultyId: 'pravo', workType: 'diplomski' }, pastOnly, NOW);
    expect(result).toBeNull();
  });

  it('ukljucuje rok koji je tocno danas (>= danas)', () => {
    const today: AcademicDeadlineEntry[] = [
      { facultyId: 'pravo', workType: 'diplomski', academicYear: '2025/2026', deadlineDate: '2026-07-09', source: 's', fetchedAt: '2026-07-09', confirmed: true },
    ];
    const result = findConfirmedDeadline({ facultyId: 'pravo', workType: 'diplomski' }, today, NOW);
    expect(result?.deadlineDate).toBe('2026-07-09');
  });
});
