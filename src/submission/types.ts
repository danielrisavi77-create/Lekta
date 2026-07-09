// src/submission/types.ts

export interface AcademicDeadlineEntry {
  facultyId: string;
  programId?: string | null;
  workType: string;
  academicYear: string;
  deadlineDate: string; // ISO YYYY-MM-DD
  source: string;
  fetchedAt: string; // ISO YYYY-MM-DD
  confirmed: boolean;
}
