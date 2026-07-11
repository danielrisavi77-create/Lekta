/**
 * Runtime staging nacrta (ruleEntries), NAMJERNO odvojen od profile-registry (audit performance-01/02).
 *
 * Ovaj modul drzi eager `import.meta.glob` svih ~169 draft datoteka (~1,3 MB). Da taj podatkovni
 * sloj NE ude u glavni entry chunk (index.html), profile-registry ga vise ne uvozi; drafts-runtime
 * se staticki uvozi SAMO iz internih/verifikacijskih putanja koje ionako nisu u javnom buildu
 * (verification-console.ts) i iz testova. Javni app.ts ne cita drafts uopce: advisory demotion i
 * repair stavke se citaju iz PECENIH mapa (profile-runtime-maps.ts, gen-profile-runtime-maps.mts).
 *
 * Semantika spajanja je identicna kao prije (drafts-merge.ts): agregirani staging je autoritativan,
 * fan-out popunjava profile bez staginga.
 */
import {
  mergeDraftSources,
  type AggregatedDraftFile,
  type FanoutDraftFile,
} from './drafts-merge';
import { VERIFIED_PROFILE_REGISTRY, LEGAL_DEPARTMENT_REGISTRY } from './profile-registry';
import type { VerifiedProfile, LegalDepartment, RuleEntry } from './profile-schema';
import heavyProfiles from '../../data/profiles/verified-profiles-heavy.json';

const draftModules = import.meta.glob('../../data/profiles/*/drafts/*.json', {
  eager: true,
}) as Record<string, { default: unknown }>;

const aggregatedDrafts: AggregatedDraftFile[] = [];
const fanoutDrafts: FanoutDraftFile[] = [];
for (const mod of Object.values(draftModules)) {
  const data = mod.default as Record<string, unknown>;
  if (data && typeof data === 'object' && 'profiles' in data) {
    aggregatedDrafts.push(data as unknown as AggregatedDraftFile);
  } else if (data && typeof data === 'object' && 'profileId' in data && 'entries' in data) {
    fanoutDrafts.push(data as unknown as FanoutDraftFile);
  }
}

const MERGED_DRAFTS = mergeDraftSources(aggregatedDrafts, fanoutDrafts);

/** profileId-jevi cije su fan-out datoteke preskocene jer agregirani staging vec postoji. */
export const IGNORED_FANOUT_PROFILES = MERGED_DRAFTS.ignored;

/** Svi profileId-jevi koji imaju barem jedno staging pravilo (za build-time generatore). */
export const DRAFT_PROFILE_IDS: string[] = Object.keys(MERGED_DRAFTS.profiles);

/** ruleEntries za jedan profil iz spojenog staginga, ili prazno polje. */
export function draftRuleEntriesFor(profileId: string): RuleEntry[] {
  return MERGED_DRAFTS.profiles[profileId] ?? [];
}

function withDrafts<T extends { id: string }>(profile: T): T & { ruleEntries: RuleEntry[] } {
  return { ...profile, ruleEntries: draftRuleEntriesFor(profile.id) };
}

// Split (perf): teska pravila su u zivom app-u lazy (profile-registry.ensureProfileRules). drafts-runtime
// je verifikacijski/test sloj (NIJE u javnom bundleu, vidi profile-registry napomenu) pa ovdje EAGER
// spajamo heavy u registry da VERIFIED_PROFILES_WITH_DRAFTS nose PUN profil (rules/fieldValidation).
for (const entry of VERIFIED_PROFILE_REGISTRY as unknown as Array<{ id: string }>) {
  const full = (heavyProfiles as Record<string, object>)[entry.id];
  if (full) Object.assign(entry, full);
}

/** Verificirani profili s pridruzenim staging nacrtima (za verifikacijske module). */
export const VERIFIED_PROFILES_WITH_DRAFTS: VerifiedProfile[] =
  VERIFIED_PROFILE_REGISTRY.map(withDrafts);

/** Pravne katedre s pridruzenim staging nacrtima (za verifikacijske module). */
export const LEGAL_DEPARTMENTS_WITH_DRAFTS: LegalDepartment[] =
  LEGAL_DEPARTMENT_REGISTRY.map(withDrafts);
