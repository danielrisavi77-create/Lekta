export const REPAIR_SOURCE_DIR: 'src/repair';
export const REPAIR_SOURCE_HASH_VERSION: number;

export interface RepairSourceHashResult {
  version: number;
  hash: string | null;
  files: string[];
}

export function isRepairProductionSource(relPath: string): boolean;
export function repairSourceHashFromFiles(
  files: Array<{ path: string; content: string }>,
  include?: (relPath: string) => boolean,
): RepairSourceHashResult;
export function repairSourceHash(root?: string): RepairSourceHashResult & { hash: string };
export function repairSourceHashAtCommit(commit: string, root?: string): RepairSourceHashResult & { hash: string };
export function repairSourceFreshness(
  recorded: string | null | undefined,
  current: string | null | undefined,
): { status: 'fresh' | 'stale' | 'missing'; reason: string };
export function hashRepairSourceTree(sourceRoot: string): string;
