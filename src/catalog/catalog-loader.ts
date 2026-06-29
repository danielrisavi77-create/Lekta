/**
 * Katalog ucilista (CLAUDE.md backlog 1 i 3). Hidrira data/catalog/zagreb-catalog.json
 * u tipizirani CatalogInstitution[]. Tanak prolaz: import + tipiziranje, bez logike.
 * Rewiring src/main.ts da cita odavde je zaseban korak (uz faithfulness test).
 */
import rawCatalog from '../../data/catalog/zagreb-catalog.json';
import type { CatalogInstitution, CatalogUnit } from '../profiles/profile-schema';

// Granica prema podacima: JSON inferira siroke tipove (npr. status: string), pa
// jednom castamo na autorski oblik. Podaci su validirani extractom iz prototipa.
export const ZAGREB_CATALOG = rawCatalog as unknown as CatalogInstitution[];

/** Sve ustrojbene jedinice (fakulteti/odsjeci) preko svih ustanova. */
export function allUnits(): CatalogUnit[] {
  return ZAGREB_CATALOG.flatMap((institution) => institution.units);
}

/** Jedinica po id-u (npr. "fpzg"), ili undefined. */
export function findUnit(unitId: string): CatalogUnit | undefined {
  return allUnits().find((unit) => unit.id === unitId);
}
