/**
 * Read-only Upisnik resync preflight. Writes only .artifacts, never the authoring registry.
 * Run: npx tsx scripts/resync-upisnik.mts
 * Source integrity PASS is not canonical identity approval or national coverage.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUpisnikResults, UPISNIK_VRSTE, type UpisnikRow } from '../src/programs/upisnik-parse';
import { allProgrammesQuery } from '../src/programs/upisnik-resync';
import { assessRecordHarvest, reportedRowCount, reviewHarvests } from '../src/programs/upisnik-record-review';
import { createUpisnikSession } from '../src/programs/upisnik-session';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.artifacts', 'upisnik-resync');

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error('This preflight takes no arguments and writes only .artifacts/upisnik-resync.');
  mkdirSync(output, { recursive: true });
  rmSync(join(output, 'failure.json'), { force: true });
  writeFileSync(join(output, 'latest-report.json'), `${JSON.stringify({ status: 'FETCH_IN_PROGRESS', canonicalSync: 'NOT_APPLIED' })}\n`);
  const baseline = JSON.parse(readFileSync(join(root, 'data/programs/drafts/upisnik.json'), 'utf8')) as {
    source: { snapshotHash: string }; rowCount: number; rows: UpisnikRow[];
  };
  const baselineProblems = assessRecordHarvest({ rows: baseline.rows, skipped: [] }, UPISNIK_VRSTE, baseline.rowCount);
  if (baselineProblems.length) throw new Error(`INVALID_BASELINE: ${baselineProblems.join('; ')}`);

  const readPage = createUpisnikSession();
  const index = await readPage('index');
  console.log(JSON.stringify({ stage: 'source-index', url: index.url, contentType: index.contentType, hasSessionCookie: index.hasSessionCookie }));
  const query = allProgrammesQuery();
  const { html, url } = await readPage(`pretrazivanje?${query}`);
  const fetchedAt = new Date().toISOString();
  const snapshotHash = createHash('sha256').update(html, 'utf8').digest('hex');
  // Even a byte-identical retry has its own directory: an old candidate cannot survive failure.
  const runDir = mkdtempSync(join(output, `${snapshotHash.slice(0, 20)}-`));
  writeFileSync(join(runDir, 'source.html'), html, 'utf8');
  const parsed = parseUpisnikResults(html);
  const reportedCount = reportedRowCount(html);
  const problems = assessRecordHarvest(parsed, UPISNIK_VRSTE, reportedCount);
  if (/serverSide\s*["']?\s*:\s*true|sAjaxSource/i.test(html)) problems.push('SERVER_PAGINATION_NEEDS_EXPORT');
  const source = {
    name: 'Upisnik studijskih programa', url,
    publisher: 'Ministarstvo znanosti, obrazovanja i mladih',
    snapshotHash, snapshotBytes: Buffer.byteLength(html, 'utf8'), fetchedAt,
    searchQuery: query, selection: 'no optional checkbox selections',
  };
  const review = problems.length ? null : reviewHarvests(baseline.rows, parsed.rows);
  const candidateEligible = review !== null && review.quarantinedProgrammeCodes.length === 0;
  const report = {
    status: problems.length ? 'SOURCE_BLOCKED' : (review?.requiresReview ? 'REVIEW_REQUIRED' : 'NO_ROW_CHANGES'),
    sourceIntegrity: problems.length ? 'FAIL' : 'PASS',
    source, previousSnapshotHash: baseline.source.snapshotHash,
    previousRowCount: baseline.rows.length, fetchedRowCount: parsed.rows.length, reportedRowCount: reportedCount,
    uniqueRecordIds: new Set(parsed.rows.map((row) => row.sifraZapisa)).size,
    uniqueProgrammeCodes: new Set(parsed.rows.map((row) => row.sifraUpisnik)).size,
    quarantinedProgrammeCodes: review?.quarantinedProgrammeCodes ?? [],
    quarantinedLatestRows: review?.collisions.reduce((sum, group) => sum + group.latestRecords.length, 0) ?? null,
    comparableLatestRows: review?.latestComparableRecords.length ?? null,
    skippedRows: parsed.skipped, problems, diff: review?.diff ?? null,
    completeness: problems.length ? 'UNVERIFIED' : 'PARSED_ROWS_MATCH_REPORTED_TOTAL',
    recordsPath: 'records-upisnik.json', reviewPath: review ? 'identity-review.json' : null,
    candidatePath: candidateEligible ? 'candidate-upisnik.json' : null,
    canonicalSync: 'NOT_APPLIED', nationalCoverage: 'NOT_CALCULATED',
    notes: [
      'Counts describe source records and distinct codes, not confirmed active programmes.',
      'Collision codes are excluded from BOTH sides of the code-level diff and listed separately.',
      'All observed records remain in records-upisnik.json; no first/last-row deduplication.',
      'Changed or missing codes require review. Existing signed decisions must not be overwritten.',
      'Do not set upisnikSynced=true from this preflight or a green artifact-generation job.',
    ],
  };
  writeFileSync(join(runDir, 'records-upisnik.json'), `${JSON.stringify({ source, grain: 'sifraZapisa',
    sourceIntegrity: report.sourceIntegrity, rowCount: parsed.rows.length, rows: parsed.rows }, null, 2)}\n`);
  if (review) writeFileSync(join(runDir, 'identity-review.json'), `${JSON.stringify(review, null, 2)}\n`);
  if (candidateEligible) writeFileSync(join(runDir, 'candidate-upisnik.json'), `${JSON.stringify({
    source, rowCount: parsed.rows.length, rows: review.latestComparableRecords,
  }, null, 2)}\n`);
  writeFileSync(join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(output, 'latest-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, skippedRows: parsed.skipped.slice(0, 5), diff: review && {
    added: review.diff.added.length, missingFromLatest: review.diff.missingFromLatest.length,
    changed: review.diff.changed.length, unchanged: review.diff.unchanged, requiresReview: review.requiresReview,
  } }, null, 2));
  if (problems.length) throw new Error('Source validation failed; no canonical candidate was produced.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  mkdirSync(output, { recursive: true });
  const failure = { status: 'SOURCE_BLOCKED', error: message, canonicalSync: 'NOT_APPLIED', candidatePath: null };
  writeFileSync(join(output, 'failure.json'), `${JSON.stringify(failure, null, 2)}\n`);
  writeFileSync(join(output, 'latest-report.json'), `${JSON.stringify(failure, null, 2)}\n`);
  console.error(message);
  process.exitCode = 1;
});
