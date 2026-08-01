import { describe, expect, it } from 'vitest';
import { analyzeCrossFileSubmission, normalizeSubmissionValue } from './cross-file-submission-consistency';

describe('Cross-file Submission Consistency', () => {
  it('normalizira naslov i pronalazi razliku godine', () => {
    expect(normalizeSubmissionValue('title', '  „Analiza sustava“  ')).toBe('analiza sustava');
    const result = analyzeCrossFileSubmission({
      files: [
        { name: 'Horvat_2026.docx', type: 'docx', values: [{ field: 'title', value: 'Analiza sustava', source: 'docx' }, { field: 'academicYear', value: '2026.', source: 'docx' }] },
        { name: 'Horvat_2026.pdf', type: 'pdf', values: [{ field: 'title', value: 'Analiza sustava', source: 'pdf' }, { field: 'academicYear', value: '2025.', source: 'pdf-metadata' }] },
      ],
      rules: { requiredFields: ['title', 'academicYear'] },
    });
    expect(result.summary.mismatches).toBe(1);
    expect(result.issues.find((issue) => issue.field === 'academicYear')?.status).toBe('mismatch');
    expect(result.issues.find((issue) => issue.field === 'title')?.status).toBe('consistent');
  });

  it('odvaja fuzzy naslov od sigurnog podudaranja i čuva fingerprintove', () => {
    const result = analyzeCrossFileSubmission({
      files: [
        { name: 'rad.docx', type: 'docx', fingerprint: 'doc-a', values: [{ field: 'title', value: 'Utjecaj digitalizacije na studente', source: 'docx' }] },
        { name: 'rad.pdf', type: 'pdf', fingerprint: 'pdf-a', values: [{ field: 'title', value: 'Utjecaj digitalizacije na studente 2026', source: 'pdf' }] },
      ],
    });
    const issue = result.issues.find((entry) => entry.field === 'title');
    expect(issue?.status).toBe('ambiguous');
    expect(result.files.every((file) => file.fingerprint)).toBe(true);
    expect(result.values.every((value) => value.fingerprint)).toBe(true);
  });

  it('prepoznaje godinu u nazivu datoteke kao slab pomoćni dokaz', () => {
    const result = analyzeCrossFileSubmission({ files: [{ name: 'Horvat_rad_2025.pdf', type: 'pdf' }] });
    const year = result.values.find((value) => value.field === 'academicYear');
    expect(year?.value).toBe('2025');
    expect(year?.confidence).toBe('low');
  });
});
