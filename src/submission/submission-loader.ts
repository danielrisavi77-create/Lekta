/**
 * FPZG kalendar predaje (CLAUDE.md backlog 1 i 3). Hidrira
 * data/submission/fpzg-calendar.json. Engine ga cita dinamicki (rokovi po vrsti
 * rada), pa tip ostaje labav dok traje split.
 */
import rawCalendar from '../../data/submission/fpzg-calendar.json';
import type { SubmissionCalendar } from '../profiles/profile-schema';

export const FPZG_SUBMISSION_CALENDAR = rawCalendar as unknown as SubmissionCalendar;
