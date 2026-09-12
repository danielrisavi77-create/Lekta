import { describe, expect, it } from 'vitest';
import {
  fingerprintDocumentText,
  reconcileDocumentNodes,
  type ClaimNode,
  type DocumentGraph,
} from '../src/academic-ir';

const ids = (...values: string[]) => {
  let i = 0;
  return () => values[i++] ?? `generated-${i}`;
};

describe('Academic IR document reconciliation', () => {
  it('preserves a durable paragraph ID after unrelated insertion above it', async () => {
    const fp = await fingerprintDocumentText('Rezultati pokazuju rast povjerenja.');
    const previous: DocumentGraph = {
      rootId: 'root-1', documentFingerprint: 'doc-v1',
      nodes: [
        { id: 'root-1', type: 'document', childIds: ['p-stable'], persistence: 'local-project' },
        {
          id: 'p-stable', type: 'paragraph', parentId: 'root-1',
          source: { documentFingerprint: 'doc-v1', paragraphIndex: 47 },
          contentFingerprint: fp, persistence: 'local-project',
        },
      ],
    };
    const result = await reconcileDocumentNodes(previous, [
      { type: 'paragraph', paragraphIndex: 47, text: 'Novi prvi odlomak.' },
      { type: 'paragraph', paragraphIndex: 48, text: 'Novi drugi odlomak.' },
      { type: 'paragraph', paragraphIndex: 49, text: 'Rezultati pokazuju rast povjerenja.' },
    ], { documentFingerprint: 'doc-v2', idFactory: ids('new-1', 'new-2') });

    expect(result.graph.nodes.find((node) => node.id === 'p-stable')?.source?.paragraphIndex).toBe(49);
    expect(result.records).toContainEqual({
      previousNodeId: 'p-stable', nextNodeId: 'p-stable', status: 'exact', paragraphIndex: 49,
    });

    const claim: ClaimNode = {
      id: 'claim-1', type: 'claim', statement: 'Tvrdnja', kind: 'empirical',
      documentNodeIds: ['p-stable'], status: 'supported', persistence: 'local-project',
      createdAt: '2026-08-09T18:00:00.000Z', updatedAt: '2026-08-09T18:00:00.000Z',
    };
    expect(claim.documentNodeIds).toEqual(['p-stable']);
    expect(result.graph.nodes.some((node) => node.id === 'p-stable')).toBe(true);
  });

  it('does not reuse old identity when duplicate candidates are ambiguous', async () => {
    const fp = await fingerprintDocumentText('Isti tekst.');
    const previous: DocumentGraph = {
      rootId: 'root-1',
      nodes: [
        { id: 'root-1', type: 'document', childIds: ['old-1'], persistence: 'local-project' },
        { id: 'old-1', type: 'paragraph', parentId: 'root-1', contentFingerprint: fp, persistence: 'local-project' },
      ],
    };
    const result = await reconcileDocumentNodes(previous, [
      { type: 'paragraph', paragraphIndex: 10, text: 'Isti tekst.' },
      { type: 'paragraph', paragraphIndex: 11, text: 'Isti tekst.' },
    ], { documentFingerprint: 'doc-v2', idFactory: ids('new-a', 'new-b') });

    expect(result.records.some((r) => r.previousNodeId === 'old-1' && r.status === 'ambiguous')).toBe(true);
    expect(result.graph.nodes.some((node) => node.id === 'old-1')).toBe(false);
  });

  it('does not choose arbitrarily when duplicate previous nodes collapse to one candidate', async () => {
    const fp = await fingerprintDocumentText('Isti tekst.');
    const previous: DocumentGraph = {
      rootId: 'root-1',
      nodes: [
        { id: 'root-1', type: 'document', childIds: ['old-1', 'old-2'], persistence: 'local-project' },
        { id: 'old-1', type: 'paragraph', parentId: 'root-1', contentFingerprint: fp, persistence: 'local-project' },
        { id: 'old-2', type: 'paragraph', parentId: 'root-1', contentFingerprint: fp, persistence: 'local-project' },
      ],
    };
    const result = await reconcileDocumentNodes(previous, [
      { type: 'paragraph', paragraphIndex: 10, text: 'Isti tekst.' },
    ], { documentFingerprint: 'doc-v2', idFactory: ids('new-only') });

    expect(result.graph.nodes.some((node) => node.id === 'old-1' || node.id === 'old-2')).toBe(false);
    expect(result.records.filter((record) => record.status === 'ambiguous')).toHaveLength(2);
  });

  it('treats case changes as real edits rather than exact matches', async () => {
    expect(await fingerprintDocumentText('Naslov')).not.toBe(await fingerprintDocumentText('NASLOV'));
  });
});
