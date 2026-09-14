import type { EntityBase } from './common';

export type AcademicDocumentNodeType =
  | 'document'
  | 'title-page'
  | 'section'
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'list-item'
  | 'figure'
  | 'table'
  | 'caption'
  | 'footnote'
  | 'citation'
  | 'bibliography'
  | 'bibliography-entry'
  | 'unknown';

export interface DocumentSourceAnchor {
  documentFingerprint: string;
  paragraphIndex?: number;
  elementId?: string;
  footnoteId?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface AcademicDocumentNode extends EntityBase {
  type: AcademicDocumentNodeType;
  parentId?: string;
  childIds?: string[];
  source?: DocumentSourceAnchor;
  contentFingerprint?: string;
  attributes?: Record<string, unknown>;
}

export interface DocumentGraph {
  rootId: string;
  nodes: AcademicDocumentNode[];
  documentFingerprint?: string;
}
