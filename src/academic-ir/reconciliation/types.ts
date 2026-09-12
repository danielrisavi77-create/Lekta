import type { DocumentGraph } from '../schema/document';

export interface DocumentProjectionCandidate {
  type: 'heading' | 'paragraph';
  paragraphIndex: number;
  text: string;
  headingLevel?: number;
  elementId?: string;
}

export type ReconciliationStatus = 'exact' | 'high-confidence' | 'ambiguous' | 'new' | 'removed';

export interface ReconciliationRecord {
  previousNodeId?: string;
  nextNodeId?: string;
  status: ReconciliationStatus;
  paragraphIndex?: number;
}

export interface ReconciliationResult {
  graph: DocumentGraph;
  records: ReconciliationRecord[];
  removedNodeIds: string[];
}

export interface ReconciliationOptions {
  documentFingerprint: string;
  idFactory?: () => string;
}
