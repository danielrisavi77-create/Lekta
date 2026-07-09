/**
 * FPZG kalendar predaje (CLAUDE.md backlog 1 i 3). Hidrira
 * data/submission/fpzg-calendar.json. Engine ga cita dinamicki (rokovi po vrsti
 * rada), pa tip ostaje labav dok traje split.
 */
import rawCalendar from '../../data/submission/fpzg-calendar.json';
import rawDeadlines from '../../data/submission/academic-deadlines.json';
import type { SubmissionCalendar } from '../profiles/profile-schema';
import type { AcademicDeadlineEntry } from './types';

export const FPZG_SUBMISSION_CALENDAR = rawCalendar as unknown as SubmissionCalendar;

/**
 * Registar potvrdenih rokova predaje (data/submission/academic-deadlines.json).
 * Prazan niz je ispravno pocetno stanje; findConfirmedDeadline vrati null dok se
 * ne unesu potvrdeni rokovi, pa se toggle podsjetnika ne prikazuje. Vidi README.
 */
export const ACADEMIC_DEADLINES = rawDeadlines as AcademicDeadlineEntry[];
