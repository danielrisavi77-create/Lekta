import { describe, expect, it } from 'vitest';

import { handleLocalRepairStatusHttp } from '../src/repair/local-runner/status-http.ts';

const INPUT = {
  version: 1,
  jobId: '33333333-3333-4333-8333-333333333333',
  sequence: 1,
  event: 'processing',
  occurredAt: '2026-08-25T10:00:00.000Z',
  checkpointSha256: null,
  outputSha256: null,
  reportSha256: null,
  signature: 'A'.repeat(86),
};

describe('local repair status HTTP rub', () => {
  it('prosljedjuje cijeli POST payload i vraca no-store uspjeh', async () => {
    let received: unknown = null;
    const response = await handleLocalRepairStatusHttp(new Request('https://example.test/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(INPUT),
    }), {
      record: async (input) => {
        received = input;
        return { ok: true, jobId: INPUT.jobId, localState: 'processing', sequence: 1 };
      },
    });

    expect(received).toEqual(INPUT);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      ok: true,
      jobId: INPUT.jobId,
      localState: 'processing',
      sequence: 1,
    });
  });

  it('ne izvodi servis za metodu koja nije POST', async () => {
    let calls = 0;
    const response = await handleLocalRepairStatusHttp(
      new Request('https://example.test/status', { method: 'GET' }),
      {
        record: async () => {
          calls += 1;
          return { ok: false, code: 'invalid-request' };
        },
      },
    );

    expect(calls).toBe(0);
    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ error: 'method_not_allowed' });
  });

  it('ne otkriva je li pogresan potpis, kljuc ili binding', async () => {
    for (const code of ['invalid-signature', 'invalid-device-key', 'not-bound'] as const) {
      const response = await handleLocalRepairStatusHttp(new Request('https://example.test/status', {
        method: 'POST',
        body: JSON.stringify(INPUT),
      }), { record: async () => ({ ok: false, code }) });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    }
  });

  it('pretvara internu iznimku u genericki odgovor bez detalja', async () => {
    const response = await handleLocalRepairStatusHttp(new Request('https://example.test/status', {
      method: 'POST',
      body: JSON.stringify(INPUT),
    }), {
      record: async () => {
        throw new Error(`secret ${INPUT.signature}`);
      },
    });

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('{"error":"internal"}');
  });

  it('prekida chunked tijelo bez Content-Length cim prijedje 64 KiB', async () => {
    let pulls = 0;
    let cancelled = false;
    let recordCalls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(40 * 1024).fill(0x78));
        if (pulls >= 4) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request('https://example.test/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const response = await handleLocalRepairStatusHttp(request, {
      record: async () => {
        recordCalls += 1;
        return { ok: false, code: 'invalid-request' };
      },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bad_request' });
    expect(recordCalls).toBe(0);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(4);
  });
});
