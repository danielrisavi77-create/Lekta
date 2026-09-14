import type { AcademicIR } from '../schema/root';

function sortObjectKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeysDeep);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortObjectKeysDeep(child)]),
  );
}

export function canonicalizeAcademicIR(ir: AcademicIR): AcademicIR {
  const clone = structuredClone(ir);
  clone.document.nodes.sort((a, b) => a.id.localeCompare(b.id));
  clone.research.nodes.sort((a, b) => a.id.localeCompare(b.id));
  clone.research.edges.sort((a, b) => a.id.localeCompare(b.id));
  clone.process.events.sort((a, b) => a.id.localeCompare(b.id));
  clone.provenance.events.sort((a, b) => a.id.localeCompare(b.id));
  clone.snapshots.sort((a, b) => a.id.localeCompare(b.id));
  return sortObjectKeysDeep(clone) as AcademicIR;
}
