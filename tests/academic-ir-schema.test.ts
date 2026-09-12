import { describe, expect, it } from 'vitest';
import {
  ACADEMIC_IR_SCHEMA_VERSION,
  createAcademicIR,
  type AcademicIR,
  type ClaimNode,
  type EvidenceEdge,
} from '../src/academic-ir';

describe('Academic IR schema v0.1', () => {
  it('locks the independent Academic IR version', () => {
    expect(ACADEMIC_IR_SCHEMA_VERSION).toBe('0.1');
  });

  it('creates the minimal local-first root', () => {
    const ir = createAcademicIR({
      projectId: 'project-123',
      generatedAt: '2026-08-09T18:00:00.000Z',
      documentRootId: 'doc-root',
    });
    expect(ir).toEqual({
      schemaVersion: '0.1',
      projectId: 'project-123',
      generatedAt: '2026-08-09T18:00:00.000Z',
      document: {
        rootId: 'doc-root',
        nodes: [{ id: 'doc-root', type: 'document', childIds: [], persistence: 'local-project' }],
      },
      research: { nodes: [], edges: [] },
      process: { events: [] },
      provenance: { events: [] },
      snapshots: [],
    } satisfies AcademicIR);
  });

  it('keeps claim identity separate from evidence identity', () => {
    const claim: ClaimNode = {
      id: 'claim-1',
      type: 'claim',
      statement: 'Primjer tvrdnje',
      kind: 'empirical',
      documentNodeIds: ['p-1'],
      status: 'draft',
      persistence: 'local-project',
      createdAt: '2026-08-09T18:00:00.000Z',
      updatedAt: '2026-08-09T18:00:00.000Z',
    };
    const evidence: EvidenceEdge = {
      id: 'edge-1',
      type: 'evidence',
      claimId: claim.id,
      target: { type: 'source', id: 'source-1' },
      relation: 'supports',
      persistence: 'local-project',
    };
    expect(evidence.claimId).toBe('claim-1');
    expect(evidence.id).toBe('edge-1');
  });
});
