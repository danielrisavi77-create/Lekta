// @vitest-environment node
// Cijeli eval tok nad lazim lokalnim runtimeom: registar, zlatni skup, dva redoslijeda oznaka, izvjestaj.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decisionCaseId, decisionInputDigest } from '../../scripts/laya/contracts-v2.ts';
import type { LayaDecisionCaseV2, LayaVerdict } from '../../scripts/laya/contracts-v2.ts';
import { loadGoldSet, runEvalCli } from '../../scripts/laya/eval-run.ts';
import { LAYA_FIXTURE_MODEL, makeCase, makePolicy, makeResult, makeRuntime } from '../helpers/laya-v2-fixtures.ts';

function caseAt(recordIndex: number): LayaDecisionCaseV2 {
  const base = makeCase();
  const identity = { ...base.identity, recordIndex };
  return { ...base, identity, caseId: decisionCaseId(identity), inputDigest: decisionInputDigest(identity, base.engine, base.modelInput) };
}

describe('laya:eval nad lokalnim runtimeom', () => {
  let server: Server;
  let endpoint = '';
  const dir = mkdtempSync(join(tmpdir(), 'laya-eval-'));
  const cases = [caseAt(0), caseAt(1), caseAt(2)];
  // Runtime uvijek kaze finding_supported; u obrnutom redoslijedu oznaka za zadnji case mijenja misljenje.
  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const r = JSON.parse(body);
        const flipped = r.labelOrder[0] === 'insufficient_evidence' && r.caseId === cases[2].caseId;
        const verdict: LayaVerdict = flipped ? 'possible_false_positive' : 'finding_supported';
        const probabilities = { finding_supported: 0.1, possible_false_positive: 0.1, extraction_uncertain: 0.1, insufficient_evidence: 0.1, [verdict]: 0.7 };
        res.end(JSON.stringify({ ...makeResult(), caseId: r.caseId, inputDigest: r.inputDigest, verdict, probabilities }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const write = (name: string, value: unknown) => { const p = join(dir, name); writeFileSync(p, JSON.stringify(value)); return p; };
  const registry = () => write('registry.json', { schemaVersion: 1, entries: [{ entryId: LAYA_FIXTURE_MODEL, manifest: makeRuntime(), policy: makePolicy(), calibrationEvidence: 'fixture' }] });
  const gold = (split: 'calibration' | 'test') => write(`gold-${split}.json`, { schemaVersion: 1, datasetId: 'd0-fixture', split,
    items: [{ case: cases[0], gold: 'finding_supported' }, { case: cases[1], gold: 'possible_false_positive' }, { case: cases[2], gold: 'finding_supported' }] });

  it('izvjestaj ima metrike, baselineove, stabilnost redoslijeda i nijedan tekst zapisa', async () => {
    const out = join(dir, 'report.json');
    const code = await runEvalCli(['--gold', gold('calibration'), '--endpoint', endpoint, '--model-key', LAYA_FIXTURE_MODEL,
      '--registry', registry(), '--out', out, '--calibrate', '--min-accuracy', '0.5']);
    expect(code).toBe(0);
    const text = readFileSync(out, 'utf8');
    const report = JSON.parse(text);
    expect(report).toMatchObject({ n: 3, runtimeAnswered: 3, split: 'calibration', noAdjudicationReasons: {} });
    expect(report.laya.coverage).toBe(1);
    expect(report.laya.accuracyOnCovered).toBeCloseTo(2 / 3);
    expect(report.optionOrderInstability).toBeCloseTo(1 / 3);
    expect(report.baselines.currentHeuristic.accuracyOnCovered).toBeCloseTo(2 / 3);
    expect(typeof report.suggestedThreshold).toBe('number');
    expect(text).not.toContain(makeCase().modelInput.text);
    expect(text).not.toContain(cases[0].caseId);
  });

  it('nepoznat kljuc modela ne pokrece evaluaciju', async () => {
    expect(await runEvalCli(['--gold', gold('test'), '--endpoint', endpoint, '--model-key', 'nepostojeci', '--registry', registry()])).toBe(1);
  });

  it('zlatni skup se strogo provjerava', () => {
    expect(() => loadGoldSet({ schemaVersion: 1, datasetId: 'x', split: 'test', items: [] })).toThrow();
    expect(() => loadGoldSet({ schemaVersion: 1, datasetId: 'x', split: 'test', items: [{ case: cases[0], gold: 'pass' }] })).toThrow();
    expect(() => loadGoldSet({ schemaVersion: 1, datasetId: 'x', split: 'test', items: [{ case: { ...cases[0], caseId: 'krivo' }, gold: 'finding_supported' }] })).toThrow();
    expect(() => loadGoldSet({ schemaVersion: 1, datasetId: 'x', split: 'test', items: [{ case: cases[0], gold: 'finding_supported' }, { case: cases[0], gold: 'finding_supported' }] })).toThrow();
  });
});
