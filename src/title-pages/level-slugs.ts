/**
 * Hrvatski URL slug razine (?razina=diplomski) <-> WorkType kljuc. Izdvojen iz
 * template-loader.ts NAMJERNO: loader importa cijeli templates.json (~0,5 MB), a slugove
 * trebaju i moduli koji zavrsavaju u glavnom index bundleu (tool-suggestions preko
 * title-page-params), pa bi import preko loadera povukao sve predloske u glavni chunk.
 * template-loader ih re-exporta, postojeci potrosaci ostaju netaknuti.
 */
import type { WorkType } from '../profiles/profile-schema';

export const LEVEL_SLUGS: Record<WorkType, string> = {
  seminar: 'seminarski',
  final: 'zavrsni',
  graduate: 'diplomski',
  specialist: 'specijalisticki',
  doctoral: 'doktorski',
  article: 'clanak',
  project: 'projektni',
};

export function workTypeFromSlug(slug: string): WorkType | null {
  const entry = (Object.entries(LEVEL_SLUGS) as Array<[WorkType, string]>)
    .find(([, s]) => s === slug);
  return entry ? entry[0] : null;
}
