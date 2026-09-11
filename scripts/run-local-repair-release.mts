import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  EXPECTED_SUPABASE_PROJECT_REF,
  buildLocalRepairDeploymentPlan,
  verifyRemoteRepairDocxBaseline,
  type RemoteRepairDocxEvidence,
  verifyLocalRepairRelease,
  type AuthenticodeEvidence,
} from './local-repair-release-gate.mts';

import {
  assertNetlifyReleaseSecrets,
  buildRunnerDeploymentEnvironment,
  selectNetlifyReleaseAuthorization,
  stageVerifiedRunnerArtifact,
} from './local-repair-runner-publish.mts';
import {
  executeLocalRepairMigrationWorkspace,
} from './local-repair-migration-workspace.mts';
import {
  buildLocalRepairSecretChildEnvironment,
  stageLocalRepairSecrets,
} from './local-repair-secret-staging.mts';
export { assertNetlifyReleaseSecrets, buildRunnerDeploymentEnvironment, stageVerifiedRunnerArtifact };
export {
  applyLocalRepairMigrationWorkspacePlan,
  executeLocalRepairMigrationWorkspace,
  parseAndVerifyLocalRepairMigrationDryRun,
  planLocalRepairMigrationWorkspace,
  readFetchedMigrationEvidence,
  withTemporaryLocalRepairMigrationWorkspace,
} from './local-repair-migration-workspace.mts';

interface ReleaseSecretsEvidence {
  accessTokenPresent: true;
  databasePasswordPresent: true;
}

interface CliOptions {
  artifactPath: string;
  manifestPath: string;
  migrationsDirectory: string;
  execute: boolean;
}

export interface LocalRepairReleaseTrustPolicy {
  expectedPublisherThumbprint: string;
  expectedContractKeyId: string;
  expectedContractPublicKeySha256: string;
  reviewedSourceCommit: string;
  reviewedArtifactSha256: string;
}

export interface LocalRepairContractSigningSecret {
  privateKeyPkcs8Base64Url: string;
}

