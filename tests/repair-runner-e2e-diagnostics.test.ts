import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import * as diagnostics from '../scripts/repair-runner-e2e-diagnostics.mts';

const {
  E2E_FAILURE_FILE,
  E2E_FAILURE_LOG,
  persistE2EFailure,
  readE2EChildFailure,
} = diagnostics;

interface HardeningApi {
  buildE2EChildEnvironment: (source: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
  assertProcessSetUnchanged: (before: readonly number[], after: readonly number[], phase: string) => void;
  digestWorkingTreeSnapshot: (snapshot: {
    head: string;
    trackedDiff: Uint8Array;
    untrackedFiles: ReadonlyArray<{ path: string; bytes: Uint8Array }>;
  }) => string;
  publishJsonExclusiveAtomic: (path: string, value: unknown) => boolean;
  verifyPersistedRunnerReport: (
    path: string,
    expectedSha256: string,
  ) => { bytes: Uint8Array; report: Record<string, unknown> };
  writeE2ELog: (path: string, text: string, sensitiveValues: readonly string[]) => void;
}

const hardening = diagnostics as typeof diagnostics & Partial<HardeningApi>;

function requiredHelper<Name extends keyof HardeningApi>(name: Name): HardeningApi[Name] {
  const helper = hardening[name];
  expect(helper, `${name} helper is missing`).toBeTypeOf('function');
  return helper as HardeningApi[Name];
}

const temporaryDirectories: string[] = [];

function createDiagnosticsDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'lekta-runner-e2e-diagnostics-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('repair runner E2E failure diagnostics', () => {
  it('surfaces the sanitized child diagnostic that explains a nonzero runner exit', () => {
    const diagnosticsDirectory = createDiagnosticsDirectory();
    const childDiagnosticPath = join(diagnosticsDirectory, 'runner-error.json');
    const claimToken = 'A'.repeat(43);
    writeFileSync(childDiagnosticPath, JSON.stringify({
      status: 'failed',
      error: {
        type: 'RuntimeError',
        message: `exact underlying failure ${claimToken}`,
        traceback: `Traceback: exact underlying failure ${claimToken}`,
      },
    }));

    const rendered = readE2EChildFailure(childDiagnosticPath, [claimToken]);
    expect(rendered).toContain(
      'RuntimeError: exact underlying failure',
    );
    expect(rendered).toContain('[REDACTED]');
    expect(rendered).not.toContain(claimToken);
    expect(readE2EChildFailure(join(diagnosticsDirectory, 'missing.json'))).toBe(
      'development runner diagnostic unavailable',
    );
  });

  it('persists only the first failure and redacts registered secrets', () => {
    const diagnosticsDirectory = createDiagnosticsDirectory();
    const privateKey = 'private-key-material';
    const claimToken = 'claim-token-material';

    persistE2EFailure(
      diagnosticsDirectory,
      new Error(`first failure ${privateKey} ${claimToken}`),
      [privateKey, claimToken],
    );
    persistE2EFailure(diagnosticsDirectory, new Error('second failure'), []);

    const failure = readFileSync(join(diagnosticsDirectory, E2E_FAILURE_FILE), 'utf8');
    const log = readFileSync(join(diagnosticsDirectory, E2E_FAILURE_LOG), 'utf8');
    expect(existsSync(join(diagnosticsDirectory, E2E_FAILURE_FILE))).toBe(true);
    expect(failure).toContain('first failure [REDACTED] [REDACTED]');
    expect(log).toContain('first failure [REDACTED] [REDACTED]');
    expect(`${failure}\n${log}`).not.toContain(privateKey);
    expect(`${failure}\n${log}`).not.toContain(claimToken);
    expect(`${failure}\n${log}`).not.toContain('second failure');
  });

  it('publishes one complete JSON value exclusively and leaves no temporary file', () => {
    const diagnosticsDirectory = createDiagnosticsDirectory();
    const failurePath = join(diagnosticsDirectory, 'atomic.json');
    const publish = requiredHelper('publishJsonExclusiveAtomic');

    expect(publish(failurePath, { winner: 'first' })).toBe(true);
    expect(publish(failurePath, { winner: 'second' })).toBe(false);

    expect(JSON.parse(readFileSync(failurePath, 'utf8'))).toEqual({ winner: 'first' });
    expect(readdirSync(diagnosticsDirectory)).toEqual(['atomic.json']);
  });

