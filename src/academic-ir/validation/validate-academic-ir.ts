import type { AcademicIR } from '../schema/root';
import type { AcademicIRValidationResult } from './types';
import { validateAcademicIRSchema } from './schema-validation';
import { validateAcademicIRGraph } from './graph-validation';

export function validateAcademicIR(ir: AcademicIR): AcademicIRValidationResult {
  const findings = [
    ...validateAcademicIRSchema(ir),
    ...validateAcademicIRGraph(ir),
  ];

  return {
    valid: !findings.some((finding) => finding.severity === 'error'),
    findings,
  };
}
