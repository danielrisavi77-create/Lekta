import type { AcademicIR } from '../schema/root';
import type { ResearchNode } from '../schema/research';
import type { AcademicIRValidationFinding } from './types';
import { validationError } from './types';

interface EntityRegistration {
  id: string;
  path: string;
}

function entityRegistrations(ir: AcademicIR): EntityRegistration[] {
  return [
    ...ir.document.nodes.map((entity, index) => ({ id: entity.id, path: `document.nodes[${index}].id` })),
    ...ir.research.nodes.map((entity, index) => ({ id: entity.id, path: `research.nodes[${index}].id` })),
    ...ir.research.edges.map((entity, index) => ({ id: entity.id, path: `research.edges[${index}].id` })),
    ...ir.process.events.map((entity, index) => ({ id: entity.id, path: `process.events[${index}].id` })),
    ...ir.provenance.events.map((entity, index) => ({ id: entity.id, path: `provenance.events[${index}].id` })),
    ...ir.snapshots.map((entity, index) => ({ id: entity.id, path: `snapshots[${index}].id` })),
  ];
}

function validateGlobalIds(ir: AcademicIR): AcademicIRValidationFinding[] {
  const findings: AcademicIRValidationFinding[] = [];
  const seen = new Map<string, string>();

  for (const registration of entityRegistrations(ir)) {
    if (typeof registration.id !== 'string' || !registration.id.trim()) {
      findings.push(validationError(
        'IR_ENTITY_ID_REQUIRED',
        registration.path,
        'Academic IR entity IDs must be non-empty opaque strings.',
      ));
      continue;
    }

    const firstPath = seen.get(registration.id);
    if (firstPath) {
      findings.push(validationError(
        'IR_DUPLICATE_ID',
        registration.path,
        `Entity ID "${registration.id}" is already used at ${firstPath}.`,
      ));
    } else {
      seen.set(registration.id, registration.path);
    }
  }

  return findings;
}

function validateDocumentGraph(ir: AcademicIR): AcademicIRValidationFinding[] {
  const findings: AcademicIRValidationFinding[] = [];
  const nodes = ir.document.nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));

  if (!byId.has(ir.document.rootId)) {
    findings.push(validationError(
      'IR_DOCUMENT_ROOT_MISSING',
      'document.rootId',
      `Document root "${ir.document.rootId}" does not resolve to a document node.`,
    ));
  }

  for (const node of nodes) {
    if (node.parentId && !byId.has(node.parentId)) {
      findings.push(validationError(
        'IR_DOCUMENT_PARENT_MISSING',
        `document.nodes[${node.id}].parentId`,
        `Document parent "${node.parentId}" does not resolve to a document node.`,
      ));
    }

    for (const [index, childId] of (node.childIds ?? []).entries()) {
      if (!byId.has(childId)) {
        findings.push(validationError(
          'IR_DOCUMENT_CHILD_MISSING',
          `document.nodes[${node.id}].childIds[${index}]`,
          `Document child "${childId}" does not resolve to a document node.`,
        ));
      }
    }
  }

  const state = new Map<string, 'visiting' | 'done'>();
  const cycleNodes = new Set<string>();

  const visit = (nodeId: string): void => {
    const current = state.get(nodeId);
    if (current === 'visiting') {
      cycleNodes.add(nodeId);
      return;
    }
    if (current === 'done') return;

    const node = byId.get(nodeId);
    if (!node) return;
    state.set(nodeId, 'visiting');
    for (const childId of node.childIds ?? []) {
      if (state.get(childId) === 'visiting') {
        cycleNodes.add(nodeId);
        cycleNodes.add(childId);
        continue;
      }
      visit(childId);
    }
    state.set(nodeId, 'done');
  };

  for (const node of nodes) visit(node.id);

  if (cycleNodes.size > 0) {
    findings.push(validationError(
      'IR_DOCUMENT_CYCLE',
      'document.nodes',
      `Document graph contains a cycle involving: ${[...cycleNodes].sort().join(', ')}.`,
    ));
  }

  return findings;
}

function nodeDocumentIds(node: ResearchNode): string[] | undefined {
  return 'documentNodeIds' in node ? node.documentNodeIds : undefined;
}

