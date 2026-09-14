import type { AcademicIR } from './schema/root';
import type { SnapshotRef } from './schema/snapshot';
import { digestAcademicIR } from './serialization/digest';

export interface CreateAcademicIRSnapshotInput {
  id: string;
  kind: SnapshotRef['kind'];
  createdAt?: string;
  documentFingerprint?: string;
  rulesetId?: string;
  lektaAnalysisId?: string;
  immutable?: boolean;
}

export async function createAcademicIRSnapshot(
  ir: AcademicIR,
  input: CreateAcademicIRSnapshotInput,
): Promise<SnapshotRef> {
  return {
    id: input.id,
    projectId: ir.projectId,
    kind: input.kind,
    academicIrDigest: await digestAcademicIR(ir),
    documentFingerprint: input.documentFingerprint,
    rulesetId: input.rulesetId,
    lektaAnalysisId: input.lektaAnalysisId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    immutable: input.kind === 'submission' ? true : (input.immutable ?? false),
  };
}
