import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildLocalRepairDeploymentPlan } from '../scripts/local-repair-release-gate';
import {
  assertNetlifyReleaseSecrets,
  buildRunnerDeploymentEnvironment,
  stageVerifiedRunnerArtifact,
} from '../scripts/run-local-repair-release';
import { removeTrackedTempDirs, trackedTempDir } from './helpers/temp-dirs';

describe('objava potpisanog WordReplica runnera kroz Lekta release', () => {
  // Stavka G: svaka mkdtemp mapa ovog testa se brise, i nakon pada tvrdnje.
  afterEach(removeTrackedTempDirs);

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
    const root = trackedTempDir('lekta-runner-publish-');
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

  it('za produkcijsku objavu zahtijeva Netlify token i site id te aktivira tek zadnja', () => {
    expect(() => assertNetlifyReleaseSecrets({})).toThrow(/NETLIFY_AUTH_TOKEN/);
    expect(() => assertNetlifyReleaseSecrets({ NETLIFY_AUTH_TOKEN: 'token' })).toThrow(/NETLIFY_SITE_ID/);
    expect(buildLocalRepairDeploymentPlan().at(-1)).toEqual([
      'internal', 'stage-local-repair-secrets', 'activate', 'REPAIR_LOCAL_DISABLED',
    ]);
  });
});
