import { deepStrictEqual, equal, match, ok } from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID, webcrypto } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { issueLocalRepairJob } from '../src/repair/local-runner/issue-service.ts';
import { handleLocalRepairClaimHttp } from '../src/repair/local-runner/claim-http.ts';
import { claimLocalRepairJob } from '../src/repair/local-runner/claim-service.ts';
import { handleLocalRepairStatusHttp } from '../src/repair/local-runner/status-http.ts';
import {
  recordLocalRepairStatus,
  type AtomicLocalRepairStatus,
  type LocalRepairState,
} from '../src/repair/local-runner/status-service.ts';
import { acquireE2ESingleRunLock } from './repair-runner-e2e-lock.mts';
import {
  assertSensitiveValuesAbsentFromDiagnostics,
  assertProcessSetUnchanged,
  buildUnsignedProductionPreflightInputs,
  buildE2EChildEnvironment,
  createTransientTokenizedRunner,
  digestWorkingTreeSnapshot,
  E2E_RUNNER_REPORT_FILE,
  parseJsonText,
  persistE2EFailure,
  publishJsonExclusiveAtomic,
  readE2EChildFailure,
  verifyCompletedRunnerEvidence,
  writeE2ELog,
} from './repair-runner-e2e-diagnostics.mts';
import { prepareFieldStableTarget } from './repair-runner-e2e-target.mts';

const LEKTA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORDREPLICA_ROOT = 'C:\\WordReplica-Automation\\repo';
const WORDREPLICA_PYTHON = 'C:\\WordReplica-Automation\\.venv\\Scripts\\python.exe';
const DIAGNOSTICS_ROOT = 'C:\\WordReplica-Automation\\diagnostics';
const SOURCE_PATH = 'C:\\Users\\PC\\Documents\\Kalogjera - seminar Havel.docx';
const TARGET_PATH = 'C:\\WordReplica-Automation\\lab\\lekta-crossrepo-59b6daa\\Kalogjera - seminar Havel-popravljeno.docx';
const REQUESTS_PATH = 'C:\\WordReplica-Automation\\lab\\lekta-crossrepo-59b6daa\\repair-contract.json';
const LEKTA_BRANCH = 'feature/repair-contract-v1-current-v2';
const WORDREPLICA_BRANCH = 'automation-dev';
const SOURCE_SHA256 = '47948159867f4fb6c668f0bba066380591c142995443bb9c8a5f17d6984bff30';
const SOURCE_SIZE = 344995;
const TARGET_SHA256 = 'c7ed489470ad2012d3fe7b49169927e7617b3cbfb94020c476d79c653ea251a1';
const TARGET_SIZE = 344779;
const GOLDEN_GATES = Array.from({ length: 11 }, (_, index) => `G${index}`);
const MAX_CAPTURED_CHILD_OUTPUT = 64 * 1024 * 1024;
const CHILD_ENVIRONMENT = buildE2EChildEnvironment(process.env);

interface RepairRequest {
  requestId: string;
  fixerId: string;
  ruleId: string;
  params: Record<string, unknown>;
}

interface DownloadGrant {
  bytes: Uint8Array;
  expiresAt: number;
  kind: 'source' | 'target';
}

interface HarnessState {
  localState: 'claimable' | LocalRepairState;
  sequence: number;
  devicePublicKeySpki: string | null;
  deviceKeySha256: string | null;
}

interface RepositoryEvidence {
  branch: string;
  head: string;
  status: string;
  contentSha256: string;
}

interface FailureContext {
  diagnosticsDirectory: string;
  sensitiveValues: string[];
  repositoriesBefore: { lekta: RepositoryEvidence; wordReplica: RepositoryEvidence };
}

