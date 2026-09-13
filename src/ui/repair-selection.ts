/**
 * IDENTITET ODABIRA POPRAVAKA (korak C6, 2026-09-12).
 *
 * Jedino mjesto koje zna sto je IDENTITET zahvata kad se odabir pamti preko osvjezavanja stranice.
 * Do danas ga nije bilo: kontroler toka kljucuje golim `ruleId`-em, a DOM odraz kljucuje `data-idx`,
 * dakle POLOZAJEM u polju. Polozaj se ne smije zapisati: `buildAllRepairableItems` gradi popis iz
 * svjeze analize i uvjetno (paywall, predlozak naslovnice), pa isti dokument legitimno daje drugi
 * poredak i drugu duljinu, i vracanje po indeksu bi kvacilo krive kucice bez ijedne poruke.
 *
 * KLJUC JE `fixerId|ruleId`. IZMJERENO 2026-09-12 na dvije neovisne populacije: nad izlazom
 * `buildAllRepairableItems` za 21 golden fixturu sa sidecarom, u oba stanja ponude (42 skupa, 354
 * stavke; tests/repair-selection-identity.test.ts) i nad `data/profiles/repair-map.json` parsiranim
 * kao JSON (368 profila, 1846 unosa) par je jedinstven i nijedan goli `ruleId` se ne pojavljuje s
 * dva fixera. Kljuc zato NE nosi redni broj; ako se par ikad ponovi, gard u identity testu to
 * IMENUJE, a ne broji.
 *
 * CIST MODUL: bez DOM-a, bez pohrane, bez vremena. `defaultRepairSelection` ne prepisuje pravilo
 * `violated !== false` nego zove `defaultSelectedItems`, a otisak racuna `hashString` iz
 * `profile-fingerprint`; treci hash i drugo pravilo predodabira bi bili dva mjesta koja se raziđu.
 */
import { hashString } from '../profiles/profile-fingerprint';
import { defaultSelectedItems } from '../repair/default-selection';
import { REPAIR_SELECTION_SCHEMA_VERSION, type RepairSelectionSnapshot } from '../session/local-document-session';

/** Strukturni minimum stavke; `RepairableItem` iz repair-panel.ts ga zadovoljava bez uvoza DOM sloja. */
export interface RepairSelectionItem {
  ruleId: string;
  fixerId: string;
  params: Record<string, unknown>;
  violated?: boolean;
  recommended?: boolean;
}

const KEY_SEPARATOR = '|';

export function repairSelectionKey(item: Pick<RepairSelectionItem, 'fixerId' | 'ruleId'>): string {
  return `${item.fixerId}${KEY_SEPARATOR}${item.ruleId}`;
}

/** Dijeli na PRVOM separatoru: `fixerId` nikad ne sadrzi `|`, a `ruleId` ga u nacelu smije. */
export function parseRepairSelectionKey(key: string): { fixerId: string; ruleId: string } | null {
  const at = key.indexOf(KEY_SEPARATOR);
  if (at <= 0 || at === key.length - 1) return null;
  return { fixerId: key.slice(0, at), ruleId: key.slice(at + 1) };
}

/**
 * Otisak PONUDJENOG skupa: neosjetljiv na REDOSLIJED (kljucevi se sortiraju), osjetljiv na
 * CLANSTVO i na BROJ stavaka (ponovljen kljuc ostaje ponovljen i u sortiranom nizu).
 *
 * BACA nad praznim skupom, namjerno: prazna populacija nikad ne smije dati valjan otisak koji bi
 * se poklopio s drugom praznom populacijom i "vratio" odabir na nista.
 */
export function repairItemsDigest(items: ReadonlyArray<Pick<RepairSelectionItem, 'fixerId' | 'ruleId'>>): string {
  if (items.length === 0) throw new Error('repairItemsDigest: prazan skup stavaka nema otisak');
  const keys = items.map(repairSelectionKey).sort();
  return hashString(keys.join('\n'));
}

/** Zadani odabir preslikan u kljuceve; pravilo je u `src/repair/default-selection.ts`, ne ovdje. */
export function defaultRepairSelection<T extends RepairSelectionItem>(items: readonly T[]): string[] {
  return defaultSelectedItems(items).map(repairSelectionKey);
}

