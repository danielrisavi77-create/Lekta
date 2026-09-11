import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export const E2E_FAILURE_FILE = 'e2e-failure.json';
export const E2E_FAILURE_LOG = 'e2e-failure.log';
export const E2E_RUNNER_REPORT_FILE = 'lekta-repair-runner-report.json';
const CHILD_DIAGNOSTIC_LIMIT = 64 * 1024;
const RUNNER_REPORT_LIMIT = 1024 * 1024;
const UNAVAILABLE_CHILD_DIAGNOSTIC = 'development runner diagnostic unavailable';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CHILD_ENVIRONMENT_ALLOWLIST = [
  'ALLUSERSPROFILE',
  'APPDATA',
  'COMMONPROGRAMFILES',
  'COMMONPROGRAMFILES(X86)',
  'COMMONPROGRAMW6432',
  'COMSPEC',
  'HOMEDRIVE',
  'HOMEPATH',
  'LOCALAPPDATA',
  'NUMBER_OF_PROCESSORS',
  'OS',
  'PATH',
  'PATHEXT',
  'PROCESSOR_ARCHITECTURE',
  'PROCESSOR_IDENTIFIER',
  'PROCESSOR_LEVEL',
  'PROCESSOR_REVISION',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'PROGRAMW6432',
  'PUBLIC',
  'SYSTEMDRIVE',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERDOMAIN',
  'USERNAME',
  'USERPROFILE',
  'WINDIR',
] as const;

export interface WorkingTreeSnapshot {
  head: string;
  trackedDiff: Uint8Array;
  untrackedFiles: ReadonlyArray<{ path: string; bytes: Uint8Array }>;
}

export interface CompletedRunnerEvidenceInput {
  completedStatus: {
    event: string;
    outputSha256: string | null;
    reportSha256: string | null;
  };
  expectedJobId: string;
  outputPath: string;
  reportPath: string;
}

export interface CompletedRunnerEvidence {
  outputBytes: Uint8Array;
  outputSha256: string;
  reportBytes: Uint8Array;
  report: Record<string, unknown>;
}

export interface TransientTokenizedRunner {
  path: string;
  dispose: () => void;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function parseJsonText(text: string): unknown {
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}
export function assertProcessSetUnchanged(
  before: readonly number[],
  after: readonly number[],
  phase: string,
): void {
  const normalize = (values: readonly number[]) => [...new Set(values)]
    .sort((left, right) => left - right);
  const expected = normalize(before);
  const actual = normalize(after);
  if (expected.length !== actual.length || expected.some((pid, index) => pid !== actual[index])) {
    throw new Error(`WINWORD process set changed during ${phase}: before=${expected.join(',')} after=${actual.join(',')}`);
  }
}


export function buildUnsignedProductionPreflightInputs(
  input: {
    fileName: string;
    artifactSha256: string;
    artifactSizeBytes: number;
    contractKeyId: string;
    contractPublicKeySha256: string;
    contractPrivateKeyPkcs8Base64Url: string;
    sourceCommit: string;
  },
): { manifest: Record<string, unknown>; environment: NodeJS.ProcessEnv } {
  const privateBytes = Buffer.from(input.contractPrivateKeyPkcs8Base64Url, 'base64url');
  const canonicalPrivateKey = privateBytes.length > 0
    && privateBytes.toString('base64url') === input.contractPrivateKeyPkcs8Base64Url;
  if (input.fileName !== basename(input.fileName)
    || !/^[a-f0-9]{64}$/.test(input.artifactSha256)
    || !Number.isSafeInteger(input.artifactSizeBytes) || input.artifactSizeBytes <= 0
    || !/^[A-Za-z0-9._-]{1,80}$/.test(input.contractKeyId)
    || !/^[a-f0-9]{64}$/.test(input.contractPublicKeySha256)
    || !canonicalPrivateKey
    || !/^[a-f0-9]{40}$/.test(input.sourceCommit)) {
    throw new Error('Unsigned production preflight inputs are invalid.');
  }
  const signingCertificateThumbprint = '0'.repeat(40);
  return {
    manifest: {
      schemaVersion: 2,
      fileName: input.fileName,
      sha256: input.artifactSha256,
      sizeBytes: input.artifactSizeBytes,
      contractKeyId: input.contractKeyId,
      contractPublicKeySha256: input.contractPublicKeySha256,
      signingCertificateThumbprint,
      timestampServer: 'https://timestamp.example.invalid',
      engineVersion: '0.1.0',
      sourceCommit: input.sourceCommit,
      sourceBranch: 'automation-dev',
      sourceTreeClean: true,
    },
    environment: {
      LEKTA_REPAIR_EXPECTED_PUBLISHER_THUMBPRINT: signingCertificateThumbprint,
      LEKTA_REPAIR_EXPECTED_CONTRACT_KEY_ID: input.contractKeyId,
      LEKTA_REPAIR_EXPECTED_CONTRACT_PUBLIC_KEY_SHA256: input.contractPublicKeySha256,
      LEKTA_REPAIR_REVIEWED_WORDREPLICA_COMMIT: input.sourceCommit,
      LEKTA_REPAIR_REVIEWED_ARTIFACT_SHA256: input.artifactSha256,
      LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL:
        input.contractPrivateKeyPkcs8Base64Url,
    },
  };
}

function redact(value: string, sensitiveValues: readonly string[]): string {
  return sensitiveValues.reduce(
    (redacted, secret) => secret ? redacted.split(secret).join('[REDACTED]') : redacted,
    value,
  );
}

function hasCode(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException).code === code;
}

