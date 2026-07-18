/**
 * Loader predlozaka naslovnice (data/title-pages/templates.json), uzor catalog-loader.
 * Tanak prolaz: import + tipiziranje + izbor predloska za (unitId, razina).
 * Fallback lanac: unit+razina -> unit (level=null) -> fakultetski kanonski predlozak
 * (druga vrsta rada, reuse) -> null (genericka grana koda).
 */
import rawTemplates from '../../data/title-pages/templates.json';
import type { WorkType } from '../profiles/profile-schema';
import type { TitlePageTemplate, TemplateProvenanceStatus } from './template-schema';

// Granica prema podacima: JSON inferira siroke tipove, jednom castamo na autorski oblik.
export const TITLE_PAGE_TEMPLATES = rawTemplates as unknown as TitlePageTemplate[];

/**
 * Redoslijed reusea kad fakultet nema predlozak za trazenu vrstu rada: najprije standardni
 * jednojezicni rasporedi (diplomski/zavrsni), doktorski (cesto poseban, dvojezican format)
 * kasnije. Tako svaki fakultet + svaka vrsta rada dobije SVOJ raspored, a ne goli generic.
 */
const REUSE_ORDER: WorkType[] = [
  'graduate', 'final', 'specialist', 'project', 'seminar', 'doctoral', 'article',
];

/**
 * Cista jezgra izbora (testabilna sa sintetickim nizom):
 * tocna razina > level=null > fakultetski predlozak druge vrste rada (REUSE_ORDER) > null.
 */
export function resolveTemplate(
  templates: TitlePageTemplate[],
  unitId: string,
  level: string,
): TitlePageTemplate | null {
  const candidates = templates.filter((t) => t.unitId === unitId);
  if (!candidates.length) return null;
  const exact = candidates.find((t) => t.level === level);
  if (exact) return exact;
  const anyLevel = candidates.find((t) => t.level === null);
  if (anyLevel) return anyLevel;
  for (const pref of REUSE_ORDER) {
    const hit = candidates.find((t) => t.level === pref);
    if (hit) return hit;
  }
  return candidates[0];
}

/** Predlozak za jedinicu i razinu iz zivog registra. */
export function findTitlePageTemplate(unitId: string, level: string): TitlePageTemplate | null {
  return resolveTemplate(TITLE_PAGE_TEMPLATES, unitId, level);
}

/**
 * Predlozak preuzet za drugu vrstu rada: layout ostaje, ali sekundarni (dvojezicni,
 * vrsti rada specificni) worktype retci se izbacuju da se ne prikaze npr. "BACHELOR THESIS"
 * kad korisnik radi seminarski. Primarni worktype redak se ionako slaze iz korisnikova odabira.
 */
export function reuseForLevel(t: TitlePageTemplate): TitlePageTemplate {
  let seenWorktype = false;
  const elements = t.elements.filter((el) => {
    if (el.role !== 'worktype') return true;
    if (seenWorktype) return false;
    seenWorktype = true;
    return true;
  });
  return elements.length === t.elements.length ? t : { ...t, elements };
}

export interface TemplateSelection {
  template: TitlePageTemplate | null;
  /** 'generic' kad predloska nema (badge u UI-u). */
  provenance: TemplateProvenanceStatus;
  /** true kad je predlozak preuzet iz druge vrste rada istog fakulteta (posten badge). */
  levelReused?: boolean;
  /** Vrsta rada iz koje je predlozak preuzet (za tekst badgea), kad je levelReused. */
  reusedFromLevel?: WorkType | null;
}

/** Izbor predloska iz UI stanja; prazan/nepoznat unit daje genericki raspored. */
export function selectTemplate(unitId: string | null | undefined, level: string): TemplateSelection {
  const raw = unitId ? findTitlePageTemplate(unitId, level) : null;
  if (!raw) return { template: null, provenance: 'generic' };
  const levelReused = raw.level !== null && raw.level !== level;
  return {
    template: levelReused ? reuseForLevel(raw) : raw,
    provenance: raw.provenance.status,
    levelReused,
    reusedFromLevel: levelReused ? raw.level : null,
  };
}

// Slugovi razine zive u level-slugs.ts (bez templates.json u lancu, v. komentar ondje);
// re-export cuva postojece potrosace ovog modula.
export { LEVEL_SLUGS, workTypeFromSlug } from './level-slugs';
