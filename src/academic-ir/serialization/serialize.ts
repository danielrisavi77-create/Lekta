import type { AcademicIR } from '../schema/root';
import type { AcademicIRValidationFinding } from '../validation/types';
import { validateAcademicIR } from '../validation/validate-academic-ir';
import { canonicalizeAcademicIR } from './canonicalize';

export type AcademicIRDeserializeResult =
  | { ok: true; value: AcademicIR }
  | { ok: false; reason: 'invalid-json' | 'invalid-ir'; findings: AcademicIRValidationFinding[] };

export function serializeAcademicIR(ir: AcademicIR): string {
  return JSON.stringify(canonicalizeAcademicIR(ir));
}

function hasRequiredContainers(value: unknown): value is AcademicIR {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AcademicIR> & Record<string, unknown>;
  return !!candidate.document
    && typeof candidate.document === 'object'
    && Array.isArray((candidate.document as { nodes?: unknown }).nodes)
    && !!candidate.research
    && typeof candidate.research === 'object'
    && Array.isArray((candidate.research as { nodes?: unknown }).nodes)
    && Array.isArray((candidate.research as { edges?: unknown }).edges)
    && !!candidate.process
    && typeof candidate.process === 'object'
    && Array.isArray((candidate.process as { events?: unknown }).events)
    && !!candidate.provenance
    && typeof candidate.provenance === 'object'
    && Array.isArray((candidate.provenance as { events?: unknown }).events)
    && Array.isArray(candidate.snapshots);
}

export function deserializeAcademicIR(json: string): AcademicIRDeserializeResult {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return {
      ok: false,
      reason: 'invalid-json',
      findings: [{ code: 'IR_JSON_INVALID', severity: 'error', path: '$', message: 'Academic IR JSON is invalid.' }],
    };
  }

  if (!hasRequiredContainers(value)) {
    return {
      ok: false,
      reason: 'invalid-ir',
      findings: [{
        code: 'IR_DOCUMENT_ROOT_MISSING',
        severity: 'error',
        path: '$',
        message: 'Academic IR root structure is incomplete.',
      }],
    };
  }

  const validation = validateAcademicIR(value);
  return validation.valid
    ? { ok: true, value }
    : { ok: false, reason: 'invalid-ir', findings: validation.findings };
}
