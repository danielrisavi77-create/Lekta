import type { RepairCoverageMatrix } from './repair-coverage';
import { buildRepairCoverageMatrix } from './repair-coverage';
import type { RealCorpusReport } from '../real-corpus/harness';
import generatedCorpusReport from '../../docs/generated/repair-real-corpus.json';
import generatedClosedLoop from '../../docs/generated/closed-loop.json';
import { buildCoverageCells, type ClosedLoopReport, type CoverageCellReport } from './coverage-cells';
import { VERIFIED_PROFILE_REGISTRY } from '../../src/profiles/profile-registry';
import rawCatalog from '../../data/catalog/zagreb-catalog.json';

const FACULTY_CATALOG = rawCatalog as Array<{
  units?: Array<{ id: string; name: string; status?: string }>;
}>;
const FACULTY_BY_ID = new Map(
  FACULTY_CATALOG.flatMap((institution) => institution.units ?? []).map((unit) => [unit.id, unit]),
);

export type FacultyAutomaticStatus = 'pass' | 'review' | 'not-run';

/**
 * Ishod `npm run closed-loop` za profil. Do 2026-08-29 je bio prikovan na `'not-run'` iako
 * `docs/generated/closed-loop.json` ima redak za svih 407 profila: matrica ga jednostavno nije
 * citala, pa je najjeftiniji dio pokrivenosti koji vec postoji izvjestavan kao neodradjen.
 */
export type ClosedLoopStatus = 'pass' | 'no-repair' | 'no-rules' | 'not-run';

export interface FacultyMatrixProfile {
  profileId: string;
  programs: string[];
  workTypes: string[];
  profileStatus: string;
  offeredOptionCount: number;
  mappedOptionCount: number;
  ruleIds: string[];
  fixerIds: string[];
  templateIds: string[];
  realDocxSampleCount: number;
  automaticTests: {
    profileCoverage: 'pass' | 'fail';
    realCorpus: FacultyAutomaticStatus;
    syntheticClosedLoop: ClosedLoopStatus;
  };
  /** Osi koje je closed-loop prekrsio i NIJE vratio u prolaz; prazno kad ih nema. */
  closedLoopAxesRemaining: string[];
  cellSummary: CoverageCellReport['summary'];
  realCorpusOutcomes: Record<string, number>;
  manualReviewReasons: string[];
}

export interface FacultyMatrixRow {
  unitId: string;
  facultyLabel: string;
  catalogStatus: string | null;
  profileCount: number;
  profileIds: string[];
  offeredOptionCount: number;
  mappedOptionCount: number;
  ruleIds: string[];
  fixerIds: string[];
  realDocxSampleCount: number;
  profilesWithoutRealDocx: string[];
  automaticTestSummary: {
    profileCoveragePassCount: number;
    profileCoverageFailCount: number;
    realCorpusPassCount: number;
    realCorpusReviewCount: number;
    realCorpusNoOpCount: number;
    realCorpusFailCount: number;
    syntheticClosedLoopPassCount: number;
    syntheticClosedLoopNotRunCount: number;
  };
  cellSummary: CoverageCellReport['summary'];
  manualReviewReasons: string[];
  profiles: FacultyMatrixProfile[];
}

