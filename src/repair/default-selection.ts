import type { FixerId, FixerRequest } from './apply-fixers';

/**
 * Fixeri koji znaju ocistiti IZRAVNO oblikovanje (ne samo stilove).
 *
 * Zivi u repair jezgri, a ne u `src/ui/repair-panel.ts`, jer je to cinjenica o FIXERIMA (koji
 * primaju `params.deep`), ne o sucelju. Dok je bio samo u panelu, svaki pozivatelj izvan UI-a
 * morao ga je zicati rucno, a `tests/real-corpus/harness.ts` to nije radio: mjerio je popravak
 * BEZ deep zastavice, dakle slabiji od onog koji korisnik stvarno dobije, jer izravno
 * oblikovanje nadjacava stil pa font, velicina, prored i poravnanje tiho ne prime.
 */
export const DEEP_CAPABLE: ReadonlySet<FixerId> = new Set([
  'font-fixer',
  'line-spacing-fixer',
  'alignment-fixer',
  'paragraph-spacing-fixer',
  'footnote-spacing-fixer',
] as FixerId[]);

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

/**
 * Ima li zahtjev ista za primijeniti, ili ceka ljudski odabir?
 *
 * Zasto postoji: stavke s formom (`requiresConfirmation`) racunaju `params` JEDNOM, pri gradnji,
 * dakle PRIJE nego je covjek ista odabrao. Kod dijela njih je zadani odabir prazan po
 * konstrukciji, pa `params` nose prazne nizove i fixer nema sto raditi.
 *
 * IZMJERENO 2026-08-29: `consistency-fixer` (110 ponuda), `citation-bibliography-sync-fixer` (62)
 * i `required-section-fixer` (49) na 116 stvarnih dokumenata nisu promijenili NIJEDAN. Prva dva
 * grade svaki odabir s tvrdim `selected: false`, treci trazi `confidence === 'high'` a detektor
 * na tim dokumentima daje samo `medium`. To NIJE kvar: Lekta ne smije pogadjati koji je oblik
 * tocan, jer bi to bio sadrzaj. Kvar je bio sto ih je mjerenje brojalo kao primijenjene, pa je
 * njihov nazivnik ulazio u "jaz asistiranog fixera".
 *
 * Pravilo: ako `params` nema NIJEDAN niz, zahtjev je akcijski (npr. `empty-paragraph-fixer` ima
 * `params: {}` i uredno radi). Ako nizova ima, barem jedan mora biti neprazan.
 */
/**
 * Fixeri kod kojih je opce pravilo DOKAZANO krivo, pa nose vlastito ocitanje.
 *
 * Popis je namjerno kratak i sadrzi samo izmjerene slucajeve (neovisni pregled 2026-08-31);
 * ostali ostaju na opcem pravilu, jer nagadjanje o njima ne bi bilo bolje od heuristike.
 *
 *   consistency-fixer      `groups` mogu biti NEPRAZNI a `replacements` prazni, i tada fixer
 *                          vraca `no-target` (consistency-fixer.ts, provjera duljine zamjena).
 *                          Nastaje kad varijante postoje samo izvan `word/document.xml` ili nemaju
 *                          `start`/`end`, pa ih graditelj odbaci iz `replacements` a `groups` ostanu.
 *   field-integrity-fixer  `fields` moze biti PRAZAN a posao stvaran, jer `settings.updateFieldsOnOpen`
 *                          sam po sebi mijenja `word/settings.xml`.
 */
const WORK_CARRIERS: Record<string, (params: Record<string, unknown>) => boolean> = {
  'consistency-fixer': (params) => Array.isArray(params.replacements) && params.replacements.length > 0,
  'field-integrity-fixer': (params) =>
    (Array.isArray(params.fields) && params.fields.length > 0)
    || hasTruthySetting(params.settings),
  /**
   * Dodan u drugom krugu pregleda: propustio sam ga iako sam ga u obrazlozenju F7 sam naveo kao
   * najjaci primjer. Graditelj UVIJEK emitira `revisions/comments/metadata/hiddenText`, a fixer
   * radi posao i iskljucivo iz `settings` (npr. `removeRevisionIds`), pa je stavka koja doista
   * popravlja bila prijavljena kao "ceka covjeka".
   */
  'final-document-inspector-fixer': (params) =>
    ['revisions', 'comments', 'metadata', 'hiddenText'].some((key) => Array.isArray(params[key]) && (params[key] as unknown[]).length > 0)
    || hasTruthySetting(params.settings),
};

/**
 * POZNATA GRANICA, imenovana umjesto da se pogadja.
 *
 * `citation-bibliography-sync-fixer` (samo `mappings`) i `legal-footnote-repair-fixer` (samo
 * `bibliographyLinks`) rano odustaju iako im nizovi nisu prazni, pa ih opce pravilo krivo
 * proglasava akcijskima. Ovdje NEMAJU unos jer se to iz parametara ne moze utvrditi: obojici se
 * stvarne operacije IZVODE iznutra iz citata i zapisa, a ne postoje kao kljuc. Unos bi znacio
 * prepisivanje logike fixera u ovaj modul, sto je upravo obrazac koji je drugdje u ovom radu
 * proizveo razilazenje.
 */

/** Ima li objekt postavki ijednu upaljenu vrijednost? */
function hasTruthySetting(settings: unknown): boolean {
  return Boolean(settings && typeof settings === 'object' && Object.values(settings as Record<string, unknown>).some(Boolean));
}

export function hasActionableParams(params: Record<string, unknown> | null | undefined, fixerId?: string): boolean {
  if (!params) return true;
  const carrier = fixerId ? WORK_CARRIERS[fixerId] : undefined;
  if (carrier) return carrier(params);
  const arrays = Object.values(params).filter((value): value is unknown[] => Array.isArray(value));
  if (!arrays.length) return true;
  return arrays.some((value) => value.length > 0);
}

/**
 * `defaultSelectedItems` preslikan u zahtjeve prema `applyFixers`.
 *
 * `deep` je UKLJUCEN po zadanom jer je takav i preklopnik u panelu
 * (`repair-panel.ts`: `<input type="checkbox" checked />`). Zadana vrijednost mora opisivati
 * ono sto korisnik stvarno posalje; tko hoce plitak popravak, trazi ga izricito.
 */
export function buildDefaultRepairRequests(
  items: readonly DefaultSelectableItem[],
  options: { deep?: boolean } = {},
): FixerRequest[] {
  const deep = options.deep !== false;
  return defaultSelectedItems(items).map((item) => ({
    fixerId: item.fixerId,
    ruleId: item.ruleId,
    params: deep && DEEP_CAPABLE.has(item.fixerId as FixerId) ? { ...item.params, deep: true } : item.params,
  })) as FixerRequest[];
}
