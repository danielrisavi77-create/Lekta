import { describe, expect, it } from 'vitest';
import { ACADEMIC_IR_SCHEMA_VERSION, projectLektaDocument } from '../src/academic-ir';
import { ACADEMIC_SUITE_CONTRACT_VERSION } from '../src/integration/academic-suite-contracts';
import { toSharedLektaResult } from '../src/integration/lekta-result-adapter';
import { issue, makeCheck } from '../src/scoring/checks';

describe('Academic IR boundaries', () => {
  it('keeps Academic IR and Academic Suite versions independent', () => {
    expect(ACADEMIC_IR_SCHEMA_VERSION).toBe('0.1');
    expect(ACADEMIC_SUITE_CONTRACT_VERSION).toBe('0.1');
  });

  it('does not put local paragraph text or Issue.detail/where into shared LektaResult', async () => {
    const sensitiveParagraph = 'OSJETLJIV SADRŽAJ TIJELA RADA';
    const sensitiveDetail = 'OSJETLJIV DETALJ IZ DOKUMENTA';
    const sensitiveWhere = 'OSJETLJIVA LOKACIJA';
    const values = ['root-1', 'p-1'];
    let index = 0;

    const projection = await projectLektaDocument({
      projectId: 'project-1', documentFingerprint: 'doc-v1',
      paragraphs: [{ paragraphIndex: 12, text: sensitiveParagraph }],
    }, undefined, { idFactory: () => values[index++] });
    expect(JSON.stringify(projection.graph)).not.toContain(sensitiveParagraph);

    const finding = issue('warning', 'structure', 'Nalaz', sensitiveDetail, sensitiveWhere);
    const shared = toSharedLektaResult({
      score: 80,
      checks: [makeCheck('structure', 'Provjera', 'warn', 1, 2, 'detail', finding)],
      issues: [finding],
    }, {
      analysisId: 'analysis-1', rulesetId: 'rules-1', analyzedAt: '2026-08-09T18:00:00.000Z',
      projectId: 'project-1', documentFingerprint: 'doc-v1',
    });

    const payload = JSON.stringify(shared);
    expect(payload).not.toContain(sensitiveParagraph);
    expect(payload).not.toContain(sensitiveDetail);
    expect(payload).not.toContain(sensitiveWhere);
  });
});
