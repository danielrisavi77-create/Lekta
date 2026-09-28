/**
 * Laya V2.1: snapshot iz STVARNOG rezultata analize. Izvan tests/laya jer check:laya namjerno
 * ne typechecka src/** (Laya ne smije ovisiti o aplikaciji; ovdje samo test cita njezin izlaz).
 */
import { describe, expect, it } from 'vitest';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { snapshotFromAnalysis } from '../scripts/laya/snapshot-from-analysis.ts';
import { buildLayaCandidates } from '../scripts/laya/candidate-builder.ts';
import { DOC, ENGINE_REV, PROFILE_REV, makeCase } from './helpers/laya-v2-fixtures.ts';

const heading = (text: string): ParaSpec => ({ text, styleId: 'Heading1' });
const body = (text: string): ParaSpec => ({ text, font: 'Times New Roman', sizePt: 12 });
const TEXT = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada (Horvat, 2020). '.repeat(5);
// Sinteticki zapisi: prvi je potpun, drugi nema godinu (analiza ga vodi kao nepotpun).
const COMPLETE = 'Horvat, A. (2020). Sintetička knjiga o medijima. Zagreb: Naklada Primjer.';
const INCOMPLETE = 'Kovač, B. Sintetički članak bez godine izdanja i bez nakladnika.';

const meta = { documentRevisionId: DOC, profile: { id: 'synthetic-profile', revision: PROFILE_REV }, engineRevision: ENGINE_REV,
  provenance: makeCase().provenance, language: 'hr' as const };

describe('snapshot iz stvarne analize (V2.1)', () => {
  it('nepotpun zapis iz details.incompleteReferences postaje case s punim tekstom i eksplicitnom vezom', async () => {
    const result: any = await analyzeFixture(buildDocxFile({ paragraphs: [heading('Uvod'), body(TEXT), heading('Literatura'), body(COMPLETE), body(INCOMPLETE)] }, 'l.docx'));
    const check = result.checks.find((c: any) => c.id === 'reference.completeness');
    expect(check.status).toBe('warn');
    expect(result.details.incompleteReferences.map((r: any) => r.text)).toEqual([INCOMPLETE]);

    const snapshot = snapshotFromAnalysis(result, meta);
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.records[0]).toMatchObject({ checkId: 'reference.completeness', linkage: 'explicit', text: INCOMPLETE, recordIndex: 1 });
    expect(Object.keys(snapshot.result)).toEqual(['checks']);

    const { cases, skipped } = buildLayaCandidates(snapshot);
    expect(skipped).toEqual([]);
    expect(cases.map((c) => c.modelInput.text)).toEqual([INCOMPLETE]);
  });

  it('bez nepotpunih zapisa nema caseova; check pass daje check_not_finding', async () => {
    const result: any = await analyzeFixture(buildDocxFile({ paragraphs: [heading('Uvod'), body(TEXT), heading('Literatura'), body(COMPLETE)] }, 'p.docx'));
    expect(result.checks.find((c: any) => c.id === 'reference.completeness').status).toBe('pass');
    expect(buildLayaCandidates(snapshotFromAnalysis(result, meta)).cases).toEqual([]);
  });

  it('zapis bez polozaja u popisu literature nije eksplicitno vezan', () => {
    const result = { checks: [{ id: 'reference.completeness', status: 'warn' }],
      details: { references: [], incompleteReferences: [{ text: INCOMPLETE, p: 7 }] } };
    const { cases, skipped } = buildLayaCandidates(snapshotFromAnalysis(result, meta));
    expect(cases).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(['linkage_not_explicit']);
  });
});
