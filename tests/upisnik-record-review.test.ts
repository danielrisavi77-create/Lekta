import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { assessRecordHarvest, reportedRowCount, reviewHarvests } from '../src/programs/upisnik-record-review';
import { validateHarvest } from '../src/programs/upisnik-resync';
import type { UpisnikRow } from '../src/programs/upisnik-parse';

const TYPES = ['Stručni prijediplomski studij'];
const row = (code = '933', id = '3610', patch: Partial<UpisnikRow> = {}): UpisnikRow => ({
  sifraUpisnik: code, sifraZapisa: id, naziv: 'Fizioterapija', nameMarker: '1',
  nositelj: 'Zdravstveno veleučilište', izvoditelj: 'Zdravstveno veleučilište',
  vrsta: TYPES[0], mjesto: 'Zagreb', ...patch,
});
// Observed source example: one programme code, two distinct application record IDs.
const moved = row('933', '5465', {
  nositelj: 'Sveučilište u Zagrebu',
  izvoditelj: 'Sveučilište u Zagrebu Fakultet zdravstvenih studija u osnivanju',
});

describe('Upisnik result total', () => {
  it('reads the official hidden total, including attribute order and whitespace', () => {
    assert.equal(reportedRowCount('<span hidden="" id="sifreSize"> 1911 </span>'), 1911);
    assert.equal(reportedRowCount("<span id='sifreSize' hidden>4</span>"), 4);
  });
  it('fails closed on missing, ambiguous or malformed totals', () => {
    for (const html of ['', '<span id="sifreSize">1,911</span>', '<span id="sifreSize">-1</span>',
      '<span id="sifreSize">2</span><span id="sifreSize">2</span>',
      '<span id="sifreSize">9007199254740992</span>']) assert.equal(reportedRowCount(html), null);
  });
});

describe('record integrity is not programme-code uniqueness', () => {
  it('preserves both distinct records while the old canonical validator still rejects them', () => {
    const parsed = { rows: [row(), moved], skipped: [] };
    assert.deepEqual(assessRecordHarvest(parsed, TYPES, 2), []);
    assert.ok(validateHarvest(parsed, TYPES).includes('DUPLICATE_CODE: 933'));
    assert.equal(parsed.rows.length, 2);
  });
  it('still blocks duplicate application record IDs', () => {
    assert.ok(assessRecordHarvest({ rows: [row(), row('934')], skipped: [] }, TYPES, 2)
      .includes('DUPLICATE_RECORD: 3610'));
  });
  it('requires all reported rows, not just the first page', () => {
    assert.ok(assessRecordHarvest({ rows: [row()], skipped: [] }, TYPES, 1911).includes('REPORTED_COUNT_MISMATCH: 1911 != 1'));
  });
  it('blocks missing totals rather than guessing completeness', () => {
    assert.ok(assessRecordHarvest({ rows: [row()], skipped: [] }, TYPES, null).includes('REPORTED_COUNT_UNAVAILABLE'));
  });
  it('rejects invalid caller totals', () => {
    for (const n of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.ok(assessRecordHarvest({ rows: [row()], skipped: [] }, TYPES, n).includes('REPORTED_COUNT_UNAVAILABLE'));
    }
  });
  it('does not hide skipped rows or an empty source', () => {
    assert.ok(assessRecordHarvest({ rows: [], skipped: [] }, TYPES, 0).includes('EMPTY_RESULT'));
    assert.ok(assessRecordHarvest({ rows: [row()], skipped: ['bad'] }, TYPES, 1).includes('SKIPPED_ROWS: 1'));
  });
  it('preserves invalid-code and invalid-record blockers', () => {
    const problems = assessRecordHarvest({ rows: [row('', '')], skipped: [] }, TYPES, 1);
    assert.ok(problems.includes('INVALID_CODE: '));
    assert.ok(problems.includes('INVALID_RECORD: '));
  });
  it('preserves unknown-type and required-field blockers', () => {
    const problems = assessRecordHarvest({ rows: [row('933', '3610', { vrsta: 'Unknown', izvoditelj: ' ' })], skipped: [] }, TYPES, 1);
    assert.ok(problems.includes('UNKNOWN_TYPE: 933: Unknown'));
    assert.ok(problems.includes('MISSING_FIELD: 933: izvoditelj'));
  });
});

describe('lossless quarantine and safe comparison', () => {
  it('keeps both executor versions and the old record for review', () => {
    const result = reviewHarvests([row()], [moved, row()]);
    assert.deepEqual(result.quarantinedProgrammeCodes, ['933']);
    assert.deepEqual(result.collisions[0].previousRecords, [row()]);
    assert.deepEqual(result.collisions[0].latestRecords, [row(), moved]);
    assert.deepEqual(result.collisions[0].differentFields, ['sifraZapisa', 'nositelj', 'izvoditelj']);
    assert.equal(result.collisions[0].status, 'NEEDS_VERIFICATION');
    assert.equal(result.latestComparableRecords.length, 0);
  });
  it('does not turn a quarantined previous row into a disappearance', () => {
    const result = reviewHarvests([row()], [row(), moved]);
    assert.deepEqual(result.diff.missingFromLatest, []);
    assert.deepEqual(result.diff.added, []);
    assert.equal(result.requiresReview, true);
  });
  it('quarantines a code present only as a duplicate in the baseline too', () => {
    const result = reviewHarvests([row(), moved], [row()]);
    assert.deepEqual(result.quarantinedProgrammeCodes, ['933']);
    assert.deepEqual(result.diff.added, []);
    assert.equal(result.latestComparableRecords.length, 0);
  });
  it('still reports unrelated additions, changes and disappearances', () => {
    const result = reviewHarvests([row(), row('1', '1'), row('2', '2')],
      [row(), moved, row('2', '2', { naziv: 'New name' }), row('3', '3')]);
    assert.deepEqual(result.diff.added, ['3']);
    assert.deepEqual(result.diff.missingFromLatest, ['1']);
    assert.deepEqual(result.diff.changed, [{ sifraUpisnik: '2', fields: ['naziv'] }]);
    assert.equal(result.latestComparableRecords.length, 2);
  });
  it('keeps numerically ordered multiple collision groups, not first wins', () => {
    const rows = [row('10', '4'), row('9', '2'), row('10', '3'), row('9', '1')];
    const result = reviewHarvests([], rows);
    assert.deepEqual(result.quarantinedProgrammeCodes, ['9', '10']);
    assert.equal(result.collisions.flatMap((c) => c.latestRecords).length, 4);
  });
  it('records a collision even when content except record ID is identical', () => {
    const result = reviewHarvests([], [row('933', '2'), row('933', '1')]);
    assert.deepEqual(result.collisions[0].differentFields, ['sifraZapisa']);
    assert.equal(result.requiresReview, true);
  });
  it('does not require review for reordered identical unique records', () => {
    const first = row('1', '1'); const second = row('2', '2');
    const result = reviewHarvests([first, second], [second, first]);
    assert.equal(result.requiresReview, false);
    assert.equal(result.diff.unchanged, 2);
    assert.deepEqual(result.quarantinedProgrammeCodes, []);
  });
  it('never mutates the supplied raw records or their order', () => {
    const before = [row()]; const after = [moved, row()];
    const original = JSON.stringify([before, after]);
    reviewHarvests(before, after);
    assert.equal(JSON.stringify([before, after]), original);
  });
});