let activeFailureContext: FailureContext | null = null;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function gitBytes(root: string, args: string[]): Buffer {
  const completed = spawnSync('git.exe', args, {
    cwd: root,
    env: CHILD_ENVIRONMENT,
    windowsHide: true,
    maxBuffer: MAX_CAPTURED_CHILD_OUTPUT,
  });
  if (completed.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed in ${root}: ${completed.stderr.toString('utf8').trim()}`,
    );
  }
  return completed.stdout;
}

function gitText(root: string, args: string[]): string {
  return gitBytes(root, args).toString('utf8').trim();
}

function repositoryContentSha256(root: string, head: string): string {
  const trackedDiff = gitBytes(root, [
    'diff',
    '--binary',
    '--full-index',
    '--no-ext-diff',
    '--no-textconv',
    head,
    '--',
    '.',
  ]);
  const untrackedPaths = gitBytes(
    root,
    ['ls-files', '--others', '--exclude-standard', '-z'],
  ).toString('utf8').split('\0').filter(Boolean);
  return digestWorkingTreeSnapshot({
    head,
    trackedDiff,
    untrackedFiles: untrackedPaths.map((path) => ({
      path,
      bytes: readFileSync(join(root, path)),
    })),
  });
}

function captureRepositoryEvidence(root: string): RepositoryEvidence {
  const branch = gitText(root, ['branch', '--show-current']);
  const head = gitText(root, ['rev-parse', 'HEAD']);
  match(head, /^[a-f0-9]{40}$/);
  return {
    branch,
    head,
    status: gitText(root, ['status', '--porcelain=v1']),
    contentSha256: repositoryContentSha256(root, head),
  };
}

function readRepositoryEvidence(root: string, expectedBranch: string): RepositoryEvidence {
  const evidence = captureRepositoryEvidence(root);
  equal(evidence.branch, expectedBranch, `${root} must remain on ${expectedBranch}.`);
  return evidence;
}

function writeJsonAtomic(path: string, value: unknown): void {
  if (!publishJsonExclusiveAtomic(path, value)) {
    throw new Error(`Refusing to overwrite existing E2E JSON artifact: ${path}`);
  }
}

function runCaptured(
  command: string,
  args: string[],
  options: {
    cwd: string;
    logPath: string;
    timeoutMs: number;
    sensitiveValues?: readonly string[];
    environment?: NodeJS.ProcessEnv;
  },
): ReturnType<typeof spawnSync> {
  const completed = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.environment ?? CHILD_ENVIRONMENT,
    windowsHide: true,
    timeout: options.timeoutMs,
    maxBuffer: MAX_CAPTURED_CHILD_OUTPUT,
  });
  writeE2ELog(
    options.logPath,
    `${completed.stdout ?? ''}${completed.stderr ?? ''}`,
    options.sensitiveValues ?? [],
  );
  if (completed.error) {
    throw new Error(`Process failed before exit; see ${options.logPath}: ${completed.error.message}`);
  }
  return completed;
}

function runChild(
  command: string,
  args: string[],
  options: {
    cwd: string;
    logPath: string;
    timeoutMs: number;
    sensitiveValues: readonly string[];
  },
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: CHILD_ENVIRONMENT,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const outputChunks: Buffer[] = [];
    let outputBytes = 0;
    let outputLimitExceeded = false;
    let spawnError: Error | null = null;
    let timedOut = false;
    const capture = (value: Buffer | string): void => {
      if (outputLimitExceeded) return;
      const chunk = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value, 'utf8');
      if (outputBytes + chunk.byteLength > MAX_CAPTURED_CHILD_OUTPUT) {
        outputLimitExceeded = true;
        child.kill();
        return;
      }
      outputChunks.push(chunk);
      outputBytes += chunk.byteLength;
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.once('error', (error) => {
      spawnError = error;
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      try {
        writeE2ELog(
          options.logPath,
          Buffer.concat(outputChunks, outputBytes).toString('utf8'),
          options.sensitiveValues,
        );
        if (spawnError) {
          reject(spawnError);
        } else if (timedOut) {
          reject(new Error(`Runner timed out; see ${options.logPath}`));
        } else if (outputLimitExceeded) {
          reject(new Error(`Runner output exceeded the capture limit; see ${options.logPath}`));
        } else {
          resolvePromise({ code, signal });
        }
      } catch (error) {
        reject(error);
      }
    });
  });
}

function wordPids(): number[] {
  const completed = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "@(Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id | Sort-Object) -join \"`n\"",
  ], { encoding: 'utf8', env: CHILD_ENVIRONMENT, windowsHide: true });
  if (completed.status !== 0) throw new Error(`Word PID capture failed: ${completed.stderr.trim()}`);
  return completed.stdout
    .split(/\s+/)
    .filter(Boolean)
    .map((value) => Number(value))
    .filter(Number.isSafeInteger)
    .sort((left, right) => left - right);
}


