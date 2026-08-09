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
    ir.research.nodes.push({
      id: 'root-1',
      type: 'dataset',
      label: 'Dataset',
      persistence: 'local-project',
    });
    expect(validateAcademicIR(ir).findings.some((f) => f.code === 'IR_DUPLICATE_ID')).toBe(true);
  });
});
