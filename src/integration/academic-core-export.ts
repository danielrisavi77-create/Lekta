import type { RuleEntry, VerifiedProfile, WorkType } from '../profiles/profile-schema';
import {
  ACADEMIC_SUITE_CONTRACT_VERSION,
  type AcademicRuleSetExport,
  type AcademicWorkType,
  type SharedAcademicRule,
} from './academic-suite-contracts';

export interface AcademicCoreExportOptions {
  workType: WorkType;
  sourceVersion: string;
  generatedAt: string;
  institutionId?: string;
  programId?: string;
  academicYear?: string;
}

/**
 * Rules safe for a Katedra-facing coach projection by default.
 *
 * - verified: human-approved normative rule
 * - advisory: intentionally non-scored guidance with provenance
 *
 * Draft, ai-confirmed, needs-recheck, and retired entries do not cross the
 * product boundary as active academic guidance.
 */
export function isKatedraExportableRule(entry: RuleEntry): boolean {
  return entry.status === 'verified' || entry.status === 'advisory';
}

export function toSharedAcademicRule(entry: RuleEntry): SharedAcademicRule {
  return {
    ruleId: entry.ruleId,
    checkId: entry.checkId,
    category: entry.category,
    label: entry.label,
    value: entry.value,
    authority: entry.authority,
    sourceId: entry.sourceId,
    sourcePage: entry.sourcePage,
    status: entry.status,
    lastVerified: entry.lastVerified,
    academicYear: entry.academicYear,
    machineCheckable: entry.machineCheckable,
    autoFixable: entry.autoFixable,
    fixerId: entry.fixerId,
  };
}

/**
 * Deterministic opaque ruleset version used by project/result contracts.
 * Consumers may display profile labels separately; they should not parse this ID.
 */
export function academicRulesetId(profileId: string, workType: AcademicWorkType, sourceVersion: string): string {
  return `${profileId}:${workType}@${sourceVersion}`;
}

/**
 * Read-only projection from Lekta's existing VerifiedProfile/RuleEntry model.
 * It does not replace or mutate Lekta's authoring structures.
 */
export function exportAcademicRuleSet(
  profile: VerifiedProfile,
  options: AcademicCoreExportOptions,
): AcademicRuleSetExport {
  if (!profile.workTypes.includes(options.workType)) {
    throw new Error(`Profile ${profile.id} does not support work type ${options.workType}`);
  }

  const workType = options.workType as AcademicWorkType;
  const rules = (profile.ruleEntries ?? [])
    .filter(isKatedraExportableRule)
    .map(toSharedAcademicRule);

  return {
    schemaVersion: ACADEMIC_SUITE_CONTRACT_VERSION,
    sourceProduct: 'lekta',
    sourceVersion: options.sourceVersion,
    generatedAt: options.generatedAt,
    ref: {
      schemaVersion: ACADEMIC_SUITE_CONTRACT_VERSION,
      rulesetId: academicRulesetId(profile.id, workType, options.sourceVersion),
      profileId: profile.id,
      institutionId: options.institutionId,
      unitId: profile.unitId,
      programId: options.programId,
      workType,
      academicYear: options.academicYear,
      profileStatus: profile.status,
      verifiedAt: profile.verifiedAt,
      ruleAuthority: profile.ruleAuthority,
      sourceVersion: options.sourceVersion,
    },
    rules,
  };
}
