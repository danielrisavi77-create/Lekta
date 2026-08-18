/**
 * Konfiguracija proizvoda: paketi, oznake vrsta rada, stavke QA checkliste
 * (CLAUDE.md backlog 1 i 3). Hidrira data/packages.json, data/work-type-labels.json,
 * data/checks/check-items.json. Tanak prolaz, bez logike.
 */
import rawPackages from '../../data/packages.json';
import rawWorkTypeLabels from '../../data/work-type-labels.json';
import rawCheckItems from '../../data/checks/check-items.json';
import type { PackageDef, CheckItem, WorkType } from '../profiles/profile-schema';

/**
 * MRTAV IZVOZ, zadrzan namjerno (audit CODE-08).
 *
 * Ovo cita samo `tests/data-loaders.test.ts`, i to da bi potvrdio da je jednak svojoj vlastitoj
 * JSON datoteci. Aplikacija ga NE koristi: obrazac rucne narudzbe ima vlastiti popis u
 * `src/ui/app.ts`, a cjenik placenog popravka zivi u tablici `products`.
 *
 * Ne brisemo ga u sklopu remedijacije audita jer bi to bila promjena podatkovnog ugovora bez
 * potrebe, ali NE dodavaj mu nove citatelje: `data/packages.json` nije cjenik proizvoda.
 */
export const PACKAGES = rawPackages as unknown as PackageDef[];

export const WORK_TYPE_LABELS =
  rawWorkTypeLabels as unknown as Record<WorkType, string>;

export const CHECK_ITEMS = rawCheckItems as unknown as CheckItem[];

/** Citljiva oznaka vrste rada (npr. "final" -> "Zavrsni rad"), uz fallback na kljuc. */
export function workTypeLabel(workType: string): string {
  return WORK_TYPE_LABELS[workType as WorkType] ?? workType;
}
