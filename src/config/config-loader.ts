/**
 * Konfiguracija proizvoda: oznake vrsta rada i stavke QA checkliste (CLAUDE.md backlog 1 i 3).
 * Hidrira data/work-type-labels.json i data/checks/check-items.json. Tanak prolaz, bez logike.
 *
 * `PACKAGES` i `data/packages.json` su uklonjeni u Z11. Bio je to MRTAV izvoz: citao ga je samo
 * `tests/data-loaders.test.ts`, i to da potvrdi da je jednak svojoj vlastitoj JSON datoteci, dakle
 * tvrdnja koja ne moze pasti ni kad podatak nikome ne treba. Obrazac rucne narudzbe ima vlastiti
 * popis u `src/ui/app.ts`, a cjenik placenog popravka zivi u tablici `products`; nijedno od toga
 * nije ovisilo o ovoj datoteci. Audit CODE-08 ju je zadrzao da se ne mijenja podatkovni ugovor bez
 * potrebe, ali Z11 tu potrebu daje: cjenik smije imati tocno jedan izvor, a ovo je bio cetvrti
 * popis cijena u repozitoriju (9/39/69/99 EUR, koncept koji naplata vise ne poznaje).
 */
import rawWorkTypeLabels from '../../data/work-type-labels.json';
import rawCheckItems from '../../data/checks/check-items.json';
import type { CheckItem, WorkType } from '../profiles/profile-schema';

export const WORK_TYPE_LABELS =
  rawWorkTypeLabels as unknown as Record<WorkType, string>;

export const CHECK_ITEMS = rawCheckItems as unknown as CheckItem[];

/** Citljiva oznaka vrste rada (npr. "final" -> "Zavrsni rad"), uz fallback na kljuc. */
export function workTypeLabel(workType: string): string {
  return WORK_TYPE_LABELS[workType as WorkType] ?? workType;
}
