import { describe, expect, it } from 'vitest';

import {
  canonicalUtf8,
  sha256Hex,
  toBase64Url,
  type JsonValue,
} from '../src/repair/contract/index.ts';
import { claimLocalRepairJob } from '../src/repair/local-runner/claim-service.ts';
import { issueLocalRepairJob } from '../src/repair/local-runner/issue-service.ts';
import {
  recordLocalRepairStatus,
  type LocalRepairState,
  type LocalRepairStatusEvent,
  type LocalRepairStatusInput,
} from '../src/repair/local-runner/status-service.ts';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SLOT_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-25T10:00:00.000Z');
const SOURCE_BYTES = new TextEncoder().encode('PK-e2e-original-docx');
const TARGET_BYTES = new TextEncoder().encode('PK-e2e-server-fixed-docx');

async function signedStatus(
  privateKey: CryptoKey,
  sequence: number,
  event: LocalRepairStatusEvent,
  hashes: {
    checkpointSha256?: string | null;
    outputSha256?: string | null;
    reportSha256?: string | null;
  } = {},
): Promise<LocalRepairStatusInput> {
  const unsigned = {
    version: 1 as const,
    jobId: JOB_ID,
    sequence,
    event,
    occurredAt: NOW.toISOString(),
    checkpointSha256: hashes.checkpointSha256 ?? null,
    outputSha256: hashes.outputSha256 ?? null,
    reportSha256: hashes.reportSha256 ?? null,
  };
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    canonicalUtf8(unsigned as unknown as JsonValue),
  ));
  return { ...unsigned, signature: toBase64Url(signature) };
}

describe('Lekta local runner lifecycle E2E', () => {
  it('izdaje jedan ticket, atomski claima jedan uredjaj i prihvaca samo njegov potpisani lifecycle', async () => {
    const contractSigner = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
    ) as CryptoKeyPair;
    const device = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
    ) as CryptoKeyPair;
    const deviceSpkiBytes = new Uint8Array(await crypto.subtle.exportKey('spki', device.publicKey));
    const devicePublicKeySpki = toBase64Url(deviceSpkiBytes);
    const deviceKeySha256 = await sha256Hex(deviceSpkiBytes);
    const tokenBytes = Uint8Array.from({ length: 32 }, (_value, index) => index + 1);

    const issued = await issueLocalRepairJob({
      jobId: JOB_ID,
      userId: USER_ID,
      slotId: SLOT_ID,
      sourceBytes: SOURCE_BYTES,
      sourceFileName: 'Seminar.docx',
      targetBytes: TARGET_BYTES,
      targetFileName: 'Seminar-popravljeno.docx',
      createdAt: new Date('2026-08-25T09:55:00.000Z'),
      expiresAt: new Date('2026-08-25T10:05:00.000Z'),
      requests: [{
        fixerId: 'font-fixer',
        ruleId: 'body-font',
        params: { fontName: 'Times New Roman', fontSizePt: 12 },
      }],
      confirmations: [],
      signer: { privateKey: contractSigner.privateKey, keyId: 'lekta-e2e-key' },
    }, { randomBytes: () => new Uint8Array(tokenBytes) });

    let localState: LocalRepairState | 'claimable' = 'claimable';
    let boundDeviceSpki: string | null = null;
    let boundDeviceHash: string | null = null;
    let sequence = 0;
    const lifecycle: LocalRepairStatusEvent[] = [];

    const claimDependencies = {
      claimAtomic: async (input: {
        jobId: string;
        claimTokenSha256: string;
        devicePublicKeySpki: string;
        deviceKeySha256: string;
      }) => {
        if (localState !== 'claimable'
          || input.jobId !== issued.record.jobId
          || input.claimTokenSha256 !== issued.record.claimTokenSha256) return null;
        localState = 'claimed';
        boundDeviceSpki = input.devicePublicKeySpki;
        boundDeviceHash = input.deviceKeySha256;
        return {
          jobId: JOB_ID,
          userId: USER_ID,
          localState: 'claimed' as const,
          repairContract: issued.record.repairContract,
          originalPath: `${USER_ID}/${JOB_ID}/original.docx`,
          resultPath: `${USER_ID}/${JOB_ID}/fixed.docx`,
        };
      },
      signRepairObject: async (path: string, expires: number) =>
        `https://storage.example/${path}?expires=${expires}`,
    };

    const claimed = await claimLocalRepairJob({
      jobId: issued.launch.jobId,
      claimToken: issued.launch.claimToken,
      devicePublicKeySpki,
    }, claimDependencies);
    expect(claimed).toMatchObject({ ok: true, jobId: JOB_ID, expiresInSeconds: 300 });
    expect(boundDeviceHash).toBe(deviceKeySha256);

    const replay = await claimLocalRepairJob({
      jobId: issued.launch.jobId,
      claimToken: issued.launch.claimToken,
      devicePublicKeySpki,
    }, claimDependencies);
    expect(replay).toEqual({ ok: false, code: 'not-claimable' });

    const statusDependencies = {
      now: () => NOW,
      loadBinding: async () => boundDeviceSpki && boundDeviceHash ? ({
        jobId: JOB_ID,
        localState: localState as LocalRepairState,
        devicePublicKeySpki: boundDeviceSpki,
        deviceKeySha256: boundDeviceHash,
      }) : null,
      advanceAtomic: async (event: {
        deviceKeySha256: string;
        sequence: number;
        event: LocalRepairStatusEvent;
      }) => {
        if (event.deviceKeySha256 !== boundDeviceHash || event.sequence <= sequence) return null;
        const allowed = (event.event === 'processing' && localState === 'claimed')
          || (event.event === 'heartbeat' && localState === 'processing')
          || (event.event === 'completed' && localState === 'processing');
        if (!allowed) return null;
        sequence = event.sequence;
        localState = event.event === 'completed' ? 'completed' : 'processing';
        lifecycle.push(event.event);
        return { localState: localState as LocalRepairState, sequence };
      },
    };

    expect(await recordLocalRepairStatus(
      await signedStatus(device.privateKey, 1, 'processing'), statusDependencies,
    )).toEqual({ ok: true, jobId: JOB_ID, localState: 'processing', sequence: 1 });
    expect(await recordLocalRepairStatus(
      await signedStatus(device.privateKey, 2, 'heartbeat'), statusDependencies,
    )).toEqual({ ok: true, jobId: JOB_ID, localState: 'processing', sequence: 2 });
    expect(await recordLocalRepairStatus(
      await signedStatus(device.privateKey, 3, 'completed', {
        outputSha256: 'a'.repeat(64),
        reportSha256: 'b'.repeat(64),
      }), statusDependencies,
    )).toEqual({ ok: true, jobId: JOB_ID, localState: 'completed', sequence: 3 });

    expect(lifecycle).toEqual(['processing', 'heartbeat', 'completed']);
    expect(JSON.stringify(lifecycle)).not.toContain(new TextDecoder().decode(SOURCE_BYTES));
  });
});
