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
import repairMapRaw from '../../data/profiles/repair-map.json';
import { applyDemotion, type ScoreBase } from './advisory-levers';
import type { RuleEntry } from './profile-schema';

const ADVISORY_MAP = advisoryMapRaw as Record<string, string[]>;
// Slim zapisi nose samo polja koja buildRepairableItems cita; double-cast jer nisu pun RuleEntry.
const REPAIR_MAP = repairMapRaw as unknown as Record<string, RuleEntry[]>;

/**
 * Pecena scored/advisory demotija: bit-identican ishod kao applyScoredAdvisory(base, def,
 * draftRuleEntriesFor(id), SOURCE_REGISTRY), ali bez drafts/source-registryja u runtimeu.
 * Profil BEZ ruleEntries (nije u mapi) ne dira `base` (kao i racunski put).
 */
export function applyBakedAdvisory(base: ScoreBase, id: string | null | undefined): string[] {
  if (id == null) return [];
  const demoted = ADVISORY_MAP[id];
  if (demoted === undefined) return []; // nema ruleEntries -> ne diraj base (advisoryDimensions ostaje unset)
  return applyDemotion(base, demoted);
}

/**
 * Pecene autoFixable+verified ruleEntries za repair panel (buildRepairableItems ih dalje filtrira
 * i gradi params iz profila). Prazno polje za profil bez popravljivih pravila.
 */
export function repairEntriesFor(id: string | null | undefined): RuleEntry[] {
  if (id == null) return [];
  return REPAIR_MAP[id] ?? [];
}
