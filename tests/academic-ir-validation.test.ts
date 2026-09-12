import { describe, expect, it } from 'vitest';
import { createAcademicIR, validateAcademicIR } from '../src/academic-ir';

describe('Academic IR validation', () => {
  it('accepts the minimal root', () => {
    const ir = createAcademicIR({ projectId: 'project-1', generatedAt: '2026-08-09T18:00:00.000Z', documentRootId: 'root-1' });
    expect(validateAcademicIR(ir)).toEqual({ valid: true, findings: [] });
  });

  it('rejects a missing document child', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.document.nodes[0].childIds = ['missing-child'];
    expect(validateAcademicIR(ir).findings).toContainEqual({
      code: 'IR_DOCUMENT_CHILD_MISSING',
      severity: 'error',
      path: 'document.nodes[root-1].childIds[0]',
      message: 'Document child "missing-child" does not resolve to a document node.',
    });
  });

  it('rejects a document cycle', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.document.nodes.push({ id: 'p-1', type: 'paragraph', parentId: 'root-1', childIds: ['root-1'], persistence: 'local-project' });
    ir.document.nodes[0].parentId = 'p-1';
    ir.document.nodes[0].childIds = ['p-1'];
    expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_DOCUMENT_CYCLE')).toBe(true);
  });

  it('rejects an entity ID reused across graph scopes', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.research.nodes.push({ id: 'root-1', type: 'dataset', label: 'Dataset', persistence: 'local-project' });
    expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_DUPLICATE_ID')).toBe(true);
  });

  it('rejects evidence referencing a missing claim', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.research.edges.push({
      id: 'e-1', type: 'evidence', claimId: 'missing-claim',
      target: { type: 'document-node', id: 'root-1' },
      relation: 'supports', persistence: 'local-project',
    });
    expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_EVIDENCE_CLAIM_MISSING')).toBe(true);
  });

  it('rejects evidence whose typed research target is wrong', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.research.nodes.push(
      {
        id: 'claim-1', type: 'claim', statement: 'Tvrdnja', kind: 'empirical', documentNodeIds: ['root-1'],
        status: 'draft', persistence: 'local-project', createdAt: '2026-08-09T18:00:00.000Z', updatedAt: '2026-08-09T18:00:00.000Z',
      },
      { id: 'dataset-1', type: 'dataset', label: 'Dataset', persistence: 'local-project' },
    );
    ir.research.edges.push({
      id: 'e-1', type: 'evidence', claimId: 'claim-1',
      target: { type: 'source', id: 'dataset-1' }, relation: 'supports', persistence: 'local-project',
    });
    expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_EVIDENCE_TARGET_MISSING')).toBe(true);
  });

  it('rejects a mutable submission snapshot', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.snapshots.push({
      id: 'snap-1', projectId: 'project-1', kind: 'submission', academicIrDigest: 'abc',
      createdAt: '2026-08-09T18:00:00.000Z', immutable: false,
    });
    expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_SUBMISSION_MUTABLE')).toBe(true);
  });

  it('rejects a relation whose declared endpoint is missing', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.research.edges.push({
      id: 'rel-1', type: 'relation',
      from: { scope: 'document-node', id: 'root-1' },
      to: { scope: 'research-node', id: 'missing-node' },
      relation: 'discussed-in', persistence: 'local-project',
    });
    expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_RESEARCH_ENDPOINT_MISSING')).toBe(true);
  });

  it('rejects an analysis whose dataset does not resolve to DatasetNode', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.research.nodes.push({
      id: 'analysis-1', type: 'analysis', engine: 'jamovi', analysisType: 'pearson-correlation',
      datasetIds: ['missing-dataset'], specification: {}, outputs: [], status: 'declared',
      persistence: 'local-project',
    });
    expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_ANALYSIS_DATASET_MISSING')).toBe(true);
  });

  it('rejects research document links that no longer resolve', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.research.nodes.push({
      id: 'claim-1', type: 'claim', statement: 'Tvrdnja', kind: 'empirical', documentNodeIds: ['missing-p'],
      status: 'draft', persistence: 'local-project', createdAt: '2026-08-09T18:00:00.000Z', updatedAt: '2026-08-09T18:00:00.000Z',
    });
    expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_DOCUMENT_LINK_MISSING')).toBe(true);
  });

  it('rejects a snapshot project mismatch', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.snapshots.push({
      id: 'snap-1', projectId: 'project-2', kind: 'working', academicIrDigest: 'abc',
      createdAt: '2026-08-09T18:00:00.000Z', immutable: false,
    });
    expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_SNAPSHOT_PROJECT_MISMATCH')).toBe(true);
  });

  it('rejects an invalid snapshot timestamp', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.snapshots.push({
      id: 'snap-1', projectId: 'project-1', kind: 'working', academicIrDigest: 'abc',
      createdAt: 'not-a-date', immutable: false,
    });
    expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_SNAPSHOT_CREATED_AT_INVALID')).toBe(true);
  });
});
