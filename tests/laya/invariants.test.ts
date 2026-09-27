/**
 * Invarijante Laya v2 koje vrijede prije ikakvog modela:
 *  - src/** ne uvozi Layu do shadow GO odluke;
 *  - builder i adjudikacija ne mijenjaju kanonski rezultat (checks, issues, score);
 *  - registry ne ukljucuje formalne osi i sadrzi samo poznate stabilne check id-jeve.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLayaCandidates } from '../../scripts/laya/candidate-builder.ts';
import { adjudicate } from '../../scripts/laya/contracts-v2.ts';
import {
  LAYA_ELIGIBLE_CHECKS, LAYA_FORBIDDEN_CHECK_PREFIXES, LAYA_FUTURE_CANDIDATES, isLayaEligibleCheck, isLayaForbiddenCheck,
} from '../../scripts/laya/eligibility.ts';
import { allCheckIds } from '../../src/scoring/check-id-registry';
import { srcLayaImportProblems, type SourceFile } from '../helpers/laya-src-boundary.ts';
import { deepFreeze, makePolicy, makeResult, makeRuntime, makeSnapshot } from '../helpers/laya-v2-fixtures.ts';

const ROOT = resolve(__dirname, '../..');

function sourceFiles(dir: string): SourceFile[] {
  const out: SourceFile[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(?:[cm]?[jt]sx?)$/.test(name)) out.push({ path: relative(ROOT, full), source: readFileSync(full, 'utf8') });
  }
  return out;
}

describe('Laya v2 invarijante', () => {
  it('src/** ne uvozi Layu (granica do shadow GO)', () => {
    const files = sourceFiles(join(ROOT, 'src'));
    expect(files.length).toBeGreaterThan(100);
    expect(srcLayaImportProblems(files)).toEqual([]);
  });

  it('builder + adjudikacija nad zamrznutim rezultatom: kanonski rezultat ostaje identican', () => {
    const snapshot = makeSnapshot();
    const before = structuredClone(snapshot);
    deepFreeze(snapshot);
    const { cases } = buildLayaCandidates(snapshot);
    const verdicts = cases.map(c => adjudicate({ ...makeResult(), verdict: 'possible_false_positive',
      probabilities: { finding_supported: 0.01, possible_false_positive: 0.97, extraction_uncertain: 0.01, insufficient_evidence: 0.01 },
      answerConfidence: 0.99 }, c, makeRuntime(), makePolicy()));
    expect(verdicts[0]).toMatchObject({ status: 'adjudicated', verdict: 'possible_false_positive' });
    // Ni najjaci possible_false_positive ne mijenja checks, issues ni score.
    expect(snapshot).toEqual(before);
  });

  it('registry: samo poznati stabilni id-jevi, nikad formalne osi', () => {
    const known = new Set(allCheckIds());
    for (const id of LAYA_ELIGIBLE_CHECKS) {
      expect(known.has(id), id).toBe(true);
      expect(isLayaForbiddenCheck(id)).toBe(false);
    }
    for (const id of LAYA_FUTURE_CANDIDATES) expect(isLayaEligibleCheck(id)).toBe(false);
    const formal = [...known].filter(isLayaForbiddenCheck);
    expect(formal.length).toBeGreaterThan(0);
    expect(formal.filter(isLayaEligibleCheck)).toEqual([]);
    expect(LAYA_FORBIDDEN_CHECK_PREFIXES).toContain('page.');
  });
});
