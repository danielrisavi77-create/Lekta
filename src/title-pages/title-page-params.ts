/**
 * URL parametri alata naslovnice (?fakultet=fpzg&razina=diplomski&smjer=...).
 * Ciste funkcije bez DOM-a (testabilne); naslovnica-page.ts ih veze na location/history.
 */
import type { WorkType } from '../profiles/profile-schema';
import { LEVEL_SLUGS, workTypeFromSlug } from './level-slugs';

export interface TitlePageParams {
  unitId?: string;
  level?: WorkType;
  program?: string;
}

export function parseTitlePageParams(search: string): TitlePageParams {
  const qs = new URLSearchParams(search);
  const out: TitlePageParams = {};
  const unitId = (qs.get('fakultet') || '').trim();
  if (unitId) out.unitId = unitId;
  const level = workTypeFromSlug((qs.get('razina') || '').trim());
  if (level) out.level = level;
  const program = (qs.get('smjer') || '').trim();
  if (program) out.program = program;
  return out;
}

/** Query string (bez "?"), ili prazan string kad nema nijednog parametra. */
export function serializeTitlePageParams(params: TitlePageParams): string {
  const qs = new URLSearchParams();
  if (params.unitId) qs.set('fakultet', params.unitId);
  if (params.level) qs.set('razina', LEVEL_SLUGS[params.level]);
  if (params.program) qs.set('smjer', params.program);
  return qs.toString();
}