function validateResearchGraph(ir: AcademicIR): AcademicIRValidationFinding[] {
  const findings: AcademicIRValidationFinding[] = [];
  const researchById = new Map(ir.research.nodes.map((node) => [node.id, node]));
  const documentIds = new Set(ir.document.nodes.map((node) => node.id));

  for (const node of ir.research.nodes) {
    const documentNodeIds = nodeDocumentIds(node);
    if (documentNodeIds) {
      for (const [index, documentNodeId] of documentNodeIds.entries()) {
        if (!documentIds.has(documentNodeId)) {
          findings.push(validationError(
            'IR_DOCUMENT_LINK_MISSING',
            `research.nodes[${node.id}].documentNodeIds[${index}]`,
            `Document link "${documentNodeId}" does not resolve to a document node.`,
          ));
        }
      }
    }

    if (node.type === 'analysis') {
      for (const [index, datasetId] of node.datasetIds.entries()) {
        const dataset = researchById.get(datasetId);
        if (!dataset || dataset.type !== 'dataset') {
          findings.push(validationError(
            'IR_ANALYSIS_DATASET_MISSING',
            `research.nodes[${node.id}].datasetIds[${index}]`,
            `Analysis dataset "${datasetId}" does not resolve to a DatasetNode.`,
          ));
        }
      }
    }
  }

  for (const edge of ir.research.edges) {
    if (edge.type === 'evidence') {
      const claim = researchById.get(edge.claimId);
      if (!claim || claim.type !== 'claim') {
        findings.push(validationError(
          'IR_EVIDENCE_CLAIM_MISSING',
          `research.edges[${edge.id}].claimId`,
          `Evidence claim "${edge.claimId}" does not resolve to a ClaimNode.`,
        ));
      }

      const target = edge.target;
      const targetValid = target.type === 'document-node'
        ? documentIds.has(target.id)
        : researchById.get(target.id)?.type === target.type;
      if (!targetValid) {
        findings.push(validationError(
          'IR_EVIDENCE_TARGET_MISSING',
          `research.edges[${edge.id}].target`,
          `Evidence target "${target.id}" does not resolve to the declared ${target.type} type.`,
        ));
      }
      continue;
    }

    for (const [label, endpoint] of [['from', edge.from], ['to', edge.to]] as const) {
      const resolves = endpoint.scope === 'document-node'
        ? documentIds.has(endpoint.id)
        : researchById.has(endpoint.id);
      if (!resolves) {
        findings.push(validationError(
          'IR_RESEARCH_ENDPOINT_MISSING',
          `research.edges[${edge.id}].${label}`,
          `Research ${label} endpoint "${endpoint.id}" does not resolve in scope ${endpoint.scope}.`,
        ));
      }
    }
  }

  return findings;
}

function validateSnapshots(ir: AcademicIR): AcademicIRValidationFinding[] {
  const findings: AcademicIRValidationFinding[] = [];

  for (const [index, snapshot] of ir.snapshots.entries()) {
    if (snapshot.projectId !== ir.projectId) {
      findings.push(validationError(
        'IR_SNAPSHOT_PROJECT_MISMATCH',
        `snapshots[${index}].projectId`,
        `Snapshot projectId "${snapshot.projectId}" must match Academic IR projectId "${ir.projectId}".`,
      ));
    }
    if (typeof snapshot.createdAt !== 'string' || Number.isNaN(Date.parse(snapshot.createdAt))) {
      findings.push(validationError(
        'IR_SNAPSHOT_CREATED_AT_INVALID',
        `snapshots[${index}].createdAt`,
        'Snapshot createdAt must be a valid ISO-compatible timestamp.',
      ));
    }
    if (snapshot.kind === 'submission' && snapshot.immutable !== true) {
      findings.push(validationError(
        'IR_SUBMISSION_MUTABLE',
        `snapshots[${index}].immutable`,
        'Submission snapshots must be immutable.',
      ));
    }
  }

  return findings;
}

export function validateAcademicIRGraph(ir: AcademicIR): AcademicIRValidationFinding[] {
  return [
    ...validateGlobalIds(ir),
    ...validateDocumentGraph(ir),
    ...validateResearchGraph(ir),
    ...validateSnapshots(ir),
  ];
}
