/**
 * Read-only Upisnik resync preflight. Writes only .artifacts, never the authoring registry.
 * Run: npx tsx scripts/resync-upisnik.mts
 * A valid candidate is not an approved mapping, complete national coverage, or a deployment.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUpisnikResults, UPISNIK_VRSTE, type UpisnikRow } from '../src/programs/upisnik-parse';
import { allProgrammesQuery, compareHarvests, validateHarvest } from '../src/programs/upisnik-resync';
import { createUpisnikSession } from '../src/programs/upisnik-session';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.artifacts', 'upisnik-resync');
const BASE = 'https://hko.srce.hr/usp';

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error('This preflight takes no arguments and writes only .artifacts/upisnik-resync.');
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'latest-report.json'), `${JSON.stringify({ status: 'FETCH_IN_PROGRESS', canonicalSync: 'NOT_APPLIED' })}\n`);
  const baseline = JSON.parse(readFileSync(join(root, 'data/programs/drafts/upisnik.json'), 'utf8')) as {
    source: { snapshotHash: string }; rowCount: number; rows: UpisnikRow[];
  };
  const baselineProblems = validateHarvest({ rows: baseline.rows, skipped: [] }, UPISNIK_VRSTE);
  if (baseline.rowCount !== baseline.rows.length) baselineProblems.push('BASELINE_COUNT_MISMATCH');
  if (baselineProblems.length) throw new Error(`INVALID_BASELINE: ${baselineProblems.join('; ')}`);

  const readPage = createUpisnikSession();
  const index = await readPage('index');
  console.log(JSON.stringify({ stage: 'source-index', url: index.url, contentType: index.contentType, hasSessionCookie: index.hasSessionCookie }));
  const query = allProgrammesQuery();
  const { html } = await readPage(`pretrazivanje?${query}`);
  const fetchedAt = new Date().toISOString();
  const snapshotHash = createHash('sha256').update(html, 'utf8').digest('hex');
  // An immutable run subdirectory prevents a failed retry from reusing an earlier candidate.
  const runDir = join(output, snapshotHash);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'source.html'), html, 'utf8');
  const parsed = parseUpisnikResults(html);
  const problems = validateHarvest(parsed, UPISNIK_VRSTE);
  // The current parser reads a whole HTML table, not paginated API responses.
  if (/serverSide\s*["']?\s*:\s*true|sAjaxSource/i.test(html)) problems.push('SERVER_PAGINATION_NEEDS_EXPORT');
  const source = {
    name: 'Upisnik studijskih programa', url: `${BASE}/index`,
    publisher: 'Ministarstvo znanosti, obrazovanja i mladih',
    snapshotHash, snapshotBytes: Buffer.byteLength(html, 'utf8'), fetchedAt,
    searchQuery: query, selection: 'no optional checkbox selections',
  };
  const diff = problems.length ? null : compareHarvests(baseline.rows, parsed.rows);
  const report = {
    status: problems.length ? 'SOURCE_BLOCKED' : (diff?.requiresReview ? 'REVIEW_REQUIRED' : 'NO_ROW_CHANGES'),
    source, previousSnapshotHash: baseline.source.snapshotHash,
    previousRowCount: baseline.rows.length, fetchedRowCount: parsed.rows.length,
    uniqueProgrammeCodes: new Set(parsed.rows.map((row) => row.sifraUpisnik)).size,
    skippedRows: parsed.skipped, problems, diff,
    completeness: 'UNVERIFIED_UNTIL_OFFICIAL_RESULT_OR_EXPORT_RECONCILED',
    canonicalSync: 'NOT_APPLIED', nationalCoverage: 'NOT_CALCULATED',
    notes: [
      'Row count is not active programme coverage; status and scope still require verification.',
      'Changed or missing codes require review. Existing signed decisions must not be overwritten.',
      'Do not set upisnikSynced=true from this preflight.',
    ],
  };
  writeFileSync(join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(output, 'latest-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (!problems.length) {
    const candidate = {
      source, rowCount: parsed.rows.length,
      rows: [...parsed.rows].sort((a, b) => a.sifraUpisnik.localeCompare(b.sifraUpisnik, 'hr', { numeric: true })),
    };
    writeFileSync(join(runDir, 'candidate-upisnik.json'), `${JSON.stringify(candidate, null, 2)}\n`);
  }
  console.log(JSON.stringify({ ...report, skippedRows: parsed.skipped.slice(0, 5), diff: diff && {
    added: diff.added.length, missingFromLatest: diff.missingFromLatest.length,
    changed: diff.changed.length, unchanged: diff.unchanged, requiresReview: diff.requiresReview,
  } }, null, 2));
  if (problems.length) throw new Error('Source validation failed; no candidate was produced.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'failure.json'), `${JSON.stringify({ status: 'SOURCE_BLOCKED', error: message, canonicalSync: 'NOT_APPLIED' }, null, 2)}\n`);
  console.error(message);
  process.exitCode = 1;
});
