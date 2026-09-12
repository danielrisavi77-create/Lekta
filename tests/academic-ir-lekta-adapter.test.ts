import { describe, expect, it } from 'vitest';
import { projectLektaDocument } from '../src/academic-ir';

const ids = (...values: string[]) => {
  let i = 0;
  return () => values[i++] ?? `id-${i}`;
};

describe('Lekta Academic IR document adapter', () => {
  it('projects headings/paragraphs without persisting raw body text', async () => {
    const result = await projectLektaDocument({
      projectId: 'project-1', documentFingerprint: 'doc-v1',
      paragraphs: [
        { paragraphIndex: 1, text: 'UVOD', headingLevel: 1 },
        { paragraphIndex: 2, text: 'Ovo je sadržaj odlomka.' },
      ],
    }, undefined, { idFactory: ids('root-1', 'heading-1', 'p-1') });

    expect(result.graph.nodes.find((node) => node.id === 'heading-1')?.type).toBe('heading');
    expect(result.graph.nodes.find((node) => node.id === 'heading-1')?.attributes).toEqual({ headingLevel: 1 });
    expect(result.graph.nodes.find((node) => node.id === 'p-1')?.type).toBe('paragraph');
    expect(JSON.stringify(result.graph)).not.toContain('Ovo je sadržaj odlomka.');
  });

  it('reuses the durable ID after paragraph-index shift', async () => {
    const first = await projectLektaDocument({
      projectId: 'project-1', documentFingerprint: 'doc-v1',
      paragraphs: [{ paragraphIndex: 47, text: 'Rezultati pokazuju rast povjerenja.' }],
    }, undefined, { idFactory: ids('root-1', 'stable-1') });

    const second = await projectLektaDocument({
      projectId: 'project-1', documentFingerprint: 'doc-v2',
      paragraphs: [
        { paragraphIndex: 47, text: 'Novi odlomak.' },
        { paragraphIndex: 48, text: 'Drugi novi odlomak.' },
        { paragraphIndex: 49, text: 'Rezultati pokazuju rast povjerenja.' },
      ],
    }, first.graph, { idFactory: ids('new-1', 'new-2') });

    expect(second.graph.rootId).toBe('root-1');
    expect(second.graph.nodes.find((node) => node.id === 'stable-1')?.source?.paragraphIndex).toBe(49);
  });

  it('creates a valid empty root for zero paragraphs', async () => {
    const result = await projectLektaDocument(
      { projectId: 'project-1', documentFingerprint: 'empty-doc', paragraphs: [] },
      undefined,
      { idFactory: ids('root-empty') },
    );
    expect(result.graph).toEqual({
      rootId: 'root-empty',
      documentFingerprint: 'empty-doc',
      nodes: [{ id: 'root-empty', type: 'document', childIds: [], persistence: 'local-project' }],
    });
  });

  it('keeps optional OOXML element identity only as a version-specific anchor', async () => {
    const result = await projectLektaDocument({
      projectId: 'project-1', documentFingerprint: 'doc-v1',
      paragraphs: [{ paragraphIndex: 3, text: 'Tekst', elementId: 'w14-para-id-1' }],
    }, undefined, { idFactory: ids('root-1', 'p-1') });
    const node = result.graph.nodes.find((item) => item.id === 'p-1');
    expect(node?.id).toBe('p-1');
    expect(node?.source?.elementId).toBe('w14-para-id-1');
  });
});