  it('allowlists child environment variables instead of inheriting ambient secrets or hooks', () => {
    const buildEnvironment = requiredHelper('buildE2EChildEnvironment');

    expect(buildEnvironment({
      Path: 'C:\\Windows\\System32',
      SystemRoot: 'C:\\Windows',
      TEMP: 'C:\\Temp',
      LEKTA_CLAIM_TOKEN: 'secret-claim-token',
      NODE_OPTIONS: '--require malicious-hook.cjs',
      PSModulePath: 'untrusted-module-path',
    })).toEqual({
      PATH: 'C:\\Windows\\System32',
      SYSTEMROOT: 'C:\\Windows',
      TEMP: 'C:\\Temp',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    });
  });

  it('computes an order-independent content digest that changes with path or bytes', () => {
    const digest = requiredHelper('digestWorkingTreeSnapshot');
    const encoder = new TextEncoder();
    const base = {
      head: 'a'.repeat(40),
      trackedDiff: encoder.encode('tracked diff\n'),
      untrackedFiles: [
        { path: 'z-last.txt', bytes: encoder.encode('last') },
        { path: 'a-first.txt', bytes: encoder.encode('first') },
      ],
    };

    const first = digest(base);
    const reordered = digest({ ...base, untrackedFiles: [...base.untrackedFiles].reverse() });
    const changedContent = digest({
      ...base,
      untrackedFiles: [
        { path: 'z-last.txt', bytes: encoder.encode('changed') },
        base.untrackedFiles[1],
      ],
    });
    const changedPath = digest({
      ...base,
      untrackedFiles: [
        { path: 'renamed.txt', bytes: encoder.encode('last') },
        base.untrackedFiles[1],
      ],
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered).toBe(first);
    expect(changedContent).not.toBe(first);
    expect(changedPath).not.toBe(first);
  });

  it('matches signed reportSha256 against exact persisted bytes and fails closed if absent', () => {
    const diagnosticsDirectory = createDiagnosticsDirectory();
    const reportPath = join(diagnosticsDirectory, 'lekta-repair-runner-report.json');
    const verifyReport = requiredHelper('verifyPersistedRunnerReport');
    const exactBytes = Buffer.from('{"full_pass":true,"job_id":"job-1"}', 'utf8');
    const signedHash = createHash('sha256').update(exactBytes).digest('hex');

    expect(() => verifyReport(reportPath, signedHash)).toThrow(
      /WordReplica development runner must persist/i,
    );

    writeFileSync(reportPath, exactBytes);
    expect(verifyReport(reportPath, signedHash).report).toEqual({
      full_pass: true,
      job_id: 'job-1',
    });

    writeFileSync(reportPath, '{\n  "full_pass": true,\n  "job_id": "job-1"\n}\n');
    expect(() => verifyReport(reportPath, signedHash)).toThrow(/exact persisted.*bytes/i);
  });

  it('redacts registered secrets before a child log becomes an artifact', () => {
    const diagnosticsDirectory = createDiagnosticsDirectory();
    const logPath = join(diagnosticsDirectory, 'child.log');
    const writeLog = requiredHelper('writeE2ELog');
    const claimToken = 'B'.repeat(43);

    writeLog(logPath, `runner path C:\\temp\\LektaRepair-job-${claimToken}.exe`, [claimToken]);

    expect(readFileSync(logPath, 'utf8')).toBe(
      'runner path C:\\temp\\LektaRepair-job-[REDACTED].exe',
    );
  });

  it('requires the exact same process set after every protected phase', () => {
    const assertUnchanged = requiredHelper('assertProcessSetUnchanged');

    expect(() => assertUnchanged([22, 11], [11, 22], 'runner')).not.toThrow();
    expect(() => assertUnchanged([11, 22], [22], 'runner')).toThrow(
      /process set changed.*runner/i,
    );
    expect(() => assertUnchanged([11, 22], [11, 22, 33], 'runner')).toThrow(
      /process set changed.*runner/i,
    );
  });
});
