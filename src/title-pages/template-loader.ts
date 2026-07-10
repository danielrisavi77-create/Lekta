/**
 * Loader predlozaka naslovnice (data/title-pages/templates.json), uzor catalog-loader.
 * Tanak prolaz: import + tipiziranje + izbor predloska za (unitId, razina).
 * Fallback lanac: unit+razina -> unit (level=null) -> null (genericka grana koda).
 */
import rawTemplates from '../../data/title-pages/templates.json';
import type { WorkType } from '../profiles/profile-schema';
import type { TitlePageTemplate, TemplateProvenanceStatus } from './template-schema';

// Granica prema podacima: JSON inferira siroke tipove, jednom castamo na autorski oblik.
export const TITLE_PAGE_TEMPLATES = rawTemplates as unknown as TitlePageTemplate[];

/** Cista jezgra izbora (testabilna sa sintetickim nizom): tocna razina > level=null > null. */
export function resolveTemplate(
  templates: TitlePageTemplate[],
  unitId: string,
  level: string,
): TitlePageTemplate | null {
  const candidates = templates.filter((t) => t.unitId === unitId);
  return (
    candidates.find((t) => t.level === level) ||
    candidates.find((t) => t.level === null) ||
    null
  );
}

/** Predlozak za jedinicu i razinu iz zivog registra. */
export function findTitlePageTemplate(unitId: string, level: string): TitlePageTemplate | null {
  return resolveTemplate(TITLE_PAGE_TEMPLATES, unitId, level);
}

export interface TemplateSelection {
  template: TitlePageTemplate | null;
  /** 'generic' kad predloska nema (badge u UI-u). */
  provenance: TemplateProvenanceStatus;
}

/** Izbor predloska iz UI stanja; prazan/nepoznat unit daje genericki raspored. */
export function selectTemplate(unitId: string | null | undefined, level: string): TemplateSelection {
  const template = unitId ? findTitlePageTemplate(unitId, level) : null;
  return { template, provenance: template ? template.provenance.status : 'generic' };
}

/** Hrvatski URL slug razine (?razina=diplomski) <-> WorkType kljuc. */
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