async function requestBytes(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.byteLength;
    if (total > 128 * 1024) throw new Error('Loopback request exceeded harness limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

function webHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function toWebRequest(request: IncomingMessage, port: number): Promise<Request> {
  const method = request.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : await requestBytes(request);
  return new Request(`https://127.0.0.1:${port}${request.url ?? '/'}`, {
    method,
    headers: webHeaders(request),
    body,
  });
}

async function sendWebResponse(response: Response, target: ServerResponse): Promise<void> {
  target.statusCode = response.status;
  response.headers.forEach((value, name) => target.setHeader(name, value));
  target.end(Buffer.from(await response.arrayBuffer()));
}

function assertFileIdentity(path: string, expectedSha256: string, expectedSize: number): void {
  const bytes = readFileSync(path);
  equal(bytes.byteLength, expectedSize, `${path} size changed`);
  equal(sha256(bytes), expectedSha256, `${path} SHA-256 changed`);
}

async function main(): Promise<void> {
  if (process.platform !== 'win32') throw new Error('repair:runner:e2e is Windows-only.');
  const lektaRepository = readRepositoryEvidence(LEKTA_ROOT, LEKTA_BRANCH);
  const wordReplicaRepository = readRepositoryEvidence(WORDREPLICA_ROOT, WORDREPLICA_BRANCH);
  if (process.argv.includes('--repository-evidence-only')) {
    process.stdout.write(`${JSON.stringify({
      lekta: {
        branch: lektaRepository.branch,
        head: lektaRepository.head,
        contentSha256: lektaRepository.contentSha256,
      },
      wordReplica: {
        branch: wordReplicaRepository.branch,
        head: wordReplicaRepository.head,
        contentSha256: wordReplicaRepository.contentSha256,
      },
    })}\n`);
    return;
  }
  const singleRunLock = acquireE2ESingleRunLock(DIAGNOSTICS_ROOT);
  try {

  assertFileIdentity(SOURCE_PATH, SOURCE_SHA256, SOURCE_SIZE);
  assertFileIdentity(TARGET_PATH, TARGET_SHA256, TARGET_SIZE);
  ok(existsSync(WORDREPLICA_PYTHON), 'WordReplica virtual-environment Python is absent.');

  const fixture = JSON.parse(readFileSync(REQUESTS_PATH, 'utf8')) as { requests?: RepairRequest[] };
  ok(Array.isArray(fixture.requests), 'repair-contract.json requests are absent.');
  equal(fixture.requests.length, 7, 'Expected exactly seven repair requests.');
  const fixtureRequests = fixture.requests;

  const jobId = randomUUID();
  const userId = randomUUID();
  const slotId = randomUUID();
  const runId = `lekta-runner-e2e-${new Date().toISOString().replace(/[:.]/g, '-')}-${jobId.slice(0, 8)}`;
  const diagnosticsDirectory = join(DIAGNOSTICS_ROOT, runId);
  const keyDirectory = join(diagnosticsDirectory, 'keys');
  const buildDirectory = join(diagnosticsDirectory, 'build');
  const artifactDirectory = join(diagnosticsDirectory, 'artifact');
  const outputDirectory = join(diagnosticsDirectory, 'output');
  const stateDirectory = join(diagnosticsDirectory, 'state');
  const targetDirectory = join(diagnosticsDirectory, 'target');
  const qaDirectory = join(diagnosticsDirectory, 'qa');
  const logDirectory = join(diagnosticsDirectory, 'logs');
  for (const directory of [
    diagnosticsDirectory,
    keyDirectory,
    buildDirectory,
    artifactDirectory,
    outputDirectory,
    stateDirectory,
    targetDirectory,
    qaDirectory,
    logDirectory,
  ]) mkdirSync(directory, { recursive: true });
  activeFailureContext = {
    diagnosticsDirectory,
    sensitiveValues: [],
    repositoriesBefore: {
      lekta: lektaRepository,
      wordReplica: wordReplicaRepository,
    },
  };
  process.stdout.write(`Diagnostics: ${diagnosticsDirectory}\n`);
  const sourceBytes = new Uint8Array(readFileSync(SOURCE_PATH));
  const immutableTargetBytes = new Uint8Array(readFileSync(TARGET_PATH));
  const fieldStableTarget = await prepareFieldStableTarget(immutableTargetBytes);
  equal(fieldStableTarget.removedFields, 1, 'Expected exactly one removable orphan TOC control.');
  ok(fieldStableTarget.request, 'Field-stable target request is absent.');
  ok(fieldStableTarget.confirmationText, 'Field-stable target confirmation is absent.');
  const signedTargetBytes = fieldStableTarget.docxBytes;
  const signedTargetPath = join(diagnosticsDirectory,
    'target', basename(TARGET_PATH));
  const signedTargetSha256 = sha256(signedTargetBytes);
  writeFileSync(signedTargetPath, signedTargetBytes, { flag: 'wx' });
  const exactRequests: RepairRequest[] = [
    ...fixtureRequests,
    {
      requestId: `req-${String(fixtureRequests.length + 1).padStart(4, '0')}`,
      ...fieldStableTarget.request,
    },
  ];

  const wordPidsBefore = wordPids();
  const fieldStabilityLogPath = join(logDirectory, 'field-stability.log');
  const fieldStabilityCode = [
    'from pathlib import Path',
    'import sys',
    'from word_replica.qa.word_render import check_fields_update_equality',
    'raise SystemExit(0 if check_fields_update_equality(Path(sys.argv[1])) else 2)',
  ].join('\n');
  const fieldStability = runCaptured(WORDREPLICA_PYTHON, [
    '-c',
    fieldStabilityCode,
    signedTargetPath,
  ], {
    cwd: WORDREPLICA_ROOT,
    logPath: fieldStabilityLogPath,
    timeoutMs: 5 * 60 * 1000,
  });
  equal(fieldStability.status, 0, `Derived target is not Fields.Update-stable; see ${fieldStabilityLogPath}`);
  assertProcessSetUnchanged(wordPidsBefore, wordPids(), 'field-stability preflight');

  const signerPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  const signerPublicSpki = Buffer.from(await webcrypto.subtle.exportKey('spki', signerPair.publicKey));
  const signerPrivatePkcs8 = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', signerPair.privateKey));
  const publicKeyBase64Url = signerPublicSpki.toString('base64url');
  const privateKeyBase64Url = signerPrivatePkcs8.toString('base64url');
  const keyId = `lekta-e2e-${randomBytes(8).toString('hex')}`;
  const publicKeyPath = join(keyDirectory, 'contract-public-key.spki.b64url');
  const trustStorePath = join(keyDirectory, 'trusted_keys.json');
  writeFileSync(publicKeyPath, `${publicKeyBase64Url}\n`, { encoding: 'utf8', mode: 0o600 });
  activeFailureContext.sensitiveValues.push(privateKeyBase64Url);

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 60 * 60 * 1000);
  const issued = await issueLocalRepairJob({
    jobId,
    userId,
    slotId,
    sourceBytes,
    sourceFileName: basename(SOURCE_PATH),
    targetBytes: signedTargetBytes,
    targetFileName: basename(TARGET_PATH),
    createdAt,
    expiresAt,
    requests: exactRequests.map(({ fixerId, ruleId, params }) => ({ fixerId, ruleId, params })),
    confirmations: [{
      requestIndex: fixtureRequests.length,
      confirmationText: fieldStableTarget.confirmationText,
      confirmedAt: createdAt,
    }],
    suggestedFileName: basename(TARGET_PATH),
    signer: { privateKey: signerPair.privateKey, keyId },
  });
  deepStrictEqual(issued.record.repairContract.requests, exactRequests);
  equal(issued.launch.claimToken.length, 43);
  activeFailureContext.sensitiveValues.push(issued.launch.claimToken);

  const buildLogPath = join(logDirectory, 'build.log');
  const build = runCaptured('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    join(WORDREPLICA_ROOT, 'BUILD_LEKTA_REPAIR_RUNNER_DEV.ps1'),
    '-PublicKeyPath',
    publicKeyPath,
    '-KeyId',
    keyId,
    '-GeneratedTrustStorePath',
    trustStorePath,
    '-RunnerPythonPath',
    WORDREPLICA_PYTHON,
    '-OutputDirectory',
    buildDirectory,
  ], {
    cwd: WORDREPLICA_ROOT,
    logPath: buildLogPath,
    timeoutMs: 30 * 60 * 1000,
    sensitiveValues: activeFailureContext.sensitiveValues,
  });
  equal(build.status, 0, `Development runner build failed; see ${buildLogPath}`);
  const builtExecutable = join(buildDirectory, 'LektaRepairDev.exe');
  const developmentManifestPath = join(buildDirectory, 'lekta-repair-runner-dev-manifest.json');
  ok(existsSync(builtExecutable), 'LektaRepairDev.exe build artifact is absent.');
  ok(existsSync(developmentManifestPath), 'Development manifest is absent.');
  const developmentManifest = parseJsonText(readFileSync(developmentManifestPath, 'utf8')) as Record<string, unknown>;
  equal(developmentManifest.developmentOnly, true);
  equal(developmentManifest.fileName, 'LektaRepairDev.exe');
  equal(developmentManifest.contractKeyId, keyId);
  ok(developmentManifest.authenticodeStatus !== 'Valid');
  equal(developmentManifest.sha256, sha256(readFileSync(builtExecutable)));
  assertProcessSetUnchanged(wordPidsBefore, wordPids(), 'development build');

  const state: HarnessState = {
    localState: 'claimable',
    sequence: 0,
    devicePublicKeySpki: null,
    deviceKeySha256: null,
  };
  const statuses: AtomicLocalRepairStatus[] = [];
  const grants = new Map<string, DownloadGrant>();
  const downloadCounts = { source: 0, target: 0 };
  const serverErrors: string[] = [];
  let claimHttpRequests = 0;
  let claimAtomicAttempts = 0;
  let validClaims = 0;
  let statusHttpRequests = 0;
  let port = 0;
  const originalPath = `${userId}/${jobId}/original.docx`;
  const resultPath = `${userId}/${jobId}/fixed.docx`;

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/claim') {
        claimHttpRequests += 1;
        const webResponse = await handleLocalRepairClaimHttp(
          await toWebRequest(request, port),
          {
            claim: (input) => claimLocalRepairJob(input, {
              claimAtomic: async (claim) => {
                claimAtomicAttempts += 1;
                if (state.localState !== 'claimable'
                  || claim.jobId !== jobId
                  || claim.claimTokenSha256 !== issued.record.claimTokenSha256
                  || Date.now() >= Date.parse(issued.record.claimExpiresAt)) return null;
                state.localState = 'claimed';
                state.devicePublicKeySpki = claim.devicePublicKeySpki;
                state.deviceKeySha256 = claim.deviceKeySha256;
                validClaims += 1;
                return {
                  jobId,
                  userId,
                  localState: 'claimed',
                  repairContract: issued.record.repairContract,
                  originalPath,
                  resultPath,
                };
              },
              signRepairObject: async (path, expiresInSeconds) => {
                const kind = path === originalPath ? 'source' : path === resultPath ? 'target' : null;
                if (!kind) throw new Error(`Unexpected repair object path: ${path}`);
                const grantPath = `/download/${kind}/${randomUUID()}`;
                grants.set(grantPath, {
                  bytes: kind === 'source' ? sourceBytes : signedTargetBytes,
                  expiresAt: Date.now() + expiresInSeconds * 1000,
                  kind,
                });
                return `https://127.0.0.1:${port}${grantPath}`;
              },
            }),
          },
        );
        await sendWebResponse(webResponse, response);
        return;
      }
      if (url.pathname === '/status') {
        statusHttpRequests += 1;
        const webResponse = await handleLocalRepairStatusHttp(
          await toWebRequest(request, port),
          {
            record: (input) => recordLocalRepairStatus(input, {
              now: () => new Date(),
              loadBinding: async (loadedJobId) => {
                if (loadedJobId !== jobId
                  || state.localState === 'claimable'
                  || !state.devicePublicKeySpki
                  || !state.deviceKeySha256) return null;
                return {
                  jobId,
                  localState: state.localState,
                  devicePublicKeySpki: state.devicePublicKeySpki,
                  deviceKeySha256: state.deviceKeySha256,
                };
              },
              advanceAtomic: async (event) => {
                if (!state.deviceKeySha256
                  || event.jobId !== jobId
                  || event.deviceKeySha256 !== state.deviceKeySha256
                  || event.sequence !== state.sequence + 1) return null;
                let nextState: LocalRepairState | null = null;
                if ((state.localState === 'claimed' || state.localState === 'retryable')
                  && event.event === 'processing') nextState = 'processing';
                if (state.localState === 'processing' && event.event === 'heartbeat') nextState = 'processing';
                if (state.localState === 'processing' && event.event === 'retryable') nextState = 'retryable';
                if (state.localState === 'processing' && event.event === 'completed') nextState = 'completed';
                if (state.localState === 'processing' && event.event === 'local_failed') nextState = 'local_failed';
                if (!nextState) return null;
                state.localState = nextState;
                state.sequence = event.sequence;
                statuses.push(event);
                return { localState: nextState, sequence: event.sequence };
              },
            }),
          },
        );
        await sendWebResponse(webResponse, response);
        return;
      }
      if (request.method === 'GET') {
        const grant = grants.get(url.pathname);
        if (grant && grant.expiresAt > Date.now()) {
          downloadCounts[grant.kind] += 1;
          response.statusCode = 200;
          response.setHeader('cache-control', 'no-store');
          response.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          response.end(Buffer.from(grant.bytes));
          return;
        }
      }
      response.statusCode = 404;
      response.end('not found');
    })().catch((error: unknown) => {
      serverErrors.push(error instanceof Error ? error.stack ?? error.message : String(error));
      if (!response.headersSent) response.statusCode = 500;
      response.end('internal');
    });
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolvePromise();
    });
  });
  const address = server.address() as AddressInfo;
  equal(address.address, '127.0.0.1');
  port = address.port;

  const runnerLogPath = join(logDirectory, 'runner.log');
  const runnerReportPath = join(qaDirectory, E2E_RUNNER_REPORT_FILE);
  let runnerExit: { code: number | null; signal: NodeJS.Signals | null };
  try {
    const transientRunner = createTransientTokenizedRunner(
      builtExecutable,
      jobId,
      issued.launch.claimToken,
    );
    const runnerDiagnosticPath = join(dirname(transientRunner.path), 'runner-error.json');
    try {
      runnerExit = await runChild(transientRunner.path, [
        '--development-e2e',
        '--claim-endpoint',
        `https://127.0.0.1:${port}/claim`,
        '--status-endpoint',
        `https://127.0.0.1:${port}/status`,
        '--output-directory',
        outputDirectory,
        '--state-directory',
        stateDirectory,
        '--diagnostic-path',
        runnerDiagnosticPath,
        '--report-path',
        runnerReportPath,
      ], {
        cwd: diagnosticsDirectory,
        logPath: runnerLogPath,
        timeoutMs: 20 * 60 * 1000,
        sensitiveValues: activeFailureContext.sensitiveValues,
      });

      if (runnerExit.code !== 0) {
        throw new Error(
          `Runner exited nonzero (${runnerExit.code}); ${readE2EChildFailure(
            runnerDiagnosticPath,
            activeFailureContext.sensitiveValues,
          )}`,
        );
      }
      ok(!existsSync(runnerDiagnosticPath), 'Runner emitted a failure diagnostic on successful exit.');
    } finally {
      transientRunner.dispose();
    }
    equal(runnerExit.signal, null);
    const wordPidsAfterRunner = wordPids();
    assertProcessSetUnchanged(wordPidsBefore, wordPidsAfterRunner, 'runner execution');

    ok(state.devicePublicKeySpki, 'The valid claim did not bind a device public key.');
    ok(state.deviceKeySha256, 'The valid claim did not bind a device key hash.');
    const replayResponse = await fetch(`http://127.0.0.1:${port}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jobId,
        claimToken: issued.launch.claimToken,
        devicePublicKeySpki: state.devicePublicKeySpki,
      }),
    });
    equal(replayResponse.status, 409);
    deepStrictEqual(await replayResponse.json(), { error: 'not_claimable' });

    equal(claimHttpRequests, 2);
    equal(claimAtomicAttempts, 2);
    equal(validClaims, 1);
    equal(downloadCounts.source, 1);
    equal(downloadCounts.target, 1);
    deepStrictEqual(serverErrors, []);
    equal(statusHttpRequests, statuses.length);
    ok(statuses.length >= 2, 'Expected processing and completed status events.');
    equal(statuses[0].event, 'processing');
    equal(statuses.at(-1)?.event, 'completed');
    for (const [index, status] of statuses.entries()) {
      equal(status.sequence, index + 1);
      equal(status.deviceKeySha256, state.deviceKeySha256);
      if (index > 0 && index < statuses.length - 1) equal(status.event, 'heartbeat');
    }
    equal(state.localState, 'completed');

    const outputDocx = readdirSync(outputDirectory)
      .filter((name) => name.toLowerCase().endsWith('.docx'))
      .map((name) => join(outputDirectory, name));
    equal(outputDocx.length, 1, 'Expected exactly one output DOCX.');
    const outputPath = outputDocx[0];
    const completedStatus = statuses.at(-1);
    ok(completedStatus);
    const runnerEvidence = verifyCompletedRunnerEvidence({
      completedStatus,
      expectedJobId: jobId,
      outputPath,
      reportPath: runnerReportPath,
    });
    const {
      outputBytes,
      outputSha256,
      reportBytes: runnerReportBytes,
      report: runnerReport,
    } = runnerEvidence;

    const qaReportPath = join(qaDirectory, 'golden_report.json');
    const qaLogPath = join(logDirectory, 'qa.log');
    const qaCode = [
      'from pathlib import Path',
      'import json, os, sys, uuid',
      'from word_replica.qa.golden_audit import audit_docx_pair',
      'from word_replica.qa.preservation import G10_GATE_NAMES',
      'from word_replica.qa.word_render import detect_open_and_repair, check_fields_update_equality',
      'target, output, qa_dir, report_path, run_id, target_sha, commit_sha = sys.argv[1:8]',
      'report = audit_docx_pair(Path(target), Path(output), Path(qa_dir), run_id=run_id, source_sha256=target_sha, commit_sha=commit_sha, reconstruction_status="completed", gate_names=G10_GATE_NAMES, custom_properties_dropped_by_policy=True, application_properties_rewritten_by_policy=True)',
      'report["open_and_repair"] = detect_open_and_repair(Path(output))',
      'report["visible_text_equal"] = report.get("gates", {}).get("G0")',
      'report["fields_update_equal"] = check_fields_update_equality(Path(output))',
      'report["full_pass"] = bool(report.get("full_pass") and report["open_and_repair"] is False and report["visible_text_equal"] is True and report["fields_update_equal"] is True)',
      'temporary = report_path + "." + str(uuid.uuid4()) + ".tmp"',
      'Path(temporary).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")',
      'os.replace(temporary, report_path)',
    ].join('\n');
    const qa = runCaptured(WORDREPLICA_PYTHON, [
      '-c',
      qaCode,
      signedTargetPath,
      outputPath,
      qaDirectory,
      qaReportPath,
      runId,
      signedTargetSha256,
      wordReplicaRepository.head,
    ], {
      cwd: WORDREPLICA_ROOT,
      logPath: qaLogPath,
      timeoutMs: 20 * 60 * 1000,
    });
    equal(qa.status, 0, `Golden QA failed; see ${qaLogPath}`);
    ok(existsSync(qaReportPath), 'golden_report.json is absent.');
    const qaReport = JSON.parse(readFileSync(qaReportPath, 'utf8')) as Record<string, unknown>;
    deepStrictEqual(qaReport.required_gates, GOLDEN_GATES);
    const gateResults = qaReport.gates as Record<string, unknown>;
    for (const gate of GOLDEN_GATES) equal(gateResults[gate], true, `${gate} did not pass.`);
    equal(qaReport.open_and_repair, false);
    equal(qaReport.visible_text_equal, true);
    equal(qaReport.fields_update_equal, true);
    equal(qaReport.full_pass, true);
    const wordPidsAfterQa = wordPids();
    assertProcessSetUnchanged(wordPidsBefore, wordPidsAfterQa, 'golden QA');

    const artifactBytes = readFileSync(builtExecutable);
    const productionPreflight = buildUnsignedProductionPreflightInputs({
      fileName: basename(builtExecutable),
      artifactSha256: sha256(artifactBytes),
      artifactSizeBytes: artifactBytes.byteLength,
      contractKeyId: keyId,
      contractPublicKeySha256: sha256(signerPublicSpki),
      contractPrivateKeyPkcs8Base64Url: privateKeyBase64Url,
      sourceCommit: wordReplicaRepository.head,
    });
    const productionManifestPath = join(artifactDirectory, 'lekta-repair-runner-manifest.json');
    writeJsonAtomic(productionManifestPath, productionPreflight.manifest);
    const preflightLogPath = join(logDirectory, 'production-preflight.log');
    const preflight = runCaptured(process.execPath, [
      join(LEKTA_ROOT, 'scripts', 'run-local-repair-release.mts'),
      '--artifact',
      builtExecutable,
      '--manifest',
      productionManifestPath,
    ], {
      cwd: LEKTA_ROOT,
      logPath: preflightLogPath,
      timeoutMs: 2 * 60 * 1000,
      environment: { ...CHILD_ENVIRONMENT, ...productionPreflight.environment },
      sensitiveValues: activeFailureContext.sensitiveValues,
    });
    ok(preflight.status !== 0, 'Production preflight unexpectedly accepted the unsigned dev artifact.');
    const preflightOutput = `${preflight.stdout ?? ''}${preflight.stderr ?? ''}`;
    match(preflightOutput, /Authenticode status nije Valid\./);

    assertFileIdentity(SOURCE_PATH, SOURCE_SHA256, SOURCE_SIZE);
    assertFileIdentity(TARGET_PATH, TARGET_SHA256, TARGET_SIZE);
    const wordPidsAfter = wordPids();
    assertProcessSetUnchanged(wordPidsBefore, wordPidsAfter, 'complete E2E');
    const lektaRepositoryAfter = readRepositoryEvidence(LEKTA_ROOT, LEKTA_BRANCH);
    const wordReplicaRepositoryAfter = readRepositoryEvidence(WORDREPLICA_ROOT, WORDREPLICA_BRANCH);
    equal(lektaRepositoryAfter.head, lektaRepository.head);
    equal(lektaRepositoryAfter.status, lektaRepository.status);
    equal(lektaRepositoryAfter.contentSha256, lektaRepository.contentSha256);
    equal(wordReplicaRepositoryAfter.head, wordReplicaRepository.head);
    equal(wordReplicaRepositoryAfter.status, wordReplicaRepository.status);
    equal(wordReplicaRepositoryAfter.contentSha256, wordReplicaRepository.contentSha256);

    for (const logPath of [fieldStabilityLogPath, buildLogPath, runnerLogPath, qaLogPath, preflightLogPath]) {
      const logText = readFileSync(logPath, 'utf8');
      ok(!logText.includes(privateKeyBase64Url), `${basename(logPath)} leaked the private key.`);
      ok(!logText.includes(issued.launch.claimToken), `${basename(logPath)} leaked the claim token.`);
    }

    const summaryPath = join(diagnosticsDirectory, 'e2e-summary.json');
    writeJsonAtomic(summaryPath, {
      status: 'passed',
      runId,
      diagnosticsDirectory,
      jobId,
      userId,
      slotId,
      keyMaterial: { publicKeyPath, trustStorePath, keyId, privateKeyPersisted: false },
      build: {
        script: join(WORDREPLICA_ROOT, 'BUILD_LEKTA_REPAIR_RUNNER_DEV.ps1'),
        executable: builtExecutable,
        manifest: developmentManifestPath,
        authenticodeStatus: developmentManifest.authenticodeStatus,
      },
      runner: {
        artifact: builtExecutable,
        transientTokenizedArtifactPersisted: false,
        exitCode: runnerExit.code,
        log: runnerLogPath,
        report: runnerReportPath,
        reportSha256: sha256(runnerReportBytes),
        reportFullPass: runnerReport.full_pass,
      },
      claim: { httpRequests: claimHttpRequests, atomicAttempts: claimAtomicAttempts, validClaims },
      statusEvents: statuses,
      immutableInputs: {
        source: { path: SOURCE_PATH, sha256: SOURCE_SHA256, size: SOURCE_SIZE },
        target: { path: TARGET_PATH, sha256: TARGET_SHA256, size: TARGET_SIZE },
      },
      output: { path: outputPath, sha256: outputSha256, size: outputBytes.byteLength },
      qa: { report: qaReportPath, fullPass: qaReport.full_pass },
      wordPids: { before: wordPidsBefore, afterRunner: wordPidsAfterRunner, afterQa: wordPidsAfterQa, after: wordPidsAfter },
      productionPreflight: { rejected: true, reason: 'Authenticode status nije Valid.', log: preflightLogPath },
      git: {
        lekta: {
          branch: lektaRepository.branch,
          head: lektaRepository.head,
          beforeContentSha256: lektaRepository.contentSha256,
          afterContentSha256: lektaRepositoryAfter.contentSha256,
        },
        wordReplica: {
          branch: wordReplicaRepository.branch,
          head: wordReplicaRepository.head,
          beforeContentSha256: wordReplicaRepository.contentSha256,
          afterContentSha256: wordReplicaRepositoryAfter.contentSha256,
        },
      },
    });
    assertSensitiveValuesAbsentFromDiagnostics(diagnosticsDirectory, [
      privateKeyBase64Url,
      issued.launch.claimToken,
    ]);
    process.stdout.write(`E2E summary: ${summaryPath}\nGolden report: ${qaReportPath}\n`);
  } finally {
    await new Promise<void>((resolvePromise, reject) => {
      server.close((error) => error ? reject(error) : resolvePromise());
    });
  }
  } finally {
    singleRunLock.release();
  }
}

try {
  await main();
} catch (error) {
  if (activeFailureContext) {
    let repositoriesAfter: unknown;
    try {
      repositoriesAfter = {
        lekta: captureRepositoryEvidence(LEKTA_ROOT),
        wordReplica: captureRepositoryEvidence(WORDREPLICA_ROOT),
      };
    } catch (captureError) {
      repositoriesAfter = {
        captureError: captureError instanceof Error
          ? captureError.message
          : String(captureError),
      };
    }
    persistE2EFailure(
      activeFailureContext.diagnosticsDirectory,
      error,
      activeFailureContext.sensitiveValues,
      {
        repositories: {
          before: activeFailureContext.repositoriesBefore,
          after: repositoriesAfter,
        },
      },
    );
  }
  throw error;
}
