/**
 * Registar profila iz tipiziranog data/** (CLAUDE.md backlog 1 i 3). Hidrira
 * verificirane profile, pravne katedre, meta statusa/autoriteta i skupna pravila
 * po obitelji studija. Tanak prolaz: import + tipiziranje, bez logike. Rewiring
 * src/main.ts da cita odavde je zaseban korak (uz faithfulness test).
 */
import rawVerified from '../../data/profiles/verified-profiles.json';
import rawLegal from '../../data/profiles/legal-departments.json';
import rawAuthority from '../../data/profiles/profile-authority.json';
import rawBase from '../../data/profiles/base-profiles.json';
import rawFpzgPartial from '../../data/profiles/fpzg-partial.json';
import rawLawDrafts from '../../data/profiles/pravo/drafts/law-drafts.json';
import {
  mergeDraftSources,
  type AggregatedDraftFile,
  type FanoutDraftFile,
} from './drafts-merge';
import type {
  VerifiedProfile,
  LegalDepartment,
  ProfileStatusMeta,
  ProfileAuthorityMeta,
  ProfileStatusKey,
  RuleAuthorityKey,
  BaseProfiles,
  DraftsStagingFile,
  RuleEntry,
} from './profile-schema';

export const VERIFIED_PROFILE_REGISTRY = rawVerified as unknown as VerifiedProfile[];

export const LEGAL_DEPARTMENT_REGISTRY = rawLegal as unknown as LegalDepartment[];

/**
 * Staging nacrti pravnih profila (data/profiles/pravo/drafts/law-drafts.json). Jedan dom
 * za ruleEntries; zivi engine ih ne cita (cita rules/effectiveRules). Verifikacijski
 * moduli koriste WITH_DRAFTS poglede ispod. Registri iznad ostaju vjeran prolaz kroz JSON.
 */
export const LAW_DRAFTS = rawLawDrafts as unknown as DraftsStagingFile;

/**
 * Svi staging fileovi pod data/profiles/<faculty>/drafts/ (auto-discovery preko
 * import.meta.glob). Razdvoji agregirane (imaju `.profiles`) od fan-out po profilu
 * (imaju `.profileId` + `.entries`), pa ih spoji gap-fill semantikom (drafts-merge.ts):
 * agregirani seed je autoritativan, fan-out popunjava samo profile bez staginga. Tako
 * /draft-batch izlaz za NOVI fakultet automatski uleti u WITH_DRAFTS poglede, a seedani
 * pravni profili ostaju netaknuti (faithfulness effectiveRules == rules).
 */
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

/** ruleEntries za jedan profil iz spojenog staginga, ili prazno polje. */
export function draftRuleEntriesFor(profileId: string): RuleEntry[] {
  return MERGED_DRAFTS.profiles[profileId] ?? [];
}

function withDrafts<T extends { id: string }>(profile: T): T & { ruleEntries: RuleEntry[] } {
  return { ...profile, ruleEntries: draftRuleEntriesFor(profile.id) };
}

/** Verificirani profili s pridruzenim staging nacrtima (za verifikacijske module). */
export const VERIFIED_PROFILES_WITH_DRAFTS: VerifiedProfile[] =
  VERIFIED_PROFILE_REGISTRY.map(withDrafts);

/** Pravne katedre s pridruzenim staging nacrtima (za verifikacijske module). */
export const LEGAL_DEPARTMENTS_WITH_DRAFTS: LegalDepartment[] =
  LEGAL_DEPARTMENT_REGISTRY.map(withDrafts);

export { PROFILE_STATUS } from './profile-status-loader';

export const PROFILE_AUTHORITY =
  rawAuthority as unknown as Record<RuleAuthorityKey, ProfileAuthorityMeta>;

export const BASE_PROFILES = rawBase as unknown as BaseProfiles;

export const FPZG_PARTIAL = rawFpzgPartial as unknown as Record<string, unknown>;

/** Verificirani profil po id-u, ili undefined. */
export function findVerifiedProfile(id: string): VerifiedProfile | undefined {
  return VERIFIED_PROFILE_REGISTRY.find((profile) => profile.id === id);
}