function unlinkIfPresent(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error;
  }
}

export function publishJsonExclusiveAtomic(path: string, value: unknown): boolean {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) throw new TypeError('E2E JSON value is not serializable.');
  const bytes = Buffer.from(`${serialized}\n`, 'utf8');
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`,
  );
  let descriptor: number | null = null;

  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    try {
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      const openDescriptor = descriptor;
      descriptor = null;
      closeSync(openDescriptor);
    }

    try {
      linkSync(temporary, path);
      return true;
    } catch (error) {
      if (hasCode(error, 'EEXIST')) return false;
      throw error;
    }
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    unlinkIfPresent(temporary);
  }
}

export function writeE2ELog(
  path: string,
  text: string,
  sensitiveValues: readonly string[],
): void {
  writeFileSync(path, redact(text, sensitiveValues), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
}

export function readE2EChildFailure(
  path: string,
  sensitiveValues: readonly string[] = [],
): string {
  try {
    if (!existsSync(path) || statSync(path).size > CHILD_DIAGNOSTIC_LIMIT) {
      return UNAVAILABLE_CHILD_DIAGNOSTIC;
    }
    const value = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as {
      error?: { type?: unknown; message?: unknown; traceback?: unknown };
    };
    if (!value || typeof value !== 'object' || !value.error || typeof value.error !== 'object') {
      return UNAVAILABLE_CHILD_DIAGNOSTIC;
    }
    const type = typeof value.error.type === 'string' ? value.error.type : 'Error';
    const message = typeof value.error.message === 'string'
      ? value.error.message
      : '(no message)';
    const traceback = typeof value.error.traceback === 'string'
      ? value.error.traceback
      : '';
    return redact(
      `${type}: ${message}${traceback ? `\n${traceback}` : ''}`,
      sensitiveValues,
    ).slice(0, 8 * 1024);
  } catch {
    return UNAVAILABLE_CHILD_DIAGNOSTIC;
  }
}

export function buildE2EChildEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const sourceByCanonicalName = new Map<string, string>();
  for (const [name, value] of Object.entries(source)) {
    if (typeof value === 'string') sourceByCanonicalName.set(name.toUpperCase(), value);
  }
  const environment: NodeJS.ProcessEnv = {};
  for (const name of CHILD_ENVIRONMENT_ALLOWLIST) {
    const value = sourceByCanonicalName.get(name);
    if (value !== undefined) environment[name] = value;
  }
  environment.PYTHONIOENCODING = 'utf-8';
  environment.PYTHONUTF8 = '1';
  return environment;
}

function updateDigestFrame(
  digest: ReturnType<typeof createHash>,
  label: string,
  bytes: Uint8Array,
): void {
  const labelBytes = Buffer.from(label, 'utf8');
  const size = Buffer.allocUnsafe(8);
  size.writeBigUInt64BE(BigInt(bytes.byteLength));
  digest.update(labelBytes);
  digest.update(Buffer.from([0]));
  digest.update(size);
  digest.update(bytes);
}

export function digestWorkingTreeSnapshot(snapshot: WorkingTreeSnapshot): string {
  if (!/^[a-f0-9]{40}$/i.test(snapshot.head)) {
    throw new Error('Working-tree snapshot HEAD is invalid.');
  }
  const digest = createHash('sha256');
  digest.update('lekta-e2e-working-tree-v1\0', 'utf8');
  updateDigestFrame(digest, 'head', Buffer.from(snapshot.head.toLowerCase(), 'ascii'));
  updateDigestFrame(digest, 'tracked-diff', snapshot.trackedDiff);
  const untrackedFiles = snapshot.untrackedFiles
    .map((entry) => ({
      path: entry.path.replaceAll('\\', '/'),
      bytes: entry.bytes,
    }))
    .sort((left, right) => Buffer.compare(
      Buffer.from(left.path, 'utf8'),
      Buffer.from(right.path, 'utf8'),
    ));

  for (const [index, entry] of untrackedFiles.entries()) {
    if (!entry.path || entry.path.startsWith('/') || entry.path.includes('/../')) {
      throw new Error(`Working-tree snapshot path is invalid: ${entry.path}`);
    }
    if (index > 0 && untrackedFiles[index - 1].path === entry.path) {
      throw new Error(`Working-tree snapshot path is duplicated: ${entry.path}`);
    }
    updateDigestFrame(digest, 'untracked-path', Buffer.from(entry.path, 'utf8'));
    updateDigestFrame(digest, 'untracked-content', entry.bytes);
  }
  return digest.digest('hex');
}

function dataObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function verifyPersistedRunnerReport(
  path: string,
  expectedSha256: string,
): { bytes: Uint8Array; report: Record<string, unknown> } {
  if (!SHA256_PATTERN.test(expectedSha256)) {
    throw new Error('Signed reportSha256 is absent or invalid.');
  }
  if (!existsSync(path)) {
    throw new Error(
      `WordReplica development runner must persist the exact compact sorted UTF-8 completion report bytes at ${path}.`,
    );
  }
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.size <= 0 || metadata.size > RUNNER_REPORT_LIMIT) {
    throw new Error('Persisted WordReplica runner report is not a bounded regular file.');
  }
  const bytes = readFileSync(path);
  if (sha256(bytes) !== expectedSha256) {
    throw new Error(
      'Signed reportSha256 does not match the exact persisted WordReplica report bytes.',
    );
  }
  const report = parseJsonText(bytes.toString('utf8'));
  if (!dataObject(report)) {
    throw new Error('Persisted WordReplica runner report must be a JSON object.');
  }
  return { bytes: new Uint8Array(bytes), report };
}

export function verifyCompletedRunnerEvidence(
  input: CompletedRunnerEvidenceInput,
): CompletedRunnerEvidence {
  const { completedStatus } = input;
  if (completedStatus.event !== 'completed'
    || !completedStatus.outputSha256
    || !SHA256_PATTERN.test(completedStatus.outputSha256)
    || !completedStatus.reportSha256
    || !SHA256_PATTERN.test(completedStatus.reportSha256)) {
    throw new Error('Runner completion status lacks signed output/report hashes.');
  }
  const outputBytes = readFileSync(input.outputPath);
  const outputSha256 = sha256(outputBytes);
  if (outputSha256 !== completedStatus.outputSha256) {
    throw new Error('Signed outputSha256 does not match the persisted output bytes.');
  }
  const persisted = verifyPersistedRunnerReport(
    input.reportPath,
    completedStatus.reportSha256,
  );
  if (persisted.report.job_id !== input.expectedJobId) {
    throw new Error('Persisted WordReplica runner report is bound to another job.');
  }
  if (persisted.report.output_sha256 !== outputSha256) {
    throw new Error('Persisted WordReplica runner report is bound to another output.');
  }
  if (persisted.report.status !== 'FULL_PASS' || persisted.report.full_pass !== true) {
    throw new Error('Persisted WordReplica runner report is not a full pass.');
  }
  return {
    outputBytes: new Uint8Array(outputBytes),
    outputSha256,
    reportBytes: persisted.bytes,
    report: persisted.report,
  };
}

export function createTransientTokenizedRunner(
  sourcePath: string,
  jobId: string,
  claimToken: string,
  temporaryRoot: string = tmpdir(),
): TransientTokenizedRunner {
  const root = resolve(temporaryRoot);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(root, 'lekta-repair-runner-'));
  chmodSync(directory, 0o700);
  if (dirname(directory) !== root || !basename(directory).startsWith('lekta-repair-runner-')) {
    throw new Error('Transient runner directory escaped its restricted root.');
  }
  const path = join(directory, `LektaRepair-${jobId}-${claimToken}.exe`);
  try {
    copyFileSync(sourcePath, path, constants.COPYFILE_EXCL);
    chmodSync(path, 0o600);
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  let disposed = false;
  return {
    path,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (dirname(directory) !== root || !basename(directory).startsWith('lekta-repair-runner-')) {
        throw new Error('Refusing to remove an unexpected transient runner directory.');
      }
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function details(error: unknown, sensitiveValues: readonly string[]) {
  const name = error instanceof Error ? error.name : 'NonErrorThrown';
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return {
    name: redact(name, sensitiveValues),
    message: redact(message, sensitiveValues),
    ...(stack ? { stack: redact(stack, sensitiveValues).slice(0, 4000) } : {}),
  };
}

function redactJsonValue(value: unknown, sensitiveValues: readonly string[]): unknown {
  if (typeof value === 'string') return redact(value, sensitiveValues);
  if (Array.isArray(value)) {
    return value.map((entry) => redactJsonValue(entry, sensitiveValues));
  }
  if (dataObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        redact(key, sensitiveValues),
        redactJsonValue(entry, sensitiveValues),
      ]),
    );
  }
  return value;
}

export function persistE2EFailure(
  diagnosticsDirectory: string,
  error: unknown,
  sensitiveValues: readonly string[],
  evidence?: unknown,
): void {
  const failure = details(error, sensitiveValues);
  try {
    const published = publishJsonExclusiveAtomic(
      join(diagnosticsDirectory, E2E_FAILURE_FILE),
      {
        status: 'failed',
        error: failure,
        ...(evidence === undefined
          ? {}
          : { evidence: redactJsonValue(evidence, sensitiveValues) }),
      },
    );
    if (!published) return;
  } catch {
    return;
  }
  try {
    writeE2ELog(
      join(diagnosticsDirectory, E2E_FAILURE_LOG),
      `${failure.name}: ${failure.message}\n`,
      [],
    );
  } catch {
    // The JSON record is authoritative; never mask the original failure.
  }
}
