import { describe, expect, it } from 'vitest';
import { claimLocalRepairJob } from '../src/repair/local-runner/claim-service.ts';
import { sha256Hex, toBase64Url } from '../src/repair/contract/hash.ts';

const JOB_ID = '33333333-3333-4333-8333-333333333333';

describe('local repair claim service', () => {
  it('odbija nevaljan P-256 uredjajski kljuc prije atomskog claima', async () => {
    let claimCalls = 0;
    let signedUrlCalls = 0;

    const result = await claimLocalRepairJob({
      jobId: JOB_ID,
      claimToken: 'A'.repeat(43),
      // Kanonski base64url od 91 nula-bajta ima pravu duljinu, ali nije valjani P-256 SPKI.
      devicePublicKeySpki: 'A'.repeat(122),
    }, {
      claimAtomic: async () => {
        claimCalls += 1;
        return null;
      },
      signRepairObject: async () => {
        signedUrlCalls += 1;
        return 'https://storage.invalid/signed';
      },
    });

    expect(result).toEqual({ ok: false, code: 'invalid-device-key' });
    expect(claimCalls).toBe(0);
    expect(signedUrlCalls).toBe(0);
  });

  it('veze hash tokena i kljuca pa izdaje samo dva kratkotrajna repair URL-a', async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    ) as CryptoKeyPair;
    const spkiBytes = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
    const devicePublicKeySpki = toBase64Url(spkiBytes);
    const tokenBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const claimToken = toBase64Url(tokenBytes);
    const userId = '11111111-1111-4111-8111-111111111111';
    const originalPath = `${userId}/${JOB_ID}/original.docx`;
    const resultPath = `${userId}/${JOB_ID}/fixed.docx`;
    const contract = { contractVersion: 1, jobId: JOB_ID };
    let atomicInput: unknown = null;
    const signed: Array<[string, number]> = [];

    const result = await claimLocalRepairJob({ jobId: JOB_ID, claimToken, devicePublicKeySpki }, {
      claimAtomic: async (input) => {
        atomicInput = input;
        return {
          jobId: JOB_ID,
          userId,
          localState: 'claimed',
          repairContract: contract,
          originalPath,
          resultPath,
        };
      },
      signRepairObject: async (path, expiresInSeconds) => {
        signed.push([path, expiresInSeconds]);
        return `https://storage.local/${path}?ttl=${expiresInSeconds}`;
      },
    });

    expect(atomicInput).toEqual({
      jobId: JOB_ID,
      claimTokenSha256: await sha256Hex(tokenBytes),
      devicePublicKeySpki,
      deviceKeySha256: await sha256Hex(spkiBytes),
    });
    expect(signed).toEqual([
      [originalPath, 300],
      [resultPath, 300],
    ]);
    expect(result).toEqual({
      ok: true,
      jobId: JOB_ID,
      contract,
      sourceDownloadUrl: `https://storage.local/${originalPath}?ttl=300`,
      targetDownloadUrl: `https://storage.local/${resultPath}?ttl=300`,
      expiresInSeconds: 300,
    });
  });

  it('nakon pada signed URL-a istom uredjaju izdaje svjeze URL-ove pri ponovljenom claimu', async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    ) as CryptoKeyPair;
    const devicePublicKeySpki = toBase64Url(new Uint8Array(
      await crypto.subtle.exportKey('spki', keyPair.publicKey),
    ));
    const claimToken = toBase64Url(new Uint8Array(32).fill(9));
    const userId = '11111111-1111-4111-8111-111111111111';
    const originalPath = `${userId}/${JOB_ID}/original.docx`;
    const resultPath = `${userId}/${JOB_ID}/fixed.docx`;
    let claimCalls = 0;
    let signingAttempt = 0;

    const dependencies = {
      claimAtomic: async () => {
        claimCalls += 1;
        return {
          jobId: JOB_ID,
          userId,
          localState: 'claimed' as const,
          repairContract: { contractVersion: 1, jobId: JOB_ID },
          originalPath,
          resultPath,
        };
      },
      signRepairObject: async (path: string) => {
        signingAttempt += 1;
        if (signingAttempt === 2) throw new Error('temporary signed URL failure');
        return `https://storage.local/fresh-${signingAttempt}/${path}`;
      },
    };
    const input = { jobId: JOB_ID, claimToken, devicePublicKeySpki };

    await expect(claimLocalRepairJob(input, dependencies)).rejects.toThrow(
      'temporary signed URL failure',
    );
    const retry = await claimLocalRepairJob(input, dependencies);

    expect(claimCalls).toBe(2);
    expect(retry).toEqual({
      ok: true,
      jobId: JOB_ID,
      contract: { contractVersion: 1, jobId: JOB_ID },
      sourceDownloadUrl: `https://storage.local/fresh-3/${originalPath}`,
      targetDownloadUrl: `https://storage.local/fresh-4/${resultPath}`,
      expiresInSeconds: 300,
    });
  });

  it('ne potpisuje storage putanju koja ne pripada claimanom korisniku i poslu', async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    ) as CryptoKeyPair;
    const devicePublicKeySpki = toBase64Url(new Uint8Array(
      await crypto.subtle.exportKey('spki', keyPair.publicKey),
    ));
    const claimToken = toBase64Url(new Uint8Array(32).fill(7));
    let signedUrlCalls = 0;

    const result = await claimLocalRepairJob({ jobId: JOB_ID, claimToken, devicePublicKeySpki }, {
      claimAtomic: async () => ({
        jobId: JOB_ID,
        userId: '11111111-1111-4111-8111-111111111111',
        localState: 'claimed',
        repairContract: { contractVersion: 1, jobId: JOB_ID },
        originalPath: `attacker/${JOB_ID}/original.docx`,
        resultPath: `11111111-1111-4111-8111-111111111111/${JOB_ID}/fixed.docx`,
      }),
      signRepairObject: async () => {
        signedUrlCalls += 1;
        return 'https://storage.invalid/should-not-exist';
      },
    });

    expect(result).toEqual({ ok: false, code: 'invalid-claim-record' });
    expect(signedUrlCalls).toBe(0);
  });
});
