/**
 * Generira privatnu matricu profilne pokrivenosti s dokazima po rule entryju.
 *
 * Pokretanje: npm run profile-coverage-backlog
 *
 * Citat, stranica i potpis ostaju u docs/**, izvan javnog bundlea. Javna projekcija
 * profile-claims.json namjerno nosi samo razinu i labelu.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
  VERIFIED_PROFILES_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import type { ThesisProfile } from '../src/profiles/profile-schema';
import type { LedgerRow } from '../src/verification/completion-ledger';
import {
  buildProfileCoverageBacklog,
  type FacultyCoverageInput,
  type ProfileCoverageInput,
} from '../src/verification/profile-coverage-backlog';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = <T,>(relativePath: string): T =>
  JSON.parse(readFileSync(join(root, relativePath), 'utf8')) as T;

const registryProfiles = VERIFIED_PROFILES_WITH_DRAFTS as unknown as ThesisProfile[];
const legalDepartments = LEGAL_DEPARTMENTS_WITH_DRAFTS as unknown as ThesisProfile[];
const profiles: ProfileCoverageInput[] = [
  ...registryProfiles.map((profile) => ({
    profileId: profile.id,
    registryKind: 'registry' as const,
    unitId: (profile as unknown as { unitId?: string }).unitId ?? null,
    workTypes: (profile as unknown as { workTypes?: string[] }).workTypes ?? [],
    ruleEntries: profile.ruleEntries ?? [],
  })),
  ...legalDepartments.map((profile) => ({
    profileId: profile.id,
    registryKind: 'legal-department' as const,
    unitId: (profile as unknown as { unitId?: string }).unitId ?? null,
    workTypes: (profile as unknown as { workTypes?: string[] }).workTypes ?? [],
    ruleEntries: profile.ruleEntries ?? [],
  })),
];

const facultyMatrix = readJson<{
  faculties: Array<{ unitId: string; facultyLabel: string }>;
}>('docs/generated/faculty-matrix.json');
const completionLedger = readJson<{ rows: LedgerRow[] }>('docs/generated/completion-ledger.json');
const report = buildProfileCoverageBacklog({
  profiles,
  ledgerRows: completionLedger.rows,
  faculties: facultyMatrix.faculties satisfies FacultyCoverageInput[],
});

writeFileSync(
  join(root, 'docs', 'generated', 'profile-coverage-backlog.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log('=== Profile coverage backlog ===');
console.log(`registrirani profili: ${report.summary.registryProfileCount}`);
console.log(`katedarski profili: ${report.summary.legalDepartmentProfileCount}`);
console.log(`fakultetske jedinice: ${report.summary.facultyCount}`);
console.log(
  `ispod B: ${report.summary.registryProfilesBelowB} registriranih + ${report.summary.legalDepartmentProfilesBelowB} katedarskih, ${report.summary.facultiesBelowB} fakulteta`,
);
console.log(`blokatori: ${JSON.stringify(report.summary.blockerCounts)}`);
console.log('zapisano: docs/generated/profile-coverage-backlog.json');
