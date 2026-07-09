// src/submission/deadline-registry.ts
//
// Cista funkcija (bez DOM-a, bez mreze). Ocekuje da je registar vec ucitan
// (import iz data/submission/academic-deadlines.json). Vraca SAMO confirmed:true
// unose, isto nacelo kao VERIFICATION_PIPELINE.md (neverificirano se ne koristi).
//
// Kad fakultet objavljuje vise termina po godini, u registru moze biti vise
// potvrdenih unosa za isti (facultyId, workType, programId). Tada vracamo
// NAJSKORIJI BUDUCI rok (deadlineDate >= danas), jer proslu obranu nema smisla
// nuditi za podsjetnik. `now` je injektabilan zbog determinizma u testu.

import type { AcademicDeadlineEntry } from './types';

export interface DeadlineLookupInput {
  facultyId: string | null;
  programId?: string | null;
  workType: string;
}

export function findConfirmedDeadline(
  input: DeadlineLookupInput,
  registry: AcademicDeadlineEntry[],
  now: Date = new Date(),
): AcademicDeadlineEntry | null {
  if (!input.facultyId) return null;

  const todayIso = now.toISOString().slice(0, 10); // YYYY-MM-DD

  const matches = registry.filter(
    (entry) =>
      entry.confirmed &&
      entry.facultyId === input.facultyId &&
      entry.workType === input.workType &&
      (input.programId ? entry.programId === input.programId : true) &&
      entry.deadlineDate >= todayIso,
  );

  if (matches.length === 0) return null;

  // ISO YYYY-MM-DD je leksikografski usporediv, pa uzlazni sort daje najskoriji rok.
  matches.sort((a, b) => a.deadlineDate.localeCompare(b.deadlineDate));
  return matches[0];
}
