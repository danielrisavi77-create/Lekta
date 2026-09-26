import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildLocalRepairDeploymentPlan } from '../scripts/local-repair-release-gate';
import {
  assertNetlifyReleaseSecrets,
  buildRunnerDeploymentEnvironment,
  stageVerifiedRunnerArtifact,
} from '../scripts/run-local-repair-release';

describe('objava potpisanog WordReplica runnera kroz Lekta release', () => {
  it('za build iz manifesta generira samo kanonski HTTPS URL i prikovani hash', () => {
    expect(buildRunnerDeploymentEnvironment({
      publicUrl: 'https://lektahr.netlify.app/downloads/LektaRepair.exe',
      sha256: 'a'.repeat(64),
    })).toEqual({
      VITE_LEKTA_LOCAL_REPAIR_RUNNER_URL: 'https://lektahr.netlify.app/downloads/LektaRepair.exe',
      VITE_LEKTA_LOCAL_REPAIR_RUNNER_SHA256: 'a'.repeat(64),
    });
    expect(() => buildRunnerDeploymentEnvironment({
      publicUrl: 'http://lektahr.netlify.app/downloads/LektaRepair.exe',
      sha256: 'a'.repeat(64),
    })).toThrow(/HTTPS/i);
    expect(() => buildRunnerDeploymentEnvironment({
      publicUrl: 'https://example.test/other.exe',
      sha256: 'a'.repeat(64),
    })).toThrow(/LektaRepair\.exe/);
  });

  it('kopira samo verificirani artefakt u dist i ponovno potvrduje hash', () => {
    const root = mkdtempSync(join(tmpdir(), 'lekta-runner-publish-'));
    const artifact = join(root, 'LektaRepair.exe');
    const bytes = Buffer.from('MZ-signed-fixture');
    writeFileSync(artifact, bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    const staged = stageVerifiedRunnerArtifact({
      artifactPath: artifact,
      distDirectory: join(root, 'dist'),
      sha256,
    });

    expect(staged).toBe(join(root, 'dist', 'downloads', 'LektaRepair.exe'));
    expect(readFileSync(staged)).toEqual(bytes);
    expect(() => stageVerifiedRunnerArtifact({
      artifactPath: artifact,
      distDirectory: join(root, 'wrong'),
      sha256: '0'.repeat(64),
    })).toThrow(/SHA-256/i);
  });

  it('za produkcijsku objavu zahtijeva Netlify token i site id te deploy radi zadnji', () => {
    expect(() => assertNetlifyReleaseSecrets({})).toThrow(/NETLIFY_AUTH_TOKEN/);
    expect(() => assertNetlifyReleaseSecrets({ NETLIFY_AUTH_TOKEN: 'token' })).toThrow(/NETLIFY_SITE_ID/);
    expect(buildLocalRepairDeploymentPlan().at(-1)).toEqual([
      'netlify', 'deploy', '--prod', '--dir', 'dist', '--no-build',
    ]);
  });
});
