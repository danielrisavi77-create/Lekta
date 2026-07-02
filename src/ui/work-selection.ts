/**
 * Cista, tipizirana odlucivacka logika za automatski odabir vrste rada i citatnog
 * stila u carobnjaku (feature 2 i 3). Izdvojeno iz monolita src/ui/app.ts bez promjene
 * ponasanja: funkcije vjerno preslikavaju autoSelectWorkType/exactWorkTypes (vrsta rada)
 * i syncProfileContext (citatni stil). Prvi korak cijepanja monolita (backlog 3): logika
 * je sada testabilna i DOM-free, a app.ts je moze uvesti kad se dio UI-a rewire-a.
 *
 * NE dira DOM. Pozivatelj (app.ts) i dalje cita/pise <select> vrijednosti; ovdje su samo
 * pravila odluke.
 */

/** Vrsta rada koju profil moze imati (WORK_TYPE_LABELS kljucevi u app.ts). */
export type WorkType = 'seminar' | 'final' | 'graduate' | 'specialist' | 'doctoral' | 'article' | 'project';

/**
 * Prioritet pri automatskom odabiru vrste rada kad studij podrzava vise vrsta.
 * Identican poretku u autoSelectWorkType() (app.ts): visa akademska razina prva.
 */
export const WORK_TYPE_PRIORITY: readonly WorkType[] = [
  'doctoral',
  'specialist',
  'graduate',
  'final',
  'article',
  'project',
  'seminar',
];

/** Minimalni oblik registarskog profila koji ove funkcije citaju. */
export interface ProfileLike {
  unitId: string;
  programs: string[];
  workTypes?: string[];
}

/** Definicija profila s pravilima (za citatni stil). */
export interface DefinitionLike {
  rules?: { recommendedCitation?: string; citationLocked?: boolean } | null;
}

/**
 * Skup vrsta rada koje odabrani studij (unit + program) stvarno ima kao poseban profil.
 * Preslikava exactWorkTypes() u app.ts.
 */
export function workTypesForSelection(
  registry: ProfileLike[],
  unitId: string,
  program: string,
): Set<WorkType> {
  const out = new Set<WorkType>();
  for (const d of registry) {
    if (d.unitId === unitId && d.programs.includes(program)) {
      for (const w of d.workTypes || []) out.add(w as WorkType);
    }
  }
  return out;
}

/**
 * Odaberi vrstu rada za odabrani studij. Preslikava autoSelectWorkType() u app.ts:
 *   - nema poznatih vrsta -> zadrzi trenutnu (opca provjera),
 *   - trenutna je medju podrzanima -> zadrzi je (korisnikov izbor ima prednost),
 *   - inace uzmi najvisu po prioritetu, uz fallback na prvu u skupu.
 */
export function pickWorkType(exact: Set<WorkType>, current: string): string {
  if (!exact.size) return current;
  if (exact.has(current as WorkType)) return current;
  const byPriority = WORK_TYPE_PRIORITY.find((w) => exact.has(w));
  return byPriority || [...exact][0];
}

/**
 * Je li vrsta rada odredjena studijem (zakljucava se u UI-u). Preslikava uvjet
 * exact.size===1 u updateWorkTypeSupport() (app.ts).
 */
export function isWorkTypeLocked(exact: Set<WorkType>): boolean {
  return exact.size === 1;
}

/**
 * Preporuceni citatni stil odabranog profila, ili null ako ga profil ne propisuje.
 * Preslikava syncProfileContext(): d?.rules?.recommendedCitation.
 */
export function citationForDefinition(def: DefinitionLike | null | undefined): string | null {
  return def?.rules?.recommendedCitation || null;
}

/**
 * Je li citatni stil zakljucan profilom (UI onemogucuje promjenu). Preslikava
 * citationLocked granu u syncProfileContext().
 */
export function isCitationLocked(def: DefinitionLike | null | undefined): boolean {
  return !!def?.rules?.citationLocked;
}
