/**
 * Loader predlozaka naslovnice (data/title-pages/templates.json), uzor catalog-loader.
 * Tanak prolaz: import + tipiziranje + izbor predloska za (unitId, razina).
 * Fallback lanac: unit+razina -> unit (level=null) -> fakultetski kanonski predlozak
 * (druga vrsta rada, reuse) -> null (genericka grana koda).
 *
 * TITLE_PAGE_TEMPLATES je LAGANI indeks (perf: skini ~0,5 MB s naslovnica-*.js glavnog chunka).
 * Nosi samo polja koja se citaju PRIJE stvarnog odabira predloska (id, unitId, level, name,
 * provenance.status, status) - vidi renderCoverageCount u naslovnica-page.ts. Teska polja
 * (elements, marginsCm, derivation, puna provenijencija) dolaze LIJENO preko
 * ensureTemplatesHeavy(), koji dinamicki ucita templates-heavy.json i spoji ga U ISTE objekte
 * (mutacija in place, isti obrazac kao profile-registry.ensureProfileRules). Izvor:
 * scripts/gen-title-page-split.mjs; drift hvata tests/title-page-loader.test.ts.
 */
import rawIndex from '../../data/title-pages/templates-index.json';
import type { WorkType } from '../profiles/profile-schema';
import type { TitlePageTemplate, TemplateProvenanceStatus } from './template-schema';

// Granica prema podacima: JSON inferira siroke tipove, jednom castamo na autorski oblik.
export const TITLE_PAGE_TEMPLATES = rawIndex as unknown as TitlePageTemplate[];

let _templatesHeavyReady: Promise<void> | null = null;
let _templatesHeavyLoaded = false;
/**
 * Lijeno ucita puna polja predloska (elements/marginsCm/derivation/puna provenijencija) i spoji
 * ih u TITLE_PAGE_TEMPLATES (mutacija in place). Memoizirano: heavy chunk se dohvaca tocno
 * jednom. Pozovi (i await) PRIJE citanja .elements/.marginsCm/.notes/pune .provenance (render()
 * u naslovnica-page.ts); renderCoverageCount (samo .unitId) radi i bez ovoga.
 */
export function ensureTemplatesHeavy(): Promise<void> {
  if (!_templatesHeavyReady) {
    _templatesHeavyReady = import('../../data/title-pages/templates-heavy.json').then((mod) => {
      const heavy = ((mod as { default?: unknown }).default ?? mod) as Record<string, TitlePageTemplate>;
      for (const entry of TITLE_PAGE_TEMPLATES) {
        const full = heavy[entry.id];
        if (full) Object.assign(entry, full);
      }
      _templatesHeavyLoaded = true;
    });
  }
  return _templatesHeavyReady;
}

/** Sinkrona provjera (bez await-a): je li heavy chunk vec spojen. Koristi render() u
 *  naslovnica-page.ts da preskoči nepotreban await (i njegov mikrotask tik) kad je vec ucitan. */
export function templatesHeavyLoaded(): boolean {
  return _templatesHeavyLoaded;
}

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
