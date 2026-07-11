/**
 * Build-time generator PECENIH runtime mapa (audit performance-01/02).
 *
 * Iz staging draftova (src/profiles/drafts-runtime.ts, eager glob) + source-registryja izracuna dvije
 * male mape koje ZIVI app.ts cita umjesto da u glavni entry chunk povuce ~1,3 MB draftova + 152 KB
 * source-registryja (koji su tamo sluzili samo determinstickom izracunu):
 *   - data/profiles/advisory-map.json : profileId -> demotirani checkId-jevi (scored/advisory demotion)
 *   - data/profiles/repair-map.json   : profileId -> autoFixable+verified ruleEntries (slim: samo polja
 *                                       koja buildRepairableItems cita)
 *
 * Pokreni:  npx vite-node scripts/gen-profile-runtime-maps.mts
 * (vite-node jer draftovi dolaze preko import.meta.glob; obican Node to ne razrjesava.)
 * Drift izmedu pecene mape i izvora hvata tests/profile-runtime-maps.test.ts (regeneriraj pa commitaj).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DRAFT_PROFILE_IDS, draftRuleEntriesFor } from '../src/profiles/drafts-runtime';
import { computeDemotedAdvisory } from '../src/profiles/advisory-demotion';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import type { SourceEntry } from '../src/profiles/profile-schema';

const SOURCES = SOURCE_REGISTRY as SourceEntry[];
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const advisoryMap: Record<string, string[]> = {};
const repairMap: Record<string, unknown[]> = {};

for (const id of [...DRAFT_PROFILE_IDS].sort()) {
  const entries = draftRuleEntriesFor(id);
  if (entries.length === 0) continue;
  // advisory: identican izracun kao zivi applyScoredAdvisory (kljuc postoji cim profil ima ruleEntries,
  // makar demotiran skup bio prazan -> app tada postavlja advisoryDimensions=[]).
  advisoryMap[id] = computeDemotedAdvisory({ id }, entries, SOURCES);
  // repair: samo pravila koja buildRepairableItems uopce obradjuje (autoFixable + verified + fixerId +
  // checkId), slim na polja koja ta funkcija cita. params i dalje dolaze iz profila u tocki spoja.
  const repairEntries = entries
    .filter((e) => e.autoFixable === true && e.status === 'verified' && e.fixerId && e.checkId)
    .map((e) => ({
      ruleId: e.ruleId,
      checkId: e.checkId,
      label: e.label,
      status: e.status,
      fixerId: e.fixerId,
      autoFixable: e.autoFixable,
    }));
  if (repairEntries.length > 0) repairMap[id] = repairEntries;
}

writeFileSync(join(root, 'data/profiles/advisory-map.json'), JSON.stringify(advisoryMap, null, 2) + '\n');
writeFileSync(join(root, 'data/profiles/repair-map.json'), JSON.stringify(repairMap, null, 2) + '\n');
console.log(
  `advisory-map.json: ${Object.keys(advisoryMap).length} profila; ` +
    `repair-map.json: ${Object.keys(repairMap).length} profila`,
);
