import { createHash } from 'node:crypto';
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

interface ManifestFixture {
  schemaVersion: number;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  contractKeyId: string;
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
    schemaVersion: 1,
    fileName: 'LektaRepair.exe',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.byteLength,
    contractKeyId: EXPECTED_CONTRACT_KEY_ID,
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

  it('gradi deterministican redoslijed migracije pa triju potrebnih funkcija', () => {
    expect(buildLocalRepairDeploymentPlan().slice(-5)).toEqual([
      ['internal', 'deploy-local-repair-migrations'],
      ['supabase', 'functions', 'deploy', 'repair-local-claim', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
      ['supabase', 'functions', 'deploy', 'repair-local-status', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
      ['supabase', 'functions', 'deploy', 'repair-docx', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
      ['netlify', 'deploy', '--prod', '--dir', 'dist', '--no-build'],
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
