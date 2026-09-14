export interface SnapshotRef {
  id: string;
  projectId: string;
  kind: 'working' | 'mentor-review' | 'preflight' | 'submission' | 'correction';
  academicIrDigest: string;
  documentFingerprint?: string;
  rulesetId?: string;
  lektaAnalysisId?: string;
  createdAt: string;
  immutable: boolean;
}
