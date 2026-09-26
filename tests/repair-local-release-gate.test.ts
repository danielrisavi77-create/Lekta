import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EXPECTED_SUPABASE_PROJECT_REF,
  buildLocalRepairDeploymentPlan,
  verifyLocalRepairRelease,
} from '../scripts/local-repair-release-gate';

function fixture(root: string) {
  const artifactPath = join(root, 'LektaRepair.exe');
  const bytes = Buffer.from('signed-runner-fixture');
  writeFileSync(artifactPath, bytes);

  const manifestPath = join(root, 'lekta-repair-runner-manifest.json');
  writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    fileName: 'LektaRepair.exe',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.byteLength,
    contractKeyId: 'lekta-prod-2026-01',
    signingCertificateThumbprint: 'AA11BB22',
    timestampServer: 'https://timestamp.example.test',
  }));

  const migrationsDirectory = join(root, 'migrations');
  mkdirSync(migrationsDirectory);
  for (const name of [
    '0096_repair_local_claims.sql',
    '0097_repair_local_lifecycle.sql',
    '0098_repair_local_claim_recovery.sql',
  ]) {
    writeFileSync(join(migrationsDirectory, name), '-- fixture');
  }
  return { artifactPath, manifestPath, migrationsDirectory };
}

describe('Lekta local-repair release gate', () => {
  it('prihvaca samo uskladjen potpisani WordReplica artefakt i sve potrebne migracije', () => {
    const root = mkdtempSync(join(tmpdir(), 'lekta-release-gate-valid-'));
    const paths = fixture(root);

    expect(verifyLocalRepairRelease({
      ...paths,
      projectRef: EXPECTED_SUPABASE_PROJECT_REF,
      authenticode: { status: 'Valid', signerThumbprint: 'aa11bb22' },
    })).toMatchObject({
      projectRef: EXPECTED_SUPABASE_PROJECT_REF,
      artifactSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      contractKeyId: 'lekta-prod-2026-01',
    });
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
      writeFileSync(join(incomplete, '0096_repair_local_claims.sql'), '-- only one');
      paths.migrationsDirectory = incomplete;
    }

    expect(() => verifyLocalRepairRelease({
      ...paths,
      projectRef: 'projectRef' in mutation
        ? String(mutation.projectRef)
        : EXPECTED_SUPABASE_PROJECT_REF,
      authenticode: 'authenticode' in mutation
        ? mutation.authenticode
        : { status: 'Valid', signerThumbprint: 'AA11BB22' },
    })).toThrow();
  });

  it('gradi deterministican redoslijed migracije pa triju potrebnih funkcija', () => {
    expect(buildLocalRepairDeploymentPlan().slice(-5)).toEqual([
      ['supabase', 'db', 'push', '--linked', '--yes'],
      ['supabase', 'functions', 'deploy', 'repair-local-claim', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
      ['supabase', 'functions', 'deploy', 'repair-local-status', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
      ['supabase', 'functions', 'deploy', 'repair-docx', '--project-ref', EXPECTED_SUPABASE_PROJECT_REF],
      ['netlify', 'deploy', '--prod', '--dir', 'dist', '--no-build'],
    ]);
  });
});
