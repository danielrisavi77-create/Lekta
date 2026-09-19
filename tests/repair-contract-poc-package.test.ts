import { describe, expect, it, vi } from 'vitest';

import { CONTRACT_FIXER_IDS, toBase64Url } from '../src/repair/contract';
import {
  WORDREPLICA_0_1_0_FIXER_IDS,
  WORDREPLICA_0_1_0_FIXER_REGISTRY_FINGERPRINT,
  buildRepairContractPocPackageV1,
} from '../scripts/repair-contract-poc-package';

const SOURCE_BYTES = new TextEncoder().encode('PK-poc-source');
const TARGET_BYTES = new TextEncoder().encode('PK-poc-target');

async function signingKey(): Promise<CryptoKey> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  return pair.privateKey;
}

function input(privateKey: CryptoKey) {
  return {
    jobId: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    sourceBytes: SOURCE_BYTES,
    sourceFileName: 'Seminar.docx',
    targetBytes: TARGET_BYTES,
    targetFileName: 'Seminar-popravljeno.docx',
    createdAt: new Date('2026-08-16T10:00:00.000Z'),
    expiresAt: new Date('2026-08-16T11:00:00.000Z'),
    requests: [{ fixerId: 'font-fixer', ruleId: 'body-font', params: { fontName: 'Times New Roman', fontSizePt: 12 } }],
    confirmations: [],
    signer: { privateKey, keyId: 'poc-test-key' },
  };
}

describe('WordReplica 0.1.0 POC package builder', () => {
  it('izvozi portable allowlistu iz autoritativnog ugovornog registra', () => {
    expect(WORDREPLICA_0_1_0_FIXER_IDS).toEqual(CONTRACT_FIXER_IDS);
    expect(WORDREPLICA_0_1_0_FIXER_IDS).not.toContain('footer-page-fixer');
    expect(WORDREPLICA_0_1_0_FIXER_REGISTRY_FINGERPRINT).toBe('89791f7f');
  });

  it('gradi potpisani paket s izvornim i vec generiranim target bajtovima bez curenja privatnog kljuca', async () => {
    const privateKey = await signingKey();
    const privateKeyPkcs8 = toBase64Url(new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey)));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const repairPackage = await buildRepairContractPocPackageV1(input(privateKey));
      const serialized = JSON.stringify(repairPackage);

      expect(repairPackage.sourceBytes).toEqual(SOURCE_BYTES);
      expect(repairPackage.targetBytes).toEqual(TARGET_BYTES);
      expect(repairPackage.contract.targetFileName).toBe('Seminar-popravljeno.docx');
      expect(repairPackage).not.toHaveProperty('privateKey');
      expect(repairPackage).not.toHaveProperty('signer');
      expect(serialized).not.toContain(privateKeyPkcs8);
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  it('odbija contract fixer koji WordReplica 0.1.0 ne podrzava', async () => {
    const privateKey = await signingKey();

    await expect(buildRepairContractPocPackageV1({
      ...input(privateKey),
      requests: [{ fixerId: 'footer-page-fixer', ruleId: 'footer-page', params: {} }],
    })).rejects.toThrow(/WordReplica 0\.1\.0|unsupported|ne podrzava/i);
  });
});
