import { describe, expect, it } from 'vitest';
import {
  ACADEMIC_SUITE_CONTRACT_VERSION,
  fromLegacyKatedraWorkType,
  isAcademicWorkType,
  normalizeLektaIssueSeverity,
  toKatedraDisplaySeverity,
  toLegacyKatedraWorkType,
} from '../src/integration/academic-suite-contracts';

describe('academic-suite shared contracts v0.1', () => {
  it('locks the initial contract version', () => {
    expect(ACADEMIC_SUITE_CONTRACT_VERSION).toBe('0.1');
  });

  it('maps legacy Katedra work-type codes to canonical semantics', () => {
    expect(fromLegacyKatedraWorkType('s')).toBe('seminar');
    expect(fromLegacyKatedraWorkType('z')).toBe('final');
    expect(fromLegacyKatedraWorkType('d')).toBe('graduate');
  });

  it('maps only Katedra-v1-supported canonical work types back to legacy codes', () => {
    expect(toLegacyKatedraWorkType('seminar')).toBe('s');
    expect(toLegacyKatedraWorkType('final')).toBe('z');
    expect(toLegacyKatedraWorkType('graduate')).toBe('d');
    expect(toLegacyKatedraWorkType('doctoral')).toBeNull();
  });

  it('validates canonical academic work types', () => {
    expect(isAcademicWorkType('graduate')).toBe(true);
    expect(isAcademicWorkType('specialist')).toBe(true);
    expect(isAcademicWorkType('d')).toBe(false);
    expect(isAcademicWorkType('unknown')).toBe(false);
  });

  it('keeps Lekta transport severity canonical while tolerating legacy aliases', () => {
    expect(normalizeLektaIssueSeverity('error')).toBe('error');
    expect(normalizeLektaIssueSeverity('critical')).toBe('error');
    expect(normalizeLektaIssueSeverity('major')).toBe('warning');
    expect(normalizeLektaIssueSeverity('info')).toBe('info');
  });

  it('maps Lekta error severity to Katedra presentation wording only at the UI boundary', () => {
    expect(toKatedraDisplaySeverity('error')).toBe('critical');
    expect(toKatedraDisplaySeverity('warning')).toBe('warning');
    expect(toKatedraDisplaySeverity('info')).toBe('info');
  });
});
