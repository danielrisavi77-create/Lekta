// src/submission/deadline-registry.ts
//
// Cista funkcija (bez DOM-a, bez mreze). Ocekuje da je registar vec ucitan
// (import iz data/submission/academic-deadlines.json). Vraca SAMO rokove kojima
// vjerujemo: ljudski potvrdene (confirmed) ILI auto-provjerene (verification.
// autoVerified). Oboje smiju ici live; UI iskreno oznaci koji je koji. Neprovjereno
// (confirmed:false bez autoVerified) se NE koristi, isto nacelo kao VERIFICATION_PIPELINE.md.
//
// Kad fakultet objavljuje vise termina po godini, u registru je vise unosa za isti
// (facultyId, workType, programId). Tada vracamo NAJSKORIJI BUDUCI rok
// (deadlineDate >= danas), jer proslu obranu nema smisla nuditi za podsjetnik.
// `now` je injektabilan zbog determinizma u testu.

import type { AcademicDeadlineEntry } from './types';

export interface DeadlineLookupInput {
  facultyId: string | null;
  programId?: string | null;
  workType: string;
}

/** Unos je pouzdan (smije se prikazati) ako ga je covjek potvrdio ILI je prosao auto-provjeru. */
export function isDeadlineTrusted(entry: AcademicDeadlineEntry): boolean {
  return entry.confirmed === true || entry.verification?.autoVerified === true;
}

export function findUpcomingDeadline(
  input: DeadlineLookupInput,
  registry: AcademicDeadlineEntry[],
  now: Date = new Date(),
): AcademicDeadlineEntry | null {
  if (!input.facultyId) return null;

  const todayIso = now.toISOString().slice(0, 10); // YYYY-MM-DD

  const matches = registry.filter(
    (entry) =>
      isDeadlineTrusted(entry) &&
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