export interface FacultyMatrixReport {
  schemaVersion: 1;
  scope: {
    profileSource: string;
    repairSource: string;
    realCorpusSource: string;
    closedLoopSource: string;
  };
  faculties: FacultyMatrixRow[];
  summary: {
    facultyCount: number;
    profileCount: number;
    offeredOptionCount: number;
    mappedOptionCount: number;
    realDocxSampleCount: number;
    facultiesWithRealDocx: number;
    facultiesWithoutRealDocx: number;
    profilesWithoutRealDocx: number;
    profileCoverageFailCount: number;
    realCorpusPassCount: number;
    realCorpusReviewCount: number;
    realCorpusNoOpCount: number;
    realCorpusFailCount: number;
    syntheticClosedLoopPassCount: number;
    syntheticClosedLoopNotRunCount: number;
    cellCount: number;
    coveredCellCount: number;
    uncoveredCellCount: number;
    resolvedCellCount: number;
  };
  cellSummary: CoverageCellReport['summary'];
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function outcomeCounts(results: RealCorpusReport['results']): Record<string, number> {
  return results.reduce<Record<string, number>>((counts, result) => {
    counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
    return counts;
  }, {});
}

function corpusStatus(results: RealCorpusReport['results']): FacultyAutomaticStatus {
  if (results.length === 0) return 'not-run';
  if (results.some((result) => result.outcome === 'fail' || result.error)) return 'review';
  if (results.some((result) => result.outcome === 'review')) return 'review';
  return 'pass';
}

function reasonsForProfile(
  profileId: string,
  sampleResults: RealCorpusReport['results'],
  coveragePass: boolean,
): string[] {
  const reasons: string[] = [];
  if (!sampleResults.length) reasons.push('nema-stvarnog-docx-uzorka');
  if (!coveragePass) reasons.push('nepotpuna-matrica-popravaka');
  if (sampleResults.some((result) => result.manualReviewRequired)) reasons.push('stvarni-docx-trazi-rucni-pregled');
  if (sampleResults.some((result) => result.outcome === 'fail' || result.error)) reasons.push('stvarni-docx-test-nije-prosao');
  if (sampleResults.some((result) => result.outcome === 'review' && result.targetedUnresolvedCount > 0)) {
    reasons.push('ciljani-check-na-stvarnom-docx-u-nije-u-potpunosti-rijesen');
  }
  if (profileId.length === 0) reasons.push('nedostaje-profile-id');
  return unique(reasons);
}

/** Zbroj celija za jedan podskup; isti oblik kao ukupni sazetak, da se brojke mogu usporediti. */
function summarizeCells(cells: CoverageCellReport['cells']): CoverageCellReport['summary'] {
  /**
   * Bez `as` casta, i to namjerno.
   *
   * Cast je 2026-08-31 sakrio nedostajuci kljuc: dodavanjem razloga `ceka-ljudski-odabir` ovaj je
   * inicijalizator ostao bez njega, pa je `byReason[cell.reason] += 1` racunao `undefined + 1`,
   * dakle NaN, koji u JSON-u izlazi kao `null`. Uhvatio ga je tek drift test matrice.
   *
   * S anotacijom tipa umjesto casta, isti propust je greska pri prevodjenju, a ne tiha NaN.
   */
  const byReason: CoverageCellReport['summary']['byReason'] = {
    'profil-ne-propisuje-os': 0,
    'univerzalna-higijena-bez-dokaza': 0,
    'closed-loop-nije-rijesio': 0,
    'nema-dokaza': 0,
    'ceka-ljudski-odabir': 0,
    'trazi-ulaz-izvan-dokumenta': 0,
  };
  let covered = 0;
  let resolved = 0;
  for (const cell of cells) {
    if (cell.status === 'pokriveno') {
      covered += 1;
      if (cell.evidence.strength === 'resolved') resolved += 1;
    } else {
      byReason[cell.reason] += 1;
    }
  }
  return { cellCount: cells.length, coveredCount: covered, uncoveredCount: cells.length - covered, resolvedCount: resolved, byReason };
}

function closedLoopStatus(outcome: string | undefined): ClosedLoopStatus {
  if (outcome === 'pass' || outcome === 'no-repair' || outcome === 'no-rules') return outcome;
  return 'not-run';
}

function buildProfileRow(
  profile: (ReturnType<typeof buildRepairCoverageMatrix>['profiles'])[number],
  matrix: RepairCoverageMatrix,
  corpus: RealCorpusReport,
  closedLoop: ClosedLoopReport,
  cellReport: CoverageCellReport,
): FacultyMatrixProfile {
  const rows = matrix.rows.filter((row) => row.profileId === profile.profileId);
  const registryProfile = VERIFIED_PROFILE_REGISTRY.find((candidate) => candidate.id === profile.profileId);
  if (!registryProfile) throw new Error(`Profil ${profile.profileId} nije pronađen u registru`);
  const samples = corpus.results.filter((result) => result.profileId === profile.profileId);
  const mappedOptionCount = rows.length;
  const coveragePass = mappedOptionCount === profile.offeredOptionCount;
  const corpusOutcomes = outcomeCounts(samples);
  const loop = closedLoop.rows.find((row) => row.profileId === profile.profileId);
  const cells = cellReport.cells.filter((cell) => cell.profileId === profile.profileId);

  return {
    profileId: profile.profileId,
    programs: [...registryProfile.programs],
    workTypes: [...registryProfile.workTypes],
    profileStatus: registryProfile.status,
    offeredOptionCount: profile.offeredOptionCount,
    mappedOptionCount,
    ruleIds: unique(rows.map((row) => row.ruleId)),
    fixerIds: unique(rows.map((row) => row.fixerId)),
    templateIds: unique(rows.map((row) => row.templateId)),
    realDocxSampleCount: samples.length,
    automaticTests: {
      profileCoverage: coveragePass ? 'pass' : 'fail',
      realCorpus: corpusStatus(samples),
      syntheticClosedLoop: closedLoopStatus(loop?.outcome),
    },
    closedLoopAxesRemaining: [...(loop?.axesRemaining ?? [])].sort(),
    cellSummary: summarizeCells(cells),
    realCorpusOutcomes: corpusOutcomes,
    manualReviewReasons: reasonsForProfile(profile.profileId, samples, coveragePass),
  };
}

/** Gradi stabilnu matricu fakultet, profil, pravilo i stvarni DOCX uzorak. */
export function buildFacultyMatrixReport(
  matrix = buildRepairCoverageMatrix(),
  corpus: RealCorpusReport = generatedCorpusReport as RealCorpusReport,
  closedLoop: ClosedLoopReport = generatedClosedLoop as ClosedLoopReport,
): FacultyMatrixReport {
  const cellReport = buildCoverageCells(matrix, closedLoop, corpus);
  const registryById = new Map(matrix.profiles.map((profile) => [profile.profileId, profile]));
  const profileIdsByUnit = new Map<string, string[]>();

  for (const profile of VERIFIED_PROFILE_REGISTRY) {
    if (!registryById.has(profile.id)) throw new Error(`Profil ${profile.id} nedostaje u repair coverage matrici`);
    const unitId = profile.unitId;
    const profileIds = profileIdsByUnit.get(unitId) ?? [];
    profileIds.push(profile.id);
    profileIdsByUnit.set(unitId, profileIds);
  }

  const faculties = [...profileIdsByUnit.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([unitId, profileIds]) => {
    const profiles = profileIds
      .map((profileId) => registryById.get(profileId))
      .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
      .map((profile) => buildProfileRow(profile, matrix, corpus, closedLoop, cellReport));
    const facultyResults = corpus.results.filter((result) => profiles.some((profile) => profile.profileId === result.profileId));
    const profilesWithoutRealDocx = profiles.filter((profile) => profile.realDocxSampleCount === 0).map((profile) => profile.profileId);
    const allReasons = unique(profiles.flatMap((profile) => profile.manualReviewReasons));

    return {
      unitId,
      facultyLabel: FACULTY_BY_ID.get(unitId)?.name ?? unitId,
      catalogStatus: FACULTY_BY_ID.get(unitId)?.status ?? null,
      profileCount: profiles.length,
      profileIds: profiles.map((profile) => profile.profileId),
      offeredOptionCount: profiles.reduce((total, profile) => total + profile.offeredOptionCount, 0),
      mappedOptionCount: profiles.reduce((total, profile) => total + profile.mappedOptionCount, 0),
      ruleIds: unique(profiles.flatMap((profile) => profile.ruleIds)),
      fixerIds: unique(profiles.flatMap((profile) => profile.fixerIds)),
      realDocxSampleCount: facultyResults.length,
      profilesWithoutRealDocx,
      automaticTestSummary: {
        profileCoveragePassCount: profiles.filter((profile) => profile.automaticTests.profileCoverage === 'pass').length,
        profileCoverageFailCount: profiles.filter((profile) => profile.automaticTests.profileCoverage === 'fail').length,
        realCorpusPassCount: facultyResults.filter((result) => result.outcome === 'pass').length,
        realCorpusReviewCount: facultyResults.filter((result) => result.outcome === 'review').length,
        realCorpusNoOpCount: facultyResults.filter((result) => result.outcome === 'no-op').length,
        realCorpusFailCount: facultyResults.filter((result) => result.outcome === 'fail' || result.error).length,
        syntheticClosedLoopPassCount: profiles.filter((profile) => profile.automaticTests.syntheticClosedLoop === 'pass').length,
        syntheticClosedLoopNotRunCount: profiles.filter((profile) => profile.automaticTests.syntheticClosedLoop === 'not-run').length,
      },
      cellSummary: summarizeCells(cellReport.cells.filter((cell) => profileIds.includes(cell.profileId))),
      manualReviewReasons: allReasons,
      profiles,
    };
  });

  const allProfiles = faculties.flatMap((faculty) => faculty.profiles);
  const allResults = corpus.results;
  return {
    schemaVersion: 1,
    scope: {
      profileSource: 'src/profiles/profile-registry.ts',
      repairSource: 'tests/helpers/repair-coverage.ts',
      realCorpusSource: 'docs/generated/repair-real-corpus.json',
      closedLoopSource: 'docs/generated/closed-loop.json',
    },
    faculties,
    summary: {
      facultyCount: faculties.length,
      profileCount: allProfiles.length,
      offeredOptionCount: allProfiles.reduce((total, profile) => total + profile.offeredOptionCount, 0),
      mappedOptionCount: allProfiles.reduce((total, profile) => total + profile.mappedOptionCount, 0),
      realDocxSampleCount: allResults.length,
      facultiesWithRealDocx: faculties.filter((faculty) => faculty.realDocxSampleCount > 0).length,
      facultiesWithoutRealDocx: faculties.filter((faculty) => faculty.realDocxSampleCount === 0).length,
      profilesWithoutRealDocx: allProfiles.filter((profile) => profile.realDocxSampleCount === 0).length,
      profileCoverageFailCount: allProfiles.filter((profile) => profile.automaticTests.profileCoverage === 'fail').length,
      realCorpusPassCount: allResults.filter((result) => result.outcome === 'pass').length,
      realCorpusReviewCount: allResults.filter((result) => result.outcome === 'review').length,
      realCorpusNoOpCount: allResults.filter((result) => result.outcome === 'no-op').length,
      realCorpusFailCount: allResults.filter((result) => result.outcome === 'fail' || result.error).length,
      syntheticClosedLoopPassCount: allProfiles.filter((profile) => profile.automaticTests.syntheticClosedLoop === 'pass').length,
      syntheticClosedLoopNotRunCount: allProfiles.filter((profile) => profile.automaticTests.syntheticClosedLoop === 'not-run').length,
      cellCount: cellReport.summary.cellCount,
      coveredCellCount: cellReport.summary.coveredCount,
      uncoveredCellCount: cellReport.summary.uncoveredCount,
      resolvedCellCount: cellReport.summary.resolvedCount,
    },
    cellSummary: cellReport.summary,
  };
}
