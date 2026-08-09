export type AcademicIRValidationSeverity = 'error' | 'warning';

export type AcademicIRValidationCode =
  | 'IR_JSON_INVALID'
  | 'IR_SCHEMA_VERSION_UNSUPPORTED'
  | 'IR_PROJECT_ID_REQUIRED'
  | 'IR_GENERATED_AT_INVALID'
  | 'IR_ENTITY_ID_REQUIRED'
  | 'IR_DUPLICATE_ID'
  | 'IR_DOCUMENT_ROOT_MISSING'
  | 'IR_DOCUMENT_PARENT_MISSING'
  | 'IR_DOCUMENT_CHILD_MISSING'
  | 'IR_DOCUMENT_CYCLE'
  | 'IR_RESEARCH_ENDPOINT_MISSING'
  | 'IR_EVIDENCE_CLAIM_MISSING'
  | 'IR_EVIDENCE_TARGET_MISSING'
  | 'IR_ANALYSIS_DATASET_MISSING'
  | 'IR_DOCUMENT_LINK_MISSING'
  | 'IR_SNAPSHOT_PROJECT_MISMATCH'
  | 'IR_SUBMISSION_MUTABLE';

export interface AcademicIRValidationFinding {
  code: AcademicIRValidationCode;
  severity: AcademicIRValidationSeverity;
  path: string;
  message: string;
}

export interface AcademicIRValidationResult {
  valid: boolean;
  findings: AcademicIRValidationFinding[];
}

export function validationError(
  code: AcademicIRValidationCode,
  path: string,
  message: string,
): AcademicIRValidationFinding {
  return { code, severity: 'error', path, message };
}
