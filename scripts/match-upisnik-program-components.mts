/** Projicira odobrena exact uparivanja izvođača na službene šifre programa iz Upisnika. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ZAGREB_CATALOG } from '../src/catalog/catalog-loader';
import {
  deriveProgramComponentDecisionsFromExactMatches,
  buildProgramComponentBlockerReport,
  summarizeProgramComponentCoverage,
  validateProgramComponentDecisions,
  type ApprovedExecutorMatchDecision,
  type ProgramComponentOverride,
  type UpisnikProgramRow,
} from '../src/programs/program-component-decisions';
import type { UnitMatchDecision } from '../src/programs/unit-match-decisions';
import type { MatchProposal } from '../src/programs/unit-match';
import { withProvenance } from './lib/provenance.mjs';
import {
  buildUpisnikProfileCandidates,
  validateUpisnikProfileCoverageHolds,
  type ProfileCandidateInput,
  type ProgramProfileDecision,
  type ProgramProfileExclusionDecision,
  type ProgramProfileBlockerDecision,
  type ProgramProfileHoldDecision,
} from '../src/programs/upisnik-profile-candidates';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const upisnik = JSON.parse(
  readFileSync(join(root, 'data', 'programs', 'drafts', 'upisnik.json'), 'utf8'),
) as { source: { snapshotHash: string }; rows: UpisnikProgramRow[] };
const unitMatchesText = readFileSync(join(root, 'data', 'programs', 'unit-match-decisions.json'), 'utf8').replace(/\r\n?/gu, '\n');
const unitMatchSnapshotHash = createHash('sha256').update(unitMatchesText).digest('hex');
const unitMatchFile = JSON.parse(unitMatchesText) as { decisions: UnitMatchDecision[] };
const unitMatchDecisions: ApprovedExecutorMatchDecision[] = unitMatchFile.decisions.map((decision) => ({
  ...decision,
  evidence: decision.evidence?.map((evidence) => ({
    ...evidence,
    unitId: decision.unitId,
    snapshotHash: unitMatchSnapshotHash,
  })),
}));
const matchReport = JSON.parse(
  readFileSync(join(root, 'docs', 'generated', 'upisnik-unit-match.json'), 'utf8'),
) as { proposals: MatchProposal[] };
const overrideSnapshotRaw = readFileSync(join(root, 'data', 'programs', 'program-component-overrides.json'));
const overrideSnapshot = JSON.parse(overrideSnapshotRaw.toString('utf8')) as {
  decisions: Array<Omit<ProgramComponentOverride, 'evidence'> & {
    sourceUrl: string;
    sourceLocator: string;
    quote: string;
  }>;
};
const overrideSnapshotHash = createHash('sha256').update(overrideSnapshotRaw).digest('hex');
const overrides: ProgramComponentOverride[] = overrideSnapshot.decisions.map(({ sourceUrl, sourceLocator, quote, ...override }) => ({
  ...override,
  evidence: override.componentIds.map((unitId) => ({
    unitId, sourceUrl, sourceLocator, quote, snapshotHash: overrideSnapshotHash,
  })),
}));
const result = deriveProgramComponentDecisionsFromExactMatches(
  upisnik.rows,
  unitMatchDecisions,
  upisnik.source.snapshotHash,
  overrides,
);
const knownUnitIds = new Set(ZAGREB_CATALOG.flatMap((institution) => institution.units.map((unit) => unit.id)));
const errors = validateProgramComponentDecisions(result, {
  rows: upisnik.rows,
  knownUnitIds,
  expectedSnapshotHash: upisnik.source.snapshotHash,
});
if (errors.length) throw new Error(`neispravne odluke sastavnica:\n${errors.join('\n')}`);

const output = join(root, 'docs', 'generated', 'upisnik-program-components.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(withProvenance(result, 'npm run match-upisnik-program-components'), null, 2)}\n`);

const blockerReport = buildProgramComponentBlockerReport(
  upisnik.rows,
  matchReport.proposals,
  unitMatchDecisions,
  result,
);
writeFileSync(
  join(root, 'docs', 'generated', 'upisnik-program-component-backlog.json'),
  `${JSON.stringify(withProvenance(blockerReport, 'npm run match-upisnik-program-components'), null, 2)}\n`,
);

const profiles = JSON.parse(
  readFileSync(join(root, 'data', 'profiles', 'verified-profiles-heavy.json'), 'utf8'),
) as Record<string, ProfileCandidateInput>;
const profileDecisionFile = JSON.parse(
  readFileSync(join(root, 'data', 'programs', 'upisnik-profile-decisions.json'), 'utf8'),
) as { schemaVersion: 1; decisions: ProgramProfileDecision[]; exclusions: ProgramProfileExclusionDecision[]; blockers: ProgramProfileBlockerDecision[]; holds: ProgramProfileHoldDecision[] };
const sourceRegistry = JSON.parse(readFileSync(join(root, 'data', 'sources', 'source-registry.json'), 'utf8')) as Array<{ url: string; snapshotPath?: string }>;
const profileCandidates = buildUpisnikProfileCandidates(
  upisnik.rows,
  result.decisions,
  Object.values(profiles),
  profileDecisionFile.decisions,
  profileDecisionFile.exclusions,
  profileDecisionFile.blockers,
  profileDecisionFile.holds,
  sourceRegistry,
);
const profileHoldProblems = validateUpisnikProfileCoverageHolds(profileCandidates);
if (profileHoldProblems.length > 0) {
  throw new Error(`nepotpuno objašnjene Upisnik profilne blokade:\n${profileHoldProblems.join('\n')}`);
}
writeFileSync(
  join(root, 'docs', 'generated', 'upisnik-profile-candidates.json'),
  `${JSON.stringify(withProvenance(profileCandidates, 'npm run match-upisnik-program-components'), null, 2)}\n`,
);

const coverage = summarizeProgramComponentCoverage(upisnik.rows, result);
console.log('=== Programi povezani samo preko odobrenih exact izvođača ===');
console.log(`potpuno mapirano ${coverage.fullyMapped}/${coverage.total}`);
console.log(`djelomično ${coverage.partiallyMapped}, bez našeg mapiranja ${coverage.unresolved}, čeka odluku ${coverage.pending}`);
console.log(`neriješene veze izvođač/program: ${blockerReport.summary.blockerCount} u ${blockerReport.summary.programsWithBlockers} programskih šifri`);
console.log(`izlaz: docs/generated/upisnik-program-components.json i docs/generated/upisnik-program-component-backlog.json`);
console.log(`kandidati po točnom nazivu: ${profileCandidates.summary.exactCandidatePrograms}/${profileCandidates.summary.totalPrograms}`);
console.log(`ukupno kandidata nakon dokaznih odluka: ${profileCandidates.summary.candidatePrograms}/${profileCandidates.summary.totalPrograms}`);
console.log(`bez kandidata za profil: ${profileCandidates.summary.noCandidatePrograms}`);
console.log(`kandidati s dokaznom odlukom: ${profileCandidates.summary.evidenceBackedCandidatePrograms}`);
