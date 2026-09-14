import type { AcademicIRSchemaVersion } from './version';
import type { DocumentGraph } from './document';
import type { ResearchGraph } from './research';
import type { ProcessGraph } from './process';
import type { ProvenanceGraph } from './provenance';
import type { SnapshotRef } from './snapshot';

export interface AcademicIR {
  schemaVersion: AcademicIRSchemaVersion;
  projectId: string;
  generatedAt: string;
  document: DocumentGraph;
  research: ResearchGraph;
  process: ProcessGraph;
  provenance: ProvenanceGraph;
  snapshots: SnapshotRef[];
}
