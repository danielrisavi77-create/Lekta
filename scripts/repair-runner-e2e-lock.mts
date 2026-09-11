import {
  closeSync,
  fstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

export const E2E_SINGLE_RUN_LOCK_FILE = '.lekta-repair-runner-e2e.lock';
const E2E_LOCK_STALE_AFTER_MS = 30_000;
const E2E_RECLAIM_QUARANTINE_SUFFIX = '.stale-reclaim';

interface LockOwner {
  pid: number;
  nonce: string;
}

export interface E2ESingleRunLock {
  release: () => void;
}

interface LockSnapshot {
  owner: LockOwner | null;
  modifiedAtMs: number;
}

interface LockDependencies {
  linkSync: typeof linkSync;
}

const DEFAULT_LOCK_DEPENDENCIES: LockDependencies = {
  linkSync,
};

function readLockSnapshot(path: string): LockSnapshot | null {
  let descriptor: number;
  try {
    descriptor = openSync(path, 'r');
  } catch (error) {
    if (isAbsent(error)) return null;
    throw error;
  }

  try {
    const modifiedAtMs = fstatSync(descriptor).mtimeMs;
    const contents = readFileSync(descriptor, 'utf8');
    let value: Partial<LockOwner>;
    try {
      value = JSON.parse(contents) as Partial<LockOwner>;
    } catch {
      return { owner: null, modifiedAtMs };
    }
    const owner =
      Number.isInteger(value.pid) &&
      value.pid > 0 &&
      typeof value.nonce === 'string' &&
      value.nonce.length > 0
        ? { pid: value.pid, nonce: value.nonce }
        : null;
    return { owner, modifiedAtMs };
  } finally {
    closeSync(descriptor);
  }
}

function isStaleLock(snapshot: LockSnapshot): boolean {
  return Date.now() - snapshot.modifiedAtMs >= E2E_LOCK_STALE_AFTER_MS;
}

function isLiveProcess(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'EEXIST';
}

function isAbsent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function snapshotBelongsTo(snapshot: LockSnapshot | null, owner: LockOwner): boolean {
  return (
    snapshot?.owner?.pid === owner.pid &&
    snapshot.owner.nonce === owner.nonce
  );
}

function reclaimStaleLock(
  lockPath: string,
  expected: LockSnapshot,
  linkLock: typeof linkSync,
): boolean {
  if (!expected.owner) return false;
  const quarantinePath = `${lockPath}${E2E_RECLAIM_QUARANTINE_SUFFIX}`;

  try {
    linkLock(lockPath, quarantinePath);
  } catch (error) {
    if (isAbsent(error)) return true;
    if (isAlreadyExists(error)) return false;
    throw error;
  }

  let reclaimed = false;
  try {
    const quarantined = readLockSnapshot(quarantinePath);
    const current = readLockSnapshot(lockPath);
    if (
      snapshotBelongsTo(quarantined, expected.owner) &&
      snapshotBelongsTo(current, expected.owner) &&
      quarantined &&
      current &&
      isStaleLock(quarantined) &&
      isStaleLock(current) &&
      !isLiveProcess(expected.owner.pid)
    ) {
      try {
        unlinkSync(lockPath);
        reclaimed = true;
      } catch (error) {
        if (isAbsent(error)) {
          reclaimed = true;
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    removeTemporaryLock(quarantinePath);
    throw error;
  }

  removeTemporaryLock(quarantinePath);
  return reclaimed;
}

function releaseOwnedLock(lockPath: string, owner: LockOwner): void {
  const current = readLockSnapshot(lockPath);
  if (
    !current?.owner ||
    current.owner.pid !== owner.pid ||
    current.owner.nonce !== owner.nonce
  ) {
    return;
  }
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if (!isAbsent(error)) throw error;
  }
}

function removeTemporaryLock(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if (!isAbsent(error)) throw error;
  }
}

function publishLock(
  lockPath: string,
  owner: LockOwner,
  linkLock: typeof linkSync,
): boolean {
  const temporaryPath = `${lockPath}.${owner.nonce}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(owner)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    removeTemporaryLock(temporaryPath);
    throw error;
  }

  try {
    linkLock(temporaryPath, lockPath);
  } catch (error) {
    removeTemporaryLock(temporaryPath);
    if (isAlreadyExists(error)) return false;
    throw error;
  }

  removeTemporaryLock(temporaryPath);
  return true;
}

export function acquireE2ESingleRunLock(
  diagnosticsDirectory: string,
  dependencies: LockDependencies = DEFAULT_LOCK_DEPENDENCIES,
): E2ESingleRunLock {
  mkdirSync(diagnosticsDirectory, { recursive: true });
  const lockPath = join(diagnosticsDirectory, E2E_SINGLE_RUN_LOCK_FILE);
  const owner: LockOwner = {
    pid: process.pid,
    nonce: randomUUID(),
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!publishLock(lockPath, owner, dependencies.linkSync)) {
      const existing = readLockSnapshot(lockPath);
      if (!existing) continue;
      if (!existing.owner) {
        throw new Error('Lekta repair runner E2E lock exists with incomplete ownership metadata.');
      }
      if (isLiveProcess(existing.owner.pid)) {
        throw new Error(`Lekta repair runner E2E is already active (PID ${existing.owner.pid}).`);
      }
      if (!isStaleLock(existing)) {
        throw new Error(
          `Lekta repair runner E2E lock for PID ${existing.owner.pid} is too recent to reclaim.`,
        );
      }
      reclaimStaleLock(lockPath, existing, dependencies.linkSync);
      continue;
    }

    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        releaseOwnedLock(lockPath, owner);
      },
    };
  }

  throw new Error('Lekta repair runner E2E lock could not be acquired after stale-lock cleanup.');
}
