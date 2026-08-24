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

/** Definicija profila s pravilima (za citatni stil i jezik rada). */
export interface DefinitionLike {
  rules?: {
    recommendedCitation?: string;
    citationLocked?: boolean;
    documentLanguage?: string;
    languageLocked?: boolean;
  } | null;
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
 * Je li vrsta rada odredjena studijem. NAPOMENA: od 2026-07 UI vise NE zakljucava selektor
 * (svaka vrsta je provjerljiva - poseban profil ili opci baseline); ova cista funkcija ostaje
 * radi regresijskih testova i eventualnog informativnog prikaza.
 */
export function isWorkTypeLocked(exact: Set<WorkType>): boolean {
  return exact.size === 1;
}

/**
 * Zadana vrsta rada prema RAZINI studija (iz naziva programa). Preddiplomski student najcesce
 * pise seminar pa je to razuman default umjesto teze; diplomski/doktorski default na svoju tezu.
 * REDOSLIJED je kljucan jer "Prijediplomski"/"Preddiplomski" SADRZE substring "diplomski":
 * 'integrirani' -> graduate; pa preddiplomski/prijediplomski -> seminar; pa tek standalone
 * 'diplomski' -> graduate (npr. "integrirani prijediplomski i diplomski studij Pravo" -> graduate,
 * a "Prijediplomski studij Politologija" -> seminar). Bez poklapanja pada na pickWorkType.
 */
const LEVEL_DEFAULT_RULES: readonly (readonly [WorkType, RegExp])[] = [
  ['doctoral', /doktor/i],
  ['specialist', /specijalist/i],
  ['graduate', /integrirani/i],
  ['seminar', /prijediplomski|preddiplomski|prvostupni/i],
  ['graduate', /diplomski/i],
];
export function defaultWorkTypeForProgram(program: string, exact: Set<WorkType>, current: string): string {
  for (const [wt, re] of LEVEL_DEFAULT_RULES) if (re.test(program)) return wt;
  return pickWorkType(exact, current);
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

/**
 * Jezik rada koji profil propisuje, ili null ako ga ne propisuje (tada bira korisnik).
 *
 * ZASTO postoji: engine detektira strukturu prema jeziku (detectStructure trazi 'uvod'/'zakljucak'
 * za hr, 'introduction'/'conclusion' za en), a neki studiji pisu rad ISKLJUCIVO na engleskom
 * (npr. Algebrin diplomski). Bez ovoga bi takav rad lazno padao na "Osnovni dijelovi rada" jer bi
 * se u engleskom tekstu trazili hrvatski nazivi. Namjerno NIJE checkId: jezik se ne BODUJE (ne
 * detektiramo jezik dokumenta) nego KONFIGURIRA analizu, isto kao citationLocked, koji takodjer
 * zivi izravno u rules i nije compiled check.
 *
 * Vrijednost mora biti jedan od kljuceva #docLanguage ('hr' | 'en' | 'other').
 */
export function languageForDefinition(def: DefinitionLike | null | undefined): string | null {
  return def?.rules?.documentLanguage || null;
}

/**
 * Je li jezik rada zakljucan profilom (UI onemogucuje promjenu). Zakljucava se SAMO kad sluzbeni
 * izvor propisuje jedan jezik; kad dopusta izbor (npr. "hrvatskim ili engleskim"), profil ne smije
 * ni predlagati ni zakljucavati, nego izbor ostaje korisniku.
 */
export function isLanguageLocked(def: DefinitionLike | null | undefined): boolean {
  return !!def?.rules?.languageLocked;
}

// --- Rutiranje odabira u profil ---------------------------------------------------------------
// Do 2026-08-22 je ovaj lanac zivio samo u src/ui/app.ts, ucitan iz DOM-a (populatePrograms /
// eligibleDefinitions / findVerifiedDefinition), pa se nije dao testirati bez carobnjaka. Odluka
// koji profil student dobije za (jedinica, program, vrsta rada) je pritom najosjetljivija tocka
// proizvoda: promasaj ne pada glasno nego tiho posluzi opci baseline umjesto fakultetskih pravila.
// Funkcije ispod su DOM-free i app.ts ih ZOVE (nisu zrcalo koje odluta), a tests/profile-routing
// vrti ih preko svih kataloskih trojki.

/** Minimalni oblik kataloske jedinice koji rutiranje cita. */
export interface UnitLike {
  id: string;
  programs?: string[];
}

/** Profil kakav rutiranje treba: identitet + varijanta (pravila ga ovdje ne zanimaju). */
export interface RoutableProfile extends ProfileLike {
  id: string;
  variant?: string;
}

/** Zamjena za jedinicu bez ijednog programa u katalogu. */
export const FALLBACK_PROGRAM = 'Opći profil ustanove';

/**
 * Programi koje carobnjak stvarno ponudi za jedinicu, tocno kako ih renderira populatePrograms():
 * krovni "Opći ..." unos se skriva kad SVAKI konkretan studij vec ima vlastiti profil (inace bi
 * student birao izmedju smjera i krovnog profila bez razloga). Sortirano hrvatskom kolacijom, jer
 * je prvi element ujedno zadani odabir.
 *
 * Krovni se unos skriva SAMO ako je stvarno redundantan, to jest ako je svaki profil koji ga gadja
 * dostizan i preko nekog konkretnog studija. Bez tog uvjeta krovni profil koji NE navodi nijedan
 * konkretan studij (danas adu-opci-diplomski) postaje nedostizan: broji se u pokrivenosti, a
 * nijedan student ga ne moze odabrati.
 */
export function visibleProgramsForUnit(registry: RoutableProfile[], unit: UnitLike): string[] {
  const programs = unit.programs?.length ? unit.programs : [FALLBACK_PROGRAM];
  const specific = programs.filter((p) => !/^Opći/.test(p));
  const allSpecificCovered =
    specific.length > 0 &&
    specific.every((p) => registry.some((d) => d.unitId === unit.id && d.programs.includes(p)));
  const umbrellaRedundant = programs
    .filter((p) => /^Opći/.test(p))
    .every((p) =>
      registry
        .filter((d) => d.unitId === unit.id && d.programs.includes(p))
        .every((d) => d.programs.some((other) => other !== p && specific.includes(other))),
    );
  const visible = allSpecificCovered && umbrellaRedundant ? specific : programs;
  return [...visible].sort((a, b) => String(a).localeCompare(String(b), 'hr'));
}

/** Profili koji odgovaraju odabiru (jedinica + program + vrsta rada). Preslikava eligibleDefinitions(). */
export function eligibleDefinitionsFor<T extends RoutableProfile>(
  registry: T[],
  unitId: string,
  program: string,
  workType: string,
): T[] {
  return registry.filter(
    (d) => d.unitId === unitId && (d.workTypes || []).includes(workType) && d.programs.includes(program),
  );
}

/**
 * Konacan profil za odabir: trazena varijanta, pa profil bez varijante, inace null (= opci baseline).
 * Preslikava findVerifiedDefinition(). Vise od jednog kandidata bez varijante znaci da ishod ovisi
 * o poretku u registru; tests/profile-routing to sprjecava nad cijelim katalogom.
 */
export function resolveDefinition<T extends RoutableProfile>(defs: T[], variant: string): T | null {
  return defs.find((d) => d.variant === variant) || defs.find((d) => !d.variant) || null;
}
