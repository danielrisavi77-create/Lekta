import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EXPECTED_SUPABASE_PROJECT_REF,
  buildLocalRepairDeploymentPlan,
  verifyRemoteRepairDocxBaseline,
  verifyLocalRepairRelease,
} from '../scripts/local-repair-release-gate';

const EXPECTED_PUBLISHER_THUMBPRINT = 'AA'.repeat(20);
const EXPECTED_CONTRACT_KEY_ID = 'lekta-prod-2026-01';
const REVIEWED_WORDREPLICA_COMMIT = '1'.repeat(40);
const REVIEWED_ARTIFACT_SHA256 = 'd45671f221c3c68442aab595bba79d80dcc175e04821751310ea9ecc4b54cc7d';

function createContractKeyFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privateKeyPkcs8Base64Url = privateKey
    .export({ format: 'der', type: 'pkcs8' })
    .toString('base64url');
  const publicSpki = publicKey.export({ format: 'der', type: 'spki' });
  return {
    privateKeyPkcs8Base64Url,
    publicKeySha256: createHash('sha256').update(publicSpki).digest('hex'),
  };
}

const CONTRACT_KEY = createContractKeyFixture();

interface ManifestFixture {
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

function fixture(
  root: string,
  manifestOverrides: Partial<ManifestFixture> = {},
  bytes = Buffer.from('signed-runner-fixture'),
) {
  const artifactPath = join(root, 'LektaRepair.exe');
  writeFileSync(artifactPath, bytes);

  const manifestPath = join(root, 'lekta-repair-runner-manifest.json');
  writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 2,
    fileName: 'LektaRepair.exe',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.byteLength,
    contractKeyId: EXPECTED_CONTRACT_KEY_ID,
    contractPublicKeySha256: CONTRACT_KEY.publicKeySha256,
    signingCertificateThumbprint: EXPECTED_PUBLISHER_THUMBPRINT,
    timestampServer: 'https://timestamp.example.test',
    engineVersion: '0.1.0',
    sourceCommit: REVIEWED_WORDREPLICA_COMMIT,
    sourceBranch: 'automation-dev',
    sourceTreeClean: true,
    ...manifestOverrides,
  }));

  const migrationsDirectory = join(root, 'migrations');
  mkdirSync(migrationsDirectory);
  for (const name of [
    '0104_repair_local_claims.sql',
    '0105_repair_local_lifecycle.sql',
    '0106_repair_local_claim_recovery.sql',
  ]) {
    writeFileSync(join(migrationsDirectory, name), '-- fixture');
  }
  return { artifactPath, manifestPath, migrationsDirectory };
}

function validReleaseInput(paths: ReturnType<typeof fixture>) {
  return {
    ...paths,
    projectRef: EXPECTED_SUPABASE_PROJECT_REF,
    authenticode: {
      status: 'Valid',
      signerThumbprint: EXPECTED_PUBLISHER_THUMBPRINT.toLowerCase(),
    },
    expectedPublisherThumbprint: EXPECTED_PUBLISHER_THUMBPRINT,
    expectedContractKeyId: EXPECTED_CONTRACT_KEY_ID,
    expectedContractPublicKeySha256: CONTRACT_KEY.publicKeySha256,
    contractPrivateKeyPkcs8Base64Url: CONTRACT_KEY.privateKeyPkcs8Base64Url,
    reviewedSourceCommit: REVIEWED_WORDREPLICA_COMMIT,
    reviewedArtifactSha256: REVIEWED_ARTIFACT_SHA256,
  };
}

