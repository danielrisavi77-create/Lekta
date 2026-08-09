import { ACADEMIC_IR_SCHEMA_VERSION } from './schema/version';
import type { AcademicIR } from './schema/root';

export interface CreateAcademicIRInput {
  projectId: string;
  generatedAt?: string;
  documentRootId: string;
}

export function createAcademicIR(input: CreateAcademicIRInput): AcademicIR {
  return {
    schemaVersion: ACADEMIC_IR_SCHEMA_VERSION,
    projectId: input.projectId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    document: {
      rootId: input.documentRootId,
      nodes: [{ id: input.documentRootId, type: 'document', childIds: [], persistence: 'local-project' }],
    },
    research: { nodes: [], edges: [] },
    process: { events: [] },
    provenance: { events: [] },
    snapshots: [],
  };
}
