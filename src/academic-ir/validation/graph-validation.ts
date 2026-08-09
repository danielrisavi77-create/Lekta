import type { AcademicIR } from '../schema/root';
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

export function validateAcademicIRGraph(ir: AcademicIR): AcademicIRValidationFinding[] {
  return [
    ...validateGlobalIds(ir),
    ...validateDocumentGraph(ir),
  ];
}
