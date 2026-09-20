import {
  existsSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import {
  E2E_SINGLE_RUN_LOCK_FILE,
  acquireE2ESingleRunLock,
} from '../scripts/repair-runner-e2e-lock.mts';

const temporaryDirectories: string[] = [];

function createDiagnosticsDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'lekta-runner-e2e-lock-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('repair runner E2E single-run lock', () => {
  it('does not reclaim a newly published empty lock', () => {
    const diagnosticsDirectory = createDiagnosticsDirectory();
    const lockPath = join(diagnosticsDirectory, E2E_SINGLE_RUN_LOCK_FILE);
    writeFileSync(lockPath, '', 'utf8');

    expect(() => acquireE2ESingleRunLock(diagnosticsDirectory)).toThrow(/lock/i);
    expect(readFileSync(lockPath, 'utf8')).toBe('');
  });

  it('publishes initialized metadata with a distinct ownership nonce', () => {
    const diagnosticsDirectory = createDiagnosticsDirectory();
    const lockPath = join(diagnosticsDirectory, E2E_SINGLE_RUN_LOCK_FILE);

    const first = acquireE2ESingleRunLock(diagnosticsDirectory);
    const firstOwner = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      pid: number;
      nonce: string;
    };
    first.release();

    const second = acquireE2ESingleRunLock(diagnosticsDirectory);
    const secondOwner = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      pid: number;
      nonce: string;
    };

    expect(firstOwner.pid).toBe(process.pid);
    expect(firstOwner.nonce).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(secondOwner.pid).toBe(process.pid);
    expect(secondOwner.nonce).not.toBe(firstOwner.nonce);
    second.release();
  });

  it('rejects a live owner and permits a new owner after release', () => {
    const diagnosticsDirectory = createDiagnosticsDirectory();
    const first = acquireE2ESingleRunLock(diagnosticsDirectory);

    expect(() => acquireE2ESingleRunLock(diagnosticsDirectory)).toThrow(/already active/i);

    first.release();
    const second = acquireE2ESingleRunLock(diagnosticsDirectory);
    second.release();
    expect(existsSync(join(diagnosticsDirectory, E2E_SINGLE_RUN_LOCK_FILE))).toBe(false);
  });

  it('does not unlink a successor lock when an earlier owner releases', () => {
    const diagnosticsDirectory = createDiagnosticsDirectory();
    const lockPath = join(diagnosticsDirectory, E2E_SINGLE_RUN_LOCK_FILE);
    const first = acquireE2ESingleRunLock(diagnosticsDirectory);
    const firstOwner = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      pid: number;
      nonce: string;
    };

    unlinkSync(lockPath);
    const second = acquireE2ESingleRunLock(diagnosticsDirectory);
    const secondOwner = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      pid: number;
      nonce: string;
    };
    expect(secondOwner.nonce).not.toBe(firstOwner.nonce);

    first.release();
    expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toEqual(secondOwner);
    second.release();
  });

  it('does not reclaim a fresh lock whose owner PID is no longer live', () => {
    const diagnosticsDirectory = createDiagnosticsDirectory();
    const lockPath = join(diagnosticsDirectory, E2E_SINGLE_RUN_LOCK_FILE);
    const existingOwner = { pid: 2_000_000_000, nonce: 'fresh-dead-owner' };
    writeFileSync(lockPath, `${JSON.stringify(existingOwner)}\n`, 'utf8');

    expect(() => acquireE2ESingleRunLock(diagnosticsDirectory)).toThrow(/lock/i);
    expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toEqual(existingOwner);
  });

  it('replaces a stale lock whose owner PID is no longer live', () => {
    const diagnosticsDirectory = createDiagnosticsDirectory();
    const lockPath = join(diagnosticsDirectory, E2E_SINGLE_RUN_LOCK_FILE);
    const staleOwner = { pid: 2_000_000_000, nonce: 'stale-dead-owner' };
    writeFileSync(lockPath, `${JSON.stringify(staleOwner)}\n`, 'utf8');
    const staleTimestamp = new Date(Date.now() - 60 * 60 * 1_000);
    utimesSync(lockPath, staleTimestamp, staleTimestamp);

    const lock = acquireE2ESingleRunLock(diagnosticsDirectory);
    const owner = JSON.parse(readFileSync(lockPath, 'utf8')) as { pid: number; nonce: string };

    expect(owner.pid).toBe(process.pid);
    expect(owner.nonce).not.toBe(staleOwner.nonce);
    lock.release();
  });

  it('preserves a successor published after stale-owner validation', () => {
    const diagnosticsDirectory = createDiagnosticsDirectory();
    const lockPath = join(diagnosticsDirectory, E2E_SINGLE_RUN_LOCK_FILE);
    const staleOwner = { pid: 2_000_000_000, nonce: 'validated-stale-owner' };
    const successorOwner = { pid: process.pid, nonce: 'published-successor-owner' };
    writeFileSync(lockPath, `${JSON.stringify(staleOwner)}\n`, 'utf8');
    const staleTimestamp = new Date(Date.now() - 60 * 60 * 1_000);
    utimesSync(lockPath, staleTimestamp, staleTimestamp);

    let successorPublished = false;
    const interleavingLinkSync: typeof linkSync = (existingPath, newPath) => {
      if (!successorPublished && String(existingPath) === lockPath) {
        successorPublished = true;
        unlinkSync(lockPath);
        writeFileSync(lockPath, `${JSON.stringify(successorOwner)}\n`, {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        });
      }
      linkSync(existingPath, newPath);
    };

    let acquisitionError: unknown;
    let acquiredLock: ReturnType<typeof acquireE2ESingleRunLock> | undefined;
    try {
      acquiredLock = acquireE2ESingleRunLock(diagnosticsDirectory, {
        linkSync: interleavingLinkSync,
      });
    } catch (error) {
      acquisitionError = error;
    }

    expect(successorPublished).toBe(true);
    expect(acquisitionError).toBeInstanceOf(Error);
    expect((acquisitionError as Error).message).toMatch(/already active/i);
    expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toEqual(successorOwner);
    acquiredLock?.release();
  });
});
