// src/submission/deadline-registry.ts
//
// Cista funkcija (bez DOM-a, bez mreze). Ocekuje da je registar vec ucitan
// (import iz data/submission/academic-deadlines.json). Vraca SAMO confirmed:true
// unose, isto nacelo kao VERIFICATION_PIPELINE.md (neverificirano se ne koristi).

import type { AcademicDeadlineEntry } from './types';

export interface DeadlineLookupInput {
  facultyId: string | null;
  programId?: string | null;
  workType: string;
}

export function findConfirmedDeadline(
  input: DeadlineLookupInput,
  registry: AcademicDeadlineEntry[],
): AcademicDeadlineEntry | null {
  if (!input.facultyId) return null;

  const match = registry.find(
    (entry) =>
      entry.confirmed &&
      entry.facultyId === input.facultyId &&
      entry.workType === input.workType &&
      (input.programId ? entry.programId === input.programId : true),
  );

  return match ?? null;
}
