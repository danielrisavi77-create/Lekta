/**
 * Detekcija nepokrivene celije za waitlist (WAITLIST_NEPOKRIVENI_FAKULTETI.md sekcije 2, 4).
 *
 * Cista odluka, bez DOM-a i bez uvoza registra: app.ts izracuna par boolean signala iz
 * VERIFIED_PROFILE_REGISTRY (preko `cellCoverage`) i preda ih `detectWaitlist`. Time je
 * logika jedinicno testabilna, a "pokriveno" znaci tocno ono sto engine vidi: postoji li
 * verificiran profil za (fakultet, program, vrsta rada); ako ne, karticu vodi genericki sloj
 * pa je celija nepokrivena. Ovaj modul NE boduje i ne pise nista, samo klasificira.
 */

export type WaitlistState =
  | 'covered'
  | 'faculty-uncovered'
  | 'worktype-uncovered'
  | 'unknown-faculty';

/** Minimalan oblik profila kojeg cellCoverage cita (podskup VerifiedProfile). */
export interface CoverageRow {
  unitId: string;
  programs: string[];
  workTypes: string[];
}

export interface WaitlistCell {
  /** unitId iz kataloga, ili null kad fakultet nije u katalogu (slobodni unos). */
  facultyId: string | null;
  /** Prikazno ime (naziv jedinice ili slobodni unos). */
  facultyName: string;
  /** Naziv programa, ili null (slobodni unos / nepoznat). */
  program: string | null;
  /** Profilska vrsta rada (seminar/final/graduate/...), ne naplatna. */
  workType: string;
}

export interface WaitlistDetection {
  state: WaitlistState;
  uncovered: boolean;
  cell: WaitlistCell;
  /** Kljuc za dedup po sesiji (safeStorage): jedan upis po celiji po sesiji. */
  dedupeKey: string;
}

/** Signali pokrivenosti izracunati iz registra za jednu (fakultet, program, vrsta rada). */
export interface CellCoverage {
  /** Postoji verificiran profil za tocno ovu vrstu rada (engine ga ne bi genericki nadomjestio). */
  hasProfileForCell: boolean;
  /** Program je pokriven za NEKU drugu vrstu rada u istoj jedinici (razlika stanja A vs B). */
  unitCoversProgramOtherWorkType: boolean;
}

/**
 * Izracunaj signale pokrivenosti iz registra. Odgovara app-ovoj `eligibleDefinitions`
 * (unitId + program + workType): ako je prazno, engine pada na genericki profil.
 */
export function cellCoverage(
  registry: readonly CoverageRow[],
  facultyId: string,
  program: string,
  workType: string,
): CellCoverage {
  const rowsForProgram = registry.filter(
    (d) => d.unitId === facultyId && d.programs.includes(program),
  );
  const hasProfileForCell = rowsForProgram.some((d) => d.workTypes.includes(workType));
  return {
    hasProfileForCell,
    unitCoversProgramOtherWorkType: !hasProfileForCell && rowsForProgram.length > 0,
  };
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Dedup kljuc: znana celija po (fakultet|program|vrsta), nepoznat fakultet po normaliziranom imenu. */
export function dedupeKeyFor(cell: WaitlistCell): string {
  if (cell.facultyId === null) return `wl:raw:${normalizeName(cell.facultyName)}`;
  return `wl:${cell.facultyId}|${cell.program ?? ''}|${cell.workType}`;
}

/**
 * Klasificiraj celiju. `blocked` (izvor nedohvatljiv u coverage matrici) tretira se kao
 * nepokriveno, jer korisnik i dalje dobiva samo genericki sloj. Redoslijed odluka:
 * nepoznat fakultet > blokiran > ima profil (pokriveno) > pokriven drugi work_type > nepokriven.
 */
export function detectWaitlist(input: {
  facultyId: string | null;
  facultyName: string;
  program: string | null;
  workType: string;
  coverage?: CellCoverage;
  blocked?: boolean;
}): WaitlistDetection {
  const cell: WaitlistCell = {
    facultyId: input.facultyId,
    facultyName: input.facultyName,
    program: input.program,
    workType: input.workType,
  };
  const dedupeKey = dedupeKeyFor(cell);

  if (input.facultyId === null) {
    return { state: 'unknown-faculty', uncovered: true, cell, dedupeKey };
  }
  const cov = input.coverage ?? { hasProfileForCell: false, unitCoversProgramOtherWorkType: false };
  if (input.blocked) {
    return { state: 'faculty-uncovered', uncovered: true, cell, dedupeKey };
  }
  if (cov.hasProfileForCell) {
    return { state: 'covered', uncovered: false, cell, dedupeKey };
  }
  if (cov.unitCoversProgramOtherWorkType) {
    return { state: 'worktype-uncovered', uncovered: true, cell, dedupeKey };
  }
  return { state: 'faculty-uncovered', uncovered: true, cell, dedupeKey };
}
