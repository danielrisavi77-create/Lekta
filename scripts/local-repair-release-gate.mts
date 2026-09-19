import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

export const EXPECTED_SUPABASE_PROJECT_REF = 'zrrjttizjyfcxmcpgzml';
export const EXPECTED_REPAIR_DOCX_REMOTE_EZBR_SHA256 = '141400a3804ac8f74934fa33af3d168e213b1d3f5a57eaf267ba44f1482412a5';
export const EXPECTED_WORDREPLICA_ENGINE_VERSION = '0.1.0';
export const EXPECTED_WORDREPLICA_SOURCE_BRANCH = 'automation-dev';

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
  contractPublicKeySha256: string;
  signingCertificateThumbprint: string;
  timestampServer: string;
  engineVersion: string;
  sourceCommit: string;
  sourceBranch: string;
  sourceTreeClean: boolean;
}

export interface LocalRepairReleaseInput {
  artifactPath: string;
  manifestPath: string;
  migrationsDirectory: string;
  projectRef: string;
  authenticode: AuthenticodeEvidence;
  expectedPublisherThumbprint: string;
  expectedContractKeyId: string;
  expectedContractPublicKeySha256: string;
  contractPrivateKeyPkcs8Base64Url: string;
  reviewedSourceCommit: string;
  reviewedArtifactSha256: string;
}

export interface VerifiedLocalRepairRelease {
  projectRef: string;
  artifactPath: string;
  artifactSha256: string;
  artifactSizeBytes: number;
  contractKeyId: string;
  contractPublicKeySha256: string;
  signingCertificateThumbprint: string;
  timestampServer: string;
  engineVersion: string;
  sourceCommit: string;
  sourceBranch: string;
  sourceTreeClean: true;
  migrations: readonly string[];
  functions: readonly string[];
}

function fail(message: string): never {
  throw new Error(`Local repair release odbijen: ${message}`);
}

function decodeCanonicalBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    fail('privatni Repair Contract kljuc nije kanonski base64url.');
  }
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length === 0 || bytes.toString('base64url') !== value) {
    fail('privatni Repair Contract kljuc nije kanonski base64url.');
  }
  return bytes;
}

export function deriveContractPublicKeySha256(privateKeyPkcs8Base64Url: string): string {
  try {
    const privateKey = createPrivateKey({
      key: decodeCanonicalBase64Url(privateKeyPkcs8Base64Url),
      format: 'der',
      type: 'pkcs8',
    });
    const publicKey = createPublicKey(privateKey);
    const jwk = publicKey.export({ format: 'jwk' });
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') {
      fail('privatni Repair Contract kljuc nije P-256.');
    }
    const spki = publicKey.export({ format: 'der', type: 'spki' });
    return createHash('sha256').update(spki).digest('hex');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Local repair release odbijen:')) throw error;
    fail('privatni Repair Contract kljuc nije valjani PKCS8 P-256 kljuc.');
  }
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

function normalizeThumbprint(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : '';
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
  if (manifest.schemaVersion !== 2) fail('nepodrzan schemaVersion manifesta.');
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
  if (typeof manifest.contractPublicKeySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.contractPublicKeySha256)) {
    fail('manifest nema valjan javni Repair Contract key fingerprint.');
  }
  if (typeof manifest.signingCertificateThumbprint !== 'string'
      || !/^[A-F0-9]{40}$/.test(normalizeThumbprint(manifest.signingCertificateThumbprint))) {
    fail('manifest nema valjan signing certificate thumbprint.');
  }
  if (typeof manifest.timestampServer !== 'string' || !/^https:\/\//i.test(manifest.timestampServer)) {
    fail('timestamp server manifesta mora biti HTTPS.');
  }
  if (manifest.engineVersion !== EXPECTED_WORDREPLICA_ENGINE_VERSION) {
    fail(`engineVersion manifesta nije ${EXPECTED_WORDREPLICA_ENGINE_VERSION}.`);
  }
  if (typeof manifest.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/i.test(manifest.sourceCommit)) {
    fail('sourceCommit manifesta nije valjan puni Git SHA.');
  }
  if (manifest.sourceBranch !== EXPECTED_WORDREPLICA_SOURCE_BRANCH) {
    fail(`sourceBranch manifesta nije ${EXPECTED_WORDREPLICA_SOURCE_BRANCH}.`);
  }
  if (manifest.sourceTreeClean !== true) {
    fail('WordReplica source tree nije bio cist pri release buildu.');
  }
  return manifest as RunnerManifest;
}

