import { createHash, generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import * as diagnostics from '../scripts/repair-runner-e2e-diagnostics.mts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectories: string[] = [];

interface ExecutableHardeningApi {
  createTransientTokenizedRunner: (
    sourcePath: string,
    jobId: string,
    claimToken: string,
    temporaryRoot?: string,
  ) => { path: string; dispose: () => void };
  parseJsonText: (text: string) => unknown;
  verifyCompletedRunnerEvidence: (input: {
    completedStatus: {
      event: string;
      outputSha256: string | null;
      reportSha256: string | null;
    };
    expectedJobId: string;
    outputPath: string;
    reportPath: string;
  }) => {
    outputBytes: Uint8Array;
    outputSha256: string;
    reportBytes: Uint8Array;
    report: Record<string, unknown>;
  };
  buildUnsignedProductionPreflightInputs: (input: {
    fileName: string;
    artifactSha256: string;
    artifactSizeBytes: number;
    contractKeyId: string;
    contractPublicKeySha256: string;
    contractPrivateKeyPkcs8Base64Url: string;
    sourceCommit: string;
  }) => {
    manifest: Record<string, unknown>; environment: NodeJS.ProcessEnv;
  };
}

const hardening = diagnostics as typeof diagnostics & Partial<ExecutableHardeningApi>;

function requiredHelper<Name extends keyof ExecutableHardeningApi>(
  name: Name,
): ExecutableHardeningApi[Name] {
  const helper = hardening[name];
  expect(helper, `${name} helper is missing`).toBeTypeOf('function');
  return helper as ExecutableHardeningApi[Name];
}

function createTemporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform !== 'win32')('LektaRepair executable E2E command', () => {
  it('ships a committed Windows runner command and harness', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.['repair:runner:e2e']).toBe(
      'vite-node scripts/run-repair-runner-e2e.mts',
    );
    expect(existsSync(join(root, 'scripts', 'run-repair-runner-e2e.mts'))).toBe(true);
  });

  it('parses generated JSON artifacts that start with a UTF-8 BOM', () => {
    const parseJsonText = requiredHelper('parseJsonText');

    expect(parseJsonText('\uFEFF{"ok":true}')).toEqual({ ok: true });
  });

  it('validates signed completion hashes against the output and exact persisted runner report', () => {
    const directory = createTemporaryDirectory('lekta-runner-completion-');
    const outputPath = join(directory, 'fixed.docx');
    const reportPath = join(directory, 'lekta-repair-runner-report.json');
    const jobId = '11111111-1111-4111-8111-111111111111';
    const outputBytes = Buffer.from('fixed document bytes', 'utf8');
    const outputSha256 = createHash('sha256').update(outputBytes).digest('hex');
    const reportBytes = Buffer.from(JSON.stringify({
      full_pass: true,
      job_id: jobId,
      output_sha256: outputSha256,
      status: 'FULL_PASS',
    }), 'utf8');
    const reportSha256 = createHash('sha256').update(reportBytes).digest('hex');
    writeFileSync(outputPath, outputBytes);
    writeFileSync(reportPath, reportBytes);
    const verifyEvidence = requiredHelper('verifyCompletedRunnerEvidence');

    const evidence = verifyEvidence({
      completedStatus: { event: 'completed', outputSha256, reportSha256 },
      expectedJobId: jobId,
      outputPath,
      reportPath,
    });

    expect(Buffer.from(evidence.outputBytes)).toEqual(outputBytes);
    expect(Buffer.from(evidence.reportBytes)).toEqual(reportBytes);
    expect(evidence.report).toMatchObject({ full_pass: true, job_id: jobId });

    writeFileSync(reportPath, `${reportBytes.toString('utf8')}\n`);
    expect(() => verifyEvidence({
      completedStatus: { event: 'completed', outputSha256, reportSha256 },
      expectedJobId: jobId,
      outputPath,
      reportPath,
    })).toThrow(/exact persisted.*bytes/i);
  });

  it('keeps the tokenized runner name transient and removes it after execution', () => {
    const artifactDirectory = createTemporaryDirectory('lekta-runner-artifact-');
    const executionRoot = createTemporaryDirectory('lekta-runner-execution-');
    const sourcePath = join(artifactDirectory, 'LektaRepairDev.exe');
    const sourceBytes = Buffer.from('unsigned development runner', 'utf8');
    const jobId = '22222222-2222-4222-8222-222222222222';
    const claimToken = 'C'.repeat(43);
    writeFileSync(sourcePath, sourceBytes);
    const createTransientRunner = requiredHelper('createTransientTokenizedRunner');

    const transient = createTransientRunner(sourcePath, jobId, claimToken, executionRoot);
    expect(readFileSync(transient.path)).toEqual(sourceBytes);
    expect(transient.path).toContain(claimToken);
    expect(readFileSync(sourcePath)).toEqual(sourceBytes);

    transient.dispose();

    expect(existsSync(transient.path)).toBe(false);
    expect(JSON.stringify({ artifact: sourcePath, executionRoot })).not.toContain(claimToken);
  });

  it('configures the unsigned development artifact far enough to reject specifically on Authenticode', () => {
    const directory = createTemporaryDirectory('lekta-runner-preflight-');
    const artifactPath = join(directory, 'LektaRepairDev.exe');
    const artifactBytes = Buffer.from('unsigned development runner', 'utf8');
    writeFileSync(artifactPath, artifactBytes);
    const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const privateKeyPkcs8Base64Url = privateKey
      .export({ format: 'der', type: 'pkcs8' })
      .toString('base64url');
    const contractPublicKeySha256 = createHash('sha256')
      .update(publicKey.export({ format: 'der', type: 'spki' })).digest('hex');
    const fixture = requiredHelper('buildUnsignedProductionPreflightInputs')({
      fileName: 'LektaRepairDev.exe',
      artifactSha256,
      artifactSizeBytes: artifactBytes.byteLength,
      contractKeyId: 'lekta-e2e-key',
      contractPublicKeySha256,
      contractPrivateKeyPkcs8Base64Url: privateKeyPkcs8Base64Url,
      sourceCommit: '1'.repeat(40),
    });
    expect(fixture.manifest).toMatchObject({
      schemaVersion: 2,
      contractPublicKeySha256,
    });
    const manifestPath = join(directory, 'lekta-repair-runner-manifest.json');
    writeFileSync(manifestPath, JSON.stringify(fixture.manifest), 'utf8');

    const completed = spawnSync(
      process.execPath,
      [
        join(root, 'scripts', 'run-local-repair-release.mts'),
        '--artifact',
        artifactPath,
        '--manifest',
        manifestPath,
      ],
      {
        cwd: root,
        env: { ...process.env, ...fixture.environment },
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30_000,
      },
    );

    const output = `${completed.stdout}${completed.stderr}`;
    expect(completed.status).not.toBe(0);
    expect(output).toMatch(/Authenticode status nije Valid\./);
    expect(output).not.toMatch(/Preflight zahtijeva LEKTA_REPAIR_/);
  });

  it('reports live repository heads instead of pinning historical commits', () => {
    const completed = spawnSync(
      process.execPath,
      [
        join(root, 'node_modules', 'vite-node', 'vite-node.mjs'),
        'scripts/run-repair-runner-e2e.mts',
        '--repository-evidence-only',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30_000,
      },
    );
    expect(completed.status, `${completed.stdout}${completed.stderr}`).toBe(0);

    const evidenceLine = completed.stdout.trim().split(/\r?\n/).at(-1) ?? '';
    const evidence = JSON.parse(evidenceLine) as {
      lekta: { branch: string; head: string; contentSha256: string };
      wordReplica: { branch: string; head: string; contentSha256: string };
    };
    const lektaHead = spawnSync('git.exe', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    }).stdout.trim();
    const wordReplicaHead = spawnSync('git.exe', ['rev-parse', 'HEAD'], {
      cwd: 'C:\\WordReplica-Automation\\repo',
      encoding: 'utf8',
      windowsHide: true,
    }).stdout.trim();

    expect(evidence.lekta).toMatchObject({
      branch: 'feature/repair-contract-v1-current-v2',
      head: lektaHead,
    });
    expect(evidence.wordReplica).toMatchObject({
      branch: 'automation-dev',
      head: wordReplicaHead,
    });
    expect(evidence.lekta.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.wordReplica.contentSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
