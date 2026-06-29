/**
 * Registar profila iz tipiziranog data/** (CLAUDE.md backlog 1 i 3). Hidrira
 * verificirane profile, pravne katedre, meta statusa/autoriteta i skupna pravila
 * po obitelji studija. Tanak prolaz: import + tipiziranje, bez logike. Rewiring
 * src/main.ts da cita odavde je zaseban korak (uz faithfulness test).
 */
import rawVerified from '../../data/profiles/verified-profiles.json';
import rawLegal from '../../data/profiles/legal-departments.json';
import rawStatus from '../../data/profiles/profile-status.json';
import rawAuthority from '../../data/profiles/profile-authority.json';
import rawBase from '../../data/profiles/base-profiles.json';
import rawFpzgPartial from '../../data/profiles/fpzg-partial.json';
import type {
  VerifiedProfile,
  LegalDepartment,
  ProfileStatusMeta,
  ProfileAuthorityMeta,
  ProfileStatusKey,
  RuleAuthorityKey,
  BaseProfiles,
} from './profile-schema';

export const VERIFIED_PROFILE_REGISTRY = rawVerified as unknown as VerifiedProfile[];

export const LEGAL_DEPARTMENT_REGISTRY = rawLegal as unknown as LegalDepartment[];

export const PROFILE_STATUS =
  rawStatus as unknown as Record<ProfileStatusKey, ProfileStatusMeta>;

export const PROFILE_AUTHORITY =
  rawAuthority as unknown as Record<RuleAuthorityKey, ProfileAuthorityMeta>;

export const BASE_PROFILES = rawBase as unknown as BaseProfiles;

export const FPZG_PARTIAL = rawFpzgPartial as unknown as Record<string, unknown>;

/** Verificirani profil po id-u, ili undefined. */
export function findVerifiedProfile(id: string): VerifiedProfile | undefined {
  return VERIFIED_PROFILE_REGISTRY.find((profile) => profile.id === id);
}
