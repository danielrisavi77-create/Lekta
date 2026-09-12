import type { AcademicDocumentNode, DocumentGraph } from '../schema/document';
import { fingerprintDocumentText } from '../reconciliation/fingerprint';
import { reconcileDocumentNodes } from '../reconciliation/reconcile-document-nodes';
import type { DocumentProjectionCandidate, ReconciliationRecord } from '../reconciliation/types';

export interface LektaParagraphProjection {
  paragraphIndex: number;
  text: string;
  headingLevel?: number | null;
  elementId?: string;
}

export interface LektaDocumentProjectionInput {
  projectId: string;
  documentFingerprint: string;
  paragraphs: LektaParagraphProjection[];
}

export interface LektaDocumentAdapterOptions {
  idFactory?: () => string;
}

export interface LektaDocumentProjectionResult {
  graph: DocumentGraph;
  reconciliation: ReconciliationRecord[];
}

function asCandidate(paragraph: LektaParagraphProjection): DocumentProjectionCandidate {
  const heading = paragraph.headingLevel != null && paragraph.headingLevel > 0;
  return {
    type: heading ? 'heading' : 'paragraph',
    paragraphIndex: paragraph.paragraphIndex,
    text: paragraph.text,
    headingLevel: heading ? paragraph.headingLevel ?? undefined : undefined,
    elementId: paragraph.elementId,
  };
}

export async function projectLektaDocument(
  input: LektaDocumentProjectionInput,
  previousGraph?: DocumentGraph,
  options: LektaDocumentAdapterOptions = {},
): Promise<LektaDocumentProjectionResult> {
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const candidates = input.paragraphs.map(asCandidate);

  if (previousGraph) {
    const result = await reconcileDocumentNodes(previousGraph, candidates, {
      documentFingerprint: input.documentFingerprint,
      idFactory,
    });
    return { graph: result.graph, reconciliation: result.records };
  }

  const rootId = idFactory();
  const childNodes: AcademicDocumentNode[] = await Promise.all(
    candidates.map(async (candidate) => ({
      id: idFactory(),
      type: candidate.type,
      parentId: rootId,
      source: {
        documentFingerprint: input.documentFingerprint,
        paragraphIndex: candidate.paragraphIndex,
        elementId: candidate.elementId,
      },
      contentFingerprint: await fingerprintDocumentText(candidate.text),
      persistence: 'local-project' as const,
      ...(candidate.type === 'heading' && candidate.headingLevel != null
        ? { attributes: { headingLevel: candidate.headingLevel } }
        : {}),
    })),
  );

  const root: AcademicDocumentNode = {
    id: rootId,
    type: 'document',
    childIds: childNodes.map((node) => node.id),
    persistence: 'local-project',
  };

  return {
    graph: {
      rootId,
      documentFingerprint: input.documentFingerprint,
      nodes: [root, ...childNodes],
    },
    reconciliation: childNodes.map((node) => ({
      nextNodeId: node.id,
      status: 'new',
      paragraphIndex: node.source?.paragraphIndex,
    })),
  };
}
