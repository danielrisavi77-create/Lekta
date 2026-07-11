/**
 * Build-time generator SPLITA verificiranih profila (perf: skini ~90 KB gzip s landinga).
 *
 * verified-profiles.json (~1 MB raw / ~99 KB gzip nakon strip publicSources) je najveci
 * pojedinacni teret glavnog entry chunka, a teska polja (rules, fieldValidation, sources,
 * facts, scopes...) trebaju TEK nakon odabira profila. Ova skripta dijeli izvor na:
 *   - data/profiles/verified-profiles-index.json : LAGANI indeks (id, unitId, programs,
 *       workTypes, status, variant + fieldValidation.sample + rules.recommendedCitation/
 *       citationLocked) koji picker/hero citaju PRIJE odabira. ~8 KB gzip, eager.
 *   - data/profiles/verified-profiles-heavy.json : { id -> PUN profil (bez publicSources) }.
 *       Dinamicki (lazy) chunk; profile-registry ga spoji u registry na prvu interakciju.
 *
 * Izvor istine ostaje verified-profiles.json. Drift + korektnost (heavy === strip(original),
 * index === projekcija) hvata tests/verified-split.test.ts (regeneriraj pa commitaj).
 *
 * Pokreni:  node scripts/gen-verified-split.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = JSON.parse(readFileSync(join(root, 'data/profiles/verified-profiles.json'), 'utf8'));

/** publicSources (PID+sha256 provenijencija) je mrtvo u runtimeu; ne ide ni u jedan izlaz. */
function stripPublicSources(profile) {
  if (!profile.fieldValidation || !('publicSources' in profile.fieldValidation)) return profile;
  const { publicSources, ...fvRest } = profile.fieldValidation;
  return { ...profile, fieldValidation: fvRest };
}

/** Lagani indeks: samo polja koja dropdowni/hero/coverage i citation-picker citaju prije odabira. */
function lightEntry(profile) {
  const light = {
    id: profile.id,
    unitId: profile.unitId,
    programs: profile.programs,
    workTypes: profile.workTypes,
    status: profile.status,
  };
  if (profile.variant != null) light.variant = profile.variant;
  if (profile.variantLabel != null) light.variantLabel = profile.variantLabel;
  const sample = profile.fieldValidation && profile.fieldValidation.sample;
  if (sample != null) light.fieldValidation = { sample };
  // Picker cita rules.recommendedCitation (citationForDefinition) i rules.citationLocked (isCitationLocked).
  const rules = profile.rules || {};
  const rulesLite = {};
  if (rules.recommendedCitation != null) rulesLite.recommendedCitation = rules.recommendedCitation;
  if (rules.citationLocked != null) rulesLite.citationLocked = rules.citationLocked;
  if (Object.keys(rulesLite).length) light.rules = rulesLite;
  return light;
}

const index = src.map(lightEntry);
const heavy = {};
for (const profile of src) heavy[profile.id] = stripPublicSources(profile);

writeFileSync(join(root, 'data/profiles/verified-profiles-index.json'), JSON.stringify(index, null, 2) + '\n');
writeFileSync(join(root, 'data/profiles/verified-profiles-heavy.json'), JSON.stringify(heavy, null, 2) + '\n');
console.log(`verified-profiles-index.json: ${index.length} profila (light); verified-profiles-heavy.json: ${Object.keys(heavy).length} profila (heavy).`);
