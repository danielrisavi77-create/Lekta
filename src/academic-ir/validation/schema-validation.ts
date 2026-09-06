import { ACADEMIC_IR_SCHEMA_VERSION } from '../schema/version';
import type { AcademicIR } from '../schema/root';
import type { AcademicIRValidationFinding } from './types';
import { validationError } from './types';

export function validateAcademicIRSchema(ir: AcademicIR): AcademicIRValidationFinding[] {
  const findings: AcademicIRValidationFinding[] = [];

  if (ir.schemaVersion !== ACADEMIC_IR_SCHEMA_VERSION) {
    findings.push(validationError(
      'IR_SCHEMA_VERSION_UNSUPPORTED',
      'schemaVersion',
      `Academic IR schema version "${String(ir.schemaVersion)}" is not supported.`,
    ));
  }

  if (typeof ir.projectId !== 'string' || !ir.projectId.trim()) {
    findings.push(validationError(
      'IR_PROJECT_ID_REQUIRED',
      'projectId',
      'Academic IR projectId must be a non-empty string.',
    ));
  }

  if (typeof ir.generatedAt !== 'string' || Number.isNaN(Date.parse(ir.generatedAt))) {
    findings.push(validationError(
      'IR_GENERATED_AT_INVALID',
      'generatedAt',
      'Academic IR generatedAt must be a valid ISO-compatible timestamp.',
    ));
  }

  return findings;
}
