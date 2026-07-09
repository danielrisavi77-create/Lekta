import { describe, it, expect } from 'vitest';
import { findUpcomingDeadline, isDeadlineTrusted } from './deadline-registry';
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
    deadlineDate: '2026-08-01',
    source: 'https://primjer.hr/rokovi',
    fetchedAt: '2026-07-01',
    confirmed: false, // ni potvrdeno ni auto-provjereno -> ne smije se vratiti
  },
];

function autoEntry(over: Partial<AcademicDeadlineEntry>): AcademicDeadlineEntry {
  return {
    facultyId: 'pravo',
    workType: 'diplomski',
    academicYear: '2025/2026',
    deadlineDate: '2026-09-01',
    source: 's',
    fetchedAt: '2026-07-09',
    confirmed: false,
    verification: { autoVerified: true, passes: 3, checkedAt: '2026-07-09', sources: ['s'] },
    ...over,
  };
}

describe('findUpcomingDeadline', () => {
  it('vraca potvrden unos kad postoji tocan match', () => {
    const result = findUpcomingDeadline(
      { facultyId: 'fpzg', programId: 'politologija', workType: 'diplomski' },
      registry,
      NOW,
    );
    expect(result?.deadlineDate).toBe('2026-09-15');
  });

  it('vraca null za neprovjeren unos (confirmed:false, bez autoVerified)', () => {
    const result = findUpcomingDeadline(
      { facultyId: 'fpzg', programId: 'politologija', workType: 'seminarski' },
      registry,
      NOW,
    );
    expect(result).toBeNull();
  });

  it('vraca null kad facultyId nije poznat', () => {
    const result = findUpcomingDeadline({ facultyId: null, workType: 'diplomski' }, registry, NOW);
    expect(result).toBeNull();
  });

  it('vraca null kad nema podudaranja u registru', () => {
    const result = findUpcomingDeadline({ facultyId: 'grf', workType: 'diplomski' }, registry, NOW);
    expect(result).toBeNull();
  });

  it('kad ima vise potvrdenih termina, vraca NAJSKORIJI buduci', () => {
    const multi: AcademicDeadlineEntry[] = [
      { facultyId: 'pravo', programId: 'pravo-integrirani', workType: 'diplomski', academicYear: '2025/2026', deadlineDate: '2026-09-14', source: 's', fetchedAt: '2026-07-09', confirmed: true },
      { facultyId: 'pravo', programId: 'pravo-integrirani', workType: 'diplomski', academicYear: '2025/2026', deadlineDate: '2026-08-26', source: 's', fetchedAt: '2026-07-09', confirmed: true },
      { facultyId: 'pravo', programId: 'pravo-integrirani', workType: 'diplomski', academicYear: '2025/2026', deadlineDate: '2026-12-08', source: 's', fetchedAt: '2026-07-09', confirmed: true },
    ];
    const result = findUpcomingDeadline(
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
    const result = findUpcomingDeadline({ facultyId: 'pravo', workType: 'diplomski' }, multi, NOW);
    expect(result?.deadlineDate).toBe('2026-09-14');
  });

  it('vraca null kad su svi potvrdeni termini u proslosti', () => {
    const pastOnly: AcademicDeadlineEntry[] = [
      { facultyId: 'pravo', workType: 'diplomski', academicYear: '2024/2025', deadlineDate: '2025-06-01', source: 's', fetchedAt: '2026-07-09', confirmed: true },
    ];
    const result = findUpcomingDeadline({ facultyId: 'pravo', workType: 'diplomski' }, pastOnly, NOW);
    expect(result).toBeNull();
  });

  it('ukljucuje rok koji je tocno danas (>= danas)', () => {
    const today: AcademicDeadlineEntry[] = [
      { facultyId: 'pravo', workType: 'diplomski', academicYear: '2025/2026', deadlineDate: '2026-07-09', source: 's', fetchedAt: '2026-07-09', confirmed: true },
    ];
    const result = findUpcomingDeadline({ facultyId: 'pravo', workType: 'diplomski' }, today, NOW);
    expect(result?.deadlineDate).toBe('2026-07-09');
  });

  it('vraca auto-provjeren rok (confirmed:false + autoVerified:true) jer ide live', () => {
    const result = findUpcomingDeadline({ facultyId: 'pravo', workType: 'diplomski' }, [autoEntry({})], NOW);
    expect(result?.deadlineDate).toBe('2026-09-01');
    expect(result?.confirmed).toBe(false);
    expect(result?.verification?.autoVerified).toBe(true);
  });

  it('NE vraca unos gdje je autoVerified:false a confirmed:false', () => {
    const notTrusted = autoEntry({ verification: { autoVerified: false, passes: 1, checkedAt: '2026-07-09', sources: ['s'] } });
    const result = findUpcomingDeadline({ facultyId: 'pravo', workType: 'diplomski' }, [notTrusted], NOW);
    expect(result).toBeNull();
  });

  it('kad se natjecu potvrden i auto rok, i dalje vraca NAJSKORIJI buduci bez obzira na vrstu', () => {
    const mixed: AcademicDeadlineEntry[] = [
      autoEntry({ deadlineDate: '2026-08-26' }), // auto, ranije
      { facultyId: 'pravo', workType: 'diplomski', academicYear: '2025/2026', deadlineDate: '2026-09-14', source: 's', fetchedAt: '2026-07-09', confirmed: true }, // rucno, kasnije
    ];
    const result = findUpcomingDeadline({ facultyId: 'pravo', workType: 'diplomski' }, mixed, NOW);
    expect(result?.deadlineDate).toBe('2026-08-26');
    expect(result?.verification?.autoVerified).toBe(true);
  });
});

describe('isDeadlineTrusted', () => {
  it('true za ljudski potvrden', () => {
    expect(isDeadlineTrusted(autoEntry({ confirmed: true, verification: null }))).toBe(true);
  });
  it('true za auto-provjeren', () => {
    expect(isDeadlineTrusted(autoEntry({}))).toBe(true);
  });
  it('false kad nije ni potvrden ni auto-provjeren', () => {
    expect(isDeadlineTrusted(autoEntry({ confirmed: false, verification: null }))).toBe(false);
  });
});
