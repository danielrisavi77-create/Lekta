/**
 * CLI: zasto profil nema nijednu PROFILNU repair opciju (docs/generated/repair-gap.json), P2-4.
 *
 *   npx vite-node scripts/repair-gap-report.mts
 *   npm run repair-gap
 *
 * Logika je u src/programs/repair-gap.ts (cista funkcija, dijeljena s tests/repair-gap.test.ts).
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { withProvenance } from './lib/provenance.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { computePublishedRules } from '../src/verification/published-rules';
import { buildRepairGapReport, type RepairGapInput } from '../src/programs/repair-gap';
import type { ThesisProfile, SourceEntry } from '../src/profiles/profile-schema';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const coverage = JSON.parse(
  readFileSync(join(root, 'docs', 'generated', 'repair-coverage.json'), 'utf8'),
) as { profiles: Array<{ profileId: string; offeredOptionCount: number }> };
const zeroOption = new Set(
  coverage.profiles.filter((p) => p.offeredOptionCount === 0).map((p) => p.profileId),
);

const profiles = [
  ...VERIFIED_PROFILES_WITH_DRAFTS,
  ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
] as unknown as ThesisProfile[];

const inputs: RepairGapInput[] = profiles
  .filter((p) => zeroOption.has(p.id))
  .map((profile) => {
    const { scored } = computePublishedRules(profile, SOURCE_REGISTRY as SourceEntry[]);
    return {
      profileId: profile.id,
      scoredCheckIds: scored
        .filter((e) => e.machineCheckable && e.checkId != null)
        .map((e) => e.checkId as string),
      rules: ((profile as unknown as { effectiveRules?: Record<string, unknown>; rules?: Record<string, unknown> })
        .effectiveRules ??
        (profile as unknown as { rules?: Record<string, unknown> }).rules) as Record<string, unknown>,
    };
  });

const report = buildRepairGapReport(inputs);

mkdirSync(join(root, 'docs', 'generated'), { recursive: true });
writeFileSync(join(root, 'docs', 'generated', 'repair-gap.json'), JSON.stringify(withProvenance(report, 'npm run repair-gap'), null, 2) + '\n');

const LABEL: Record<string, string> = {
  'no-scored-rules': 'nema bodovanih pravila (posljedica P2-2/P2-3, ne zaseban kvar)',
  'assisted-profile-gated': 'popravak SE nudi kroz asistiranu granu; rupa je u MJERENJU',
  'not-repairable-by-nature': 'alat ne smije popravljati te osi (opseg, citatni stil)',
  'rule-shape-unusable': 'pravilo je u obliku koji ne moze voditi fixer (podatkovni posao)',
};

console.log('=== Zasto profil nema profilnu repair opciju ===');
console.log(`profila s nula opcija: ${report.summary.total}`);
for (const [kind, label] of Object.entries(LABEL)) {
  const n = report.summary[kind as keyof typeof report.summary];
  console.log(`  ${String(n).padStart(3)}  ${kind}: ${label}`);
}
console.log('');
for (const kind of Object.keys(LABEL)) {
  const rows = report.rows.filter((r) => r.kind === kind);
  if (!rows.length || kind === 'no-scored-rules') continue;
  console.log(`--- ${kind} (${rows.length})`);
  for (const r of rows) {
    const gates = r.gates.length ? `  gate: ${r.gates.join(', ')}` : '';
    console.log(`  ${r.profileId.padEnd(34)} ${r.scoredCheckIds.join(', ')}${gates}`);
  }
  console.log('');
}
console.log('zapisano: docs/generated/repair-gap.json');
