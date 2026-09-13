/**
 * ULAZNI PUTOVI ODABIRA PROFILA, izdvojeno iz `src/ui/app.ts` (2026-09-12).
 *
 * Postoje tri nacina da fakultet dodje u obrazac prije nego ga korisnik sam odabere, i vazan je
 * njihov REDOSLIJED PRVENSTVA, jer se svi mogu pojaviti u istom ucitavanju:
 *
 *   1. `restorePreferences()`  zapamcen analizatorski odabir (lekta.preferences.v2)
 *   2. `facultyContextSelection`  medju-alatni signal s citatnih i naslovnickih stranica
 *   3. `urlSelection`  izricit `?unit=` link, koji ima KRAJNJE prvenstvo
 *
 * Ovdje zive samo 2 i 3, i to kao CISTA ODLUKA: funkcije vracaju sto BI se odabralo, a dodir DOM-a
 * (`applySelectionIds`) ostaje u `app.ts`. Time je prvenstvo testabilno bez preglednika, a bilo je
 * upravo ono sto se lako izgubi: obje funkcije su prije bile tijela u monolitu, jedna do druge, a
 * njihov medjusobni poredak bio je zapisan samo u komentaru.
 */

/** Jedinica onako kako je vidi `allUnits()`; sira definicija ovdje ne treba. */
export interface UnitLike {
  id: string;
  institutionId: string;
}

/** Polja koja ovi ulazi smiju postaviti. Uzi skup od punog odabira, i to je namjerno. */
export type UlazniOdabir = Partial<Record<'institution' | 'unit' | 'program' | 'workType', string>>;

/**
 * Medju-alatni signal (`lekta.faculty-context`): isti fakultet koji je korisnik vec odabrao na
 * citatnim ili naslovnickim alatima.
 *
 * PRIMJENJUJE SE SAMO NA PRAZNO. Kad zapamcene analizatorske postavke vec nose `unit`, ovaj ulaz
 * SUTI: faculty-context je namjerno tanji signal ("popuni prazno") i ne smije prepisati bogatiju
 * analizatorsku povijest.
 */
export function facultyContextSelection(
  zapamcenePostavke: { unit?: unknown } | null | undefined,
  ctx: { unitId?: string; program?: string; level?: string } | null | undefined,
  units: readonly UnitLike[],
): UlazniOdabir | null {
  if (zapamcenePostavke && zapamcenePostavke.unit) return null;
  if (!ctx?.unitId) return null;
  const u = units.find((x) => x.id === ctx.unitId);
  if (!u) return null;

  const sel: UlazniOdabir = { institution: u.institutionId, unit: u.id };
  if (ctx.program) sel.program = ctx.program;
  if (ctx.level) sel.workType = ctx.level;
  return sel;
}

/**
 * Izricit link s alat-stranice ili Katedrin handoff:
 * `?unit=<unitId>[&work=<slug>][&project=<id>]`.
 *
 * Posjetitelj koji dolazi sa stranice SVOG fakulteta ne mora ga ponovno traziti u izborniku. Ima
 * KRAJNJE prvenstvo, dakle primjenjuje se i preko zapamcenog odabira: izricit link je jaca izjava
 * namjere od pamcenja.
 *
 * NEPOZNAT `unit` I NEPOZNAT `work` SU TIHI no-op, i to svaki NEOVISNO o drugom: kriv slug vrste
 * rada ne smije ponistiti ispravan fakultet, ni obrnuto.
 *
 * `project` je nepromijenjen, netipiziran Katedra Project Manifest ID: Lekta ga samo prenosi
 * natrag u rezultat, nikad ga ne tumaci ni validira.
 */
export function urlSelection(
  params: URLSearchParams,
  units: readonly UnitLike[],
  // Vraca `null` za nepoznat slug, i to se ovdje postuje kao tihi no-op.
  workTypeFromSlug: (slug: string) => string | null,
): { selection: UlazniOdabir; projectId: string | null } {
  const uid = (params.get('unit') || '').trim();
  const workType = workTypeFromSlug((params.get('work') || '').trim());
  const project = (params.get('project') || '').trim();

  const selection: UlazniOdabir = {};
  if (uid) {
    const u = units.find((x) => x.id === uid);
    if (u) { selection.institution = u.institutionId; selection.unit = u.id; }
  }
  if (workType) selection.workType = workType;

  return { selection, projectId: project || null };
}
