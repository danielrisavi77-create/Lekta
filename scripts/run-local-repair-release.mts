import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  EXPECTED_SUPABASE_PROJECT_REF,
  buildLocalRepairDeploymentPlan,
  verifyLocalRepairRelease,
  type AuthenticodeEvidence,
} from './local-repair-release-gate.mts';

import {
  assertNetlifyReleaseSecrets,
  buildRunnerDeploymentEnvironment,
  selectNetlifyReleaseAuthorization,
  stageVerifiedRunnerArtifact,
} from './local-repair-runner-publish.mts';
export { assertNetlifyReleaseSecrets, buildRunnerDeploymentEnvironment, stageVerifiedRunnerArtifact };

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
    env: { ...process.env, LEKTA_RUNNER_ARTIFACT: resolve(artifactPath) },
    windowsHide: true,
  });
  if (completed.status !== 0) {
    throw new Error(`Authenticode provjera nije uspjela: ${completed.stderr.trim()}`);
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
  throw new Error(`Nepodrzana release naredba: ${command}`);
}

function runReleaseCommand(parts: string[], root: string, env: NodeJS.ProcessEnv): void {
  const [command, ...args] = parts;
  const executable = executableFor(command, root);
  const completed = spawnSync(executable, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (completed.status !== 0) {
    throw new Error(`Release naredba nije uspjela: ${command} ${args.join(' ')}`);
  }
}

function assertLinkedProject(root: string): void {
  const path = join(root, 'supabase', '.temp', 'project-ref');
  if (!existsSync(path)) throw new Error('Supabase CLI nije zapisao project-ref nakon linka.');
  const linked = readFileSync(path, 'utf8').trim();
  if (linked !== EXPECTED_SUPABASE_PROJECT_REF) {
    throw new Error(`Supabase CLI je povezan na pogresan projekt: ${linked || '(prazno)'}.`);
  }
}

function readNetlifyLinkedStatus(root: string): unknown {
  const completed = spawnSync(executableFor('netlify', root), ['status', '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
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
}

export function executeLocalRepairDeployment(input: LocalRepairDeploymentInput): void {
  const root = input.root || process.cwd();
  assertLocalRepairReleaseSecrets(process.env);
  const hasExplicitNetlifyEnv = Boolean(process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_SITE_ID);
  selectNetlifyReleaseAuthorization({
    env: process.env,
    ...(hasExplicitNetlifyEnv ? {} : { linkedStatus: readNetlifyLinkedStatus(root) }),
  });
  const releaseEnv = {
    ...process.env,
    ...buildRunnerDeploymentEnvironment({
      publicUrl: input.publicUrl,
      sha256: input.artifactSha256,
    }),
  };
  let staged = false;
  for (const command of buildLocalRepairDeploymentPlan()) {
    if (command[0] === 'netlify' && !staged) {
      throw new Error('Netlify deploy odbijen jer runner nije spremljen u dist.');
    }
    runReleaseCommand(command, root, releaseEnv);
    if (command[0] === 'supabase' && command[1] === 'link') assertLinkedProject(root);
    if (command[0] === 'npm' && command[1] === 'run') {
      stageVerifiedRunnerArtifact({
        artifactPath: input.artifactPath,
        distDirectory: join(root, 'dist'),
        sha256: input.artifactSha256,
      });
      staged = true;
    }
  }
}

export function mainLocalRepairRelease(args = process.argv.slice(2)): void {
  const root = process.cwd();
  const options = parseLocalRepairReleaseArgs(args);
  const verified = verifyLocalRepairRelease({
    artifactPath: options.artifactPath,
    manifestPath: options.manifestPath,
    migrationsDirectory: options.migrationsDirectory,
    projectRef: EXPECTED_SUPABASE_PROJECT_REF,
    authenticode: readAuthenticodeEvidence(options.artifactPath),
  });

  process.stdout.write(`${JSON.stringify({ status: 'verified', ...verified }, null, 2)}\n`);
  if (options.execute) {
    executeLocalRepairDeployment({
      root,
      artifactPath: verified.artifactPath,
      artifactSha256: verified.artifactSha256,
      publicUrl: process.env.LEKTA_PUBLIC_REPAIR_RUNNER_URL
        || 'https://lektahr.netlify.app/downloads/LektaRepair.exe',
    });
  }
}

const isDirect = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirect) {
  try {
    mainLocalRepairRelease();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
