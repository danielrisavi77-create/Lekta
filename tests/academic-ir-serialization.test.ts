import { describe, expect, it } from 'vitest';
import {
  canonicalizeAcademicIR,
  createAcademicIR,
  deserializeAcademicIR,
  digestAcademicIR,
  serializeAcademicIR,
} from '../src/academic-ir';

describe('Academic IR serialization', () => {
  it('round-trips canonical semantics and stable IDs', () => {
    const ir = createAcademicIR({
      projectId: 'project-1', generatedAt: '2026-08-09T18:00:00.000Z', documentRootId: 'root-1',
    });
    ir.document.nodes.push({ id: 'p-1', type: 'paragraph', parentId: 'root-1', persistence: 'local-project' });
    ir.document.nodes[0].childIds = ['p-1'];

    const serialized = serializeAcademicIR(ir);
    const result = deserializeAcademicIR(serialized);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(serializeAcademicIR(result.value)).toBe(serialized);
      expect(result.value.document.nodes.some((node) => node.id === 'p-1')).toBe(true);
    }
  });

  it('produces equal digests for different registry insertion order', async () => {
    const a = createAcademicIR({ projectId: 'project-1', generatedAt: '2026-08-09T18:00:00.000Z', documentRootId: 'root-1' });
    const b = createAcademicIR({ projectId: 'project-1', generatedAt: '2026-08-09T18:00:00.000Z', documentRootId: 'root-1' });
    const p1 = { id: 'p-1', type: 'paragraph' as const, parentId: 'root-1', persistence: 'local-project' as const };
    const p2 = { id: 'p-2', type: 'paragraph' as const, parentId: 'root-1', persistence: 'local-project' as const };
    a.document.nodes.push(p1, p2);
    b.document.nodes.push(p2, p1);
    a.document.nodes[0].childIds = ['p-1', 'p-2'];
    b.document.nodes[0].childIds = ['p-1', 'p-2'];
    expect(await digestAcademicIR(a)).toBe(await digestAcademicIR(b));
  });

  it('preserves semantic document child order', () => {
    const ir = createAcademicIR({ projectId: 'project-1', documentRootId: 'root-1' });
    ir.document.nodes[0].childIds = ['p-2', 'p-1'];
    const canonical = canonicalizeAcademicIR(ir);
    expect(canonical.document.nodes.find((node) => node.id === 'root-1')?.childIds).toEqual(['p-2', 'p-1']);
  });

  it('returns a structured invalid-json result', () => {
    const result = deserializeAcademicIR('{broken');
    expect(result).toEqual({
      ok: false,
      reason: 'invalid-json',
      findings: [{
        code: 'IR_JSON_INVALID', severity: 'error', path: '$', message: 'Academic IR JSON is invalid.',
      }],
    });
  });

  it('returns invalid-ir instead of throwing for incomplete valid JSON', () => {
    const result = deserializeAcademicIR('{}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid-ir');
  });
});
