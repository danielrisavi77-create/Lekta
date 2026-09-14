import { ACADEMIC_IR_SCHEMA_VERSION } from '../schema/version';

export function readAcademicIRVersion(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === 'string' ? version : undefined;
}

export function isCurrentAcademicIRVersion(value: unknown): boolean {
  return readAcademicIRVersion(value) === ACADEMIC_IR_SCHEMA_VERSION;
}
