/**
 * Konfiguracija proizvoda: paketi, oznake vrsta rada, stavke QA checkliste
 * (CLAUDE.md backlog 1 i 3). Hidrira data/packages.json, data/work-type-labels.json,
 * data/checks/check-items.json. Tanak prolaz, bez logike.
 */
import rawPackages from '../../data/packages.json';
import rawWorkTypeLabels from '../../data/work-type-labels.json';
import rawCheckItems from '../../data/checks/check-items.json';
import type { PackageDef, CheckItem, WorkType } from '../profiles/profile-schema';

export const PACKAGES = rawPackages as unknown as PackageDef[];

export const WORK_TYPE_LABELS =
  rawWorkTypeLabels as unknown as Record<WorkType, string>;

export const CHECK_ITEMS = rawCheckItems as unknown as CheckItem[];

/** Citljiva oznaka vrste rada (npr. "final" -> "Zavrsni rad"), uz fallback na kljuc. */
export function workTypeLabel(workType: string): string {
  return WORK_TYPE_LABELS[workType as WorkType] ?? workType;
}
