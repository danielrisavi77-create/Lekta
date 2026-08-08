/**
 * Build-time generator PECENIH runtime mapa (audit performance-01/02).
 *
 * Iz staging draftova (src/profiles/drafts-runtime.ts, eager glob) + source-registryja izracuna dvije
 * male mape koje ZIVI app.ts cita umjesto da u glavni entry chunk povuce ~1,3 MB draftova + 152 KB
 * source-registryja (koji su tamo sluzili samo determinstickom izracunu):
 *   - data/profiles/advisory-map.json : profileId -> demotirani checkId-jevi (scored/advisory demotion)
 *   - data/profiles/repair-map.json   : profileId -> repair-relevantne ruleEntries (slim: samo polja
 *                                       koja buildRepairableItems / *RepairableItem funkcije citaju)
 *
 * repair-map.json nosi TRI disjunktne vrste zapisa:
 *   1. autoFixable+verified   -> buildRepairableItems (generickih 6 checkIda: margins/font/...)
 *   2. advisory+recommendedFixerId -> isto, kao neobavezna preporuka
 *   3. "ui-assisted" checkIdovi (ASSISTED_RULE_ENTRY_CHECK_IDS ispod) -> custom *RepairableItem
 *      funkcije u src/ui/repair-items.ts (npr. bibliographyRepairableItem) koje profil.ruleEntries
 *      citaju IZRAVNO (checkId/status/sourceId/sourcePage/quote kao gate, .value kao konfiguracija).
 *      Bez ove treće vrste analyzedProfile.ruleEntries u zivom app.ts nikad ne bi imao ove zapise
 *      (drafts-runtime.ts se NE uvozi u javni bundle), pa ovih 7 fixera NIKAD ne bi aktiviralo
 *      bez obzira na verifikacijski status - poznat jaz iz strateskog audita 2026-07-13.
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

/** checkId-jevi cije *RepairableItem funkcije citaju profil.ruleEntries izravno (vidi napomenu iznad). */
const ASSISTED_RULE_ENTRY_CHECK_IDS = new Set([
  'bibliography-rules',
  'citation-sync-rules',
  'legal-footnote-repair-rules',
  'section-surgery-rules',
  'required-section-rules',
  'element-caption-rules',
  'table-figure-rescue-rules',
]);

const advisoryMap: Record<string, string[]> = {};
const repairMap: Record<string, unknown[]> = {};

for (const id of [...DRAFT_PROFILE_IDS].sort()) {
  const entries = draftRuleEntriesFor(id);
  if (entries.length === 0) continue;
  // advisory: identican izracun kao zivi applyScoredAdvisory (kljuc postoji cim profil ima ruleEntries,
  // makar demotiran skup bio prazan -> app tada postavlja advisoryDimensions=[]).
  advisoryMap[id] = computeDemotedAdvisory({ id }, entries, SOURCES);
  // repair: pravila koja buildRepairableItems obradjuje, slim na polja koja ta funkcija cita.
  // Dvije vrste: (1) autoFixable+verified -> obavezan popravak (NEPROMIJENJENO: params i dalje
  // dolaze iz profila u spoju, tj. currentProfile()/definition.rules). (2) advisory s
  // recommendedFixerId -> NEobavezan, jasno oznacen "preporuceni" popravak (institucija to zove
  // preporukom, ne propisom; vidi profile-schema.ts). KLJUCNA RAZLIKA: effectiveRules iz
  // ruleEntries NIJE zivo wiran u definition.rules (poznat jaz, vidi strateski audit 2026-07-13),
  // pa "preporuceni" zapis NOSI SVOJU vrijednost (value) da paramsFromValue moze izgraditi
  // params BEZ oslanjanja na definition.rules (koji za advisory-only institucije nikad nije
  // populiran tim poljima).
  const repairEntries = entries
    .filter(
      (e) =>
        (e.autoFixable === true && e.status === 'verified' && e.fixerId && e.checkId) ||
        (e.status === 'advisory' && e.recommendedFixerId && e.checkId),
    )
    .map((e) =>
      e.autoFixable === true
        ? {
            ruleId: e.ruleId,
            checkId: e.checkId,
            label: e.label,
            status: e.status,
            fixerId: e.fixerId,
            autoFixable: e.autoFixable,
          }
        : {
            ruleId: e.ruleId,
            checkId: e.checkId,
            label: e.label,
            status: e.status,
            fixerId: e.recommendedFixerId,
            recommended: true,
            value: e.value,
          },
    );
  // (3) ui-assisted: gate polja + value, bit-identicno onome sto svaka *RepairableItem funkcija cita.
  const assistedEntries = entries
    .filter(
      (e) =>
        e.checkId != null &&
        ASSISTED_RULE_ENTRY_CHECK_IDS.has(e.checkId) &&
        // 'advisory' prolazi uz 'verified': to je pravilo cije je uporiste u izvoru strojno
        // dokazano, ali koje ne smije bodovati. Demotira ga asRecommendation u repair-items.
        (e.status === 'verified' || e.status === 'advisory') &&
        e.sourceId != null &&
        e.sourcePage != null &&
        e.quote != null,
    )
    .map((e) => ({
      ruleId: e.ruleId,
      checkId: e.checkId,
      status: e.status,
      sourceId: e.sourceId,
      sourcePage: e.sourcePage,
      quote: e.quote,
      value: e.value,
    }));
  const allRepairEntries = [...repairEntries, ...assistedEntries];
  if (allRepairEntries.length > 0) repairMap[id] = allRepairEntries;
}

writeFileSync(join(root, 'data/profiles/advisory-map.json'), JSON.stringify(advisoryMap, null, 2) + '\n');
writeFileSync(join(root, 'data/profiles/repair-map.json'), JSON.stringify(repairMap, null, 2) + '\n');
console.log(
  `advisory-map.json: ${Object.keys(advisoryMap).length} profila; ` +
    `repair-map.json: ${Object.keys(repairMap).length} profila`,
);