export interface RepairSelectionSnapshotInput {
  items: ReadonlyArray<Pick<RepairSelectionItem, 'fixerId' | 'ruleId'>>;
  /** Kljucevi odabranih stavki; nepoznati (izvan `items`) se ispustaju, ponovljeni se sazimaju. */
  keys: Iterable<string>;
  deep: boolean;
  now: number;
}

/** `null` nad praznim skupom: bez ponude nema ni odabira koji bi se pamtio. */
export function buildRepairSelectionSnapshot(input: RepairSelectionSnapshotInput): RepairSelectionSnapshot | null {
  if (input.items.length === 0) return null;
  const known = new Set(input.items.map(repairSelectionKey));
  const selected: string[] = [];
  for (const key of input.keys) {
    if (known.has(key) && !selected.includes(key)) selected.push(key);
  }
  return {
    schemaVersion: REPAIR_SELECTION_SCHEMA_VERSION,
    itemsDigest: repairItemsDigest(input.items),
    selected,
    deep: input.deep,
    updatedAt: input.now,
  };
}

/**
 * Ishod vracanja, s VLASTITIM brojacima. Nizvodna mjera (broj oznacenih kucica) nije dokaz da je
 * vracanje radilo: kucice mogu biti oznacene i zato sto su predodabrane.
 */
export interface RepairSelectionRestore {
  /** Kljucevi iz snimke koji su pronadjeni i vracaju se (bez naprednih formi). */
  applied: number;
  /** Kljucevi iz snimke kojih u ponudi vise nema. Uz poklopljen otisak je uvijek nula. */
  skippedUnknown: number;
  /**
   * Stavke s NAPREDNOM FORMOM (naslovnica, literatura, citati, fusnote, tablice, sekcije, polja,
   * tipografija, dosljednost, obvezni dijelovi, DOI, vise datoteka). Vracaju se NEOZNACENE.
   *
   * Razlog nije stil: te forme mutiraju `item.<forma>.selected` i preracunavaju `item.params` iz
   * JEDNE konkretne analize. Snimka pamti samo je li stavka bila odabrana, nikad njezine unutarnje
   * odluke, pa bi oznacena stavka bez tih odluka poslala popravak koji korisnik nije vidio.
   * Sucelje to kaze jednom recenicom, iz OVOG brojaca, nikad bezuvjetno.
   */
  advancedNeedsReview: number;
  rejected: 'digest-mismatch' | 'schema' | null;
  /** `ruleId`-evi koje treba postaviti kroz `RepairPanelHandle.applySelection`. */
  ruleIds: string[];
}

export interface ApplyRepairSelectionOptions<T> {
  /** Ima li stavka naprednu formu; u produkciji `advancedFormFor(item) !== null`. */
  isAdvanced?: (item: T) => boolean;
}

/**
 * Presudi sto se iz snimke smije vratiti na ovaj popis. NE dira ni DOM ni kontroler; vraca
 * brojace i `ruleIds`, a pozivatelj ih postavlja kroz handle panela.
 *
 * Odabir se vraca SAMO uz isti `itemsDigest`. Kad se otisak ne poklapa, nista se ne preslikava,
 * ni kljucevi koji "slucajno postoje i ovdje": promijenjena ponuda je drugi skup odluka.
 */
export function applyRepairSelectionSnapshot<T extends Pick<RepairSelectionItem, 'fixerId' | 'ruleId'>>(
  items: readonly T[],
  snapshot: RepairSelectionSnapshot | null | undefined,
  options: ApplyRepairSelectionOptions<T> = {},
): RepairSelectionRestore {
  const none = (rejected: RepairSelectionRestore['rejected']): RepairSelectionRestore =>
    ({ applied: 0, skippedUnknown: 0, advancedNeedsReview: 0, rejected, ruleIds: [] });
  if (!snapshot || snapshot.schemaVersion !== REPAIR_SELECTION_SCHEMA_VERSION || !Array.isArray(snapshot.selected)) {
    return none('schema');
  }
  if (items.length === 0 || snapshot.itemsDigest !== repairItemsDigest(items)) return none('digest-mismatch');

  const byKey = new Map<string, T>();
  for (const item of items) byKey.set(repairSelectionKey(item), item);
  const out = none(null);
  for (const key of snapshot.selected) {
    const item = byKey.get(key);
    if (!item) { out.skippedUnknown += 1; continue; }
    if (options.isAdvanced?.(item)) { out.advancedNeedsReview += 1; continue; }
    out.applied += 1;
    out.ruleIds.push(item.ruleId);
  }
  return out;
}
