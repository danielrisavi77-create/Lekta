/** Lossless source-record review. A programme code is not an application record ID. */
import type { ParseResult, UpisnikRow } from './upisnik-parse';
import { compareHarvests, validateHarvest, type HarvestDiff } from './upisnik-resync';

/** The source reports its complete client-side result count separately from the table. */
export function reportedRowCount(html: string): number | null {
  const matches = [...html.matchAll(/<span\b[^>]*\sid\s*=\s*(['"])sifreSize\1[^>]*>([\s\S]*?)<\/span\s*>/gi)];
  if (matches.length !== 1 || !/^\d+$/.test(matches[0][2].trim())) return null;
  const value = Number(matches[0][2].trim());
  return Number.isSafeInteger(value) ? value : null;
}

/** Repeated programme codes require identity review; repeated record IDs remain corruption. */
export function assessRecordHarvest(parsed: ParseResult, allowedTypes: readonly string[], reportedCount: number | null): string[] {
  const problems = validateHarvest(parsed, allowedTypes).filter((problem) => !problem.startsWith('DUPLICATE_CODE: '));
  if (reportedCount === null || !Number.isSafeInteger(reportedCount) || reportedCount < 0) {
    problems.push('REPORTED_COUNT_UNAVAILABLE');
  } else if (reportedCount !== parsed.rows.length) {
    problems.push(`REPORTED_COUNT_MISMATCH: ${reportedCount} != ${parsed.rows.length}`);
  }
  return problems;
}

export interface ProgrammeCollision {
  sifraUpisnik: string;
  status: 'NEEDS_VERIFICATION';
  previousRecords: UpisnikRow[];
  latestRecords: UpisnikRow[];
  differentFields: Array<keyof UpisnikRow>;
}
export interface RecordHarvestReview {
  quarantinedProgrammeCodes: string[];
  collisions: ProgrammeCollision[];
  latestComparableRecords: UpisnikRow[];
  diff: HarvestDiff;
  requiresReview: boolean;
}
const byId = (a: string, b: string): number => a.localeCompare(b, 'hr', { numeric: true });
const FIELDS: Array<keyof UpisnikRow> = ['sifraZapisa', 'naziv', 'nameMarker', 'nositelj', 'izvoditelj', 'vrsta', 'mjesto'];

function byProgramme(rows: readonly UpisnikRow[]): Map<string, UpisnikRow[]> {
  const result = new Map<string, UpisnikRow[]>();
  const records = new Set<string>();
  for (const row of rows) {
    if (records.has(row.sifraZapisa)) throw new Error(`DUPLICATE_RECORD: ${row.sifraZapisa}`);
    records.add(row.sifraZapisa);
    const group = result.get(row.sifraUpisnik) ?? [];
    group.push(row);
    result.set(row.sifraUpisnik, group);
  }
  return result;
}

/** Quarantine BOTH sides of a collision: do not fabricate additions or disappearances. */
export function reviewHarvests(previous: readonly UpisnikRow[], latest: readonly UpisnikRow[]): RecordHarvestReview {
  const before = byProgramme(previous);
  const after = byProgramme(latest);
  const quarantined = new Set([...before, ...after].filter(([, rows]) => rows.length > 1).map(([code]) => code));
  const quarantinedProgrammeCodes = [...quarantined].sort(byId);
  const sorted = (rows: UpisnikRow[]): UpisnikRow[] => [...rows].sort((a, b) => byId(a.sifraZapisa, b.sifraZapisa));
  const collisions: ProgrammeCollision[] = quarantinedProgrammeCodes.map((sifraUpisnik) => {
    const previousRecords = sorted(before.get(sifraUpisnik) ?? []);
    const latestRecords = sorted(after.get(sifraUpisnik) ?? []);
    const records = [...previousRecords, ...latestRecords];
    return { sifraUpisnik, status: 'NEEDS_VERIFICATION', previousRecords, latestRecords,
      differentFields: FIELDS.filter((field) => new Set(records.map((row) => row[field])).size > 1) };
  });
  const latestComparableRecords = latest.filter((row) => !quarantined.has(row.sifraUpisnik))
    .sort((a, b) => byId(a.sifraUpisnik, b.sifraUpisnik));
  const diff = compareHarvests(previous.filter((row) => !quarantined.has(row.sifraUpisnik)), latestComparableRecords);
  return { quarantinedProgrammeCodes, collisions, latestComparableRecords, diff,
    requiresReview: collisions.length > 0 || diff.requiresReview };
}
