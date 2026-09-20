import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface LocalRepairSecretStagingInput {
  projectRef: string;
  secrets: Readonly<Record<string, string>>;
  runSupabase: (args: readonly string[]) => void;
  temporaryRoot?: string;
}

export interface LocalRepairSecretStagingDependencies {
  hardenPath: (path: string, kind: 'directory' | 'file') => void;
  removeDirectory: (path: string) => void;
}

export function buildWindowsAclArguments(
  path: string,
  kind: 'directory' | 'file',
  currentSid: string,
): string[] {
  const grants = kind === 'directory'
    ? [
        `*${currentSid}:(OI)(CI)(F)`,
        '*S-1-5-18:(OI)(CI)(F)',
        '*S-1-5-32-544:(OI)(CI)(F)',
      ]
    : [
        `*${currentSid}:(F)`,
        '*S-1-5-18:(F)',
        '*S-1-5-32-544:(F)',
      ];
  return [path, '/inheritance:r', '/grant:r', ...grants];
}

export function redactLocalRepairSecretText(
  value: string,
  sensitiveValues: readonly string[],
): string {
  return sensitiveValues
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .reduce((redacted, secret) => redacted.split(secret).join('[REDACTED]'), value);
}

export function buildLocalRepairSecretChildEnvironment(
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const privateNames = new Set([
    'LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL',
    'REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL',
  ]);
  return Object.fromEntries(
    Object.entries(source).filter(([name]) => !privateNames.has(name.toUpperCase())),
  );
}

function hardenLocalRepairSecretPath(path: string, kind: 'directory' | 'file'): void {
  if (process.platform !== 'win32') {
    chmodSync(path, kind === 'directory' ? 0o700 : 0o600);
    return;
  }

  const whoami = spawnSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
    encoding: 'utf8',
    env: buildLocalRepairSecretChildEnvironment(process.env),
    windowsHide: true,
  });
  const currentSid = /"[^"]*","(S-\d(?:-\d+)+)"/.exec(whoami.stdout.trim())?.[1];
  if (whoami.status !== 0 || !currentSid) {
    throw new Error('Nije moguce odrediti SID trenutnog korisnika.');
  }

  const acl = spawnSync(
    'icacls.exe',
    buildWindowsAclArguments(path, kind, currentSid),
    {
      encoding: 'utf8',
      env: buildLocalRepairSecretChildEnvironment(process.env),
      windowsHide: true,
    },
  );
  if (acl.status !== 0) {
    throw new Error('Ogranicavanje ACL-a privremene secret datoteke nije uspjelo.');
  }
}

const DEFAULT_DEPENDENCIES: LocalRepairSecretStagingDependencies = {
  hardenPath: hardenLocalRepairSecretPath,
  removeDirectory(path) {
    rmSync(path, { recursive: true, force: false });
  },
};

export function stageLocalRepairSecrets(
  input: LocalRepairSecretStagingInput,
  dependencies: Partial<LocalRepairSecretStagingDependencies> = {},
): void {
  const resolved = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const entries = Object.entries(input.secrets)
    .sort(([left], [right]) => left.localeCompare(right));

  for (const [name, value] of entries) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      throw new Error('Nevaljan naziv Supabase tajne.');
    }
    if (!value || /[\r\n\0]/.test(value)) {
      throw new Error(`Nevaljana vrijednost Supabase tajne ${name}.`);
    }
  }

  const temporaryRoot = input.temporaryRoot ?? tmpdir();
  const directoryPrefix = join(temporaryRoot, 'lekta-repair-secrets-');
  let directory = '';
  let envFilePath = '';
  let failure: Error | undefined;
  const redact = (error: unknown) => redactLocalRepairSecretText(
    String(error),
    [...Object.values(input.secrets), temporaryRoot, directoryPrefix, directory, envFilePath],
  );

  try {
    directory = mkdtempSync(directoryPrefix);
    resolved.hardenPath(directory, 'directory');

    envFilePath = join(directory, `repair-secrets-${randomUUID()}.env`);
    const descriptor = openSync(envFilePath, 'wx', 0o600);
    try {
      writeFileSync(
        descriptor,
        `${entries.map(([name, value]) => `${name}=${value}`).join('\n')}\n`,
      );
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }

    resolved.hardenPath(envFilePath, 'file');
    input.runSupabase([
      'secrets',
      'set',
      '--env-file',
      envFilePath,
      '--project-ref',
      input.projectRef,
    ]);
  } catch (error) {
    failure = new Error(redact(error));
  } finally {
    if (directory) {
      try {
        resolved.removeDirectory(directory);
      } catch (error) {
        const cleanupFailure = redact(error);
        failure = new Error(failure
          ? `${failure.message}; cleanup: ${cleanupFailure}`
          : cleanupFailure);
      }
    }
  }

  if (failure) throw failure;
}