function requiredEnvironmentValue(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Preflight zahtijeva ${name}.`);
  return value;
}

export function readLocalRepairReleaseTrustPolicy(
  env: Record<string, string | undefined> = process.env,
): LocalRepairReleaseTrustPolicy {
  return {
    expectedPublisherThumbprint: requiredEnvironmentValue(
      env,
      'LEKTA_REPAIR_EXPECTED_PUBLISHER_THUMBPRINT',
    ).replace(/\s+/g, '').toUpperCase(),
    expectedContractKeyId: requiredEnvironmentValue(
      env,
      'LEKTA_REPAIR_EXPECTED_CONTRACT_KEY_ID',
    ),
    expectedContractPublicKeySha256: requiredEnvironmentValue(
      env,
      'LEKTA_REPAIR_EXPECTED_CONTRACT_PUBLIC_KEY_SHA256',
    ).toLowerCase(),
    reviewedSourceCommit: requiredEnvironmentValue(
      env,
      'LEKTA_REPAIR_REVIEWED_WORDREPLICA_COMMIT',
    ).toLowerCase(),
    reviewedArtifactSha256: requiredEnvironmentValue(
      env,
      'LEKTA_REPAIR_REVIEWED_ARTIFACT_SHA256',
    ).toLowerCase(),
  };
}

export function readLocalRepairContractSigningSecret(
  env: Record<string, string | undefined> = process.env,
): LocalRepairContractSigningSecret {
  return {
    privateKeyPkcs8Base64Url: requiredEnvironmentValue(
      env,
      'LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL',
    ),
  };
}

export function buildLocalRepairChildEnvironment(
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return buildLocalRepairSecretChildEnvironment(source);
}

export function assertLocalRepairReleaseSecrets(
  env: Record<string, string | undefined>,
): ReleaseSecretsEvidence {
  if (!env.SUPABASE_ACCESS_TOKEN?.trim()) {
    throw new Error('Execute mode zahtijeva SUPABASE_ACCESS_TOKEN.');
  }
  if (!env.SUPABASE_DB_PASSWORD?.trim()) {
    throw new Error('Execute mode zahtijeva SUPABASE_DB_PASSWORD.');
  }
  return { accessTokenPresent: true, databasePasswordPresent: true };
}

export function parseAndVerifyRemoteRepairDocxBaseline(
  raw: string,
): RemoteRepairDocxEvidence {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Supabase functions list nije vratio valjan JSON.');
  }
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      && Array.isArray((value as { functions?: unknown }).functions)
      ? (value as { functions: unknown[] }).functions
      : [];
  const candidate = rows.find((entry) => entry && typeof entry === 'object'
    && (entry as { slug?: unknown }).slug === 'repair-docx');
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Supabase functions list nema repair-docx funkciju.');
  }
  const record = candidate as Record<string, unknown>;
  return verifyRemoteRepairDocxBaseline({
    slug: String(record.slug || ''),
    status: String(record.status || ''),
    ezbrSha256: String(record.ezbr_sha256 || record.ezbrSha256 || ''),
  });
}

function requiredValue(args: string[], name: string, envValue?: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : envValue;
  if (!value?.trim() || value.startsWith('--')) {
    throw new Error(`Nedostaje ${name}.`);
  }
  return resolve(value);
}

export function parseLocalRepairReleaseArgs(
  args: string[],
  env: Record<string, string | undefined> = process.env,
): CliOptions {
  const artifactPath = requiredValue(args, '--artifact', env.LEKTA_REPAIR_RUNNER_ARTIFACT);
  const manifestIndex = args.indexOf('--manifest');
  const manifestPath = manifestIndex >= 0
    ? requiredValue(args, '--manifest')
    : resolve(env.LEKTA_REPAIR_RUNNER_MANIFEST
      || join(dirname(artifactPath), 'lekta-repair-runner-manifest.json'));
  const migrationsIndex = args.indexOf('--migrations');
  const migrationsDirectory = migrationsIndex >= 0
    ? requiredValue(args, '--migrations')
    : resolve('supabase', 'migrations');
  return {
    artifactPath,
    manifestPath,
    migrationsDirectory,
    execute: args.includes('--execute'),
  };
}

export function readAuthenticodeEvidence(artifactPath: string): AuthenticodeEvidence {
  if (!existsSync(artifactPath)) {
    throw new Error(`Runner artefakt ne postoji: ${artifactPath}`);
  }
  const script = [
    "$signature = Get-AuthenticodeSignature -LiteralPath $env:LEKTA_RUNNER_ARTIFACT",
    "$thumbprint = if ($null -ne $signature.SignerCertificate) { [string]$signature.SignerCertificate.Thumbprint } else { '' }",
    "$result = [ordered]@{ status = [string]$signature.Status; signerThumbprint = $thumbprint }",
    '$result | ConvertTo-Json -Compress',
  ].join('; ');
  const completed = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', script,
  ], {
    encoding: 'utf8',
    env: buildLocalRepairChildEnvironment({
      ...process.env,
      LEKTA_RUNNER_ARTIFACT: resolve(artifactPath),
    }),
    windowsHide: true,
  });
  if (completed.error) {
    throw new Error(`Authenticode provjera nije uspjela: ${completed.error.message}`);
  }
  if (completed.status !== 0) {
    const stderr = typeof completed.stderr === 'string' ? completed.stderr.trim() : '';
    throw new Error(`Authenticode provjera nije uspjela${stderr ? `: ${stderr}` : '.'}`);
  }
  try {
    return JSON.parse(completed.stdout.trim()) as AuthenticodeEvidence;
  } catch {
    throw new Error('Authenticode provjera nije vratila valjan JSON.');
  }
}

function executableFor(command: string, root: string): string {
  if (command === 'supabase') return join(root, 'node_modules', '.bin', 'supabase.cmd');
  if (command === 'netlify') return join(root, 'node_modules', '.bin', 'netlify.cmd');
  if (command === 'npm') return process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (command === 'node') return process.execPath;
  throw new Error(`Nepodrzana release naredba: ${command}`);
}

function readAndVerifyRemoteRepairDocxBaseline(root: string, childEnv: NodeJS.ProcessEnv): RemoteRepairDocxEvidence {
  const completed = spawnSync(executableFor('supabase', root), [
    'functions', 'list',
    '--project-ref', EXPECTED_SUPABASE_PROJECT_REF,
    '--output-format', 'json',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: buildLocalRepairChildEnvironment(childEnv),
    windowsHide: true,
  });
  if (completed.status !== 0) {
    throw new Error('Nije moguce provjeriti produkcijski repair-docx baseline.');
  }
  return parseAndVerifyRemoteRepairDocxBaseline(completed.stdout);
}

function runReleaseCommand(parts: string[], root: string, env: NodeJS.ProcessEnv): void {
  const [command, ...args] = parts;
  const executable = executableFor(command, root);
  const completed = spawnSync(executable, args, {
    cwd: root,
    env: buildLocalRepairChildEnvironment(env),
    stdio: 'inherit',
    windowsHide: true,
  });
  if (completed.status !== 0) {
    throw new Error(`Release naredba nije uspjela: ${command} ${args.join(' ')}`);
  }
}

function runReleaseCommandCaptured(
  parts: string[],
  root: string,
  env: NodeJS.ProcessEnv,
): string {
  const [command, ...args] = parts;
  const completed = spawnSync(executableFor(command, root), args, {
    cwd: root,
    env: buildLocalRepairChildEnvironment({ ...env, NO_COLOR: '1' }),
    encoding: 'utf8',
    windowsHide: true,
  });
  if (completed.stdout) process.stdout.write(completed.stdout);
  if (completed.stderr) process.stderr.write(completed.stderr);
  if (completed.status !== 0) {
    throw new Error(`Release naredba nije uspjela: ${command} ${args.join(' ')}`);
  }
  return completed.stdout || '';
}

function assertLinkedProject(root: string): void {
  const path = join(root, 'supabase', '.temp', 'project-ref');
  if (!existsSync(path)) throw new Error('Supabase CLI nije zapisao project-ref nakon linka.');
  const linked = readFileSync(path, 'utf8').trim();
  if (linked !== EXPECTED_SUPABASE_PROJECT_REF) {
    throw new Error(`Supabase CLI je povezan na pogresan projekt: ${linked || '(prazno)'}.`);
  }
}

function readNetlifyLinkedStatus(root: string, childEnv: NodeJS.ProcessEnv): unknown {
  const completed = spawnSync(executableFor('netlify', root), ['status', '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: buildLocalRepairChildEnvironment(childEnv),
    windowsHide: true,
  });
  if (completed.status !== 0) {
    throw new Error('Netlify globalna prijava ili povezani Lekta site nisu dostupni.');
  }
  try {
    return JSON.parse(completed.stdout);
  } catch {
    throw new Error('Netlify status nije vratio valjan JSON.');
  }
}

export interface LocalRepairDeploymentInput {
  root?: string;
  artifactPath: string;
  artifactSha256: string;
  publicUrl: string;
  contractKeyId: string;
  contractPrivateKeyPkcs8Base64Url: string;
}

export type LocalRepairSecretPhase =
  | 'guard-disabled'
  | 'disabled-config'
  | 'enabled-guarded'
  | 'activate';

const LOCAL_REPAIR_SECRET_PHASES = new Set<LocalRepairSecretPhase>([
  'guard-disabled',
  'disabled-config',
  'enabled-guarded',
  'activate',
]);

function isLocalRepairSecretPhase(value: string): value is LocalRepairSecretPhase {
  return LOCAL_REPAIR_SECRET_PHASES.has(value as LocalRepairSecretPhase);
}

function secretValuesForPhase(
  phase: LocalRepairSecretPhase,
  input: LocalRepairDeploymentInput,
): Readonly<Record<string, string>> {
  if (phase === 'guard-disabled') return { REPAIR_LOCAL_DISABLED: 'true' };
  if (phase === 'disabled-config') {
    return {
      REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL: input.contractPrivateKeyPkcs8Base64Url,
      REPAIR_CONTRACT_KEY_ID: input.contractKeyId,
      REPAIR_LOCAL_ENABLED: 'false',
      REPAIR_LOCAL_DISABLED: 'true',
    };
  }
  if (phase === 'enabled-guarded') {
    return {
      REPAIR_LOCAL_ENABLED: 'true',
      REPAIR_LOCAL_DISABLED: 'true',
    };
  }
  if (phase === 'activate') return { REPAIR_LOCAL_DISABLED: 'false' };
  throw new Error(`Nepoznata local-repair secret faza: ${phase}`);
}

export interface LocalRepairDeploymentExecutor {
  runCommand(command: readonly string[]): void;
  assertLinkedProject(): void;
  stageRunner(): void;
  deployMigrations(): void;
  stageSecrets(phase: LocalRepairSecretPhase, secretNames: readonly string[]): void;
}

export function executeLocalRepairDeploymentPlan(
  plan: readonly (readonly string[])[],
  executor: LocalRepairDeploymentExecutor,
): void {
  const canonicalPlan = buildLocalRepairDeploymentPlan();
  if (JSON.stringify(plan) !== JSON.stringify(canonicalPlan)) {
    throw new Error('Local-repair disabled-first plan nije kanonski; izvrsenje je odbijeno.');
  }

  let staged = false;
  let verifiedDist = false;
  for (const command of plan) {
    const isDistVerification = command[0] === 'node'
      && command[1] === 'scripts/verify-deploy-dist.mjs';
    if (isDistVerification && !staged) {
      throw new Error('Zavrsna dist provjera odbijena jer runner nije spremljen u dist.');
    }
    if (
      command[0] === 'netlify'
      && command[1] === 'deploy'
      && (!staged || !verifiedDist)
    ) {
      throw new Error('Netlify deploy odbijen jer runner nije spremljen i provjeren u dist.');
    }
    if (command[0] === 'internal' && command[1] === 'stage-local-repair-secrets') {
      const phase = command[2];
      if (!isLocalRepairSecretPhase(phase)) {
        throw new Error(`Nepoznata local-repair secret faza: ${phase || '(prazno)'}`);
      }
      executor.stageSecrets(phase, command.slice(3));
      continue;
    }
    if (command[0] === 'internal' && command[1] === 'deploy-local-repair-migrations') {
      executor.deployMigrations();
      continue;
    }
    executor.runCommand(command);
    if (command[0] === 'supabase' && command[1] === 'link') {
      executor.assertLinkedProject();
    }
    if (command[0] === 'netlify' && command[1] === 'build') {
      executor.stageRunner();
      staged = true;
    }
    if (isDistVerification) verifiedDist = true;
  }
}

export function executeLocalRepairDeployment(input: LocalRepairDeploymentInput): void {
  const root = input.root || process.cwd();
  assertLocalRepairReleaseSecrets(process.env);
  const childEnv = buildLocalRepairChildEnvironment(process.env);
  readAndVerifyRemoteRepairDocxBaseline(root, childEnv);
  selectNetlifyReleaseAuthorization({
    env: process.env,
    linkedStatus: readNetlifyLinkedStatus(root, childEnv),
  });
  const releaseEnv = buildLocalRepairChildEnvironment({
    ...process.env,
    ...buildRunnerDeploymentEnvironment({
      publicUrl: input.publicUrl,
      sha256: input.artifactSha256,
    }),
  });

  executeLocalRepairDeploymentPlan(buildLocalRepairDeploymentPlan(), {
    runCommand(command) {
      runReleaseCommand([...command], root, releaseEnv);
    },
    assertLinkedProject() {
      assertLinkedProject(root);
    },
    stageRunner() {
      stageVerifiedRunnerArtifact({
        artifactPath: input.artifactPath,
        distDirectory: join(root, 'dist'),
        sha256: input.artifactSha256,
      });
    },
    deployMigrations() {
      executeLocalRepairMigrationWorkspace({
        projectRef: EXPECTED_SUPABASE_PROJECT_REF,
        localMigrationsDirectory: join(root, 'supabase', 'migrations'),
        runSupabase(args, options) {
          const parts = ['supabase', ...args];
          if (options.captureOutput) {
            return { stdout: runReleaseCommandCaptured(parts, root, releaseEnv) };
          }
          runReleaseCommand(parts, root, releaseEnv);
          return {};
        },
      });
    },
    stageSecrets(phase, secretNames) {
      const secrets = secretValuesForPhase(phase, input);
      const expectedNames = [...secretNames].sort();
      const actualNames = Object.keys(secrets).sort();
      if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
        throw new Error(`Secret plan za fazu ${phase} ne odgovara vrijednostima.`);
      }
      stageLocalRepairSecrets({
        projectRef: EXPECTED_SUPABASE_PROJECT_REF,
        secrets,
        runSupabase(args) {
          const completed = spawnSync(executableFor('supabase', root), [...args], {
            cwd: root,
            env: buildLocalRepairChildEnvironment(releaseEnv),
            encoding: 'utf8',
            windowsHide: true,
          });
          if (completed.status !== 0) {
            throw new Error(`Supabase secret faza ${phase} nije uspjela.`);
          }
        },
      });
    },
  });
}

export function mainLocalRepairRelease(args = process.argv.slice(2)): void {
  const root = process.cwd();
  const options = parseLocalRepairReleaseArgs(args);
  const trustPolicy = readLocalRepairReleaseTrustPolicy();
  const signingSecret = readLocalRepairContractSigningSecret();
  const verified = verifyLocalRepairRelease({
    artifactPath: options.artifactPath,
    manifestPath: options.manifestPath,
    migrationsDirectory: options.migrationsDirectory,
    projectRef: EXPECTED_SUPABASE_PROJECT_REF,
    authenticode: readAuthenticodeEvidence(options.artifactPath),
    contractPrivateKeyPkcs8Base64Url: signingSecret.privateKeyPkcs8Base64Url,
    ...trustPolicy,
  });

  process.stdout.write(`${JSON.stringify({ status: 'verified', ...verified }, null, 2)}\n`);
  if (options.execute) {
    executeLocalRepairDeployment({
      root,
      artifactPath: verified.artifactPath,
      artifactSha256: verified.artifactSha256,
      contractKeyId: verified.contractKeyId,
      contractPrivateKeyPkcs8Base64Url: signingSecret.privateKeyPkcs8Base64Url,
      publicUrl: process.env.LEKTA_PUBLIC_REPAIR_RUNNER_URL
        || 'https://lektahr.netlify.app/downloads/LektaRepair.exe',
    });
  }
}

const modulePath = resolve(fileURLToPath(import.meta.url));
const isDirect = process.argv
  .slice(1)
  .some((argument) => resolve(argument) === modulePath);
if (isDirect) {
  try {
    mainLocalRepairRelease();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
