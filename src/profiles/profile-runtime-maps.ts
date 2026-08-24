/**
 * PECENE runtime mape (audit performance-01/02): zivi app.ts cita ove male, u buildu predizracunate
 * mape umjesto da u glavni entry chunk povuce ~1,3 MB draftova + 152 KB source-registryja. Izvor
 * istine su drafts + source-registry; ove mape pece scripts/gen-profile-runtime-maps.mts, a drift
 * hvata tests/profile-runtime-maps.test.ts.
 *
 *   advisory-map.json : profileId -> demotirani checkId-jevi (scored/advisory demotion)
 *   repair-map.json   : profileId -> autoFixable+verified ruleEntries (slim; samo polja koja
 *                       buildRepairableItems cita)
 */
import advisoryMapRaw from '../../data/profiles/advisory-map.json';
import { applyDemotion, type ScoreBase } from './advisory-levers';
import type { RuleEntry } from './profile-schema';

const ADVISORY_MAP = advisoryMapRaw as Record<string, string[]>;

/**
 * `repair-map.json` je LIJEN (isti obrazac kao templates-heavy i verified-profiles-heavy).
 *
 * Zasto: mapa je narasla na ~620 KB otkad nosi i provenijenciju za dokazni cip, a staticki uvoz
 * ju je stavljao u GLAVNI entry chunk, dakle na prvi paint. Nijedan njezin podatak ne treba prije
 * nego korisnik otvori repair panel, sto je iza analize i iza interakcije.
 *
 * Ne vraca prazno kad jos nije ucitana nego BACA: tiho prazna mapa znacila bi "ovaj profil nema
 * nijedno pravilo za popravak", pa bi se 7 fixera koji citaju `profile.ruleEntries` ugasilo bez
 * ijedne poruke. To je upravo vrsta lazno zelenog koja se u ovom repou vec dogodila.
 */
let _repairMap: Record<string, RuleEntry[]> | null = null;
let _repairMapReady: Promise<void> | null = null;

/**
 * Rules-on-demand (faza B): repair unosi jednog profila stizu i S POSLUZITELJEM u
 * istom odgovoru kao pravila (profile-rules), pa ih ensureProfileRules PRIME-a
 * ovdje po profilu. Bulk mapa (ensureRepairMapHeavy) ostaje kao fallback za dev
 * lokalni provider, testove i skripte koje trebaju SVE profile odjednom.
 */
const _primedRepair = new Map<string, RuleEntry[]>();

/** Upisi repair unose jednog profila (poziva ensureProfileRules nakon dohvata). */
export function primeRepairEntries(id: string, entries: unknown[]): void {
  // Slim zapisi nose samo polja koja buildRepairableItems cita; double-cast kao i bulk mapa.
  _primedRepair.set(id, (Array.isArray(entries) ? entries : []) as unknown as RuleEntry[]);
}

export function ensureRepairMapHeavy(): Promise<void> {
  if (!_repairMapReady) {
    _repairMapReady = import('../../data/profiles/repair-map.json').then((mod) => {
      const raw = (mod as { default?: unknown }).default ?? mod;
      // Slim zapisi nose samo polja koja buildRepairableItems cita; double-cast jer nisu pun RuleEntry.
      _repairMap = raw as unknown as Record<string, RuleEntry[]>;
    });
  }
  return _repairMapReady;
}

/** Je li mapa spremna (za dijagnostiku i testove). */
export function isRepairMapReady(): boolean {
  return _repairMap !== null;
}

/**
 * Pecena scored/advisory demotija: bit-identican ishod kao applyScoredAdvisory(base, def,
 * draftRuleEntriesFor(id), SOURCE_REGISTRY), ali bez drafts/source-registryja u runtimeu.
 * Profil BEZ ruleEntries (nije u mapi) ne dira `base` (kao i racunski put).
 *
 * `protectedIds` prosljedjuje dimenzije koje je izricito propisao specificniji izvor (profil
 * katedre); one ostaju bodovane. Vidi demotionProtectedBy u advisory-levers.
 */
export function applyBakedAdvisory(
  base: ScoreBase,
  id: string | null | undefined,
  protectedIds?: ReadonlySet<string>,
): string[] {
  if (id == null) return [];
  const demoted = ADVISORY_MAP[id];
  if (demoted === undefined) return []; // nema ruleEntries -> ne diraj base (advisoryDimensions ostaje unset)
  return applyDemotion(base, demoted, protectedIds);
}

/**
 * Pecene autoFixable+verified ruleEntries za repair panel (buildRepairableItems ih dalje filtrira
 * i gradi params iz profila). Prazno polje za profil bez popravljivih pravila.
 */
export function repairEntriesFor(id: string | null | undefined): RuleEntry[] {
  if (id == null) return [];
  const primed = _primedRepair.get(id);
  if (primed) return primed;
  if (_repairMap === null) {
    throw new Error(
      'repairEntriesFor: repair unosi za ovaj profil nisu ni primeani (ensureProfileRules) ni ' +
        'ucitani kao bulk mapa (ensureRepairMapHeavy). U pregledniku pozovi `await ' +
        'ensureProfileRules(id)` prije gradnje repair stavki (radi renderRepairSection); u ' +
        'testovima i skriptama `await ensureRepairMapHeavy()`. Namjerno se baca umjesto da se ' +
        'vrati prazno: tiho prazna mapa izgleda kao "profil nema pravila za popravak" i ugasi ' +
        '7 fixera bez ijedne poruke.',
    );
  }
  return _repairMap[id] ?? [];
}
