import { describe, expect, it } from 'vitest';

import {
  importRepairContractPrivateKey,
  importRepairContractPublicKey,
  fromBase64Url,
  signRepairContractV1,
  toBase64Url,
  verifyRepairContractV1,
  type RepairContractV1,
} from '../src/repair/contract';
import { validUnsignedContract } from './helpers/repair-contract';

async function ephemeralKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
}

async function signedContract() {
  const pair = await ephemeralKeyPair();
  const signed = await signRepairContractV1(validUnsignedContract(), pair.privateKey, 'test-key-2026-01');
  return { pair, signed };
}

describe('Repair Contract ES256-P1363 signature', () => {
  it('potpisuje kanonski unsigned payload i verificira 64-bajtni P1363 potpis', async () => {
    const { pair, signed } = await signedContract();

    expect(signed.contractSignature).toMatchObject({ algorithm: 'ES256-P1363', keyId: 'test-key-2026-01' });
    expect(fromBase64Url(signed.contractSignature.value)).toHaveLength(64);
    expect(await verifyRepairContractV1(signed, pair.publicKey)).toEqual({ ok: true });
  });

  it.each([
    ['sourceSize', (contract: RepairContractV1) => { contract.sourceSize += 1; }],
    ['request params', (contract: RepairContractV1) => { contract.requests[0].params.fontSizePt = 11; }],
    ['expiresAt', (contract: RepairContractV1) => { contract.expiresAt = '2026-08-16T10:30:00.000Z'; }],
    ['allowedExceptions', (contract: RepairContractV1) => {
      contract.allowedExceptions.push({
        requestId: 'req-0001',
        scope: 'visible-text',
        confirmationSha256: 'a'.repeat(64),
        confirmedAt: '2026-08-16T09:59:00.000Z',
      });
    }],
    ['outputPolicy', (contract: RepairContractV1) => { contract.outputPolicy.suggestedFileName = 'Drugi.docx'; }],
    ['verificationPolicy', (contract: RepairContractV1) => { contract.verificationPolicy.requiredGates.reverse(); }],
  ] as const)('odbija promijenjeni %s', async (_label, mutate) => {
    const { pair, signed } = await signedContract();
    const tampered = structuredClone(signed);
    mutate(tampered);

    expect(await verifyRepairContractV1(tampered, pair.publicKey)).toEqual({ ok: false, code: 'signature-mismatch' });
  });

  it('redoslijed objektnih kljuceva ne utjece na potpis', async () => {
    const { pair, signed } = await signedContract();
    const reordered = Object.fromEntries(Object.entries(signed).reverse()) as unknown as RepairContractV1;
    reordered.requests[0].params = Object.fromEntries(Object.entries(reordered.requests[0].params).reverse());

    expect(await verifyRepairContractV1(reordered, pair.publicKey)).toEqual({ ok: true });
  });

  it('redoslijed zahtjeva je dio potpisanog ugovora', async () => {
    const pair = await ephemeralKeyPair();
    const payload = validUnsignedContract({
      requests: [
        ...validUnsignedContract().requests,
        { requestId: 'req-0002', fixerId: 'font-fixer', ruleId: 'heading-font', params: { fontName: 'Arial', fontSizePt: 11 } },
      ],
    });
    const signed = await signRepairContractV1(payload, pair.privateKey, 'test-key-2026-01');
    signed.requests.reverse();

    expect(await verifyRepairContractV1(signed, pair.publicKey)).toEqual({ ok: false, code: 'signature-mismatch' });
  });

  it('razlikuje nepodrzan algoritam, keyId i encoding od krivog potpisa', async () => {
    const { pair, signed } = await signedContract();
    const unsupported = structuredClone(signed) as any;
    unsupported.contractSignature.algorithm = 'ES384';
    const badKeyId = structuredClone(signed);
    badKeyId.contractSignature.keyId = 'x'.repeat(81);
    const badEncoding = structuredClone(signed);
    badEncoding.contractSignature.value = 'abc';

    expect(await verifyRepairContractV1(unsupported, pair.publicKey)).toEqual({ ok: false, code: 'unsupported-algorithm' });
    expect(await verifyRepairContractV1(badKeyId, pair.publicKey)).toEqual({ ok: false, code: 'invalid-key-id' });
    expect(await verifyRepairContractV1(badEncoding, pair.publicKey)).toEqual({ ok: false, code: 'invalid-signature-encoding' });
  });

  it('odbija neispravan keyId pri potpisivanju', async () => {
    const pair = await ephemeralKeyPair();

    await expect(signRepairContractV1(validUnsignedContract(), pair.privateKey, 'bad key')).rejects.toThrow(/keyId/i);
  });

  it('uvozi PKCS8 privatni i SPKI javni P-256 kljuc iz base64url zapisa', async () => {
    const pair = await ephemeralKeyPair();
    const pkcs8 = toBase64Url(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)));
    const spki = toBase64Url(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)));
    const privateKey = await importRepairContractPrivateKey(pkcs8);
    const publicKey = await importRepairContractPublicKey(spki);
    const signed = await signRepairContractV1(validUnsignedContract(), privateKey, 'imported-key');

    expect(await verifyRepairContractV1(signed, publicKey)).toEqual({ ok: true });
  });
});
