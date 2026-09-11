import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('local-repair release stvarni CLI entrypoint', () => {
  it('fail-closed vraca non-zero kad runner artefakt ne postoji', () => {
    const root = join(import.meta.dirname, '..');
    const missing = join(mkdtempSync(join(tmpdir(), 'lekta-release-entry-')), 'missing.exe');
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const privateKeyPkcs8Base64Url = privateKey
      .export({ format: 'der', type: 'pkcs8' })
      .toString('base64url');
    const contractPublicKeySha256 = createHash('sha256')
      .update(publicKey.export({ format: 'der', type: 'spki' })).digest('hex');
    const completed = spawnSync(process.execPath, [
      join(root, 'scripts', 'run-local-repair-release.mts'),
      '--artifact', missing,
    ], {
      cwd: root,
      env: {
        ...process.env,
        LEKTA_REPAIR_EXPECTED_PUBLISHER_THUMBPRINT: 'AA'.repeat(20),
        LEKTA_REPAIR_EXPECTED_CONTRACT_KEY_ID: 'lekta-prod-test',
        LEKTA_REPAIR_EXPECTED_CONTRACT_PUBLIC_KEY_SHA256: contractPublicKeySha256,
        LEKTA_REPAIR_CONTRACT_PRIVATE_KEY_PKCS8_B64URL: privateKeyPkcs8Base64Url,
        LEKTA_REPAIR_REVIEWED_WORDREPLICA_COMMIT: '1'.repeat(40),
        LEKTA_REPAIR_REVIEWED_ARTIFACT_SHA256: 'a'.repeat(64),
      },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30_000,
    });

    expect(completed.status).not.toBe(0);
    expect(`${completed.stdout}\n${completed.stderr}`).toMatch(/runner artefakt ne postoji/i);
    expect(completed.stdout).not.toContain('generate-citation-tools');
  });
});
