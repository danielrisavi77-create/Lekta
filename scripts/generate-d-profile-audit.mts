/**
 * Generira privatni audit svih D profila.
 *
 * Audit ne mijenja claimove. Samo razdvaja postojece deterministicke putove,
 * advisory zapise i pravila koja ne smiju ici kroz automatski popravak.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
  VERIFIED_PROFILES_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import type { RuleEntry, ThesisProfile } from '../src/profiles/profile-schema';
import { auditDProfile, type DProfileAudit } from '../src/verification/d-profile-audit';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const claims = JSON.parse(
  readFileSync(join(root, 'data', 'profiles', 'profile-claims.json'), 'utf8'),
) as { byProfile: Record<string, string> };

interface AuditedProfile extends DProfileAudit {
  registryKind: 'registry' | 'legal-department';
}

const sourceProfiles: Array<{ profile: ThesisProfile; registryKind: AuditedProfile['registryKind'] }> = [
  ...VERIFIED_PROFILES_WITH_DRAFTS.map((profile) => ({ profile, registryKind: 'registry' as const })),
  ...LEGAL_DEPARTMENTS_WITH_DRAFTS.map((profile) => ({ profile, registryKind: 'legal-department' as const })),
];

const profiles: AuditedProfile[] = sourceProfiles
  .filter(({ profile }) => claims.byProfile[profile.id] === 'D')
  .map(({ profile, registryKind }) => ({
    ...auditDProfile({
      profileId: profile.id,
      ruleEntries: (profile.ruleEntries ?? []) as RuleEntry[],
    }),
    registryKind,
  }))
  .sort((a, b) => a.profileId.localeCompare(b.profileId));

const dispositionCounts = profiles.reduce<Record<string, number>>((counts, profile) => {
  counts[profile.disposition] = (counts[profile.disposition] ?? 0) + 1;
  return counts;
}, {});

const report = {
  schemaVersion: 1,
  summary: {
    profileCount: profiles.length,
    registryProfileCount: profiles.filter((profile) => profile.registryKind === 'registry').length,
    legalDepartmentProfileCount: profiles.filter((profile) => profile.registryKind === 'legal-department').length,
    dispositionCounts,
  },
  profiles,
};

if (profiles.length !== 37) {
  throw new Error(`D audit ocekuje 37 profila, pronadjeno ${profiles.length}`);
}

writeFileSync(
  join(root, 'docs', 'generated', 'd-profile-audit.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log('=== D profile audit ===');
console.log(`profili: ${profiles.length}`);
console.log(`registrirani: ${report.summary.registryProfileCount}`);
console.log(`katedarski: ${report.summary.legalDepartmentProfileCount}`);
console.log(`klasifikacije: ${JSON.stringify(dispositionCounts)}`);
console.log('zapisano: docs/generated/d-profile-audit.json');
