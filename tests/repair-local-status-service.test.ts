import { describe, expect, it } from 'vitest';

import { canonicalUtf8, sha256Hex, toBase64Url, type JsonValue } from '../src/repair/contract/index.ts';
import {
  recordLocalRepairStatus,
  type LocalRepairStatusInput,
} from '../src/repair/local-runner/status-service.ts';

const JOB_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-25T10:00:00.000Z');

async function deviceFixture() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  const spkiBytes = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  return {
    privateKey: pair.privateKey,
    publicKeySpki: toBase64Url(spkiBytes),
    keySha256: await sha256Hex(spkiBytes),
  };
}

async function signedStatus(
  privateKey: CryptoKey,
  overrides: Partial<Omit<LocalRepairStatusInput, 'signature'>> = {},
): Promise<LocalRepairStatusInput> {
  const unsigned = {
    version: 1 as const,
    jobId: JOB_ID,
    sequence: 1,
    event: 'processing' as const,
    occurredAt: NOW.toISOString(),
    checkpointSha256: null,
    outputSha256: null,
    reportSha256: null,
    ...overrides,
  };
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    canonicalUtf8(unsigned as unknown as JsonValue),
  ));
  expect(signature).toHaveLength(64);
  return { ...unsigned, signature: toBase64Url(signature) };
}

describe('local repair status service', () => {
  it('provjerava potpis uredjaja prije atomskog prijelaza u processing', async () => {
    const device = await deviceFixture();
    const input = await signedStatus(device.privateKey);
    let advanced: unknown = null;

    const result = await recordLocalRepairStatus(input, {
      now: () => NOW,
      loadBinding: async () => ({
        jobId: JOB_ID,
        localState: 'claimed',
        devicePublicKeySpki: device.publicKeySpki,
        deviceKeySha256: device.keySha256,
      }),
      advanceAtomic: async (event) => {
        advanced = event;
        return { localState: 'processing', sequence: 1 };
      },
    });

    expect(advanced).toEqual({
      jobId: JOB_ID,
      deviceKeySha256: device.keySha256,
      sequence: 1,
      event: 'processing',
      occurredAt: NOW.toISOString(),
      checkpointSha256: null,
      outputSha256: null,
      reportSha256: null,
      eventSha256: 'fa64b1d6404a2aa12ebca6acc0e45e5e2594af8a025b6560fc94589361dc06d0',
    });
    expect(result).toEqual({ ok: true, jobId: JOB_ID, localState: 'processing', sequence: 1 });
  });

  it('odbija izmijenjen completion payload bez atomskog prijelaza', async () => {
    const device = await deviceFixture();
    const input = await signedStatus(device.privateKey, {
      event: 'completed',
      outputSha256: 'a'.repeat(64),
      reportSha256: 'b'.repeat(64),
    });
    input.outputSha256 = 'c'.repeat(64);
    let advanceCalls = 0;

    const result = await recordLocalRepairStatus(input, {
      now: () => NOW,
      loadBinding: async () => ({
        jobId: JOB_ID,
        localState: 'processing',
        devicePublicKeySpki: device.publicKeySpki,
        deviceKeySha256: device.keySha256,
      }),
      advanceAtomic: async () => {
        advanceCalls += 1;
        return null;
      },
    });

    expect(result).toEqual({ ok: false, code: 'invalid-signature' });
    expect(advanceCalls).toBe(0);
  });

  it('za completed zahtijeva output i report hash', async () => {
    const device = await deviceFixture();
    const input = await signedStatus(device.privateKey, { event: 'completed' });
    let bindingCalls = 0;

    const result = await recordLocalRepairStatus(input, {
      now: () => NOW,
      loadBinding: async () => {
        bindingCalls += 1;
        return null;
      },
      advanceAtomic: async () => null,
    });

    expect(result).toEqual({ ok: false, code: 'invalid-request' });
    expect(bindingCalls).toBe(0);
  });

  it('odbija dogadjaj izvan vremenskog prozora prije baze', async () => {
    const device = await deviceFixture();
    const input = await signedStatus(device.privateKey, {
      occurredAt: '2026-08-25T09:49:59.000Z',
    });
    let bindingCalls = 0;

    const result = await recordLocalRepairStatus(input, {
      now: () => NOW,
      loadBinding: async () => {
        bindingCalls += 1;
        return null;
      },
      advanceAtomic: async () => null,
    });

    expect(result).toEqual({ ok: false, code: 'stale-event' });
    expect(bindingCalls).toBe(0);
  });

  it('prihvaca odgodjeni potpisani completion nakon povratka mreze', async () => {
    const device = await deviceFixture();
    const input = await signedStatus(device.privateKey, {
      event: 'completed',
      occurredAt: '2026-08-24T10:00:00.000Z',
      outputSha256: 'a'.repeat(64),
      reportSha256: 'b'.repeat(64),
    });

    const result = await recordLocalRepairStatus(input, {
      now: () => NOW,
      loadBinding: async () => ({
        jobId: JOB_ID,
        localState: 'processing',
        devicePublicKeySpki: device.publicKeySpki,
        deviceKeySha256: device.keySha256,
      }),
      advanceAtomic: async (event) => ({ localState: 'completed', sequence: event.sequence }),
    });

    expect(result).toEqual({ ok: true, jobId: JOB_ID, localState: 'completed', sequence: 1 });
  });
});
