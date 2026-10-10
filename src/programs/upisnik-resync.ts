/** Read-only resync preflight. No registry writes or automatic identity decisions. */
import type { ParseResult, UpisnikRow } from './upisnik-parse';

/** Putanje iz latest-report.json racunaju se u odnosu na samu kopiju u .artifacts/upisnik-resync. */
export interface UpisnikReportPaths {
  recordsPath: string;
  reviewPath: string | null;
  candidatePath: string | null;
}

export function latestReportPaths(paths: UpisnikReportPaths, runName: string): UpisnikReportPaths {
  if (!/^[a-f0-9]{20}-[A-Za-z0-9_-]{6,}$/.test(runName)) throw new Error('INVALID_RUN_DIRECTORY');
  const prefix = (filename: string | null): string | null => {
    if (filename === null) return null;
    if (!/^[a-z0-9-]+[.]json$/.test(filename)) throw new Error('INVALID_ARTIFACT_FILENAME');
    return runName + '/' + filename;
  };
  return {
    recordsPath: prefix(paths.recordsPath)!,
    reviewPath: prefix(paths.reviewPath),
    candidatePath: prefix(paths.candidatePath),
  };
}

/**
 * If validation rejects a parsed source, latest-report must still link to that RUN's
 * saved HTML and records; only a failure before run creation drops evidence links.
 */
export function latestFailureReport(prior: unknown, message: string): Record<string, unknown> {
  const failure: Record<string, unknown> = {
    status: 'SOURCE_BLOCKED', error: message, canonicalSync: 'NOT_APPLIED', candidatePath: null,
  };
  if (!prior || typeof prior !== 'object') return failure;
  const data = prior as Record<string, unknown>;
  const source = data.source;
  const records = data.recordsPath;
  if (!source || typeof source !== 'object'
    || typeof (source as Record<string, unknown>).snapshotHash !== 'string'
    || typeof records !== 'string'
    || !/^[a-f0-9]{20}-[A-Za-z0-9_-]{6,}\/records-upisnik[.]json$/.test(records)) {
    return failure;
  }
  return { ...data, ...failure, recordsPath: records };
}

/** Empty checkbox groups mean all; selecting every known value excludes unlisted values. */
export function allProgrammesQuery(): string {
  const query = new URLSearchParams();
  for (const key of ['naziv', 'strucniNazivText', 'sifraUpisnik']) query.set(key, '');
  query.set('strucniNaziv', '-1');
  for (const key of ['nositelj', 'izvodac', 'vlasnistvo', 'podrucje', 'polje', 'mjesto',
    'jezikIzvodenja', 'akGodIzvodenja', 'tipLokacije', 'stem', 'stemStipendije']) query.set(key, '0');
  for (const key of ['vrsta', 'nacinImplementacije', 'jednopredmetni', 'nacinIzvodenja']) {
    query.set(`_${key}`, 'on');
  }
  return query.toString();
}

/** Invalid/duplicate identities are quarantined, never silently dropped or overwritten. */
export function validateHarvest(result: ParseResult, allowedTypes: readonly string[]): string[] {
  const problems: string[] = [];
  if (!result.rows.length) problems.push('EMPTY_RESULT');
  if (result.skipped.length) problems.push(`SKIPPED_ROWS: ${result.skipped.length}`);
  const codes = new Set<string>();
  const records = new Set<string>();
  const types = new Set(allowedTypes);
  for (const row of result.rows) {
    const code = row.sifraUpisnik;
    if (!/^\d+$/.test(code)) problems.push(`INVALID_CODE: ${code}`);
    if (!/^\d+$/.test(row.sifraZapisa)) problems.push(`INVALID_RECORD: ${code}`);
    if (codes.has(code)) problems.push(`DUPLICATE_CODE: ${code}`);
    if (records.has(row.sifraZapisa)) problems.push(`DUPLICATE_RECORD: ${row.sifraZapisa}`);
    codes.add(code);
    records.add(row.sifraZapisa);
    if (!types.has(row.vrsta)) problems.push(`UNKNOWN_TYPE: ${code}: ${row.vrsta}`);
    for (const field of ['naziv', 'nositelj', 'izvoditelj'] as const) {
      if (!row[field].trim()) problems.push(`MISSING_FIELD: ${code}: ${field}`);
    }
  }
  return problems;
}

export interface HarvestDiff {
  added: string[];
  missingFromLatest: string[];
  changed: Array<{ sifraUpisnik: string; fields: Array<keyof UpisnikRow> }>;
  unchanged: number;
  requiresReview: boolean;
}

/** A disappearing code is a review item, not evidence of discontinuation. */
export function compareHarvests(previous: readonly UpisnikRow[], latest: readonly UpisnikRow[]): HarvestDiff {
  const index = (rows: readonly UpisnikRow[]): Map<string, UpisnikRow> => {
    const result = new Map<string, UpisnikRow>();
    for (const row of rows) {
      if (result.has(row.sifraUpisnik)) throw new Error(`DUPLICATE_CODE: ${row.sifraUpisnik}`);
      result.set(row.sifraUpisnik, row);
    }
    return result;
  };
  const before = index(previous);
  const after = index(latest);
  const sort = (codes: string[]): string[] => codes.sort((a, b) => a.localeCompare(b, 'hr', { numeric: true }));
  const added = sort([...after.keys()].filter((code) => !before.has(code)));
  const missingFromLatest = sort([...before.keys()].filter((code) => !after.has(code)));
  const fields: Array<keyof UpisnikRow> = ['sifraZapisa', 'naziv', 'nameMarker', 'nositelj', 'izvoditelj', 'vrsta', 'mjesto'];
  const changed: HarvestDiff['changed'] = [];
  let unchanged = 0;
  for (const code of sort([...after.keys()])) {
    const old = before.get(code);
    if (!old) continue;
    const current = after.get(code)!;
    const changes = fields.filter((field) => old[field] !== current[field]);
    if (changes.length) changed.push({ sifraUpisnik: code, fields: changes });
    else unchanged += 1;
  }
  return { added, missingFromLatest, changed, unchanged,
    requiresReview: Boolean(added.length || missingFromLatest.length || changed.length) };
}
