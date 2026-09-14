import type { AcademicDocumentNode, DocumentGraph } from '../schema/document';
import { fingerprintDocumentText } from './fingerprint';
import type {
  DocumentProjectionCandidate,
  ReconciliationOptions,
  ReconciliationRecord,
  ReconciliationResult,
} from './types';

interface FingerprintedCandidate extends DocumentProjectionCandidate {
  contentFingerprint: string;
  candidateIndex: number;
}

function candidateKey(type: 'heading' | 'paragraph', contentFingerprint: string): string {
  return `${type}:${contentFingerprint}`;
}

function nextNodeFromCandidate(
  id: string,
  candidate: FingerprintedCandidate,
  options: ReconciliationOptions,
  previous?: AcademicDocumentNode,
): AcademicDocumentNode {
  const headingAttributes = candidate.type === 'heading' && candidate.headingLevel != null
    ? { ...(previous?.attributes ?? {}), headingLevel: candidate.headingLevel }
    : previous?.attributes;

  return {
    id,
    type: candidate.type,
    parentId: previous?.parentId,
    source: {
      documentFingerprint: options.documentFingerprint,
      paragraphIndex: candidate.paragraphIndex,
      elementId: candidate.elementId,
    },
    contentFingerprint: candidate.contentFingerprint,
    persistence: previous?.persistence ?? 'local-project',
    ...(headingAttributes ? { attributes: headingAttributes } : {}),
  };
}

export async function reconcileDocumentNodes(
  previous: DocumentGraph,
  candidates: DocumentProjectionCandidate[],
  options: ReconciliationOptions,
): Promise<ReconciliationResult> {
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const fingerprinted: FingerprintedCandidate[] = await Promise.all(
    candidates.map(async (candidate, candidateIndex) => ({
      ...candidate,
      candidateIndex,
      contentFingerprint: await fingerprintDocumentText(candidate.text),
    })),
  );

  const candidatesByKey = new Map<string, FingerprintedCandidate[]>();
  for (const candidate of fingerprinted) {
    const key = candidateKey(candidate.type, candidate.contentFingerprint);
    const bucket = candidatesByKey.get(key) ?? [];
    bucket.push(candidate);
    candidatesByKey.set(key, bucket);
  }

  const previousById = new Map(previous.nodes.map((node) => [node.id, node]));
  const previousChildren = previous.nodes.filter((node) => node.id !== previous.rootId);
  const previousByKey = new Map<string, AcademicDocumentNode[]>();
  for (const node of previousChildren) {
    if ((node.type !== 'heading' && node.type !== 'paragraph') || !node.contentFingerprint) continue;
    const key = candidateKey(node.type, node.contentFingerprint);
    const bucket = previousByKey.get(key) ?? [];
    bucket.push(node);
    previousByKey.set(key, bucket);
  }

  const claimed = new Set<number>();
  const candidateIds = new Map<number, string>();
  const records: ReconciliationRecord[] = [];
  const removedNodeIds: string[] = [];

  for (const node of previousChildren) {
    if ((node.type !== 'heading' && node.type !== 'paragraph') || !node.contentFingerprint) {
      removedNodeIds.push(node.id);
      records.push({ previousNodeId: node.id, status: 'removed' });
      continue;
    }

    const key = candidateKey(node.type, node.contentFingerprint);
    const oldPeers = previousByKey.get(key) ?? [];
    const available = (candidatesByKey.get(key) ?? [])
      .filter((candidate) => !claimed.has(candidate.candidateIndex));

    if (oldPeers.length === 1 && available.length === 1) {
      const candidate = available[0];
      claimed.add(candidate.candidateIndex);
      candidateIds.set(candidate.candidateIndex, node.id);
      records.push({
        previousNodeId: node.id,
        nextNodeId: node.id,
        status: 'exact',
        paragraphIndex: candidate.paragraphIndex,
      });
    } else if (available.length > 0) {
      removedNodeIds.push(node.id);
      records.push({ previousNodeId: node.id, status: 'ambiguous' });
    } else {
      removedNodeIds.push(node.id);
      records.push({ previousNodeId: node.id, status: 'removed' });
    }
  }

  for (const candidate of fingerprinted) {
    if (candidateIds.has(candidate.candidateIndex)) continue;
    const nextId = idFactory();
    candidateIds.set(candidate.candidateIndex, nextId);
    records.push({ nextNodeId: nextId, status: 'new', paragraphIndex: candidate.paragraphIndex });
  }

  const rootPrevious = previousById.get(previous.rootId);
  const childNodes = fingerprinted.map((candidate) => {
    const id = candidateIds.get(candidate.candidateIndex)!;
    const old = previousById.get(id);
    const node = nextNodeFromCandidate(id, candidate, options, old);
    node.parentId = previous.rootId;
    return node;
  });

  const root: AcademicDocumentNode = {
    ...(rootPrevious ?? { id: previous.rootId, type: 'document' as const, persistence: 'local-project' as const }),
    id: previous.rootId,
    type: 'document',
    parentId: undefined,
    childIds: childNodes.map((node) => node.id),
    source: undefined,
    contentFingerprint: undefined,
  };

  return {
    graph: {
      rootId: previous.rootId,
      documentFingerprint: options.documentFingerprint,
      nodes: [root, ...childNodes],
    },
    records,
    removedNodeIds,
  };
}