export function verifyLocalRepairRelease(input: LocalRepairReleaseInput): VerifiedLocalRepairRelease {
  if (input.projectRef.trim() !== EXPECTED_SUPABASE_PROJECT_REF) {
    fail(`project-ref nije ${EXPECTED_SUPABASE_PROJECT_REF}.`);
  }
  const expectedPublisherThumbprint = normalizeThumbprint(input.expectedPublisherThumbprint);
  if (!/^[A-F0-9]{40}$/.test(expectedPublisherThumbprint)) {
    fail('nije konfiguriran valjan ocekivani publisher thumbprint.');
  }
  const expectedContractKeyId = input.expectedContractKeyId?.trim();
  if (!expectedContractKeyId || !/^[A-Za-z0-9._-]{1,80}$/.test(expectedContractKeyId)) {
    fail('nije konfiguriran valjan ocekivani Repair Contract key id.');
  }
  const expectedContractPublicKeySha256 = input.expectedContractPublicKeySha256?.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedContractPublicKeySha256)) {
    fail('nije konfiguriran valjan ocekivani javni Repair Contract key fingerprint.');
  }
  const reviewedSourceCommit = input.reviewedSourceCommit?.trim().toLowerCase();
  if (!reviewedSourceCommit || !/^[a-f0-9]{40}$/.test(reviewedSourceCommit)) {
    fail('nije konfiguriran valjan pregledani WordReplica source commit.');
  }
  const reviewedArtifactSha256 = input.reviewedArtifactSha256?.trim().toLowerCase();
  if (!reviewedArtifactSha256 || !/^[a-f0-9]{64}$/.test(reviewedArtifactSha256)) {
    fail('nije konfiguriran valjan pregledani runner artefakt SHA-256.');
  }
  if (!existsSync(input.artifactPath) || !statSync(input.artifactPath).isFile()) {
    fail('runner artefakt ne postoji.');
  }
  if (!existsSync(input.manifestPath) || !statSync(input.manifestPath).isFile()) {
    fail('runner manifest ne postoji.');
  }

  const manifest = loadManifest(input.manifestPath);
  const derivedContractPublicKeySha256 = deriveContractPublicKeySha256(
    input.contractPrivateKeyPkcs8Base64Url,
  );
  if (
    manifest.contractPublicKeySha256 !== expectedContractPublicKeySha256
    || derivedContractPublicKeySha256 !== expectedContractPublicKeySha256
  ) {
    fail('privatni i javni Repair Contract kljuc ne odgovaraju manifestu i ocekivanom otisku.');
  }
  if (manifest.fileName !== basename(input.artifactPath)) {
    fail('manifest pokazuje na drugi runner artefakt.');
  }

  const artifact = readFileSync(input.artifactPath);
  const artifactSha256 = createHash('sha256').update(artifact).digest('hex');
  if (artifactSha256 !== reviewedArtifactSha256) {
    fail('SHA-256 runnera ne odgovara pregledanom artefaktu.');
  }
  if (artifact.byteLength !== manifest.sizeBytes) fail('velicina runnera ne odgovara manifestu.');
  if (artifactSha256 !== manifest.sha256.toLowerCase()) fail('SHA-256 runnera ne odgovara manifestu.');

  if (input.authenticode.status !== 'Valid') fail('Authenticode status nije Valid.');
  const manifestThumbprint = normalizeThumbprint(manifest.signingCertificateThumbprint);
  const signerThumbprint = normalizeThumbprint(input.authenticode.signerThumbprint);
  if (!signerThumbprint || signerThumbprint !== manifestThumbprint) {
    fail('Authenticode potpisnik ne odgovara manifestu.');
  }
  if (signerThumbprint !== expectedPublisherThumbprint) {
    fail('Authenticode potpisnik ne odgovara ocekivanom publisher thumbprintu.');
  }
  if (manifest.contractKeyId !== expectedContractKeyId) {
    fail('Repair Contract key id manifesta ne odgovara ocekivanoj vrijednosti.');
  }
  if (manifest.sourceCommit.toLowerCase() !== reviewedSourceCommit) {
    fail('WordReplica source commit nije pregledani i odobreni commit.');
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
    contractPublicKeySha256: derivedContractPublicKeySha256,
    signingCertificateThumbprint: manifestThumbprint,
    timestampServer: manifest.timestampServer,
    engineVersion: manifest.engineVersion,
    sourceCommit: manifest.sourceCommit.toLowerCase(),
    sourceBranch: manifest.sourceBranch,
    sourceTreeClean: true,
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
    ['internal', 'stage-local-repair-secrets', 'guard-disabled', 'REPAIR_LOCAL_DISABLED'],
    [
      'internal',
      'stage-local-repair-secrets',
      'disabled-config',
      'REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL',
      'REPAIR_CONTRACT_KEY_ID',
      'REPAIR_LOCAL_ENABLED',
      'REPAIR_LOCAL_DISABLED',
    ],
    ['internal', 'deploy-local-repair-migrations'],
    ...REQUIRED_FUNCTIONS.map((name) => [
      'supabase', 'functions', 'deploy', name, '--project-ref', EXPECTED_SUPABASE_PROJECT_REF,
    ]),
    ['netlify', 'deploy', '--prod', '--dir', 'dist', '--no-build'],
    [
      'internal',
      'stage-local-repair-secrets',
      'enabled-guarded',
      'REPAIR_LOCAL_ENABLED',
      'REPAIR_LOCAL_DISABLED',
    ],
    ['internal', 'stage-local-repair-secrets', 'activate', 'REPAIR_LOCAL_DISABLED'],
  ];
}
