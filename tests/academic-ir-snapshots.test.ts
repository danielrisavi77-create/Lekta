import { describe, expect, it } from 'vitest';
import {
  ACADEMIC_IR_SCHEMA_VERSION,
  createAcademicIR,
  createAcademicIRSnapshot,
  digestAcademicIR,
  isCurrentAcademicIRVersion,
  readAcademicIRVersion,
} from '../src/academic-ir';

describe('Academic IR snapshots and version boundary', () => {
  it('forces submission snapshots immutable and binds the current IR digest', async () => {
    const ir = createAcademicIR({ projectId: 'project-1', generatedAt: '2026-08-09T18:00:00.000Z', documentRootId: 'root-1' });
    const expectedDigest = await digestAcademicIR(ir);
    const snapshot = await createAcademicIRSnapshot(ir, {
      id: 'snapshot-1', kind: 'submission', createdAt: '2026-08-09T18:05:00.000Z',
      documentFingerprint: 'doc-v1', rulesetId: 'rules-v1', lektaAnalysisId: 'analysis-1', immutable: false,
    });
    expect(snapshot.immutable).toBe(true);
    expect(snapshot.projectId).toBe('project-1');
    expect(snapshot.academicIrDigest).toBe(expectedDigest);
    expect(snapshot.academicIrDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(ir.snapshots).toEqual([]);
  });

  it('allows non-submission immutability to remain an explicit caller choice', async () => {
    const ir = createAcademicIR({ projectId: 'project-1', generatedAt: '2026-08-09T18:00:00.000Z', documentRootId: 'root-1' });
    const snapshot = await createAcademicIRSnapshot(ir, {
      id: 'snapshot-1', kind: 'preflight', createdAt: '2026-08-09T18:05:00.000Z', immutable: true,
    });
    expect(snapshot.immutable).toBe(true);
  });

  it('keeps version dispatch explicit', () => {
    expect(readAcademicIRVersion({ schemaVersion: '0.1' })).toBe('0.1');
    expect(readAcademicIRVersion(null)).toBeUndefined();
    expect(isCurrentAcademicIRVersion({ schemaVersion: ACADEMIC_IR_SCHEMA_VERSION })).toBe(true);
    expect(isCurrentAcademicIRVersion({ schemaVersion: '0.2' })).toBe(false);
  });
});
