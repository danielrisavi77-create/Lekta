import type { FixerRequest } from './apply-fixers';

/**
 * Stavka onako kako je gradi `src/ui/repair-items.ts`. Namjerno strukturna (a ne uvoz
 * `RepairableItem` iz `src/ui/repair-panel.ts`): ovaj modul je dio repair jezgre i ne smije
 * povlaciti UI/DOM ovisnosti u serverski i testni put.
 */
export interface DefaultSelectableItem {
  ruleId: string;
  fixerId: string;
  params: Record<string, unknown>;
  violated?: boolean;
  recommended?: boolean;
}

/**
 * Stavke koje su PREDODABRANE kad korisnik samo otvori panel i klikne Popravi.
 *
 * Pravilo je doslovno isto kao checkbox u `renderRepairPanel` (`repair-panel.ts`):
 * `violated !== false`. Dakle prekrseno (ili bez izricitog podatka) je opt-out, a advisory
 * preporuke i neprekrsene bodovane stavke su opt-in, jer im `repair-items.ts` uvijek
 * postavlja `violated: false`.
 *
 * Postoji zato da harness i UI ne mogu razici: bez ovoga je `tests/real-corpus` primjenjivao
 * i advisory fixere pa je "produkcijski vjeran" izvjestaj mjerio tok koji korisnik ne izvodi.
 */
export function defaultSelectedItems<T extends DefaultSelectableItem>(items: readonly T[]): T[] {
  return items.filter((item) => item.violated !== false);
}

/** `defaultSelectedItems` preslikan u zahtjeve prema `applyFixers`. */
export function buildDefaultRepairRequests(items: readonly DefaultSelectableItem[]): FixerRequest[] {
  return defaultSelectedItems(items).map((item) => ({
    fixerId: item.fixerId,
    ruleId: item.ruleId,
    params: item.params,
  })) as FixerRequest[];
}