describe('Lekta local-repair release gate', () => {
  it('prihvaca samo uskladjen potpisani WordReplica artefakt i sve potrebne migracije', () => {
    const root = mkdtempSync(join(tmpdir(), 'lekta-release-gate-valid-'));
    const paths = fixture(root);

    expect(verifyLocalRepairRelease(validReleaseInput(paths))).toMatchObject({
      projectRef: EXPECTED_SUPABASE_PROJECT_REF,
      artifactSha256: REVIEWED_ARTIFACT_SHA256,
      contractKeyId: EXPECTED_CONTRACT_KEY_ID,
      engineVersion: '0.1.0',
      sourceCommit: REVIEWED_WORDREPLICA_COMMIT,
      sourceBranch: 'automation-dev',
    });
  });

  it('odbija manifest v1 i v2 manifest bez javnog fingerprinta', () => {
    const root = mkdtempSync(join(tmpdir(), 'lekta-release-manifest-v2-'));
    expect(() => verifyLocalRepairRelease(validReleaseInput(fixture(root, {
      schemaVersion: 1,
    })))).toThrow(/schemaVersion/i);

    const missing = fixture(mkdtempSync(join(tmpdir(), 'lekta-release-manifest-fingerprint-')), {
      contractPublicKeySha256: undefined as never,
    });
    expect(() => verifyLocalRepairRelease(validReleaseInput(missing))).toThrow(/javni.*otisak|fingerprint/i);
  });

  it('odbija manifest fingerprint koji ne odgovara privatnom kljucu i neovisnom otisku', () => {
    const other = createContractKeyFixture();
    const paths = fixture(mkdtempSync(join(tmpdir(), 'lekta-release-wrong-manifest-key-')), {
      contractPublicKeySha256: other.publicKeySha256,
    });
    expect(() => verifyLocalRepairRelease(validReleaseInput(paths))).toThrow(/privatni.*javni.*kljuc|otisak/i);
  });

  it('odbija fingerprint manifesta pisan velikim slovima', () => {
    const paths = fixture(mkdtempSync(join(tmpdir(), 'lekta-release-uppercase-manifest-key-')), {
      contractPublicKeySha256: CONTRACT_KEY.publicKeySha256.toUpperCase(),
    });
    expect(() => verifyLocalRepairRelease(validReleaseInput(paths))).toThrow(/javni.*otisak|fingerprint/i);
  });

  it('odbija privatni kljuc koji ne odgovara manifestu i neovisnom otisku', () => {
    const other = createContractKeyFixture();
    const paths = fixture(mkdtempSync(join(tmpdir(), 'lekta-release-wrong-private-')));
    expect(() => verifyLocalRepairRelease({
      ...validReleaseInput(paths),
      contractPrivateKeyPkcs8Base64Url: other.privateKeyPkcs8Base64Url,
    })).toThrow(/privatni.*javni.*kljuc|otisak/i);
  });

  it.each(['abc=', 'not base64url!', ''])('odbija nekanonski PKCS8 ulaz %j', (value) => {
    const paths = fixture(mkdtempSync(join(tmpdir(), 'lekta-release-bad-pkcs8-')));
    expect(() => verifyLocalRepairRelease({
      ...validReleaseInput(paths),
      contractPrivateKeyPkcs8Base64Url: value,
    })).toThrow(/PKCS8|privatni/i);
  });

  it('odbija valjani PKCS8 kljuc koji nije P-256', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const paths = fixture(mkdtempSync(join(tmpdir(), 'lekta-release-rsa-private-')));
    expect(() => verifyLocalRepairRelease({
      ...validReleaseInput(paths),
      contractPrivateKeyPkcs8Base64Url: privateKey
        .export({ format: 'der', type: 'pkcs8' })
        .toString('base64url'),
    })).toThrow(/P-256/i);
  });

  it('vraca samo javni identitet, nikad privatni kljuc', () => {
    const paths = fixture(mkdtempSync(join(tmpdir(), 'lekta-release-public-output-')));
    const verified = verifyLocalRepairRelease(validReleaseInput(paths));
    expect(verified.contractPublicKeySha256).toBe(CONTRACT_KEY.publicKeySha256);
    expect(JSON.stringify(verified)).not.toContain(CONTRACT_KEY.privateKeyPkcs8Base64Url);
  });

  it('odbija drugi valjani Authenticode potpisnik i samouskladjeni krivotvoreni manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'lekta-release-gate-forged-signer-'));
    const forgedThumbprint = 'BB'.repeat(20);
    const paths = fixture(root, { signingCertificateThumbprint: forgedThumbprint });

    expect(() => verifyLocalRepairRelease({
      ...validReleaseInput(paths),
      authenticode: { status: 'Valid', signerThumbprint: forgedThumbprint },
    })).toThrow(/ocekivanom publisher thumbprintu/i);
  });

  it('odbija stari trusted-signed artefakt sa samouskladjenim manifestom koji tvrdi pregledani source commit', () => {
    const root = mkdtempSync(join(tmpdir(), 'lekta-release-gate-old-artifact-'));
    const paths = fixture(root, {}, Buffer.from('old-trusted-signed-runner'));

    expect(() => verifyLocalRepairRelease(validReleaseInput(paths))).toThrow(/pregledanom artefaktu/i);
  });

  it.each([
    ['WrongContractKey', { manifest: { contractKeyId: 'other-valid-key' } }],
    ['WrongEngineVersion', { manifest: { engineVersion: '0.1.1' } }],
    ['WrongSourceBranch', { manifest: { sourceBranch: 'main' } }],
    ['UnreviewedSourceCommit', { manifest: { sourceCommit: '2'.repeat(40) } }],
    ['DirtySourceTree', { manifest: { sourceTreeClean: false } }],
    ['MissingExpectedPublisher', { input: { expectedPublisherThumbprint: '' } }],
    ['MissingExpectedContractKey', { input: { expectedContractKeyId: '' } }],
    ['MissingReviewedCommit', { input: { reviewedSourceCommit: '' } }],
    ['MissingReviewedArtifactHash', { input: { reviewedArtifactSha256: '' } }],
  ])('trust/source gate fail-closed odbija %s', (_label, mutation) => {
    const root = mkdtempSync(join(tmpdir(), `lekta-release-gate-${_label}-`));
    const paths = fixture(root, 'manifest' in mutation ? mutation.manifest : {});

    expect(() => verifyLocalRepairRelease({
      ...validReleaseInput(paths),
      ...('input' in mutation ? mutation.input : {}),
    })).toThrow();
  });

  it.each([
    ['WrongProject', { projectRef: 'wrong-project' }],
    ['HashMismatch', { rewriteArtifact: true }],
    ['Unsigned', { authenticode: { status: 'NotSigned', signerThumbprint: '' } }],
    ['WrongSigner', { authenticode: { status: 'Valid', signerThumbprint: 'DEADBEEF' } }],
    ['MissingMigration', { removeMigration: true }],
  ])('fail-closed odbija %s', (_label, mutation) => {
    const root = mkdtempSync(join(tmpdir(), `lekta-release-gate-${_label}-`));
    const paths = fixture(root);
    if ('rewriteArtifact' in mutation) writeFileSync(paths.artifactPath, 'changed');
    if ('removeMigration' in mutation) {
      const incomplete = join(root, 'incomplete-migrations');
      mkdirSync(incomplete);
      writeFileSync(join(incomplete, '0104_repair_local_claims.sql'), '-- only one');
      paths.migrationsDirectory = incomplete;
    }

    expect(() => verifyLocalRepairRelease({
      ...validReleaseInput(paths),
      projectRef: 'projectRef' in mutation
        ? String(mutation.projectRef)
        : EXPECTED_SUPABASE_PROJECT_REF,
      authenticode: 'authenticode' in mutation
        ? mutation.authenticode
        : { status: 'Valid', signerThumbprint: EXPECTED_PUBLISHER_THUMBPRINT },
    })).toThrow();
  });

  it('zavrsava Netlify objavom pod guardom pa tek onda aktivacijom', () => {
    expect(buildLocalRepairDeploymentPlan().slice(-3)).toEqual([
      ['netlify', 'deploy', '--prod', '--dir', 'dist', '--no-build'],
      ['internal', 'stage-local-repair-secrets', 'enabled-guarded',
        'REPAIR_LOCAL_ENABLED', 'REPAIR_LOCAL_DISABLED'],
      ['internal', 'stage-local-repair-secrets', 'activate', 'REPAIR_LOCAL_DISABLED'],
    ]);
  });

  it('prihvaca dokazani produkcijski repair-docx v30, a nepoznati bundle odbija fail-closed', () => {
    const productionV30Hash = '141400a3804ac8f74934fa33af3d168e213b1d3f5a57eaf267ba44f1482412a5';
    expect(verifyRemoteRepairDocxBaseline({
      slug: 'repair-docx',
      status: 'ACTIVE',
      ezbrSha256: productionV30Hash,
    })).toEqual({
      slug: 'repair-docx',
      status: 'ACTIVE',
      ezbrSha256: productionV30Hash,
    });

    expect(() => verifyRemoteRepairDocxBaseline({
      slug: 'repair-docx',
      status: 'ACTIVE',
      ezbrSha256: 'f'.repeat(64),
    })).toThrow(/produkcijski repair-docx bundle/i);
  });
});
