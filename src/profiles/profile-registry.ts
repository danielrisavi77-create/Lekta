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
import type {
  VerifiedProfile,
  LegalDepartment,
  ProfileStatusMeta,
  ProfileAuthorityMeta,
  ProfileStatusKey,
  RuleAuthorityKey,
  BaseProfiles,
  DraftsStagingFile,
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
 * NAPOMENA (audit performance-01/02): eager glob svih ~169 draft datoteka, `draftRuleEntriesFor`
 * i `VERIFIED/LEGAL_..._WITH_DRAFTS` PRESELILI su u `./drafts-runtime`. Time taj 1,3 MB podatkovni
 * sloj ispada iz glavnog entry chunka: javni app.ts vise ne cita drafts (advisory + repair citaju
 * PECENE mape iz `./profile-runtime-maps`), a drafts-runtime se uvozi samo iz internih putanja
 * (verification-console) i testova. Uvezi iz `./drafts-runtime` ako ti trebaju sirovi ruleEntries.
 */

export { PROFILE_STATUS } from './profile-status-loader';

export const PROFILE_AUTHORITY =
  rawAuthority as unknown as Record<RuleAuthorityKey, ProfileAuthorityMeta>;

export const BASE_PROFILES = rawBase as unknown as BaseProfiles;

export const FPZG_PARTIAL = rawFpzgPartial as unknown as Record<string, unknown>;

/** Verificirani profil po id-u, ili undefined. */
export function findVerifiedProfile(id: string): VerifiedProfile | undefined {
  return VERIFIED_PROFILE_REGISTRY.find((profile) => profile.id === id);
}
