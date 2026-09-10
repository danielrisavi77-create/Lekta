import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

export const EXPECTED_SUPABASE_PROJECT_REF = 'zrrjttizjyfcxmcpgzml';
export const EXPECTED_REPAIR_DOCX_REMOTE_EZBR_SHA256 = '141400a3804ac8f74934fa33af3d168e213b1d3f5a57eaf267ba44f1482412a5';

const REQUIRED_MIGRATIONS = [
  '0104_repair_local_claims.sql',
  '0105_repair_local_lifecycle.sql',
  '0106_repair_local_claim_recovery.sql',
] as const;

const REQUIRED_FUNCTIONS = [
  'repair-local-claim',
  'repair-local-status',
  'repair-docx',
] as const;

export interface AuthenticodeEvidence {
  status: string;
  signerThumbprint: string;
}
export interface RemoteRepairDocxEvidence {
  slug: string;
  status: string;
  ezbrSha256: string;
}

interface RunnerManifest {
  schemaVersion: number;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  contractKeyId: string;
  signingCertificateThumbprint: string;
  timestampServer: string;
}

export interface LocalRepairReleaseInput {
  artifactPath: string;
  manifestPath: string;
  migrationsDirectory: string;
  projectRef: string;
  authenticode: AuthenticodeEvidence;
}

export interface VerifiedLocalRepairRelease {
  projectRef: string;
  artifactPath: string;
  artifactSha256: string;
  artifactSizeBytes: number;
  contractKeyId: string;
  signingCertificateThumbprint: string;
  timestampServer: string;
  migrations: readonly string[];
  functions: readonly string[];
}

function fail(message: string): never {
  throw new Error(`Local repair release odbijen: ${message}`);
}
export function verifyRemoteRepairDocxBaseline(
  input: RemoteRepairDocxEvidence,
): RemoteRepairDocxEvidence {
  const ezbrSha256 = input.ezbrSha256.trim().toLowerCase();
  if (
    input.slug !== 'repair-docx'
    || input.status !== 'ACTIVE'
    || !/^[a-f0-9]{64}$/.test(ezbrSha256)
    || ezbrSha256 !== EXPECTED_REPAIR_DOCX_REMOTE_EZBR_SHA256
  ) {
    fail('produkcijski repair-docx bundle ne odgovara odobrenom baselineu.');
  }
  return {
    slug: 'repair-docx',
    status: 'ACTIVE',
    ezbrSha256,
  };
}

function normalizeThumbprint(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

function loadManifest(path: string): RunnerManifest {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`manifest nije citljiv JSON (${error instanceof Error ? error.message : 'unknown error'}).`);
  }
  if (!value || typeof value !== 'object') fail('manifest nije objekt.');
  const manifest = value as Partial<RunnerManifest>;
  if (manifest.schemaVersion !== 1) fail('nepodrzan schemaVersion manifesta.');
  if (typeof manifest.fileName !== 'string' || manifest.fileName !== basename(manifest.fileName)) {
    fail('fileName manifesta nije sigurno ime datoteke.');
  }
  if (typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
    fail('sha256 manifesta nije valjan.');
  }
  if (!Number.isSafeInteger(manifest.sizeBytes) || Number(manifest.sizeBytes) <= 0) {
    fail('sizeBytes manifesta nije valjan.');
  }
  if (typeof manifest.contractKeyId !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(manifest.contractKeyId)) {
    fail('contractKeyId manifesta nije valjan.');
  }
  if (typeof manifest.signingCertificateThumbprint !== 'string'
      || normalizeThumbprint(manifest.signingCertificateThumbprint).length === 0) {
    fail('manifest nema signing certificate thumbprint.');
  }
  if (typeof manifest.timestampServer !== 'string' || !/^https:\/\//i.test(manifest.timestampServer)) {
    fail('timestamp server manifesta mora biti HTTPS.');
  }
  return manifest as RunnerManifest;
}

export function verifyLocalRepairRelease(input: LocalRepairReleaseInput): VerifiedLocalRepairRelease {
  if (input.projectRef.trim() !== EXPECTED_SUPABASE_PROJECT_REF) {
    fail(`project-ref nije ${EXPECTED_SUPABASE_PROJECT_REF}.`);
  }
  if (!existsSync(input.artifactPath) || !statSync(input.artifactPath).isFile()) {
    fail('runner artefakt ne postoji.');
  }
  if (!existsSync(input.manifestPath) || !statSync(input.manifestPath).isFile()) {
    fail('runner manifest ne postoji.');
  }

  const manifest = loadManifest(input.manifestPath);
  if (manifest.fileName !== basename(input.artifactPath)) {
    fail('manifest pokazuje na drugi runner artefakt.');
  }

  const artifact = readFileSync(input.artifactPath);
  const artifactSha256 = createHash('sha256').update(artifact).digest('hex');
  if (artifact.byteLength !== manifest.sizeBytes) fail('velicina runnera ne odgovara manifestu.');
  if (artifactSha256 !== manifest.sha256.toLowerCase()) fail('SHA-256 runnera ne odgovara manifestu.');

  if (input.authenticode.status !== 'Valid') fail('Authenticode status nije Valid.');
  const manifestThumbprint = normalizeThumbprint(manifest.signingCertificateThumbprint);
  const signerThumbprint = normalizeThumbprint(input.authenticode.signerThumbprint);
  if (!signerThumbprint || signerThumbprint !== manifestThumbprint) {
    fail('Authenticode potpisnik ne odgovara manifestu.');
  }

  if (!existsSync(input.migrationsDirectory) || !statSync(input.migrationsDirectory).isDirectory()) {
    fail('direktorij migracija ne postoji.');
  }
  const migrations = new Set(readdirSync(input.migrationsDirectory));
  for (const required of REQUIRED_MIGRATIONS) {
    if (!migrations.has(required)) fail(`nedostaje migracija ${required}.`);
  }

  return {
    projectRef: EXPECTED_SUPABASE_PROJECT_REF,
    artifactPath: resolve(input.artifactPath),
    artifactSha256,
    artifactSizeBytes: artifact.byteLength,
    contractKeyId: manifest.contractKeyId,
    signingCertificateThumbprint: manifestThumbprint,
    timestampServer: manifest.timestampServer,
    migrations: REQUIRED_MIGRATIONS,
    functions: REQUIRED_FUNCTIONS,
  };
}

export function buildLocalRepairDeploymentPlan(): string[][] {
  return [
    ['supabase', 'link', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF, '--yes'],
    ['npm', 'run', 'check:repair-integration'],
    ['netlify', 'build'],
    ['node', 'scripts/verify-deploy-dist.mjs'],
    ['internal', 'deploy-local-repair-migrations'],
    ...REQUIRED_FUNCTIONS.map((name) => [
      'supabase', 'functions', 'deploy', name, '--project-ref', EXPECTED_SUPABASE_PROJECT_REF,
    ]),
    ['netlify', 'deploy', '--prod', '--dir', 'dist', '--no-build'],
  ];
}
